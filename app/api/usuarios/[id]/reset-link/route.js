import { NextResponse } from 'next/server';

import { queryUma } from '@/lib/db';
import { ROTAS } from '@/lib/auth-constants';
import { exigirAdminApi } from '@/lib/auth-api';
import { criarTokenRedefinicao, registrarAuditoria } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Gera um link de redefinição de senha para um usuário.
 *
 * Enquanto não houver SMTP, é assim que o fluxo de "esqueci minha senha" se
 * fecha: o usuário pede pela tela pública, o Admin gera o link aqui e entrega
 * por um canal próprio. O token vale 1 hora e só pode ser usado uma vez.
 */
export async function POST(request, context) {
  const { usuario: admin, recusa } = await exigirAdminApi();
  if (recusa) return recusa;

  try {
    const { id } = await context.params;
    const idNumero = Number.parseInt(id, 10);
    if (!Number.isInteger(idNumero) || idNumero <= 0) {
      return NextResponse.json({ message: 'Usuário inválido.' }, { status: 400 });
    }

    const alvo = await queryUma('SELECT id, email FROM usuarios WHERE id = $1', [idNumero]);
    if (!alvo) {
      return NextResponse.json({ message: 'Usuário não encontrado.' }, { status: 404 });
    }

    const token = await criarTokenRedefinicao(alvo.email);
    if (!token) {
      return NextResponse.json(
        { message: 'Não é possível gerar link para um acesso inativo.' },
        { status: 400 }
      );
    }

    await registrarAuditoria({
      autorId: admin.id,
      alvoId: idNumero,
      acao: 'LINK_REDEFINICAO_GERADO',
      detalhe: `Admin gerou link de redefinição para ${alvo.email}`,
    });

    const base = new URL(request.url).origin;
    return NextResponse.json(
      {
        link: `${base}${ROTAS.redefinirSenha}?token=${token}`,
        expiraEmMinutos: 60,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao gerar link de redefinição:', error);
    return NextResponse.json({ message: 'Erro ao gerar link.' }, { status: 500 });
  }
}
