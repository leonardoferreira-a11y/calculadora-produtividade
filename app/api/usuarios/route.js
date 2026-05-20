import pool from '@/lib/db';
import { NextResponse } from 'next/server';

// Força o Next.js a nunca usar memória cache para essa rota (Atualiza na hora)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 👇 OLHA A MÁGICA AQUI: Adicionamos a palavra "senha" no SELECT
    const result = await pool.query('SELECT id, nome, email, senha, empresa, nivel_permissao, status FROM usuarios ORDER BY id ASC');
    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error("Erro na API de buscar usuários:", error);
    return NextResponse.json({ message: "Erro ao buscar usuários." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { nome, email, senha, empresa, nivel_permissao, status } = await request.json();
    
    await pool.query(
      'INSERT INTO usuarios (nome, email, senha, empresa, nivel_permissao, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [nome, email, senha, empresa, nivel_permissao, status || 'Ativo']
    );
    return NextResponse.json({ message: "Usuário criado com sucesso!" }, { status: 201 });
  } catch (error) {
    console.error("Erro na API de criar usuário:", error);
    return NextResponse.json({ message: "Erro ao criar usuário." }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const { nome, email, senha, empresa, nivel_permissao, status } = await request.json();
    
    // Atualiza todos os dados, incluindo a senha que veio da tela
    await pool.query(
      'UPDATE usuarios SET nome = $1, email = $2, senha = $3, empresa = $4, nivel_permissao = $5, status = $6 WHERE id = $7',
      [nome, email, senha, empresa, nivel_permissao, status, id]
    );
    
    return NextResponse.json({ message: "Usuário atualizado com sucesso!" }, { status: 200 });
  } catch (error) {
    console.error("Erro na API de atualizar usuário:", error);
    return NextResponse.json({ message: "Erro ao atualizar usuário." }, { status: 500 });
  }
}