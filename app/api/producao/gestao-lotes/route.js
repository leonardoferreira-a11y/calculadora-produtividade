import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Um "Lote" é um agrupamento lógico identificado por (filtro_producao + grafica),
// com os dados físicos espalhados por 5 tabelas vindas da importação CSV.
// As 5 tabelas físicas (dados do lote):
const TABELAS_FISICAS = ['prod_miolo', 'prod_capas', 'prod_encarte', 'prod_kits', 'prod_datas_iniciais'];
// Tabelas de cálculo derivado (não acompanham duplicação; só são limpas/apagadas):
const TABELAS_CALCULO = ['os_calculos', 'gantt_tarefas'];

// Colunas de cada tabela física (1ª SEMPRE filtro_producao — é a que substituímos ao duplicar).
// Espelham os INSERTs de app/api/importacao/route.js.
const COLUNAS_FISICAS = {
  prod_miolo:          ['filtro_producao', 'grafica', 'sku_miolo', 'descricao', 'tiragem', 'lombada', 'paginacao', 'acabamento'],
  prod_capas:          ['filtro_producao', 'grafica', 'sku_capa', 'descricao', 'tiragem', 'cores', 'paginacao', 'acabamento', 'tamanho_lombada', 'sku_ref', 'tipo_capa', 'beneficiamento'],
  prod_encarte:        ['filtro_producao', 'grafica', 'sku_miolo', 'descricao', 'tiragem', 'paginacao_encarte', 'corte_vinco_encarte', 'paginacao_adesivo', 'corte_vinco_adesivo'],
  prod_kits:           ['filtro_producao', 'grafica', 'id_codigo_kit', 'id_descricao_kit', 'id_codigo_sku_capa', 'espessura_kit_mm', 'qnt_skus', 'tiragem', 'tipo_kit', 'com_shrink'],
  prod_datas_iniciais: ['filtro_producao', 'sku', 'grafica', 'dt_fim_aprove_arquivo', 'dt_envio_tiragem', 'dt_plan_inicio_imp', 'dt_replan_inicio_imp', 'dt_calculo'],
};

// Tabelas físicas que possuem coluna de tiragem (alvo da atualização em massa do PATCH).
const TABELAS_COM_TIRAGEM = ['prod_miolo', 'prod_capas', 'prod_encarte', 'prod_kits'];

