import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { tabela, dados } = await request.json();

    if (!dados || dados.length === 0) {
      return NextResponse.json({ message: "Nenhum dado enviado." }, { status: 400 });
    }

    // 🔴 MAPA SQL ATUALIZADO COM A NOVA COLUNA DE CAPAS NOS KITS ($5 inserido no meio)
    const queries = {
      prod_miolo: `INSERT INTO prod_miolo (filtro_producao, grafica, sku_miolo, descricao, tiragem, lombada, paginacao, acabamento) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      prod_capas: `INSERT INTO prod_capas (filtro_producao, grafica, sku_capa, descricao, tiragem, cores, paginacao, acabamento, tamanho_lombada, sku_ref, tipo_capa, beneficiamento) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      prod_encarte: `INSERT INTO prod_encarte (filtro_producao, grafica, sku_miolo, descricao, tiragem, paginacao_encarte, corte_vinco_encarte, paginacao_adesivo, corte_vinco_adesivo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      prod_kits: `INSERT INTO prod_kits (filtro_producao, grafica, id_codigo_kit, id_descricao_kit, id_codigo_sku_capa, espessura_kit_mm, qnt_skus, tiragem, tipo_kit, com_shrink) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      prod_datas_iniciais: `INSERT INTO prod_datas_iniciais (filtro_producao, sku, grafica, dt_fim_aprove_arquivo, dt_envio_tiragem, dt_plan_inicio_imp, dt_replan_inicio_imp, dt_calculo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
    };

    const query = queries[tabela];
    if (!query) {
      return NextResponse.json({ message: "Tabela inválida." }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < dados.length; i++) {
        const linha = dados[i];
        
        const valores = Object.values(linha).map(val => {
            if (val === undefined || val === null || String(val).trim() === '') return null;
            return String(val).trim();
        });

        try {
          await client.query(query, valores);
        } catch (errLinha) {
          console.error(`❌ Erro exato na linha ${i + 1} do CSV:`, errLinha.message);
          console.error("Dados que tentaram entrar:", valores);
          throw new Error(`Linha ${i + 1}: ${errLinha.message}`); 
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ message: `${dados.length} registros importados com sucesso na tabela ${tabela}!` }, { status: 201 });

  } catch (error) {
    console.error("ERRO NA IMPORTAÇÃO:", error.message);
    return NextResponse.json({ message: "Erro ao importar", detalhe: error.message }, { status: 500 });
  }
}