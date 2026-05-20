import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const grafica = searchParams.get('grafica');
    const filtro_producao = searchParams.get('filtro');

    if (!grafica || !filtro_producao) {
      return NextResponse.json({ message: "Gráfica e Filtro de Produção são obrigatórios." }, { status: 400 });
    }

    // O LEFT JOIN liga o sku_ref da capa com o sku_miolo do cálculo salvo!
    const result = await pool.query(
      `SELECT p.id, p.sku_ref, p.sku_capa, p.tipo_capa, p.beneficiamento, p.cores, p.tiragem, 
              c.dados_calculo
       FROM prod_capas p
       LEFT JOIN os_calculos c 
         ON UPPER(TRIM(p.sku_ref)) = UPPER(TRIM(c.sku_miolo))
        AND UPPER(TRIM(p.filtro_producao)) = UPPER(TRIM(c.filtro_producao))
        AND UPPER(TRIM(p.grafica)) = UPPER(TRIM(c.grafica))
       WHERE UPPER(TRIM(p.grafica)) = UPPER(TRIM($1)) 
         AND UPPER(TRIM(p.filtro_producao)) = UPPER(TRIM($2)) 
       ORDER BY p.id ASC`,
      [grafica, filtro_producao]
    );

    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error("Erro na API de buscar prod_capas:", error);
    return NextResponse.json({ message: "Erro interno ao buscar dados de produção." }, { status: 500 });
  }
}