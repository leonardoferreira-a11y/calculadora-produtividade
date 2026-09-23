import { NextResponse } from 'next/server';

import { query, queryUma } from '@/lib/db';
import { NIVEIS, STATUS, ehStatus } from '@/lib/auth-constants';
import { exigirAdminApi } from '@/lib/auth-api';
import {
  encerrarSessoesDoUsuario,
  normalizarEmail,
  registrarAuditoria,
} from '@/lib/auth';
import { gerarHashSenha, validarForcaSenha } from '@/lib/passwords';

export const dynamic = 'force-dynamic';

const NIVEIS_VALIDOS = Object.values(NIVEIS);
const STATUS_VALIDOS = Object.values(STATUS);

/** Impede que o sistema fique sem nenhum administrador ativo. */
async function totalAdminsAtivos() {
  const linha = await queryUma(
    `SELECT count(*)::int AS total FROM usuarios
      WHERE UPPER(nivel_permissao) = $1 AND LOWER(TRIM(status)) = LOWER($2)`,
    [NIVEIS.ADMIN, STATUS.ATIVO]
  );
  return linha?.total ?? 0;
}

export async function PUT(request, context) {
  const { usuario: admin, recusa } = await exigirAdminApi();
  if (recusa) return recusa;

  try {
    // No Next.js 16 `params` é uma Promise.
    const { id } = await context.params;
    const idNumero = Number.parseInt(id, 10);
    if (!Number.isInteger(idNumero) || idNumero <= 0) {
      return NextResponse.json({ message: 'Usuário inválido.' }, { status: 400 });
    }

    const { nome, email, senha, empresa, nivel_permissao, status } = await request.json();

    const alvo = await queryUma(
      'SELECT id, nome, email, nivel_permissao, status FROM usuarios WHERE id = $1',
      [idNumero]
    );
    if (!alvo) {
      return NextResponse.json({ message: 'Usuário não encontrado.' }, { status: 404 });
    }

    const emailNormalizado = normalizarEmail(email);
    if (!nome || !emailNormalizado) {
      return NextResponse.json({ message: 'Nome e e-mail são obrigatórios.' }, { status: 400 });
    }

    const nivel = NIVEIS_VALIDOS.includes(nivel_permissao)
      ? nivel_permissao
      : alvo.nivel_permissao;
    const situacao = STATUS_VALIDOS.includes(status) ? status : alvo.status;

    // Nada de se rebaixar ou se desativar sozinho e ficar sem acesso.
    if (alvo.id === admin.id) {
      if (nivel !== NIVEIS.ADMIN) {
        return NextResponse.json(
          { message: 'Você não pode remover seu próprio nível de administrador.' },
          { status: 400 }
        );
      }
      if (!ehStatus(situacao, STATUS.ATIVO)) {
        return NextResponse.json(
          { message: 'Você não pode alterar o status da sua própria conta.' },
          { status: 400 }
        );
      }
    }

    const eraAdminAtivo =
      String(alvo.nivel_permissao).toUpperCase() === NIVEIS.ADMIN &&
      ehStatus(alvo.status, STATUS.ATIVO);
    const seraAdminAtivo = nivel === NIVEIS.ADMIN && ehStatus(situacao, STATUS.ATIVO);
    if (eraAdminAtivo && !seraAdminAtivo && (await totalAdminsAtivos()) <= 1) {
      return NextResponse.json(
        { message: 'Este é o último administrador ativo — promova outro antes.' },
        { status: 400 }
      );
    }

    const emailEmUso = await queryUma(
      'SELECT id FROM usuarios WHERE LOWER(TRIM(email)) = $1 AND id <> $2',
      [emailNormalizado, idNumero]
    );
    if (emailEmUso) {
      return NextResponse.json(
        { message: 'Já existe outro usuário com este e-mail.' },
        { status: 409 }
      );
    }

    const trocouSenha = typeof senha === 'string' && senha.trim() !== '';
    if (trocouSenha) {
      const problemas = validarForcaSenha(senha);
      if (problemas.length > 0) {
        return NextResponse.json({ message: problemas.join(' ') }, { status: 400 });
      }

      // `senha = NULL` apaga qualquer resquício do texto puro antigo.
      await query(
        `UPDATE usuarios
            SET nome = $1, email = $2, empresa = $3, nivel_permissao = $4, status = $5,
                senha_hash = $6, senha = NULL, atualizado_em = now()
          WHERE id = $7`,
        [nome, emailNormalizado, empresa || null, nivel, situacao, await gerarHashSenha(senha), idNumero]
      );
    } else {
      await query(
        `UPDATE usuarios
            SET nome = $1, email = $2, empresa = $3, nivel_permissao = $4, status = $5,
                atualizado_em = now()
          WHERE id = $6`,
        [nome, emailNormalizado, empresa || null, nivel, situacao, idNumero]
      );
    }

    // Troca de senha ou conta desativada derruba as sessões abertas.
    if (trocouSenha || !ehStatus(situacao, STATUS.ATIVO)) {
      await encerrarSessoesDoUsuario(idNumero);
    }

    const mudancas = [];
    if (!ehStatus(alvo.status, situacao)) mudancas.push(`status ${alvo.status} → ${situacao}`);
    if (String(alvo.nivel_permissao).toUpperCase() !== nivel) {
      mudancas.push(`nível ${alvo.nivel_permissao} → ${nivel}`);
    }
    if (trocouSenha) mudancas.push('senha redefinida');

    await registrarAuditoria({
      autorId: admin.id,
      alvoId: idNumero,
      acao: 'USUARIO_ATUALIZADO',
      detalhe: `${alvo.email}: ${mudancas.length > 0 ? mudancas.join('; ') : 'dados cadastrais'}`,
    });

    return NextResponse.json({ message: 'Atualizado com sucesso' }, { status: 200 });
  } catch (error) {
    console.error('Erro na API de atualizar usuário:', error);
    return NextResponse.json({ message: 'Erro ao atualizar' }, { status: 500 });
  }
}
