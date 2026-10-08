import pool, { comTransacao } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Um Kit é identificado por (filtro_producao, grafica, id_codigo_kit) e tem UMA linha
// em prod_kits por SKU filho (id_codigo_sku_capa). Os dados gerais (descrição,
// espessura, tiragem...) ficam repetidos em todas as linhas do kit.
// O SKU filho é a capa; ela aponta para o miolo via prod_capas.sku_ref (o Gantt usa isso).

// A ordem importa: o INSERT do PUT faz cast posicional ($5..$10).
const COLS_GERAIS = ['id_descricao_kit', 'espessura_kit_mm', 'qnt_skus', 'tiragem', 'tipo_kit', 'com_shrink'];
const COLS_INTEIRAS = new Set(['qnt_skus', 'tiragem']);

const LOTE_KIT = `UPPER(TRIM(filtro_producao)) = UPPER(TRIM($1))
              AND UPPER(TRIM(grafica)) = UPPER(TRIM($2))
              AND UPPER(TRIM(id_codigo_kit)) = UPPER(TRIM($3))`;

const limpar = (v) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim();

function valorGeral(col, v) {
  const s = limpar(v);
  if (s === null || !COLS_INTEIRAS.has(col)) return s;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new ErroValidacao(`Valor inválido para ${col}: "${s}".`);
  return Math.round(n);
}

class ErroValidacao extends Error {}

// Descrição de um SKU filho: miolo ligado à capa (ou o próprio SKU, se for um miolo), senão a capa.
const SQL_ITENS = `
  SELECT k.id, k.id_codigo_sku_capa AS sku,
         pc.sku_ref AS sku_miolo,
         COALESCE(pm.descricao, pc.descricao) AS descricao
  FROM prod_kits k
  LEFT JOIN LATERAL (
    SELECT c.descricao, c.sku_ref FROM prod_capas c
    WHERE UPPER(TRIM(c.sku_capa)) = UPPER(TRIM(k.id_codigo_sku_capa))
      AND UPPER(TRIM(c.filtro_producao)) = UPPER(TRIM(k.filtro_producao))
      AND UPPER(TRIM(c.grafica)) = UPPER(TRIM(k.grafica))
    ORDER BY c.id LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT m.descricao FROM prod_miolo m
    WHERE UPPER(TRIM(m.sku_miolo)) = UPPER(TRIM(COALESCE(pc.sku_ref, k.id_codigo_sku_capa)))
      AND UPPER(TRIM(m.filtro_producao)) = UPPER(TRIM(k.filtro_producao))
      AND UPPER(TRIM(m.grafica)) = UPPER(TRIM(k.grafica))
    ORDER BY m.id LIMIT 1
  ) pm ON true
  WHERE UPPER(TRIM(k.filtro_producao)) = UPPER(TRIM($1))
    AND UPPER(TRIM(k.grafica)) = UPPER(TRIM($2))
    AND UPPER(TRIM(k.id_codigo_kit)) = UPPER(TRIM($3))
  ORDER BY k.id ASC`;

