import { comTransacao } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Importação da Planilha Mestra: um único CSV que alimenta as 5 tabelas físicas.
// Cada linha pode descrever Kit, Capa, Miolo, Encarte e Datas ao mesmo tempo (células
// vazias = parte ausente). As linhas são validadas e deduplicadas em memória e depois
// gravadas com UM INSERT em lote por tabela (UNNEST) — inserir linha a linha custava
// uma ida ao Neon por registro e levava minutos.

const COLUNAS_OBRIGATORIAS = ['FILTRO_PRODUCAO', 'GRAFICA', 'SKU_MIOLO'];

// Tipos espelham o schema real (information_schema). Usados no cast do UNNEST.
const TABELAS = {
  prod_miolo: {
    colunas: ['filtro_producao', 'grafica', 'sku_miolo', 'descricao', 'tiragem', 'lombada', 'paginacao', 'acabamento'],
    tipos:   ['varchar', 'varchar', 'varchar', 'text', 'int', 'varchar', 'int', 'varchar'],
  },
  prod_capas: {
    colunas: ['filtro_producao', 'grafica', 'sku_capa', 'descricao', 'tiragem', 'cores', 'paginacao', 'acabamento', 'tamanho_lombada', 'sku_ref', 'tipo_capa', 'beneficiamento'],
    tipos:   ['varchar', 'varchar', 'varchar', 'text', 'int', 'varchar', 'int', 'varchar', 'varchar', 'varchar', 'varchar', 'varchar'],
  },
  prod_encarte: {
    colunas: ['filtro_producao', 'grafica', 'sku_miolo', 'descricao', 'tiragem', 'paginacao_encarte', 'corte_vinco_encarte', 'paginacao_adesivo', 'corte_vinco_adesivo'],
    tipos:   ['varchar', 'varchar', 'varchar', 'text', 'int', 'int', 'varchar', 'int', 'varchar'],
  },
  prod_kits: {
    colunas: ['filtro_producao', 'grafica', 'id_codigo_kit', 'id_descricao_kit', 'id_codigo_sku_capa', 'espessura_kit_mm', 'qnt_skus', 'tiragem', 'tipo_kit', 'com_shrink'],
    tipos:   ['varchar', 'varchar', 'varchar', 'text', 'varchar', 'varchar', 'int', 'int', 'varchar', 'varchar'],
  },
  prod_datas_iniciais: {
    colunas: ['filtro_producao', 'grafica', 'sku', 'dt_fim_aprove_arquivo', 'dt_envio_tiragem', 'dt_plan_inicio_imp'],
    tipos:   ['varchar', 'varchar', 'varchar', 'varchar', 'varchar', 'varchar'],
  },
};

// Ordem de gravação. Não há FKs entre as tabelas, mas mantemos a ordem lógica
// (componentes antes de Kits/Datas) caso alguma seja criada no futuro.
const ORDEM = ['prod_miolo', 'prod_capas', 'prod_encarte', 'prod_kits', 'prod_datas_iniciais'];

// Remove BOM/espaços do cabeçalho (o CSV é lido como ISO-8859-1, então um BOM UTF-8 vira "ï»¿").
const normalizarChave = (k) => String(k).replace(/^(﻿|ï»¿)/, '').trim().toUpperCase();

const texto = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

class ErroValidacao extends Error {}

/** "1.500" → 1500 | "1500,00" → 1500 | "" → null. Lança ErroValidacao se não for número. */
const inteiro = (v) => {
  const s = texto(v);
  if (s === null) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new ErroValidacao(`"${s}" não é um número`);
  return Math.round(n);
};

