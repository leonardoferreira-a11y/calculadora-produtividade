import pool, { comTransacao } from '@/lib/db';
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

// Aceita o formato antigo ({ filtro_producao, grafica }) ou em massa ({ lotes: [...] }).
// Retorna a lista de lotes únicos (por filtro+gráfica, sem diferenciar caixa).
function lerLotes(body) {
  const brutos = Array.isArray(body?.lotes) ? body.lotes : [body];
  const vistos = new Set();
  const lotes = [];
  for (const l of brutos) {
    const filtro = String(l?.filtro_producao ?? '').trim();
    const grafica = String(l?.grafica ?? '').trim();
    if (!filtro || !grafica) return null;
    const k = `${filtro.toUpperCase()}|${grafica.toUpperCase()}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    lotes.push({ filtro, grafica });
  }
  return lotes.length > 0 ? lotes : null;
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE: apaga um ou vários lotes por completo (5 tabelas físicas + cálculos)
// numa única transação. Body: { filtro_producao, grafica } ou { lotes: [{ filtro_producao, grafica }] }.
// ────────────────────────────────────────────────────────────────────────────
export async function DELETE(request) {
  try {
    const lotes = lerLotes(await request.json());
    if (!lotes) {
      return NextResponse.json({ message: "filtro_producao e grafica são obrigatórios para cada lote." }, { status: 400 });
    }

    const filtros = lotes.map(l => l.filtro.toUpperCase());
    const graficas = lotes.map(l => l.grafica.toUpperCase());

    const totalApagado = await comTransacao(async (client) => {
      let total = 0;
      for (const tabela of [...TABELAS_FISICAS, ...TABELAS_CALCULO, 'kit_calculos']) {
        const res = await client.query(
          `DELETE FROM ${tabela} AS x
           USING UNNEST($1::text[], $2::text[]) AS l(filtro, grafica)
           WHERE UPPER(TRIM(x.filtro_producao)) = l.filtro
             AND UPPER(TRIM(x.grafica)) = l.grafica`,
          [filtros, graficas]
        );
        total += res.rowCount || 0;
      }
      return total;
    });

    const message = lotes.length === 1 ? "Lote apagado com sucesso!" : `${lotes.length} lotes apagados com sucesso!`;
    return NextResponse.json({ message, lotes_removidos: lotes.length, linhas_removidas: totalApagado }, { status: 200 });
  } catch (error) {
    console.error("❌ ERRO AO APAGAR LOTE:", error.message);
    return NextResponse.json({ message: `Erro ao apagar lote: ${error.message}` }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST (Duplicar): copia as linhas das 5 tabelas físicas substituindo apenas o
// filtro_producao pelo novo nome. O lote novo nasce sem cálculo (não copia
// os_calculos nem gantt_tarefas).
//  - Um lote : { filtro_producao, grafica, novo_filtro_producao } (409 se o nome já existir).
//  - Em massa: { lotes: [{ filtro_producao, grafica }], sufixo? } — cada cópia recebe
//    "<nome><sufixo>" (padrão " - CÓPIA"); se já existir, numera: " - CÓPIA 2", " - CÓPIA 3"...
// ────────────────────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const emMassa = Array.isArray(body?.lotes);
    const lotes = lerLotes(body);
    if (!lotes) {
      return NextResponse.json({ message: "filtro_producao e grafica são obrigatórios para cada lote." }, { status: 400 });
    }

    // Nomes de lote já existentes, por gráfica (para evitar colisão).
    const existentesRes = await pool.query(
      `SELECT DISTINCT UPPER(TRIM(filtro_producao)) AS filtro, UPPER(TRIM(grafica)) AS grafica FROM prod_miolo`
    );
    const ocupados = new Set(existentesRes.rows.map(r => `${r.filtro}|${r.grafica}`));
    const ocupado = (filtro, grafica) => ocupados.has(`${filtro.toUpperCase()}|${grafica.toUpperCase()}`);

    if (emMassa) {
      const sufixo = String(body.sufixo ?? '').trim() ? ` ${String(body.sufixo).trim()}` : ' - CÓPIA';
      for (const l of lotes) {
        let novo = `${l.filtro}${sufixo}`;
        for (let n = 2; ocupado(novo, l.grafica); n++) novo = `${l.filtro}${sufixo} ${n}`;
        l.novo = novo;
        ocupados.add(`${novo.toUpperCase()}|${l.grafica.toUpperCase()}`);
      }
    } else {
      const novo = String(body.novo_filtro_producao ?? '').trim();
      if (!novo) {
        return NextResponse.json({ message: "novo_filtro_producao é obrigatório." }, { status: 400 });
      }
      if (novo.toUpperCase() === lotes[0].filtro.toUpperCase()) {
        return NextResponse.json({ message: "O novo nome do lote deve ser diferente do atual." }, { status: 400 });
      }
      if (ocupado(novo, lotes[0].grafica)) {
        return NextResponse.json({ message: `Já existe um lote "${novo}" nesta gráfica.` }, { status: 409 });
      }
      lotes[0].novo = novo;
    }

    const filtros = lotes.map(l => l.filtro.toUpperCase());
    const graficas = lotes.map(l => l.grafica.toUpperCase());
    const novos = lotes.map(l => l.novo);

    const totalCopiado = await comTransacao(async (client) => {
      let total = 0;
      for (const tabela of TABELAS_FISICAS) {
        const colunas = COLUNAS_FISICAS[tabela];
        // 1ª coluna (filtro_producao) recebe o novo nome; as demais são copiadas por nome.
        const selectCols = ['l.novo', ...colunas.slice(1).map(c => `x.${c}`)].join(', ');
        const res = await client.query(
          `INSERT INTO ${tabela} (${colunas.join(', ')})
           SELECT ${selectCols}
           FROM ${tabela} AS x
           JOIN UNNEST($1::text[], $2::text[], $3::text[]) AS l(filtro, grafica, novo)
             ON UPPER(TRIM(x.filtro_producao)) = l.filtro
            AND UPPER(TRIM(x.grafica)) = l.grafica
           ON CONFLICT DO NOTHING`, // índice único de prod_datas_iniciais (sobras órfãs no lote destino)
          [filtros, graficas, novos]
        );
        total += res.rowCount || 0;
      }
      return total;
    });

    const message = lotes.length === 1
      ? `Lote duplicado como "${lotes[0].novo}"!`
      : `${lotes.length} lotes duplicados: ${novos.join(', ')}`;
    return NextResponse.json({ message, novos_lotes: novos, linhas_copiadas: totalCopiado }, { status: 201 });
  } catch (error) {
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
