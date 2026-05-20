"use client";
import { useState, useEffect, useMemo } from 'react';

type VisaoGantt = 'DIAS' | 'SEMANAS' | 'MESES';

export default function GanttIndustrial() {
  const [etapa, setEtapa] = useState<1 | 2>(1); 
  const [graficaSelecionada, setGraficaSelecionada] = useState('');
  
  const [graficasDisponiveis, setGraficasDisponiveis] = useState<string[]>([]);
  const [maquinas, setMaquinas] = useState<any[]>([]);
  const [tarefasGlobais, setTarefasGlobais] = useState<any[]>([]);
  const [mapaCoresLotes, setMapaCoresLotes] = useState<Record<string, string>>({});
  
  const [visao, setVisao] = useState<VisaoGantt>('DIAS');
  const [lotesAtivos, setLotesAtivos] = useState<string[]>([]);
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

  const setoresFixos = ['Impressão', 'Beneficiamento', 'Dobra', 'Corte e Vinco', 'Alceadeira', 'Acabamentos Finais', 'Formação de Kit'];
  const PALETA_LOTES = ["bg-blue-500 border-blue-700", "bg-emerald-500 border-emerald-700", "bg-rose-500 border-rose-700", "bg-amber-500 border-amber-700", "bg-purple-500 border-purple-700", "bg-sky-500 border-sky-700", "bg-fuchsia-500 border-fuchsia-700", "bg-lime-500 border-lime-700", "bg-orange-500 border-orange-700"];

  useEffect(() => {
    fetch(`/api/producao/miolo/filtros?ts=${Date.now()}`).then(res => res.json()).then(dados => {
      setGraficasDisponiveis(Array.from(new Set(dados.map((d: any) => String(d.grafica).toUpperCase()))) as string[]);
    }).catch(() => {});
    const saved = localStorage.getItem('gantt_simulacao_estado');
    if (saved) { try { setSimuladores(JSON.parse(saved)); } catch(e){} }
  }, []);

  const carregarTravasDoBanco = async (graficaAlvo: string) => {
    try { const res = await fetch(`/api/producao/gantt/travas?grafica=${graficaAlvo}`); if (res.ok) setTravasCalendario(await res.json()); } catch (e) {}
  };

  const obterSetorPertencente = (tipo: string, etapa: string): string => {
    const t = String(tipo || '').toLowerCase(); const e = String(etapa || '').toLowerCase();
    if (t.includes('impress') || e.includes('impress')) return 'Impressão';
    if (t.includes('laminac') || t.includes('benefic') || e.includes('benefic')) return 'Beneficiamento';
    if (t.includes('dobra') || e.includes('dobra')) return 'Dobra';
    if (t.includes('corte') || t.includes('vinco') || e.includes('corte')) return 'Corte e Vinco';
    if (t.includes('shrink') || t.includes('encaixot') || e.includes('shrink') || e.includes('box') || t.includes('kit') || e.includes('kit')) return 'Formação de Kit';
    
    if (t.includes('alceade') || e.includes('alcead')) return 'Alceadeira';
    if (t.includes('cola') || e.includes('cola') || t.includes('pur') || e.includes('pur')) return 'Acabamentos Finais';
    
    return 'Acabamentos Finais'; 
  };

  const abrirGanttDaGrafica = async (graficaAlvo: string, simParams = simuladores) => {
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
      const resTar = await fetch(`/api/producao/gantt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grafica: graficaAlvo, simuladores: simParams }) });
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
      setLotesAtivos([]); 
      await carregarTravasDoBanco(graficaAlvo);
      setEtapa(2); 
    } catch(e) {
      alert("Falha na conexão. Recarregue a página e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAlterarSimulacao = (maquinaId: string, qtdUsadas: number, modo: string) => {
    const novosSimuladores = { ...simuladores, [maquinaId]: { usadas: qtdUsadas, modo } };
    setSimuladores(novosSimuladores);
    localStorage.setItem('gantt_simulacao_estado', JSON.stringify(novosSimuladores));
    abrirGanttDaGrafica(graficaSelecionada, novosSimuladores);
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
      const res = await fetch('/api/producao/gantt/travas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grafica: graficaSelecionada, maquina_id: maquinaTrava, data_alvo: dataAlvoTrava, status_operacional: statusOperacional, horas_disponiveis: parseFloat(horasDisponiveis || '0'), motivo: motivoTrava })
      });
      if (res.ok) { setMotivoTrava(''); abrirGanttDaGrafica(graficaSelecionada); }
    } catch (err) {}
  };

  const tarefasFiltradas = useMemo(() => {
    return tarefasGlobais.filter(t => {
      const matchLote = lotesAtivos.length === 0 || lotesAtivos.includes(t.filtro_producao);
      const matchSkuClick = !skuDestacado || t.sku_alvo === skuDestacado;
      const matchSkuText = !buscaSkuQuery || String(t.sku_alvo).toUpperCase().includes(buscaSkuQuery.toUpperCase());
      return matchLote && matchSkuClick && matchSkuText;
    });
  }, [tarefasGlobais, lotesAtivos, skuDestacado, buscaSkuQuery]);

  const lotesExistentes = Array.from(new Set(tarefasGlobais.map(t => t.filtro_producao)));

  const toggleFiltroLote = (lote: string) => {
    setLotesAtivos(prev => prev.includes(lote) ? prev.filter(l => l !== lote) : [...prev, lote]);
  };

  const Rulers = useMemo(() => {
    const ppd = visao === 'DIAS' ? zoomPixelsPorDia : visao === 'SEMANAS' ? (zoomPixelsPorDia / 7) : (zoomPixelsPorDia / 30);
    let minT = Infinity; let maxT = 0;
    
    const limitePassado = new Date('2023-01-01').getTime();

    tarefasFiltradas.forEach(t => {
      const start = new Date(t.data_inicio).getTime(); const end = new Date(t.data_fim).getTime();
      if (start > limitePassado && start < minT) minT = start; 
      if (end > limitePassado && end > maxT) maxT = end;
    });

    if (minT === Infinity) { minT = new Date().getTime(); maxT = minT + (30 * 24 * 3600 * 1000); }

    if ((maxT - minT) > 365 * 24 * 3600 * 1000) {
        maxT = minT + (365 * 24 * 3600 * 1000);
    }

    const dataInicioAbs = new Date(minT); dataInicioAbs.setUTCHours(0,0,0,0);
    if (visao === 'DIAS') dataInicioAbs.setUTCDate(dataInicioAbs.getUTCDate() - 1);
    if (visao === 'SEMANAS') dataInicioAbs.setUTCDate(dataInicioAbs.getUTCDate() - dataInicioAbs.getUTCDay());
    if (visao === 'MESES') dataInicioAbs.setUTCDate(1);

    const dataFimAbs = new Date(maxT); dataFimAbs.setUTCHours(23,59,59,999);
    if (visao === 'DIAS') dataFimAbs.setUTCDate(dataFimAbs.getUTCDate() + 3);
    if (visao === 'SEMANAS') dataFimAbs.setUTCDate(dataFimAbs.getUTCDate() + (6 - dataFimAbs.getUTCDay()) + 7);
    if (visao === 'MESES') { dataFimAbs.setUTCMonth(dataFimAbs.getUTCMonth() + 2); dataFimAbs.setUTCDate(0); }

    const totalDias = Math.ceil((dataFimAbs.getTime() - dataInicioAbs.getTime()) / (1000 * 3600 * 24));
    
    const diasRange = Array.from({length: totalDias}).map((_, i) => {
      const d = new Date(dataInicioAbs); d.setUTCDate(d.getUTCDate() + i); return d;
    });

    const macroHeader: any[] = []; const microHeader: any[] = []; const gridCells: any[] = [];

    if (visao === 'DIAS') {
      let curMonth = -1; let monthDays = 0; let mName = '';
      diasRange.forEach((d, i) => {
        if (d.getUTCMonth() !== curMonth) {
            if (curMonth !== -1) macroHeader.push({ label: mName, width: monthDays * ppd });
            curMonth = d.getUTCMonth(); monthDays = 1; mName = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
        } else monthDays++;
        if (i === diasRange.length - 1) macroHeader.push({ label: mName, width: monthDays * ppd });
        microHeader.push({ label: d.getUTCDate(), sub: d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }), width: ppd });
        const isBgInativo = travasCalendario.some(t => t.data_alvo?.startsWith(d.toISOString().split('T')[0])) || d.getUTCDay() === 0 || d.getUTCDay() === 6;
        gridCells.push({ start: new Date(d), end: new Date(d.getTime() + 24*3600*1000 - 1), width: ppd, isBgInativo, mode: 'DIA' });
      });
    } else if (visao === 'SEMANAS') {
      let curMonth = -1; let monthDays = 0; let mName = '';
      diasRange.forEach((d, i) => {
        if (d.getUTCMonth() !== curMonth) {
            if (curMonth !== -1) macroHeader.push({ label: mName, width: monthDays * ppd });
            curMonth = d.getUTCMonth(); monthDays = 1; mName = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
        } else monthDays++;
        if (i === diasRange.length - 1) macroHeader.push({ label: mName, width: monthDays * ppd });
      });
      for (let i = 0; i < diasRange.length; i += 7) {
        let chunk = diasRange.slice(i, i+7); let sDate = chunk[0]; let eDate = chunk[chunk.length-1];
        let numSemana = Math.ceil((sDate.getUTCDate() + sDate.getUTCDay()) / 7);
        microHeader.push({ label: `SEM ${numSemana}`, sub: `${sDate.getUTCDate()}/${sDate.getUTCMonth()+1}`, width: chunk.length * ppd });
        gridCells.push({ start: new Date(sDate), end: new Date(eDate.getTime() + 24*3600*1000 - 1), width: chunk.length * ppd, isBgInativo: false, mode: 'SEMANA' });
      }
    } else if (visao === 'MESES') {
      let curYear = -1; let yearDays = 0; let yName = '';
      diasRange.forEach((d, i) => {
        if (d.getUTCFullYear() !== curYear) {
            if (curYear !== -1) macroHeader.push({ label: yName, width: yearDays * ppd });
            curYear = d.getUTCFullYear(); yearDays = 1; yName = String(d.getUTCFullYear());
        } else yearDays++;
        if (i === diasRange.length - 1) macroHeader.push({ label: yName, width: yearDays * ppd });
      });
      let curMonth = -1; let mDays = 0; let mName = ''; let mStart: Date | null = null;
      diasRange.forEach((d, i) => {
        if (d.getUTCMonth() !== curMonth) {
            if (curMonth !== -1 && mStart) {
                let eDate = new Date(mStart); eDate.setUTCDate(eDate.getUTCDate() + mDays - 1);
                microHeader.push({ label: mName, sub: '', width: mDays * ppd });
                gridCells.push({ start: mStart, end: new Date(eDate.getTime() + 24*3600*1000 - 1), width: mDays * ppd, isBgInativo: false, mode: 'MÊS' });
            }
            curMonth = d.getUTCMonth(); mDays = 1; mStart = d; mName = d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).toUpperCase();
        } else mDays++;
        if (i === diasRange.length - 1 && mStart) {
            let eDate = new Date(mStart); eDate.setUTCDate(eDate.getUTCDate() + mDays - 1);
            microHeader.push({ label: mName, sub: '', width: mDays * ppd });
            gridCells.push({ start: mStart, end: new Date(eDate.getTime() + 24*3600*1000 - 1), width: mDays * ppd, isBgInativo: false, mode: 'MÊS' });
        }
      });
    }
    return { dataInicioAbs, ppd, macroHeader, microHeader, gridCells };
  }, [tarefasFiltradas, visao, zoomPixelsPorDia, travasCalendario]);

  const calcularPosicaoBloco = (dataInicioStr: string, dataFimStr: string) => {
    if (!dataInicioStr || !dataFimStr) return { left: '0px', width: '25px' };
    const startMs = new Date(dataInicioStr).getTime() - Rulers.dataInicioAbs.getTime();
    const endMs = new Date(dataFimStr).getTime() - Rulers.dataInicioAbs.getTime();
    return { left: `${(startMs / (1000*3600*24)) * Rulers.ppd}px`, width: `${((endMs - startMs) / (1000*3600*24)) * Rulers.ppd}px` };
  };

  const gerarRelatorioPorSKU = () => {
    const skusObj: Record<string, any> = {};
    tarefasFiltradas.forEach(t => {
      const start = new Date(t.data_inicio).getTime();
      const end = new Date(t.data_fim).getTime();
      const etapaStr = String(t.nome_etapa).toLowerCase();
      
      if (!skusObj[t.sku_alvo]) {
        skusObj[t.sku_alvo] = { lote: t.filtro_producao, inicioImp: Infinity, fimImp: 0, inicioAcab: Infinity, fimAcabFinais: 0, inicioKit: Infinity, fimKit: 0 };
      }
      
      const obj = skusObj[t.sku_alvo];
      if (etapaStr.includes('impress')) {
        if (start < obj.inicioImp) obj.inicioImp = start;
        if (end > obj.fimImp) obj.fimImp = end;
      }
      if (!etapaStr.includes('impress') && !etapaStr.includes('shrink') && !etapaStr.includes('encaixot') && !etapaStr.includes('kit')) {
        if (start < obj.inicioAcab) obj.inicioAcab = start;
        if (end > obj.fimAcabFinais) obj.fimAcabFinais = end;
      }
      if (etapaStr.includes('shrink') || etapaStr.includes('encaixot') || etapaStr.includes('kit')) {
        if (start < obj.inicioKit) obj.inicioKit = start;
        if (end > obj.fimKit) obj.fimKit = end;
      }
    });

    const format = (ts: number) => ts === Infinity || ts === 0 ? '-' : new Date(ts).toLocaleString('pt-BR', { timeZone:'UTC', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    return Object.entries(skusObj).map(([sku, dados]) => ({
      sku, lote: dados.lote,
      inicioImp: format(dados.inicioImp), fimImp: format(dados.fimImp),
      inicioAcab: format(dados.inicioAcab), fimAcabFinais: format(dados.fimAcabFinais),
      inicioKit: format(dados.inicioKit), fimKit: format(dados.fimKit)
    })).sort((a, b) => a.lote.localeCompare(b.lote));
  };

  const exportarRelatorioCSV = () => {
    const dados = gerarRelatorioPorSKU();
    if (dados.length === 0) return alert("Nenhum dado para exportar.");

    let csvContent = "Lote;SKU;Inicio Impressao;Fim Impressao;Inicio Acabamentos;Fim Acabamentos Finais;Inicio Formacao Kit;Termino Geral\n";
    dados.forEach(d => {
      csvContent += `${d.lote};${d.sku};${d.inicioImp};${d.fimImp};${d.inicioAcab};${d.fimAcabFinais};${d.inicioKit};${d.fimKit}\n`;
    });
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Gantt_Prazos_${graficaSelecionada}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full relative">
      
      {/* 🔴 TELA DE LOADING ANTI-CLIQUE (Evita metralhadora de requests) */}
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
                <button disabled={isLoading} className="w-full bg-violet-600 text-white px-4 py-2 rounded text-xs font-bold uppercase hover:bg-violet-700 disabled:opacity-50">
                  Abrir Painel Gráfico
                </button>
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
                <button onClick={() => setShowFiltroLote(!showFiltroLote)} className="bg-slate-700 border border-slate-600 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-2 cursor-pointer hover:bg-slate-600 transition-all duration-200 active:scale-95"><i className="fas fa-filter"></i> Lotes ({lotesAtivos.length === 0 ? 'Todos' : lotesAtivos.length})</button>
                {showFiltroLote && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border p-3 z-[9000]">
                    <div className="flex justify-between items-center mb-2 border-b pb-1">
                      <span className="text-[10px] font-black uppercase text-slate-500">Lotes</span>
                      <div className="flex gap-2">
                        <button onClick={() => setLotesAtivos(lotesExistentes as string[])} className="text-[10px] text-emerald-600 font-bold hover:underline cursor-pointer">Todos</button>
                        <button onClick={() => setLotesAtivos([])} className="text-[10px] text-violet-600 font-bold hover:underline cursor-pointer">Limpar</button>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {lotesExistentes.map((lote, idx) => (
                        <label key={`lote-filter-${idx}`} className="flex items-center gap-2 text-xs font-bold text-slate-700 p-1 hover:bg-slate-50 rounded cursor-pointer">
                          <input type="checkbox" className="w-4 h-4 accent-violet-600" checked={lotesAtivos.includes(lote as string)} onChange={() => toggleFiltroLote(lote as string)} />
                          <span className={`w-3 h-3 rounded-full ${mapaCoresLotes[lote as string]}`}></span>
                          {String(lote || 'SEM LOTE')}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {skuDestacado && <button onClick={() => setSkuDestacado(null)} className="bg-amber-500 text-slate-900 font-bold px-2 py-1.5 rounded text-[10px] uppercase shadow">Limpar SKU</button>}
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
                          const tarefasDaMq = tarefasFiltradas.filter(t => String(t.maquina_id).trim() === String(mq.id).trim() && obterSetorPertencente(t.maq_tipo, t.nome_etapa) === setor);
                          const maxSub = tarefasDaMq.reduce((max, t) => Math.max(max, t.sub_linha || 0), 0);
                          const alturaLinhaCalculada = Math.max(56, (maxSub + 1) * 36 + 18);

                          return (
                            <div key={`${setor}-${mq.id}`} style={{ height: `${alturaLinhaCalculada}px` }} className="border-b px-4 py-1.5 flex flex-col justify-center bg-white border-r hover:bg-slate-50/60 transition-all border-b-slate-200">
                              <span className="text-xs font-bold text-slate-800 truncate" title={`[${mq.tipo || 'Geral'}] ${mq.modelo}`}>[{mq.tipo || 'Geral'}] {mq.modelo}</span>
                              <div className="flex justify-between items-center gap-1 mt-1 text-[9px]">
                                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
                                  <span className="text-slate-400 font-mono font-bold">Usar:</span>
                                  <select value={configMq.usadas} onChange={(e) => handleAlterarSimulacao(mq.id, Number(e.target.value), configMq.modo)} className="bg-white border rounded text-[9px] px-0.5 font-black outline-none">{Array.from({ length: Math.max(1, Number(mq.maquinas || mq.pessoas || 1)) }).map((_, idx) => (<option key={idx+1} value={idx+1}>{idx+1}</option>))}</select>
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
                        {maqSetor.map(mq => {
                          const tarefasDaMaquina = tarefasFiltradas.filter(t => String(t.maquina_id).trim() === String(mq.id).trim() && obterSetorPertencente(t.maq_tipo, t.nome_etapa) === setor);
                          const maxSub = tarefasDaMaquina.reduce((max, t) => Math.max(max, t.sub_linha || 0), 0);
                          const alturaLinhaCalculada = Math.max(56, (maxSub + 1) * 36 + 18);

                          return (
                            <div key={`grid-mq-${mq.id}`} style={{ height: `${alturaLinhaCalculada}px` }} className="w-full border-b flex relative bg-white transition-all border-b-slate-200">
                              {Rulers.gridCells.map((cell, i) => {
                                const tarefasNaCelula = tarefasDaMaquina.filter(t => { const tIn = new Date(t.data_inicio); const tFim = new Date(t.data_fim); return tIn <= cell.end && tFim >= cell.start; });
                                
                                let capacidadeTotalPeriodo = 0; let tempData = new Date(cell.start);
                                while (tempData <= cell.end) {
                                  const dataStr = `${tempData.getUTCFullYear()}-${String(tempData.getUTCMonth() + 1).padStart(2, '0')}-${String(tempData.getUTCDate()).padStart(2, '0')}`;
                                  const dayW = tempData.getUTCDay();
                                  const lock = travasCalendario.find(t => String(t.maquina_id).toUpperCase().trim() === String(mq.id).toUpperCase().trim() && String(t.data_alvo || t.data_trava).startsWith(dataStr));
                                  let cap = Number(mq.horas_diarias || 24);
                                  if (lock) { cap = lock.status_operacional === 'INATIVO' ? 0 : Number(lock.horas_disponiveis); }
                                  else { if ((Number(mq.dias_trabalho) === 5 && (dayW === 0 || dayW === 6)) || (Number(mq.dias_trabalho) === 6 && dayW === 0)) cap = 0; }
                                  capacidadeTotalPeriodo += cap; tempData.setUTCDate(tempData.getUTCDate() + 1);
                                }

                                let totalJanela = (cell.mode === 'DIA' ? 24 : ((cell.width / Rulers.ppd) * 24));
                                let cellTitle = `Período: ${cell.start.toLocaleDateString('pt-BR', { timeZone:'UTC' })} até ${cell.end.toLocaleDateString('pt-BR', { timeZone:'UTC' })}\n`;
                                cellTitle += `⏱️ Capacidade Máxima Útil: ${capacidadeTotalPeriodo.toFixed(1)}h\n`;
                                cellTitle += `🛑 Desligamento / Turno Parado (Regra): ${(totalJanela - capacidadeTotalPeriodo).toFixed(1)}h\n`;
                                
                                if (tarefasNaCelula.length > 0) {
                                  const skus = Array.from(new Set(tarefasNaCelula.map(t => t.sku_alvo)));
                                  let hOcupadas = 0;
                                  tarefasNaCelula.forEach(t => {
                                    const oStart = new Date(t.data_inicio) > cell.start ? new Date(t.data_inicio) : cell.start;
                                    const oEnd = new Date(t.data_fim) < cell.end ? new Date(t.data_fim) : cell.end;
                                    const diffHours = (oEnd.getTime() - oStart.getTime()) / (1000 * 60 * 60);
                                    if (diffHours > 0) hOcupadas += diffHours;
                                  });
                                  cellTitle += `\n📦 SKUs na linha hoje: ${skus.length}\n⏱️ Horas Ocupadas: ${hOcupadas.toFixed(1)}h\n⏱️ Saldo Útil Livre: ${Math.max(0, capacidadeTotalPeriodo - hOcupadas).toFixed(1)}h\n\nOrdens:\n${skus.join(', ')}`;
                                } else { cellTitle += `\n✅ Totalmente Livre`; }

                                return <div key={`bg-cell-${i}`} title={cellTitle} style={{ width: `${cell.width}px` }} className={`flex-shrink-0 border-r border-dashed h-full hover:bg-black/5 cursor-crosshair transition-colors ${cell.isBgInativo || capacidadeTotalPeriodo === 0 ? 'bg-slate-100/80' : ''}`}></div>;
                              })}
                              
                              {tarefasDaMaquina.map((tarefa) => {
                                const pos = calcularPosicaoBloco(tarefa.data_inicio, tarefa.data_fim);
                                const corClasseFinal = `${mapaCoresLotes[tarefa.filtro_producao] || "bg-slate-500 border-slate-700"} text-white`;
                                const dTop = 6 + (tarefa.sub_linha || 0) * 36; 

                                const isEsteSkuClicado = skuDestacado === tarefa.sku_alvo;
                                const opacityClass = (skuDestacado && !isEsteSkuClicado) ? "opacity-10 scale-[0.98]" : "transition-all duration-150 shadow-md hover:z-50 hover:scale-105";

                                const dtInicio = new Date(tarefa.data_inicio).toLocaleString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                                const dtFim = new Date(tarefa.data_fim).toLocaleString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                                const dadosExtras = tarefa.dados_tooltip || {};
                                
                                const tooltipTexto = `📋 LOTE: ${tarefa.filtro_producao}\n🔖 SKU: ${tarefa.sku_alvo}\n⚙️ ETAPA: ${tarefa.nome_etapa}\n📦 Tiragem: ${dadosExtras.tiragem || 'N/A'}\n📄 Paginação: ${dadosExtras.paginacao || 'N/A'}\n🎨 Acabamento: ${dadosExtras.acabamento || 'N/A'}\n\n⏱️ Duração Teórica Bruta: ${Number(tarefa.tempo_estimado_horas).toFixed(2)}h\n⏱️ Carga Ativa Ocupada: ${Number(tarefa.tempo_producao_efetivo).toFixed(2)}h\n\n🛑 Tempo Retido em Fila (Espera): ${Number(tarefa.tempo_espera_fila || 0).toFixed(2)}h\n🛑 Horas Indisponíveis (Madrugadas / Regra): ${Number(tarefa.tempo_indisponivel_regra || 0).toFixed(2)}h\n\n🟢 INÍCIO EFETIVO: ${dtInicio}\n🔴 FINAL OPERAÇÃO: ${dtFim}`;

                                const larguraNumerica = typeof pos.width === 'number' ? pos.width : parseFloat(String(pos.width) || '0');
                                return (
                                  <div key={tarefa.id} onClick={() => setSkuDestacado(skuDestacado === tarefa.sku_alvo ? null : tarefa.sku_alvo)} className={`absolute h-7 ${corClasseFinal} ${opacityClass} rounded border flex flex-col justify-center px-1.5 cursor-pointer font-mono overflow-hidden whitespace-nowrap min-w-[20px] pointer-events-auto shadow`} style={{ left: pos.left, width: pos.width, top: `${dTop}px` }} title={tooltipTexto}>
                                    <span className="text-[9px] font-black truncate block">{tarefa.sku_alvo}</span>
                                    {larguraNumerica > 50 && <span className="text-[7px] opacity-80 truncate block uppercase">{tarefa.nome_etapa} (F.{tarefa.sub_linha + 1})</span>}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

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
                    <th className="p-3 border-b border-slate-200">Lote</th>
                    <th className="p-3 border-b border-slate-200">SKU Alvo</th>
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
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Equipamento Alvo</label>
                      <select value={maquinaTrava} onChange={(e) => setMaquinaTrava(e.target.value)} className="w-full text-xs p-2 border rounded font-bold bg-white text-slate-800">{maquinas.map(m => <option key={m.id} value={m.id}>{m.modelo}</option>)}</select>
                    </div>
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
                             <option value={5}>5 Dias (Seg a Sex)</option>
                             <option value={6}>6 Dias (Seg a Sáb)</option>
                             <option value={7}>7 Dias (Seg a Dom)</option>
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