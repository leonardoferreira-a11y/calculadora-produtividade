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

    const result = await pool.query(
      `SELECT p.id, p.sku_miolo, p.paginacao_encarte, p.corte_vinco_encarte, p.paginacao_adesivo, p.corte_vinco_adesivo, p.tiragem, 
              c.dados_calculo
       FROM prod_encarte p
       LEFT JOIN os_calculos c 
         ON UPPER(TRIM(p.sku_miolo)) = UPPER(TRIM(c.sku_miolo))
        AND UPPER(TRIM(p.filtro_producao)) = UPPER(TRIM(c.filtro_producao))
        AND UPPER(TRIM(p.grafica)) = UPPER(TRIM(c.grafica))
       WHERE UPPER(TRIM(p.grafica)) = UPPER(TRIM($1)) 
         AND UPPER(TRIM(p.filtro_producao)) = UPPER(TRIM($2)) 
       ORDER BY p.id ASC`,
      [grafica, filtro_producao]
    );

    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error("Erro na API de buscar prod_encarte:", error);
    return NextResponse.json({ message: "Erro interno ao buscar dados de encarte." }, { status: 500 });
  }
}