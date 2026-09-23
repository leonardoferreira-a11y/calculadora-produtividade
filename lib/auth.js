import 'server-only';
import crypto from 'node:crypto';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { query, queryUma } from './db';
import {
  AVISOS,
  COOKIE_SESSAO,
  NIVEIS,
  ROTAS,
  STATUS,
  ehStatus,
  podeAcessar,
} from './auth-constants';
import {
  criarTokenSessao,
  gerarTokenAleatorio,
  hashToken,
  lerTokenSessao,
} from './auth-token';
import {
  conferirSenha,
  ehHashBcrypt,
  gastarTempoDeVerificacao,
  gerarHashSenha,
} from './passwords';

/**
 * Data Access Layer de autenticação.
 *
 * Regra do projeto: nenhuma página, Server Action ou Route Handler protegido lê
 * o cookie diretamente. Todos passam por `obterSessao` / `exigirUsuario` /
 * `exigirAdmin` / `exigirAcesso`, que validam a sessão contra o banco — o
 * `proxy.js` faz apenas uma triagem otimista.
 */

const HORAS_SESSAO = Number(process.env.AUTH_SESSION_HOURS ?? 12);
const DURACAO_SESSAO_MS = HORAS_SESSAO * 60 * 60 * 1000;
const DURACAO_RESET_MS = 60 * 60 * 1000; // 1 hora

export const normalizarEmail = (email) => String(email ?? '').trim().toLowerCase();

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

async function contextoDaRequisicao() {
  const cabecalhos = await headers();
  return {
    ip:
      cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      cabecalhos.get('x-real-ip') ??
      null,
    userAgent: cabecalhos.get('user-agent')?.slice(0, 500) ?? null,
  };
}

