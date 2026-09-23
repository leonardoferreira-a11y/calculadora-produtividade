'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { query, queryUma } from '@/lib/db';
import {
  AVISOS,
  NIVEL_PADRAO_SOLICITACAO,
  ROTAS,
  STATUS,
} from '@/lib/auth-constants';
import {
  aplicarRedefinicao,
  autenticar,
  criarSessao,
  criarTokenRedefinicao,
  encerrarSessao,
  normalizarEmail,
  registrarAuditoria,
} from '@/lib/auth';
import { gerarHashSenha, validarForcaSenha } from '@/lib/passwords';

const texto = (formData, campo) => String(formData.get(campo) ?? '').trim();

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Só aceita destinos internos, para não transformar `?proximo=` em open
 * redirect.
 */
function destinoSeguro(valor) {
  const bruto = String(valor ?? '');
  if (!bruto.startsWith('/') || bruto.startsWith('//')) return ROTAS.painel;
  return bruto;
}

// ---------------------------------------------------------------------------
// Freio de tentativas (melhor esforço)
//
// Contador em memória do processo: não substitui um rate limit de borda, mas
// já barra ataques triviais de força bruta em uma única instância.
// ---------------------------------------------------------------------------
const JANELA_MS = 10 * 60 * 1000;
const MAX_TENTATIVAS = 8;
const tentativas = new Map();

const chaveTentativa = (email, ip) => `${email}|${ip ?? 'sem-ip'}`;

function bloqueadoPorTentativas(chave) {
  const registro = tentativas.get(chave);
  if (!registro) return false;
  if (Date.now() - registro.desde > JANELA_MS) {
    tentativas.delete(chave);
    return false;
  }
  return registro.contagem >= MAX_TENTATIVAS;
}

function registrarFalha(chave) {
  const registro = tentativas.get(chave);
  if (!registro || Date.now() - registro.desde > JANELA_MS) {
    tentativas.set(chave, { contagem: 1, desde: Date.now() });
    return;
  }
  registro.contagem += 1;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function entrar(_estadoAnterior, formData) {
  const email = normalizarEmail(texto(formData, 'email'));
  const senha = String(formData.get('senha') ?? '');
  const proximo = destinoSeguro(formData.get('proximo'));

  if (!email || !senha) {
    return { erro: 'Informe e-mail e senha.', email };
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
  const chave = chaveTentativa(email, ip);

  if (bloqueadoPorTentativas(chave)) {
    return {
      erro: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.',
      email,
    };
  }

  const resultado = await autenticar(email, senha);

  if (!resultado.ok) {
    registrarFalha(chave);
    if (resultado.motivo === 'PENDENTE') {
      return {
        erro:
          'Seu cadastro existe, mas ainda está PENDENTE de aprovação por um administrador.',
        email,
      };
    }
    if (resultado.motivo === 'BLOQUEADO') {
      return {
        erro: 'Este acesso está inativo. Procure um administrador do CalculArco.',
        email,
      };
    }
    return { erro: 'E-mail ou senha inválidos.', email };
  }

  tentativas.delete(chave);
  await criarSessao(resultado.usuario);
  redirect(proximo);
}

export async function sair() {
  await encerrarSessao();
  redirect(`${ROTAS.login}?aviso=${AVISOS.SAIU}`);
}

// ---------------------------------------------------------------------------
// Solicitação de acesso (cadastro) — nasce Pendente
// ---------------------------------------------------------------------------

export async function solicitarAcesso(_estadoAnterior, formData) {
  const nome = texto(formData, 'nome');
  const email = normalizarEmail(texto(formData, 'email'));
  const empresa = texto(formData, 'empresa').toUpperCase();
  const senha = String(formData.get('senha') ?? '');
  const confirmacao = String(formData.get('confirmacao') ?? '');
  const valores = { nome, email, empresa };

  if (nome.length < 3) return { erro: 'Informe seu nome completo.', ...valores };
  if (!EMAIL_VALIDO.test(email)) return { erro: 'Informe um e-mail válido.', ...valores };
  if (senha !== confirmacao) return { erro: 'As senhas não conferem.', ...valores };

  const problemas = validarForcaSenha(senha);
  if (problemas.length > 0) return { erro: problemas.join(' '), ...valores };

  const jaExiste = await queryUma(
    'SELECT id FROM usuarios WHERE LOWER(TRIM(email)) = $1',
    [email]
  );
  if (jaExiste) {
    // Resposta genérica de propósito: não confirmamos quais e-mails já usam o sistema.
    return {
      erro:
        'Não foi possível concluir a solicitação para este e-mail. Se você já tem cadastro, use "Esqueci minha senha".',
      ...valores,
    };
  }

  const senhaHash = await gerarHashSenha(senha);
  const novo = await queryUma(
    `INSERT INTO usuarios (nome, email, senha_hash, empresa, nivel_permissao, status)
          VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [nome, email, senhaHash, empresa || null, NIVEL_PADRAO_SOLICITACAO, STATUS.PENDENTE]
  );

  await registrarAuditoria({
    autorId: null,
    alvoId: novo.id,
    acao: 'SOLICITACAO_ACESSO',
    detalhe: `Autocadastro de ${email} (status ${STATUS.PENDENTE})`,
  });

  redirect(`${ROTAS.login}?aviso=${AVISOS.CADASTRO_ENVIADO}`);
}

// ---------------------------------------------------------------------------
// Redefinição de senha
// ---------------------------------------------------------------------------

/** Etapa 1: o usuário pede o link. */
export async function pedirRedefinicao(_estadoAnterior, formData) {
  const email = normalizarEmail(texto(formData, 'email'));
  if (!EMAIL_VALIDO.test(email)) return { erro: 'Informe um e-mail válido.', email };

  const token = await criarTokenRedefinicao(email);

  if (token) {
    // Ainda não há SMTP configurado. Em desenvolvimento o link vai para o
    // console; em produção o Admin entrega o link pela tela de Acessos.
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[CalculArco] Link de redefinição para ${email}: ${ROTAS.redefinirSenha}?token=${token}`
      );
    }
    await registrarAuditoria({
      acao: 'PEDIDO_REDEFINICAO',
      detalhe: `Solicitado para ${email}`,
    });
  }

  // Mensagem idêntica exista ou não o e-mail.
  return {
    ok:
      'Pedido registrado. Se este e-mail estiver cadastrado, um administrador liberará o link de redefinição.',
  };
}

/** Etapa 2: o usuário chega com `?token=` e escolhe a nova senha. */
export async function redefinirSenha(_estadoAnterior, formData) {
  const token = texto(formData, 'token');
  const senha = String(formData.get('senha') ?? '');
  const confirmacao = String(formData.get('confirmacao') ?? '');

  if (!token) return { erro: 'Link de redefinição inválido ou incompleto.' };
  if (senha !== confirmacao) return { erro: 'As senhas não conferem.' };

  const problemas = validarForcaSenha(senha);
  if (problemas.length > 0) return { erro: problemas.join(' ') };

  const aplicado = await aplicarRedefinicao(token, await gerarHashSenha(senha));
  if (!aplicado) {
    return { erro: 'Link expirado ou já utilizado. Faça um novo pedido de redefinição.' };
  }

  await query(
    "INSERT INTO usuario_auditoria (acao, detalhe) VALUES ('SENHA_REDEFINIDA', $1)",
    ['Senha alterada via link de redefinição']
  );

  redirect(`${ROTAS.login}?aviso=${AVISOS.SENHA_ALTERADA}`);
}
