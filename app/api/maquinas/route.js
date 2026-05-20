import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM maquinas ORDER BY id ASC');
    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error("Erro na API de buscar máquinas:", error);
    return NextResponse.json({ message: "Erro ao buscar máquinas." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const {
      grafica, tipo, tecnologia, modelo, maq_cores, maquinas, pessoas, 
      produtividade_unit, produtividade_total, metrica, 
      limite_lombada, setup, frete, ajuste, configuracoes
    } = await request.json();

    await pool.query(
      `INSERT INTO maquinas (
        grafica, tipo, tecnologia, modelo, maq_cores, maquinas, pessoas, 
        produtividade_unit, produtividade_total, metrica, 
        limite_lombada, setup, frete, ajuste, configuracoes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        grafica, tipo, tecnologia || 'Padrão', modelo, maq_cores || 0, maquinas || 1, pessoas || 1,
        produtividade_unit || 0, produtividade_total || 0, metrica || '',
        limite_lombada || 0, setup || '00:00', frete || '00:00', ajuste || '00:00',
        JSON.stringify(configuracoes || {})
      ]
    );

    return NextResponse.json({ message: "Máquina criada com sucesso!" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: "Erro ao criar máquina." }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { 
      id, grafica, dias_trabalho, horas_diarias,
      tipo, tecnologia, modelo, maq_cores, maquinas, pessoas,
      produtividade_unit, produtividade_total, metrica,
      limite_lombada, setup, frete, ajuste, configuracoes
    } = body;

    if (!id) return NextResponse.json({ message: "ID obrigatório." }, { status: 400 });

    // 🔴 1. AÇÃO EM MASSA: Atualiza todo o parque
    if (id === 'ALL' && grafica) {
      await pool.query(
        `UPDATE maquinas SET dias_trabalho = $1, horas_diarias = $2 WHERE UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
        [dias_trabalho, horas_diarias, grafica]
      );
      return NextResponse.json({ message: "Jornada do parque atualizada!" }, { status: 200 });
    }

    // 🔴 2. INTERCEPTADOR DA LINHA UNIFICADA: Atualiza as máquinas físicas de espiral baseadas na ação da virtual
    if (id === 'ESPIRALAR_MANUAL_UNIFIED' && grafica) {
      await pool.query(
        `UPDATE maquinas SET dias_trabalho = $1, horas_diarias = $2 
         WHERE UPPER(TRIM(grafica)) = UPPER(TRIM($3)) AND (tipo ILIKE '%espiral%' OR modelo ILIKE '%espiralar%')`,
        [dias_trabalho, horas_diarias, grafica]
      );
      return NextResponse.json({ message: "Jornada da linha unificada atualizada!" }, { status: 200 });
    }

    // 🔴 3. ATUALIZAÇÃO RÁPIDA DE JORNADA DO GANTT (Máquinas Normais)
    if (modelo === undefined && dias_trabalho !== undefined) {
      await pool.query(`UPDATE maquinas SET dias_trabalho = $1, horas_diarias = $2 WHERE TRIM(id::text) = TRIM($3::text)`, [dias_trabalho, horas_diarias, id]);
      return NextResponse.json({ message: "Jornada atualizada com sucesso!" }, { status: 200 });
    }

    // 🔴 4. ATUALIZAÇÃO COMPLETA DA TELA DE EDIÇÃO DO CADASTRO
    await pool.query(
      `UPDATE maquinas SET 
        tipo = $1, tecnologia = $2, modelo = $3, maq_cores = $4, maquinas = $5, pessoas = $6, 
        produtividade_unit = $7, produtividade_total = $8, metrica = $9, 
        limite_lombada = $10, setup = $11, frete = $12, ajuste = $13, configuracoes = $14
       WHERE id = $15`,
      [
        tipo, tecnologia || 'Padrão', modelo, maq_cores || 0, maquinas || 1, pessoas || 1,
        produtividade_unit || 0, produtividade_total || 0, metrica || '',
        limite_lombada || 0, setup || '00:00', frete || '00:00', ajuste || '00:00',
        JSON.stringify(configuracoes || {}), id
      ]
    );

    return NextResponse.json({ message: "Máquina atualizada com sucesso!" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ message: "ID obrigatório." }, { status: 400 });
    await pool.query('DELETE FROM maquinas WHERE id = $1', [id]);
    return NextResponse.json({ message: "Máquina deletada com sucesso!" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: "Erro ao deletar máquina." }, { status: 500 });
  }
}