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
    const ultimaAtividadeMaquina = {}; // 🔴 MEMÓRIA: Guarda a hora do último término de cada máquina
    const UPPER_CASE = (str) => String(str || '').toUpperCase().trim();

    const travasMap = new Map();
    travasBD.forEach(t => {
      const dataStr = t.data_alvo.substring(0, 10);
      travasMap.set(`${UPPER_CASE(t.maquina_id)}_${dataStr}`, t);
    });

    const resolvidasMap = new Map();
    const resolvidasPorSku = new Map();
    const indefinitasPorSku = new Map();
    const indefinitasById = new Map();

    let indefinitas = resTarefas.rows.map(t => {
        const nomeE = String(t.nome_etapa).toLowerCase();
        const maqT = String(t.maq_tipo).toLowerCase();
        const maqM = String(t.maq_modelo).toLowerCase();
        return {
            ...t,
            _skuUp: UPPER_CASE(t.sku_alvo),
            _idUp: UPPER_CASE(t.id),
            _depUp: t.id_dependencia ? UPPER_CASE(t.id_dependencia) : null,
            _isFura: nomeE.includes('fura'),
            _isAlc: nomeE.includes('alcead') || nomeE.includes('cola'),
            _isEspiral: nomeE.includes('espiral'),
            _isDobra: nomeE.includes('dobra') || maqT.includes('dobra'),
            _isImp: nomeE.includes('impress') || maqT.includes('impress'),
            _isPUR: maqT.toUpperCase().includes('PUR') || maqM.toUpperCase().includes('PUR') || maqT.toUpperCase().includes('COLADEIRA'),
            _isManualEspiral: nomeE.includes('espiral') && (
                maqT.includes('manual') || maqM.includes('manual') ||
                (!maqT.includes('auto') && !maqT.includes('semi') && !maqM.includes('auto') && !maqM.includes('semi'))
            )
        };
    });

    // Apply fases_overrides: override ideal_inicio per phase if set
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

    // MODO FLUIDO: filter to only visible lotes so the engine fills the gaps
    if (lotesVisiveis.length > 0) {
      const visiveisUp = new Set(lotesVisiveis.map(l => UPPER_CASE(l)));
      indefinitas = indefinitas.filter(t => visiveisUp.has(UPPER_CASE(t.filtro_producao)));
    }

    // FILA VIP: build priority map — index 0 = highest priority
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
        // Skip INATIVO calendar lock days so tasks never start on locked days
        if (maquinaId) {
          const ano = r.getUTCFullYear();
          const mes = String(r.getUTCMonth() + 1).padStart(2, '0');
          const dia = String(r.getUTCDate()).padStart(2, '0');
          const trava = travasMap.get(`${UPPER_CASE(maquinaId)}_${ano}-${mes}-${dia}`);
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

        const travaHoje = travasMap.get(`${UPPER_CASE(maquinaId)}_${dataAlvoStr}`);
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

        if (pai && prontoParaAgendar) {
          if (pai._isAlc && pai._isPUR) delayCuraMs = 24 * 60 * 60 * 1000;

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

        // Parallel sync: Acabamento Final must wait for Beneficiamento (capa) + Corte e Vinco (inserts)
        if (prontoParaAgendar && t._isAlc) {
          const skuResolvidas = resolvidasPorSku.get(t._skuUp) || [];
          const skuIndef = indefinitasPorSku.get(t._skuUp) || [];
          const beneficPendente = skuIndef.some(r => {
            const n = String(r.nome_etapa).toLowerCase();
            return n.includes('benefic') || n.includes('laminac');
          });
          const corteVincoPendente = skuIndef.some(r => {
            const n = String(r.nome_etapa).toLowerCase();
            return n.includes('corte') || n.includes('vinco');
          });
          if (beneficPendente || corteVincoPendente) {
            prontoParaAgendar = false;
          } else {
            for (const r of skuResolvidas) {
              const n = String(r.nome_etapa).toLowerCase();
              if (n.includes('benefic') || n.includes('laminac') || n.includes('corte') || n.includes('vinco')) {
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
      
      const menorAst = Math.min(...candidatosAptos.map(c => c.trt.getTime()));

      candidatosAptos.sort((a, b) => {
        const pA = getPrioridade(a.tarefa.filtro_producao);
        const pB = getPrioridade(b.tarefa.filtro_producao);

        // Radar VIP: Lotes no TOP 5 de prioridade ganham um "raio de reserva" de 8 horas na máquina.
        // Lotes normais mantêm a regra estrita de não deixar a máquina ociosa por mais de 1 hora.
        const janelaA = pA <= 5 ? 8 * 60 * 60 * 1000 : 1 * 60 * 60 * 1000;
        const janelaB = pB <= 5 ? 8 * 60 * 60 * 1000 : 1 * 60 * 60 * 1000;

        const aProximo = a.trt.getTime() <= menorAst + janelaA;
        const bProximo = b.trt.getTime() <= menorAst + janelaB;

        if (aProximo && bProximo) {
          if (pA !== pB) return pA - pB;
          return a.trt.getTime() - b.trt.getTime();
        }
        if (aProximo && !bProximo) return -1;
        if (!aProximo && bProximo) return 1;

        if (a.trt.getTime() !== b.trt.getTime()) return a.trt.getTime() - b.trt.getTime();
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

      // 🔴 REGRA DE SETUP INTELIGENTE: Se a máquina for Espiral Automática e a folga for < 12h, corta o setup!
      if (tarefa._isEspiral && !tarefa._isManualEspiral) {
          const mqData = maquinasReais.find(m => String(m.id) === String(mqId));
          const lastActivityTime = ultimaAtividadeMaquina[mqId];
          
          if (lastActivityTime && mqData && mqData.setup) {
              const gapHoras = (dataInicioReal.getTime() - lastActivityTime.getTime()) / (1000 * 60 * 60);
              if (gapHoras <= 12) {
                  const horasDeSetup = timeToDecimal(mqData.setup);
                  tempoRealAlocado = Math.max(0.016, tempoRealAlocado - horasDeSetup); // Garante que a barra não zere
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

      // 🔴 Atualiza a memória da máquina para o próximo lote do loop!
      ultimaAtividadeMaquina[mqId] = janelaFinal.fim;

      const dadosTooltip = {
        tiragem: tarefa.pm_tiragem || 'N/A',
        paginacao: tarefa.pm_paginacao || 'N/A',
        acabamento: tarefa.pm_acabamento || 'N/A',
      };

      const novaResolvida = {
        id: String(tarefa.id),
        sku_alvo: String(tarefa.sku_alvo),
        filtro_producao: String(tarefa.filtro_producao || 'S/ Lote'),
        // Etiqueta visual para você saber quando o setup foi engolido na esteira!
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

    // -----------------------------------------------------------------------
    // KIT MRP: Schedule encaixotamento/shrink AFTER all dependent SKUs finish
    // -----------------------------------------------------------------------
    try {
      const resKits = await pool.query(
        `SELECT kc.id_codigo_kit, kc.dados_calculo,
                pk.id_codigo_sku_capa, pk.filtro_producao AS kit_filtro,
                pk.grafica AS kit_grafica
         FROM kit_calculos kc
         JOIN prod_kits pk
           ON UPPER(TRIM(kc.id_codigo_kit)) = UPPER(TRIM(pk.id_codigo_kit))
          AND UPPER(TRIM(kc.filtro_producao)) = UPPER(TRIM(pk.filtro_producao))
          AND UPPER(TRIM(kc.grafica)) = UPPER(TRIM(pk.grafica))
         WHERE UPPER(TRIM(kc.grafica)) = UPPER(TRIM($1))
           AND kc.dados_calculo IS NOT NULL`,
        [grafica]
      );

      // Group: kit_id -> { dados_calculo, filtro, skus[] }
      const kitsMap = new Map();
      for (const row of resKits.rows) {
        const key = UPPER_CASE(row.id_codigo_kit) + '|' + UPPER_CASE(row.kit_filtro);
        if (!kitsMap.has(key)) {
          let dc = {};
          try { dc = typeof row.dados_calculo === 'string' ? JSON.parse(row.dados_calculo) : (row.dados_calculo || {}); } catch(e) {}
          kitsMap.set(key, { id: row.id_codigo_kit, filtro: row.kit_filtro, grafica: row.kit_grafica, dados_calculo: dc, skus: [] });
        }
        if (row.id_codigo_sku_capa) kitsMap.get(key).skus.push(UPPER_CASE(row.id_codigo_sku_capa));
      }

      // Convert "HH:MM" string to decimal hours
      const horasDeString = (str) => {
        if (!str || !String(str).includes(':')) return 0;
        const [h, m] = String(str).split(':');
        return parseInt(h) + (parseInt(m) / 60);
      };

      for (const [, kit] of kitsMap) {
        // Find the latest finish time among all resolved tasks for this kit's SKUs
        let maxFim = null;
        for (const skuCapa of kit.skus) {
          const tarefasDoSku = resolvidasPorSku.get(skuCapa) || [];
          for (const t of tarefasDoSku) {
            const fim = new Date(t.data_fim);
            if (!maxFim || fim > maxFim) maxFim = fim;
          }
        }
        if (!maxFim) continue; // no resolved tasks for this kit's SKUs yet

        const dc = kit.dados_calculo;

        // Shrink MUST run before Encaixotamento — schedule Shrink first
        let shrinkFim = new Date(maxFim);
        if (dc.shrink?.maquina_id && dc.shrink?.resultado) {
          const horas = horasDeString(dc.shrink.resultado.totais?.total);
          if (horas > 0) {
            const mqId = String(dc.shrink.maquina_id);
            const filaAtual = controleMaquinasFim[mqId];
            let tAtual = new Date(maxFim);
            if (filaAtual) { const menorFim = new Date(Math.min(...filaAtual.map(d => d.getTime()))); if (menorFim > tAtual) tAtual = menorFim; }
            const janela = simularJanelaDeTrabalho(tAtual, horas, mqId, 5, 24);
            if (!controleMaquinasFim[mqId]) controleMaquinasFim[mqId] = [janela.fim];
            else controleMaquinasFim[mqId][0] = janela.fim;
            shrinkFim = janela.fim;
            tarefasResolvidas.push({
              id: `kit-${UPPER_CASE(kit.id)}-Shrink`,
              sku_alvo: kit.id,
              filtro_producao: String(kit.filtro || 'Kit'),
              nome_etapa: 'Shrink',
              maquina_id: mqId,
              maq_tipo: 'Shrink', maq_modelo: 'Shrink',
              tempo_estimado_horas: horas,
              data_inicio: formataAbsoluto(janela.inicio),
              data_fim: formataAbsoluto(janela.fim),
              id_dependencia: null, status_tarefa: 'Pendente',
              dados_tooltip: { tiragem: 'Kit', paginacao: 'Kit', acabamento: 'Shrink', kit_skus: kit.skus },
              tempo_producao_efetivo: horas,
              tempo_indisponivel_regra: janela.horasIndisponiveisRegra,
              sub_linha: 0,
            });
          }
        }

        // Encaixotamento starts at Math.max(maxFim, shrinkFim)
        if (dc.encaixotamento?.maquina_id && dc.encaixotamento?.resultado) {
          const horas = horasDeString(dc.encaixotamento.resultado.totais?.total);
          if (horas > 0) {
            const mqId = String(dc.encaixotamento.maquina_id);
            const filaAtual = controleMaquinasFim[mqId];
            let tAtual = shrinkFim > maxFim ? shrinkFim : new Date(maxFim);
            if (filaAtual) { const menorFim = new Date(Math.min(...filaAtual.map(d => d.getTime()))); if (menorFim > tAtual) tAtual = menorFim; }
            const janela = simularJanelaDeTrabalho(tAtual, horas, mqId, 5, 24);
            if (!controleMaquinasFim[mqId]) controleMaquinasFim[mqId] = [janela.fim];
            else controleMaquinasFim[mqId][0] = janela.fim;
            tarefasResolvidas.push({
              id: `kit-${UPPER_CASE(kit.id)}-Encaixotamento`,
              sku_alvo: kit.id,
              filtro_producao: String(kit.filtro || 'Kit'),
              nome_etapa: 'Encaixotamento',
              maquina_id: mqId,
              maq_tipo: 'Encaixotamento', maq_modelo: 'Encaixotamento',
              tempo_estimado_horas: horas,
              data_inicio: formataAbsoluto(janela.inicio),
              data_fim: formataAbsoluto(janela.fim),
              id_dependencia: null, status_tarefa: 'Pendente',
              dados_tooltip: { tiragem: 'Kit', paginacao: 'Kit', acabamento: 'Encaixotamento', kit_skus: kit.skus },
              tempo_producao_efetivo: horas,
              tempo_indisponivel_regra: janela.horasIndisponiveisRegra,
              sub_linha: 0,
            });
          }
        }
      }
    } catch(kitErr) {
      console.error('Kit MRP error:', kitErr.message);
    }

    return new Response(JSON.stringify(tarefasResolvidas), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });

  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}