/** Aceita DD/MM/AA, DD/MM/AAAA ou AAAA-MM-DD e grava no padrão do banco: DD/MM/AA. */
const data = (v) => {
  const s = texto(v);
  if (s === null) return null;
  let d, m, a;
  let r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (r) [, d, m, a] = r;
  else if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})\b/))) [, a, m, d] = r;
  else throw new ErroValidacao(`"${s}" não é uma data válida (use DD/MM/AA)`);
  const ano = a.length === 2 ? 2000 + Number(a) : Number(a);
  const dt = new Date(Date.UTC(ano, Number(m) - 1, Number(d)));
  if (dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d)) {
    throw new ErroValidacao(`"${s}" não é uma data válida`);
  }
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${String(ano % 100).padStart(2, '0')}`;
};

/**
 * Agrupa registros pela chave. Uma mesma entidade (ex.: um Miolo) se repete em várias
 * linhas da planilha mestra, às vezes com células preenchidas só em uma delas — então
 * o primeiro valor não-nulo de cada campo vence.
 */
const acumular = (mapa, chave, registro) => {
  const atual = mapa.get(chave);
  if (!atual) { mapa.set(chave, registro); return; }
  for (const [campo, valor] of Object.entries(registro)) {
    if (atual[campo] === null && valor !== null) atual[campo] = valor;
  }
};

const chave = (...partes) => partes.map(p => String(p ?? '').toUpperCase()).join('|');

export async function POST(request) {
  let dados;
  try {
    ({ dados } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  if (!Array.isArray(dados) || dados.length === 0) {
    return NextResponse.json({ error: 'Nenhum dado recebido do CSV.' }, { status: 400 });
  }

  // 1. VALIDAÇÃO DO CABEÇALHO
  const cabecalho = new Set(Object.keys(dados[0]).map(normalizarChave));
  const faltando = COLUNAS_OBRIGATORIAS.filter(c => !cabecalho.has(c));
  if (faltando.length > 0) {
    return NextResponse.json(
      { error: `Arquivo incorreto: o cabeçalho não contém ${faltando.join(', ')}. Baixe o gabarito da Planilha Mestra.` },
      { status: 400 }
    );
  }

  // 2. SEPARAÇÃO, VALIDAÇÃO E DEDUPLICAÇÃO (em memória)
  const registros = Object.fromEntries(ORDEM.map(t => [t, new Map()]));
  const lotes = new Map(); // chave → { filtro, grafica }
  const erros = [];

  dados.forEach((linhaBruta, i) => {
    const linhaCsv = i + 2; // +1 do cabeçalho, +1 porque o Excel começa em 1
    const row = {};
    for (const [k, v] of Object.entries(linhaBruta || {})) row[normalizarChave(k)] = texto(v);

    // Linhas ";;;;;" que o Excel deixa no fim do arquivo.
    if (Object.values(row).every(v => v === null)) return;

    // Converte um campo, acumulando o erro com linha/coluna em vez de abortar na hora.
    const campo = (coluna, conversor = (v) => v) => {
      try {
        return conversor(row[coluna] ?? null);
      } catch (e) {
        if (!(e instanceof ErroValidacao)) throw e;
        erros.push(`Linha ${linhaCsv}, ${coluna}: ${e.message}`);
        return null;
      }
    };

    const filtro = row.FILTRO_PRODUCAO;
    const grafica = row.GRAFICA;
    if (!filtro || !grafica) {
      erros.push(`Linha ${linhaCsv}: FILTRO_PRODUCAO e GRAFICA são obrigatórios.`);
      return;
    }
    lotes.set(chave(filtro, grafica), { filtro, grafica });

    const skuMiolo = row.SKU_MIOLO;
    const skuCapa = row.SKU_CAPA;
    const idKit = row.ID_CODIGO_KIT;

    if (skuMiolo) {
      const descricaoMiolo = campo('DESCRICAO_MIOLO');
      const tiragemMiolo = campo('TIRAGEM_MIOLOS', inteiro);

      acumular(registros.prod_miolo, chave(filtro, grafica, skuMiolo), {
        filtro_producao: filtro, grafica, sku_miolo: skuMiolo,
        descricao: descricaoMiolo,
        tiragem: tiragemMiolo,
        lombada: campo('TAMANHO_LOMBADA'),
        paginacao: campo('PAGINACAO_MIOLO', inteiro),
        acabamento: campo('ACABAMENTO_LIVRO'),
      });

      const pagEncarte = campo('PAGINACAO_ENCARTE', inteiro);
      const pagAdesivo = campo('PAGINACAO_ADESIVO', inteiro);
      if (pagEncarte !== null || pagAdesivo !== null) {
        acumular(registros.prod_encarte, chave(filtro, grafica, skuMiolo), {
          filtro_producao: filtro, grafica, sku_miolo: skuMiolo,
          descricao: descricaoMiolo,
          tiragem: tiragemMiolo,
          paginacao_encarte: pagEncarte,
          corte_vinco_encarte: campo('CORTE_VINCO_ENCARTE'),
          paginacao_adesivo: pagAdesivo,
          corte_vinco_adesivo: campo('CORTE_VINCO_ADESIVO'),
        });
      }

      // prod_datas_iniciais.sku é o SKU do MIOLO (é assim que o Gantt e a Gestão de Lotes fazem o JOIN).
      const datas = {
        dt_fim_aprove_arquivo: campo('DT_FIM_APROVE_ARQUIVO', data),
        dt_envio_tiragem: campo('DT_ENVIO_TIRAGEM', data),
        dt_plan_inicio_imp: campo('DT_PLAN_INICIO_IMP', data),
      };
      if (Object.values(datas).some(v => v !== null)) {
        acumular(registros.prod_datas_iniciais, chave(filtro, grafica, skuMiolo), {
          filtro_producao: filtro, grafica, sku: skuMiolo, ...datas,
        });
      }
    }

    if (skuCapa) {
      acumular(registros.prod_capas, chave(filtro, grafica, skuCapa), {
        filtro_producao: filtro, grafica, sku_capa: skuCapa,
        descricao: campo('DESCRICAO_CAPA'),
        tiragem: campo('TIRAGEM_CAPA', inteiro),
        cores: campo('CORES_CAPA'),
        paginacao: campo('PAGINACAO_CAPA', inteiro),
        acabamento: campo('ACABAMENTO_LIVRO'),
        tamanho_lombada: campo('TAMANHO_LOMBADA'),
        sku_ref: skuMiolo, // a capa aponta para o miolo da mesma linha
        tipo_capa: campo('TIPO_CAPA'),
        beneficiamento: campo('BENEFICIAMENTO_CAPA'),
      });
    }

    if (idKit) {
      // Um Kit tem uma linha por capa em prod_kits (o Gantt monta os componentes assim),
      // por isso a capa faz parte da chave.
      acumular(registros.prod_kits, chave(filtro, grafica, idKit, skuCapa), {
        filtro_producao: filtro, grafica, id_codigo_kit: idKit,
        id_descricao_kit: campo('ID_DESCRICAO_KIT'),
        id_codigo_sku_capa: skuCapa,
        espessura_kit_mm: campo('ESPESSURA_KIT_MM'), // varchar no banco, ex.: "22,8"
        qnt_skus: campo('QNT_SKUS', inteiro),
        tiragem: campo('TIRAGEM_KIT', inteiro),
        tipo_kit: campo('TIPO_KIT'),
        com_shrink: campo('COM_SHRINK'),
      });
    }
  });

  if (erros.length > 0) {
    const MAX = 30;
    const lista = erros.slice(0, MAX).join('\n');
    const resto = erros.length > MAX ? `\n… e mais ${erros.length - MAX} erro(s).` : '';
    return NextResponse.json(
      { error: `A planilha tem ${erros.length} erro(s); nada foi gravado.\n${lista}${resto}`, erros },
      { status: 400 }
    );
  }

  if (lotes.size === 0) {
    return NextResponse.json({ error: 'Nenhuma linha com FILTRO_PRODUCAO encontrada no CSV.' }, { status: 400 });
  }

  // 3. GRAVAÇÃO (tudo ou nada)
  const lotesArr = [...lotes.values()];
  const filtrosUp = lotesArr.map(l => l.filtro.toUpperCase());
  const graficasUp = lotesArr.map(l => l.grafica.toUpperCase());
  let tabelaAtual = null;

  try {
    const resumo = await comTransacao(async (client) => {
      const removidos = {};
      const inseridos = {};

      // 3.1 Apaga os lotes (filtro + gráfica) que vieram na planilha.
      //     Re-importar também zera o ajuste manual do Gantt (dt_calculo/fases_overrides)
      //     desses SKUs: a planilha nova passa a mandar no início do Gantt.
      for (const tabela of ORDEM) {
        tabelaAtual = tabela;
        const { rowCount } = await client.query(
          `DELETE FROM ${tabela} AS t
            USING UNNEST($1::text[], $2::text[]) AS l(filtro, grafica)
            WHERE UPPER(TRIM(t.filtro_producao)) = l.filtro
              AND UPPER(TRIM(t.grafica)) = l.grafica`,
          [filtrosUp, graficasUp]
        );
        removidos[tabela] = rowCount;
      }

      // 3.2 Um INSERT por tabela.
      for (const tabela of ORDEM) {
        tabelaAtual = tabela;
        const linhas = [...registros[tabela].values()];
        inseridos[tabela] = linhas.length;
        if (linhas.length === 0) continue;

        const { colunas, tipos } = TABELAS[tabela];
        const arrays = colunas.map(c => linhas.map(l => l[c] ?? null));
        const params = tipos.map((tipo, i) => `$${i + 1}::${tipo}[]`).join(', ');
        await client.query(
          `INSERT INTO ${tabela} (${colunas.join(', ')}) SELECT * FROM UNNEST(${params})`,
          arrays
        );
      }
      tabelaAtual = null;
      return { removidos, inseridos };
    });

    const { inseridos } = resumo;
    return NextResponse.json({
      message: `Planilha Mestra importada: ${lotes.size} lote(s) — ${inseridos.prod_miolo} miolo(s), ${inseridos.prod_capas} capa(s), ${inseridos.prod_encarte} encarte(s), ${inseridos.prod_kits} kit(s), ${inseridos.prod_datas_iniciais} data(s).`,
      ...resumo,
    }, { status: 201 });
  } catch (erro) {
    // Erros do Postgres trazem coluna/detalhe/constraint — devolvemos tudo para facilitar o debug.
    const detalhes = [
      tabelaAtual && `tabela ${tabelaAtual}`,
      erro.column && `coluna ${erro.column}`,
      erro.constraint && `constraint ${erro.constraint}`,
      erro.detail,
      erro.where,
    ].filter(Boolean).join(' | ');
    console.error('[importacao] Falha ao gravar:', { tabela: tabelaAtual, code: erro.code, message: erro.message, detail: erro.detail, column: erro.column });
    return NextResponse.json(
      { error: `Falha na gravação (nada foi salvo): ${erro.message}${detalhes ? ` — ${detalhes}` : ''}`, tabela: tabelaAtual, codigo: erro.code },
      { status: 500 }
    );
  }
}
