import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { email, senha } = await request.json();

    // 1. Busca pelo e-mail
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);

    // 2. Checa se o e-mail existe
    if (result.rows.length === 0) {
      return NextResponse.json({ message: "E-mail não cadastrado." }, { status: 404 });
    }

    const usuario = result.rows[0];

    // 3. Checa se o usuário está bloqueado
    if (usuario.status === 'inativo') {
      return NextResponse.json({ message: "Usuário bloqueado. Contate o administrador." }, { status: 403 });
    }

    // 4. Checa se a senha bate
    if (usuario.senha !== senha) {
      return NextResponse.json({ message: "Senha incorreta." }, { status: 401 });
    }

    // Sucesso! Removemos a senha por segurança antes de enviar os dados pro navegador
    delete usuario.senha;
    
    return NextResponse.json({ 
      message: "Acesso liberado!", 
      usuario: usuario 
    }, { status: 200 });

  } catch (error) {
    console.error("Erro na API de Login:", error);
    return NextResponse.json({ message: "Erro interno no servidor." }, { status: 500 });
  }
}