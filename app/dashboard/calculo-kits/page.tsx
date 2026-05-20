"use client";
import { useEffect, useState, useRef } from 'react';

// Auxiliares de conversão de tempo
const timeToDecimal = (timeStr: string) => {
  if (!timeStr || timeStr === 'Pend.' || timeStr === '-') return 0;
  let d = 0, h = 0, m = 0;
  if (timeStr.includes('dia')) {
    const parts = timeStr.split('+');
    d = parseInt(parts[0]) || 0;
    const hm = (parts[1] || '').trim().split(':');
    h = parseInt(hm[0]) || 0;
    m = parseInt(hm[1]) || 0;
  } else {
    const hm = timeStr.split(':');
    h = parseInt(hm[0]) || 0;
    m = parseInt(hm[1]) || 0;
  }
  return (d * 24) + h + (m / 60);
};

const decimalToTime = (decimalHours: number) => {
  if (isNaN(decimalHours) || decimalHours <= 0) return '00:00';
  const totalMinutes = Math.round(decimalHours * 60);
  const d = Math.floor(totalMinutes / (24 * 60));
  const h = Math.floor((totalMinutes % (24 * 60)) / 60);
  const m = totalMinutes % 60;
  const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return d > 0 ? `${d} dia${d > 1 ? 's' : ''} + ${hhmm}` : hhmm;
};

const somarTodasAsStringsDeTempo = (tempos: string[]) => {
  let totalMinutos = 0;
  tempos.forEach(t => {
    if (!t || t === 'Pend.' || t === '-') return;
    let d = 0, h = 0, m = 0;
    if (t.includes('dia')) {
      const parts = t.split('+');
      d = parseInt(parts[0]) || 0;
      const hm = (parts[1] || '').trim().split(':');
      h = parseInt(hm[0]) || 0;
      m = parseInt(hm[1]) || 0;
    } else {
      const hm = t.split(':');
      h = parseInt(hm[0]) || 0;
      m = parseInt(hm[1]) || 0;
    }
    totalMinutos += (d * 24 * 60) + (h * 60) + m;
  });
  if (totalMinutos === 0) return '-';
  const dias = Math.floor(totalMinutos / (24 * 60));
  const horas = Math.floor((totalMinutos % (24 * 60)) / 60);
  const minutos = totalMinutos % 60;
  const hhmm = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
  return dias > 0 ? `${dias} dia${dias > 1 ? 's' : ''} + ${hhmm}` : hhmm;
};

