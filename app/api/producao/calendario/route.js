import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET: Puxa todas as travas do lote para pintar o Gantt (ex: dias cinzas ou verdes)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const grafica = searchParams.get('grafica');

    if (!grafica) return NextResponse.json({ message: "Gráfica é obrigatória." }, { status: 400 });

    const result = await pool.query(
      `SELECT maquina_id, TO_CHAR(data_alvo, 'YYYY-MM-DD') as data_trava, status_operacional, horas_disponiveis, motivo 
       FROM gantt_calendario_trava 
       WHERE UPPER(TRIM(grafica)) = UPPER(TRIM($1))`,
      [grafica]
    );

    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: "Erro ao buscar calendário." }, { status: 500 });
  }
}

// POST: Cria, atualiza ou remove uma trava quando o usuário clica no Gantt
export async function POST(request) {
  try {
    const body = await request.json();
    const { grafica, maquina_id, data_alvo, status_operacional, horas_disponiveis, motivo, acao } = body;

    if (!grafica || !maquina_id || !data_alvo) {
      return NextResponse.json({ message: "Dados incompletos." }, { status: 400 });
    }

    if (acao === 'REMOVER_TRAVA') {
      await pool.query(
        `DELETE FROM gantt_calendario_trava 
         WHERE UPPER(TRIM(grafica)) = UPPER(TRIM($1)) 
           AND UPPER(TRIM(maquina_id)) = UPPER(TRIM($2)) 
           AND data_alvo = $3`,
        [grafica, maquina_id, data_alvo]
      );
      return NextResponse.json({ message: "Padrão restaurado" }, { status: 200 });
    }

    // ON CONFLICT: Se já existir a combinação de Grafica+Maquina+Data, ele faz UPDATE automático
    await pool.query(
      `INSERT INTO gantt_calendario_trava (grafica, maquina_id, data_alvo, status_operacional, horas_disponiveis, motivo)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (grafica, maquina_id, data_alvo) 
       DO UPDATE SET status_operacional = EXCLUDED.status_operacional, 
                     horas_disponiveis = EXCLUDED.horas_disponiveis, 
                     motivo = EXCLUDED.motivo`,
      [grafica, maquina_id, data_alvo, status_operacional, horas_disponiveis, motivo]
    );

    return NextResponse.json({ message: "Calendário atualizado" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Erro ao salvar calendário." }, { status: 500 });
  }
}