import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Relações de um SKU de miolo:
//  - prod_capas    : ligadas por sku_ref = sku_miolo
//  - prod_encarte  : ligadas por sku_miolo
//  - prod_kits     : ligadas por id_codigo_sku_capa ∈ (sku_capa das capas do sku)
//  - prod_datas_iniciais : ligadas por sku = sku_miolo
//  - os_calculos   : por sku_miolo   | gantt_tarefas : por sku_alvo
//  - kit_calculos  : por id_codigo_kit (dos kits acima)

// Colunas editáveis por tabela (linkagens ficam de fora p/ preservar integridade).
const COLS_MIOLO   = ['descricao', 'tiragem', 'lombada', 'paginacao', 'acabamento'];
const COLS_CAPA    = ['descricao', 'tiragem', 'cores', 'paginacao', 'acabamento', 'tamanho_lombada', 'tipo_capa', 'beneficiamento'];
const COLS_ENCARTE = ['descricao', 'tiragem', 'paginacao_encarte', 'corte_vinco_encarte', 'paginacao_adesivo', 'corte_vinco_adesivo'];
const COLS_KIT     = ['id_descricao_kit', 'espessura_kit_mm', 'qnt_skus', 'tiragem', 'tipo_kit', 'com_shrink'];
const COLS_DATA    = ['dt_calculo', 'dt_plan_inicio_imp', 'dt_replan_inicio_imp', 'dt_fim_aprove_arquivo', 'dt_envio_tiragem'];

const limparVal = (v) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim();

