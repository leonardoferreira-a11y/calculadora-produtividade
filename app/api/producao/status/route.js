import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filtro = searchParams.get('filtro');
    const grafica = searchParams.get('grafica');
    if (!filtro || !grafica) return NextResponse.json({ status_producao: null });
    const res = await pool.query(
      `SELECT status_producao FROM gantt_tarefas
       WHERE UPPER(TRIM(filtro_producao)) = UPPER(TRIM($1))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($2))
       LIMIT 1`,
      [filtro, grafica]
    );
    return NextResponse.json({ status_producao: res.rows[0]?.status_producao || null });
  } catch(e) {
    return NextResponse.json({ status_producao: null });
  }
}

export async function POST(request) {
  try {
    const { filtro_producao, grafica, status_producao } = await request.json();
    if (!filtro_producao || !grafica) return NextResponse.json({ message: 'Parâmetros inválidos.' }, { status: 400 });
    await pool.query(
      `UPDATE gantt_tarefas SET status_producao = $1
       WHERE UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
      [status_producao || null, filtro_producao, grafica]
    );
    return NextResponse.json({ message: 'Status atualizado.' });
  } catch(e) {
    console.error('status POST error:', e.message);
    return NextResponse.json({ message: 'Erro ao atualizar status.' }, { status: 500 });
  }
}
