import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        k.filtro_producao, 
        k.grafica, 
        COUNT(k.id) AS total_skus,
        SUM(CASE WHEN c.dados_calculo IS NOT NULL THEN 1 ELSE 0 END) AS skus_calculados,
        SUM(k.tiragem) AS tiragem_total
      FROM prod_kits k
      LEFT JOIN kit_calculos c 
        ON UPPER(TRIM(k.id_codigo_kit)) = UPPER(TRIM(c.id_codigo_kit))
       AND UPPER(TRIM(k.filtro_producao)) = UPPER(TRIM(c.filtro_producao))
       AND UPPER(TRIM(k.grafica)) = UPPER(TRIM(c.grafica))
      GROUP BY k.filtro_producao, k.grafica
      ORDER BY k.filtro_producao DESC
    `);

    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error("Erro na API de buscar filtros de kits:", error);
    return NextResponse.json({ message: "Erro interno." }, { status: 500 });
  }
}