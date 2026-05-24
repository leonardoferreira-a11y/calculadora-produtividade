import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET ?grafica=X — one row per SKU with aggregated dates + status
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const grafica = searchParams.get('grafica');
    const filtro = searchParams.get('filtro');
    if (!grafica) return NextResponse.json([]);

    const params = [grafica];
    let where = `WHERE UPPER(TRIM(t.grafica)) = UPPER(TRIM($1))`;
    if (filtro) {
      where += ` AND UPPER(TRIM(t.filtro_producao)) = UPPER(TRIM($2))`;
      params.push(filtro);
    }
    const res = await pool.query(
      `SELECT
         t.filtro_producao AS lote,
         t.sku_alvo,
         t.grafica,
         MAX(t.status_producao) AS status_producao,
         MIN(t.data_inicio) AS data_teorica,
         MAX(t.data_fim)    AS data_prazo,
         MAX(pm.tiragem)    AS tiragem,
         MAX(pm.paginacao)  AS paginacao,
         MAX(pm.acabamento) AS acabamento
       FROM gantt_tarefas t
       LEFT JOIN prod_miolo pm
         ON UPPER(TRIM(t.sku_alvo)) = UPPER(TRIM(pm.sku_miolo))
        AND UPPER(TRIM(t.filtro_producao)) = UPPER(TRIM(pm.filtro_producao))
        AND UPPER(TRIM(t.grafica)) = UPPER(TRIM(pm.grafica))
       ${where}
       GROUP BY t.filtro_producao, t.sku_alvo, t.grafica
       ORDER BY t.filtro_producao, t.sku_alvo`,
      params
    );
    return NextResponse.json(res.rows);
  } catch(e) {
    console.error('painel GET error:', e.message);
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// PATCH — bulk update status for multiple SKUs
// Body: { grafica, updates: [{ sku_alvo, filtro_producao, status_producao }] }
export async function PATCH(request) {
  try {
    const { grafica, updates } = await request.json();
    if (!grafica || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ message: 'Parâmetros inválidos.' }, { status: 400 });
    }
    await Promise.all(updates.map(u =>
      pool.query(
        `UPDATE gantt_tarefas SET status_producao = $1
         WHERE UPPER(TRIM(sku_alvo)) = UPPER(TRIM($2))
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($3))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($4))`,
        [u.status_producao || null, u.sku_alvo, u.filtro_producao, grafica]
      )
    ));
    return NextResponse.json({ message: `${updates.length} SKUs atualizados.` });
  } catch(e) {
    console.error('painel PATCH error:', e.message);
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
