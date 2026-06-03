import pool from '@/lib/db';
import { NextResponse } from 'next/server';

// Assinatura de cabeçalho por tabela: colunas distintivas que DEVEM existir no header
// do CSV para confirmar que o arquivo é do tipo certo. Evita, por exemplo, importar um
// arquivo de Miolo dentro da aba de Capa (que gera erros crípticos de tipo no banco).
const ASSINATURAS = {
  prod_miolo:          { nome: 'Miolo',          obrigatorias: ['sku_miolo', 'lombada'] },
  prod_capas:          { nome: 'Capa',           obrigatorias: ['sku_capa', 'tipo_capa'] },
  prod_encarte:        { nome: 'Encarte',        obrigatorias: ['sku_miolo', 'paginacao_encarte'] },
  prod_kits:           { nome: 'Kit',            obrigatorias: ['id_codigo_kit'] },
  prod_datas_iniciais: { nome: 'Datas Iniciais', obrigatorias: ['dt_envio_tiragem'] },
};

export async function POST(request) {
  try {
    const { tabela, dados, cabecalho } = await request.json();

    if (!dados || dados.length === 0) {
      return NextResponse.json({ error: "Nenhum dado enviado." }, { status: 400 });
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
      return NextResponse.json({ error: "Tabela inválida." }, { status: 400 });
    }

    // 1. VALIDAÇÃO DO CABEÇALHO (primeira linha do CSV)
    // Confere se o arquivo enviado realmente pertence à tabela selecionada.
    const assinatura = ASSINATURAS[tabela];
    if (assinatura && Array.isArray(cabecalho) && cabecalho.length > 0) {
      const colunasHeader = cabecalho.map(c => String(c || '').trim().toLowerCase());
      const faltando = assinatura.obrigatorias.filter(col => !colunasHeader.some(h => h.includes(col)));

      if (faltando.length > 0) {
        return NextResponse.json(
          { error: `Arquivo incorreto. Você está tentando importar um arquivo no local de ${assinatura.nome}, mas o cabeçalho não contém as colunas esperadas (${assinatura.obrigatorias.join(', ')}). Confira se você não trocou as abas (ex: Miolo no lugar de Capa).` },
          { status: 400 }
        );
      }
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
          // 2. CAPTURA O ERRO EXATO DA LINHA E DEVOLVE PARA O FRONT-END
          await client.query('ROLLBACK');
          client.release();
          const linhaAtual = i + 1;
          console.error(`❌ Erro exato na linha ${linhaAtual} do CSV:`, errLinha.message);
          console.error("Dados que tentaram entrar:", valores);
          return NextResponse.json(
            { error: `ERRO NA IMPORTAÇÃO (Linha ${linhaAtual}): ${errLinha.message} | Dados: ${JSON.stringify(linha)}` },
            { status: 400 }
          );
        }
      }

      await client.query('COMMIT');
      client.release();
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
      throw err;
    }

    return NextResponse.json({ message: `${dados.length} registros importados com sucesso na tabela ${tabela}!` }, { status: 201 });

  } catch (error) {
    console.error("ERRO NA IMPORTAÇÃO:", error.message);
    return NextResponse.json({ error: `Erro ao importar: ${error.message}` }, { status: 500 });
  }
}
