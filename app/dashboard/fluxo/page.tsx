"use client";
import { useState, useEffect, useMemo, useRef } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const PALETA_CORES_HEX = [
  "#3b82f6", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6", "#0ea5e9",
  "#d946ef", "#84cc16", "#f97316", "#14b8a6", "#6366f1", "#06b6d4",
  "#ec4899", "#ef4444", "#eab308", "#22c55e", "#a855f7"
];

type VisaoGantt = 'DIAS' | 'SEMANAS' | 'MESES';

const getSemanaDoAno = (data: Date) => {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  const primeiroDiaAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diasPassados = Math.floor((d.getTime() - primeiroDiaAno.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((diasPassados + primeiroDiaAno.getUTCDay() + 1) / 7);
};

export default function DashboardFluxoGargalos() {
  const [graficaSelecionada, setGraficaSelecionada] = useState('');
  const [graficasDisponiveis, setGraficasDisponiveis] = useState<string[]>([]);
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [mapaCores, setMapaCores] = useState<Record<string, string>>({});
  const [travasCalendario, setTravasCalendario] = useState<any[]>([]);
  const [simuladores, setSimuladores] = useState<Record<string, any>>({});

  const [visao, setVisao] = useState<VisaoGantt>('DIAS');
  const [lotesAtivos, setLotesAtivos] = useState<string[]>([]);
  const [showFiltroLote, setShowFiltroLote] = useState(false);
  const [buscaSkuQuery, setBuscaSkuQuery] = useState('');
  const [skuDestacado, setSkuDestacado] = useState<string | null>(null);

  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    fetch(`/api/producao/miolo/filtros?ts=${Date.now()}`)
      .then(res => res.json())
      .then(dados => setGraficasDisponiveis(Array.from(new Set(dados.map((d: any) => String(d.grafica).toUpperCase()))) as string[]))
      .catch(() => {});
  }, []);

  const carregarDadosDoGantt = async (graficaAlvo: string) => {
    setGraficaSelecionada(graficaAlvo);
    setCarregando(true);
    setSkuDestacado(null);
    try {
      const savedSim = localStorage.getItem('gantt_simulacao_estado');
      const simParsed = savedSim ? JSON.parse(savedSim) : {};
      setSimuladores(simParsed);

      const [resTarefas, resTravas] = await Promise.all([
        fetch(`/api/producao/gantt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grafica: graficaAlvo, simuladores: simParsed }) }),
        fetch(`/api/producao/gantt/travas?grafica=${graficaAlvo}`)
      ]);

      const ts = await resTarefas.json();
      const tr = resTravas.ok ? await resTravas.json() : [];
      const dadosTratados = Array.isArray(ts) ? ts : [];
      
      setTarefas(dadosTratados);
      setTravasCalendario(tr);

      const skusUnicos = Array.from(new Set(dadosTratados.map(t => String(t.sku_alvo).trim())));
      const coresTemp: Record<string, string> = {};
      skusUnicos.forEach((sku, index) => { coresTemp[sku] = PALETA_CORES_HEX[index % PALETA_CORES_HEX.length]; });
      setMapaCores(coresTemp);

    } catch (e) { console.error(e); } finally { setCarregando(false); }
  };

  const obterOrdemSetor = (nomeEtapa: string, tipoMaq: string): number => {
    const t = String(tipoMaq || '').toLowerCase(); const e = String(nomeEtapa || '').toLowerCase();
    if (t.includes('impress') || e.includes('impress')) return 10;
    if (t.includes('dobra') || e.includes('dobra')) return 20;
    if (t.includes('laminac') || t.includes('benefic') || e.includes('benefic')) return 30;
    if (t.includes('empast') || e.includes('empast')) return 35; // 🔴 EMPASTAMENTO ENTRA AQUI
    if (t.includes('corte') || t.includes('vinco') || e.includes('corte')) return 40;
    if (t.includes('alceade') && !t.includes('cola') && !e.includes('cola')) return 50;
    if (e.includes('fura') || t.includes('fura')) return 60; 
    if (e.includes('espiral') || t.includes('espiral')) return 70; 
    if (t.includes('shrink') || t.includes('encaixot') || e.includes('shrink') || e.includes('box') || t.includes('kit') || e.includes('kit')) return 90;
    return 80; 
  };

  const obterNomeFluxo = (nomeEtapa: string, tipoMaq: string): string => {
    const t = String(tipoMaq || '').toLowerCase(); const e = String(nomeEtapa || '').toLowerCase();
    if (t.includes('impress') || e.includes('impress')) return 'Impressão';
    if (t.includes('dobra') || e.includes('dobra')) return 'Dobra';
    if (t.includes('laminac') || t.includes('benefic') || e.includes('benefic')) return 'Beneficiamento';
    if (t.includes('empast') || e.includes('empast')) return 'Empastamento'; // 🔴 NOME DO SETOR
    if (t.includes('corte') || t.includes('vinco') || e.includes('corte')) return 'Corte e Vinco';
    if (t.includes('alceade') && !t.includes('cola') && !e.includes('cola')) return 'Alceamento';
    if (e.includes('fura') || t.includes('fura')) return 'Furação';
    if (e.includes('espiral') || t.includes('espiral')) return 'Espiralação';
    if (t.includes('shrink') || t.includes('encaixot') || e.includes('shrink') || e.includes('box') || t.includes('kit') || e.includes('kit')) return 'Kits e Fechamento';
    return 'Acabamentos Gerais';
  };

  const tarefasFiltradas = useMemo(() => {
    return tarefas.filter(t => {
      const matchLote = lotesAtivos.length === 0 || lotesAtivos.includes(t.filtro_producao);
      const matchSkuText = !buscaSkuQuery || String(t.sku_alvo).toUpperCase().includes(buscaSkuQuery.toUpperCase());
      return matchLote && matchSkuText;
    });
  }, [tarefas, lotesAtivos, buscaSkuQuery]);

  const lotesExistentes = Array.from(new Set(tarefas.map(t => t.filtro_producao)));

  const gargalos = useMemo(() => {
    const construtorVazio = () => ({ horas: 0, maquinas: {} as Record<string, number> });
    // 🔴 ADICIONADO EMPASTAMENTO NO ESTADO DO GARGALO
    const etapas = { impressao: construtorVazio(), dobra: construtorVazio(), capa: construtorVazio(), empastamento: construtorVazio(), corte: construtorVazio(), alceamento: construtorVazio(), fechamento: construtorVazio(), kits: construtorVazio() };

    tarefasFiltradas.forEach(t => {
      const h = Number(t.tempo_producao_efetivo || t.tempo_estimado_horas || 0);
      const strEtapa = String(t.nome_etapa).toLowerCase(); const strTipo = String(t.maq_tipo).toLowerCase(); const mqNome = t.maq_modelo || t.maquina_id;

      let alvo = null;
      if (strEtapa.includes('impress') || strTipo.includes('impress')) alvo = etapas.impressao;
      else if (strEtapa.includes('dobra') || strTipo.includes('dobra')) alvo = etapas.dobra;
      else if (strEtapa.includes('benefic') || strEtapa.includes('laminac') || strTipo.includes('laminac')) alvo = etapas.capa;
      else if (strEtapa.includes('empast') || strTipo.includes('empast')) alvo = etapas.empastamento; // 🔴 ALOCADOR
      else if (strEtapa.includes('corte') || strEtapa.includes('vinco') || strTipo.includes('corte')) alvo = etapas.corte;
      else if (strEtapa.includes('alcead') || strEtapa.includes('cola')) alvo = etapas.alceamento;
      else if (strEtapa.includes('shrink') || strEtapa.includes('encaixot') || strEtapa.includes('kit') || strTipo.includes('kit')) alvo = etapas.kits;
      else alvo = etapas.fechamento;

      alvo.horas += h;
      if (!alvo.maquinas[mqNome]) alvo.maquinas[mqNome] = 0; alvo.maquinas[mqNome] += h;
    });

    const formatar = (dados: any) => ({
      horasTotais: Math.round(dados.horas), diasUteis: Math.ceil(dados.horas / 24),
      detalhes: Object.entries(dados.maquinas).map(([nome, h]) => `${nome}: ${Math.round(Number(h))}h`).join('\n')
    });

    return { 
      impressao: formatar(etapas.impressao), dobra: formatar(etapas.dobra), 
      capa: formatar(etapas.capa), empastamento: formatar(etapas.empastamento), // 🔴 RETORNO
      corte: formatar(etapas.corte), alceamento: formatar(etapas.alceamento), 
      fechamento: formatar(etapas.fechamento), kits: formatar(etapas.kits) 
    };
  }, [tarefasFiltradas]);

  const graficosCarga = useMemo(() => {
    if (tarefasFiltradas.length === 0) return { maquinas: [] };

    let minT = Infinity; let maxT = 0;
    tarefasFiltradas.forEach(t => {
      const start = new Date(t.data_inicio).getTime(); const end = new Date(t.data_fim).getTime();
      if (start < minT) minT = start; if (end > maxT) maxT = end;
    });

    const dataInicioAbs = new Date(minT); dataInicioAbs.setUTCHours(0,0,0,0);
    if (visao === 'DIAS') dataInicioAbs.setUTCDate(dataInicioAbs.getUTCDate() - 1);
    if (visao === 'SEMANAS') dataInicioAbs.setUTCDate(dataInicioAbs.getUTCDate() - dataInicioAbs.getUTCDay());
    if (visao === 'MESES') dataInicioAbs.setUTCDate(1);

    const dataFimAbs = new Date(maxT); dataFimAbs.setUTCHours(23,59,59,999);
    if (visao === 'DIAS') dataFimAbs.setUTCDate(dataFimAbs.getUTCDate() + 3);
    if (visao === 'SEMANAS') dataFimAbs.setUTCDate(dataFimAbs.getUTCDate() + (6 - dataFimAbs.getUTCDay()) + 7);
    if (visao === 'MESES') { dataFimAbs.setUTCMonth(dataFimAbs.getUTCMonth() + 2); dataFimAbs.setUTCDate(0); }

    const totalDias = Math.ceil((dataFimAbs.getTime() - dataInicioAbs.getTime()) / (1000 * 3600 * 24));
    const diasRange = Array.from({length: totalDias}).map((_, i) => { const d = new Date(dataInicioAbs); d.setUTCDate(d.getUTCDate() + i); return d; });

    const celulasPeriodo: any[] = [];
    if (visao === 'DIAS') {
      diasRange.forEach(d => celulasPeriodo.push({ start: new Date(d), end: new Date(d.getTime() + 24*3600*1000 - 1), label: d.toLocaleDateString('pt-BR', { timeZone:'UTC', day:'2-digit', month:'2-digit' }) }));
    } else if (visao === 'SEMANAS') {
      for (let i = 0; i < diasRange.length; i += 7) {
        let chunk = diasRange.slice(i, i+7);
        let numSemana = getSemanaDoAno(chunk[0]);
        celulasPeriodo.push({ start: new Date(chunk[0]), end: new Date(chunk[chunk.length-1].getTime() + 24*3600*1000 - 1), label: `SEM ${numSemana}` });
      }
    } else if (visao === 'MESES') {
      let curMonth = -1; let mDays = 0; let mStart: Date | null = null;
      diasRange.forEach((d, i) => {
        if (d.getUTCMonth() !== curMonth) {
          if (curMonth !== -1 && mStart) {
            let eDate = new Date(mStart); eDate.setUTCDate(eDate.getUTCDate() + mDays - 1);
            celulasPeriodo.push({ start: mStart, end: new Date(eDate.getTime() + 24*3600*1000 - 1), label: mStart.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).toUpperCase() });
          }
          curMonth = d.getUTCMonth(); mDays = 1; mStart = d;
        } else mDays++;
        if (i === diasRange.length - 1 && mStart) {
          let eDate = new Date(mStart); eDate.setUTCDate(eDate.getUTCDate() + mDays - 1);
          celulasPeriodo.push({ start: mStart, end: new Date(eDate.getTime() + 24*3600*1000 - 1), label: mStart.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).toUpperCase() });
        }
      });
    }

    const maqMap: Record<string, any> = {};
    tarefasFiltradas.forEach(t => {
      const mqId = t.maquina_id;
      if (!maqMap[mqId]) {
        const nomeMacro = obterNomeFluxo(t.nome_etapa, t.maq_tipo);
        const modeloMaquina = t.maq_modelo || mqId;
        const tituloComposto = `${nomeMacro.toUpperCase()} - ${modeloMaquina}`;

        maqMap[mqId] = {
          id: mqId, nome: tituloComposto, setor: t.maq_tipo || 'Geral', ordem: obterOrdemSetor(t.nome_etapa, t.maq_tipo),
          diasTrabalhoBase: Number(t.dias_trabalho || 5), horasDiariasBase: Number(t.horas_diarias || 24),
          tarefas: [], skusUnicos: new Set()
        };
      }
      maqMap[mqId].tarefas.push(t);
      maqMap[mqId].skusUnicos.add(String(t.sku_alvo).trim());
    });

    const maquinasData = Object.values(maqMap).map(mq => {
      const simConfig = simuladores[mq.id] || {};
      const maquinasAtivas = Math.max(1, Number(simConfig.usadas || 1));

      const chartData = celulasPeriodo.map(cell => {
        let dataPoint: any = { name: cell.label };
        
        let capacidadeAtivaDoPeriodo = 0;
        let tempData = new Date(cell.start);
        while (tempData <= cell.end) {
          const dataStr = `${tempData.getUTCFullYear()}-${String(tempData.getUTCMonth() + 1).padStart(2, '0')}-${String(tempData.getUTCDate()).padStart(2, '0')}`;
          const dayW = tempData.getUTCDay();
          const lock = travasCalendario.find(t => String(t.maquina_id).toUpperCase().trim() === String(mq.id).toUpperCase().trim() && String(t.data_alvo || t.data_trava).startsWith(dataStr));
          
          let cap = mq.horasDiariasBase;
          if (lock) { cap = lock.status_operacional === 'INATIVO' ? 0 : Number(lock.horas_disponiveis); }
          else { if ((mq.diasTrabalhoBase === 5 && (dayW === 0 || dayW === 6)) || (mq.diasTrabalhoBase === 6 && dayW === 0)) cap = 0; }
          
          capacidadeAtivaDoPeriodo += cap; 
          tempData.setUTCDate(tempData.getUTCDate() + 1);
        }

        const limiteMaximoPeriodo = capacidadeAtivaDoPeriodo * maquinasAtivas;
        dataPoint.limite = limiteMaximoPeriodo; 

        let totalOverlapBruto = 0;
        let overlapBrutoPorSku: Record<string, number> = {};

        mq.tarefas.forEach((t: any) => {
          const tIn = new Date(t.data_inicio); const tFim = new Date(t.data_fim);
          if (tIn <= cell.end && tFim >= cell.start) {
            const overlapStart = tIn > cell.start ? tIn : cell.start;
            const overlapEnd = tFim < cell.end ? tFim : cell.end;
            const hours = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60);
            
            if (hours > 0) {
              let effortHours = hours;
              if (Number(t.tempo_producao_efetivo) > 0) {
                const ratioEsforco = Number(t.tempo_estimado_horas) / Number(t.tempo_producao_efetivo);
                effortHours = hours * ratioEsforco;
              }

              const skuStr = String(t.sku_alvo).trim();
              if (!overlapBrutoPorSku[skuStr]) overlapBrutoPorSku[skuStr] = 0;
              overlapBrutoPorSku[skuStr] += effortHours;
              totalOverlapBruto += effortHours;
            }
          }
        });

        let fatorCorrecao = 1;
        if (totalOverlapBruto > limiteMaximoPeriodo && limiteMaximoPeriodo > 0) {
          fatorCorrecao = limiteMaximoPeriodo / totalOverlapBruto;
        } else if (limiteMaximoPeriodo === 0) {
          fatorCorrecao = 0; 
        }

        let totalLiquidado = 0;
        Object.keys(overlapBrutoPorSku).forEach(sku => {
          const horasCravadas = overlapBrutoPorSku[sku] * fatorCorrecao;
          dataPoint[sku] = horasCravadas;
          totalLiquidado += horasCravadas;
        });

        dataPoint.total = totalLiquidado;
        return dataPoint;
      });

      return { 
        ...mq, 
        skusArray: Array.from(mq.skusUnicos), 
        chartData,
        maxY: Math.max(mq.horasDiariasBase * maquinasAtivas + 5, ...chartData.map(d => d.total || 0), ...chartData.map(d => d.limite || 0)) 
      };
    });

    maquinasData.sort((a, b) => {
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
      return a.nome.localeCompare(b.nome);
    });

    return { maquinas: maquinasData };
  }, [tarefasFiltradas, visao, travasCalendario, simuladores]);

  const CustomRechartsTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const isLimiteInfo = payload.find((p:any) => p.dataKey === 'limite');
      const skusPayload = payload.filter((p:any) => p.dataKey !== 'limite' && p.value > 0);
      const totalHoras = skusPayload.reduce((sum: number, entry: any) => sum + Number(entry.value), 0);
      
      return (
        <div className="bg-slate-900 text-white p-3 rounded-lg shadow-2xl border border-slate-700 w-max z-[9999]">
          <div className="text-[11px] font-black text-amber-400 mb-1.5 border-b border-slate-700 pb-1 uppercase">{label}</div>
          {isLimiteInfo && <div className="text-[10px] text-red-400 font-bold mb-1">Capacidade Útil Permitida: {Number(isLimiteInfo.value).toFixed(1)}h</div>}
          <div className="text-[10px] text-slate-300 mb-2 border-b border-slate-700 pb-1.5">Esforço Operacional (Volume): <strong className="text-white text-xs">{totalHoras.toFixed(1)}h</strong></div>
          <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto custom-scrollbar pr-2">
            {skusPayload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4 text-[10px] font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm shadow-sm" style={{ backgroundColor: entry.color }}></span>
                  <span className="font-bold">{entry.name}</span>
                </div>
                <span className="text-slate-300 font-bold">{Number(entry.value).toFixed(1)}h</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const handleSyncScroll = (e: React.UIEvent<HTMLDivElement>, sourceIdx: number) => {
    const newScrollLeft = e.currentTarget.scrollLeft;
    scrollRefs.current.forEach((ref, idx) => {
      if (ref && idx !== sourceIdx && ref.scrollLeft !== newScrollLeft) {
        ref.scrollLeft = newScrollLeft;
      }
    });
  };

  return (
    <div className="w-full min-h-screen bg-slate-100 font-sans flex flex-col">
      <div className="w-full px-4 sm:px-8 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Dashboards de Produção</h1>
          <p className="text-slate-500 text-sm mt-1">Mapeamento de Fluxo, Gargalos e Nivelamento de Capacidade</p>
        </header>

        <div className="flex flex-wrap gap-4 items-center mb-6 border-b border-slate-200 pb-4">
          <div className="flex gap-2 bg-slate-200/60 p-1 rounded-lg">
            {graficasDisponiveis.map((graf, i) => (
              <button key={i} onClick={() => carregarDadosDoGantt(graf)} className={`px-4 py-1.5 rounded font-bold uppercase text-xs transition-all ${graficaSelecionada === graf ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}>{graf}</button>
            ))}
          </div>

          <div className="h-6 w-px bg-slate-300 mx-2"></div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
            <button onClick={() => setVisao('DIAS')} className={`text-[10px] font-bold px-3 py-1.5 rounded transition-colors ${visao === 'DIAS' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:text-slate-800'}`}>DIAS</button>
            <button onClick={() => setVisao('SEMANAS')} className={`text-[10px] font-bold px-3 py-1.5 rounded transition-colors ${visao === 'SEMANAS' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:text-slate-800'}`}>SEMANAS</button>
            <button onClick={() => setVisao('MESES')} className={`text-[10px] font-bold px-3 py-1.5 rounded transition-colors ${visao === 'MESES' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:text-slate-800'}`}>MESES</button>
          </div>

          <div className="relative flex items-center bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
            <i className="fas fa-search text-slate-400 text-xs mr-2"></i>
            <input type="text" placeholder="Filtrar SKU..." value={buscaSkuQuery} onChange={(e) => setBuscaSkuQuery(e.target.value)} className="bg-transparent text-slate-800 font-mono font-bold text-xs outline-none w-32 placeholder-slate-400" />
            {buscaSkuQuery && <button onClick={() => setBuscaSkuQuery('')} className="text-slate-400 hover:text-red-500 ml-1 text-xs font-black">&times;</button>}
          </div>

          <div className="relative">
            <button onClick={() => setShowFiltroLote(!showFiltroLote)} className="bg-white border border-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 shadow-sm hover:bg-slate-50">
              <i className="fas fa-filter text-violet-500"></i> Lotes ({lotesAtivos.length === 0 ? 'Todos' : lotesAtivos.length})
            </button>
            {showFiltroLote && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 p-3 z-[9000]">
                <div className="flex justify-between items-center mb-2 border-b pb-2"><span className="text-[10px] font-black uppercase text-slate-500">Filtros</span><button onClick={() => setLotesAtivos([])} className="text-[10px] text-violet-600 font-bold">Limpar</button></div>
                <div className="max-h-64 overflow-y-auto space-y-1">{lotesExistentes.map(lote => (<label key={lote} className="flex items-center gap-2 text-xs font-bold text-slate-700 p-1.5 hover:bg-slate-50 rounded cursor-pointer"><input type="checkbox" className="w-4 h-4 accent-violet-600" checked={lotesAtivos.includes(lote)} onChange={() => setLotesAtivos(prev => prev.includes(lote) ? prev.filter(l => l !== lote) : [...prev, lote])} /><span className="w-3 h-3 rounded-full bg-slate-300"></span>{lote}</label>))}</div>
              </div>
            )}
          </div>

          {skuDestacado && <button onClick={() => setSkuDestacado(null)} className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-black px-3 py-1.5 rounded-lg text-[10px] uppercase shadow-sm flex items-center gap-1"><i className="fas fa-times"></i> Limpar Foco SKU</button>}
        </div>

        {carregando && <div className="text-center py-20 text-slate-500 font-bold animate-pulse">Processando matemática do parque produtivo...</div>}

        {graficaSelecionada && !carregando && tarefas.length > 0 && (
          <div className="w-full max-w-[1600px] mx-auto">
            {/* 1. DIAGRAMA FLUXO DE VALOR (VSM) */}
            <div className="w-full overflow-x-auto pb-10 border-b border-slate-300 mb-10 custom-scrollbar">
              <div className="flex items-center min-w-max py-8 px-2 gap-6">
                <CardFluxo titulo="1. Impressão Geral" icone="fa-print" cor="bg-blue-500" dados={gargalos.impressao} grupo="Início" />
                <i className="fas fa-arrow-right text-slate-300 text-2xl mt-8 flex-shrink-0"></i>
                <div className="flex flex-col items-center flex-shrink-0">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Simultâneo</span>
                  <div className="flex flex-col gap-4">
                    <CardFluxo titulo="2A. Dobra Miolo" icone="fa-file-alt" cor="bg-rose-500" dados={gargalos.dobra} ocultarGrupo />
                    <CardFluxo titulo="2B. Acab. Capa" icone="fa-magic" cor="bg-amber-500" dados={gargalos.capa} ocultarGrupo />
                    {/* 🔴 O NOVO CARTÃO DE EMPASTAMENTO DA CAPA DURA */}
                    <CardFluxo titulo="2C. Empastamento" icone="fa-book" cor="bg-orange-500" dados={gargalos.empastamento} ocultarGrupo sub="(Capa Dura)" />
                    <CardFluxo titulo="2D. Corte e Vinco" icone="fa-cut" cor="bg-purple-500" dados={gargalos.corte} ocultarGrupo />
                  </div>
                </div>
                <i className="fas fa-arrow-right text-slate-300 text-2xl mt-8 flex-shrink-0"></i>
                <CardFluxo titulo="3. Alceamento/Cola" icone="fa-layer-group" cor="bg-sky-500" dados={gargalos.alceamento} grupo="Junção" />
                <i className="fas fa-arrow-right text-slate-300 text-2xl mt-8 flex-shrink-0"></i>
                <CardFluxo titulo="4. Fechamento" icone="fa-wrench" cor="bg-fuchsia-500" dados={gargalos.fechamento} grupo="Finalização" sub="(Furo, Grampo, Espiral)" />
                <i className="fas fa-arrow-right text-slate-300 text-2xl mt-8 flex-shrink-0"></i>
                <CardFluxo titulo="5. Manuseio/Kits" icone="fa-box" cor="bg-emerald-500" dados={gargalos.kits} grupo="Entrega" sub="(Formação + Shrink)" />
              </div>
            </div>

            {/* 2. GRÁFICOS RECHARTS (CAPACITY PLANNING) */}
            <div className="w-full flex flex-col gap-6 pb-20">
              <h2 className="text-lg font-black text-slate-700 uppercase tracking-tight flex items-center gap-2 mb-2">
                <i className="fas fa-chart-line text-violet-600"></i> Balanceamento de Capacidade
              </h2>
              
              <div className="grid grid-cols-1 gap-6">
                {graficosCarga.maquinas.map((mq, idx) => {
                  const numColunas = mq.chartData.length;
                  const larguraCalculada = Math.max(1000, numColunas * (visao === 'DIAS' ? 45 : 70)); 

                  return (
                    <div key={idx} className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col w-full overflow-hidden">
                      <header className="bg-slate-50 border-b p-3 px-5 flex justify-between items-center">
                        <h3 className="font-black text-slate-700 text-sm uppercase flex items-center gap-2">
                          <i className="fas fa-microchip text-slate-400"></i> {mq.ordem}. {mq.nome}
                        </h3>
                        <span className="text-xs font-mono font-bold text-slate-500 bg-slate-200/80 px-3 py-1.5 rounded-lg border border-slate-300">
                          {mq.tarefas.length} O.S. na Fila
                        </span>
                      </header>
                      
                      <div 
                        className="p-4 w-full overflow-x-auto custom-scrollbar bg-slate-50/20"
                        ref={(el) => { scrollRefs.current[idx] = el; }}
                        onScroll={(e) => handleSyncScroll(e, idx)}
                      >
                        <div style={{ width: `${larguraCalculada}px`, height: 250 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={mq.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} tickMargin={10} axisLine={{ stroke: '#cbd5e1' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tickFormatter={(value) => `${value}h`} />
                              
                              <RechartsTooltip content={<CustomRechartsTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                              
                              <Line type="step" dataKey="limite" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" activeDot={false} />

                              {mq.skusArray.map((skuStr: any) => (
                                <Bar 
                                  key={skuStr} 
                                  dataKey={skuStr} 
                                  stackId="a" 
                                  fill={mapaCores[skuStr] || '#94a3b8'} 
                                  barSize={32}
                                  isAnimationActive={false} 
                                  stroke="rgba(255,255,255,0.4)"
                                  strokeWidth={1}
                                  fillOpacity={skuDestacado && skuDestacado !== skuStr ? 0.15 : 1}
                                  onClick={() => setSkuDestacado(skuDestacado === skuStr ? null : skuStr)}
                                  style={{ cursor: 'pointer' }}
                                />
                              ))}
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CardFluxo({ titulo, icone, cor, dados, grupo, sub, ocultarGrupo }: any) {
  return (
    <div className="flex flex-col items-center flex-shrink-0 group relative z-10 hover:z-50">
      {!ocultarGrupo && <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{grupo}</span>}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm w-64 overflow-visible relative hover:border-slate-300 transition-colors cursor-help hover:shadow-md">
        <div className={`h-1.5 w-full ${cor} absolute top-0 left-0 rounded-t-xl`}></div>
        <div className="p-5 relative">
          <div className="flex justify-between items-center mb-3">
            <span className="font-bold text-slate-700 text-sm">{titulo}</span>
            <i className={`fas ${icone} text-slate-300`}></i>
          </div>
          <div className="flex items-end justify-between mt-6">
            <span className="text-3xl font-black text-slate-800">{dados.diasUteis} <span className="text-sm font-bold text-slate-500 tracking-tighter">d úteis</span></span>
            <span className="text-xs font-bold text-slate-400">{dados.horasTotais}h totais</span>
          </div>
          {sub && <p className="text-[10px] text-slate-400 font-bold mt-2">{sub}</p>}
          
          {dados.detalhes && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 bg-slate-900 text-white text-[10px] font-mono p-3 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-pre w-max z-[9999] border border-slate-700">
              <span className="block text-amber-400 font-black mb-1.5 uppercase tracking-wider border-b border-slate-700 pb-1">Divisão de Carga no Setor</span>
              <span className="leading-relaxed text-slate-200">{dados.detalhes}</span>
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}