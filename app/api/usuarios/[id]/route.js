import pool from '@/lib/db';
import { NextResponse } from 'next/server';

// Note que mudamos 'params' para 'context' aqui
export async function PUT(request, context) {
  try {
    // A REGRA NOVA AQUI: Precisamos aguardar (await) os params
    const params = await context.params;
    const id = params.id;

    const body = await request.json();
    const { nome, email, senha, empresa, nivel_permissao, status } = body;

    console.log("Recebendo atualização para o ID:", id);

    const idNumero = parseInt(id);

    if (senha && senha.trim() !== "") {
      await pool.query(
        'UPDATE usuarios SET nome=$1, email=$2, senha=$3, empresa=$4, nivel_permissao=$5, status=$6 WHERE id=$7',
        [nome, email, senha, empresa, nivel_permissao, status, idNumero]
      );
    } else {
      await pool.query(
        'UPDATE usuarios SET nome=$1, email=$2, empresa=$3, nivel_permissao=$4, status=$5 WHERE id=$6',
        [nome, email, empresa, nivel_permissao, status, idNumero]
      );
    }
    
    return NextResponse.json({ message: "Atualizado com sucesso" }, { status: 200 });
  } catch (error) {
    console.error("ERRO NO BANCO:", error);
    return NextResponse.json({ message: "Erro ao atualizar" }, { status: 500 });
  }
}