import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const grafica = searchParams.get('grafica');
    if (!grafica) return NextResponse.json([], { status: 200 });

    const res = await pool.query(
      `SELECT
         t.filtro_producao AS lote,
         t.sku_alvo,
         t.nome_etapa,
         MIN(t.data_inicio) AS data_teorica,
         p.data_forecast,
         p.data_real,
         p.updated_at
       FROM gantt_tarefas t
       LEFT JOIN pcp_tracking p
         ON UPPER(TRIM(t.sku_alvo)) = UPPER(TRIM(p.sku_alvo))
        AND UPPER(TRIM(t.filtro_producao)) = UPPER(TRIM(p.filtro_producao))
        AND UPPER(TRIM(t.grafica)) = UPPER(TRIM(p.grafica))
        AND UPPER(TRIM(t.nome_etapa)) = UPPER(TRIM(p.nome_etapa))
       WHERE UPPER(TRIM(t.grafica)) = UPPER(TRIM($1))
         AND (t.status_producao IS NULL OR UPPER(TRIM(t.status_producao)) NOT IN ('PRODUZIDA', 'CANCELADA'))
       GROUP BY t.filtro_producao, t.sku_alvo, t.nome_etapa, p.data_forecast, p.data_real, p.updated_at
       ORDER BY t.filtro_producao, t.sku_alvo, MIN(t.data_inicio)`,
      [grafica]
    );
    return NextResponse.json(res.rows);
  } catch(e) {
    console.error('pcp GET error:', e.message);
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Batch import: { rows: CsvRow[] }
    if (Array.isArray(body.rows)) {
      const { rows } = body;
      if (rows.length === 0) return NextResponse.json({ message: 'Nenhuma linha para importar.' }, { status: 400 });
      let importados = 0;
      for (const row of rows) {
        const sku_alvo = String(row.sku_alvo || row.SKU_ALVO || '').toUpperCase().trim();
        const filtro_producao = String(row.filtro_producao || row.FILTRO_PRODUCAO || '').toUpperCase().trim();
        const grafica = String(row.grafica || row.GRAFICA || '').toUpperCase().trim();
        const nome_etapa = String(row.nome_etapa || row.NOME_ETAPA || '').trim();
        const data_forecast = row.data_forecast || row.DATA_FORECAST || null;
        const data_real = row.data_real || row.DATA_REAL || null;
        if (!sku_alvo || !filtro_producao || !grafica || !nome_etapa) continue;
        await pool.query(
          `INSERT INTO pcp_tracking (sku_alvo, filtro_producao, grafica, nome_etapa, data_forecast, data_real, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (sku_alvo, filtro_producao, grafica, nome_etapa)
           DO UPDATE SET data_forecast = EXCLUDED.data_forecast, data_real = EXCLUDED.data_real, updated_at = NOW()`,
          [sku_alvo, filtro_producao, grafica, nome_etapa, data_forecast || null, data_real || null]
        );
        importados++;
      }
      return NextResponse.json({ message: `${importados} linha(s) importadas com sucesso.` });
    }

    // Single row
    const { sku_alvo, filtro_producao, grafica, nome_etapa, data_forecast, data_real } = body;
    if (!sku_alvo || !filtro_producao || !grafica || !nome_etapa) {
      return NextResponse.json({ message: 'Parâmetros obrigatórios ausentes.' }, { status: 400 });
    }
    await pool.query(
      `INSERT INTO pcp_tracking (sku_alvo, filtro_producao, grafica, nome_etapa, data_forecast, data_real, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (sku_alvo, filtro_producao, grafica, nome_etapa)
       DO UPDATE SET data_forecast = EXCLUDED.data_forecast, data_real = EXCLUDED.data_real, updated_at = NOW()`,
      [
        sku_alvo.toUpperCase().trim(), filtro_producao.toUpperCase().trim(),
        grafica.toUpperCase().trim(), nome_etapa,
        data_forecast || null, data_real || null
      ]
    );
    return NextResponse.json({ message: 'PCP tracking salvo.' });
  } catch(e) {
    console.error('pcp POST error:', e.message);
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