// UPDATE dinâmico: aplica apenas as colunas presentes em `data`.
async function execUpdate(client, table, data, cols, whereParts) {
  const setCols = cols.filter(c => data[c] !== undefined);
  if (setCols.length === 0) return;
  const params = [];
  let idx = 1;
  const sets = setCols.map(c => { params.push(limparVal(data[c])); return `${c} = $${idx++}`; });
  const wheres = whereParts.map(w => {
    params.push(w.ci ? String(w.val).trim() : w.val);
    return w.ci ? `UPPER(TRIM(${w.col})) = UPPER(TRIM($${idx++}))` : `${w.col} = $${idx++}`;
  });
  await client.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${wheres.join(' AND ')}`, params);
}

// ────────────────────────────────────────────────────────────────────────────
// GET
//  - Modo LISTA  (?filtro&grafica): SKUs do lote (foco em dt_calculo).
//  - Modo DETALHE (?sku&filtro&grafica): "Raio-X" completo de um SKU.
// ────────────────────────────────────────────────────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filtro_producao = searchParams.get('filtro');
    const grafica = searchParams.get('grafica');
    const sku = searchParams.get('sku');

    if (!filtro_producao || !grafica) {
      return NextResponse.json({ message: "filtro e grafica são obrigatórios." }, { status: 400 });
    }

    // ── MODO DETALHE ──────────────────────────────────────────────────────
    if (sku) {
      const [miolo, datas, capas, encartes, calc] = await Promise.all([
        pool.query(
          `SELECT id, sku_miolo, descricao, tiragem, lombada, paginacao, acabamento
           FROM prod_miolo
           WHERE UPPER(TRIM(sku_miolo)) = UPPER(TRIM($1))
             AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
             AND UPPER(TRIM(grafica)) = UPPER(TRIM($3)) LIMIT 1`,
          [sku, filtro_producao, grafica]
        ),
        pool.query(
          `SELECT dt_calculo::text AS dt_calculo,
                  dt_plan_inicio_imp::text AS dt_plan_inicio_imp,
                  dt_replan_inicio_imp::text AS dt_replan_inicio_imp,
                  dt_fim_aprove_arquivo::text AS dt_fim_aprove_arquivo,
                  dt_envio_tiragem::text AS dt_envio_tiragem
           FROM prod_datas_iniciais
           WHERE UPPER(TRIM(sku)) = UPPER(TRIM($1))
             AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
             AND UPPER(TRIM(grafica)) = UPPER(TRIM($3)) LIMIT 1`,
          [sku, filtro_producao, grafica]
        ),
        pool.query(
          `SELECT id, sku_capa, descricao, tiragem, cores, paginacao, acabamento, tamanho_lombada, sku_ref, tipo_capa, beneficiamento
           FROM prod_capas
           WHERE UPPER(TRIM(sku_ref)) = UPPER(TRIM($1))
             AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
             AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))
           ORDER BY id ASC`,
          [sku, filtro_producao, grafica]
        ),
        pool.query(
          `SELECT id, sku_miolo, descricao, tiragem, paginacao_encarte, corte_vinco_encarte, paginacao_adesivo, corte_vinco_adesivo
           FROM prod_encarte
           WHERE UPPER(TRIM(sku_miolo)) = UPPER(TRIM($1))
             AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
             AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))
           ORDER BY id ASC`,
          [sku, filtro_producao, grafica]
        ),
        pool.query(
          `SELECT EXISTS (
             SELECT 1 FROM os_calculos
             WHERE UPPER(TRIM(sku_miolo)) = UPPER(TRIM($1))
               AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
               AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))
           ) AS tem_calculo`,
          [sku, filtro_producao, grafica]
        ),
      ]);

      // Kits NÃO fazem parte da edição do miolo (gerenciados em aba própria).
      return NextResponse.json({
        miolo: miolo.rows[0] || null,
        datas: datas.rows[0] || {},
        capas: capas.rows,
        encartes: encartes.rows,
        tem_calculo: calc.rows[0]?.tem_calculo || false,
      }, { status: 200 });
    }

    // ── MODO LISTA ────────────────────────────────────────────────────────
    // Produtos (miolo) e Kits são listados separadamente: { produtos, kits }.
    const [produtosRes, kitsRes] = await Promise.all([
      pool.query(
        `SELECT
           m.sku_miolo,
           m.descricao,
           m.tiragem,
           m.paginacao,
           d.dt_calculo::text           AS dt_calculo,
           d.dt_plan_inicio_imp::text   AS dt_plan_inicio_imp,
           d.dt_replan_inicio_imp::text AS dt_replan_inicio_imp,
           d.dt_fim_aprove_arquivo::text AS dt_fim_aprove_arquivo,
           d.dt_envio_tiragem::text     AS dt_envio_tiragem,
           EXISTS (
             SELECT 1 FROM os_calculos c
             WHERE UPPER(TRIM(c.sku_miolo)) = UPPER(TRIM(m.sku_miolo))
               AND UPPER(TRIM(c.filtro_producao)) = UPPER(TRIM(m.filtro_producao))
               AND UPPER(TRIM(c.grafica)) = UPPER(TRIM(m.grafica))
           ) AS tem_calculo
         FROM prod_miolo m
         LEFT JOIN prod_datas_iniciais d
           ON UPPER(TRIM(d.sku)) = UPPER(TRIM(m.sku_miolo))
          AND UPPER(TRIM(d.filtro_producao)) = UPPER(TRIM(m.filtro_producao))
          AND UPPER(TRIM(d.grafica)) = UPPER(TRIM(m.grafica))
         WHERE UPPER(TRIM(m.filtro_producao)) = UPPER(TRIM($1))
           AND UPPER(TRIM(m.grafica)) = UPPER(TRIM($2))
         ORDER BY m.sku_miolo ASC`,
        [filtro_producao, grafica]
      ),
      pool.query(
        `SELECT * FROM prod_kits
         WHERE UPPER(TRIM(filtro_producao)) = UPPER(TRIM($1))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($2))
         ORDER BY id ASC`,
        [filtro_producao, grafica]
      ),
    ]);

    return NextResponse.json({ produtos: produtosRes.rows, kits: kitsRes.rows }, { status: 200 });
  } catch (error) {
    console.error("❌ ERRO AO LISTAR/DETALHAR SKUs:", error.message);
    return NextResponse.json({ message: `Erro ao buscar SKUs: ${error.message}` }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH: "Raio-X" — atualiza miolo + capas + encartes + kits + datas (upsert).
// Body: { sku_miolo, filtro_producao, grafica, miolo, datas, capas[], encartes[],
//         kits[], limpar_calculo }
// Se limpar_calculo = true, apaga os_calculos, gantt_tarefas e kit_calculos do SKU.
// ────────────────────────────────────────────────────────────────────────────
export async function PATCH(request) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const { sku_miolo, filtro_producao, grafica, miolo, datas, capas, encartes, kits, limpar_calculo } = body;

    if (!sku_miolo || !filtro_producao || !grafica) {
      client.release();
      return NextResponse.json({ message: "sku_miolo, filtro_producao e grafica são obrigatórios." }, { status: 400 });
    }

    const sku = String(sku_miolo).trim();
    const filtro = String(filtro_producao).trim();
    const graf = String(grafica).trim();
    const loteWhere = [
      { col: 'filtro_producao', val: filtro, ci: true },
      { col: 'grafica', val: graf, ci: true },
    ];

    await client.query('BEGIN');

    // 1. prod_miolo
    if (miolo && typeof miolo === 'object') {
      await execUpdate(client, 'prod_miolo', miolo, COLS_MIOLO, [
        { col: 'sku_miolo', val: sku, ci: true }, ...loteWhere,
      ]);
    }

    // 2. prod_capas (por id de cada linha)
    if (Array.isArray(capas)) {
      for (const c of capas) {
        if (c?.id == null) continue;
        await execUpdate(client, 'prod_capas', c, COLS_CAPA, [
          { col: 'id', val: c.id, ci: false }, ...loteWhere,
        ]);
      }
    }

    // 3. prod_encarte (por id)
    if (Array.isArray(encartes)) {
      for (const e of encartes) {
        if (e?.id == null) continue;
        await execUpdate(client, 'prod_encarte', e, COLS_ENCARTE, [
          { col: 'id', val: e.id, ci: false }, ...loteWhere,
        ]);
      }
    }

    // 4. prod_kits (por id)
    if (Array.isArray(kits)) {
      for (const k of kits) {
        if (k?.id == null) continue;
        await execUpdate(client, 'prod_kits', k, COLS_KIT, [
          { col: 'id', val: k.id, ci: false }, ...loteWhere,
        ]);
      }
    }

    // 5. prod_datas_iniciais — SEM ON CONFLICT.
    //    A tabela não tem constraint única em (sku, filtro_producao, grafica),
    //    então fazemos checagem manual: SELECT → UPDATE se existir, senão INSERT.
    if (datas && typeof datas === 'object') {
      const enviadas = COLS_DATA.filter(col => datas[col] !== undefined);
      if (enviadas.length > 0) {
        const existe = await client.query(
          `SELECT 1 FROM prod_datas_iniciais
           WHERE UPPER(TRIM(sku)) = UPPER(TRIM($1))
             AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
             AND UPPER(TRIM(grafica)) = UPPER(TRIM($3)) LIMIT 1`,
          [sku, filtro, graf]
        );

        if (existe.rows.length > 0) {
          // UPDATE das datas enviadas
          const params = [];
          let idx = 1;
          const sets = enviadas.map(col => { params.push(limparVal(datas[col])); return `${col} = $${idx++}`; });
          params.push(sku, filtro, graf);
          await client.query(
            `UPDATE prod_datas_iniciais SET ${sets.join(', ')}
             WHERE UPPER(TRIM(sku)) = UPPER(TRIM($${idx++}))
               AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($${idx++}))
               AND UPPER(TRIM(grafica)) = UPPER(TRIM($${idx++}))`,
            params
          );
        } else {
          // INSERT normal
          const insertCols = ['sku', 'filtro_producao', 'grafica', ...enviadas];
          const valores = [sku, filtro, graf, ...enviadas.map(col => limparVal(datas[col]))];
          const placeholders = insertCols.map((_, i) => `$${i + 1}`);
          await client.query(
            `INSERT INTO prod_datas_iniciais (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`,
            valores
          );
        }
      }
    }

    // 6. Limpeza de cálculos (regra crítica)
    if (limpar_calculo === true) {
      await client.query(
        `DELETE FROM os_calculos
         WHERE UPPER(TRIM(sku_miolo)) = UPPER(TRIM($1))
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
        [sku, filtro, graf]
      );
      await client.query(
        `DELETE FROM gantt_tarefas
         WHERE UPPER(TRIM(sku_alvo)) = UPPER(TRIM($1))
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
        [sku, filtro, graf]
      );
      // Cálculos de kit ficam em kit_calculos (por id_codigo_kit).
      const kitCodes = Array.isArray(kits)
        ? kits.map(k => limparVal(k?.id_codigo_kit)).filter(Boolean).map(s => s.toUpperCase())
        : [];
      if (kitCodes.length > 0) {
        await client.query(
          `DELETE FROM kit_calculos
           WHERE UPPER(TRIM(id_codigo_kit)) = ANY($1::text[])
             AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
             AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
          [kitCodes, filtro, graf]
        );
      }
    }

    await client.query('COMMIT');
    client.release();
    return NextResponse.json({ message: "SKU atualizado com sucesso!" }, { status: 200 });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    client.release();
    console.error("❌ ERRO AO EDITAR SKU (Raio-X):", error.message);
    return NextResponse.json({ message: `Erro ao editar SKU: ${error.message}` }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST (Duplicar SKU): copia um SKU (miolo + capas + encarte + datas) com novo
// nome, dentro do mesmo lote. NÃO copia cálculos. Body:
// { sku_origem, novo_sku, filtro_producao, grafica }
// ────────────────────────────────────────────────────────────────────────────
export async function POST(request) {
  const client = await pool.connect();
  try {
    const { sku_origem, novo_sku, filtro_producao, grafica } = await request.json();
    if (!sku_origem || !novo_sku || !filtro_producao || !grafica) {
      client.release();
      return NextResponse.json({ message: "sku_origem, novo_sku, filtro_producao e grafica são obrigatórios." }, { status: 400 });
    }

    const origem = String(sku_origem).trim();
    const novo = String(novo_sku).trim();
    const filtro = String(filtro_producao).trim();
    const graf = String(grafica).trim();

    if (novo.toUpperCase() === origem.toUpperCase()) {
      client.release();
      return NextResponse.json({ message: "O novo SKU deve ser diferente do original." }, { status: 400 });
    }

    await client.query('BEGIN');

    // Bloqueia se o novo SKU já existir neste lote.
    const jaExiste = await client.query(
      `SELECT 1 FROM prod_miolo
       WHERE UPPER(TRIM(sku_miolo)) = UPPER(TRIM($1))
         AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($3)) LIMIT 1`,
      [novo, filtro, graf]
    );
    if (jaExiste.rows.length > 0) {
      await client.query('ROLLBACK');
      client.release();
      return NextResponse.json({ message: `Já existe o SKU "${novo}" neste lote.` }, { status: 409 });
    }

    // prod_miolo (troca sku_miolo)
    await client.query(
      `INSERT INTO prod_miolo (filtro_producao, grafica, sku_miolo, descricao, tiragem, lombada, paginacao, acabamento)
       SELECT filtro_producao, grafica, $1, descricao, tiragem, lombada, paginacao, acabamento
       FROM prod_miolo
       WHERE UPPER(TRIM(sku_miolo)) = UPPER(TRIM($2))
         AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($3))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($4))`,
      [novo, origem, filtro, graf]
    );

    // prod_capas (troca sku_ref; mantém sku_capa)
    await client.query(
      `INSERT INTO prod_capas (filtro_producao, grafica, sku_capa, descricao, tiragem, cores, paginacao, acabamento, tamanho_lombada, sku_ref, tipo_capa, beneficiamento)
       SELECT filtro_producao, grafica, sku_capa, descricao, tiragem, cores, paginacao, acabamento, tamanho_lombada, $1, tipo_capa, beneficiamento
       FROM prod_capas
       WHERE UPPER(TRIM(sku_ref)) = UPPER(TRIM($2))
         AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($3))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($4))`,
      [novo, origem, filtro, graf]
    );

    // prod_encarte (troca sku_miolo)
    await client.query(
      `INSERT INTO prod_encarte (filtro_producao, grafica, sku_miolo, descricao, tiragem, paginacao_encarte, corte_vinco_encarte, paginacao_adesivo, corte_vinco_adesivo)
       SELECT filtro_producao, grafica, $1, descricao, tiragem, paginacao_encarte, corte_vinco_encarte, paginacao_adesivo, corte_vinco_adesivo
       FROM prod_encarte
       WHERE UPPER(TRIM(sku_miolo)) = UPPER(TRIM($2))
         AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($3))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($4))`,
      [novo, origem, filtro, graf]
    );

    // prod_datas_iniciais (troca sku)
    await client.query(
      `INSERT INTO prod_datas_iniciais (filtro_producao, sku, grafica, dt_fim_aprove_arquivo, dt_envio_tiragem, dt_plan_inicio_imp, dt_replan_inicio_imp, dt_calculo)
       SELECT filtro_producao, $1, grafica, dt_fim_aprove_arquivo, dt_envio_tiragem, dt_plan_inicio_imp, dt_replan_inicio_imp, dt_calculo
       FROM prod_datas_iniciais
       WHERE UPPER(TRIM(sku)) = UPPER(TRIM($2))
         AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($3))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($4))`,
      [novo, origem, filtro, graf]
    );

    await client.query('COMMIT');
    client.release();
    return NextResponse.json({ message: `SKU duplicado como "${novo}"!` }, { status: 201 });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    client.release();
    console.error("❌ ERRO AO DUPLICAR SKU:", error.message);
    return NextResponse.json({ message: `Erro ao duplicar SKU: ${error.message}` }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE: exclui um SKU por completo de todas as tabelas relacionadas.
// Body: { sku_miolo, filtro_producao, grafica }
// ────────────────────────────────────────────────────────────────────────────
export async function DELETE(request) {
  const client = await pool.connect();
  try {
    const { sku_miolo, filtro_producao, grafica } = await request.json();
    if (!sku_miolo || !filtro_producao || !grafica) {
      client.release();
      return NextResponse.json({ message: "sku_miolo, filtro_producao e grafica são obrigatórios." }, { status: 400 });
    }

    const sku = String(sku_miolo).trim();
    const filtro = String(filtro_producao).trim();
    const graf = String(grafica).trim();

    await client.query('BEGIN');

    // Capas do SKU (linkam os kits) e códigos de kit afetados.
    const capasRes = await client.query(
      `SELECT UPPER(TRIM(sku_capa)) AS sku_capa FROM prod_capas
       WHERE UPPER(TRIM(sku_ref)) = UPPER(TRIM($1))
         AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
      [sku, filtro, graf]
    );
    const capasSkus = capasRes.rows.map(r => r.sku_capa).filter(Boolean);

    let kitCodes = [];
    if (capasSkus.length > 0) {
      const kitsRes = await client.query(
        `SELECT UPPER(TRIM(id_codigo_kit)) AS cod FROM prod_kits
         WHERE UPPER(TRIM(id_codigo_sku_capa)) = ANY($1::text[])
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
        [capasSkus, filtro, graf]
      );
      kitCodes = kitsRes.rows.map(r => r.cod).filter(Boolean);
    }

    // Apaga cálculos de kit e os kits.
    if (kitCodes.length > 0) {
      await client.query(
        `DELETE FROM kit_calculos
         WHERE UPPER(TRIM(id_codigo_kit)) = ANY($1::text[])
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
        [kitCodes, filtro, graf]
      );
    }
    if (capasSkus.length > 0) {
      await client.query(
        `DELETE FROM prod_kits
         WHERE UPPER(TRIM(id_codigo_sku_capa)) = ANY($1::text[])
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
        [capasSkus, filtro, graf]
      );
    }

    // Capas, encarte, datas, cálculos e por fim o miolo.
    await client.query(
      `DELETE FROM prod_capas WHERE UPPER(TRIM(sku_ref)) = UPPER(TRIM($1)) AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2)) AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
      [sku, filtro, graf]
    );
    await client.query(
      `DELETE FROM prod_encarte WHERE UPPER(TRIM(sku_miolo)) = UPPER(TRIM($1)) AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2)) AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
      [sku, filtro, graf]
    );
    await client.query(
      `DELETE FROM prod_datas_iniciais WHERE UPPER(TRIM(sku)) = UPPER(TRIM($1)) AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2)) AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
      [sku, filtro, graf]
    );
    await client.query(
      `DELETE FROM os_calculos WHERE UPPER(TRIM(sku_miolo)) = UPPER(TRIM($1)) AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2)) AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
      [sku, filtro, graf]
    );
    await client.query(
      `DELETE FROM gantt_tarefas WHERE UPPER(TRIM(sku_alvo)) = UPPER(TRIM($1)) AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2)) AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
      [sku, filtro, graf]
    );
    await client.query(
      `DELETE FROM prod_miolo WHERE UPPER(TRIM(sku_miolo)) = UPPER(TRIM($1)) AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2)) AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
      [sku, filtro, graf]
    );

    await client.query('COMMIT');
    client.release();
    return NextResponse.json({ message: "SKU excluído com sucesso!" }, { status: 200 });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    client.release();
    console.error("❌ ERRO AO EXCLUIR SKU:", error.message);
    return NextResponse.json({ message: `Erro ao excluir SKU: ${error.message}` }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PUT (Mover de Lote): muda o filtro_producao de UM SKU (e tudo que o acompanha)
// para outro lote. Body: { sku_miolo, filtro_producao_atual, grafica, novo_filtro_producao }
// ────────────────────────────────────────────────────────────────────────────
export async function PUT(request) {
  const client = await pool.connect();
  try {
    const { sku_miolo, filtro_producao_atual, grafica, novo_filtro_producao } = await request.json();
    if (!sku_miolo || !filtro_producao_atual || !grafica || !novo_filtro_producao) {
      client.release();
      return NextResponse.json({ message: "sku_miolo, filtro_producao_atual, grafica e novo_filtro_producao são obrigatórios." }, { status: 400 });
    }

    const sku = String(sku_miolo).trim();
    const filtroAtual = String(filtro_producao_atual).trim();
    const novoFiltro = String(novo_filtro_producao).trim();
    const graf = String(grafica).trim();

    if (novoFiltro.toUpperCase() === filtroAtual.toUpperCase()) {
      client.release();
      return NextResponse.json({ message: "O novo lote deve ser diferente do atual." }, { status: 400 });
    }

    await client.query('BEGIN');

    // Capas e códigos de kit do SKU (no lote atual).
    const capasRes = await client.query(
      `SELECT UPPER(TRIM(sku_capa)) AS sku_capa FROM prod_capas
       WHERE UPPER(TRIM(sku_ref)) = UPPER(TRIM($1))
         AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
         AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
      [sku, filtroAtual, graf]
    );
    const capasSkus = capasRes.rows.map(r => r.sku_capa).filter(Boolean);

    let kitCodes = [];
    if (capasSkus.length > 0) {
      const kitsRes = await client.query(
        `SELECT UPPER(TRIM(id_codigo_kit)) AS cod FROM prod_kits
         WHERE UPPER(TRIM(id_codigo_sku_capa)) = ANY($1::text[])
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
        [capasSkus, filtroAtual, graf]
      );
      kitCodes = kitsRes.rows.map(r => r.cod).filter(Boolean);
    }

    const moverPorChave = async (table, col, val) => {
      await client.query(
        `UPDATE ${table} SET filtro_producao = $1
         WHERE UPPER(TRIM(${col})) = UPPER(TRIM($2))
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($3))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($4))`,
        [novoFiltro, val, filtroAtual, graf]
      );
    };

    const moverPorLista = async (table, col, lista) => {
      if (!lista || lista.length === 0) return;
      await client.query(
        `UPDATE ${table} SET filtro_producao = $1
         WHERE UPPER(TRIM(${col})) = ANY($2::text[])
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($3))
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($4))`,
        [novoFiltro, lista, filtroAtual, graf]
      );
    };

    await moverPorChave('prod_miolo', 'sku_miolo', sku);
    await moverPorChave('prod_capas', 'sku_ref', sku);
    await moverPorChave('prod_encarte', 'sku_miolo', sku);
    await moverPorChave('prod_datas_iniciais', 'sku', sku);
    await moverPorChave('os_calculos', 'sku_miolo', sku);
    await moverPorChave('gantt_tarefas', 'sku_alvo', sku);
    await moverPorLista('prod_kits', 'id_codigo_sku_capa', capasSkus);
    await moverPorLista('kit_calculos', 'id_codigo_kit', kitCodes);

    await client.query('COMMIT');
    client.release();
    return NextResponse.json({ message: `SKU movido para o lote "${novoFiltro}"!` }, { status: 200 });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    client.release();
    console.error("❌ ERRO AO MOVER SKU:", error.message);
    return NextResponse.json({ message: `Erro ao mover SKU: ${error.message}` }, { status: 500 });
  }
}
