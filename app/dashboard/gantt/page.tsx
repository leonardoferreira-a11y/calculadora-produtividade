"use client";
import { useState, useEffect, useMemo, memo, useCallback } from 'react';

type VisaoGantt = 'DIAS' | 'SEMANAS' | 'MESES';

function obterSetorPertencente(tipo: string, etapa: string): string {
  const t = String(tipo || '').toLowerCase(); const e = String(etapa || '').toLowerCase();
  if (t.includes('impress') || e.includes('impress')) return 'Impressão';
  if (t.includes('laminac') || t.includes('benefic') || e.includes('benefic')) return 'Beneficiamento';
  if (t.includes('dobra') || e.includes('dobra')) return 'Dobra';
  if (t.includes('corte') || t.includes('vinco') || e.includes('corte')) return 'Corte e Vinco';
  if (t.includes('shrink') || t.includes('encaixot') || e.includes('shrink') || e.includes('box') || t.includes('kit') || e.includes('kit')) return 'Formação de Kit';
  if (t.includes('alceade') || e.includes('alcead')) return 'Alceadeira';
  if (t.includes('cola') || e.includes('cola') || t.includes('pur') || e.includes('pur')) return 'Acabamentos Finais';
  return 'Acabamentos Finais';
}

const MachineRow = memo(function MachineRow({
  mq, tarefasDaMaquina, gridCells, ppd, dataInicioAbsMs,
  travasCalendario, mapaCoresLotes, skuDestacado, loteFocado, kitComponentesDestacados,
  onClickBloco, onDoubleClickCell,
}: {
  mq: any; tarefasDaMaquina: any[]; gridCells: any[]; ppd: number;
  dataInicioAbsMs: number; travasCalendario: any[]; mapaCoresLotes: Record<string, string>;
  skuDestacado: string | null; loteFocado: string | null; kitComponentesDestacados: Set<string>;
  onClickBloco: (tarefa: any) => void;
  onDoubleClickCell: (mqId: string, dateStr: string) => void;
}) {
  const maxSub = tarefasDaMaquina.reduce((max: number, t: any) => Math.max(max, t.sub_linha || 0), 0);
  const alturaLinhaCalculada = Math.max(56, (maxSub + 1) * 36 + 18);

  // Heavy: capacity loops — only recompute when cells/machine/travas change, NOT on sku click
  const cellData = useMemo(() => gridCells.map((cell, i) => {
    const tarefasNaCelula = tarefasDaMaquina.filter((t: any) => t._msInicio < cell.endMs && t._msFim > cell.startMs);
    let capacidadeTotalPeriodo = 0;
    let tempData = new Date(cell.startMs);
    while (tempData.getTime() <= cell.endMs) {
      const dataStr = `${tempData.getUTCFullYear()}-${String(tempData.getUTCMonth()+1).padStart(2,'0')}-${String(tempData.getUTCDate()).padStart(2,'0')}`;
      const dayW = tempData.getUTCDay();
      const lock = travasCalendario.find((tv: any) => String(tv.maquina_id).toUpperCase().trim() === String(mq.id).toUpperCase().trim() && String(tv.data_alvo || tv.data_trava).startsWith(dataStr));
      let cap = Number(mq.horas_diarias || 24);
      if (lock) { cap = lock.status_operacional === 'INATIVO' ? 0 : Number(lock.horas_disponiveis); }
      else { if ((Number(mq.dias_trabalho) === 5 && (dayW === 0 || dayW === 6)) || (Number(mq.dias_trabalho) === 6 && dayW === 0)) cap = 0; }
      capacidadeTotalPeriodo += cap;
      tempData.setUTCDate(tempData.getUTCDate() + 1);
    }
    const totalJanela = cell.mode === 'DIA' ? 24 : ((cell.width / ppd) * 24);
    let cellTitle = `Período: ${cell.labelStart} até ${cell.labelEnd}\n`;
    cellTitle += `⏱️ Capacidade Máxima Útil: ${capacidadeTotalPeriodo.toFixed(1)}h\n`;
    cellTitle += `🛑 Desligamento / Turno Parado (Regra): ${(totalJanela - capacidadeTotalPeriodo).toFixed(1)}h\n`;
    if (tarefasNaCelula.length > 0) {
      const skus = Array.from(new Set(tarefasNaCelula.map((t: any) => t.sku_alvo)));
      let hOcupadas = 0;
      tarefasNaCelula.forEach((t: any) => {
        const oStartMs = Math.max(t._msInicio, cell.startMs);
        const oEndMs = Math.min(t._msFim, cell.endMs);
        const diffH = (oEndMs - oStartMs) / (1000*60*60);
        if (diffH > 0) hOcupadas += diffH;
      });
      cellTitle += `\n📦 SKUs na linha: ${skus.length}\n⏱️ Horas Ocupadas: ${hOcupadas.toFixed(1)}h\n⏱️ Saldo Útil Livre: ${Math.max(0, capacidadeTotalPeriodo - hOcupadas).toFixed(1)}h\n\nOrdens:\n${(skus as string[]).join(', ')}`;
    } else { cellTitle += `\n✅ Totalmente Livre`; }
    return { cell, capacidadeTotalPeriodo, cellTitle, idx: i };
  }), [tarefasDaMaquina, gridCells, mq, travasCalendario, ppd]);

  // Positioning + tooltip text — only recompute when tasks or scale change, NOT on sku click
  const taskBlocks = useMemo(() => tarefasDaMaquina.map((tarefa: any) => {
    const startMs = tarefa._msInicio - dataInicioAbsMs;
    const endMs = tarefa._msFim - dataInicioAbsMs;
    const left = `${(startMs / (1000*3600*24)) * ppd}px`;
    const width = `${((endMs - startMs) / (1000*3600*24)) * ppd}px`;
    const widthNum = ((endMs - startMs) / (1000*3600*24)) * ppd;
    const dTop = 6 + (tarefa.sub_linha || 0) * 36;
    const dadosExtras = tarefa.dados_tooltip || {};
    const dtInicio = new Date(tarefa._msInicio).toLocaleString('pt-BR', { timeZone:'UTC', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const dtFim = new Date(tarefa._msFim).toLocaleString('pt-BR', { timeZone:'UTC', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const kitSkusList: string[] = dadosExtras.kit_skus || [];
    const kitSkusLine = kitSkusList.length > 0 ? `\n\n📦 ITENS DO KIT (${kitSkusList.length}):\n${kitSkusList.join(', ')}` : '';
    const tooltipTexto = `📋 LOTE: ${tarefa.filtro_producao}\n🔖 SKU: ${tarefa.sku_alvo}\n⚙️ ETAPA: ${tarefa.nome_etapa}\n📦 Tiragem: ${dadosExtras.tiragem||'N/A'}\n📄 Paginação: ${dadosExtras.paginacao||'N/A'}\n🎨 Acabamento: ${dadosExtras.acabamento||'N/A'}${kitSkusLine}\n\n⏱️ Duração Teórica Bruta: ${Number(tarefa.tempo_estimado_horas).toFixed(2)}h\n⏱️ Carga Ativa Ocupada: ${Number(tarefa.tempo_producao_efetivo).toFixed(2)}h\n\n🛑 Tempo Retido em Fila (Espera): ${Number(tarefa.tempo_espera_fila||0).toFixed(2)}h\n🛑 Horas Indisponíveis (Madrugadas / Regra): ${Number(tarefa.tempo_indisponivel_regra||0).toFixed(2)}h\n\n🟢 INÍCIO EFETIVO: ${dtInicio}\n🔴 FINAL OPERAÇÃO: ${dtFim}`;
    return { tarefa, left, width, widthNum, dTop, tooltipTexto };
  }), [tarefasDaMaquina, dataInicioAbsMs, ppd]);

  return (
    <div style={{ height: `${alturaLinhaCalculada}px` }} className="w-full border-b flex relative bg-white transition-all border-b-slate-200">
      {cellData.map(({ cell, capacidadeTotalPeriodo, cellTitle, idx }) => (
        <div key={`bg-cell-${idx}`} title={cellTitle} style={{ width: `${cell.width}px` }}
          className={`flex-shrink-0 border-r border-dashed h-full hover:bg-black/5 cursor-crosshair transition-colors ${cell.isBgInativo || capacidadeTotalPeriodo === 0 ? 'bg-slate-100/80' : ''}`}
          onDoubleClick={() => {
            const d = cell.start;
            const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
            onDoubleClickCell(String(mq.id), dateStr);
          }}
        ></div>
      ))}
      {taskBlocks.map(({ tarefa, left, width, widthNum, dTop, tooltipTexto }) => {
        const corClasseFinal = `${mapaCoresLotes[tarefa.filtro_producao] || 'bg-slate-500 border-slate-700'} text-white`;
        const isKitBlock = tarefa.nome_etapa === 'Encaixotamento' || tarefa.nome_etapa === 'Shrink';
        const kitSkus: string[] = tarefa.dados_tooltip?.kit_skus || [];
        const hasKitHighlight = kitComponentesDestacados.size > 0;
        const isDimmedBySku = skuDestacado && skuDestacado !== tarefa.sku_alvo && !(hasKitHighlight && kitComponentesDestacados.has(tarefa.sku_alvo));
        const isDimmedByFoco = loteFocado && tarefa.filtro_producao !== loteFocado;
        const isDimmedByKit = hasKitHighlight && !kitComponentesDestacados.has(tarefa.sku_alvo) && !kitSkus.includes(tarefa.sku_alvo);
        const opacityClass = (isDimmedBySku || isDimmedByFoco || isDimmedByKit)
          ? 'opacity-20 grayscale scale-[0.98] pointer-events-none'
          : 'transition-all duration-150 shadow-md hover:z-50 hover:scale-105';
        return (
          <div key={tarefa.id} onClick={() => onClickBloco(tarefa)}
            className={`absolute h-7 ${corClasseFinal} ${opacityClass} rounded flex flex-col justify-center px-1.5 cursor-pointer font-mono overflow-hidden whitespace-nowrap min-w-[20px] pointer-events-auto shadow ${tarefa.is_antecipacao ? 'border-2 border-dashed border-red-400' : 'border'}`}
            style={{ left, width, top: `${dTop}px` }} title={tooltipTexto}>
            <span className="text-[9px] font-black truncate block">{tarefa.sku_alvo}</span>
            {widthNum > 50 && <span className="text-[7px] opacity-80 truncate block uppercase">{tarefa.nome_etapa} (F.{tarefa.sub_linha + 1})</span>}
          </div>
        );
      })}
    </div>
  );
});

export default function GanttIndustrial() {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [graficaSelecionada, setGraficaSelecionada] = useState('');
  const [graficasDisponiveis, setGraficasDisponiveis] = useState<string[]>([]);
  const [maquinas, setMaquinas] = useState<any[]>([]);
  const [tarefasGlobais, setTarefasGlobais] = useState<any[]>([]);
  const [mapaCoresLotes, setMapaCoresLotes] = useState<Record<string, string>>({});
  const [visao, setVisao] = useState<VisaoGantt>('DIAS');
  const [draftPrioridades, setDraftPrioridades] = useState<string[]>([]);
  const [draftLotesOcultos, setDraftLotesOcultos] = useState<Set<string>>(new Set());
  const [draftOtimizarLacunas, setDraftOtimizarLacunas] = useState(false);
  const [appliedLotesOcultos, setAppliedLotesOcultos] = useState<Set<string>>(new Set());
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [showFiltroLote, setShowFiltroLote] = useState(false);
  const [zoomPixelsPorDia, setZoomPixelsPorDia] = useState(140);
  const [skuDestacado, setSkuDestacado] = useState<string | null>(null);
  const [buscaSkuQuery, setBuscaSkuQuery] = useState('');
  const [simuladores, setSimuladores] = useState<Record<string, { usadas: number, modo: string }>>({});
  const [showModalTravas, setShowModalTravas] = useState(false);
  const [showModalRelatorio, setShowModalRelatorio] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'TRAVAS' | 'REGIME'>('TRAVAS');
  const [travasCalendario, setTravasCalendario] = useState<any[]>([]);
  const [idsSelecionados, setIdsSelecionados] = useState<string[]>([]);
  const [diasMassa, setDiasMassa] = useState(5);
  const [horasMassa, setHorasMassa] = useState('24.00');
  const [maquinaTrava, setMaquinaTrava] = useState('');
  const [dataAlvoTrava, setDataAlvoTrava] = useState('');
  const [statusOperacional, setStatusOperacional] = useState('INATIVO');
  const [horasDisponiveis, setHorasDisponiveis] = useState('0.00');
  const [motivoTrava, setMotivoTrava] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [loteFocado, setLoteFocado] = useState<string | null>(null);
  const [showModalEditeDatas, setShowModalEditeDatas] = useState(false);
  const [blocoEditando, setBlocoEditando] = useState<any>(null);
  const [novaDataInicio, setNovaDataInicio] = useState('');
  const [erroDataInicio, setErroDataInicio] = useState('');
  const [impactoToast, setImpactoToast] = useState<string | null>(null);
  const [fasesOverrides, setFasesOverrides] = useState<Record<string, string>>({});
  const [kitComponentesDestacados, setKitComponentesDestacados] = useState<Set<string>>(new Set());

  const setoresFixos = ['Impressão', 'Beneficiamento', 'Dobra', 'Corte e Vinco', 'Alceadeira', 'Acabamentos Finais', 'Formação de Kit'];
  const PALETA_LOTES = ["bg-blue-500 border-blue-700", "bg-emerald-500 border-emerald-700", "bg-rose-500 border-rose-700", "bg-amber-500 border-amber-700", "bg-purple-500 border-purple-700", "bg-sky-500 border-sky-700", "bg-fuchsia-500 border-fuchsia-700", "bg-lime-500 border-lime-700", "bg-orange-500 border-orange-700"];

  useEffect(() => {
    fetch(`/api/producao/miolo/filtros?ts=${Date.now()}`).then(res => res.json()).then(dados => {
      setGraficasDisponiveis(Array.from(new Set(dados.map((d: any) => String(d.grafica).toUpperCase()))) as string[]);
    }).catch(() => {});
    const saved = localStorage.getItem('gantt_simulacao_estado');
    if (saved) { try { setSimuladores(JSON.parse(saved)); } catch(e){} }
  }, []);

  useEffect(() => {
    localStorage.setItem('gantt_hidden_lots', JSON.stringify([...appliedLotesOcultos]));
  }, [appliedLotesOcultos]);

  const carregarTravasDoBanco = async (graficaAlvo: string) => {
    try { const res = await fetch(`/api/producao/gantt/travas?grafica=${graficaAlvo}`); if (res.ok) setTravasCalendario(await res.json()); } catch (e) {}
  };

  const abrirGanttDaGrafica = async (graficaAlvo: string, simParams = simuladores, lotesParaAgendar: string[] = [], prioridades: string[] = []) => {
    if (isLoading) return;
    setIsLoading(true);
    setGraficaSelecionada(graficaAlvo);
    try {
      setLoadingMsg('Consultando o banco de dados das máquinas...');
      const resMaq = await fetch(`/api/maquinas?ts=${Date.now()}`);
      const dadosMaq = await resMaq.json();
      const mFiltradas = dadosMaq.filter((m: any) => String(m.grafica || '').toUpperCase() === graficaAlvo);
      let listaMaquinasFinal = mFiltradas.filter((m: any) => !String(m.modelo).toLowerCase().includes('espiralar'));
      const espiraisFisicas = mFiltradas.filter((m: any) => String(m.modelo).toLowerCase().includes('espiralar') || String(m.tipo).toLowerCase().includes('espiral'));
      const capacidadePessoasEspiral = espiraisFisicas.reduce((acc: number, m: any) => acc + Math.max(Number(m.pessoas || 1), Number(m.maquinas || 1)), 0);
      const limiteFinalEspiral = Math.max(1, capacidadePessoasEspiral);
      listaMaquinasFinal.push({ id: 'ESPIRALAR_MANUAL_UNIFIED', modelo: 'Linha Unificada de Espiralação Manual', tipo: 'Acabamentos Finais', dias_trabalho: espiraisFisicas[0]?.dias_trabalho || 5, horas_diarias: espiraisFisicas[0]?.horas_diarias || 24, maquinas: limiteFinalEspiral, pessoas: limiteFinalEspiral, grafica: graficaAlvo });

      setLoadingMsg('Roteando e calculando milhares de tarefas...');
      const resTar = await fetch(`/api/producao/gantt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grafica: graficaAlvo, simuladores: simParams, prioridades, lotesVisiveis: lotesParaAgendar }) });
      const ts = await resTar.json();
      const dadosValidos = Array.isArray(ts) ? ts : [];

      setLoadingMsg('Sincronizando as regras e montando o calendário...');
      const lotesUnicos = Array.from(new Set(dadosValidos.map((t: any) => t.filtro_producao)));
      const mapaCoresTemporario: Record<string, string> = {};
      lotesUnicos.forEach((lote, index) => { mapaCoresTemporario[lote as string] = PALETA_LOTES[index % PALETA_LOTES.length]; });
      setMapaCoresLotes(mapaCoresTemporario);

      const maquinasIds = new Set(listaMaquinasFinal.map((m: any) => String(m.id).trim().toUpperCase()));
      dadosValidos.forEach(t => {
        const tIdNormal = String(t.maquina_id).trim().toUpperCase();
        if (!maquinasIds.has(tIdNormal)) {
          listaMaquinasFinal.push({ id: t.maquina_id, modelo: t.maq_modelo || `Equipamento: ${t.nome_etapa}`, tipo: t.maq_tipo || obterSetorPertencente('', t.nome_etapa), dias_trabalho: t.dias_trabalho || 5, horas_diarias: t.horas_diarias || 24, maquinas: Math.max(1, Number(t.total_maquinas_parque || 1)), pessoas: Math.max(1, Number(t.total_pessoas_parque || 1)), grafica: graficaAlvo });
          maquinasIds.add(tIdNormal);
        }
      });

      setMaquinas(listaMaquinasFinal);
      setTarefasGlobais(dadosValidos);
      setDraftLotesOcultos(new Set());
      setAppliedLotesOcultos(new Set());
      setIsDirty(false);
      // Reset to only the lotes from this gráfica (prevent cross-gráfica contamination)
      setDraftPrioridades(prev => {
        const refOrder = prioridades.length > 0 ? prioridades : prev;
        const novosMissing = (lotesUnicos as string[]).filter(l => !refOrder.includes(l));
        return [...refOrder.filter(l => (lotesUnicos as string[]).includes(l)), ...novosMissing];
      });
      await carregarTravasDoBanco(graficaAlvo);
      setEtapa(2);
    } catch(e) {
      setImpactoToast('⚠️ Falha na conexão. Recarregue a página e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAlterarSimulacao = useCallback((maquinaId: string, qtdUsadas: number, modo: string) => {
    setSimuladores(prev => {
      const n = { ...prev, [maquinaId]: { usadas: qtdUsadas, modo } };
      localStorage.setItem('gantt_simulacao_estado', JSON.stringify(n));
      return n;
    });
    setIsDirty(true);
  }, []);

  const handleRecalcularGantt = () => {
    setAppliedLotesOcultos(new Set(draftLotesOcultos));
    setIsDirty(false);
    const lotesVisiveis = draftOtimizarLacunas ? draftPrioridades.filter(l => !draftLotesOcultos.has(l)) : [];
    abrirGanttDaGrafica(graficaSelecionada, simuladores, lotesVisiveis, draftPrioridades);
  };

  const handleDragStart = (idx: number) => setDragFromIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragFromIdx === null || dragFromIdx === idx) return;
    setDraftPrioridades(prev => {
      const next = [...prev];
      const [item] = next.splice(dragFromIdx, 1);
      next.splice(idx, 0, item);
      return next;
    });
    setDragFromIdx(idx);
    setIsDirty(true);
  };
  const handleDragEnd = () => setDragFromIdx(null);

  const handlePriorityInput = (oldIdx: number, novoValorNum: number) => {
    const novoIdx = Math.max(0, Math.min(draftPrioridades.length - 1, novoValorNum - 1));
    if (novoIdx === oldIdx) return;
    setDraftPrioridades(prev => {
      const next = [...prev];
      const [item] = next.splice(oldIdx, 1);
      next.splice(novoIdx, 0, item);
      return next;
    });
    setIsDirty(true);
  };

  const handleAplicarRegimeEmMassa = async () => {
    try {
      await Promise.all(idsSelecionados.map(id => fetch('/api/maquinas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, grafica: graficaSelecionada, dias_trabalho: diasMassa, horas_diarias: parseFloat(horasMassa) }) })));
      setIdsSelecionados([]); abrirGanttDaGrafica(graficaSelecionada);
    } catch (e) {}
  };

  const toggleSelecionarTudo = () => setIdsSelecionados(idsSelecionados.length === maquinas.length ? [] : maquinas.map(m => m.id));

  const handleAdicionarTrava = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/producao/gantt/travas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grafica: graficaSelecionada, maquina_id: maquinaTrava, data_alvo: dataAlvoTrava, status_operacional: statusOperacional, horas_disponiveis: parseFloat(horasDisponiveis || '0'), motivo: motivoTrava }) });
      if (res.ok) { setMotivoTrava(''); abrirGanttDaGrafica(graficaSelecionada); }
    } catch (err) {}
  };

  const handleClickBloco = useCallback((tarefa: any) => {
    const sku = tarefa.sku_alvo;
    setSkuDestacado(prev => prev === sku ? null : sku);
    // Kit highlight: light up all component SKUs
    const kitSkus: string[] = tarefa.dados_tooltip?.kit_skus || [];
    if (kitSkus.length > 0) {
      setKitComponentesDestacados(prev => {
        if (prev.has(sku)) { return new Set(); }
        return new Set([sku, ...kitSkus]);
      });
    } else {
      setKitComponentesDestacados(new Set());
    }
    // Open edit modal with this block's data
    setBlocoEditando(tarefa);
    const d = new Date(tarefa.data_inicio);
    setNovaDataInicio(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`);
    setErroDataInicio('');
    setShowModalEditeDatas(true);
  }, []);

  const handleDoubleClickCell = useCallback((mqId: string, dateStr: string) => {
    setMaquinaTrava(mqId);
    setDataAlvoTrava(dateStr);
    setStatusOperacional('INATIVO');
    setHorasDisponiveis('0.00');
    setMotivoTrava('');
    setAbaAtiva('TRAVAS');
    setShowModalTravas(true);
  }, []);

  const handleSalvarDataInicio = async () => {
    if (!blocoEditando || !novaDataInicio) return;
    setErroDataInicio('');
    // Snapshot old max fim
    const oldMaxFim = tarefasGlobais.reduce((max, t) => Math.max(max, new Date(t.data_fim).getTime()), 0);
    try {
      await fetch('/api/producao/gantt/datas-iniciais', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: blocoEditando.sku_alvo, filtro_producao: blocoEditando.filtro_producao, grafica: graficaSelecionada, dt_calculo: novaDataInicio, fases_overrides: fasesOverrides }),
      });
      setShowModalEditeDatas(false);
      setFasesOverrides({});
      // Recalculate silently in background
      const lotesVisiveis = draftOtimizarLacunas ? draftPrioridades.filter(l => !appliedLotesOcultos.has(l)) : [];
      const resTar = await fetch('/api/producao/gantt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grafica: graficaSelecionada, simuladores, prioridades: draftPrioridades, lotesVisiveis }) });
      const ts = await resTar.json();
      if (Array.isArray(ts)) {
        setTarefasGlobais(ts);
        const newMaxFim = ts.reduce((max: number, t: any) => Math.max(max, new Date(t.data_fim).getTime()), 0);
        const impactados = ts.filter((t: any) => t.sku_alvo !== blocoEditando.sku_alvo && new Date(t.data_fim).getTime() > oldMaxFim).length;
        const fmt = (ms: number) => ms === 0 ? '-' : new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: '2-digit' });
        const msg = oldMaxFim !== newMaxFim
          ? `✅ Mudança realizada! ${impactados} SKUs impactados. Data final: ${fmt(oldMaxFim)} → ${fmt(newMaxFim)}`
          : `✅ Data atualizada. Nenhum impacto na data final geral.`;
        setImpactoToast(msg);
        setTimeout(() => setImpactoToast(null), 8000);
      }
    } catch(e) { setErroDataInicio('Erro ao salvar. Tente novamente.'); }
  };

  const toggleFiltroLote = (lote: string) => {
    setDraftLotesOcultos(prev => {
      const next = new Set(prev);
      if (next.has(lote)) next.delete(lote); else next.add(lote);
      return next;
    });
    setIsDirty(true);
  };

  // Dates pre-parsed once. skuDestacado NOT here — it's visual-only, handled via MachineRow prop
  const tarefasFiltradas = useMemo(() => {
    return tarefasGlobais.filter(t => {
      const matchLote = !appliedLotesOcultos.has(t.filtro_producao);
      const matchSkuText = !buscaSkuQuery || String(t.sku_alvo).toUpperCase().includes(buscaSkuQuery.toUpperCase());
      return matchLote && matchSkuText;
    }).map(t => ({
      ...t,
      _msInicio: new Date(t.data_inicio).getTime(),
      _msFim: new Date(t.data_fim).getTime(),
    }));
  }, [tarefasGlobais, appliedLotesOcultos, buscaSkuQuery]);

  // Pre-grouped tasks per machine+sector — stable prop for MachineRow memo
  const tarefasPorMaquinaSetor = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const mq of maquinas) {
      const setor = obterSetorPertencente(mq.tipo, '');
      const mqId = String(mq.id).trim();
      map.set(`${setor}::${mqId}`, tarefasFiltradas.filter(t =>
        String(t.maquina_id).trim() === mqId && obterSetorPertencente(t.maq_tipo, t.nome_etapa) === setor
      ));
    }
    return map;
  }, [maquinas, tarefasFiltradas]);

  const Rulers = useMemo(() => {
    const ppd = visao === 'DIAS' ? zoomPixelsPorDia : visao === 'SEMANAS' ? (zoomPixelsPorDia / 7) : (zoomPixelsPorDia / 30);
    let minT = Infinity; let maxT = 0;
    const limitePassado = new Date('2023-01-01').getTime();
    tarefasFiltradas.forEach(t => {
      if (t._msInicio > limitePassado && t._msInicio < minT) minT = t._msInicio;
      if (t._msFim > limitePassado && t._msFim > maxT) maxT = t._msFim;
    });
    if (minT === Infinity) { minT = new Date().getTime(); maxT = minT + (30 * 24 * 3600 * 1000); }
    if ((maxT - minT) > 365 * 24 * 3600 * 1000) maxT = minT + (365 * 24 * 3600 * 1000);

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
    const macroHeader: any[] = []; const microHeader: any[] = []; const gridCells: any[] = [];

    if (visao === 'DIAS') {
      let curMonth = -1; let monthDays = 0; let mName = '';
      diasRange.forEach((d, i) => {
        if (d.getUTCMonth() !== curMonth) { if (curMonth !== -1) macroHeader.push({ label: mName, width: monthDays * ppd }); curMonth = d.getUTCMonth(); monthDays = 1; mName = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase(); } else monthDays++;
        if (i === diasRange.length - 1) macroHeader.push({ label: mName, width: monthDays * ppd });
        microHeader.push({ label: d.getUTCDate(), sub: d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }), width: ppd });
        const isBgInativo = travasCalendario.some(t => t.data_alvo?.startsWith(d.toISOString().split('T')[0])) || d.getUTCDay() === 0 || d.getUTCDay() === 6;
        const startMs = d.getTime(); const endMs = startMs + 24*3600*1000 - 1;
        const label = d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        gridCells.push({ start: new Date(d), end: new Date(endMs), startMs, endMs, width: ppd, isBgInativo, mode: 'DIA', labelStart: label, labelEnd: label });
      });
    } else if (visao === 'SEMANAS') {
      let curMonth = -1; let monthDays = 0; let mName = '';
      diasRange.forEach((d, i) => {
        if (d.getUTCMonth() !== curMonth) { if (curMonth !== -1) macroHeader.push({ label: mName, width: monthDays * ppd }); curMonth = d.getUTCMonth(); monthDays = 1; mName = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase(); } else monthDays++;
        if (i === diasRange.length - 1) macroHeader.push({ label: mName, width: monthDays * ppd });
      });
      for (let i = 0; i < diasRange.length; i += 7) {
        const chunk = diasRange.slice(i, i+7); const sDate = chunk[0]; const eDate = chunk[chunk.length-1];
        const numSemana = Math.ceil((sDate.getUTCDate() + sDate.getUTCDay()) / 7);
        microHeader.push({ label: `SEM ${numSemana}`, sub: `${sDate.getUTCDate()}/${sDate.getUTCMonth()+1}`, width: chunk.length * ppd });
        const startMs = sDate.getTime(); const endMs = eDate.getTime() + 24*3600*1000 - 1;
        gridCells.push({ start: new Date(sDate), end: new Date(endMs), startMs, endMs, width: chunk.length * ppd, isBgInativo: false, mode: 'SEMANA', labelStart: sDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' }), labelEnd: eDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) });
      }
    } else if (visao === 'MESES') {
      let curYear = -1; let yearDays = 0; let yName = '';
      diasRange.forEach((d, i) => {
        if (d.getUTCFullYear() !== curYear) { if (curYear !== -1) macroHeader.push({ label: yName, width: yearDays * ppd }); curYear = d.getUTCFullYear(); yearDays = 1; yName = String(d.getUTCFullYear()); } else yearDays++;
        if (i === diasRange.length - 1) macroHeader.push({ label: yName, width: yearDays * ppd });
      });
      let curMonth = -1; let mDays = 0; let mName = ''; let mStart: Date | null = null;
      diasRange.forEach((d, i) => {
        if (d.getUTCMonth() !== curMonth) {
          if (curMonth !== -1 && mStart) {
            const eDate = new Date(mStart); eDate.setUTCDate(eDate.getUTCDate() + mDays - 1);
            const startMs = mStart.getTime(); const endMs = eDate.getTime() + 24*3600*1000 - 1;
            microHeader.push({ label: mName, sub: '', width: mDays * ppd });
            gridCells.push({ start: mStart, end: new Date(endMs), startMs, endMs, width: mDays * ppd, isBgInativo: false, mode: 'MÊS', labelStart: mStart.toLocaleDateString('pt-BR', { timeZone: 'UTC' }), labelEnd: eDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) });
          }
          curMonth = d.getUTCMonth(); mDays = 1; mStart = d; mName = d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).toUpperCase();
        } else mDays++;
        if (i === diasRange.length - 1 && mStart) {
          const eDate = new Date(mStart); eDate.setUTCDate(eDate.getUTCDate() + mDays - 1);
          const startMs = mStart.getTime(); const endMs = eDate.getTime() + 24*3600*1000 - 1;
          microHeader.push({ label: mName, sub: '', width: mDays * ppd });
          gridCells.push({ start: mStart, end: new Date(endMs), startMs, endMs, width: mDays * ppd, isBgInativo: false, mode: 'MÊS', labelStart: mStart.toLocaleDateString('pt-BR', { timeZone: 'UTC' }), labelEnd: eDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) });
        }
      });
    }
    return { dataInicioAbs, ppd, macroHeader, microHeader, gridCells };
  }, [tarefasFiltradas, visao, zoomPixelsPorDia, travasCalendario]);

  const gerarRelatorioPorSKU = () => {
    const skusObj: Record<string, any> = {};
    tarefasFiltradas.forEach(t => {
      const start = t._msInicio; const end = t._msFim;
      const etapaStr = String(t.nome_etapa).toLowerCase();
      if (!skusObj[t.sku_alvo]) skusObj[t.sku_alvo] = {
        lote: t.filtro_producao,
        tiragem: t.dados_tooltip?.tiragem || 'N/A',
        paginacao: t.dados_tooltip?.paginacao || 'N/A',
        acabamento: t.dados_tooltip?.acabamento || 'N/A',
        inicioImp: Infinity, fimImp: 0, inicioAcab: Infinity, fimAcabFinais: 0, inicioKit: Infinity, fimKit: 0
      };
      const obj = skusObj[t.sku_alvo];
      if (etapaStr.includes('impress')) { if (start < obj.inicioImp) obj.inicioImp = start; if (end > obj.fimImp) obj.fimImp = end; }
      if (!etapaStr.includes('impress') && !etapaStr.includes('shrink') && !etapaStr.includes('encaixot') && !etapaStr.includes('kit')) { if (start < obj.inicioAcab) obj.inicioAcab = start; if (end > obj.fimAcabFinais) obj.fimAcabFinais = end; }
      if (etapaStr.includes('shrink') || etapaStr.includes('encaixot') || etapaStr.includes('kit')) { if (start < obj.inicioKit) obj.inicioKit = start; if (end > obj.fimKit) obj.fimKit = end; }
    });
    const format = (ts: number) => ts === Infinity || ts === 0 ? '-' : new Date(ts).toLocaleString('pt-BR', { timeZone:'UTC', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    return Object.entries(skusObj).map(([sku, dados]) => ({
      sku, lote: dados.lote,
      tiragem: dados.tiragem,
      paginacao: dados.paginacao,
      acabamento: dados.acabamento,
      inicioImp: format(dados.inicioImp), fimImp: format(dados.fimImp),
      inicioAcab: format(dados.inicioAcab), fimAcabFinais: format(dados.fimAcabFinais),
      inicioKit: format(dados.inicioKit), fimKit: format(dados.fimKit)
    })).sort((a, b) => a.lote.localeCompare(b.lote));
  };

  const exportarRelatorioCSV = () => {
    const dados = gerarRelatorioPorSKU();
    if (dados.length === 0) return alert("Nenhum dado para exportar.");
    let csvContent = "Lote;SKU;Tiragem;Paginacao;Acabamento;Inicio Impressao;Fim Impressao;Inicio Acabamentos;Fim Acabamentos Finais;Inicio Formacao Kit;Termino Geral\n";
    dados.forEach(d => { csvContent += `${d.lote};${d.sku};${d.tiragem || ''};${d.paginacao || ''};${d.acabamento || ''};${d.inicioImp};${d.fimImp};${d.inicioAcab};${d.fimAcabFinais};${d.inicioKit};${d.fimKit}\n`; });
    const blob = new Blob(["﻿" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.setAttribute("download", `Gantt_Prazos_${graficaSelecionada}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <div className="w-full relative">
      {isLoading && (
        <div className="fixed inset-0 bg-slate-900/90 z-[9999] flex flex-col justify-center items-center backdrop-blur-sm">
          <i className="fas fa-layer-group text-6xl text-violet-500 mb-6 animate-bounce"></i>
          <h2 className="text-2xl font-black text-white uppercase tracking-widest animate-pulse">{loadingMsg}</h2>
          <p className="text-violet-200 mt-3 font-mono text-sm border border-violet-500/50 p-3 rounded bg-violet-950/50">Por favor, aguarde o cálculo. Não clique nem recarregue a página.</p>
        </div>
      )}

      {etapa === 1 && (
        <div className="p-4">
          <header className="mb-6 border-b pb-3"><h1 className="text-xl font-bold text-slate-800 uppercase">Orquestrador de Linha de Tempo (Gantt)</h1></header>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {graficasDisponiveis.map((graf, i) => (
              <div key={i} className="bg-white border p-6 rounded-lg text-center shadow-sm cursor-pointer transition-all hover:-translate-y-1 hover:shadow-md" onClick={() => abrirGanttDaGrafica(graf)}>
                <h3 className="text-lg font-black text-slate-800 uppercase mb-4">{graf}</h3>
                <button disabled={isLoading} className="w-full bg-violet-600 text-white px-4 py-2 rounded text-xs font-bold uppercase hover:bg-violet-700 disabled:opacity-50">Abrir Painel Gráfico</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {etapa === 2 && (
        <div className="w-full h-[calc(100vh-140px)] flex flex-col border rounded-lg overflow-hidden bg-white">
          <header className="bg-slate-800 text-white p-3 flex justify-between items-center z-50 select-none">
            <h1 className="text-sm font-bold uppercase">Parque Produtivo: {graficaSelecionada}</h1>
            <div className="flex gap-3 items-center">
              <div className="relative flex items-center bg-slate-700 rounded border border-slate-600 px-2 py-1">
                <i className="fas fa-search text-slate-400 text-xs mr-2"></i>
                <input type="text" placeholder="Filtrar SKU..." value={buscaSkuQuery} onChange={(e) => setBuscaSkuQuery(e.target.value)} className="bg-transparent text-white font-mono font-bold text-xs outline-none w-32 placeholder-slate-400" />
                {buscaSkuQuery && <button onClick={() => setBuscaSkuQuery('')} className="text-slate-400 font-bold hover:text-white">&times;</button>}
              </div>
              <div className="flex items-center gap-1 bg-slate-700 p-1 rounded border border-slate-600">
                <button onClick={() => setVisao('DIAS')} className={`text-[10px] font-bold px-3 py-1 rounded cursor-pointer transition-all duration-200 active:scale-95 ${visao === 'DIAS' ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-slate-600 hover:text-white'}`}>DIAS</button>
                <button onClick={() => setVisao('SEMANAS')} className={`text-[10px] font-bold px-3 py-1 rounded cursor-pointer transition-all duration-200 active:scale-95 ${visao === 'SEMANAS' ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-slate-600 hover:text-white'}`}>SEMANAS</button>
                <button onClick={() => setVisao('MESES')} className={`text-[10px] font-bold px-3 py-1 rounded cursor-pointer transition-all duration-200 active:scale-95 ${visao === 'MESES' ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-slate-600 hover:text-white'}`}>MESES</button>
              </div>

              <div className="relative">
                <button onClick={() => setShowFiltroLote(!showFiltroLote)} className={`border font-bold px-3 py-1.5 rounded text-xs flex items-center gap-2 cursor-pointer transition-all duration-200 active:scale-95 ${loteFocado ? 'bg-amber-500 border-amber-600 text-white' : 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600'}`}>
                  <i className="fas fa-layer-group"></i>
                  Prioridades {loteFocado ? `• ${String(loteFocado).substring(0, 8)}` : `(${draftLotesOcultos.size === 0 ? 'Todos' : `${draftPrioridades.length - draftLotesOcultos.size} vis.`})`}
                </button>
                {showFiltroLote && (
                  <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-[9000] overflow-hidden">
                    <div className="bg-slate-800 text-white px-4 py-2.5 flex justify-between items-center">
                      <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-2"><i className="fas fa-sort-amount-down text-violet-400"></i> Painel de Prioridades</span>
                      <button onClick={() => setShowFiltroLote(false)} className="text-slate-400 hover:text-white text-sm font-bold">&times;</button>
                    </div>
                    <div className="px-4 py-2.5 bg-slate-50 border-b flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-black text-slate-700 uppercase">Otimizar Lacunas</p>
                        <p className="text-[9px] text-slate-400 font-medium">Modo Fluido: preenche buracos ao recalcular</p>
                      </div>
                      <button onClick={() => { setDraftOtimizarLacunas(v => !v); setIsDirty(true); }} className={`w-10 h-5 rounded-full transition-all duration-300 relative cursor-pointer ${draftOtimizarLacunas ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${draftOtimizarLacunas ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <div className="px-4 py-2 border-b flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-slate-400">Nº ou arraste — P1 = maior prioridade</span>
                      <div className="flex gap-2">
                        <button onClick={() => { setDraftLotesOcultos(new Set()); setIsDirty(true); }} className="text-[10px] text-violet-600 font-bold hover:underline cursor-pointer">Todos</button>
                        <button onClick={() => { setDraftLotesOcultos(new Set(draftPrioridades)); setIsDirty(true); }} className="text-[10px] text-slate-500 font-bold hover:underline cursor-pointer">Nenhum</button>
                        {loteFocado && <button onClick={() => setLoteFocado(null)} className="text-[10px] text-amber-600 font-bold hover:underline cursor-pointer">✕ Foco</button>}
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {draftPrioridades.map((lote, idx) => {
                        const ativo = !draftLotesOcultos.has(lote as string);
                        const isFocado = loteFocado === lote;
                        return (
                          <div key={`pri-${idx}`} draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => handleDragOver(e, idx)} onDragEnd={handleDragEnd}
                            className={`flex items-center gap-2 px-3 py-2 transition-colors cursor-grab active:cursor-grabbing select-none ${isFocado ? 'bg-amber-50 border-l-2 border-amber-400' : 'hover:bg-slate-50'} ${!ativo ? 'opacity-40' : ''} ${dragFromIdx === idx ? 'opacity-60 bg-violet-50' : ''}`}>
                            <input
                              type="number" min={1} max={draftPrioridades.length} value={idx + 1}
                              onChange={(e) => handlePriorityInput(idx, Number(e.target.value))}
                              onClick={(e) => (e.target as HTMLInputElement).select()}
                              className="w-8 text-[10px] font-black text-slate-600 text-center border border-slate-200 rounded bg-white outline-none focus:border-violet-400 px-0.5 cursor-text"
                            />
                            <span className="text-slate-300 hover:text-violet-400 text-xs" title="Arraste para reordenar">⠿</span>
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${(mapaCoresLotes[lote as string] || 'bg-slate-400').split(' ')[0]}`}></span>
                            <button onClick={() => setLoteFocado(isFocado ? null : lote as string)}
                              className={`flex-1 text-left text-xs font-bold truncate cursor-pointer transition-colors ${isFocado ? 'text-amber-700' : 'text-slate-700 hover:text-violet-700'}`}
                              title={`Clique para focar em: ${lote}`}>
                              {String(lote || 'SEM LOTE')}
                              {isFocado && <span className="ml-1 text-amber-500 text-[9px]">★ FOCO</span>}
                            </button>
                            <input type="checkbox" className="w-3.5 h-3.5 accent-violet-600 cursor-pointer flex-shrink-0" checked={ativo} onChange={() => toggleFiltroLote(lote as string)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {isDirty && (
                <button onClick={handleRecalcularGantt} className="bg-emerald-500 hover:bg-emerald-400 text-white font-black px-4 py-1.5 rounded text-xs shadow-lg animate-pulse flex items-center gap-2 cursor-pointer active:scale-95 transition-all">
                  <i className="fas fa-sync-alt"></i> Simular / Recalcular
                </button>
              )}
              {(skuDestacado || kitComponentesDestacados.size > 0) && <button onClick={() => { setSkuDestacado(null); setKitComponentesDestacados(new Set()); }} className="bg-amber-500 text-slate-900 font-bold px-2 py-1.5 rounded text-[10px] uppercase shadow">Limpar SKU</button>}
              <button onClick={() => setShowModalRelatorio(true)} className="bg-teal-600 hover:bg-teal-500 text-white font-bold px-3 py-1.5 rounded text-xs shadow-sm"><i className="fas fa-file-alt mr-1"></i> Prazos</button>
              <button onClick={() => setShowModalTravas(true)} className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-3 py-1.5 rounded text-xs shadow-sm"><i className="fas fa-calendar-alt mr-1"></i> Calendário</button>
              <div className="flex items-center gap-2 bg-slate-700 p-1.5 rounded"><span className="text-[10px] text-slate-300 font-bold uppercase">Zoom:</span><input type="range" min="60" max="800" value={zoomPixelsPorDia} onChange={(e) => setZoomPixelsPorDia(Number(e.target.value))} className="w-24 accent-violet-500 cursor-pointer" /></div>
              <button onClick={() => { setSkuDestacado(null); setEtapa(1); }} className="bg-slate-700 text-white font-bold px-3 py-1.5 rounded text-xs border border-slate-600 hover:bg-slate-600">Voltar</button>
            </div>
          </header>

          <div className="flex-1 overflow-auto bg-slate-50/20 relative">
            <div className="flex w-max min-w-full">
              <div className="w-[300px] flex-shrink-0 sticky left-0 z-30 bg-slate-50 border-r flex flex-col shadow-md select-none">
                <div className="h-[74px] bg-slate-200 border-b flex items-center px-4 font-bold text-xs uppercase text-slate-600 sticky top-0 left-0 z-50">Equipamentos</div>
                <div className="flex-1">
                  {setoresFixos.map(setor => {
                    const maqSetor = maquinas.filter(m => obterSetorPertencente(m.tipo, '') === setor);
                    if (maqSetor.length === 0) return null;
                    return (
                      <div key={setor}>
                        <div className="h-[30px] bg-slate-200/50 text-[10px] font-black uppercase text-violet-900 px-4 flex items-center border-b z-10 relative">{setor}</div>
                        {maqSetor.map(mq => {
                          const configMq = simuladores[mq.id] || { usadas: 1, modo: 'DILUIR' };
                          const tarefasDaMq = tarefasPorMaquinaSetor.get(`${setor}::${String(mq.id).trim()}`) || [];
                          const maxSub = tarefasDaMq.reduce((max: number, t: any) => Math.max(max, t.sub_linha || 0), 0);
                          const alturaLinhaCalculada = Math.max(56, (maxSub + 1) * 36 + 18);
                          return (
                            <div key={`${setor}-${mq.id}`} style={{ height: `${alturaLinhaCalculada}px` }} className="border-b px-4 py-1.5 flex flex-col justify-center bg-white border-r hover:bg-slate-50/60 transition-all border-b-slate-200">
                              <span className="text-xs font-bold text-slate-800 truncate" title={`[${mq.tipo || 'Geral'}] ${mq.modelo}`}>[{mq.tipo || 'Geral'}] {mq.modelo}</span>
                              <div className="flex justify-between items-center gap-1 mt-1 text-[9px]">
                                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
                                  <span className="text-slate-400 font-mono font-bold">Usar:</span>
                                  <select value={configMq.usadas} onChange={(e) => handleAlterarSimulacao(mq.id, Number(e.target.value), configMq.modo)} className="bg-white border rounded text-[9px] px-0.5 font-black outline-none">{Array.from({ length: Math.max(1, Number(mq.maquinas || mq.pessoas || 1)) }).map((_, i) => (<option key={i+1} value={i+1}>{i+1}</option>))}</select>
                                  <select value={configMq.modo} onChange={(e) => handleAlterarSimulacao(mq.id, configMq.usadas, e.target.value)} className="bg-white border rounded text-[9px] px-0.5 font-black text-violet-700 outline-none">
                                    <option value="DILUIR">Diluir Carga</option>
                                    <option value="CONCORRENTE">Concorrente</option>
                                    <option value="MISTÃO">Mistão (Auto)</option>
                                  </select>
                                </div>
                                <span className="bg-slate-800 text-slate-200 px-1 rounded-sm font-mono font-bold">{mq.dias_trabalho || 5}D/{parseInt(mq.horas_diarias || 24)}h</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 flex flex-col relative">
                <div className="flex flex-col sticky top-0 z-40 bg-white border-b shadow-md w-max min-w-full select-none">
                  <div className="flex h-6 bg-slate-100 text-[9px] font-bold text-slate-500 font-mono border-b border-slate-200 divide-x divide-slate-200">
                    {Rulers.macroHeader.map((m, i) => (<div key={i} style={{ width: `${m.width}px` }} className="flex-shrink-0 text-center flex items-center justify-center bg-slate-200/40 text-violet-950 font-black tracking-tight uppercase px-0.5 truncate">{m.label}</div>))}
                  </div>
                  <div className="flex h-12 text-[11px] font-bold text-slate-700 font-mono divide-x divide-slate-100">
                    {Rulers.microHeader.map((m, i) => (<div key={i} style={{ width: `${m.width}px` }} className="flex-shrink-0 flex flex-col justify-center items-center bg-white text-slate-700"><span className="text-[9px] uppercase text-slate-400">{m.sub}</span><span className="text-xs font-black">{m.label}</span></div>))}
                  </div>
                </div>

                <div className="relative w-max min-w-full z-10">
                  {setoresFixos.map(setor => {
                    const maqSetor = maquinas.filter(m => obterSetorPertencente(m.tipo, '') === setor);
                    if (maqSetor.length === 0) return null;
                    return (
                      <div key={`grid-${setor}`}>
                        <div className="h-[30px] w-full border-b bg-slate-100/40"></div>
                        {maqSetor.map(mq => (
                          <MachineRow
                            key={`grid-mq-${mq.id}`}
                            mq={mq}
                            tarefasDaMaquina={tarefasPorMaquinaSetor.get(`${setor}::${String(mq.id).trim()}`) || []}
                            gridCells={Rulers.gridCells}
                            ppd={Rulers.ppd}
                            dataInicioAbsMs={Rulers.dataInicioAbs.getTime()}
                            travasCalendario={travasCalendario}
                            mapaCoresLotes={mapaCoresLotes}
                            skuDestacado={skuDestacado}
                            loteFocado={loteFocado}
                            kitComponentesDestacados={kitComponentesDestacados}
                            onClickBloco={handleClickBloco}
                            onDoubleClickCell={handleDoubleClickCell}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST DE IMPACTO */}
      {impactoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-3 animate-in slide-in-from-bottom-4">
          <i className="fas fa-check-circle text-emerald-400"></i>
          {impactoToast}
          <button onClick={() => setImpactoToast(null)} className="ml-2 text-slate-400 hover:text-white">&times;</button>
        </div>
      )}

      {/* MODAL EDIÇÃO DE DATAS */}
      {showModalEditeDatas && blocoEditando && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-[9998] p-4 backdrop-blur-xs" onClick={(e) => { if (e.target === e.currentTarget) setShowModalEditeDatas(false); }}>
          <div className="bg-white rounded-xl shadow-2xl border w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
            <header className="bg-slate-800 p-4 text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wide"><i className="fas fa-calendar-edit mr-2 text-violet-400"></i>Detalhes do Lote / SKU</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">{blocoEditando.filtro_producao} · {blocoEditando.sku_alvo}</p>
              </div>
              <button onClick={() => setShowModalEditeDatas(false)} className="text-slate-400 hover:text-white text-xl font-bold">&times;</button>
            </header>

            <div className="flex-1 overflow-auto p-4">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Fases Previstas</h4>
              <div className="border rounded-lg overflow-hidden text-xs mb-4">
                <table className="w-full">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase">
                    <tr><th className="p-2 text-left">Etapa</th><th className="p-2 text-center">Início</th><th className="p-2 text-center">Fim</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tarefasGlobais
                      .filter(t => t.sku_alvo === blocoEditando.sku_alvo && t.filtro_producao === blocoEditando.filtro_producao)
                      .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime())
                      .map((t, i) => (
                        <tr key={i} className={`hover:bg-slate-50 ${t.id === blocoEditando.id ? 'bg-violet-50 font-bold' : ''}`}>
                          <td className="p-2 font-medium">{t.nome_etapa}</td>
                          <td className="p-2 text-center font-mono text-slate-600">{new Date(t.data_inicio).toLocaleString('pt-BR', { timeZone:'UTC', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
                          <td className="p-2 text-center font-mono text-slate-600">{new Date(t.data_fim).toLocaleString('pt-BR', { timeZone:'UTC', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 mb-3">
                <label className="block text-[10px] font-black text-violet-800 uppercase mb-2">
                  <i className="fas fa-calendar-alt mr-1"></i> Nova Data de Início Planejada (SKU)
                </label>
                <input
                  type="date"
                  value={novaDataInicio}
                  onChange={(e) => { setNovaDataInicio(e.target.value); setErroDataInicio(''); }}
                  className="w-full border border-violet-300 rounded-md px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                />
                {erroDataInicio && (
                  <p className="text-red-600 text-xs font-bold mt-1.5 flex items-center gap-1">
                    <i className="fas fa-exclamation-circle"></i> {erroDataInicio}
                  </p>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 text-[10px] font-black text-slate-600 uppercase tracking-wider">Replanejar Fase Específica (Override)</div>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr><th className="p-2 text-left font-bold text-slate-500 uppercase text-[10px]">Etapa</th><th className="p-2 text-center font-bold text-slate-500 uppercase text-[10px]">Nova Data/Hora</th><th className="p-2 text-center font-bold text-slate-500 uppercase text-[10px]">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tarefasGlobais
                      .filter(t => t.sku_alvo === blocoEditando.sku_alvo && t.filtro_producao === blocoEditando.filtro_producao)
                      .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime())
                      .map((t, i) => {
                        const baseDate = new Date(t.data_inicio);
                        const baseDateStr = `${baseDate.getUTCFullYear()}-${String(baseDate.getUTCMonth()+1).padStart(2,'0')}-${String(baseDate.getUTCDate()).padStart(2,'0')}T${String(baseDate.getUTCHours()).padStart(2,'0')}:${String(baseDate.getUTCMinutes()).padStart(2,'0')}`;
                        const overrideVal = fasesOverrides[t.nome_etapa] || '';
                        const isAntecipacao = overrideVal && new Date(overrideVal) < baseDate;
                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2 font-medium text-slate-700">{t.nome_etapa}</td>
                            <td className="p-2">
                              <input type="datetime-local" value={overrideVal || baseDateStr}
                                onChange={(e) => setFasesOverrides(prev => ({ ...prev, [t.nome_etapa]: e.target.value }))}
                                className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-violet-400"
                              />
                            </td>
                            <td className="p-2 text-center">
                              {overrideVal ? (isAntecipacao ? <span className="text-[10px] font-bold text-red-600">⚡ Antecipação</span> : <span className="text-[10px] font-bold text-blue-600">→ Override</span>) : <span className="text-[10px] text-slate-400">Base</span>}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
              <button onClick={() => { setShowModalEditeDatas(false); setFasesOverrides({}); }} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors">Cancelar</button>
              <button onClick={handleSalvarDataInicio} className="px-6 py-2 text-sm font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-2">
                <i className="fas fa-save"></i> Salvar e Recalcular
              </button>
            </div>
          </div>
        </div>
      )}

      {showModalRelatorio && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-[999] p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border w-full max-w-6xl overflow-hidden flex flex-col max-h-[85vh]">
            <header className="bg-teal-700 p-4 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm uppercase tracking-wide"><i className="fas fa-list-alt mr-2"></i> Relatório Consolidado de Marcos Operacionais</h3>
              <div className="flex items-center gap-4">
                <button onClick={exportarRelatorioCSV} className="bg-emerald-500 hover:bg-emerald-400 text-teal-950 font-bold px-4 py-1.5 rounded-lg text-xs shadow-md flex items-center gap-2"><i className="fas fa-file-excel"></i> Baixar CSV</button>
                <button onClick={() => setShowModalRelatorio(false)} className="text-teal-200 hover:text-white font-bold text-lg">&times;</button>
              </div>
            </header>
            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider sticky top-0 shadow-sm">
                    <th className="p-3 border-b border-slate-200">Lote</th><th className="p-3 border-b border-slate-200">SKU Alvo</th>
                    <th className="p-3 border-b border-slate-200 text-center">Tiragem</th>
                    <th className="p-3 border-b border-slate-200 text-center">Paginação</th>
                    <th className="p-3 border-b border-slate-200 text-center">Acabamento</th>
                    <th className="p-3 border-b border-slate-200 text-center text-sky-800 bg-sky-50/50">Início Impressão</th>
                    <th className="p-3 border-b border-slate-200 text-center text-sky-800 bg-sky-50/50 border-r border-slate-200">Fim Impressão</th>
                    <th className="p-3 border-b border-slate-200 text-amber-800 bg-amber-50/50 text-center">Início Acabamentos</th>
                    <th className="p-3 border-b border-slate-200 text-amber-800 bg-amber-50/50 text-center border-r border-slate-200">Fim Acabamentos</th>
                    <th className="p-3 border-b border-slate-200 text-purple-800 bg-purple-50/50 text-center">Início Form. Kit</th>
                    <th className="p-3 border-b border-slate-200 text-purple-800 bg-purple-50/50 text-center">Término Geral</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gerarRelatorioPorSKU().map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-teal-800"><span className={`px-2 py-0.5 rounded text-white ${mapaCoresLotes[item.lote]}`}>{item.lote}</span></td>
                      <td className="p-3 font-black text-slate-800">{item.sku}</td>
                      <td className="p-3 font-mono text-center text-slate-600">{item.tiragem}</td>
                      <td className="p-3 font-mono text-center text-slate-600">{item.paginacao}</td>
                      <td className="p-3 text-center text-slate-600 text-[10px]">{item.acabamento}</td>
                      <td className="p-3 font-mono text-center text-sky-900 bg-sky-50/20">{item.inicioImp}</td>
                      <td className="p-3 font-mono font-bold text-center border-r border-slate-200 text-sky-900 bg-sky-50/20">{item.fimImp}</td>
                      <td className="p-3 font-mono text-center text-amber-900 bg-amber-50/20">{item.inicioAcab}</td>
                      <td className="p-3 font-mono font-bold text-center border-r border-slate-200 text-amber-900 bg-amber-50/20">{item.fimAcabFinais}</td>
                      <td className="p-3 font-mono text-center text-purple-900 bg-purple-50/20">{item.inicioKit}</td>
                      <td className="p-3 font-mono font-black text-center text-red-600 bg-purple-50/20">{item.fimKit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showModalTravas && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-[999] p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <header className="bg-slate-800 p-3 text-white flex justify-between items-center">
              <div className="flex gap-4">
                <button onClick={() => setAbaAtiva('TRAVAS')} className={`text-xs font-bold uppercase px-3 py-1 rounded transition-colors ${abaAtiva === 'TRAVAS' ? 'bg-violet-600 text-white shadow-inner' : 'text-slate-400'}`}>Travas Diárias</button>
                <button onClick={() => setAbaAtiva('REGIME')} className={`text-xs font-bold uppercase px-3 py-1 rounded transition-colors ${abaAtiva === 'REGIME' ? 'bg-violet-600 text-white shadow-inner' : 'text-slate-400'}`}>Regime Base</button>
              </div>
              <button onClick={() => setShowModalTravas(false)} className="text-slate-400 hover:text-white font-bold text-xl">&times;</button>
            </header>
            {abaAtiva === 'TRAVAS' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <form onSubmit={handleAdicionarTrava} className="p-4 bg-slate-50 border-b flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Equipamento Alvo</label><select value={maquinaTrava} onChange={(e) => setMaquinaTrava(e.target.value)} className="w-full text-xs p-2 border rounded font-bold bg-white text-slate-800">{maquinas.map(m => <option key={m.id} value={m.id}>{m.modelo}</option>)}</select></div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data Alvo</label><input type="date" required value={dataAlvoTrava} onChange={(e) => setDataAlvoTrava(e.target.value)} className="w-full text-xs p-2 border rounded bg-white text-slate-800" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status</label><select value={statusOperacional} onChange={(e) => setStatusOperacional(e.target.value)} className="w-full text-xs p-2 border rounded bg-white font-bold text-slate-800"><option value="INATIVO">INATIVO (0h)</option><option value="PARCIAL">PARCIAL</option></select></div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Horas Úteis</label><input type="number" step="0.25" min="0" max="24" required value={horasDisponiveis} onChange={(e) => setHorasDisponiveis(e.target.value)} className="w-full text-xs p-2 border rounded bg-white text-violet-700 font-bold" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Obs</label><input type="text" required placeholder="Feriado..." value={motivoTrava} onChange={(e) => setMotivoTrava(e.target.value)} className="w-full text-xs p-2 border rounded bg-white text-slate-800" /></div>
                  </div>
                  <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-2 rounded text-xs uppercase shadow">Gravar Indisponibilidade</button>
                </form>
                <div className="flex-1 overflow-auto p-4"><div className="divide-y border rounded-lg text-xs shadow-sm">{travasCalendario.map((t, idx) => (<div key={idx} className="p-3 bg-white flex justify-between items-center"><div><span className="font-bold text-slate-800">Dia Alvo: {new Date(t.data_alvo).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span><br/><span className="text-slate-400 font-mono text-[10px] mt-0.5">MÁQ: {t.maquina_id} · Obs: {t.motivo}</span></div><span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-bold border uppercase">{t.status_operacional} ({t.horas_disponiveis}h)</span></div>))}</div></div>
              </div>
            )}
            {abaAtiva === 'REGIME' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 bg-violet-50 border-b">
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-violet-800 uppercase mb-1">Configurar Carga (Grupo)</label>
                      <div className="flex gap-2">
                        <select value={diasMassa} onChange={(e) => setDiasMassa(Number(e.target.value))} className="flex-1 text-xs p-2.5 border rounded-lg bg-white font-bold text-slate-800 outline-none">
                          <option value={5}>5 Dias (Seg a Sex)</option><option value={6}>6 Dias (Seg a Sáb)</option><option value={7}>7 Dias (Seg a Dom)</option>
                        </select>
                        <div className="w-40 relative">
                          <input type="number" step="0.5" min="0" max="24" required value={horasMassa} onChange={(e) => setHorasMassa(e.target.value)} className="w-full text-xs p-2.5 border rounded-lg font-mono font-black text-violet-700 outline-none pr-10" />
                          <span className="absolute right-3 top-3 text-[10px] text-slate-400">h/dia</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={handleAplicarRegimeEmMassa} className="bg-violet-600 text-white font-black px-6 py-2.5 rounded-lg text-xs uppercase shadow">Aplicar nas ({idsSelecionados.length}) Linhas</button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <div className="flex justify-between items-center mb-3"><h4 className="text-[10px] font-black uppercase text-slate-500">Recurso Alvo</h4><button onClick={toggleSelecionarTudo} className="text-[10px] font-bold text-violet-600 uppercase">{idsSelecionados.length === maquinas.length ? "Desmarcar" : "Marcar Todas"}</button></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {maquinas.map(mq => (
                      <label key={mq.id} className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-all shadow-sm ${idsSelecionados.includes(mq.id) ? 'bg-violet-100 border-violet-400' : 'bg-white'}`}>
                        <input type="checkbox" className="w-4 h-4 accent-violet-600" checked={idsSelecionados.includes(mq.id)} onChange={() => setIdsSelecionados(prev => prev.includes(mq.id) ? prev.filter(i => i !== mq.id) : [...prev, mq.id])} />
                        <div className="flex flex-col overflow-hidden"><span className="text-[11px] font-bold text-slate-800 truncate">{mq.modelo}</span><span className="text-[9px] text-slate-500 font-mono">ID: {mq.id} · Carga: {mq.dias_trabalho || 5}D / {Number(mq.horas_diarias || 24).toFixed(1)}h</span></div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