// ────────────────────────────────────────────────────────────────────────────
// GET: lista os lotes agrupados por (filtro_producao + grafica), com soma de
// tiragem, total de SKUs e flag status_calculado (existe cálculo salvo?).
// ────────────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        m.filtro_producao,
        m.grafica,
        COUNT(*)::int AS total_skus,
        COALESCE(SUM(NULLIF(TRIM(m.tiragem::text), '')::numeric), 0) AS tiragem_total,
        EXISTS (
          SELECT 1 FROM os_calculos c
          WHERE UPPER(TRIM(c.filtro_producao)) = UPPER(TRIM(m.filtro_producao))
            AND UPPER(TRIM(c.grafica)) = UPPER(TRIM(m.grafica))
        ) AS status_calculado
      FROM prod_miolo m
      WHERE m.filtro_producao IS NOT NULL AND m.grafica IS NOT NULL
      GROUP BY m.filtro_producao, m.grafica
      ORDER BY m.filtro_producao ASC, m.grafica ASC
    `);

    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error("❌ ERRO AO LISTAR LOTES:", error.message);
    return NextResponse.json({ message: `Erro ao listar lotes: ${error.message}` }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE: apaga um lote por completo (5 tabelas físicas + 2 de cálculo) dentro
// de uma transação. Body: { filtro_producao, grafica }.
// ────────────────────────────────────────────────────────────────────────────
export async function DELETE(request) {
  const client = await pool.connect();
  try {
    const { filtro_producao, grafica } = await request.json();

    if (!filtro_producao || !grafica) {
      client.release();
      return NextResponse.json({ message: "filtro_producao e grafica são obrigatórios." }, { status: 400 });
    }

    const filtro = String(filtro_producao).trim();
    const grafica_limpa = String(grafica).trim();

    await client.query('BEGIN');

    const todasTabelas = [...TABELAS_FISICAS, ...TABELAS_CALCULO];
    let totalApagado = 0;
    for (const tabela of todasTabelas) {
      const res = await client.query(
        `DELETE FROM ${tabela}
         WHERE UPPER(TRIM(filtro_producao)) = UPPER(TRIM($1))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($2))`,
        [filtro, grafica_limpa]
      );
      totalApagado += res.rowCount || 0;
    }

    await client.query('COMMIT');
    client.release();

    return NextResponse.json({ message: "Lote apagado com sucesso!", linhas_removidas: totalApagado }, { status: 200 });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    client.release();
    console.error("❌ ERRO AO APAGAR LOTE:", error.message);
    return NextResponse.json({ message: `Erro ao apagar lote: ${error.message}` }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST (Duplicar): copia as linhas das 5 tabelas físicas substituindo apenas o
// filtro_producao pelo novo nome. O lote novo nasce sem cálculo (não copia
// os_calculos nem gantt_tarefas). Body: { filtro_producao, grafica, novo_filtro_producao }.
// ────────────────────────────────────────────────────────────────────────────
export async function POST(request) {
  const client = await pool.connect();
  try {
    const { filtro_producao, grafica, novo_filtro_producao } = await request.json();

    if (!filtro_producao || !grafica || !novo_filtro_producao) {
      client.release();
      return NextResponse.json({ message: "filtro_producao, grafica e novo_filtro_producao são obrigatórios." }, { status: 400 });
    }

    const filtro = String(filtro_producao).trim();
    const grafica_limpa = String(grafica).trim();
    const novoFiltro = String(novo_filtro_producao).trim();

    if (novoFiltro.toUpperCase() === filtro.toUpperCase()) {
      client.release();
      return NextResponse.json({ message: "O novo nome do lote deve ser diferente do atual." }, { status: 400 });
    }

    // Bloqueia duplicação para um nome de lote que já exista nesta gráfica.
    const jaExiste = await client.query(
      `SELECT 1 FROM prod_miolo
       WHERE UPPER(TRIM(filtro_producao)) = UPPER(TRIM($1))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($2)) LIMIT 1`,
      [novoFiltro, grafica_limpa]
    );
    if (jaExiste.rows.length > 0) {
      client.release();
      return NextResponse.json({ message: `Já existe um lote "${novoFiltro}" nesta gráfica.` }, { status: 409 });
    }

    await client.query('BEGIN');

    let totalCopiado = 0;
    for (const tabela of TABELAS_FISICAS) {
      const colunas = COLUNAS_FISICAS[tabela];
      const insertCols = colunas.join(', ');
      // 1ª coluna (filtro_producao) recebe o novo nome ($1); as demais são copiadas por nome.
      const selectCols = ['$1', ...colunas.slice(1)].join(', ');

      const res = await client.query(
        `INSERT INTO ${tabela} (${insertCols})
         SELECT ${selectCols}
         FROM ${tabela}
         WHERE UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
        [novoFiltro, filtro, grafica_limpa]
      );
      totalCopiado += res.rowCount || 0;
    }

    await client.query('COMMIT');
    client.release();

    return NextResponse.json({ message: `Lote duplicado como "${novoFiltro}"!`, linhas_copiadas: totalCopiado }, { status: 201 });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    client.release();
    console.error("❌ ERRO AO DUPLICAR LOTE:", error.message);
    return NextResponse.json({ message: `Erro ao duplicar lote: ${error.message}` }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH (Editar): atualiza dados globais do lote (grafica, filtro_producao e,
// opcionalmente, tiragem em massa) em cascata nas 5 tabelas físicas. Se
// limpar_calculos = true, apaga os_calculos e gantt_tarefas do lote primeiro.
// Body: { filtro_producao, grafica, limpar_calculos, novo_filtro_producao?, nova_grafica?, nova_tiragem? }.
// ────────────────────────────────────────────────────────────────────────────
export async function PATCH(request) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const { filtro_producao, grafica, limpar_calculos, novo_filtro_producao, nova_grafica, nova_tiragem } = body;

    if (!filtro_producao || !grafica) {
      client.release();
      return NextResponse.json({ message: "filtro_producao e grafica (atuais) são obrigatórios." }, { status: 400 });
    }

    const filtro = String(filtro_producao).trim();
    const grafica_limpa = String(grafica).trim();
    const novoFiltro = (novo_filtro_producao !== undefined && novo_filtro_producao !== null && String(novo_filtro_producao).trim() !== '')
      ? String(novo_filtro_producao).trim() : null;
    const novaGrafica = (nova_grafica !== undefined && nova_grafica !== null && String(nova_grafica).trim() !== '')
      ? String(nova_grafica).trim() : null;
    // nova_tiragem só é aplicada se enviada explicitamente (inclusive 0).
    const aplicarTiragem = nova_tiragem !== undefined && nova_tiragem !== null && String(nova_tiragem).trim() !== '';
    const tiragemValor = aplicarTiragem ? String(nova_tiragem).trim() : null;

    await client.query('BEGIN');

    // 1. Limpeza de cálculos (usando as CHAVES ATUAIS, antes de renomear).
    if (limpar_calculos === true) {
      for (const tabela of TABELAS_CALCULO) {
        await client.query(
          `DELETE FROM ${tabela}
           WHERE UPPER(TRIM(filtro_producao)) = UPPER(TRIM($1))
             AND UPPER(TRIM(grafica)) = UPPER(TRIM($2))`,
          [filtro, grafica_limpa]
        );
      }
    }

    // 2. UPDATE em cascata nas 5 tabelas físicas.
    let totalAtualizado = 0;
    for (const tabela of TABELAS_FISICAS) {
      const sets = [];
      const params = [];
      let idx = 1;

      if (novoFiltro !== null) { sets.push(`filtro_producao = $${idx++}`); params.push(novoFiltro); }
      if (novaGrafica !== null) { sets.push(`grafica = $${idx++}`); params.push(novaGrafica); }
      if (aplicarTiragem && TABELAS_COM_TIRAGEM.includes(tabela)) { sets.push(`tiragem = $${idx++}`); params.push(tiragemValor); }

      if (sets.length === 0) continue; // nada a alterar nesta tabela

      params.push(filtro, grafica_limpa);
      const res = await client.query(
        `UPDATE ${tabela}
         SET ${sets.join(', ')}
         WHERE UPPER(TRIM(filtro_producao)) = UPPER(TRIM($${idx++}))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($${idx++}))`,
        params
      );
      totalAtualizado += res.rowCount || 0;
    }

    await client.query('COMMIT');
    client.release();

    return NextResponse.json({ message: "Lote atualizado com sucesso!", linhas_atualizadas: totalAtualizado }, { status: 200 });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    client.release();
    console.error("❌ ERRO AO EDITAR LOTE:", error.message);
    return NextResponse.json({ message: `Erro ao editar lote: ${error.message}` }, { status: 500 });
  }
}
