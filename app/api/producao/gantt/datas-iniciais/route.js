import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET: return current dt_calculo for a SKU
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku');
    const filtro = searchParams.get('filtro');
    const grafica = searchParams.get('grafica');
    if (!sku || !filtro || !grafica) return NextResponse.json({ dt_calculo: null }, { status: 200 });
    const res = await pool.query(
      `SELECT dt_calculo, COALESCE(fases_overrides, '{}')::text AS fases_overrides FROM prod_datas_iniciais
       WHERE UPPER(TRIM(sku)) = UPPER(TRIM($1))
         AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))
       LIMIT 1`,
      [sku, filtro, grafica]
    );
    return NextResponse.json({ dt_calculo: res.rows[0]?.dt_calculo || null, fases_overrides: JSON.parse(res.rows[0]?.fases_overrides || '{}') });
  } catch (e) {
    return NextResponse.json({ dt_calculo: null });
  }
}

// POST: upsert dt_calculo for a SKU
export async function POST(request) {
  try {
    const { sku, filtro_producao, grafica, dt_calculo, fases_overrides } = await request.json();
    if (!sku || !filtro_producao || !grafica) {
      return NextResponse.json({ message: "sku, filtro_producao e grafica são obrigatórios." }, { status: 400 });
    }
    // prod_datas_iniciais não tem constraint única em (sku, filtro, gráfica), então não dá
    // para usar ON CONFLICT: atualiza a linha existente e só insere se não houver nenhuma.
    const params = [sku.toUpperCase().trim(), filtro_producao.toUpperCase().trim(), grafica.toUpperCase().trim(), dt_calculo, JSON.stringify(fases_overrides || {})];
    const { rowCount } = await pool.query(
      `UPDATE prod_datas_iniciais SET dt_calculo = $4, fases_overrides = $5
        WHERE UPPER(TRIM(sku)) = $1 AND UPPER(TRIM(filtro_producao)) = $2 AND UPPER(TRIM(grafica)) = $3`,
      params
    );
    if (rowCount === 0) {
      await pool.query(
        `INSERT INTO prod_datas_iniciais (sku, filtro_producao, grafica, dt_calculo, fases_overrides) VALUES ($1, $2, $3, $4, $5)`,
        params
      );
    }
    return NextResponse.json({ message: "Data atualizada com sucesso!" });
  } catch (e) {
    console.error('datas-iniciais POST error:', e.message);
    return NextResponse.json({ message: "Erro ao salvar data." }, { status: 500 });
  }
}
