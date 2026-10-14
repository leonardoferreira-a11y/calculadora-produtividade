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

    if (!grafica || !maquina_id || !data_alvo) {
      return NextResponse.json({ message: "Gráfica, equipamento e data são obrigatórios" }, { status: 400 });
    }

    // Upsert: regravar um dia já travado atualiza a trava em vez de violar
    // a constraint unica_trava_por_dia (grafica, maquina_id, data_alvo).
    await pool.query(
      `INSERT INTO gantt_calendario_trava (grafica, maquina_id, data_alvo, status_operacional, horas_disponiveis, motivo)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (grafica, maquina_id, data_alvo)
       DO UPDATE SET status_operacional = EXCLUDED.status_operacional,
                     horas_disponiveis = EXCLUDED.horas_disponiveis,
                     motivo = EXCLUDED.motivo`,
      [String(grafica).toUpperCase().trim(), maquina_id, data_alvo, status_operacional || 'INATIVO', Number(horas_disponiveis) || 0, motivo]
    );

    return NextResponse.json({ message: "Trava registrada com sucesso!" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ message: "ID obrigatório" }, { status: 400 });

    await pool.query(`DELETE FROM gantt_calendario_trava WHERE id = $1`, [id]);

    return NextResponse.json({ message: "Trava removida com sucesso!" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}