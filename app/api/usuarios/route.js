import { NextResponse } from 'next/server';

import { query, queryUma } from '@/lib/db';
import { NIVEIS, STATUS } from '@/lib/auth-constants';
import { exigirAdminApi } from '@/lib/auth-api';
import { registrarAuditoria, normalizarEmail } from '@/lib/auth';
import { gerarHashSenha, validarForcaSenha } from '@/lib/passwords';

// Força o Next.js a nunca usar memória cache para essa rota (atualiza na hora)
export const dynamic = 'force-dynamic';

const NIVEIS_VALIDOS = Object.values(NIVEIS);
const STATUS_VALIDOS = Object.values(STATUS);

export async function GET() {
  const { recusa } = await exigirAdminApi();
  if (recusa) return recusa;

  try {
    // A senha NUNCA sai daqui — depois da migração para bcrypt ela é irrecuperável.
    // `senha_definida` diz apenas se a conta já tem senha utilizável.
    const result = await query(
      `SELECT id, nome, email, empresa, nivel_permissao, status, ultimo_login_em,
              (senha_hash IS NOT NULL OR senha IS NOT NULL) AS senha_definida
         FROM usuarios
        ORDER BY id ASC`
    );
    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error('Erro na API de buscar usuários:', error);
    return NextResponse.json({ message: 'Erro ao buscar usuários.' }, { status: 500 });
  }
}

export async function POST(request) {
  const { usuario: admin, recusa } = await exigirAdminApi();
  if (recusa) return recusa;

  try {
    const { nome, email, senha, empresa, nivel_permissao, status } = await request.json();

    const emailNormalizado = normalizarEmail(email);
    if (!nome || !emailNormalizado) {
      return NextResponse.json({ message: 'Nome e e-mail são obrigatórios.' }, { status: 400 });
    }

    const problemas = validarForcaSenha(senha);
    if (problemas.length > 0) {
      return NextResponse.json({ message: problemas.join(' ') }, { status: 400 });
    }

    const nivel = NIVEIS_VALIDOS.includes(nivel_permissao) ? nivel_permissao : NIVEIS.USER_GRAFICA;
    const situacao = STATUS_VALIDOS.includes(status) ? status : STATUS.ATIVO;

    const jaExiste = await queryUma('SELECT id FROM usuarios WHERE LOWER(TRIM(email)) = $1', [
      emailNormalizado,
    ]);
    if (jaExiste) {
      return NextResponse.json({ message: 'Já existe um usuário com este e-mail.' }, { status: 409 });
    }

    const novo = await queryUma(
      `INSERT INTO usuarios (nome, email, senha_hash, empresa, nivel_permissao, status)
            VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [nome, emailNormalizado, await gerarHashSenha(senha), empresa || null, nivel, situacao]
    );

    await registrarAuditoria({
      autorId: admin.id,
      alvoId: novo.id,
      acao: 'USUARIO_CRIADO',
      detalhe: `${emailNormalizado} criado como ${nivel} (${situacao})`,
    });

    return NextResponse.json({ message: 'Usuário criado com sucesso!' }, { status: 201 });
  } catch (error) {
    console.error('Erro na API de criar usuário:', error);
    return NextResponse.json({ message: 'Erro ao criar usuário.' }, { status: 500 });
  }
}