// ────────────────────────────────────────────────────────────────────────────
// GET ?filtro&grafica&kit → { kit, itens, opcoes, tem_calculo }
//  - opcoes: SKUs do lote que podem ser adicionados ao kit (capas + miolos sem capa).
// ────────────────────────────────────────────────────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filtro = searchParams.get('filtro');
    const grafica = searchParams.get('grafica');
    const kit = searchParams.get('kit');
    if (!filtro || !grafica || !kit) {
      return NextResponse.json({ message: "filtro, grafica e kit são obrigatórios." }, { status: 400 });
    }
    const params = [filtro, grafica, kit];

    const [geral, itens, opcoes, calc] = await Promise.all([
      pool.query(
        `SELECT MAX(id_codigo_kit) AS id_codigo_kit,
                ${COLS_GERAIS.map(c => `MAX(${c}::text) AS ${c}`).join(', ')}
         FROM prod_kits WHERE ${LOTE_KIT}`,
        params
      ),
      pool.query(SQL_ITENS, params),
      pool.query(
        `SELECT c.sku_capa AS sku, c.sku_ref AS sku_miolo, COALESCE(m.descricao, c.descricao) AS descricao
         FROM prod_capas c
         LEFT JOIN prod_miolo m
           ON UPPER(TRIM(m.sku_miolo)) = UPPER(TRIM(c.sku_ref))
          AND UPPER(TRIM(m.filtro_producao)) = UPPER(TRIM(c.filtro_producao))
          AND UPPER(TRIM(m.grafica)) = UPPER(TRIM(c.grafica))
         WHERE UPPER(TRIM(c.filtro_producao)) = UPPER(TRIM($1)) AND UPPER(TRIM(c.grafica)) = UPPER(TRIM($2))
         UNION
         SELECT m.sku_miolo, m.sku_miolo, m.descricao
         FROM prod_miolo m
         WHERE UPPER(TRIM(m.filtro_producao)) = UPPER(TRIM($1)) AND UPPER(TRIM(m.grafica)) = UPPER(TRIM($2))
           AND NOT EXISTS (
             SELECT 1 FROM prod_capas c
             WHERE UPPER(TRIM(c.sku_ref)) = UPPER(TRIM(m.sku_miolo))
               AND UPPER(TRIM(c.filtro_producao)) = UPPER(TRIM(m.filtro_producao))
               AND UPPER(TRIM(c.grafica)) = UPPER(TRIM(m.grafica)))
         ORDER BY 1`,
        [filtro, grafica]
      ),
      pool.query(`SELECT EXISTS (SELECT 1 FROM kit_calculos WHERE ${LOTE_KIT}) AS tem_calculo`, params),
    ]);

    if (!geral.rows[0]?.id_codigo_kit) {
      return NextResponse.json({ message: `Kit "${kit}" não encontrado neste lote.` }, { status: 404 });
    }

    return NextResponse.json({
      kit: geral.rows[0],
      itens: itens.rows,
      opcoes: opcoes.rows,
      tem_calculo: calc.rows[0]?.tem_calculo || false,
    }, { status: 200 });
  } catch (error) {
    console.error("❌ ERRO AO DETALHAR KIT:", error.message);
    return NextResponse.json({ message: `Erro ao buscar kit: ${error.message}` }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PUT: salva o kit inteiro numa transação.
// Body: { filtro_producao, grafica, id_codigo_kit, dados: {colunas gerais},
//         itens: [{ id?, sku }], limpar_calculo }
//  - Itens com id são mantidos; linhas do kit fora da lista são removidas;
//    itens sem id são inseridos (copiando os dados gerais).
//  - SKU filho pode ser digitado como SKU de capa ou de miolo (miolo → sua capa).
//  - limpar_calculo = true apaga o kit_calculos do kit.
// ────────────────────────────────────────────────────────────────────────────
export async function PUT(request) {
  try {
    const { filtro_producao, grafica, id_codigo_kit, dados = {}, itens, limpar_calculo } = await request.json();
    const filtro = limpar(filtro_producao);
    const graf = limpar(grafica);
    const kit = limpar(id_codigo_kit);
    if (!filtro || !graf || !kit) {
      return NextResponse.json({ message: "filtro_producao, grafica e id_codigo_kit são obrigatórios." }, { status: 400 });
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ message: "O kit precisa ter pelo menos 1 SKU." }, { status: 400 });
    }
    const params = [filtro, graf, kit];

    const gerais = {};
    for (const c of COLS_GERAIS) if (dados[c] !== undefined) gerais[c] = valorGeral(c, dados[c]);

    const resultado = await comTransacao(async (client) => {
      const atuais = await client.query(
        `SELECT id, id_codigo_kit, ${COLS_GERAIS.join(', ')} FROM prod_kits WHERE ${LOTE_KIT} ORDER BY id`, params
      );
      if (atuais.rows.length === 0) throw new ErroValidacao(`Kit "${kit}" não encontrado neste lote.`);
      // Dados gerais das linhas novas: os atuais do kit, sobrescritos pelo que veio no body
      // (lido antes do DELETE, pois todas as linhas antigas podem ser removidas).
      const base = { ...atuais.rows[0], ...gerais };
      const idsAtuais = new Set(atuais.rows.map(r => Number(r.id)));

      // Resolve os SKUs novos contra o lote (capa direta, ou miolo → capa, ou miolo sem capa).
      const novos = itens.filter(i => i?.id == null).map(i => limpar(i?.sku)).filter(Boolean);
      const resolvidos = [];
      if (novos.length > 0) {
        const { rows } = await client.query(
          `SELECT s.digitado,
                  (SELECT c.sku_capa FROM prod_capas c
                    WHERE UPPER(TRIM(c.sku_capa)) = UPPER(TRIM(s.digitado))
                      AND UPPER(TRIM(c.filtro_producao)) = UPPER(TRIM($2)) AND UPPER(TRIM(c.grafica)) = UPPER(TRIM($3)) LIMIT 1) AS capa,
                  (SELECT array_agg(c.sku_capa) FROM prod_capas c
                    WHERE UPPER(TRIM(c.sku_ref)) = UPPER(TRIM(s.digitado))
                      AND UPPER(TRIM(c.filtro_producao)) = UPPER(TRIM($2)) AND UPPER(TRIM(c.grafica)) = UPPER(TRIM($3))) AS capas_do_miolo,
                  (SELECT m.sku_miolo FROM prod_miolo m
                    WHERE UPPER(TRIM(m.sku_miolo)) = UPPER(TRIM(s.digitado))
                      AND UPPER(TRIM(m.filtro_producao)) = UPPER(TRIM($2)) AND UPPER(TRIM(m.grafica)) = UPPER(TRIM($3)) LIMIT 1) AS miolo
           FROM UNNEST($1::text[]) AS s(digitado)`,
          [novos, filtro, graf]
        );
        const erros = [];
        for (const r of rows) {
          if (r.capa) resolvidos.push(r.capa);
          else if (r.capas_do_miolo?.length === 1) resolvidos.push(r.capas_do_miolo[0]);
          else if (r.capas_do_miolo?.length > 1) erros.push(`"${r.digitado}" é um miolo com ${r.capas_do_miolo.length} capas; informe o SKU da capa.`);
          else if (r.miolo) resolvidos.push(r.miolo);
          else erros.push(`SKU "${r.digitado}" não existe neste lote.`);
        }
        if (erros.length > 0) throw new ErroValidacao(erros.join('\n'));
      }

      // SKUs repetidos no kit (mantidos + novos).
      const mantidosIds = itens.filter(i => i?.id != null && idsAtuais.has(Number(i.id))).map(i => Number(i.id));
      const skusMantidos = mantidosIds.length > 0
        ? (await client.query(`SELECT UPPER(TRIM(id_codigo_sku_capa)) AS sku FROM prod_kits WHERE id = ANY($1::int[])`, [mantidosIds])).rows.map(r => r.sku)
        : [];
      const vistos = new Set();
      for (const s of [...skusMantidos, ...resolvidos.map(s => s.toUpperCase().trim())]) {
        if (s && vistos.has(s)) throw new ErroValidacao(`O SKU "${s}" aparece mais de uma vez no kit.`);
        if (s) vistos.add(s);
      }
      if (mantidosIds.length + resolvidos.length === 0) throw new ErroValidacao("O kit precisa ter pelo menos 1 SKU.");

      // 1. Remove as linhas que saíram do kit.
      const removidos = (await client.query(
        `DELETE FROM prod_kits WHERE ${LOTE_KIT} AND NOT (id = ANY($4::int[]))`,
        [...params, mantidosIds]
      )).rowCount;

      // 2. Dados gerais em todas as linhas restantes.
      const setCols = Object.keys(gerais);
      if (setCols.length > 0) {
        await client.query(
          `UPDATE prod_kits SET ${setCols.map((c, i) => `${c} = $${i + 4}`).join(', ')} WHERE ${LOTE_KIT}`,
          [...params, ...setCols.map(c => gerais[c])]
        );
      }

      // 3. Insere os SKUs novos copiando os dados gerais.
      if (resolvidos.length > 0) {
        await client.query(
          `INSERT INTO prod_kits (filtro_producao, grafica, id_codigo_kit, id_codigo_sku_capa, ${COLS_GERAIS.join(', ')})
           SELECT $1, $2, $3, s, $5::varchar, $6::varchar, $7::int, $8::int, $9::varchar, $10::varchar
           FROM UNNEST($4::text[]) AS s`,
          [filtro, graf, base.id_codigo_kit ?? kit, resolvidos, ...COLS_GERAIS.map(c => base[c] ?? null)]
        );
      }

      if (limpar_calculo === true) {
        await client.query(`DELETE FROM kit_calculos WHERE ${LOTE_KIT}`, params);
      }

      return { removidos, adicionados: resolvidos.length };
    });

    return NextResponse.json({ message: "Kit atualizado com sucesso!", ...resultado }, { status: 200 });
  } catch (error) {
    if (error instanceof ErroValidacao) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error("❌ ERRO AO SALVAR KIT:", error.message);
    return NextResponse.json({ message: `Erro ao salvar kit: ${error.message}` }, { status: 500 });
  }
}
