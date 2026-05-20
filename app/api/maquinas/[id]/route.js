import pool from '@/lib/db';
import { NextResponse } from 'next/server';

// ATUALIZAR MÁQUINA (PUT)
export async function PUT(request, props) {
  try {
    // CORREÇÃO NEXT.JS 15: Agora precisamos usar o 'await' para ler o ID da URL
    const params = await props.params;
    const id = params.id;

    const {
      grafica,
      tipo,
      tecnologia,
      modelo,
      maq_cores,
      maquinas,
      pessoas,
      produtividade_unit,
      produtividade_total,
      metrica,
      limite_lombada,
      setup,
      frete,
      ajuste,
      configuracoes
    } = await request.json();

    const result = await pool.query(
      `UPDATE maquinas SET 
        grafica = $1, tipo = $2, tecnologia = $3, modelo = $4, maq_cores = $5, 
        maquinas = $6, pessoas = $7, produtividade_unit = $8, 
        produtividade_total = $9, metrica = $10, limite_lombada = $11, 
        setup = $12, frete = $13, ajuste = $14, configuracoes = $15
      WHERE id = $16 RETURNING *`,
      [
        grafica,
        tipo,
        tecnologia || 'Padrão',
        modelo,
        maq_cores || 0,
        maquinas || 1,
        pessoas || 1,
        produtividade_unit || 0,
        produtividade_total || 0,
        metrica || '',
        limite_lombada || 0,
        setup || '00:00',
        frete || '00:00',
        ajuste || '00:00',
        JSON.stringify(configuracoes || {}),
        id
      ]
    );

    // TRAVA DE SEGURANÇA: Se o Postgres não encontrou o ID para alterar, força um erro!
    if (result.rowCount === 0) {
      return NextResponse.json({ message: "Máquina não encontrada no banco de dados para edição." }, { status: 404 });
    }

    return NextResponse.json({ message: "Máquina atualizada com sucesso!" }, { status: 200 });
  } catch (error) {
    console.error("Erro na API de atualizar máquina:", error);
    return NextResponse.json({ message: "Erro ao atualizar máquina." }, { status: 500 });
  }
}