export default function CalculoKits() {
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);
  const [grafica, setGrafica] = useState('');
  const [filtroProducao, setFiltroProducao] = useState('');
  
  // 🔴 NOVO ESTADO: Filtro Global de Gráfica
  const [filtroGraficaGlobal, setFiltroGraficaGlobal] = useState('');
  
  const [lotesDisponiveis, setLotesDisponiveis] = useState<any[]>([]);
  const [maquinasCarregadas, setMaquinasCarregadas] = useState<any[]>([]);
  const [kits, setKits] = useState<any[]>([]);
  const [kitAtual, setKitAtual] = useState<any>(null);

  const [idMaquinaEncaixotamento, setIdMaquinaEncaixotamento] = useState('');
  const [idMaquinaShrink, setIdMaquinaShrink] = useState('');

  const [feedback, setFeedback] = useState({ msg: '', tipo: '' });
  const [secoes, setSecoes] = useState({ encaixotamento: true, shrink: true });
  const [tooltipAtivo, setTooltipAtivo] = useState<string | null>(null);

  // Estados do Robô de Automação de Kits
  const [robo, setRobo] = useState({ encaixotamento: '', shrink: '' });
  const [roboFiltros, setRoboFiltros] = useState<{ tipo_kit: string[], shrink: string[] }>({ tipo_kit: [], shrink: [] });
  const [dropdownRobo, setDropdownRobo] = useState<'tipo_kit' | 'shrink' | null>(null);

  // Estados da Borracha Inteligente
  const [modalConfigLimpar, setModalConfigLimpar] = useState(false);
  const [limparFiltros, setLimparFiltros] = useState<{ tipo_kit: string[], sku: string }>({ tipo_kit: [], sku: '' });
  const [dropdownLimpar, setDropdownLimpar] = useState<'tipo_kit' | null>(null);

  const [modalRobo, setModalRobo] = useState(false);
  const [progressoRobo, setProgressoRobo] = useState({ atual: 0, total: 0, status: '', tipo: '' });
  const cancelarRoboRef = useRef(false);

  const toggleSecao = (secao: string) => { 
    setSecoes(prev => ({ ...prev, [secao]: !prev[secao as keyof typeof secoes] })); 
  };

  const toggleRoboFiltro = (tipo: 'tipo_kit' | 'shrink', valor: string) => {
    setRoboFiltros(prev => {
      const atual = prev[tipo];
      if (atual.includes(valor)) return { ...prev, [tipo]: atual.filter(v => v !== valor) };
      return { ...prev, [tipo]: [...atual, valor] };
    });
  };

  const toggleLimparFiltro = (valor: string) => {
    setLimparFiltros(prev => {
      const atual = prev.tipo_kit;
      if (atual.includes(valor)) return { ...prev, tipo_kit: atual.filter(v => v !== valor) };
      return { ...prev, tipo_kit: [...atual, valor] };
    });
  };

  const getMaquinaMaisRapida = (tipoBusca: string, subtipoBusca?: string) => {
    let candidatas = maquinasCarregadas.filter(m => String(m.tipo || '').toLowerCase().includes(String(tipoBusca).toLowerCase()));
    if (subtipoBusca) {
      candidatas = maquinasCarregadas.filter(m => String(m.tipo || '').toLowerCase().includes(String(tipoBusca).toLowerCase()) || String(m.tipo || '').toLowerCase().includes(String(subtipoBusca).toLowerCase()));
    }
    if (candidatas.length === 0) return null;
    return candidatas.sort((a, b) => Number(b.produtividade_unit || 0) - Number(a.produtividade_unit || 0))[0];
  };

  const carregarLotesIniciais = () => {
    fetch(`/api/producao/kits/filtros?ts=${Date.now()}`)
      .then(res => res.json())
      .then(setLotesDisponiveis)
      .catch(() => {});
  };

  useEffect(() => {
    carregarLotesIniciais();
  }, []);

  useEffect(() => {
    if ((etapa === 2 || etapa === 3) && grafica) {
      fetch(`/api/maquinas?ts=${Date.now()}`)
        .then(res => res.json())
        .then(dados => {
          const mFiltradas = dados.filter((m: any) => String(m.grafica || '').toUpperCase() === String(grafica || '').toUpperCase());
          setMaquinasCarregadas(mFiltradas);
        }).catch(() => {});
    }
  }, [etapa, grafica]);

  const carregarKitsDoLote = async (loteEscolhido: string, graficaEscolhida: string) => {
    setFiltroProducao(loteEscolhido);
    setGrafica(graficaEscolhida);
    try {
      const res = await fetch(`/api/producao/kits?grafica=${graficaEscolhida}&filtro=${loteEscolhido}`);
      const dados = await res.json();
      if (res.ok && dados.length > 0) {
        setKits(dados);
        setEtapa(2);
      } else {
        alert("Nenhum Kit importado encontrado para este lote.");
      }
    } catch(e) { console.error(e); }
  };

  // ----------------------------------------------------------------------
  // MOTOR DE CÁLCULO FÍSICO COM FATOR DE COMPLEXIDADE
  // ----------------------------------------------------------------------
  const calcularOperacaoKit = (maquina: any, infoKit: any, usarShrinkCheck = false) => {
    if (!maquina || !infoKit) return null;
    if (usarShrinkCheck && String(infoKit.com_shrink || '').toUpperCase() !== 'SIM') return null;

    const tiragemBruta = Number(infoKit.tiragem || 0);
    const tiragemProduzida = Math.round(tiragemBruta + 50 + (tiragemBruta * 0.02)); // Quebra padrão para kit
    
    const velNominal = Number(maquina.produtividade_unit) || 1;
    const setupUnitario = timeToDecimal(maquina.setup || '00:00');

    const qntSkus = Number(infoKit.qnt_skus || 1);
    const espessura = Number(String(infoKit.espessura_kit_mm || '0').replace(',', '.'));

    const perdaPorSku = Math.min((qntSkus - 1) * 0.10, 0.75);
    const perdaPorEspessura = espessura > 30 ? 0.15 : 0;
    
    const penalidadeTotal = Math.min(perdaPorSku + perdaPorEspessura, 0.90);
    const velReal = Math.round(velNominal * (1 - penalidadeTotal));

    const rodagemDec = tiragemProduzida / (velReal || 1);
    const totalDec = setupUnitario + rodagemDec;

    return {
      maquinaSetupStr: maquina.setup || '00:00',
      parametros: {
        velNominal,
        velReal,
        penalidadeTotal: Math.round(penalidadeTotal * 100),
        tiragemProduzida
      },
      totais: {
        setup: decimalToTime(setupUnitario),
        rodagem: decimalToTime(rodagemDec),
        total: decimalToTime(totalDec)
      }
    };
  };

  const salvarKitNoBanco = async (dadosBox: any, dadosShrink: any) => {
    try {
      const payload = {
        id_codigo_kit: kitAtual.id_codigo_kit,
        filtro_producao: filtroProducao,
        grafica: grafica,
        dados_calculo: {
          encaixotamento: dadosBox ? { maquina_id: idMaquinaEncaixotamento, resultado: dadosBox } : undefined,
          shrink: dadosShrink ? { maquina_id: idMaquinaShrink, resultado: dadosShrink } : undefined
        }
      };

      const res = await fetch('/api/producao/kits/salvar-calculo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setFeedback({ msg: "Engenharia do Kit gravada!", tipo: "sucesso" });
        setTimeout(() => { setFeedback({ msg: '', tipo: '' }); carregarKitsDoLote(filtroProducao, grafica); }, 2000);
      }
    } catch(e) { console.error(e); }
  };

  const executarAutomacaoKits = async () => {
    const pendentesRaw = kits.filter(k => k.dados_calculo == null);
    const alvos = pendentesRaw.filter(k => {
      const tipo = String(k.tipo_kit || 'Comum').toUpperCase();
      const shrink = String(k.com_shrink || 'NAO').toUpperCase();
      const matchT = roboFiltros.tipo_kit.length === 0 || roboFiltros.tipo_kit.includes(tipo);
      const matchS = roboFiltros.shrink.length === 0 || roboFiltros.shrink.includes(shrink);
      return matchT && matchS;
    });

    if (alvos.length === 0) {
      alert("Nenhum Kit atende aos filtros selecionados.");
      return;
    }

    setModalRobo(true);
    setProgressoRobo({ atual: 0, total: alvos.length, status: 'processando', tipo: 'Calculando' });
    cancelarRoboRef.current = false;
    let count = 0;

    const mqBox = robo.encaixotamento ? maquinasCarregadas.find(m => String(m.id) === robo.encaixotamento) : getMaquinaMaisRapida('Encaixotamento', 'Acabamento');
    const mqShrink = robo.shrink ? maquinasCarregadas.find(m => String(m.id) === robo.shrink) : getMaquinaMaisRapida('Shrink', 'Seladora');

    for (let i = 0; i < alvos.length; i++) {
      if (cancelarRoboRef.current) { setProgressoRobo(p => ({ ...p, status: 'cancelado' })); break; }
      
      const item = alvos[i];
      const resBox = calcularOperacaoKit(mqBox, item, false);
      const resShrink = calcularOperacaoKit(mqShrink, item, true);

      const payload = {
        id_codigo_kit: item.id_codigo_kit,
        filtro_producao: filtroProducao,
        grafica: grafica,
        dados_calculo: {
          encaixotamento: resBox && mqBox ? { maquina_id: mqBox.id, resultado: resBox } : null,
          shrink: resShrink && mqShrink ? { maquina_id: mqShrink.id, resultado: resShrink } : undefined
        }
      };

      try {
        await fetch('/api/producao/kits/salvar-calculo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        count++;
        setProgressoRobo({ atual: i + 1, total: alvos.length, status: 'processando', tipo: 'Calculando' });
      } catch(e) {}
    }
    if (!cancelarRoboRef.current) setProgressoRobo(p => ({ ...p, status: 'concluido', atual: count }));
  };

  const limparCalculosDaFila = async () => {
    const calculadosRaw = kits.filter(k => k.dados_calculo != null);
    const alvosLimpeza = calculadosRaw.filter(k => {
      const tipo = String(k.tipo_kit || 'Comum').toUpperCase();
      const matchA = limparFiltros.tipo_kit.length === 0 || limparFiltros.tipo_kit.includes(tipo);
      const matchS = limparFiltros.sku === '' || String(k.id_codigo_kit || '').toUpperCase().includes(limparFiltros.sku.toUpperCase());
      return matchA && matchS;
    });

    if (alvosLimpeza.length === 0) return;

    setModalConfigLimpar(false);
    setModalRobo(true);
    setProgressoRobo({ atual: 0, total: alvosLimpeza.length, status: 'processando', tipo: 'Apagando' });
    cancelarRoboRef.current = false;

    let limpos = 0;
    for (let i = 0; i < alvosLimpeza.length; i++) {
      if (cancelarRoboRef.current) {
        setProgressoRobo(prev => ({ ...prev, status: 'cancelado' }));
        break;
      }
      const item = alvosLimpeza[i];
      try {
        await fetch('/api/producao/kits/salvar-calculo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_codigo_kit: item.id_codigo_kit, filtro_producao: filtroProducao, grafica: grafica, dados_calculo: null })
        });
        limpos++;
        setProgressoRobo({ atual: i + 1, total: alvosLimpeza.length, status: 'processando', tipo: 'Apagando' });
      } catch(e) {}
    }
    if (!cancelarRoboRef.current) { setProgressoRobo(prev => ({ ...prev, status: 'concluido', atual: limpos })); }
  };

  // 🔴 1. VARIÁVEL DE FILTRAGEM DE GRÁFICA
  const lotesFiltrados = lotesDisponiveis.filter(l => 
    !filtroGraficaGlobal || String(l.grafica).toUpperCase() === filtroGraficaGlobal.toUpperCase()
  );

  return (
    <div className="w-full text-left font-sans relative">
      
      {/* MÁSCARAS DE CLIQUE E MODAIS */}
      {(tooltipAtivo || dropdownRobo || dropdownLimpar) && (
        <div className="fixed inset-0 z-[8000] bg-transparent" onClick={() => { setTooltipAtivo(null); setDropdownRobo(null); setDropdownLimpar(null); }} />
      )}

      {feedback.msg && !modalRobo && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white border-b-4 border-indigo-600 rounded-lg shadow-2xl p-8 flex flex-col items-center max-w-sm">
            <i className="fas fa-check-circle text-[60px] text-indigo-500 mb-4 animate-pulse"></i>
            <h3 className="text-lg font-black text-slate-800 uppercase text-center tracking-wide">{feedback.msg}</h3>
          </div>
        </div>
      )}

      {/* 🤖 MODAL DO ROBÔ */}
      {modalRobo && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[400px] p-8 text-center flex flex-col items-center">
            {progressoRobo.status === 'processando' && <i className={`fas ${progressoRobo.tipo === 'Apagando' ? 'fa-eraser text-red-500' : 'fa-robot text-indigo-500'} text-[60px] mb-4 animate-bounce`}></i>}
            {progressoRobo.status === 'concluido' && <i className="fas fa-check-circle text-[60px] text-emerald-500 mb-4 drop-shadow-md"></i>}
            {progressoRobo.status === 'cancelado' && <i className="fas fa-stop-circle text-[60px] text-amber-500 mb-4 drop-shadow-md"></i>}
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-wide mb-2">
              {progressoRobo.status === 'processando' && `Robô ${progressoRobo.tipo}...`}
              {progressoRobo.status === 'concluido' && `${progressoRobo.tipo} Concluído!`}
              {progressoRobo.status === 'cancelado' && 'Operação Interrompida'}
            </h3>
            <div className="w-full bg-slate-100 rounded-full h-4 mb-2 overflow-hidden border">
              <div className={`h-4 transition-all duration-300 ${progressoRobo.status === 'processando' && progressoRobo.tipo === 'Apagando' ? 'bg-red-500' : progressoRobo.status === 'processando' ? 'bg-indigo-500' : progressoRobo.status === 'concluido' ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.max(5, (progressoRobo.atual / progressoRobo.total) * 100)}%` }}></div>
            </div>
            <p className="text-sm font-bold text-slate-600 font-mono mb-6">{progressoRobo.atual} de {progressoRobo.total} kits processados.</p>
            {progressoRobo.status === 'processando' ? (
              <button onClick={() => { cancelarRoboRef.current = true; }} className="border-2 border-red-500 text-red-500 font-bold px-6 py-2 rounded-full uppercase text-xs">Interromper</button>
            ) : (
              <button onClick={() => { setModalRobo(false); carregarKitsDoLote(filtroProducao, grafica); carregarLotesIniciais(); }} className="bg-slate-800 text-white font-bold px-8 py-3 rounded-full uppercase text-sm">Fechar</button>
            )}
          </div>
        </div>
      )}

      {/* 🧹 MODAL DA BORRACHA */}
      {modalConfigLimpar && (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[500px] overflow-hidden flex flex-col">
            <div className="bg-red-600 text-white p-4 flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2"><i className="fas fa-eraser"></i> Borracha de Engenharia de Kits</h3>
              <button onClick={() => setModalConfigLimpar(false)} className="text-red-200 hover:text-white"><i className="fas fa-times"></i></button>
            </div>
            <div className="p-6">
              <p className="text-xs text-slate-600 mb-4 font-medium">Use os filtros para apagar os cálculos de kits específicos que já foram concluídos. Se não preencher nada, o robô apagará TODOS os itens deste lote.</p>
              
              <div className="space-y-4 mb-6 relative">
                <div className="relative z-[9600]">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Filtrar por Tipo de Kit</label>
                  <button onClick={(e) => { e.stopPropagation(); setDropdownLimpar(dropdownLimpar === 'tipo_kit' ? null : 'tipo_kit'); }} className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs font-bold text-slate-700 text-left flex justify-between items-center shadow-sm">
                    <span>{limparFiltros.tipo_kit.length === 0 ? '-- Todos os Tipos --' : `${limparFiltros.tipo_kit.length} Selecionado(s)`}</span>
                    <i className={`fas fa-chevron-${dropdownLimpar === 'tipo_kit' ? 'up' : 'down'} opacity-50`}></i>
                  </button>
                  {dropdownLimpar === 'tipo_kit' && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 shadow-xl rounded-md py-2 max-h-48 overflow-y-auto z-[9600]">
                      {Array.from(new Set(kits.filter(k => k.dados_calculo != null).map(k => String(k.tipo_kit || 'Comum').toUpperCase()))).filter(Boolean).map(tipo => (
                        <label key={tipo} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs">
                          <input type="checkbox" checked={limparFiltros.tipo_kit.includes(tipo)} onChange={() => toggleLimparFiltro(tipo)} className="w-3.5 h-3.5 rounded text-red-600" />
                          <span className="font-bold text-slate-700">{tipo}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">SKU do Kit (Opcional)</label>
                  <input type="text" placeholder="Digite para apagar um kit exato..." value={limparFiltros.sku} onChange={(e) => setLimparFiltros({...limparFiltros, sku: e.target.value})} className="w-full border border-slate-300 rounded p-2 text-xs font-mono font-bold text-slate-700 bg-slate-50 focus:bg-white" />
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 p-3 rounded text-center mb-6">
                <span className="block text-[10px] font-bold text-red-700 uppercase">Kits na mira para exclusão:</span>
                <span className="block text-xl font-black text-red-900">
                  {kits.filter(k => k.dados_calculo != null).filter(k => {
                    const tipo = String(k.tipo_kit || 'Comum').toUpperCase();
                    const matchT = limparFiltros.tipo_kit.length === 0 || limparFiltros.tipo_kit.includes(tipo);
                    const matchS = limparFiltros.sku === '' || String(k.id_codigo_kit || '').toUpperCase().includes(limparFiltros.sku.toUpperCase());
                    return matchT && matchS;
                  }).length} Kits
                </span>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setModalConfigLimpar(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded">Cancelar</button>
                <button onClick={limparCalculosDaFila} disabled={kits.filter(k => k.dados_calculo != null).filter(k => { const tipo = String(k.tipo_kit || 'Comum').toUpperCase(); const matchT = limparFiltros.tipo_kit.length === 0 || limparFiltros.tipo_kit.includes(tipo); const matchS = limparFiltros.sku === '' || String(k.id_codigo_kit || '').toUpperCase().includes(limparFiltros.sku.toUpperCase()); return matchT && matchS; }).length === 0} className="bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white font-bold px-6 py-2 rounded shadow flex items-center gap-2 text-xs uppercase tracking-wide"><i className="fas fa-trash-alt"></i> Confirmar Exclusão</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ETAPA 1: SELEÇÃO DE LOTES */}
      {etapa === 1 && (() => {
        const globalKits = lotesFiltrados.reduce((acc, l) => acc + (l.total_skus || 0), 0);
        const globalCalculados = lotesFiltrados.reduce((acc, l) => acc + (l.skus_calculados || 0), 0);

        return (
          <>
            <header className="mb-6 border-b border-slate-300 pb-3 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Módulo de Montagem de Kits</h1>
                <p className="text-sm text-gray-500 mt-1">Gerenciamento de empacotamento, shrinkagem de segurança e fator de complexidade.</p>
              </div>
              
              {/* 🔴 1. DROPDOWN DO FILTRO DE GRÁFICA */}
              <select 
                value={filtroGraficaGlobal} 
                onChange={(e) => setFiltroGraficaGlobal(e.target.value)} 
                className="border border-slate-300 rounded-md p-2 text-sm font-bold text-slate-700 bg-white shadow-sm outline-none cursor-pointer"
              >
                <option value="">-- Filtrar por Gráfica (Todas) --</option>
                {Array.from(new Set(lotesDisponiveis.map(l => String(l.grafica).toUpperCase()))).map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </header>

            <div className="bg-white border rounded-md shadow-sm overflow-hidden w-full">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-slate-50 border-b text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="p-3 pl-4">Lote Operacional</th>
                    <th className="p-3">Gráfica Parceira</th>
                    <th className="p-3 text-center border-l w-24">Total Projetos</th>
                    <th className="p-3 text-center w-24 text-emerald-700 bg-emerald-50/20">Calculados</th>
                    <th className="p-3 text-center w-24 text-amber-700 bg-amber-50/20">Pendentes</th>
                    <th className="p-3 text-right pr-4 w-28">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {lotesFiltrados.map((l, i) => { // 🔴 1. MAPEA APENAS OS FILTRADOS
                    const pendentes = (l.total_skus || 0) - (l.skus_calculados || 0);
                    return (
                      <tr key={i} className="hover:bg-indigo-50/20">
                        <td className="p-3 pl-4 font-mono font-bold text-slate-800">{l.filtro_producao}</td>
                        <td className="p-3 text-slate-600 uppercase text-xs font-bold">{l.grafica}</td>
                        <td className="p-3 text-center border-l border-slate-200 font-mono text-slate-700">{l.total_skus}</td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/10">{l.skus_calculados}</td>
                        <td className={`p-3 text-center font-mono font-bold bg-amber-50/10 ${pendentes > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{pendentes}</td>
                        <td className="p-3 text-right pr-4">
                          <button onClick={() => carregarKitsDoLote(l.filtro_producao, l.grafica)} className="bg-indigo-600 text-white px-4 py-1.5 rounded text-xs font-bold hover:bg-indigo-700 transition-colors">
                            Abrir Fila
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}

      {/* ETAPA 2: FILA DO LOTE (KITS) */}
      {etapa === 2 && (() => {
        const totalKitsLote = kits.length;
        const kitsConcluidosLote = kits.filter(k => k.dados_calculo != null).length;
        const kitsRestantesLote = totalKitsLote - kitsConcluidosLote;
        const tiragemLote = kits.reduce((acc, k) => acc + Number(k.tiragem || 0), 0);
        
        const pendentesRaw = kits.filter(k => k.dados_calculo == null);
        const opcoesTipoRobo = Array.from(new Set(pendentesRaw.map(k => String(k.tipo_kit || 'Comum').toUpperCase()))).filter(Boolean);
        const opcoesShrinkRobo = Array.from(new Set(pendentesRaw.map(k => String(k.com_shrink || 'NAO').toUpperCase()))).filter(Boolean);

        const skusAlvoRobo = pendentesRaw.filter(k => {
          const tipo = String(k.tipo_kit || 'Comum').toUpperCase();
          const shrink = String(k.com_shrink || 'NAO').toUpperCase();
          const matchT = roboFiltros.tipo_kit.length === 0 || roboFiltros.tipo_kit.includes(tipo);
          const matchS = roboFiltros.shrink.length === 0 || roboFiltros.shrink.includes(shrink);
          return matchT && matchS;
        });

        const tempoDecimalTotal = kits.reduce((acc, k) => {
          if (!k.dados_calculo) return acc;
          let src = k.dados_calculo;
          let somaDec = 0;
          if (src.encaixotamento?.resultado) somaDec += timeToDecimal(src.encaixotamento.resultado.totais.total);
          if (src.shrink?.resultado) somaDec += timeToDecimal(src.shrink.resultado.totais.total);
          return acc + somaDec;
        }, 0);

        return (
          <>
            <header className="mb-4 border-b border-slate-300 pb-3 flex justify-between items-end">
              <div><h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Fila de Montagem de Kits</h1><p className="text-sm text-slate-500 mt-1 font-mono">Ref: {filtroProducao} / {grafica}</p></div>
              <div className="flex gap-2">
                {kitsConcluidosLote > 0 && (
                  <button onClick={() => { setLimparFiltros({ tipo_kit: [], sku: '' }); setModalConfigLimpar(true); }} className="text-sm text-red-600 font-bold border border-red-200 px-4 py-1.5 rounded hover:bg-red-50 shadow-sm transition-colors">
                    <i className="fas fa-eraser mr-1"></i> Borracha de Engenharia
                  </button>
                )}
                <button onClick={() => { setEtapa(1); carregarLotesIniciais(); }} className="text-sm text-indigo-600 font-bold border border-indigo-200 px-4 py-1.5 rounded hover:bg-indigo-50 shadow-sm transition-colors">
                  Voltar aos Lotes
                </button>
              </div>
            </header>

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white border border-slate-200 p-4 rounded-md shadow-sm border-l-4 border-l-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Itens (Kits)</span>
                <span className="text-lg font-black text-slate-800 block">{totalKitsLote} Projetos</span>
                <span className="text-xs text-amber-600 font-bold">{kitsRestantesLote} Pendentes</span>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-md shadow-sm border-l-4 border-l-indigo-600">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Tiragem Total do Lote</span>
                <span className="text-lg font-black font-mono text-indigo-800 block">{tiragemLote.toLocaleString('pt-BR')} pct.</span>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-md shadow-sm border-l-4 border-l-emerald-600 col-span-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Estimativa de Carga Consolidada</span>
                <span className="text-xl font-black font-mono text-emerald-800 block">{decimalToTime(tempoDecimalTotal)}</span>
                <span className="text-xs text-slate-500">Soma do empacotamento logístico com regras de complexidade ativa.</span>
              </div>
            </div>

            {/* 🤖 PAINEL DO ROBÔ DE KITS */}
            {kitsRestantesLote > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg shadow-sm mb-6 overflow-hidden">
                <div className="bg-indigo-900 text-white p-3 flex items-center gap-3">
                  <i className="fas fa-robot text-lg text-indigo-300"></i>
                  <h3 className="text-sm font-bold uppercase tracking-wider">Roteirização Automática em Lote</h3>
                </div>
                <div className="p-5">
                  <p className="text-xs text-indigo-800 mb-4 font-medium">O robô processará a linha de montagem final. Se a máquina for deixada em branco, ele alocará o serviço para as bancadas mais rápidas.</p>
                  
                  <div className="flex gap-4 mb-4 pb-4 border-b border-indigo-200 relative z-[8100]">
                    <div className="flex-1 relative">
                      <label className="block text-[10px] font-bold text-indigo-800 uppercase mb-1">Filtrar por Tipo de Kit</label>
                      <button onClick={(e) => { e.stopPropagation(); setDropdownRobo(dropdownRobo === 'tipo_kit' ? null : 'tipo_kit'); }} className="w-full bg-white border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 text-left flex justify-between items-center shadow-sm">
                        <span>{roboFiltros.tipo_kit.length === 0 ? '-- Todos os Tipos --' : `${roboFiltros.tipo_kit.length} Selecionado(s)`}</span>
                        <i className={`fas fa-chevron-${dropdownRobo === 'tipo_kit' ? 'up' : 'down'} opacity-50`}></i>
                      </button>
                      {dropdownRobo === 'tipo_kit' && (
                        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-indigo-200 shadow-xl rounded-md py-2 max-h-48 overflow-y-auto z-50">
                          {opcoesTipoRobo.map(tipo => (
                            <label key={tipo} className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 cursor-pointer text-xs">
                              <input type="checkbox" checked={roboFiltros.tipo_kit.includes(tipo)} onChange={() => toggleRoboFiltro('tipo_kit', tipo)} className="w-3.5 h-3.5 rounded text-indigo-600" />
                              <span className="font-bold text-slate-700">{tipo}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 relative">
                      <label className="block text-[10px] font-bold text-indigo-800 uppercase mb-1">Filtrar por Uso de Shrink</label>
                      <button onClick={(e) => { e.stopPropagation(); setDropdownRobo(dropdownRobo === 'shrink' ? null : 'shrink'); }} className="w-full bg-white border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 text-left flex justify-between items-center shadow-sm">
                        <span>{roboFiltros.shrink.length === 0 ? '-- Todos --' : `${roboFiltros.shrink.length} Selecionada(s)`}</span>
                        <i className={`fas fa-chevron-${dropdownRobo === 'shrink' ? 'up' : 'down'} opacity-50`}></i>
                      </button>
                      {dropdownRobo === 'shrink' && (
                        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-indigo-200 shadow-xl rounded-md py-2 max-h-48 overflow-y-auto z-50">
                          {opcoesShrinkRobo.map(shrink => (
                            <label key={shrink} className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 cursor-pointer text-xs">
                              <input type="checkbox" checked={roboFiltros.shrink.includes(shrink)} onChange={() => toggleRoboFiltro('shrink', shrink)} className="w-3.5 h-3.5 rounded text-indigo-600" />
                              <span className="font-bold text-slate-700">{shrink}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="w-48 flex flex-col justify-end">
                      <div className="bg-indigo-100 border border-indigo-300 rounded p-2 text-center relative shadow-sm">
                        {(roboFiltros.tipo_kit.length > 0 || roboFiltros.shrink.length > 0) && (
                          <button onClick={() => setRoboFiltros({tipo_kit: [], shrink: []})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-red-600 shadow" title="Limpar Filtros"><i className="fas fa-times"></i></button>
                        )}
                        <span className="block text-[10px] font-bold text-indigo-700 uppercase">Alvo Atual do Robô</span>
                        <span className="block text-sm font-black text-indigo-900">{skusAlvoRobo.length} Kits</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Estação de Encaixotamento</label>
                      <select value={robo.encaixotamento} onChange={e => setRobo({...robo, encaixotamento: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCarregadas.filter(m => String(m.tipo || '').toLowerCase().includes('encaixotamento')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Seladora / Túnel Shrink</label>
                      <select value={robo.shrink} onChange={e => setRobo({...robo, shrink: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCarregadas.filter(m => String(m.tipo || '').toLowerCase().includes('shrink')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={executarAutomacaoKits} disabled={skusAlvoRobo.length === 0} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold px-6 py-2 rounded shadow flex items-center gap-2 text-xs uppercase tracking-wide transition-colors">
                      <i className="fas fa-magic"></i> Calcular {skusAlvoRobo.length} Item(s) Automático
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border rounded-md shadow-sm overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b text-slate-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-3 pl-4 w-12 text-center">Abrir</th>
                    <th className="p-3 w-32">Código Kit</th>
                    <th className="p-3">Descrição Comercial</th>
                    <th className="p-3 text-center w-20">Qtd. SKUs</th>
                    <th className="p-3 text-center w-24">Lombada (mm)</th>
                    <th className="p-3 text-right w-24 border-r">Tiragem</th>
                    <th className="p-3 text-center w-24 text-blue-800 bg-blue-50/50">T. Embalar</th>
                    <th className="p-3 text-center w-24 border-r text-purple-800 bg-purple-50/50">T. Shrink</th>
                    <th className="p-3 text-center w-28 bg-slate-200 font-black pr-4">Carga Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {kits.map((k, idx) => {
                    const temCalculo = k.dados_calculo != null;
                    const src = k.dados_calculo || {};
                    const tBox = temCalculo && src.encaixotamento?.resultado ? src.encaixotamento.resultado.totais.total : 'Pend.';
                    const tShrink = temCalculo && src.shrink?.resultado ? src.shrink.resultado.totais.total : '-';
                    
                    const tTotal = somarTodasAsStringsDeTempo([tBox, tShrink]);

                    return (
                      <tr key={idx} className="hover:bg-slate-50 cursor-pointer group" onClick={() => {
                        setKitAtual(k);
                        
                        const mqBoxRec = getMaquinaMaisRapida('Encaixotamento');
                        const mqShrinkRec = getMaquinaMaisRapida('Shrink');

                        setIdMaquinaEncaixotamento(temCalculo && src.encaixotamento?.maquina_id ? String(src.encaixotamento.maquina_id) : (mqBoxRec ? String(mqBoxRec.id) : ''));
                        setIdMaquinaShrink(temCalculo && src.shrink?.maquina_id ? String(src.shrink.maquina_id) : (mqShrinkRec ? String(mqShrinkRec.id) : ''));
                        
                        setEtapa(3);
                      }}>
                        <td className="p-3 pl-4 text-center text-slate-400 group-hover:text-indigo-600"><i className="fas fa-arrow-right"></i></td>
                        <td className="p-3 font-mono font-bold text-slate-800">{k.id_codigo_kit}</td>
                        <td className="p-3 truncate max-w-[200px]" title={k.id_descricao_kit}>{k.id_descricao_kit}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700">{k.qnt_skus}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700">{k.espessura_kit_mm} mm</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-700 border-r">{Number(k.tiragem).toLocaleString('pt-BR')}</td>
                        
                        <td className={`p-3 text-center font-mono text-xs ${tBox === 'Pend.' ? 'text-slate-400 italic' : 'font-bold text-blue-900 bg-blue-50/20'}`}>{tBox}</td>
                        <td className={`p-3 text-center font-mono text-xs border-r ${tShrink === '-' ? 'text-slate-400 italic' : 'font-bold text-purple-900 bg-purple-50/20'}`}>{tShrink}</td>
                        <td className={`p-3 text-center font-mono text-[12px] font-black pr-4 ${tTotal === 'Pend.' ? 'text-slate-400 italic' : 'text-slate-950 bg-slate-200/60'}`}>{tTotal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}

      {/* ETAPA 3: DETALHAMENTO DO KIT MANUAL */}
      {etapa === 3 && kitAtual && (() => {
        const analiseBox = idMaquinaEncaixotamento ? calcularOperacaoKit(maquinasCarregadas.find(m => String(m.id) === idMaquinaEncaixotamento), kitAtual, false) : null;
        const analiseShrink = idMaquinaShrink ? calcularOperacaoKit(maquinasCarregadas.find(m => String(m.id) === idMaquinaShrink), kitAtual, true) : null;

        return (
          <div className="w-full text-left font-sans text-slate-800 pb-24">
            <div className="bg-slate-800 text-white rounded-t-lg p-4 flex justify-between items-center shadow-sm">
              <div>
                <h2 className="text-lg font-bold uppercase tracking-wide">Configuração do Kit: {kitAtual.id_codigo_kit}</h2>
                <p className="text-slate-300 text-xs font-mono mt-1">Lote: {filtroProducao} | Itens do Pacote: <span className="text-amber-400 font-bold">{kitAtual.qnt_skus} SKUs</span></p>
              </div>
              <button onClick={() => setEtapa(2)} className="bg-slate-700 hover:bg-slate-600 text-xs font-bold px-4 py-2 rounded shadow-sm">Voltar para a Fila</button>
            </div>

            <div className="bg-white border-x border-b border-slate-200 rounded-b-lg p-5 grid grid-cols-2 md:grid-cols-4 gap-6 shadow-sm mb-6">
              <div><span className="block text-[10px] font-bold text-slate-500 uppercase">Composição Kit</span><span className="text-sm font-bold text-slate-800 truncate block">{kitAtual.id_descricao_kit}</span></div>
              <div><span className="block text-[10px] font-bold text-slate-500 uppercase">Volume Comercial</span><span className="text-sm font-mono font-bold text-slate-700">{Number(kitAtual.tiragem).toLocaleString('pt-BR')} un.</span></div>
              <div><span className="block text-[10px] font-bold text-slate-500 uppercase">Espessura Total</span><span className="text-sm font-mono font-bold text-slate-700">{kitAtual.espessura_kit_mm} mm</span></div>
              <div><span className="block text-[10px] font-bold text-slate-500 uppercase">Embalagem</span><span className="text-sm font-bold text-indigo-700 uppercase">{kitAtual.tipo_kit || 'Comum'} {String(kitAtual.com_shrink).toUpperCase() === 'SIM' ? '(C/ SHRINK)' : ''}</span></div>
            </div>

            {/* SEÇÃO 1: ESTAÇÃO DE ENCAIXOTAMENTO */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 overflow-hidden border-l-4 border-l-blue-600">
              <div className="bg-slate-50 border-b p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSecao('encaixotamento')}>
                <h3 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-2"><span className="bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded text-xs">1</span> Estação de Encaixotamento Manual / Auto</h3>
                <div className="flex items-center gap-4 relative">
                  <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'box' ? null : 'box'); }} className="text-slate-400 hover:text-blue-600 text-lg">
                    <i className="fas fa-info-circle"></i>
                  </button>
                  {/* TOOLTIP CENTRALIZADO */}
                  {tooltipAtivo === 'box' && (
                    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-slate-700 leading-relaxed cursor-default" onClick={e => e.stopPropagation()}>
                      <div className="border-b border-slate-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase text-amber-400 font-mono text-[11px]">Complexidade de Encaixotamento</h4><button onClick={() => setTooltipAtivo(null)} className="font-bold">X</button></div>
                      <div className="space-y-2 text-slate-300 font-normal normal-case">
                        <p><strong>1. Penalidade de SKU (+10%):</strong> Cada SKU extra adiciona complexidade na triagem mecânica de montagem, reduzindo linearmente a velocidade até o limite máximo de perda de 75%.</p>
                        <p><strong>2. Penalidade de Espessura (+15%):</strong> Pacotes volumosos acima de 30mm exigem caixas maiores e maior esforço físico de fechamento por fita adesiva.</p>
                      </div>
                    </div>
                  )}
                  <i className={`fas fa-chevron-${secoes.encaixotamento ? 'up' : 'down'}`}></i>
                </div>
              </div>

              {secoes.encaixotamento && (
                <div className="p-4">
                  <select value={idMaquinaEncaixotamento} onChange={e => setIdMaquinaEncaixotamento(e.target.value)} className="w-full border rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                    <option value="">Selecione a bancada/linha de encaixotamento...</option>
                    {maquinasCarregadas.filter(m => String(m.tipo || '').toLowerCase().includes('encaixotamento')).map(m => <option key={m.id} value={m.id}>{m.modelo} (Base: {m.produtividade_unit} un/h)</option>)}
                  </select>
                  {analiseBox && (
                    <div className="mt-4 border rounded overflow-hidden">
                      <div className="bg-slate-50 border-b p-2 flex gap-6 text-xs font-bold text-slate-600 uppercase tracking-wide">
                        <span>Velocidade Nominal: <span className="font-mono">{analiseBox.parametros.velNominal.toLocaleString('pt-BR')} un/h</span></span>
                        <span>Perda por Complexidade: <span className="text-red-600 font-mono">-{analiseBox.parametros.penalidadeTotal}%</span></span>
                        <span>Veloc. Real Aplicada: <span className="text-blue-700 font-mono">{analiseBox.parametros.velReal.toLocaleString('pt-BR')} un/h</span></span>
                      </div>
                      <table className="w-full text-left border-collapse text-sm bg-white">
                        <thead className="bg-slate-100 border-b text-[10px] uppercase font-bold text-slate-500">
                          <tr><th className="p-2 pl-4">Posto Operacional</th><th className="p-2 text-right">Volume c/ Quebras</th><th className="p-2 text-center">Setup Regulagem</th><th className="p-2 text-center">Tempo Rodagem</th><th className="p-2 text-center pr-4">Total Setor</th></tr>
                        </thead>
                        <tbody className="font-mono text-slate-700 text-xs">
                          <tr>
                            <td className="p-2 pl-4 font-sans font-bold">Encaixotamento / Paletização</td>
                            <td className="p-2 text-right">{analiseBox.parametros.tiragemProduzida.toLocaleString('pt-BR')}</td>
                            <td className="p-2 text-center">{analiseBox.totais.setup}</td>
                            <td className="p-2 text-center">{analiseBox.totais.rodagem}</td>
                            <td className="p-2 text-center font-bold text-blue-700 pr-4">{analiseBox.totais.total}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SEÇÃO 2: SELADORA / TÚNEL SHRINK */}
            {String(kitAtual.com_shrink || '').toUpperCase() === 'SIM' && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 overflow-hidden border-l-4 border-l-purple-600">
                <div className="bg-purple-50/30 border-b p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSecao('shrink')}>
                  <h3 className="text-sm font-bold uppercase text-purple-950 flex items-center gap-2"><span className="bg-purple-600 text-white w-6 h-6 flex items-center justify-center rounded text-xs">2</span> Seladora Termoencolhível (Túnel Shrink)</h3>
                  <div className="flex items-center gap-4 relative">
                    <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'shrink' ? null : 'shrink'); }} className="text-slate-400 hover:text-purple-600 text-lg">
                      <i className="fas fa-info-circle"></i>
                    </button>
                    {/* TOOLTIP CENTRALIZADO */}
                    {tooltipAtivo === 'shrink' && (
                      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-purple-700 leading-relaxed cursor-default" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-purple-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase text-purple-400 font-mono text-[11px]">Cronoanálise do Fluxo de Shrink</h4><button onClick={() => setTooltipAtivo(null)} className="font-bold">X</button></div>
                        <div className="space-y-2 text-slate-300 font-normal normal-case">
                          <p>A película plástica termoencolhível sofre as mesmas perdas físicas de manipulação por quantidade de SKUs e espessura antes de entrar no túnel térmico automatizado.</p>
                        </div>
                      </div>
                    )}
                    <i className={`fas fa-chevron-${secoes.shrink ? 'up' : 'down'}`}></i>
                  </div>
                </div>

                {secoes.shrink && (
                  <div className="p-4">
                    <select value={idMaquinaShrink} onChange={e => setIdMaquinaShrink(e.target.value)} className="w-full border rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                      <option value="">Selecione o motor de shrink...</option>
                      {maquinasCarregadas.filter(m => String(m.tipo || '').toLowerCase().includes('shrink')).map(m => <option key={m.id} value={m.id}>{m.modelo} (Base: {m.produtividade_unit} un/h)</option>)}
                    </select>
                    {analiseShrink && (
                      <div className="mt-4 border rounded overflow-hidden">
                        <div className="bg-purple-50/50 border-b p-2 flex gap-6 text-xs font-bold text-purple-900 uppercase tracking-wide">
                          <span>Velocidade Nominal: <span className="font-mono">{analiseShrink.parametros.velNominal.toLocaleString('pt-BR')} un/h</span></span>
                          <span>Perda por Complexidade: <span className="text-red-600 font-mono">-{analiseShrink.parametros.penalidadeTotal}%</span></span>
                          <span>Veloc. Real Aplicada: <span className="text-purple-700 font-mono">{analiseShrink.parametros.velReal.toLocaleString('pt-BR')} un/h</span></span>
                        </div>
                        <table className="w-full text-left border-collapse text-sm bg-white">
                          <thead className="bg-slate-100 border-b text-[10px] uppercase font-bold text-slate-500">
                            <tr><th className="p-2 pl-4">Posto Operacional</th><th className="p-2 text-right">Volume c/ Quebras</th><th className="p-2 text-center">Setup Regulagem</th><th className="p-2 text-center">Tempo Rodagem</th><th className="p-2 text-center pr-4">Total Setor</th></tr>
                          </thead>
                          <tbody className="font-mono text-slate-700 text-xs">
                            <tr>
                              <td className="p-2 pl-4 font-sans font-bold text-slate-700">Envelopamento e Encolhimento Térmico</td>
                              <td className="p-2 text-right">{analiseShrink.parametros.tiragemProduzida.toLocaleString('pt-BR')}</td>
                              <td className="p-2 text-center">{analiseShrink.totais.setup}</td>
                              <td className="p-2 text-center">{analiseShrink.totais.rodagem}</td>
                              <td className="p-2 text-center font-bold text-purple-700 pr-4">{analiseShrink.totais.total}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* BOTÃO SALVAR MANUALLY */}
            {analiseBox && (
              <div className="flex justify-end mt-6">
                <button onClick={() => salvarKitNoBanco(analiseBox, analiseShrink)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded-md shadow-md flex items-center gap-2 text-sm uppercase tracking-wide transition-colors">
                  <i className="fas fa-save"></i> Gravar Engenharia do Kit
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}