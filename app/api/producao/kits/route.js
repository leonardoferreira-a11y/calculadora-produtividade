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
      `SELECT k.id, k.filtro_producao, k.grafica, k.id_codigo_kit, k.id_descricao_kit, 
              k.id_codigo_sku_capa, -- 🔴 NOVA COLUNA MAPEADA AQUI
              k.espessura_kit_mm, k.qnt_skus, k.tiragem, k.tipo_kit, k.com_shrink, k.data_importacao,
              c.dados_calculo
       FROM prod_kits k
       LEFT JOIN kit_calculos c 
         ON UPPER(TRIM(k.id_codigo_kit)) = UPPER(TRIM(c.id_codigo_kit))
        AND UPPER(TRIM(k.filtro_producao)) = UPPER(TRIM(c.filtro_producao))
        AND UPPER(TRIM(k.grafica)) = UPPER(TRIM(c.grafica))
       WHERE UPPER(TRIM(k.grafica)) = UPPER(TRIM($1)) 
         AND UPPER(TRIM(k.filtro_producao)) = UPPER(TRIM($2)) 
       ORDER BY k.id ASC`,
      [grafica, filtro_producao]
    );

    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error("Erro na API de buscar prod_kits:", error);
    return NextResponse.json({ message: "Erro interno ao buscar dados de kits." }, { status: 500 });
  }
}