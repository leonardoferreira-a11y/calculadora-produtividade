import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const grafica = searchParams.get('grafica');

    if (!grafica) return NextResponse.json({ message: "Gráfica obrigatória" }, { status: 400 });

    const result = await pool.query(
      `SELECT id, grafica, maquina_id, data_alvo, status_operacional, horas_disponiveis, motivo 
       FROM gantt_calendario_trava 
       WHERE UPPER(TRIM(grafica)) = UPPER(TRIM($1)) 
       ORDER BY data_alvo ASC`,
      [grafica]
    );

    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { grafica, maquina_id, data_alvo, status_operacional, horas_disponiveis, motivo } = body;

    await pool.query(
      `INSERT INTO gantt_calendario_trava (grafica, maquina_id, data_alvo, status_operacional, horas_disponiveis, motivo) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [grafica, maquina_id, data_alvo, status_operacional, horas_disponiveis, motivo]
    );

    return NextResponse.json({ message: "Trava registrada com sucesso!" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}