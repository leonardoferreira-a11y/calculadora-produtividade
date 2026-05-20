import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { sku_miolo, filtro_producao, grafica, dados_calculo } = body;

    if (!sku_miolo || !filtro_producao || !grafica) {
      return NextResponse.json({ message: "Dados incompletos para salvar." }, { status: 400 });
    }

    const sku_limpo = String(sku_miolo).trim();
    const filtro_limpo = String(filtro_producao).trim();
    const grafica_limpa = String(grafica).trim();

    // 1. SALVAMENTO DO JSON GLOBAL (os_calculos)
    if (dados_calculo === null) {
      await pool.query(
        `DELETE FROM os_calculos WHERE UPPER(TRIM(sku_miolo)) = UPPER($1) AND UPPER(TRIM(filtro_producao)) = UPPER($2) AND UPPER(TRIM(grafica)) = UPPER($3)`,
        [sku_limpo, filtro_limpo, grafica_limpa]
      );
      await pool.query(
        `DELETE FROM gantt_tarefas WHERE UPPER(TRIM(sku_alvo)) = UPPER($1) AND UPPER(TRIM(filtro_producao)) = UPPER($2) AND UPPER(TRIM(grafica)) = UPPER($3)`,
        [sku_limpo, filtro_limpo, grafica_limpa]
      );
      return NextResponse.json({ message: "Apagado com sucesso" }, { status: 200 });
    } else {
      const check = await pool.query(
        `SELECT id FROM os_calculos WHERE UPPER(TRIM(sku_miolo)) = UPPER($1) AND UPPER(TRIM(filtro_producao)) = UPPER($2) AND UPPER(TRIM(grafica)) = UPPER($3)`,
        [sku_limpo, filtro_limpo, grafica_limpa]
      );
      if (check.rows.length > 0) {
        await pool.query(`UPDATE os_calculos SET dados_calculo = $1, data_calculo = CURRENT_TIMESTAMP WHERE id = $2`, [JSON.stringify(dados_calculo), check.rows[0].id]);
      } else {
        await pool.query(`INSERT INTO os_calculos (sku_miolo, filtro_producao, grafica, dados_calculo) VALUES ($1, $2, $3, $4)`, [sku_limpo, filtro_limpo, grafica_limpa, JSON.stringify(dados_calculo)]);
      }
    }

    // 2. MOTOR DE SINCRONIZAÇÃO COMPLETO COM TODAS AS FASES
    await pool.query(
      `DELETE FROM gantt_tarefas WHERE UPPER(TRIM(sku_alvo)) = UPPER($1) AND UPPER(TRIM(filtro_producao)) = UPPER($2) AND UPPER(TRIM(grafica)) = UPPER($3)`,
      [sku_limpo, filtro_limpo, grafica_limpa]
    );

    const mapaEtapas = [
      { chaves: ['impressao', 'impressao_miolo', 'impressaoPlana'], nome: 'Impressão', idStr: 'IMP' },
      { chaves: ['impressao_capa'], nome: 'Impressão Capa', idStr: 'IMP_CAPA' },
      { chaves: ['beneficiamento_capa', 'beneficiamento', 'laminacao'], nome: 'Beneficiamento', idStr: 'BENEF' },
      { chaves: ['corte', 'corte_vinco', 'corte_e_vinco', 'corteVinco'], nome: 'Corte e Vinco', idStr: 'CORTE' },
      { chaves: ['dobra', 'dobra_miolo'], nome: 'Dobra', idStr: 'DOB' },
      { chaves: ['cola', 'lombada', 'colagem', 'hotmelt'], nome: 'Lombada / Cola', idStr: 'COLA' },
      { chaves: ['alceadeira', 'alceamento'], nome: 'Alceadeira', idStr: 'ALC' }, 
      { chaves: ['grampo', 'canoa'], nome: 'Grampo / Canoa', idStr: 'GRA' },
      { chaves: ['shrink', 'plastificacao', 'shrinkEmbalagem'], nome: 'Shrink', idStr: 'SHRINK' },
      { chaves: ['encaixotamento', 'caixa', 'fechamento_caixa'], nome: 'Encaixotamento', idStr: 'BOX' }
    ];

    const caminhosDefensivos = {
      'BENEF': ['IMP_CAPA', 'IMP'],
      'CORTE': ['IMP'],
      'DOB': ['IMP'],
      'COLA': ['DOB', 'IMP'],
      'FURO': ['COLA', 'DOB', 'IMP'],
      'ESP': ['FURO', 'COLA', 'ALC', 'DOB', 'IMP'],
      'ALC': ['DOB', 'IMP'],
      'GRA': ['DOB', 'IMP'],
      'SHRINK': ['ESP', 'GRA', 'COLA', 'ALC', 'DOB', 'IMP'],
      'BOX': ['SHRINK', 'ESP', 'GRA', 'COLA', 'ALC', 'DOB', 'IMP']
    };

    const timeToDecimal = (timeStr) => {
      if (!timeStr || timeStr === 'Pend.' || timeStr === '-' || timeStr.includes('Automática')) return 0;
      let d = 0, h = 0, m = 0;
      const strLow = String(timeStr).toLowerCase();
      if (strLow.includes('dia')) {
        const parts = strLow.split('+');
        d = parseInt(parts[0]) || 0;
        const hm = (parts[1] || '').trim().split(':');
        h = parseInt(hm[0]) || 0;
        m = parseInt(hm[1]) || 0;
      } else {
        const hm = strLow.split(':');
        h = parseInt(hm[0]) || 0;
        m = parseInt(hm[1]) || 0;
      }
      return (d * 24) + h + (m / 60);
    };

    const etapasSalvasNestaRodada = {};

    // 2.1 Processamento Padrão de Chaves Simples
    for (const etapa of mapaEtapas) {
      const chaveEncontrada = Object.keys(dados_calculo).find(chaveDoJson => 
        etapa.chaves.some(chaveDoMapa => chaveDoJson.toLowerCase().includes(chaveDoMapa.toLowerCase()))
      );
      
      if (chaveEncontrada) {
        const dadosDaChave = dados_calculo[chaveEncontrada];
        const tempoBruto = dadosDaChave?.resultado?.totais?.total || dadosDaChave?.tempo_total || dadosDaChave?.tempo || '00:00';
        const tempoHoras = timeToDecimal(tempoBruto);
        
        if (tempoHoras > 0) {
          etapasSalvasNestaRodada[etapa.idStr] = {
            id: `${sku_limpo}_${etapa.idStr}`,
            nome: etapa.nome,
            horas: tempoHoras,
            maquina: String(dadosDaChave.maquina_id || 'MANUAL').trim()
          };
        }
      }
    }

    // 🔴 2.2 DESMEMBRAMENTO DO NÓ MÚLTIPLO: ESPIRAL (Que contém Furação junto!)
    if (dados_calculo.espiral && dados_calculo.espiral.resultado) {
      const resEspir = dados_calculo.espiral.resultado.totais || {};
      
      // 2.2.1 Extraindo e Salvando Furação Independente
      const tempoFuro = timeToDecimal(resEspir.furacao || '00:00');
      if (tempoFuro > 0) {
        etapasSalvasNestaRodada['FURO'] = {
          id: `${sku_limpo}_FURO`,
          nome: 'Furação',
          horas: tempoFuro,
          maquina: String(dados_calculo.espiral.maquina_furacao_id || 'MANUAL').trim()
        };
      }

      // 2.2.2 Extraindo e Salvando Espiralação Independente
      const tempoEspiral = timeToDecimal(resEspir.espiral || '00:00');
      if (tempoEspiral > 0) {
        etapasSalvasNestaRodada['ESP'] = {
          id: `${sku_limpo}_ESP`,
          nome: 'Espiralação',
          horas: tempoEspiral,
          maquina: String(dados_calculo.espiral.maquina_espiral_id || 'MANUAL').trim()
        };
      }
    }

    for (const idStr of Object.keys(etapasSalvasNestaRodada)) {
      const info = extrairNoCascata(idStr, etapasSalvasNestaRodada, caminhosDefensivos, sku_limpo);
      await pool.query(
        `INSERT INTO gantt_tarefas (id, sku_alvo, filtro_producao, grafica, nome_etapa, maquina_id, tempo_estimado_horas, id_dependencia)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [info.id, sku_limpo, filtro_limpo, grafica_limpa, info.nome, info.maquina, info.horas, info.idDep]
      );
    }

    return NextResponse.json({ message: "Sincronizado com sucesso!" }, { status: 200 });
  } catch (error) {
    console.error("❌ ERRO NO SALVAMENTO DO GANTT:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

function extrairNoCascata(idStr, criadas, caminhos, sku) {
  const t = criadas[idStr];
  let idDep = null;
  const rotasAlternativas = caminhos[idStr];
  if (rotasAlternativas) {
    const paiEncontrado = rotasAlternativas.find(p => criadas[p]);
    if (paiEncontrado) idDep = `${sku}_${paiEncontrado}`;
  }
  return { id: t.id, nome: t.nome, maquina: t.maquina, horas: t.horas, idDep };
}