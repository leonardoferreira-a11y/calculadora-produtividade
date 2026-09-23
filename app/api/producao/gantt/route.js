import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

// 🔴 AUXILIAR: Transforma "04:00" em 4.0 horas decimais
const timeToDecimal = (timeStr) => {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const hm = timeStr.split(':');
  return parseInt(hm[0]) + (parseInt(hm[1]) / 60);
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { grafica, simuladores = {}, prioridades = [], lotesVisiveis = [] } = body;

    if (!grafica) return NextResponse.json({ message: "Gráfica é obrigatória." }, { status: 400 });

    const resMaquinas = await pool.query(`SELECT * FROM maquinas WHERE UPPER(TRIM(grafica)) = UPPER(TRIM($1))`, [grafica]);
    const maquinasReais = resMaquinas.rows;

    const resTarefas = await pool.query(
      `SELECT t.id, t.sku_alvo, t.filtro_producao, t.grafica, t.nome_etapa, t.maquina_id,
              t.tempo_estimado_horas, t.id_dependencia, t.status_tarefa,
              m.tipo AS maq_tipo, m.modelo AS maq_modelo,
              COALESCE(m.dias_trabalho, 5) AS dias_trabalho,
              COALESCE(m.horas_diarias, 24) AS horas_diarias,
              COALESCE(m.maquinas, 1) AS total_maquinas_parque,
              COALESCE(m.pessoas, 1) AS total_pessoas_parque,
              COALESCE(d.fases_overrides, '{}')::text AS fases_overrides,
              pm.tiragem AS pm_tiragem,
              pm.paginacao AS pm_paginacao,
              pm.acabamento AS pm_acabamento,
              CASE
                WHEN NULLIF(d.dt_calculo, '') IS NOT NULL THEN
                  CASE
                    WHEN d.dt_calculo LIKE '%/%' THEN to_timestamp(d.dt_calculo, 'DD/MM/YY HH24:MI')
                    ELSE d.dt_calculo::timestamp
                  END
                ELSE CURRENT_TIMESTAMP
              END AS ideal_inicio
       FROM gantt_tarefas t
       LEFT JOIN maquinas m ON TRIM(t.maquina_id) = TRIM(m.id::text)
       LEFT JOIN prod_datas_iniciais d
         ON UPPER(TRIM(t.sku_alvo)) = UPPER(TRIM(d.sku))
        AND UPPER(TRIM(t.filtro_producao)) = UPPER(TRIM(d.filtro_producao))
        AND UPPER(TRIM(t.grafica)) = UPPER(TRIM(d.grafica))
       LEFT JOIN prod_miolo pm
         ON UPPER(TRIM(t.sku_alvo)) = UPPER(TRIM(pm.sku_miolo))
        AND UPPER(TRIM(t.filtro_producao)) = UPPER(TRIM(pm.filtro_producao))
        AND UPPER(TRIM(t.grafica)) = UPPER(TRIM(pm.grafica))
       WHERE UPPER(TRIM(t.grafica)) = UPPER(TRIM($1))
         AND (t.status_producao IS NULL OR UPPER(TRIM(t.status_producao)) NOT IN ('PRODUZIDA', 'CANCELADA'))`,
      [grafica]
    );

    const resTravas = await pool.query(
      `SELECT maquina_id, data_alvo::text AS data_alvo, status_operacional, horas_disponiveis 
       FROM gantt_calendario_trava 
       WHERE UPPER(TRIM(grafica)) = UPPER(TRIM($1))`, 
      [grafica]
    );

    const travasBD = resTravas.rows;
    const tarefasResolvidas = [];
    const controleMaquinasFim = {}; 
    const ultimaAtividadeMaquina = {}; 
    const UPPER_CASE = (str) => String(str || '').toUpperCase().trim();

    // 🔴 GERADOR DE KITS: Busca e injeta na fila principal ANTES do cálculo!
    const resKitsTop = await pool.query(
      `SELECT kc.id_codigo_kit, kc.dados_calculo,
              pk.id_codigo_sku_capa, pk.filtro_producao AS kit_filtro,
              pk.grafica AS kit_grafica,
              pc.sku_ref AS sku_miolo
       FROM kit_calculos kc
       JOIN prod_kits pk
         ON UPPER(TRIM(kc.id_codigo_kit)) = UPPER(TRIM(pk.id_codigo_kit))
        AND UPPER(TRIM(kc.filtro_producao)) = UPPER(TRIM(pk.filtro_producao))
        AND UPPER(TRIM(kc.grafica)) = UPPER(TRIM(pk.grafica))
       LEFT JOIN prod_capas pc
         ON UPPER(TRIM(pk.id_codigo_sku_capa)) = UPPER(TRIM(pc.sku_capa))
        AND UPPER(TRIM(pk.filtro_producao)) = UPPER(TRIM(pc.filtro_producao))
        AND UPPER(TRIM(pk.grafica)) = UPPER(TRIM(pc.grafica))
       WHERE UPPER(TRIM(kc.grafica)) = UPPER(TRIM($1))
         AND kc.dados_calculo IS NOT NULL`,
      [grafica]
    );

    const mapaComponentesKit = new Map(); // key: "${KIT_SKU_UPPER}_${FILTRO_UPPER}"
    const kitsToGenerate = new Map();
    const kitIdMap = new Map(); // Mapeia ID_CODIGO_KIT -> ID_CODIGO_KIT (normalizado)

    resKitsTop.rows.forEach(r => {
        const kitIdNormal = UPPER_CASE(r.id_codigo_kit);
        const kitFiltroNormal = UPPER_CASE(r.kit_filtro);
        const key = `${kitIdNormal}_${kitFiltroNormal}`;

        if (!mapaComponentesKit.has(key)) mapaComponentesKit.set(key, []);
        mapaComponentesKit.get(key).push(UPPER_CASE(r.id_codigo_sku_capa));
        // O Kit é ligado ao seu SKU de Miolo via prod_capas.sku_ref (capa -> miolo),
        // não pelo id_codigo_kit. Sem isso, o Kit nunca esperava a produção do Miolo.
        if (r.sku_miolo) mapaComponentesKit.get(key).push(UPPER_CASE(r.sku_miolo));

        if (!kitsToGenerate.has(key)) {
            let dc = {};
            try { dc = typeof r.dados_calculo === 'string' ? JSON.parse(r.dados_calculo) : (r.dados_calculo || {}); } catch(e) {}
            kitsToGenerate.set(key, {
                id: r.id_codigo_kit,
                id_norm: kitIdNormal,
                filtro: r.kit_filtro,
                filtro_norm: kitFiltroNormal,
                grafica: r.kit_grafica,
                dc,
                skus: mapaComponentesKit.get(key)
            });
        }
    });

    // Formatos aceitos: "HH:MM" ou "N dia(s) + HH:MM" (ex: "1 dia + 11:48")
    const horasDeString = (str) => {
      if (!str) return 0.016; 
      const s = String(str).trim();
      let horas = 0;
      const diaMatch = s.match(/(\d+)\s*dia/i);
      if (diaMatch) horas += parseInt(diaMatch[1]) * 24;
      const hmMatch = s.match(/(\d+):(\d+)/);
      if (hmMatch) {
          horas += parseInt(hmMatch[1]) + (parseInt(hmMatch[2]) / 60);
      } else if (!diaMatch && !isNaN(parseFloat(s))) {
          horas += parseFloat(s);
      }
      return horas > 0 ? horas : 0.016; // Nunca retorna zero, impede a tarefa de sumir
    };

    // Injeta as tarefas de Kit Virtuais na Esteira Principal
    for (const [, kit] of kitsToGenerate) {
        const dc = kit.dc;
        let shrinkId = null;

        if (dc.shrink?.maquina_id && !dc.shrink?.resultado) {
            console.warn(`[KIT-DEBUG] Kit ${kit.id_norm} (${kit.filtro_norm}): shrink.maquina_id definido mas shrink.resultado ausente — tarefa de Shrink NÃO injetada.`);
        }
        if (dc.shrink?.maquina_id && dc.shrink?.resultado) {
            const horas = horasDeString(dc.shrink.resultado.totais?.total);
            if (horas <= 0) {
                console.warn(`[KIT-DEBUG] Kit ${kit.id_norm} (${kit.filtro_norm}): shrink com 0h (totais.total="${dc.shrink.resultado.totais?.total}") — tarefa de Shrink NÃO injetada.`);
            }
            if (horas > 0) {
                const filtroSanitizado = String(kit.filtro_norm || 'S/ LOTE').replace(/[^a-zA-Z0-9_-]/g, '_');
                shrinkId = `kit-${kit.id_norm}-${filtroSanitizado}-Shrink`;
                const mqData = maquinasReais.find(m => String(m.id) === String(dc.shrink.maquina_id)) || {};
                resTarefas.rows.push({
                    id: shrinkId,
                    sku_alvo: kit.id_norm,
                    filtro_producao: kit.filtro_norm || 'S/ LOTE',
                    grafica: kit.grafica,
                    nome_etapa: 'Shrink',
                    maquina_id: String(dc.shrink.maquina_id),
                    tempo_estimado_horas: horas,
                    id_dependencia: null,
                    status_tarefa: 'Pendente',
                    maq_tipo: mqData.tipo || 'Shrink',
                    maq_modelo: mqData.modelo || 'Shrink',
                    dias_trabalho: mqData.dias_trabalho || 5,
                    horas_diarias: mqData.horas_diarias || 24,
                    total_maquinas_parque: mqData.maquinas || 1,
                    total_pessoas_parque: mqData.pessoas || 1,
                    fases_overrides: '{}',
                    pm_tiragem: 'Kit',
                    pm_paginacao: 'Kit',
                    pm_acabamento: 'Shrink',
                    ideal_inicio: new Date().toISOString(),
                    kit_skus_custom: kit.skus,
                    kit_filtro_original: kit.filtro_norm,
                    _isVirtual: true,
                    _isKit: true
                });
            }
        }

        if (dc.encaixotamento?.maquina_id && !dc.encaixotamento?.resultado) {
            console.warn(`[KIT-DEBUG] Kit ${kit.id_norm} (${kit.filtro_norm}): encaixotamento.maquina_id definido mas encaixotamento.resultado ausente — tarefa de Encaixotamento NÃO injetada.`);
        }
        if (dc.encaixotamento?.maquina_id && dc.encaixotamento?.resultado) {
            const horas = horasDeString(dc.encaixotamento.resultado.totais?.total);
            if (horas <= 0) {
                console.warn(`[KIT-DEBUG] Kit ${kit.id_norm} (${kit.filtro_norm}): encaixotamento com 0h (totais.total="${dc.encaixotamento.resultado.totais?.total}") — tarefa de Encaixotamento NÃO injetada.`);
            }
            if (horas > 0) {
                const filtroSanitizado = String(kit.filtro_norm || 'S/ LOTE').replace(/[^a-zA-Z0-9_-]/g, '_');
                const mqData = maquinasReais.find(m => String(m.id) === String(dc.encaixotamento.maquina_id)) || {};
                resTarefas.rows.push({
                    id: `kit-${kit.id_norm}-${filtroSanitizado}-Encaixotamento`,
                    sku_alvo: kit.id_norm,
                    filtro_producao: kit.filtro_norm || 'S/ LOTE',
                    grafica: kit.grafica,
                    nome_etapa: 'Encaixotamento',
                    maquina_id: String(dc.encaixotamento.maquina_id),
                    tempo_estimado_horas: horas,
                    id_dependencia: shrinkId,
                    status_tarefa: 'Pendente',
                    maq_tipo: mqData.tipo || 'Encaixotamento',
                    maq_modelo: mqData.modelo || 'Encaixotamento',
                    dias_trabalho: mqData.dias_trabalho || 5,
                    horas_diarias: mqData.horas_diarias || 24,
                    total_maquinas_parque: mqData.maquinas || 1,
                    total_pessoas_parque: mqData.pessoas || 1,
                    fases_overrides: '{}',
                    pm_tiragem: 'Kit',
                    pm_paginacao: 'Kit',
                    pm_acabamento: 'Encaixotamento',
                    ideal_inicio: new Date().toISOString(),
                    kit_skus_custom: kit.skus,
                    kit_filtro_original: kit.filtro_norm,
                    _isVirtual: true,
                    _isKit: true
                });
            }
        }
    }

    const travasMap = new Map();
    travasBD.forEach(t => {
      const dataStr = t.data_alvo.substring(0, 10);
      travasMap.set(`${UPPER_CASE(t.maquina_id)}_${dataStr}`, t);
    });

    const resolvidasMap = new Map();
    const resolvidasPorSku = new Map();
    const indefinitasPorSku = new Map();
    const indefinitasById = new Map();

    // Cola e Alceamento na mesma máquina são a MESMA passada física (linha PUR: alceia e cola
    // em um único ciclo) — a calculadora reporta o mesmo total sob as duas chaves do JSON.
    // Mantém a tarefa de Cola (tempo real) e descarta a duplicata de Alceamento, em vez de
    // zerar o tempo de uma delas (isso escondia o tempo real calculado no gantt).
    const resTarefasSemDuplicataAlceamento = resTarefas.rows.filter(t => {
        const nomeE = String(t.nome_etapa).toLowerCase();
        if (!nomeE.includes('alcead')) return true;
        const duplicataDeCola = resTarefas.rows.some(other =>
            String(other.sku_alvo).toUpperCase().trim() === String(t.sku_alvo).toUpperCase().trim() &&
            String(other.nome_etapa).toLowerCase().includes('cola') &&
            !String(other.nome_etapa).toLowerCase().includes('alcead') &&
            String(other.maquina_id) === String(t.maquina_id)
        );
        return !duplicataDeCola;
    });

    let indefinitas = resTarefasSemDuplicataAlceamento.map(t => {
        const nomeE = String(t.nome_etapa).toLowerCase();
        const maqT = String(t.maq_tipo).toLowerCase();
        const maqM = String(t.maq_modelo).toLowerCase();

        return {
            ...t,
            tempo_estimado_horas: Number(t.tempo_estimado_horas),
            _skuUp: UPPER_CASE(t.sku_alvo),
            _idUp: UPPER_CASE(t.id),
            _depUp: t.id_dependencia ? UPPER_CASE(t.id_dependencia) : null,
            _isFura: nomeE.includes('fura'),
            _isAlc: nomeE.includes('alcead') || nomeE.includes('cola'),
            _isEspiral: nomeE.includes('espiral'),
            _isDobra: nomeE.includes('dobra') || maqT.includes('dobra'),
            _isImp: nomeE.includes('impress') || maqT.includes('impress'),
            _isPUR: maqT.toUpperCase().includes('PUR') || maqM.toUpperCase().includes('PUR') || maqT.toUpperCase().includes('COLADEIRA'),
            _isKit: nomeE.includes('encaixot') || nomeE.includes('shrink') || nomeE.includes('kit') || nomeE.includes('box'),
            _isManualEspiral: nomeE.includes('espiral') && (
                maqT.includes('manual') || maqM.includes('manual') ||
                (!maqT.includes('auto') && !maqT.includes('semi') && !maqM.includes('auto') && !maqM.includes('semi'))
            ),
            _kitSkus: t.kit_skus_custom || [],
            _kitFiltroOriginal: t.kit_filtro_original,
            _isVirtual: t._isVirtual || false
        };
    });

    indefinitas = indefinitas.map(t => {
      let overrides = {};
      try { overrides = typeof t.fases_overrides === 'string' ? JSON.parse(t.fases_overrides) : (t.fases_overrides || {}); } catch(e) {}
      const overrideVal = overrides[t.nome_etapa];
      if (overrideVal) {
        const overrideDate = new Date(overrideVal);
        const baseDate = new Date(t.ideal_inicio);
        return { ...t, ideal_inicio: overrideDate, is_antecipacao: overrideDate < baseDate };
      }
      return t;
    });

    // Filtra pelos lotes visíveis, mas IGNORA O FILTRO se for uma tarefa Virtual do Kit
    if (lotesVisiveis.length > 0) {
      const visiveisUp = new Set(lotesVisiveis.map(l => UPPER_CASE(l)));
      indefinitas = indefinitas.filter(t => t._isVirtual || visiveisUp.has(UPPER_CASE(t.filtro_producao)));
    }

    const prioridadeMap = new Map();
    prioridades.forEach((lote, idx) => prioridadeMap.set(UPPER_CASE(lote), idx));
    const getPrioridade = (filtro) => {
      const p = prioridadeMap.get(UPPER_CASE(filtro));
      return p !== undefined ? p : 99999;
    };

    indefinitas.forEach(t => {
      if (!indefinitasPorSku.has(t._skuUp)) indefinitasPorSku.set(t._skuUp, []);
      indefinitasPorSku.get(t._skuUp).push(t);
      indefinitasById.set(t._idUp, t);
    });

    const formataAbsoluto = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
    };

    const alinharProximoTurnoValido = (data, diasTrabalho, horasDiarias, maquinaId = null) => {
      let r = new Date(data);
      let limiteSafety = 365;
      while (limiteSafety > 0) {
        limiteSafety--;
        const diaSemana = r.getUTCDay();
        if (Number(diasTrabalho) === 5 && (diaSemana === 0 || diaSemana === 6)) {
          r.setUTCDate(r.getUTCDate() + (diaSemana === 6 ? 2 : 1));
          r.setUTCHours(0, 0, 0, 0); continue;
        }
        if (Number(diasTrabalho) === 6 && diaSemana === 0) {
          r.setUTCDate(r.getUTCDate() + 1);
          r.setUTCHours(0, 0, 0, 0); continue;
        }
        if (maquinaId) {
          const ano = r.getUTCFullYear();
          const mes = String(r.getUTCMonth() + 1).padStart(2, '0');
          const dia = String(r.getUTCDate()).padStart(2, '0');
          
          const travaGlobal = travasMap.get(`TODAS_${ano}-${mes}-${dia}`);
          const travaEspec = travasMap.get(`${UPPER_CASE(maquinaId)}_${ano}-${mes}-${dia}`);
          const trava = travaEspec || travaGlobal; 

          if (trava && trava.status_operacional === 'INATIVO') {
            r.setUTCDate(r.getUTCDate() + 1);
            r.setUTCHours(0, 0, 0, 0); continue;
          }
        }
        const horaAtualDecimal = r.getUTCHours() + (r.getUTCMinutes() / 60);
        if (horaAtualDecimal >= Number(horasDiarias)) {
          r.setUTCDate(r.getUTCDate() + 1);
          r.setUTCHours(0, 0, 0, 0); continue;
        }
        break;
      }
      return r;
    };

    const simularJanelaDeTrabalho = (dataInicioStr, horasNecessarias, maquinaId, diasTrabalhoBase, horasDiariasBase) => {
      let relogio = alinharProximoTurnoValido(dataInicioStr, diasTrabalhoBase, horasDiariasBase, maquinaId);
      let horasFaltantes = Number(horasNecessarias);
      let dataInicioEfetivo = new Date(relogio);
      let horasIndisponiveisRegra = 0;
      let limiteLoops = 1500; 

      while (horasFaltantes > 0 && limiteLoops > 0) {
        limiteLoops--;
        let relogioAntes = new Date(relogio);
        relogio = alinharProximoTurnoValido(relogio, diasTrabalhoBase, horasDiariasBase, maquinaId);
        
        if (relogio.getTime() > relogioAntes.getTime()) horasIndisponiveisRegra += (relogio.getTime() - relogioAntes.getTime()) / (1000 * 60 * 60);

        const ano = relogio.getUTCFullYear();
        const mes = String(relogio.getUTCMonth() + 1).padStart(2, '0');
        const dia = String(relogio.getUTCDate()).padStart(2, '0');
        const dataAlvoStr = `${ano}-${mes}-${dia}`;

        const travaGlobal = travasMap.get(`TODAS_${dataAlvoStr}`);
        const travaEspec = travasMap.get(`${UPPER_CASE(maquinaId)}_${dataAlvoStr}`);
        const travaHoje = travaEspec || travaGlobal;

        let capacityHoje = Number(horasDiariasBase || 24);

        if (travaHoje) {
          if (travaHoje.status_operacional === 'INATIVO') capacityHoje = 0;
          else capacityHoje = Number(travaHoje.horas_disponiveis);
        }

        const fimTurno = capacityHoje;
        const horasNoMomento = relogio.getUTCHours() + (relogio.getUTCMinutes() / 60) + (relogio.getUTCSeconds() / 3600);
        const capacidadeRestanteHoje = Math.max(0, fimTurno - horasNoMomento);

        if (capacidadeRestanteHoje >= horasFaltantes) {
          const horasFinais = horasNoMomento + horasFaltantes;
          const h = Math.floor(horasFinais);
          const m = Math.floor((horasFinais - h) * 60);
          const s = Math.round((((horasFinais - h) * 60) - m) * 60);
          relogio.setUTCHours(h, m, s, 0);
          horasFaltantes = 0;
        } else {
          horasFaltantes -= capacidadeRestanteHoje;
          horasIndisponiveisRegra += (24 - capacityHoje);
          relogio.setUTCDate(relogio.getUTCDate() + 1);
          relogio.setUTCHours(0, 0, 0, 0);
        }
      }
      return { inicio: dataInicioEfetivo, fim: relogio, horasIndisponiveisRegra };
    };

    let travaSeguranca = indefinitas.length * 6;
    let loopContador = 0;

    while (indefinitas.length > 0 && travaSeguranca > 0) {
      travaSeguranca--;
      loopContador++;

      if (loopContador % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      let candidatosAptos = [];

      for (const t of indefinitas) {
        let tempoProntidaoTecnica = new Date(t.ideal_inicio);
        let prontoParaAgendar = true;
        let pai = null;
        let delayCuraMs = 0;
        const nomeE = String(t.nome_etapa).toLowerCase();

        if (t._depUp) {
          pai = resolvidasMap.get(t._depUp);
          if (!pai) {
            const idDepLower = t._depUp.toLowerCase();
            let termoBusca = idDepLower.includes('imp') ? 'impressão' : 
                             idDepLower.includes('dob') ? 'dobra' : 
                             idDepLower.includes('col') ? 'cola' : 
                             idDepLower.includes('empast') ? 'empast' : 
                             idDepLower.includes('bene') ? 'benefic' : '';
            if (termoBusca) {
              const skuTasks = resolvidasPorSku.get(t._skuUp) || [];
              pai = skuTasks.find(r => r.nome_etapa.toLowerCase().includes(termoBusca));
            }
          }
        }

        if (!pai && (nomeE.includes('capa') || nomeE.includes('encarte') || nomeE.includes('adesivo')) && nomeE.includes('impress')) {
          const skuResolvidas = resolvidasPorSku.get(t._skuUp) || [];
          const mioloResolvido = skuResolvidas.find(r => String(r.nome_etapa).toLowerCase() === 'impressão');
          
          if (mioloResolvido) {
             const inicioMiolo = new Date(mioloResolvido.data_inicio);
             if (inicioMiolo > tempoProntidaoTecnica) {
                 tempoProntidaoTecnica = inicioMiolo;
             }
          } else {
             const skuIndef = indefinitasPorSku.get(t._skuUp) || [];
             if (skuIndef.some(r => String(r.nome_etapa).toLowerCase() === 'impressão')) {
                 prontoParaAgendar = false;
             }
          }
        }

        if (t._isFura) {
          const skuResolvidas = resolvidasPorSku.get(t._skuUp) || [];
          const alcResolvida = skuResolvidas.find(r => r._isAlc);
          if (alcResolvida) {
            if (!pai || new Date(alcResolvida.data_fim) > new Date(pai.data_fim)) pai = alcResolvida;
          } else {
            const skuIndef = indefinitasPorSku.get(t._skuUp) || [];
            if (skuIndef.some(r => r._isAlc)) prontoParaAgendar = false;
          }
        }

        // 🔴 KITS BLINDADOS: Amarração inteligente com Fallback Salvador e Correção Temporal!
        if (t._isKit) {
            const GET_LOTE = (val) => {
                let s = UPPER_CASE(val);
                return (!s || s === 'S/ LOTE') ? 'S/ LOTE' : s;
            };

            let loteAlvo = GET_LOTE(t._kitFiltroOriginal !== undefined ? t._kitFiltroOriginal : t.filtro_producao);
            let chaveMapaKit = `${t._skuUp}_${loteAlvo}`;
            let baseComp = t._kitSkus && t._kitSkus.length > 0 ? t._kitSkus : (mapaComponentesKit.get(chaveMapaKit) || []);

            if (baseComp.length === 0) {
                for (const [chave, comp] of mapaComponentesKit) {
                    if (chave.startsWith(`${t._skuUp}_`)) {
                        baseComp = comp;
                        break;
                    }
                }
            }

            let componentes = Array.from(new Set([...baseComp, t._skuUp]));

            if (componentes.length > 0) {
                let todosResolvidos = true;
                let maxFimComponentes = tempoProntidaoTecnica;
                let precisaCura = false;

                let allCompIndef = [];
                let allCompRes = [];

                for (const compSku of componentes) {
                    const tarefasDoComp = resolvidasPorSku.get(compSku) || [];
                    const compIndef = indefinitasPorSku.get(compSku) || [];

                    // Ignora as tarefas virtuais de Kit (Shrink/Caixa) para não herdar delays
                    let cIndef = compIndef.filter(r => r.id !== t.id && !r._isKit);
                    let cRes = tarefasDoComp.filter(r => r.id !== t.id && !r._isKit);

                    let cIndefNoLote = cIndef.filter(r => GET_LOTE(r._kitFiltroOriginal !== undefined ? r._kitFiltroOriginal : r.filtro_producao) === loteAlvo);
                    let cResNoLote = cRes.filter(r => GET_LOTE(r._kitFiltroOriginal !== undefined ? r._kitFiltroOriginal : r.filtro_producao) === loteAlvo);

                    allCompIndef.push(...cIndefNoLote);
                    allCompRes.push(...cResNoLote);
                }

                // FALLBACK: Só dispara se não existir NENHUMA tarefa física para NENHUM componente
                if (allCompIndef.length === 0 && allCompRes.length === 0) {
                    allCompIndef = indefinitas.filter(r =>
                        !r._isKit &&
                        GET_LOTE(r._kitFiltroOriginal !== undefined ? r._kitFiltroOriginal : r.filtro_producao) === loteAlvo
                    );
                    allCompRes = Array.from(resolvidasMap.values()).filter(r =>
                        !r._isKit &&
                        GET_LOTE(r._kitFiltroOriginal !== undefined ? r._kitFiltroOriginal : r.filtro_producao) === loteAlvo
                    );
                }

                if (allCompIndef.length > 0) {
                    todosResolvidos = false;
                } else {
                    for (const tc of allCompRes) {
                        const fim = new Date(tc.data_fim);
                        if (fim > maxFimComponentes) maxFimComponentes = fim;
                        if (tc._isPUR) precisaCura = true;
                    }
                }

                if (!todosResolvidos) {
                    prontoParaAgendar = false;
                } else {
                    if (precisaCura && !pai) {
                        maxFimComponentes = new Date(maxFimComponentes.getTime() + (24 * 60 * 60 * 1000));
                    }
                    if (maxFimComponentes > tempoProntidaoTecnica) {
                        tempoProntidaoTecnica = maxFimComponentes;
                    }
                    // Respeita o Pai Direto (Ex: Encaixotamento cola imediatamente no final do Shrink)
                    if (pai && new Date(pai.data_fim) > tempoProntidaoTecnica) {
                        tempoProntidaoTecnica = new Date(pai.data_fim);
                    }
                }
            }
        }
        if (pai && prontoParaAgendar && !t._isKit) { 
          if (pai._isPUR && t._isKit) delayCuraMs = 24 * 60 * 60 * 1000;

          if (t._isEspiral && pai._isFura) {
            let mqIdPreview = t._isManualEspiral ? 'ESPIRALAR_MANUAL_UNIFIED' : String(t.maquina_id || '').trim();
            const simPreview = simuladores[mqIdPreview] || {};
            const maxP = Math.max(1, Number(t.total_maquinas_parque || 1), Number(t.total_pessoas_parque || 1));
            const nUsadas = Math.min(maxP, Math.max(1, Number(simPreview.usadas || 1)));
            const modoPrev = String(simPreview.modo || 'DILUIR').toUpperCase();
            
            let tempoGastoPelaEspiral = Number(t.tempo_estimado_horas) || 0.016;
            if (modoPrev !== 'CONCORRENTE') tempoGastoPelaEspiral = tempoGastoPelaEspiral / nUsadas;
            const tempoPaiReal = pai.tempo_producao_efetivo || 0;

            if (tempoGastoPelaEspiral >= tempoPaiReal) {
              tempoProntidaoTecnica = new Date(pai.data_inicio);
              tempoProntidaoTecnica.setUTCHours(tempoProntidaoTecnica.getUTCHours() + 1);
            } else {
              const milisegundosDeRetardo = (1 - tempoGastoPelaEspiral) * 60 * 60 * 1000;
              tempoProntidaoTecnica = new Date(new Date(pai.data_fim).getTime() + milisegundosDeRetardo);
            }
            if (tempoProntidaoTecnica < new Date(pai.data_inicio)) tempoProntidaoTecnica = new Date(pai.data_inicio);
          
          } else if (t._isDobra && pai._isImp) {
            let mqIdPreview = String(t.maquina_id || '').trim();
            const simPreview = simuladores[mqIdPreview] || {};
            const maxP = Math.max(1, Number(t.total_maquinas_parque || 1), Number(t.total_pessoas_parque || 1));
            const nUsadas = Math.min(maxP, Math.max(1, Number(simPreview.usadas || 1)));
            const modoPrev = String(simPreview.modo || 'DILUIR').toUpperCase();

            let tempoGastoDobra = Number(t.tempo_estimado_horas) || 0.016;
            if (modoPrev !== 'CONCORRENTE') tempoGastoDobra = tempoGastoDobra / nUsadas;

            const fimPaiMs = new Date(pai.data_fim).getTime();
            const inicioPaiMs = new Date(pai.data_inicio).getTime();

            let trtMs = fimPaiMs + (24 * 60 * 60 * 1000) - (tempoGastoDobra * 60 * 60 * 1000);
            const limiteMinimoMs = inicioPaiMs + (2 * 60 * 60 * 1000);
            if (trtMs < limiteMinimoMs) {
              trtMs = limiteMinimoMs;
            }
            tempoProntidaoTecnica = new Date(trtMs);

          } else {
            tempoProntidaoTecnica = new Date(new Date(pai.data_fim).getTime() + delayCuraMs);
          }
        } else if (!pai && t._depUp && indefinitasById.has(t._depUp)) {
          prontoParaAgendar = false;
        }

        if (prontoParaAgendar && nomeE.includes('empast')) {
          const skuResolvidas = resolvidasPorSku.get(t._skuUp) || [];
          const skuIndef = indefinitasPorSku.get(t._skuUp) || [];

          const capaPendente = skuIndef.some(r => {
            const n = String(r.nome_etapa).toLowerCase();
            return n.includes('benefic') || n.includes('laminac') || (n.includes('impress') && n.includes('capa'));
          });

          if (capaPendente) {
            prontoParaAgendar = false;
          } else {
            for (const r of skuResolvidas) {
              const n = String(r.nome_etapa).toLowerCase();
              if (n.includes('benefic') || n.includes('laminac') || (n.includes('impress') && n.includes('capa'))) {
                const fim = new Date(r.data_fim);
                if (fim > tempoProntidaoTecnica) tempoProntidaoTecnica = fim;
              }
            }
          }
        }

        const isAcabamentoFinal = t._isAlc || nomeE.includes('grampo') || nomeE.includes('canoa') || t._isFura || t._isEspiral;
        if (prontoParaAgendar && isAcabamentoFinal) {
          const skuResolvidas = resolvidasPorSku.get(t._skuUp) || [];
          const skuIndef = indefinitasPorSku.get(t._skuUp) || [];

          const pendenteBase = skuIndef.some(r => {
            const n = String(r.nome_etapa).toLowerCase();
            return n.includes('benefic') || n.includes('laminac') || n.includes('corte') || n.includes('vinco') || n.includes('impress') || n.includes('dobra') || n.includes('empast');
          });

          if (pendenteBase) {
            prontoParaAgendar = false;
          } else {
            for (const r of skuResolvidas) {
              const n = String(r.nome_etapa).toLowerCase();
              if (n.includes('benefic') || n.includes('laminac') || n.includes('corte') || n.includes('vinco') || n.includes('impress') || n.includes('dobra') || n.includes('empast')) {
                const fim = new Date(r.data_fim);
                if (fim > tempoProntidaoTecnica) tempoProntidaoTecnica = fim;
              }
            }
          }
        }

        if (prontoParaAgendar) candidatosAptos.push({ tarefa: t, trt: tempoProntidaoTecnica });
      }

      if (candidatosAptos.length === 0 && indefinitas.length > 0) {
        candidatosAptos.push({ tarefa: indefinitas[0], trt: new Date(indefinitas[0].ideal_inicio) });
      }
      if (candidatosAptos.length === 0) break;

      candidatosAptos.forEach(c => {
        let mqId = String(c.tarefa.maquina_id || '').trim();
        if (c.tarefa._isManualEspiral) mqId = 'ESPIRALAR_MANUAL_UNIFIED';

        let machineFreeTime = controleMaquinasFim[mqId] ? Math.min(...controleMaquinasFim[mqId].map(d => d.getTime())) : 0;
        c.ast = Math.max(c.trt.getTime(), machineFreeTime);
      });

      candidatosAptos.sort((a, b) => {
        // Kits prontos SEMPRE primeiro
        const aIsKit = a.tarefa._isKit ? 1 : 0;
        const bIsKit = b.tarefa._isKit ? 1 : 0;
        if (aIsKit !== bIsKit) return bIsKit - aIsKit; // Kits primeiro (maior valor = maior prioridade)

        if (a.ast !== b.ast) {
          return a.ast - b.ast;
        }
        const pA = getPrioridade(a.tarefa.filtro_producao);
        const pB = getPrioridade(b.tarefa.filtro_producao);
        return pA - pB;
      });

      const { tarefa, trt } = candidatosAptos[0];
      let mqId = String(tarefa.maquina_id || '').trim();
      let diasTrabBase = tarefa.dias_trabalho;
      let horasDiariasBase = tarefa.horas_diarias;

      if (tarefa._isManualEspiral) {
        mqId = 'ESPIRALAR_MANUAL_UNIFIED';
        const espiraisFisicas = maquinasReais.filter(m => 
          (String(m.tipo).toLowerCase().includes('espiral') || String(m.modelo).toLowerCase().includes('espiral')) &&
          (String(m.tipo).toLowerCase().includes('manual') || String(m.modelo).toLowerCase().includes('manual') ||
          (!String(m.tipo).toLowerCase().includes('auto') && !String(m.tipo).toLowerCase().includes('semi') &&
           !String(m.modelo).toLowerCase().includes('auto') && !String(m.modelo).toLowerCase().includes('semi')))
        );
        if (espiraisFisicas.length > 0) {
          diasTrabBase = espiraisFisicas[0].dias_trabalho || 5;
          horasDiariasBase = espiraisFisicas[0].horas_diarias || 24;
          const capacidadeTotalGrupo = espiraisFisicas.reduce((acc, m) => acc + Math.max(Number(m.pessoas || 1), Number(m.maquinas || 1)), 0);
          tarefa.total_maquinas_parque = capacidadeTotalGrupo;
          tarefa.total_pessoas_parque = capacidadeTotalGrupo;
        }
      }

      let tempoParaOcupacao = new Date(trt);

      const simulacaoDaTela = simuladores[mqId] || {};
      const limiteMaximoFisico = Math.max(1, Number(tarefa.total_maquinas_parque || 1), Number(tarefa.total_pessoas_parque || 1));
      const numMaquinasUsadas = Math.min(limiteMaximoFisico, Math.max(1, Number(simulacaoDaTela.usadas || 1)));
      const modoOperacao = String(simulacaoDaTela.modo || 'DILUIR').toUpperCase();

      if (!controleMaquinasFim[mqId]) {
        controleMaquinasFim[mqId] = Array(numMaquinasUsadas).fill(null).map(() => new Date(tempoParaOcupacao));
      } else if (controleMaquinasFim[mqId].length !== numMaquinasUsadas) {
        const vetorAntigo = [...controleMaquinasFim[mqId]];
        controleMaquinasFim[mqId] = Array(numMaquinasUsadas).fill(null).map((_, idx) => vetorAntigo[idx] || new Date(tempoParaOcupacao));
      }

      let dataInicioReal = new Date(tempoParaOcupacao);
      if (controleMaquinasFim[mqId][0] > dataInicioReal) dataInicioReal = new Date(controleMaquinasFim[mqId][0]);

      let janelaFinal = null;
      let slotEscolhidoIndex = 0;
      let tempoRealAlocado = Number(tarefa.tempo_estimado_horas) > 0 ? Number(tarefa.tempo_estimado_horas) : 0.016; 
      let setupFoiDescontado = false;

      if (tarefa._isEspiral && !tarefa._isManualEspiral) {
          const mqData = maquinasReais.find(m => String(m.id) === String(mqId));
          const lastActivityTime = ultimaAtividadeMaquina[mqId];
          
          if (lastActivityTime && mqData && mqData.setup) {
              const gapHoras = (dataInicioReal.getTime() - lastActivityTime.getTime()) / (1000 * 60 * 60);
              if (gapHoras <= 12) {
                  const horasDeSetup = timeToDecimal(mqData.setup);
                  tempoRealAlocado = Math.max(0.016, tempoRealAlocado - horasDeSetup);
                  setupFoiDescontado = true;
              }
          }
      }

      if (modoOperacao === 'DILUIR') {
        tempoRealAlocado = tempoRealAlocado / numMaquinasUsadas;
        janelaFinal = simularJanelaDeTrabalho(dataInicioReal, tempoRealAlocado, mqId, diasTrabBase, horasDiariasBase);
        for (let s = 0; s < numMaquinasUsadas; s++) controleMaquinasFim[mqId][s] = janelaFinal.fim;
      } else if (modoOperacao === 'CONCORRENTE') {
        let menorFimTime = Infinity;
        for (let s = 0; s < numMaquinasUsadas; s++) {
          let tDisponivel = controleMaquinasFim[mqId][s] > tempoParaOcupacao ? controleMaquinasFim[mqId][s] : tempoParaOcupacao;
          let janelaTeste = simularJanelaDeTrabalho(tDisponivel, tempoRealAlocado, mqId, diasTrabBase, horasDiariasBase);
          if (janelaTeste.fim.getTime() < menorFimTime) {
            menorFimTime = janelaTeste.fim.getTime();
            janelaFinal = janelaTeste;
            slotEscolhidoIndex = s;
          }
        }
        controleMaquinasFim[mqId][slotEscolhidoIndex] = janelaFinal.fim;
      } else {
        let menorFimTime = Math.min(...controleMaquinasFim[mqId].map(d => d.getTime()));
        let slotsDisponiveisJuntos = [];
        for (let s = 0; s < numMaquinasUsadas; s++) {
          if (controleMaquinasFim[mqId][s].getTime() <= menorFimTime + (30 * 60 * 1000)) slotsDisponiveisJuntos.push(s);
        }
        const divisorReal = slotsDisponiveisJuntos.length || 1;
        tempoRealAlocado = tempoRealAlocado / divisorReal;
        let tRealInicio = menorFimTime > tempoParaOcupacao.getTime() ? new Date(menorFimTime) : new Date(tempoParaOcupacao);
        janelaFinal = simularJanelaDeTrabalho(tRealInicio, tempoRealAlocado, mqId, diasTrabBase, horasDiariasBase);
        slotsDisponiveisJuntos.forEach(s => { controleMaquinasFim[mqId][s] = janelaFinal.fim; });
        slotEscolhidoIndex = slotsDisponiveisJuntos[0] || 0;
      }

      ultimaAtividadeMaquina[mqId] = janelaFinal.fim;

      const dadosTooltip = {
        tiragem: tarefa.pm_tiragem || 'N/A',
        paginacao: tarefa.pm_paginacao || 'N/A',
        acabamento: tarefa.pm_acabamento || 'N/A',
        ideal_inicio: tarefa.ideal_inicio ? new Date(tarefa.ideal_inicio).toLocaleString('pt-BR', { timeZone:'UTC', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : 'N/A',
        kit_skus: tarefa._kitSkus || [] 
      };

      const novaResolvida = {
        id: String(tarefa.id),
        sku_alvo: String(tarefa.sku_alvo),
        filtro_producao: String(tarefa.filtro_producao || 'S/ Lote'),
        nome_etapa: setupFoiDescontado ? `${String(tarefa.nome_etapa)} 🔥 (-Setup)` : String(tarefa.nome_etapa),
        maquina_id: String(mqId),
        tempo_estimado_horas: Number(tarefa.tempo_estimado_horas) || 0,
        data_inicio: formataAbsoluto(janelaFinal.inicio),
        data_fim: formataAbsoluto(janelaFinal.fim),
        id_dependencia: tarefa.id_dependencia ? String(tarefa.id_dependencia) : null,
        status_tarefa: String(tarefa.status_tarefa || 'Pendente'),
        dados_tooltip: dadosTooltip,
        
        tempo_producao_efetivo: tempoRealAlocado,
        tempo_indisponivel_regra: janelaFinal.horasIndisponiveisRegra,
        sub_linha: slotEscolhidoIndex,
        _isPUR: tarefa._isPUR,
        _isAlc: tarefa._isAlc,
        is_antecipacao: tarefa.is_antecipacao || false
      };

      if (String(novaResolvida.nome_etapa).toLowerCase().includes('empast') && !String(novaResolvida.nome_etapa).toLowerCase().includes('capa')) {
          novaResolvida.nome_etapa = novaResolvida.nome_etapa + ' de Capa';
      }

      tarefasResolvidas.push(novaResolvida);
      resolvidasMap.set(tarefa._idUp, novaResolvida);
      if (!resolvidasPorSku.has(tarefa._skuUp)) resolvidasPorSku.set(tarefa._skuUp, []);
      resolvidasPorSku.get(tarefa._skuUp).push(novaResolvida);

      indefinitasById.delete(tarefa._idUp);
      const list = indefinitasPorSku.get(tarefa._skuUp);
      if (list) {
          const filtered = list.filter(i => i.id !== tarefa.id);
          if (filtered.length > 0) indefinitasPorSku.set(tarefa._skuUp, filtered);
          else indefinitasPorSku.delete(tarefa._skuUp);
      }
      indefinitas = indefinitas.filter(item => item.id !== tarefa.id);
    }

    if (indefinitas.length > 0) {
      console.warn(`[GANTT-DEBUG] ${indefinitas.length} tarefa(s) nunca ficaram prontas e foram descartadas do resultado final:`,
        indefinitas.map(t => ({ id: t.id, etapa: t.nome_etapa, sku: t._skuUp, lote: t.filtro_producao, dep: t._depUp, isKit: t._isKit })));
    }

    return new Response(JSON.stringify(tarefasResolvidas), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });

  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}