/** Cria a sessão no banco e grava o cookie assinado. */
export async function criarSessao(usuario) {
  const sid = gerarTokenAleatorio();
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);
  const { ip, userAgent } = await contextoDaRequisicao();

  await query(
    `INSERT INTO usuario_sessoes (id_hash, usuario_id, expira_em, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(sid), usuario.id, expiraEm, ip, userAgent]
  );

  await query('UPDATE usuarios SET ultimo_login_em = now() WHERE id = $1', [
    usuario.id,
  ]);

  const token = criarTokenSessao({
    sid,
    uid: usuario.id,
    nivel: usuario.nivel_permissao,
    exp: Math.floor(expiraEm.getTime() / 1000),
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiraEm,
  });
}

/** Revoga a sessão atual (banco + cookie). */
export async function encerrarSessao() {
  const cookieStore = await cookies();
  const payload = lerTokenSessao(cookieStore.get(COOKIE_SESSAO)?.value);

  if (payload?.sid) {
    await query('DELETE FROM usuario_sessoes WHERE id_hash = $1', [
      hashToken(payload.sid),
    ]);
  }
  cookieStore.delete(COOKIE_SESSAO);
}

/** Revoga todas as sessões de um usuário (ao inativar ou trocar a senha). */
export async function encerrarSessoesDoUsuario(usuarioId) {
  await query('DELETE FROM usuario_sessoes WHERE usuario_id = $1', [usuarioId]);
}

/**
 * Verificação SEGURA da sessão: valida a assinatura do cookie e confirma no
 * banco que a sessão existe, não expirou e que o usuário continua Ativo.
 *
 * Memoizado com `cache` do React: várias chamadas na mesma renderização
 * resultam em uma única consulta.
 *
 * @returns {Promise<{id:number,nome:string,email:string,empresa:string|null,nivel_permissao:string,ehAdmin:boolean}|null>}
 */
export const obterSessao = cache(async () => {
  const cookieStore = await cookies();
  const payload = lerTokenSessao(cookieStore.get(COOKIE_SESSAO)?.value);
  if (!payload) return null;

  const linha = await queryUma(
    `SELECT u.id, u.nome, u.email, u.empresa, u.nivel_permissao, u.status
       FROM usuario_sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id_hash = $1
        AND s.expira_em > now()
        AND s.usuario_id = $2`,
    [hashToken(payload.sid), payload.uid]
  );

  if (!linha || !ehStatus(linha.status, STATUS.ATIVO)) return null;

  const nivel = String(linha.nivel_permissao ?? '').toUpperCase();

  // DTO: apenas o necessário para a UI. Nunca devolva senha/senha_hash daqui.
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    empresa: linha.empresa ?? null,
    nivel_permissao: nivel,
    ehAdmin: nivel === NIVEIS.ADMIN,
  };
});

/** Exige sessão válida; caso contrário manda para o login. */
export async function exigirUsuario() {
  const usuario = await obterSessao();
  if (!usuario) {
    redirect(`${ROTAS.login}?aviso=${AVISOS.SESSAO_EXPIRADA}`);
  }
  return usuario;
}

/** Exige nível ADMIN; usuário comum volta ao painel com aviso. */
export async function exigirAdmin() {
  const usuario = await exigirUsuario();
  if (!usuario.ehAdmin) {
    redirect(`${ROTAS.painel}?aviso=${AVISOS.ACESSO_NEGADO}`);
  }
  return usuario;
}

/** Exige sessão válida com permissão de RBAC para o caminho informado. */
export async function exigirAcesso(pathname) {
  const usuario = await exigirUsuario();
  if (!podeAcessar(pathname, usuario.nivel_permissao)) {
    redirect(`${ROTAS.painel}?aviso=${AVISOS.ACESSO_NEGADO}`);
  }
  return usuario;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/** Comparação em tempo constante para o caminho legado (senha em texto puro). */
function textoIgual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Confere as credenciais e devolve o motivo exato da recusa para uso interno.
 * A camada de UI decide o que revelar ao visitante.
 *
 * Migração transparente: contas que ainda têm a senha antiga em texto puro
 * (coluna `senha`) têm o hash bcrypt gravado no primeiro login bem-sucedido e
 * o texto puro é apagado. Ninguém perde acesso.
 *
 * @returns {Promise<{ok:true,usuario:object}|{ok:false,motivo:'CREDENCIAIS'|'PENDENTE'|'BLOQUEADO'}>}
 */
export async function autenticar(email, senha) {
  const usuario = await queryUma(
    `SELECT id, nome, email, empresa, senha, senha_hash, nivel_permissao, status
       FROM usuarios
      WHERE LOWER(TRIM(email)) = $1`,
    [normalizarEmail(email)]
  );

  if (!usuario) {
    // Gasta o mesmo tempo de um bcrypt real para não vazar quais e-mails existem.
    await gastarTempoDeVerificacao();
    return { ok: false, motivo: 'CREDENCIAIS' };
  }

  const senhaInformada = String(senha ?? '');
  let senhaOk = false;

  if (ehHashBcrypt(usuario.senha_hash)) {
    senhaOk = await conferirSenha(senhaInformada, usuario.senha_hash);
  } else if (usuario.senha && textoIgual(senhaInformada, usuario.senha)) {
    // Legado: confere em texto puro e já promove a conta para bcrypt.
    senhaOk = true;
    await query(
      'UPDATE usuarios SET senha_hash = $1, senha = NULL, atualizado_em = now() WHERE id = $2',
      [await gerarHashSenha(senhaInformada), usuario.id]
    );
  } else {
    // Sem hash e sem senha legada utilizável: gasta o tempo mesmo assim.
    await gastarTempoDeVerificacao();
  }

  if (!senhaOk) return { ok: false, motivo: 'CREDENCIAIS' };

  if (ehStatus(usuario.status, STATUS.PENDENTE)) {
    return { ok: false, motivo: 'PENDENTE' };
  }
  if (!ehStatus(usuario.status, STATUS.ATIVO)) {
    return { ok: false, motivo: 'BLOQUEADO' };
  }

  return { ok: true, usuario };
}

// ---------------------------------------------------------------------------
// Redefinição de senha
// ---------------------------------------------------------------------------

/**
 * Cria um token de redefinição válido por 1 hora. Retorna o token bruto — hoje
 * ele é entregue pela tela de Controle de Acessos (não há SMTP configurado).
 */
export async function criarTokenRedefinicao(email) {
  const usuario = await queryUma(
    'SELECT id, status FROM usuarios WHERE LOWER(TRIM(email)) = $1',
    [normalizarEmail(email)]
  );
  if (!usuario || ehStatus(usuario.status, STATUS.INATIVO)) return null;

  const token = gerarTokenAleatorio();
  await query(
    `INSERT INTO usuario_reset_senha (token_hash, usuario_id, expira_em)
     VALUES ($1, $2, $3)`,
    [hashToken(token), usuario.id, new Date(Date.now() + DURACAO_RESET_MS)]
  );
  return token;
}

/**
 * Consome um token de redefinição e troca a senha, invalidando todos os outros
 * pedidos abertos e todas as sessões do usuário.
 */
export async function aplicarRedefinicao(token, novoHash) {
  const registro = await queryUma(
    `SELECT r.id, r.usuario_id
       FROM usuario_reset_senha r
      WHERE r.token_hash = $1
        AND r.usado_em IS NULL
        AND r.expira_em > now()`,
    [hashToken(String(token ?? ''))]
  );
  if (!registro) return false;

  // 1. Grava a senha nova (e apaga qualquer resquício do texto puro antigo).
  await query(
    'UPDATE usuarios SET senha_hash = $1, senha = NULL, atualizado_em = now() WHERE id = $2',
    [novoHash, registro.usuario_id]
  );

  // 2. Invalida TODOS os pedidos de reset desse usuário, não só o consumido.
  await query(
    'UPDATE usuario_reset_senha SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL',
    [registro.usuario_id]
  );

  // 3. Derruba quem estiver logado com a senha velha.
  await encerrarSessoesDoUsuario(registro.usuario_id);

  return true;
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

export async function registrarAuditoria({ autorId, alvoId, acao, detalhe }) {
  await query(
    `INSERT INTO usuario_auditoria (autor_id, alvo_id, acao, detalhe)
     VALUES ($1, $2, $3, $4)`,
    [autorId ?? null, alvoId ?? null, acao, detalhe ?? null]
  );
}
