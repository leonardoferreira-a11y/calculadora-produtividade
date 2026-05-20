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
      `SELECT m.*, c.dados_calculo
       FROM prod_miolo m
       LEFT JOIN os_calculos c 
         ON UPPER(TRIM(m.sku_miolo)) = UPPER(TRIM(c.sku_miolo))
        AND UPPER(TRIM(m.filtro_producao)) = UPPER(TRIM(c.filtro_producao))
        AND UPPER(TRIM(m.grafica)) = UPPER(TRIM(c.grafica))
       WHERE UPPER(TRIM(m.grafica)) = UPPER(TRIM($1)) 
         AND UPPER(TRIM(m.filtro_producao)) = UPPER(TRIM($2))
       ORDER BY m.id ASC`,
      [grafica, filtro_producao]
    );

    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error("Erro na API de buscar prod_miolo:", error);
    return NextResponse.json({ message: "Erro interno ao buscar dados de miolo." }, { status: 500 });
  }
}