"use client";
import { useEffect, useState, useRef, Fragment } from 'react';

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

  if (totalMinutos === 0) return 'Pend.';
  const dias = Math.floor(totalMinutos / (24 * 60));
  const horas = Math.floor((totalMinutos % (24 * 60)) / 60);
  const minutos = totalMinutos % 60;
  const hhmm = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
  return dias > 0 ? `${dias} dia${dias > 1 ? 's' : ''} + ${hhmm}` : hhmm;
};

export default function RegistrosTempo() {
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);
  const [grafica, setGrafica] = useState('');
  const [filtroProducao, setFiltroProducao] = useState('');
  
  const [filtroGraficaGlobal, setFiltroGraficaGlobal] = useState('');
  
  const [skus, setSkus] = useState<any[]>([]);
  const [capasDoLote, setCapasDoLote] = useState<any[]>([]);
  const [encartesDoLote, setEncartesDoLote] = useState<any[]>([]);
  const [osAtual, setOsAtual] = useState<any>(null);
  
  const [lotesDisponiveis, setLotesDisponiveis] = useState<any[]>([]);
  const [maquinasCargadas, setMaquinasCargadas] = useState<any[]>([]);
  
  const [feedback, setFeedback] = useState({ msg: '', tipo: '' });

  const [lotesSelecionados, setLotesSelecionados] = useState<{ filtro_producao: string, grafica: string }[]>([]);
  const [expandedLotes, setExpandedLotes] = useState<Set<string>>(new Set());
  const [skusByLote, setSkusByLote] = useState<Map<string, any[]>>(new Map());
  const [loadingExpandLotes, setLoadingExpandLotes] = useState<Set<string>>(new Set());
  const [skusSelecionadosStatus, setSkusSelecionadosStatus] = useState<Array<{sku_alvo: string, filtro_producao: string, grafica: string}>>([]);
  const [bulkStatusValue, setBulkStatusValue] = useState('');
  const [isApplyingStatus, setIsApplyingStatus] = useState(false);
  const [loteStatusValue, setLoteStatusValue] = useState('');
  const [isApplyingLoteStatus, setIsApplyingLoteStatus] = useState(false);
  const [carregandoLotes, setCarregandoLotes] = useState(false);
  const [acaoPendenteMassa, setAcaoPendenteMassa] = useState<'calcular' | 'apagar' | null>(null);
  const [statusProducao, setStatusProducao] = useState('');
  const [showCsvDropdown, setShowCsvDropdown] = useState(false);

  // Máquinas alocadas (Edição Manual)
  const [idMaquinaImpressao, setIdMaquinaImpressao] = useState('');
  const [idMaquinaImpressaoCapa, setIdMaquinaImpressaoCapa] = useState('');
  const [idMaquinaImpressaoEncarte, setIdMaquinaImpressaoEncarte] = useState('');
  const [idMaquinaImpressaoAdesivo, setIdMaquinaImpressaoAdesivo] = useState('');
  const [idMaquinaBeneficiamentoCapa, setIdMaquinaBeneficiamentoCapa] = useState('');
  const [idMaquinaEmpastamentoCapa, setIdMaquinaEmpastamentoCapa] = useState('');
  const [idMaquinaDobra, setIdMaquinaDobra] = useState('');
  const [idMaquinaAlceadeira, setIdMaquinaAlceadeira] = useState('');
  const [idMaquinaGrampo, setIdMaquinaGrampo] = useState(''); 
  const [idMaquinaFuracao, setIdMaquinaFuracao] = useState(''); 
  const [idMaquinaEspiral, setIdMaquinaEspiral] = useState(''); 
  const [idMaquinaCorteVinco, setIdMaquinaCorteVinco] = useState('');

  // Máquinas e Filtros do Robô de Automação
  const [robo, setRobo] = useState({ impressao: '', impressaoCapa: '', impressaoEncarte: '', impressaoAdesivo: '', benefCapa: '', empastCapa: '', dobra: '', alceadeira: '', grampo: '', furacao: '', espiral: '', corteVinco: '' });
  const [roboFiltros, setRoboFiltros] = useState<{ acabamento: string[], lombada: string[] }>({ acabamento: [], lombada: [] });
  const [dropdownRobo, setDropdownRobo] = useState<'acabamento' | 'lombada' | null>(null);

  const [modalConfigLimpar, setModalConfigLimpar] = useState(false);
  const [limparFiltros, setLimparFiltros] = useState<{ acabamento: string[], sku: string }>({ acabamento: [], sku: '' });
  const [dropdownLimpar, setDropdownLimpar] = useState<'acabamento' | null>(null);

  const [modalRobo, setModalRobo] = useState(false);
  const [progressoRobo, setProgressoRobo] = useState({ atual: 0, total: 0, status: '', tipo: '' });
  const cancelarRoboRef = useRef(false);

  const [secoes, setSecoes] = useState({ impressao: true, impressaoCapa: true, impressaoEncarte: true, impressaoAdesivo: true, benefCapa: true, empastCapa: true, dobra: true, alceamento: true, grampo: true, espiral: true, corteVinco: true });
  const [tooltipAtivo, setTooltipAtivo] = useState<string | null>(null);

  const carregarFiltrosIniciais = () => {
    fetch(`/api/producao/miolo/filtros?ts=${Date.now()}`).then(res => res.json()).then(setLotesDisponiveis).catch(() => {});
  };

  useEffect(() => {
    carregarFiltrosIniciais();
  }, []);

  useEffect(() => {
    if ((etapa === 2 || etapa === 3) && grafica) {
      fetch(`/api/maquinas?ts=${Date.now()}`)
        .then(res => res.json())
        .then(dados => {
          const mFiltradas = dados.filter((m: any) => String(m.grafica || '').toUpperCase() === String(grafica || '').toUpperCase());
          setMaquinasCargadas(mFiltradas);
        }).catch(() => {});
    }
  }, [etapa, grafica]);

  useEffect(() => {
    if (filtroProducao && grafica && etapa === 2) {
      fetch(`/api/producao/status?filtro=${encodeURIComponent(filtroProducao)}&grafica=${encodeURIComponent(grafica)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.status_producao) setStatusProducao(d.status_producao); else setStatusProducao(''); })
        .catch(() => {});
    }
  }, [filtroProducao, grafica, etapa]);

  useEffect(() => {
    if (acaoPendenteMassa && skus.length > 0 && maquinasCargadas.length > 0) {
      const acao = acaoPendenteMassa;
      setAcaoPendenteMassa(null); 

      if (acao === 'calcular') {
        executarAutomacaoEmMassa(true); 
      } else if (acao === 'apagar') {
        setLimparFiltros({ acabamento: [], sku: '' });
        setModalConfigLimpar(true);
      }
    }
  }, [acaoPendenteMassa, skus, maquinasCargadas]);

  const pendentesRaw = skus.filter(s => s.dados_calculo == null);
  const opcoesAcabRobo = Array.from(new Set(pendentesRaw.map(s => String(s.acabamento || '').toUpperCase()))).filter(Boolean);
  const opcoesLombRobo = Array.from(new Set(pendentesRaw.map(s => String(s.lombada || '0')))).filter(Boolean).sort((a, b) => Number(a) - Number(b));

  const skusAlvoRobo = pendentesRaw.filter(s => {
    const acab = String(s.acabamento || '').toUpperCase();
    const lomb = String(s.lombada || '0');
    const matchA = roboFiltros.acabamento.length === 0 || roboFiltros.acabamento.includes(acab);
    const matchL = roboFiltros.lombada.length === 0 || roboFiltros.lombada.includes(lomb);
    return matchA && matchL;
  });

  const calculadosRaw = skus.filter(s => s.dados_calculo != null);
  const alvosLimpeza = calculadosRaw.filter(s => {
    const acab = String(s.acabamento || '').toUpperCase();
    const matchA = limparFiltros.acabamento.length === 0 || limparFiltros.acabamento.includes(acab);
    const matchS = limparFiltros.sku === '' || String(s.sku_miolo || '').toUpperCase().includes(limparFiltros.sku.toUpperCase());
    return matchA && matchS;
  });

  const processarLotesPorFora = async (acao: 'calcular' | 'apagar') => {
    const graficasUnicas = new Set(lotesSelecionados.map(l => l.grafica));
    if (graficasUnicas.size > 1) {
      alert("Atenção: Por favor, selecione apenas lotes da mesma Gráfica para o processamento unificado.");
      return;
    }
    
    setCarregandoLotes(true);
    const graficaEscolhida = lotesSelecionados[0].grafica;

    try {
      let mergedMiolo: any[] = [];
      let mergedCapas: any[] = [];
      let mergedEncartes: any[] = [];

      for (const lote of lotesSelecionados) {
        const [resM, resC, resE] = await Promise.all([
          fetch(`/api/producao/miolo?grafica=${graficaEscolhida}&filtro=${lote.filtro_producao}`),
          fetch(`/api/producao/capas?grafica=${graficaEscolhida}&filtro=${lote.filtro_producao}`),
          fetch(`/api/producao/encarte?grafica=${graficaEscolhida}&filtro=${lote.filtro_producao}`)
        ]);
        if (resM.ok) mergedMiolo.push(...await resM.json());
        if (resC.ok) mergedCapas.push(...await resC.json());
        if (resE.ok) mergedEncartes.push(...await resE.json());
      }

      const resMaq = await fetch(`/api/maquinas?ts=${Date.now()}`);
      let dadosMaq = [];
      if(resMaq.ok) {
         const mBase = await resMaq.json();
         dadosMaq = mBase.filter((m: any) => String(m.grafica).toUpperCase() === String(graficaEscolhida).toUpperCase());
      }

      setFiltroProducao("Lotes em Massa (" + lotesSelecionados.length + ")");
      setGrafica(graficaEscolhida);
      
      setSkus(mergedMiolo);
      setCapasDoLote(mergedCapas);
      setEncartesDoLote(mergedEncartes);
      setMaquinasCargadas(dadosMaq);

      setAcaoPendenteMassa(acao);

    } catch(e) {
      console.error(e);
      alert("Erro de rede ao fundir lotes. Tente novamente.");
    } finally {
      setCarregandoLotes(false);
    }
  };

  const carregarItensDoLote = async (loteEscolhido: string, graficaEscolhida: string) => {
    setFiltroProducao(loteEscolhido);
    setGrafica(graficaEscolhida);
    try {
      const [resMiolo, resCapas, resEncartes] = await Promise.all([
        fetch(`/api/producao/miolo?grafica=${graficaEscolhida}&filtro=${loteEscolhido}`),
        fetch(`/api/producao/capas?grafica=${graficaEscolhida}&filtro=${loteEscolhido}`),
        fetch(`/api/producao/encarte?grafica=${graficaEscolhida}&filtro=${loteEscolhido}`)
      ]);
      const dadosMiolo = resMiolo.ok ? await resMiolo.json() : [];
      const dadosCapas = resCapas.ok ? await resCapas.json() : [];
      const dadosEncartes = resEncartes.ok ? await resEncartes.json() : [];

      if (resMiolo.ok && dadosMiolo.length > 0) {
        setSkus(dadosMiolo);
        setCapasDoLote(dadosCapas || []);
        setEncartesDoLote(dadosEncartes || []);
        setEtapa(2);
      }
    } catch(e) { console.error("Erro ao carregar SKUs", e); }
  };

  const toggleSecao = (secao: string) => { setSecoes(prev => ({ ...prev, [secao]: !prev[secao as keyof typeof secoes] })); };

  const toggleExpandLote = async (filtro_producao: string, grafica_lote: string) => {
    const key = `${filtro_producao}|${grafica_lote}`;
    setExpandedLotes(prev => {
      const n = new Set(prev);
      if (n.has(key)) { n.delete(key); return n; }
      n.add(key); return n;
    });
    if (!skusByLote.has(key) && !loadingExpandLotes.has(key)) {
      setLoadingExpandLotes(prev => new Set([...prev, key]));
      try {
        const res = await fetch(`/api/producao/painel?grafica=${encodeURIComponent(grafica_lote)}&filtro=${encodeURIComponent(filtro_producao)}`);
        const data = await res.json();
        setSkusByLote(prev => new Map([...prev, [key, Array.isArray(data) ? data : []]]));
      } catch(e) {
        setSkusByLote(prev => new Map([...prev, [key, []]]));
      } finally {
        setLoadingExpandLotes(prev => { const n = new Set(prev); n.delete(key); return n; });
      }
    }
  };

  const toggleSkuStatus = (sku_alvo: string, filtro_producao: string, grafica_lote: string) => {
    setSkusSelecionadosStatus(prev => {
      const exists = prev.some(s => s.sku_alvo === sku_alvo && s.filtro_producao === filtro_producao);
      if (exists) return prev.filter(s => !(s.sku_alvo === sku_alvo && s.filtro_producao === filtro_producao));
      return [...prev, { sku_alvo, filtro_producao, grafica: grafica_lote }];
    });
  };

  const applyBulkStatus = async () => {
    if (!bulkStatusValue || skusSelecionadosStatus.length === 0) return;
    setIsApplyingStatus(true);
    try {
      const graficas = [...new Set(skusSelecionadosStatus.map(s => s.grafica))];
      await Promise.all(graficas.map(g => {
        const updates = skusSelecionadosStatus.filter(s => s.grafica === g);
        return fetch('/api/producao/painel', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grafica: g, updates: updates.map(u => ({ sku_alvo: u.sku_alvo, filtro_producao: u.filtro_producao, status_producao: bulkStatusValue })) })
        });
      }));
      // Optimistic update in local cache
      setSkusByLote(prev => {
        const selectedSet = new Set(skusSelecionadosStatus.map(s => `${s.sku_alvo}|${s.filtro_producao}`));
        const newMap = new Map<string, any[]>();
        for (const [k, rows] of prev) {
          newMap.set(k, rows.map(r => selectedSet.has(`${r.sku_alvo}|${r.lote}`) ? { ...r, status_producao: bulkStatusValue } : r));
        }
        return newMap;
      });
      setSkusSelecionadosStatus([]);
      setBulkStatusValue('');
      const count = skusSelecionadosStatus.length;
      setFeedback({ msg: `${count} SKUs atualizados para "${bulkStatusValue}"`, tipo: 'sucesso' });
      setTimeout(() => setFeedback({ msg: '', tipo: '' }), 2500);
    } catch(e) {
      setFeedback({ msg: 'Erro ao atualizar status.', tipo: 'erro' });
      setTimeout(() => setFeedback({ msg: '', tipo: '' }), 2500);
    } finally {
      setIsApplyingStatus(false);
    }
  };

  const applyLoteBulkStatus = async () => {
    if (!loteStatusValue || lotesSelecionados.length === 0) return;
    setIsApplyingLoteStatus(true);
    try {
      const graficas = [...new Set(lotesSelecionados.map(l => l.grafica))];
      await Promise.all(graficas.map(g => {
        const lotes = lotesSelecionados.filter(l => l.grafica === g);
        return fetch('/api/producao/painel', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grafica: g, lote_updates: lotes.map(l => ({ filtro_producao: l.filtro_producao, status_producao: loteStatusValue })) })
        });
      }));
      // Optimistic update in local SKU cache
      setSkusByLote(prev => {
        const loteSet = new Set(lotesSelecionados.map(l => `${l.filtro_producao}|${l.grafica}`));
        const newMap = new Map<string, any[]>();
        for (const [k, rows] of prev) {
          if (loteSet.has(k)) newMap.set(k, rows.map(r => ({ ...r, status_producao: loteStatusValue })));
          else newMap.set(k, rows);
        }
        return newMap;
      });
      const count = lotesSelecionados.length;
      setLoteStatusValue('');
      setFeedback({ msg: `${count} lote(s) atualizados para "${loteStatusValue}"`, tipo: 'sucesso' });
      setTimeout(() => { setFeedback({ msg: '', tipo: '' }); carregarFiltrosIniciais(); }, 2500);
    } catch(e) {
      setFeedback({ msg: 'Erro ao atualizar status dos lotes.', tipo: 'erro' });
      setTimeout(() => setFeedback({ msg: '', tipo: '' }), 2500);
    } finally {
      setIsApplyingLoteStatus(false);
    }
  };

  const toggleRoboFiltro = (tipo: 'acabamento' | 'lombada', valor: string) => {
    setRoboFiltros(prev => {
      const atual = prev[tipo];
      if (atual.includes(valor)) return { ...prev, [tipo]: atual.filter(v => v !== valor) };
      return { ...prev, [tipo]: [...atual, valor] };
    });
  };

  const toggleLimparFiltro = (valor: string) => {
    setLimparFiltros(prev => {
      const atual = prev.acabamento;
      if (atual.includes(valor)) return { ...prev, acabamento: atual.filter(v => v !== valor) };
      return { ...prev, acabamento: [...atual, valor] };
    });
  };

  const getMaquinaMaisRapida = (tipoBusca: string, subtipoBusca?: string) => {
    let candidatas = maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes(String(tipoBusca).toLowerCase()));
    if (subtipoBusca) {
      candidatas = maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes(String(tipoBusca).toLowerCase()) || String(m.tipo || '').toLowerCase().includes(String(subtipoBusca).toLowerCase()));
    }
    if (candidatas.length === 0) return null;
    return candidatas.sort((a, b) => Number(b.produtividade_unit || 0) - Number(a.produtividade_unit || 0))[0];
  };

  const getMaquinaIdeal = (tipoBusca: string, tecnologiaPreferida: string | null = null, subtipoBusca: string | null = null) => {
    let candidatas = maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes(tipoBusca.toLowerCase()));
    if (subtipoBusca) {
         candidatas = maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes(tipoBusca.toLowerCase()) || String(m.tipo || '').toLowerCase().includes(subtipoBusca.toLowerCase()));
    }
    if (candidatas.length === 0) return null;

    if (tecnologiaPreferida) {
         let filtradas = candidatas.filter(m => {
             const t = String(m.tipo || '').toUpperCase();
             const n = String(m.modelo || '').toUpperCase();
             const pref = tecnologiaPreferida.toUpperCase();

             if (t.includes(pref) || n.includes(pref)) return true;

             const isRot = t.includes("ROTATIVA") || n.includes("ROTATIVA");
             const isPlana = t.includes("PLANA") || n.includes("PLANA") || (!isRot && (t.includes("OFFSET") || t.includes("DIGITAL"))); 
             const isDig = t.includes("DIGITAL") || n.includes("DIGITAL");
             const isOff = t.includes("OFFSET") || n.includes("OFFSET");

             if (pref.includes("DIGITAL") && pref.includes("PLANA")) return isDig && isPlana;
             if (pref.includes("DIGITAL") && pref.includes("ROTATIVA")) return isDig && isRot;
             if (pref.includes("OFFSET") && pref.includes("PLANA")) return isOff && isPlana;
             if (pref.includes("OFFSET") && pref.includes("ROTATIVA")) return isOff && isRot;
             if (pref === "DIGITAL") return isDig;
             if (pref === "PLANA") return isPlana; 
             if (pref === "OFFSET") return isOff;

             return false;
         });
         if (filtradas.length > 0) candidatas = filtradas;
    }

    if (grafica === 'MAXI') {
      return candidatas.sort((a, b) => {
        const cfg = (m: any) => { try { return typeof m.configuracoes === 'string' ? JSON.parse(m.configuracoes) : (m.configuracoes || {}); } catch(e) { return {}; } };
        return (Number(b.produtividade_unit || 0) * (Number(cfg(b).pgs_caderno) || 1)) - (Number(a.produtividade_unit || 0) * (Number(cfg(a).pgs_caderno) || 1));
      })[0];
    }
    return candidatas.sort((a, b) => Number(b.produtividade_unit || 0) - Number(a.produtividade_unit || 0))[0];
  };

  // Roteamento dedicado: prioriza impressoras cujo modelo/tipo/descrição contenha a palavra-chave
  // (ex.: "capa" ou "encarte"). Retorna null se nenhuma máquina dedicada existir, deixando o
  // chamador seguir com o fallback padrão (getMaquinaIdeal).
  const getMaquinaDedicada = (palavraChave: string) => {
    const chave = String(palavraChave).toLowerCase();
    const candidatas = maquinasCargadas.filter(m => {
      const ehImpressao = String(m.tipo || '').toLowerCase().includes('impress');
      const texto = `${m.modelo || ''} ${m.tipo || ''} ${m.descricao || ''}`.toLowerCase();
      return ehImpressao && texto.includes(chave);
    });
    if (candidatas.length === 0) return null;
    return candidatas.sort((a, b) => Number(b.produtividade_unit || 0) - Number(a.produtividade_unit || 0))[0];
  };

  const getMaquinaAlceamentoIdeal = (acabamento: string, totalCadernos: number) => {
    const isPUR = String(acabamento).toUpperCase().includes('PUR');
    let candidatas = maquinasCargadas.filter(m => {
        const t = String(m.tipo || '').toUpperCase();
        const mod = String(m.modelo || '').toUpperCase();
        if (isPUR) return t.includes('COLADEIRA') || t.includes('PUR') || mod.includes('PUR');
        if (grafica === 'IMOS' && !isPUR && mod.includes('MULLER')) return false;
        return t.includes('ALCEADEIRA') && !t.includes('COLADEIRA') && !t.includes('PUR');
    });
    
    if (candidatas.length === 0) return null;

    let bestMachine = null;
    let minEntradas = Infinity;
    let maxVelocidade = -1;

    for (const mq of candidatas) {
        let config: any = {};
        try {
            if (typeof mq.configuracoes === 'string') config = JSON.parse(mq.configuracoes);
            else if (mq.configuracoes) config = mq.configuracoes;
        } catch(e) {}
        
        const gavetas = Number(config.gavetas) || 1;
        const entradas = Math.ceil(totalCadernos / gavetas);
        const vel = Number(mq.produtividade_unit) || 1;

        if (entradas < minEntradas) {
            minEntradas = entradas;
            maxVelocidade = vel;
            bestMachine = mq;
        } else if (entradas === minEntradas && vel > maxVelocidade) {
            maxVelocidade = vel;
            bestMachine = mq;
        }
    }
    return bestMachine;
  };

  const getMaquinaEspiralAdequada = (lombada: number, maquinaImpressao?: any) => {
    const espirais = maquinasCargadas.filter(m =>
      String(m.tipo || '').toLowerCase().includes('espiral') ||
      String(m.tipo || '').toLowerCase().includes('wire')
    );
    if (espirais.length === 0) return null;

    // PASSO A: menor limite >= lombada; se nenhuma cabe, usa a de maior limite
    const validas = espirais.filter(m => Number(m.limite_lombada || 0) >= lombada);
    const candidata = validas.length > 0
      ? validas.sort((a, b) => Number(a.limite_lombada) - Number(b.limite_lombada))[0]
      : espirais.sort((a, b) => Number(b.limite_lombada) - Number(a.limite_lombada))[0];
    if (!candidata) return null;

    // PASSO B: a candidata é uma máquina AUTOMÁTICA?
    const modC = String(candidata.modelo || '').toUpperCase();
    const isAutomatica = modC.includes('AUTOMÁTIC') || modC.includes('AUTOMATIC');

    if (isAutomatica && maquinaImpressao) {
      // PASSO C: desvia para a variante correta pela tecnologia da Impressão 1.1
      const tipoImp = String(maquinaImpressao.tipo || '').toUpperCase();
      const modImp = String(maquinaImpressao.modelo || '').toUpperCase();
      const isDigital = tipoImp.includes('DIGITAL') || modImp.includes('DIGITAL');
      const targetNome = isDigital ? 'ESPIRAL AUTOMÁTICA - DIGITAL' : 'ESPIRAL AUTOMÁTICA - OFFSET';
      const maqEspecifica = maquinasCargadas.find(m =>
        String(m.modelo || '').toUpperCase().trim() === targetNome
      );
      if (maqEspecifica) return maqEspecifica; // PASSO D
    }
    return candidata;
  };

  // ----------------------------------------------------------------------
  // MOTORES DE CÁLCULO FÍSICO
  // ----------------------------------------------------------------------
  
  const calcularTiragemComQuebra = (tiragemComercial: number, maquinaObj: any) => {
    let isDigital = false;
    if (maquinaObj) {
      const tipo = String(maquinaObj.tipo || '').toUpperCase();
      const modelo = String(maquinaObj.modelo || '').toUpperCase();
      isDigital = tipo.includes('DIGITAL') || modelo.includes('DIGITAL');
    }
    if (isDigital) {
      return Math.round(tiragemComercial + 22 + (tiragemComercial * 0.05));
    }
    return Math.round(tiragemComercial + 175 + (tiragemComercial * 0.06));
  };

  const calcularImpressao = (maquina: any, paginasOS: number, tiragemFinalOS: number) => {
    if (!maquina) return null;
    const tiragemProduzida = calcularTiragemComQuebra(tiragemFinalOS, maquina);
    const capacidadeMax = Number(maquina.configuracoes?.pgs_caderno) || 16;
    const velocidade = Number(maquina.produtividade_unit) || 1;
    const setupUnitario = timeToDecimal(maquina.setup || '00:00');
    const qtdCores = Number(maquina.maq_cores) || 4;
    const passadas = qtdCores <= 4 ? 2 : 1;
    const _tipo = String(maquina?.tipo || '').toUpperCase();
    const _modelo = String(maquina?.modelo || '').toUpperCase();
    const isDigital = _tipo.includes('DIGITAL') || _modelo.includes('DIGITAL');

    const linhas = [];
    const cadernosInteiros = Math.floor(paginasOS / capacidadeMax);
    let totalGirosInteiros = 0, setupInteirosDecimal = 0, rodagemInteirosDecimal = 0;

    if (cadernosInteiros > 0) {
      totalGirosInteiros = cadernosInteiros * tiragemProduzida * passadas;
      setupInteirosDecimal = isDigital ? setupUnitario : setupUnitario * cadernosInteiros * passadas;
      rodagemInteirosDecimal = totalGirosInteiros / velocidade;
      linhas.push({ tipo: `CADERNO ${capacidadeMax} PGS (INTEIRO)`, qtd: cadernosInteiros, giros: totalGirosInteiros, setup: decimalToTime(setupInteirosDecimal), rodagem: decimalToTime(rodagemInteirosDecimal), total: decimalToTime(setupInteirosDecimal + rodagemInteirosDecimal) });
    }

    const paginasRestantes = paginasOS % capacidadeMax;
    let setupFracionadoDecimal = 0, rodagemFracionadoDecimal = 0, girosFracionado = 0, poses = 1;

    if (paginasRestantes > 0) {
      poses = Math.floor(capacidadeMax / paginasRestantes) || 1;
      girosFracionado = Math.ceil(tiragemProduzida / poses) * passadas;
      setupFracionadoDecimal = isDigital ? (cadernosInteiros > 0 ? 0 : setupUnitario) : setupUnitario * 1 * passadas;
      rodagemFracionadoDecimal = girosFracionado / velocidade;
      linhas.push({ tipo: `CADERNO ${paginasRestantes} PGS (FRAÇÃO ${poses}x UP)`, qtd: 1, giros: girosFracionado, setup: decimalToTime(setupFracionadoDecimal), rodagem: decimalToTime(rodagemFracionadoDecimal), total: decimalToTime(setupFracionadoDecimal + rodagemFracionadoDecimal) });
    }

    const totalCadernos = cadernosInteiros + (paginasRestantes > 0 ? 1 : 0);
    return { parametros: { capacidadeMax, velocidade, setupUnitario: maquina.setup, tiragemProduzida, paginasRestantes, cadernosInteiros, posesFracionado: poses, passadas, qtdCores, tiragemFinalOS }, maquinaSetupStr: maquina.setup || '00:00', linhas, totais: { qtd: totalCadernos, giros: totalGirosInteiros + girosFracionado, setup: decimalToTime(setupInteirosDecimal + setupFracionadoDecimal), rodagem: decimalToTime(rodagemInteirosDecimal + rodagemFracionadoDecimal), total: decimalToTime(setupInteirosDecimal + setupFracionadoDecimal + rodagemInteirosDecimal + rodagemFracionadoDecimal) } };
  };

  const calcularImpressaoCapa = (maquina: any, capas: any[], tiragemOS: number) => {
    if (!maquina || !capas || capas.length === 0) return null;
    const velocidade = Number(maquina.produtividade_unit) || 1;
    const setupUnitario = timeToDecimal(maquina.setup || '00:00');
    const maqCores = Number(maquina.maq_cores) || 4;

    let totalGiros = 0;
    let totalSetups = 0;
    let linhas: any[] = [];

    capas.forEach(capa => {
      const tiragemCapa = Number(capa.tiragem || tiragemOS);
      const tiragemProduzida = calcularTiragemComQuebra(tiragemCapa, maquina);
      const tipo = String(capa.tipo_capa || '').toUpperCase();
      const cores = String(capa.cores || '').toUpperCase();

      const isDura = tipo.includes('DURA');
      const hasVerso = cores === '4X1' || cores === '4X4';

      if (isDura) {
        const folhasExterna = Math.ceil(tiragemProduzida / 2);
        totalGiros += folhasExterna; 
        totalSetups += 1;
        const setupExtDec = 1 * setupUnitario;
        const rodagemExtDec = folhasExterna / velocidade;
        linhas.push({ tipo: `Capa Dura Ext. (${capa.sku_capa})`, tiragem: tiragemCapa, cQuebra: tiragemProduzida, poses: 2, folhas: folhasExterna, giros: folhasExterna, setupTime: decimalToTime(setupExtDec), total: decimalToTime(setupExtDec + rodagemExtDec) });

        if (hasVerso) {
          const folhasGuarda = Math.ceil(tiragemProduzida / 4);
          totalGiros += folhasGuarda;
          totalSetups += 1;
          const setupGuaDec = 1 * setupUnitario;
          const rodagemGuaDec = folhasGuarda / velocidade;
          linhas.push({ tipo: `Guarda Interna (${capa.sku_capa})`, tiragem: tiragemCapa, cQuebra: tiragemProduzida, poses: 4, folhas: folhasGuarda, giros: folhasGuarda, setupTime: decimalToTime(setupGuaDec), total: decimalToTime(setupGuaDec + rodagemGuaDec) });
        }
      } else {
        const folhas = Math.ceil(tiragemProduzida / 4);
        const passadas = (hasVerso && maqCores <= 4) ? 2 : 1;
        const giros = folhas * passadas;
        totalGiros += giros;
        totalSetups += passadas;
        const setupSimpDec = passadas * setupUnitario;
        const rodagemSimpDec = giros / velocidade;
        linhas.push({ tipo: `Capa Simples (${capa.sku_capa})`, tiragem: tiragemCapa, cQuebra: tiragemProduzida, poses: 4, folhas: folhas, giros: giros, setupTime: decimalToTime(setupSimpDec), total: decimalToTime(setupSimpDec + rodagemSimpDec) });
      }
    });

    const setupTotalDec = totalSetups * setupUnitario;
    const rodagemDec = totalGiros / velocidade;
    const totalImpCapaDec = grafica === 'IMOS' ? Math.max(setupTotalDec + rodagemDec, 1.75) : setupTotalDec + rodagemDec;

    return { maquinaSetupStr: maquina.setup || '00:00', parametros: { velocidade, setups: totalSetups, giros: totalGiros }, linhas, totais: { setup: decimalToTime(setupTotalDec), rodagem: decimalToTime(rodagemDec), total: decimalToTime(totalImpCapaDec) } };
  };

  const calcularBeneficiamentoCapa = (maquina: any, capas: any[], tiragemOS: number, maqImpCapaOrigem: any) => {
    if (!maquina || !capas || capas.length === 0) return null;
    const velocidade = Number(maquina.produtividade_unit) || 1;
    const setupUnitario = timeToDecimal(maquina.setup || '00:00');

    let totalFolhas = 0;
    let totalSetups = 0;
    let linhas: any[] = [];

    capas.forEach(capa => {
      const benef = String(capa.beneficiamento || '').toUpperCase();
      if (benef.includes('LAMINAÇÃO') || benef.includes('VERNIZ')) {
        const tiragemCapa = Number(capa.tiragem || tiragemOS);
        const tiragemProduzida = calcularTiragemComQuebra(tiragemCapa, maqImpCapaOrigem);
        const tipo = String(capa.tipo_capa || '').toUpperCase();

        const poses = tipo.includes('DURA') ? 2 : 4;
        const folhas = grafica === 'IMOS' ? Math.ceil(tiragemProduzida / 2) : Math.ceil(tiragemProduzida / poses);

        totalFolhas += folhas;
        totalSetups += 1;
        const setupBenDec = 1 * setupUnitario;
        const rodagemBenDec = folhas / velocidade;
        linhas.push({ tipo: `${capa.beneficiamento} (${capa.sku_capa})`, tiragem: tiragemCapa, cQuebra: tiragemProduzida, folhas, setupTime: decimalToTime(setupBenDec), total: decimalToTime(setupBenDec + rodagemBenDec) });
      }
    });

    if (totalSetups === 0) return null;

    const setupTotalDec = totalSetups * setupUnitario;
    const rodagemDec = totalFolhas / velocidade;

    return { maquinaSetupStr: maquina.setup || '00:00', parametros: { velocidade, totalFolhas, setups: totalSetups }, linhas, totais: { setup: decimalToTime(setupTotalDec), rodagem: decimalToTime(rodagemDec), total: decimalToTime(setupTotalDec + rodagemDec) } };
  };

  const calcularEmpastamentoCapa = (maquina: any, capas: any[], tiragemOS: number, maqImpCapaOrigem: any) => {
    if (!maquina || !capas || capas.length === 0) return null;
    const velocidade = Number(maquina.produtividade_unit) || 1; 
    const setupUnitario = timeToDecimal(maquina.setup || '00:00');

    let totalCapas = 0;
    let totalSetups = 0;
    let linhas: any[] = [];

    capas.forEach(capa => {
      const tipo = String(capa.tipo_capa || '').toUpperCase();
      if (tipo.includes('DURA')) {
        const tiragemCapa = Number(capa.tiragem || tiragemOS);
        const tiragemProduzida = calcularTiragemComQuebra(tiragemCapa, maqImpCapaOrigem);
        const qtdCapasParaEmpastar = tiragemProduzida; 

        totalCapas += qtdCapasParaEmpastar;
        totalSetups += 1;
        const setupEmpDec = 1 * setupUnitario;
        const rodagemEmpDec = qtdCapasParaEmpastar / velocidade;
        
        linhas.push({ 
          tipo: `Empastar ${tipo} (${capa.sku_capa})`, 
          tiragem: tiragemCapa, 
          cQuebra: tiragemProduzida, 
          capasProcessadas: qtdCapasParaEmpastar, 
          setupTime: decimalToTime(setupEmpDec), 
          total: decimalToTime(setupEmpDec + rodagemEmpDec) 
        });
      }
    });

    if (totalSetups === 0) return null;

    const setupTotalDec = totalSetups * setupUnitario;
    const rodagemDec = totalCapas / velocidade;

    return { 
      maquinaSetupStr: maquina.setup || '00:00', 
      parametros: { velocidade, totalCapas, setups: totalSetups }, 
      linhas, 
      totais: { setup: decimalToTime(setupTotalDec), rodagem: decimalToTime(rodagemDec), total: decimalToTime(setupTotalDec + rodagemDec) } 
    };
  };

  const calcularCorteVinco = (maquina: any, analiseEncarte: any, analiseAdesivo: any, encarteItem: any) => {
    if (!maquina || (!analiseEncarte && !analiseAdesivo)) return null;
    const velocidade = Number(maquina.produtividade_unit) || 1;
    const setupUnitario = timeToDecimal(maquina.setup || '00:00');

    let totalFolhas = 0;
    let setups = 0;
    let linhas: any[] = [];

    if (analiseEncarte && String(encarteItem.corte_vinco_encarte || '').toLowerCase() === 'sim') {
      const folhas = Math.ceil(analiseEncarte.totais.giros / (analiseEncarte.parametros.passadas || 1));
      totalFolhas += folhas;
      setups += 1;
      const tDec = setupUnitario + (folhas / velocidade);
      linhas.push({ tipo: `Corte e Vinco (Encarte)`, folhas, setupTime: decimalToTime(setupUnitario), total: decimalToTime(tDec) });
    }
    if (analiseAdesivo && String(encarteItem.corte_vinco_adesivo || '').toLowerCase() === 'sim') {
      const folhas = Math.ceil(analiseAdesivo.totais.giros / (analiseAdesivo.parametros.passadas || 1));
      totalFolhas += folhas;
      setups += 1;
      const tDec = setupUnitario + (folhas / velocidade);
      linhas.push({ tipo: `Corte e Vinco (Adesivo)`, folhas, setupTime: decimalToTime(setupUnitario), total: decimalToTime(tDec) });
    }

    if (setups === 0) return null;

    const setupTotalDec = setups * setupUnitario;
    const rodagemDec = totalFolhas / velocidade;

    return { maquinaSetupStr: maquina.setup || '00:00', parametros: { velocidade, totalFolhas, setups }, linhas, totais: { setup: decimalToTime(setupTotalDec), rodagem: decimalToTime(rodagemDec), total: decimalToTime(setupTotalDec + rodagemDec) } };
  };

  const calcularDobra = (maquinaDobra: any, analiseImpressao: any, maquinaImpressaoSelecionada: any, paginasOS: number = 0) => {
    if (!maquinaDobra || !analiseImpressao || !maquinaImpressaoSelecionada) return null;
    const ehRotativa = String(maquinaImpressaoSelecionada.modelo || '').toUpperCase().includes('ROTATIVA') || String(maquinaImpressaoSelecionada.tecnologia || '').toUpperCase().includes('ROTATIVA');
    if (ehRotativa) return { isRotativa: true, totais: { entradas: 0, setup: '00:00', rodagem: '00:00', total: '00:00' } };

    const tiragemProduzida = analiseImpressao.parametros.tiragemProduzida;
    const totalCadernos = analiseImpressao.totais.qtd;
    const tiposCadernos = (analiseImpressao.parametros.cadernosInteiros > 0 ? 1 : 0) + (analiseImpressao.parametros.paginasRestantes > 0 ? 1 : 0);
    const isManualDobra = String(maquinaDobra.modelo || '').toUpperCase().includes('MANUAL');
    let totalEntradasFolhas = totalCadernos * tiragemProduzida;
    if (grafica === 'REPROSET' && isManualDobra) {
      totalEntradasFolhas = tiragemProduzida;
    } else if (grafica === 'MAXI' && isManualDobra) {
      totalEntradasFolhas = Math.ceil((paginasOS / 4) * tiragemProduzida);
    }
    const velocidade = Number(maquinaDobra.produtividade_unit) || 1;
    const setupTotalDecimal = timeToDecimal(maquinaDobra.setup || '00:00') * tiposCadernos;
    const rodagemDecimal = totalEntradasFolhas / velocidade;
    return { maquinaSetupStr: maquinaDobra.setup || '00:00', isRotativa: false, parametros: { velocidade, setupUnitario: maquinaDobra.setup, tiposCadernos, totalFolhas: totalEntradasFolhas }, totais: { entradas: totalEntradasFolhas, setup: decimalToTime(setupTotalDecimal), rodagem: decimalToTime(rodagemDecimal), total: decimalToTime(setupTotalDecimal + rodagemDecimal) } };
  };

  const calcularAlceamento = (maquinaAlceadeira: any, analiseImpressao: any, maquinaImpressao?: any) => {
    if (!maquinaAlceadeira || !analiseImpressao) return null;
    const _tipoImp = String(maquinaImpressao?.tipo || '').toUpperCase();
    const _modImp = String(maquinaImpressao?.modelo || '').toUpperCase();
    const ehDigitalRotativa = (_tipoImp.includes('DIGITAL') && _tipoImp.includes('ROTATIVA')) || (_modImp.includes('DIGITAL') && _modImp.includes('ROTATIVA')) || ((_tipoImp.includes('DIGITAL') || _modImp.includes('DIGITAL')) && (_tipoImp.includes('ROTATIVA') || _modImp.includes('ROTATIVA')));
    const totalCadernosImpressos = (ehDigitalRotativa && String(grafica || '').toUpperCase() !== 'LOGPRINT') ? 1 : analiseImpressao.totais.qtd;
    const tiragemProduzida = analiseImpressao.parametros.tiragemProduzida;

    let config: any = {};
    try {
        if (typeof maquinaAlceadeira.configuracoes === 'string') config = JSON.parse(maquinaAlceadeira.configuracoes);
        else if (maquinaAlceadeira.configuracoes) config = maquinaAlceadeira.configuracoes;
    } catch(e) {}
    
    const gavetas = Number(config.gavetas) || 1;
    const velocidade = Number(maquinaAlceadeira.produtividade_unit) || 1;
    const setupUnitarioDecimal = timeToDecimal(maquinaAlceadeira.setup || '00:00');
    const entradas = Math.ceil(totalCadernosImpressos / gavetas);
    const setupTotalDecimal = setupUnitarioDecimal * entradas;
    
    const rodagemDecimal = (tiragemProduzida * entradas) / velocidade;
    
    return { maquinaSetupStr: maquinaAlceadeira.setup || '00:00', parametros: { gavetas, entradas, totalCadernos: totalCadernosImpressos, velocidade, setupUnitario: maquinaAlceadeira.setup, livrosAlceados: tiragemProduzida }, totais: { setup: decimalToTime(setupTotalDecimal), rodagem: decimalToTime(rodagemDecimal), total: decimalToTime(setupTotalDecimal + rodagemDecimal) } };
  };

  const calcularGrampo = (maquinaGrampo: any, analiseImpressao: any, paginasOS: number = 0, maquinaImpressao?: any) => {
    if (!maquinaGrampo || !analiseImpressao) return null;
    const _tipoImpG = String(maquinaImpressao?.tipo || '').toUpperCase();
    const _modImpG = String(maquinaImpressao?.modelo || '').toUpperCase();
    const ehDigitalRotativaG = (_tipoImpG.includes('DIGITAL') && _tipoImpG.includes('ROTATIVA')) || (_modImpG.includes('DIGITAL') && _modImpG.includes('ROTATIVA')) || ((_tipoImpG.includes('DIGITAL') || _modImpG.includes('DIGITAL')) && (_tipoImpG.includes('ROTATIVA') || _modImpG.includes('ROTATIVA')));
    const totalCadernosImpressos = (ehDigitalRotativaG && String(grafica || '').toUpperCase() !== 'LOGPRINT') ? 1 : analiseImpressao.totais.qtd;
    const tiragemProduzida = analiseImpressao.parametros.tiragemProduzida;

    let config: any = {};
    try {
        if (typeof maquinaGrampo.configuracoes === 'string') config = JSON.parse(maquinaGrampo.configuracoes);
        else if (maquinaGrampo.configuracoes) config = maquinaGrampo.configuracoes;
    } catch(e) {}

    const gavetas = Number(config.gavetas) || 1;
    const velocidade = Number(maquinaGrampo.produtividade_unit) || 1;
    const setupUnitarioDecimal = timeToDecimal(maquinaGrampo.setup || '00:00');
    const entradas = Math.ceil(totalCadernosImpressos / gavetas);
    const setupTotalDecimal = setupUnitarioDecimal * entradas;

    const rodagemDecimal = (tiragemProduzida * entradas) / velocidade;
    const totalDecimal = setupTotalDecimal + rodagemDecimal;
    const totalFinalDecimal = grafica === 'IMOS' && paginasOS > 84 ? totalDecimal * 2 : totalDecimal;

    return { maquinaSetupStr: maquinaGrampo.setup || '00:00', parametros: { gavetas, entradas, totalCadernos: totalCadernosImpressos, velocidade, setupUnitario: maquinaGrampo.setup, livrosGrampeados: tiragemProduzida }, totais: { setup: decimalToTime(setupTotalDecimal), rodagem: decimalToTime(rodagemDecimal), total: decimalToTime(totalFinalDecimal) } };
  };

  const calcularEspiral = (maquinaFuracao: any, maquinaEspiral: any, analiseImpressao: any, paginasLivro: number, lombada_mm: any) => {
    if (!maquinaEspiral || !analiseImpressao) return null;
    const lombadaNum = Number(String(lombada_mm || '0').replace(',', '.'));
    const tiragemProduzida = analiseImpressao.parametros.tiragemProduzida;
    
    let tempoFuracaoDecimal = 0, exigeFuracaoManual = false, velFuracaoMapeada = 0, setupFuracaoMapeado = '00:00', totalPaginasFuras = 0;
    if (maquinaFuracao) {
      const tec = String(maquinaFuracao.tipo || '').toUpperCase() + " " + String(maquinaFuracao.modelo || '').toUpperCase();
      if (!tec.includes('AUTO') && !tec.includes('SEMI')) {
        exigeFuracaoManual = true;
        velFuracaoMapeada = Number(maquinaFuracao.produtividade_unit) || 1;
        setupFuracaoMapeado = maquinaFuracao.setup || '00:00';
        totalPaginasFuras = paginasLivro * tiragemProduzida;
        tempoFuracaoDecimal = timeToDecimal(setupFuracaoMapeado) + (totalPaginasFuras / velFuracaoMapeada);
      }
    }

    let velocidadeEspiral = Number(maquinaEspiral.produtividade_unit) || 1;
    let hitLimit = false; 
    let falhaJson = false;

    const tipoEsp = String(maquinaEspiral.tipo || '').toUpperCase();
    const modEsp = String(maquinaEspiral.modelo || '').toUpperCase();
    const isAutoOrSemi = tipoEsp.includes('AUTO') || tipoEsp.includes('SEMI') || modEsp.includes('AUTO') || modEsp.includes('SEMI');

    if (isAutoOrSemi) {
        let config: any = {};
        try {
            if (typeof maquinaEspiral.configuracoes === 'string') config = JSON.parse(maquinaEspiral.configuracoes);
            else if (maquinaEspiral.configuracoes) config = maquinaEspiral.configuracoes;
        } catch(e) {}
        
        const ciclos = Number(String(config.ciclos_min || config.ciclos || config.ciclo || 0).replace(/[^0-9.]/g, ''));
        const divisao = Number(String(config.divisao_mm || config.divisao || 0).replace(/[^0-9.]/g, ''));
        const limite = Number(String(config.velocidade_limite || config.limite_prod || config.limite || velocidadeEspiral).replace(/[^0-9.]/g, ''));

        if (lombadaNum > 0 && divisao > 0 && ciclos > 0) {
            const passos = Math.ceil(lombadaNum / divisao);
            const livrosPorMin = ciclos / passos;
            const calcHora = Math.floor(livrosPorMin * 60);

            if (calcHora > limite) {
                velocidadeEspiral = limite;
                hitLimit = true;
            } else {
                velocidadeEspiral = calcHora;
            }
        } else {
            falhaJson = true; 
        }
    }

    const rodagemEspiralDecimal = tiragemProduzida / velocidadeEspiral;
    const tempoEspiralDecimal = timeToDecimal(maquinaEspiral.setup || '00:00') + rodagemEspiralDecimal;

    return { 
      maquinaSetupStr: maquinaEspiral.setup || '00:00',
      parametros: { 
          exigeFuracaoManual, 
          velFuracao: velFuracaoMapeada, 
          setupFuracaoStr: setupFuracaoMapeado, 
          velEspiral: velocidadeEspiral, 
          limiteLombada: maquinaEspiral.limite_lombada, 
          totalPaginasFuras, 
          livrosEspiralados: tiragemProduzida,
          hitLimit: hitLimit,
          falhaJson: falhaJson
      }, 
      totais: { furacao: exigeFuracaoManual ? decimalToTime(tempoFuracaoDecimal) : 'Automática (00:00)', espiral: decimalToTime(tempoEspiralDecimal), total: decimalToTime(tempoFuracaoDecimal + tempoEspiralDecimal) } 
    };
  };

  const salvarOSNoBanco = async (dadosImpressao: any, dadosImpCapa: any, dadosBenCapa: any, dadosEmpastCapa: any, dadosImpEnc: any, dadosImpAde: any, dadosCorteV: any, dadosDobra: any, dadosAlceamento: any, dadosGrampo: any, dadosEspiral: any) => {
    try {
      const payload = {
        sku_miolo: osAtual.sku_miolo, 
        filtro_producao: osAtual.filtro_producao, 
        grafica: osAtual.grafica,                 
        dados_calculo: { 
          impressao: { maquina_id: idMaquinaImpressao, resultado: dadosImpressao }, 
          impressao_capa: dadosImpCapa ? { maquina_id: idMaquinaImpressaoCapa, resultado: dadosImpCapa } : undefined,
          beneficiamento_capa: dadosBenCapa ? { maquina_id: idMaquinaBeneficiamentoCapa, resultado: dadosBenCapa } : undefined,
          empastamento_capa: dadosEmpastCapa ? { maquina_id: idMaquinaEmpastamentoCapa, resultado: dadosEmpastCapa } : undefined,
          impressao_encarte: dadosImpEnc ? { maquina_id: idMaquinaImpressaoEncarte, resultado: dadosImpEnc } : undefined,
          impressao_adesivo: dadosImpAde ? { maquina_id: idMaquinaImpressaoAdesivo, resultado: dadosImpAde } : undefined,
          corte_vinco: dadosCorteV ? { maquina_id: idMaquinaCorteVinco, resultado: dadosCorteV } : undefined,
          dobra: { maquina_id: idMaquinaDobra, resultado: dadosDobra }, 
          alceamento: dadosAlceamento ? { maquina_id: idMaquinaAlceadeira, resultado: dadosAlceamento } : undefined, 
          grampo: dadosGrampo ? { maquina_id: idMaquinaGrampo, resultado: dadosGrampo } : undefined, 
          espiral: dadosEspiral ? { maquina_furacao_id: idMaquinaFuracao, maquina_espiral_id: idMaquinaEspiral, resultado: dadosEspiral } : undefined 
        }
      };

      const res = await fetch('/api/producao/miolo/salvar-calculo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setFeedback({ msg: "Operação gravada com sucesso!", tipo: "sucesso" });
        setTimeout(() => { setFeedback({ msg: '', tipo: '' }); carregarFiltrosIniciais(); }, 2500);
      }
    } catch (e) { console.error(e); }
  };

  const executarAutomacaoEmMassa = async (forcarTodos: boolean | React.MouseEvent = false) => {
    const isForced = forcarTodos === true;
    let skusAlvo = [];

    if (isForced) {
        skusAlvo = pendentesRaw.filter(s => (Number(s.tiragem) || 0) > 0);
    } else {
        if (skusAlvoRobo.length === 0) {
          alert("Nenhum SKU atende aos filtros selecionados.");
          return;
        }
        skusAlvo = skusAlvoRobo;
    }

    if (skusAlvo.length === 0) return;

    setModalRobo(true);
    setProgressoRobo({ atual: 0, total: skusAlvo.length, status: 'processando', tipo: 'Calculando' });
    cancelarRoboRef.current = false;
    let sucessoCount = 0;
    // Load-balancing counter: distributes assignments across equivalent machines
    const contadorMaquinas: Record<string, number> = {};
    const getMaquinaComMenorFila = (tipoBusca: string, subtipoBusca?: string) => {
      let candidatas = maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes(String(tipoBusca).toLowerCase()));
      if (subtipoBusca) {
        candidatas = maquinasCargadas.filter(m =>
          String(m.tipo || '').toLowerCase().includes(String(tipoBusca).toLowerCase()) ||
          String(m.tipo || '').toLowerCase().includes(String(subtipoBusca).toLowerCase())
        );
      }
      if (candidatas.length === 0) return null;
      candidatas.sort((a, b) => (contadorMaquinas[a.id] || 0) - (contadorMaquinas[b.id] || 0) || Number(b.produtividade_unit || 0) - Number(a.produtividade_unit || 0));
      const escolhida = candidatas[0];
      contadorMaquinas[escolhida.id] = (contadorMaquinas[escolhida.id] || 0) + 1;
      return escolhida;
    };

    for (let i = 0; i < skusAlvo.length; i++) {
      if (cancelarRoboRef.current) {
        setProgressoRobo(prev => ({ ...prev, status: 'cancelado' }));
        break;
      }
      
      const item = skusAlvo[i];
      const tiragem = Number(item.tiragem) || 0;
      const paginas = Number(item.paginacao) || 0;
      const totalFolhasMiolo = tiragem * Math.ceil(paginas / 2);
      
      let techMiolo = "ROTATIVA - OFFSET";
      if (totalFolhasMiolo <= 500) techMiolo = "PLANA - DIGITAL";
      else if (tiragem <= 2500) techMiolo = "ROTATIVA - DIGITAL";
      else if (tiragem <= 10450) techMiolo = "PLANA - OFFSET";

      let techCapa = tiragem < 1500 ? "PLANA - DIGITAL" : "PLANA - OFFSET";

      const mqImp = robo.impressao ? maquinasCargadas.find(m => String(m.id) === robo.impressao) : getMaquinaIdeal('Impressão', techMiolo);
      
      const resImp = calcularImpressao(mqImp, Number(item.paginacao), Number(item.tiragem));
      const totalCadernos = resImp ? resImp.totais.qtd : 1;

      const mqImpCapa = robo.impressaoCapa ? maquinasCargadas.find(m => String(m.id) === robo.impressaoCapa) : (getMaquinaDedicada('capa') || getMaquinaIdeal('Impressão', techCapa));
      const mqBenCapa = robo.benefCapa ? maquinasCargadas.find(m => String(m.id) === robo.benefCapa) : getMaquinaMaisRapida('Beneficiamento');
      const mqEmpCapa = robo.empastCapa ? maquinasCargadas.find(m => String(m.id) === robo.empastCapa) : getMaquinaMaisRapida('Empastamento', 'Capa Dura');
      let mqDob = robo.dobra ? maquinasCargadas.find(m => String(m.id) === robo.dobra) : getMaquinaMaisRapida('Dobra');
      const acab = String(item.acabamento || '').toUpperCase();

      // REPROSET: Digital Rotativa + Canoa/Grampo → force MANUAL dobradeira
      if (grafica.toUpperCase() === 'REPROSET' && techMiolo === 'ROTATIVA - DIGITAL' && (acab.includes('CANOA') || acab.includes('GRAMPO'))) {
        const mqManual = maquinasCargadas.find(m => String(m.tipo || '').toUpperCase().includes('DOBRA') && String(m.modelo || '').toUpperCase().includes('MANUAL'));
        if (mqManual) mqDob = mqManual;
      }
      let mqAlc = null;
      
      if (robo.alceadeira) {
          mqAlc = maquinasCargadas.find(m => String(m.id) === robo.alceadeira);
      } else {
          mqAlc = getMaquinaAlceamentoIdeal(acab, totalCadernos);
      }

      const mqGra = robo.grampo ? maquinasCargadas.find(m => String(m.id) === robo.grampo) : getMaquinaComMenorFila('Grampo', 'Canoa');
      const mqFur = robo.furacao ? maquinasCargadas.find(m => String(m.id) === robo.furacao) : getMaquinaMaisRapida('Furação', 'Espiral');
      
      const lombadaNum = Number(String(item.lombada || '0').replace(',', '.'));
      const mqEspFinal = robo.espiral
          ? maquinasCargadas.find(m => String(m.id) === robo.espiral)
          : getMaquinaEspiralAdequada(lombadaNum, mqImp);

      const encarteItem = encartesDoLote.find(e => String(e.sku_miolo) === String(item.sku_miolo));
      const tiragemEnc = encarteItem ? Number(encarteItem.tiragem || item.tiragem) : tiragem;
      
      let techEncReal = tiragemEnc <= 1450 ? "PLANA - DIGITAL" : "PLANA - OFFSET";

      const mqImpEnc = robo.impressaoEncarte ? maquinasCargadas.find(m => String(m.id) === robo.impressaoEncarte) : (getMaquinaDedicada('encarte') || getMaquinaIdeal('Impressão', techEncReal));
      const mqImpAde = robo.impressaoAdesivo ? maquinasCargadas.find(m => String(m.id) === robo.impressaoAdesivo) : getMaquinaIdeal('Impressão', techEncReal);
      const mqCorte = robo.corteVinco ? maquinasCargadas.find(m => String(m.id) === robo.corteVinco) : getMaquinaMaisRapida('Corte');

      const capasDoItem = capasDoLote.filter(c => String(c.sku_ref) === String(item.sku_miolo));
      const resImpCapa = calcularImpressaoCapa(mqImpCapa, capasDoItem, Number(item.tiragem));
      
      const resBenCapa = calcularBeneficiamentoCapa(mqBenCapa, capasDoItem, Number(item.tiragem), mqImpCapa);
      const resEmpCapa = calcularEmpastamentoCapa(mqEmpCapa, capasDoItem, Number(item.tiragem), mqImpCapa); 
      
      const exigeEnc = encarteItem && Number(encarteItem.paginacao_encarte) > 0;
      const resImpEnc = exigeEnc ? calcularImpressao(mqImpEnc, Number(encarteItem.paginacao_encarte), Number(encarteItem.tiragem || item.tiragem)) : null;
      
      const exigeAde = encarteItem && Number(encarteItem.paginacao_adesivo) > 0;
      const resImpAde = exigeAde ? calcularImpressao(mqImpAde, Number(encarteItem.paginacao_adesivo), Number(encarteItem.tiragem || item.tiragem)) : null;

      const exigeCort = encarteItem && (String(encarteItem.corte_vinco_encarte || '').toLowerCase() === 'sim' || String(encarteItem.corte_vinco_adesivo || '').toLowerCase() === 'sim');
      const resCort = exigeCort ? calcularCorteVinco(mqCorte, resImpEnc, resImpAde, encarteItem) : null;

      const resDob = calcularDobra(mqDob, resImp, mqImp, paginas);
      const resAlc = (acab.includes('LOMBADA') || acab.includes('PUR') || acab.includes('ESPIRAL') || acab.includes('WIRE-O')) ? calcularAlceamento(mqAlc, resImp, mqImp) : null;
      const resGra = (acab.includes('CANOA') || acab.includes('GRAMPO')) ? calcularGrampo(mqGra, resImp, paginas, mqImp) : null;
      const resEsp = (acab.includes('ESPIRAL') || acab.includes('WIRE-O')) ? calcularEspiral(mqFur, mqEspFinal, resImp, Number(item.paginacao), item.lombada) : null;

      const payload = {
        sku_miolo: item.sku_miolo, 
        filtro_producao: item.filtro_producao, 
        grafica: item.grafica,
        dados_calculo: {
          impressao: mqImp ? { maquina_id: mqImp.id, resultado: resImp } : null,
          impressao_capa: (resImpCapa && mqImpCapa) ? { maquina_id: mqImpCapa.id, resultado: resImpCapa } : undefined,
          beneficiamento_capa: (resBenCapa && mqBenCapa) ? { maquina_id: mqBenCapa.id, resultado: resBenCapa } : undefined,
          empastamento_capa: (resEmpCapa && mqEmpCapa) ? { maquina_id: mqEmpCapa.id, resultado: resEmpCapa } : undefined,
          impressao_encarte: (resImpEnc && mqImpEnc) ? { maquina_id: mqImpEnc.id, resultado: resImpEnc } : undefined,
          impressao_adesivo: (resImpAde && mqImpAde) ? { maquina_id: mqImpAde.id, resultado: resImpAde } : undefined,
          corte_vinco: (resCort && mqCorte) ? { maquina_id: mqCorte.id, resultado: resCort } : undefined,
          dobra: mqDob ? { maquina_id: mqDob.id, resultado: resDob } : null,
          alceamento: resAlc && mqAlc ? { maquina_id: mqAlc.id, resultado: resAlc } : undefined,
          cola: (resAlc && mqAlc && (String(mqAlc.tipo || '').toUpperCase().includes('COLA') || String(mqAlc.tipo || '').toUpperCase().includes('PUR'))) ? { maquina_id: mqAlc.id, resultado: resAlc } : undefined,
          grampo: resGra && mqGra ? { maquina_id: mqGra.id, resultado: resGra } : undefined,
          espiral: resEsp && mqEspFinal ? { maquina_furacao_id: mqFur?.id, maquina_espiral_id: mqEspFinal.id, resultado: resEsp } : undefined
        }
      };

      try {
        await fetch('/api/producao/miolo/salvar-calculo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        sucessoCount++;
        setProgressoRobo({ atual: i + 1, total: skusAlvo.length, status: 'processando', tipo: 'Calculando' });
      } catch (err) { console.error(err); }
    }
    if (!cancelarRoboRef.current) { setProgressoRobo(prev => ({ ...prev, status: 'concluido', atual: sucessoCount })); }
  };

  const limparCalculosDaFila = async () => {
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
        await fetch('/api/producao/miolo/salvar-calculo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku_miolo: item.sku_miolo, filtro_producao: item.filtro_producao, grafica: item.grafica, dados_calculo: null })
        });
        limpos++;
        setProgressoRobo({ atual: i + 1, total: alvosLimpeza.length, status: 'processando', tipo: 'Apagando' });
      } catch(e) {}
    }
    if (!cancelarRoboRef.current) { setProgressoRobo(prev => ({ ...prev, status: 'concluido', atual: limpos })); }
  };

  const fecharModalRobo = () => {
    setModalRobo(false);
    if(etapa === 1) {
      setLotesSelecionados([]);
      setSkus([]);
      carregarFiltrosIniciais();
    } else {
      carregarItensDoLote(filtroProducao, grafica);
      carregarFiltrosIniciais();
    }
  };

  const lotesFiltrados = lotesDisponiveis.filter(l => 
    !filtroGraficaGlobal || String(l.grafica).toUpperCase() === filtroGraficaGlobal.toUpperCase()
  );

  return (
    <div className="w-full text-left font-sans relative">
      
      {/* OVERLAYS E MÁSCARAS DE CLIQUE */}
      {(tooltipAtivo || dropdownRobo || dropdownLimpar) && (
        <div className="fixed inset-0 z-[8000] bg-transparent" onClick={() => { setTooltipAtivo(null); setDropdownRobo(null); setDropdownLimpar(null); }} />
      )}

      {/* OVERLAY SUCESSO MANUAL */}
      {feedback.msg && !modalRobo && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white border-b-4 border-emerald-600 rounded-lg shadow-2xl p-8 flex flex-col items-center max-w-sm">
            <i className="fas fa-check-circle text-[60px] text-emerald-500 mb-4 drop-shadow-md"></i>
            <h3 className="text-lg font-black text-slate-800 uppercase text-center tracking-wide">{feedback.msg}</h3>
          </div>
        </div>
      )}

      {/* 🤖 MODAL DO ROBÔ COM PROGRESSO E BOTÃO DE CANCELAR/CONFIRMAR */}
      {modalRobo && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[400px] overflow-hidden flex flex-col items-center p-8 text-center">
            {progressoRobo.status === 'processando' && <i className={`fas ${progressoRobo.tipo === 'Apagando' ? 'fa-eraser text-red-500' : 'fa-robot text-indigo-500'} text-[60px] mb-4 animate-bounce`}></i>}
            {progressoRobo.status === 'concluido' && <i className="fas fa-check-circle text-[60px] text-emerald-500 mb-4 drop-shadow-md"></i>}
            {progressoRobo.status === 'cancelado' && <i className="fas fa-stop-circle text-[60px] text-amber-500 mb-4 drop-shadow-md"></i>}
            
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-wide mb-2">
              {progressoRobo.status === 'processando' && `Robô ${progressoRobo.tipo}...`}
              {progressoRobo.status === 'concluido' && `${progressoRobo.tipo} Concluído!`}
              {progressoRobo.status === 'cancelado' && 'Operação Interrompida'}
            </h3>
            
            <div className="w-full bg-slate-100 rounded-full h-4 mb-2 overflow-hidden border border-slate-200">
              <div 
                className={`h-4 transition-all duration-300 ${progressoRobo.status === 'processando' && progressoRobo.tipo === 'Apagando' ? 'bg-red-500' : progressoRobo.status === 'processando' ? 'bg-indigo-500' : progressoRobo.status === 'concluido' ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                style={{ width: `${Math.max(5, (progressoRobo.atual / progressoRobo.total) * 100)}%` }}
              ></div>
            </div>
            
            <p className="text-sm font-bold text-slate-600 font-mono mb-6">
              {progressoRobo.atual} de {progressoRobo.total} itens processados.
            </p>

            {progressoRobo.status === 'processando' ? (
              <button onClick={() => { cancelarRoboRef.current = true; }} className="border-2 border-red-500 text-red-500 hover:bg-red-50 font-bold px-6 py-2 rounded-full uppercase text-xs tracking-wide transition-colors">
                Interromper Robô
              </button>
            ) : (
              <button onClick={fecharModalRobo} className="bg-slate-800 text-white hover:bg-slate-700 font-bold px-8 py-3 rounded-full uppercase text-sm tracking-wide transition-colors">
                Confirmar e Fechar
              </button>
            )}
          </div>
        </div>
      )}

      {/* 🧹 MODAL DA BORRACHA (CONFIGURAR LIMPEZA) */}
      {modalConfigLimpar && (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[500px] overflow-hidden flex flex-col">
            <div className="bg-red-600 text-white p-4 flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2"><i className="fas fa-eraser"></i> Borracha de Engenharia</h3>
              <button onClick={() => setModalConfigLimpar(false)} className="text-red-200 hover:text-white"><i className="fas fa-times"></i></button>
            </div>
            <div className="p-6">
              <p className="text-xs text-slate-600 mb-4 font-medium">Use os filtros para apagar os cálculos de itens específicos que já foram concluídos. Se não preencher nada, o robô apagará TODOS os itens carregados.</p>
              
              <div className="space-y-4 mb-6 relative">
                <div className="relative z-[9600]">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Filtrar por Acabamento</label>
                  <button onClick={(e) => { e.stopPropagation(); setDropdownLimpar(dropdownLimpar === 'acabamento' ? null : 'acabamento'); }} className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs font-bold text-slate-700 text-left flex justify-between items-center shadow-sm">
                    <span>{limparFiltros.acabamento.length === 0 ? '-- Todos os Acabamentos --' : `${limparFiltros.acabamento.length} Selecionado(s)`}</span>
                    <i className={`fas fa-chevron-${dropdownLimpar === 'acabamento' ? 'up' : 'down'} opacity-50`}></i>
                  </button>
                  {dropdownLimpar === 'acabamento' && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 shadow-xl rounded-md py-2 max-h-48 overflow-y-auto z-[9600]">
                      {Array.from(new Set(skus.filter(s => s.dados_calculo != null).map(s => String(s.acabamento || '').toUpperCase()))).filter(Boolean).map(acab => (
                        <label key={acab} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs">
                          <input type="checkbox" checked={limparFiltros.acabamento.includes(acab)} onChange={() => toggleLimparFiltro(acab)} className="w-3.5 h-3.5 rounded text-red-600 focus:ring-red-500" />
                          <span className="font-bold text-slate-700">{acab}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">SKU Específico (Opcional)</label>
                  <input type="text" placeholder="Digite para apagar um item exato..." value={limparFiltros.sku} onChange={(e) => setLimparFiltros({...limparFiltros, sku: e.target.value})} className="w-full border border-slate-300 rounded p-2 text-xs font-mono font-bold text-slate-700 bg-slate-50 focus:bg-white" />
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 p-3 rounded text-center mb-6">
                <span className="block text-[10px] font-bold text-red-700 uppercase">Itens na mira para exclusão:</span>
                <span className="block text-xl font-black text-red-900">
                  {alvosLimpeza.length} SKUs
                </span>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setModalConfigLimpar(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded transition-colors">Cancelar</button>
                <button 
                  onClick={limparCalculosDaFila} 
                  disabled={alvosLimpeza.length === 0}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white font-bold px-6 py-2 rounded shadow flex items-center gap-2 text-xs uppercase tracking-wide transition-colors"
                >
                  <i className="fas fa-trash-alt"></i> Confirmar Exclusão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {skusSelecionadosStatus.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700 animate-in slide-in-from-bottom-4">
          <i className="fas fa-tags text-violet-400"></i>
          <span className="text-sm font-bold">{skusSelecionadosStatus.length} SKU{skusSelecionadosStatus.length > 1 ? 's' : ''} selecionado{skusSelecionadosStatus.length > 1 ? 's' : ''}</span>
          <select value={bulkStatusValue} onChange={e => setBulkStatusValue(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm font-bold outline-none text-white">
            <option value="">-- Novo Status --</option>
            <option value="Em Análise">Em Análise</option>
            <option value="Aprovada">Aprovada</option>
            <option value="Em Produção">Em Produção</option>
            <option value="Produzida">Produzida</option>
            <option value="Cancelada">Cancelada</option>
          </select>
          <button onClick={applyBulkStatus} disabled={!bulkStatusValue || isApplyingStatus}
            className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold px-5 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2">
            {isApplyingStatus ? <><i className="fas fa-spinner fa-spin"></i> Aplicando...</> : <><i className="fas fa-check"></i> Atualizar Status</>}
          </button>
          <button onClick={() => { setSkusSelecionadosStatus([]); setBulkStatusValue(''); }}
            className="text-slate-400 hover:text-white text-sm font-bold">&times;</button>
        </div>
      )}

      {/* ETAPA 1: TELA INICIAL DE LOTES TOTALMENTE ANALÍTICA */}
      {etapa === 1 && (() => {
        const globalSkus = lotesFiltrados.reduce((acc, l) => acc + (l.total_skus || 0), 0);
        const globalCalculados = lotesFiltrados.reduce((acc, l) => acc + (l.skus_calculados || 0), 0);
        const globalTiragem = lotesFiltrados.reduce((acc, l) => acc + (l.tiragem_total || 0), 0);
        const globalTempoDecimal = lotesFiltrados.reduce((acc, l) => acc + (l.tempo_total_decimal || 0), 0);

        const todosSelecionados = lotesFiltrados.length > 0 && lotesSelecionados.length === lotesFiltrados.length;
        const toggleTodosLotes = () => {
          if (todosSelecionados) setLotesSelecionados([]);
          else setLotesSelecionados(lotesFiltrados.map(l => ({ filtro_producao: l.filtro_producao, grafica: l.grafica })));
        };

        return (
          <>
            <header className="mb-6 border-b border-slate-300 pb-3 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Painel Unificado de Lotes Industriais</h1>
                <p className="text-sm text-slate-500 mt-1">Torre de controle operacional e status global de balanceamento de tempos.</p>
              </div>
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

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white border border-slate-200 p-4 rounded-md shadow-sm border-l-4 border-l-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Total de SKUs na Fábrica</span>
                <span className="text-lg font-black text-slate-800 block">{globalSkus} Itens Cadastrados</span>
                <span className="text-xs text-amber-600 font-bold">{globalSkus - globalCalculados} Aguardando Engenharia</span>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-md shadow-sm border-l-4 border-l-blue-600">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">SKUs Concluídos</span>
                <span className="text-lg font-black text-emerald-700 block">{globalCalculados} Resolvidos</span>
                <span className="text-xs text-slate-500">Progresso Geral: {globalSkus > 0 ? Math.round((globalCalculados / globalSkus) * 100) : 0}%</span>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-md shadow-sm border-l-4 border-l-purple-600">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Tiragem Total (Volume)</span>
                <span className="text-lg font-black font-mono text-purple-900 block">{globalTiragem.toLocaleString('pt-BR')} exemplares</span>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-md shadow-sm border-l-4 border-l-emerald-600">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Carga Total Homem-Hora</span>
                <span className="text-lg font-black font-mono text-emerald-800 block">{decimalToTime(globalTempoDecimal)}</span>
              </div>
            </div>

            {/* BARRA DE AÇÃO EM MASSA */}
            {lotesSelecionados.length > 0 && (
              <div className="bg-indigo-900 border-x border-t border-indigo-900 p-4 rounded-t-lg flex justify-between items-center shadow-lg animate-in slide-in-from-bottom-4 relative z-10 mb-[-1px]">
                <span className="font-black text-indigo-100 uppercase text-sm tracking-wide">
                  <i className="fas fa-layer-group mr-2 text-indigo-400"></i> {lotesSelecionados.length} Lotes Selecionados para Ação Múltipla
                </span>
                <div className="flex gap-3 items-center">
                  <select value={loteStatusValue} onChange={e => setLoteStatusValue(e.target.value)}
                    className="bg-indigo-800 border border-indigo-600 rounded px-3 py-2 text-sm font-bold outline-none text-indigo-100 cursor-pointer">
                    <option value="">-- Status do Lote --</option>
                    <option value="Em Análise">Em Análise</option>
                    <option value="Aprovada">Aprovada</option>
                    <option value="Em Produção">Em Produção</option>
                    <option value="Produzida">Produzida</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                  <button
                    onClick={applyLoteBulkStatus}
                    disabled={!loteStatusValue || isApplyingLoteStatus}
                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold px-4 py-2 rounded text-xs transition-colors flex items-center gap-2 uppercase tracking-wide">
                    {isApplyingLoteStatus ? <><i className="fas fa-spinner fa-spin"></i> Aplicando...</> : <><i className="fas fa-tags"></i> Atualizar Status</>}
                  </button>
                  <button
                    onClick={() => processarLotesPorFora('apagar')}
                    disabled={carregandoLotes}
                    className="bg-transparent border border-indigo-400 text-indigo-100 hover:bg-red-600 hover:border-red-600 hover:text-white font-bold px-4 py-2 rounded text-xs transition-colors flex items-center gap-2 disabled:opacity-50">
                    <i className="fas fa-eraser"></i> Apagar Cálculos
                  </button>
                  <button
                    onClick={() => processarLotesPorFora('calcular')}
                    disabled={carregandoLotes}
                    className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black px-6 py-2 rounded shadow text-xs transition-colors flex items-center gap-2 uppercase tracking-wide disabled:opacity-50">
                    {carregandoLotes ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magic"></i>} 
                    Calcular em Massa
                  </button>
                </div>
              </div>
            )}

            <div className={`bg-white border border-slate-200 shadow-sm overflow-hidden w-full ${lotesSelecionados.length > 0 ? 'rounded-b-md' : 'rounded-md'}`}>
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="p-3 pl-4 w-10 text-center">
                      <input type="checkbox" checked={todosSelecionados} onChange={toggleTodosLotes} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer" />
                    </th>
                    <th className="p-3">Lote de Controle</th>
                    <th className="p-3 w-40">Gráfica</th>
                    <th className="p-3 text-center border-l border-slate-200 w-24">Total SKUs</th>
                    <th className="p-3 text-center w-24 text-emerald-700 bg-emerald-50/20">Calculados</th>
                    <th className="p-3 text-center w-24 text-amber-700 bg-amber-50/20">Pendentes</th>
                    <th className="p-3 text-right w-36">Tiragem Acumulada</th>
                    <th className="p-3 text-center w-40 text-blue-800 bg-blue-50/50">Tempo Acumulado</th>
                    <th className="p-3 text-right pr-4 w-28">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {lotesFiltrados.map((l, i) => {
                    const pendentes = (l.total_skus || 0) - (l.skus_calculados || 0);
                    const isSelected = lotesSelecionados.some(sel => sel.filtro_producao === l.filtro_producao && sel.grafica === l.grafica);
                    const loteKey = `${l.filtro_producao}|${l.grafica}`;
                    const isExpanded = expandedLotes.has(loteKey);
                    const loteSkus = skusByLote.get(loteKey) || [];
                    const isLoadingExpand = loadingExpandLotes.has(loteKey);
                    return (
                      <Fragment key={i}>
                        <tr className={`transition-colors ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-blue-50/40'}`}>
                          <td className="p-3 pl-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if(isSelected) setLotesSelecionados(prev => prev.filter(sel => sel.filtro_producao !== l.filtro_producao));
                                else setLotesSelecionados(prev => [...prev, { filtro_producao: l.filtro_producao, grafica: l.grafica }]);
                              }}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleExpandLote(l.filtro_producao, l.grafica); }}
                                className="w-5 h-5 rounded border border-slate-300 flex items-center justify-center text-slate-500 hover:bg-slate-100 flex-shrink-0 transition-colors"
                                title="Expandir SKUs"
                              >
                                {isLoadingExpand ? (
                                  <i className="fas fa-spinner fa-spin text-[9px]"></i>
                                ) : isExpanded ? (
                                  <span className="text-[10px] font-black text-violet-600">▼</span>
                                ) : (
                                  <span className="text-[10px] text-slate-400">▶</span>
                                )}
                              </button>
                              <span className="cursor-pointer hover:text-blue-700" onClick={() => carregarItensDoLote(l.filtro_producao, l.grafica)}>
                                {l.filtro_producao}
                              </span>
                            </div>
                          </td>
                          <td className="p-3 text-slate-600 uppercase text-xs font-bold cursor-pointer" onClick={() => carregarItensDoLote(l.filtro_producao, l.grafica)}>{l.grafica}</td>
                          <td className="p-3 text-center border-l border-slate-200 font-mono text-slate-700 cursor-pointer" onClick={() => carregarItensDoLote(l.filtro_producao, l.grafica)}>{l.total_skus}</td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/10 cursor-pointer" onClick={() => carregarItensDoLote(l.filtro_producao, l.grafica)}>{l.skus_calculados}</td>
                          <td className={`p-3 text-center font-mono font-bold bg-amber-50/10 cursor-pointer ${pendentes > 0 ? 'text-amber-600' : 'text-slate-400'}`} onClick={() => carregarItensDoLote(l.filtro_producao, l.grafica)}>{pendentes}</td>
                          <td className="p-3 text-right font-mono text-slate-600 cursor-pointer" onClick={() => carregarItensDoLote(l.filtro_producao, l.grafica)}>{Number(l.tiragem_total).toLocaleString('pt-BR')}</td>
                          <td className="p-3 text-center font-mono font-black text-blue-900 bg-blue-50/20 cursor-pointer" onClick={() => carregarItensDoLote(l.filtro_producao, l.grafica)}>{decimalToTime(l.tempo_total_decimal)}</td>
                          <td className="p-3 text-right pr-4">
                            <button onClick={() => carregarItensDoLote(l.filtro_producao, l.grafica)} className="bg-blue-600 text-white px-4 py-1.5 rounded text-xs font-bold hover:bg-blue-700 shadow-sm transition-colors">
                              Abrir Fila
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="p-0 bg-slate-50 border-b border-slate-200">
                              {isLoadingExpand ? (
                                <div className="p-4 text-center text-xs text-slate-400 animate-pulse">Carregando SKUs...</div>
                              ) : loteSkus.length === 0 ? (
                                <div className="p-4 text-center text-xs text-slate-400">Nenhum SKU encontrado no Gantt para este lote.</div>
                              ) : (
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead className="bg-slate-200 text-[10px] font-bold uppercase text-slate-600">
                                    <tr>
                                      <th className="p-2 pl-14 w-10">
                                        <input type="checkbox"
                                          checked={loteSkus.every(r => skusSelecionadosStatus.some(s => s.sku_alvo === r.sku_alvo && s.filtro_producao === r.lote))}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setSkusSelecionadosStatus(prev => {
                                                const toAdd = loteSkus.filter(r => !prev.some(s => s.sku_alvo === r.sku_alvo && s.filtro_producao === r.lote));
                                                return [...prev, ...toAdd.map(r => ({ sku_alvo: r.sku_alvo, filtro_producao: r.lote, grafica: r.grafica }))];
                                              });
                                            } else {
                                              setSkusSelecionadosStatus(prev => prev.filter(s => s.filtro_producao !== l.filtro_producao));
                                            }
                                          }}
                                          className="w-3.5 h-3.5 accent-violet-600 cursor-pointer rounded"
                                        />
                                      </th>
                                      <th className="p-2">SKU</th>
                                      <th className="p-2 text-center">Tiragem</th>
                                      <th className="p-2 text-center">Paginação</th>
                                      <th className="p-2">Acabamento</th>
                                      <th className="p-2">Descrição</th>
                                      <th className="p-2 text-center">Status MES</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                    {loteSkus.map((sku: any, si: number) => {
                                      const isSkuSelected = skusSelecionadosStatus.some(s => s.sku_alvo === sku.sku_alvo && s.filtro_producao === sku.lote);
                                      const statusStyle = !sku.status_producao ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                        sku.status_producao === 'Em Análise' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                                        sku.status_producao === 'Aprovada' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                                        sku.status_producao === 'Em Produção' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                                        sku.status_producao === 'Produzida' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                        sku.status_producao === 'Cancelada' ? 'bg-red-100 text-red-800 border-red-300' :
                                        'bg-slate-100 text-slate-500 border-slate-200';
                                      return (
                                        <tr key={si} className={`transition-colors ${isSkuSelected ? 'bg-violet-50' : 'hover:bg-white'}`}>
                                          <td className="p-2 pl-14">
                                            <input type="checkbox" checked={isSkuSelected}
                                              onChange={() => toggleSkuStatus(sku.sku_alvo, sku.lote, sku.grafica)}
                                              className="w-3.5 h-3.5 accent-violet-600 cursor-pointer rounded"
                                            />
                                          </td>
                                          <td className="p-2 font-mono font-bold text-slate-800">{sku.sku_alvo}</td>
                                          <td className="p-2 text-center font-mono text-slate-600">{sku.tiragem ? Number(sku.tiragem).toLocaleString('pt-BR') : '-'}</td>
                                          <td className="p-2 text-center font-mono text-slate-600">{sku.paginacao || '-'}</td>
                                          <td className="p-2 text-slate-600 max-w-[140px] truncate" title={sku.acabamento || ''}>{sku.acabamento || '-'}</td>
                                          <td className="p-2 text-slate-500 max-w-[180px] truncate text-[11px]" title={sku.descricao || ''}>{sku.descricao || '-'}</td>
                                          <td className="p-2 text-center">
                                            <select value={sku.status_producao || ''} onChange={async (e) => {
                                              const newStatus = e.target.value;
                                              setSkusByLote(prev => {
                                                const newMap = new Map(prev);
                                                const rows = newMap.get(loteKey) || [];
                                                newMap.set(loteKey, rows.map(r => r.sku_alvo === sku.sku_alvo ? { ...r, status_producao: newStatus } : r));
                                                return newMap;
                                              });
                                              await fetch('/api/producao/painel', {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ grafica: sku.grafica, updates: [{ sku_alvo: sku.sku_alvo, filtro_producao: sku.lote, status_producao: newStatus }] })
                                              });
                                            }}
                                              className={`text-[10px] font-bold border rounded px-2 py-0.5 outline-none cursor-pointer ${statusStyle}`}
                                            >
                                              <option value="">-- Status --</option>
                                              <option value="Em Análise">Em Análise</option>
                                              <option value="Aprovada">Aprovada</option>
                                              <option value="Em Produção">Em Produção</option>
                                              <option value="Produzida">Produzida</option>
                                              <option value="Cancelada">Cancelada</option>
                                            </select>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}

      {/* ETAPA 2: FILA DO LOTE */}
      {etapa === 2 && (() => {
        const totalSkusLote = skus.length;
        const skusConcluidosLote = skus.filter(s => s.dados_calculo != null).length;
        const skusRestantesLote = totalSkusLote - skusConcluidosLote;
        const tiragemLote = skus.reduce((acc, s) => acc + Number(s.tiragem || 0), 0);

        const tempoDecimalTotal = skus.reduce((acc, s) => {
          if (!s.dados_calculo) return acc;
          let src = s.dados_calculo;
          let somaDec = 0;
          if (src.impressao?.resultado) somaDec += timeToDecimal(src.impressao.resultado.totais.total);
          if (src.impressao_capa?.resultado) somaDec += timeToDecimal(src.impressao_capa.resultado.totais.total);
          if (src.impressao_encarte?.resultado) somaDec += timeToDecimal(src.impressao_encarte.resultado.totais.total);
          if (src.impressao_adesivo?.resultado) somaDec += timeToDecimal(src.impressao_adesivo.resultado.totais.total);
          if (src.corte_vinco?.resultado) somaDec += timeToDecimal(src.corte_vinco.resultado.totais.total);
          if (src.beneficiamento_capa?.resultado) somaDec += timeToDecimal(src.beneficiamento_capa.resultado.totais.total);
          if (src.empastamento_capa?.resultado) somaDec += timeToDecimal(src.empastamento_capa.resultado.totais.total);
          if (src.dobra?.resultado) somaDec += timeToDecimal(src.dobra.resultado.totais.total);
          if (src.alceamento?.resultado) somaDec += timeToDecimal(src.alceamento.resultado.totais.total);
          if (src.grampo?.resultado) somaDec += timeToDecimal(src.grampo.resultado.totais.total);
          if (src.espiral?.resultado) somaDec += timeToDecimal(src.espiral.resultado.totais.total);
          return acc + somaDec;
        }, 0);

        const exportarTemposCSV = () => {
          const rows: string[] = ['Gráfica;Lote;SKU;Etapa;Tempo Setup;Tempo Rodagem;Tempo Total'];
          const secoes: Array<[string, string]> = [
            ['impressao', 'Impressão Miolo'], ['impressao_capa', 'Impressão Capa'],
            ['impressao_encarte', 'Impressão Encarte'], ['impressao_adesivo', 'Impressão Adesivo'],
            ['corte_vinco', 'Corte e Vinco'], ['beneficiamento_capa', 'Beneficiamento Capa'],
            ['empastamento_capa', 'Empastamento Capa'], ['dobra', 'Dobra'],
            ['alceamento', 'Alceamento'], ['grampo', 'Grampo'], ['espiral', 'Espiral'],
          ];
          skus.forEach((s: any) => {
            if (!s.dados_calculo) return;
            const dc = s.dados_calculo;
            secoes.forEach(([key, label]) => {
              const r = dc[key]?.resultado;
              if (!r?.totais) return;
              rows.push(`${grafica};${filtroProducao};${s.sku_miolo};${label};${r.totais.setup || '00:00'};${r.totais.rodagem || '00:00'};${r.totais.total || '00:00'}`);
            });
          });
          if (rows.length <= 1) return alert('Nenhum dado calculado para exportar.');
          const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url;
          a.download = `Tempos_${grafica}_${filtroProducao}.csv`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        };

        const exportarCSVConsolidado = () => {
          const etapasOrdem: Array<[string, string]> = [
            ['impressao', 'T.Impressão'], ['impressao_capa', 'T.Capa'], ['impressao_encarte', 'T.Encarte'],
            ['dobra', 'T.Dobra'], ['alceamento', 'T.Alceamento'], ['grampo', 'T.Grampo'], ['espiral', 'T.Espiral'],
          ];
          const header = `Gráfica;Lote;SKU;${etapasOrdem.map(([,l]) => l).join(';')};T.Total`;
          const rows: string[] = [header];
          skus.forEach((s: any) => {
            if (!s.dados_calculo) return;
            const dc = s.dados_calculo;
            let totalDec = 0;
            const tempos = etapasOrdem.map(([key]) => {
              const t = dc[key]?.resultado?.totais?.total || '00:00';
              totalDec += timeToDecimal(t);
              return t;
            });
            rows.push(`${grafica};${filtroProducao};${s.sku_miolo};${tempos.join(';')};${decimalToTime(totalDec)}`);
          });
          if (rows.length <= 1) return alert('Nenhum dado calculado para exportar.');
          const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url;
          a.download = `Consolidado_${grafica}_${filtroProducao}.csv`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        };

        return (
          <>
            <header className="mb-4 border-b border-slate-300 pb-3 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Fila de Produção</h1>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-sm text-slate-500 font-mono">Ref: {filtroProducao} / {grafica}</p>
                  <select
                    value={statusProducao}
                    onChange={async (e) => {
                      const novoStatus = e.target.value;
                      setStatusProducao(novoStatus);
                      await fetch('/api/producao/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filtro_producao: filtroProducao, grafica, status_producao: novoStatus }) });
                    }}
                    className={`text-xs font-bold border rounded px-2 py-1 outline-none cursor-pointer ${
                      statusProducao === 'Em Análise' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                      statusProducao === 'Aprovada' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                      statusProducao === 'Em Produção' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                      statusProducao === 'Produzida' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                      statusProducao === 'Cancelada' ? 'bg-red-100 text-red-800 border-red-300' :
                      'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                  >
                    <option value="">-- Status MES --</option>
                    <option value="Em Análise">Em Análise</option>
                    <option value="Aprovada">Aprovada</option>
                    <option value="Em Produção">Em Produção</option>
                    <option value="Produzida">Produzida</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <button onClick={() => setShowCsvDropdown(v => !v)} className="text-sm text-teal-700 font-bold border border-teal-200 px-4 py-1.5 rounded hover:bg-teal-50 shadow-sm transition-colors flex items-center gap-2">
                    <i className="fas fa-file-csv mr-1"></i> Exportar CSV <i className="fas fa-chevron-down text-xs opacity-60"></i>
                  </button>
                  {showCsvDropdown && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded shadow-xl z-50 min-w-[220px]">
                      <button onClick={() => { exportarTemposCSV(); setShowCsvDropdown(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 border-b">
                        <i className="fas fa-list mr-2 text-teal-600"></i> Por Etapas (detalhado)
                      </button>
                      <button onClick={() => { exportarCSVConsolidado(); setShowCsvDropdown(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                        <i className="fas fa-table mr-2 text-teal-600"></i> Por SKU Consolidado
                      </button>
                    </div>
                  )}
                </div>
                {skusConcluidosLote > 0 && (
                  <button onClick={() => { setLimparFiltros({ acabamento: [], sku: '' }); setModalConfigLimpar(true); }} className="text-sm text-red-600 font-bold border border-red-200 px-4 py-1.5 rounded hover:bg-red-50 shadow-sm transition-colors">
                    <i className="fas fa-eraser mr-1"></i> Borracha de Engenharia
                  </button>
                )}
                <button onClick={() => { setEtapa(1); carregarFiltrosIniciais(); setLotesSelecionados([]); }} className="text-sm text-blue-600 font-bold border border-blue-200 px-4 py-1.5 rounded hover:bg-blue-50 shadow-sm transition-colors">
                  Voltar aos Lotes
                </button>
              </div>
            </header>

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white border border-slate-200 p-4 rounded-md shadow-sm border-l-4 border-l-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Itens (SKUs)</span>
                <span className="text-lg font-black text-slate-800 block">{totalSkusLote} Produtos</span>
                <span className="text-xs text-amber-600 font-bold">{skusRestantesLote} Pendentes</span>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-md shadow-sm border-l-4 border-l-blue-600">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Tiragem Total do Lote</span>
                <span className="text-lg font-black font-mono text-blue-800 block">{tiragemLote.toLocaleString('pt-BR')} ex.</span>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-md shadow-sm border-l-4 border-l-emerald-600 col-span-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Estimativa de Carga Consolidada</span>
                <span className="text-xl font-black font-mono text-emerald-800 block">{decimalToTime(tempoDecimalTotal)}</span>
                <span className="text-xs text-slate-500">Soma de todo o fluxo produtivo (Miolo + Capas + Encartes + Acabamentos).</span>
              </div>
            </div>

            {/* 🤖 PAINEL DO ROBÔ DE AUTOMAÇÃO */}
            {skusRestantesLote > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg shadow-sm mb-6 overflow-hidden">
                <div className="bg-indigo-900 text-white p-3 flex items-center gap-3">
                  <i className="fas fa-robot text-lg text-indigo-300"></i>
                  <h3 className="text-sm font-bold uppercase tracking-wider">Roteirização Automática em Lote</h3>
                </div>
                <div className="p-5">
                  <p className="text-xs text-indigo-800 mb-4 font-medium">O robô irá processar os itens alvo seguindo a engenharia física de cada um (incluindo cálculo de Capas, Guardas, Encartes e Beneficiamento). <strong>Se a máquina for deixada em branco, ele alocará o serviço para a máquina mais rápida disponível.</strong></p>
                  
                  <div className="flex gap-4 mb-4 pb-4 border-b border-indigo-200 relative z-[8100]">
                    <div className="flex-1 relative">
                      <label className="block text-[10px] font-bold text-indigo-800 uppercase mb-1">Filtrar por Acabamento</label>
                      <button onClick={(e) => { e.stopPropagation(); setDropdownRobo(dropdownRobo === 'acabamento' ? null : 'acabamento'); }} className="w-full bg-white border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 text-left flex justify-between items-center shadow-sm">
                        <span>{roboFiltros.acabamento.length === 0 ? '-- Todos os Acabamentos --' : `${roboFiltros.acabamento.length} Selecionado(s)`}</span>
                        <i className={`fas fa-chevron-${dropdownRobo === 'acabamento' ? 'up' : 'down'} opacity-50`}></i>
                      </button>
                      {dropdownRobo === 'acabamento' && (
                        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-indigo-200 shadow-xl rounded-md py-2 max-h-48 overflow-y-auto z-50">
                          {opcoesAcabRobo.map(acab => (
                            <label key={acab} className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 cursor-pointer text-xs">
                              <input type="checkbox" checked={roboFiltros.acabamento.includes(acab)} onChange={() => toggleRoboFiltro('acabamento', acab)} className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500" />
                              <span className="font-bold text-slate-700">{acab}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 relative">
                      <label className="block text-[10px] font-bold text-indigo-800 uppercase mb-1">Filtrar por Espessura (Lombada)</label>
                      <button onClick={(e) => { e.stopPropagation(); setDropdownRobo(dropdownRobo === 'lombada' ? null : 'lombada'); }} className="w-full bg-white border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 text-left flex justify-between items-center shadow-sm">
                        <span>{roboFiltros.lombada.length === 0 ? '-- Todas as Lombadas --' : `${roboFiltros.lombada.length} Selecionada(s)`}</span>
                        <i className={`fas fa-chevron-${dropdownRobo === 'lombada' ? 'up' : 'down'} opacity-50`}></i>
                      </button>
                      {dropdownRobo === 'lombada' && (
                        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-indigo-200 shadow-xl rounded-md py-2 max-h-48 overflow-y-auto z-50">
                          {opcoesLombRobo.map(lomb => (
                            <label key={lomb} className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 cursor-pointer text-xs">
                              <input type="checkbox" checked={roboFiltros.lombada.includes(lomb)} onChange={() => toggleRoboFiltro('lombada', lomb)} className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500" />
                              <span className="font-bold text-slate-700">{lomb} mm</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="w-48 flex flex-col justify-end">
                      <div className="bg-indigo-100 border border-indigo-300 rounded p-2 text-center relative shadow-sm">
                        {(roboFiltros.acabamento.length > 0 || roboFiltros.lombada.length > 0) && (
                          <button onClick={() => setRoboFiltros({acabamento: [], lombada: []})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-red-600 shadow" title="Limpar Filtros"><i className="fas fa-times"></i></button>
                        )}
                        <span className="block text-[10px] font-bold text-indigo-700 uppercase">Alvo Atual do Robô</span>
                        <span className="block text-sm font-black text-indigo-900">{skusAlvoRobo.length} SKUs</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-4 mb-5">
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Imp. Miolo</label>
                      <select value={robo.impressao} onChange={e => setRobo({...robo, impressao: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('impressão')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo} ({mq.maq_cores || mq.cores || '?'} Cores)</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Imp. Capas</label>
                      <select value={robo.impressaoCapa} onChange={e => setRobo({...robo, impressaoCapa: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('impressão')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo} ({mq.maq_cores || mq.cores || '?'} Cores)</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Imp. Encarte/Adesivo</label>
                      <select value={robo.impressaoEncarte} onChange={e => setRobo({...robo, impressaoEncarte: e.target.value, impressaoAdesivo: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('impressão')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo} ({mq.maq_cores || mq.cores || '?'} Cores)</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Laminação / Verniz</label>
                      <select value={robo.benefCapa} onChange={e => setRobo({...robo, benefCapa: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('beneficiamento')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Empastamento</label>
                      <select value={robo.empastCapa} onChange={e => setRobo({...robo, empastCapa: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('empastamento')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Corte e Vinco</label>
                      <select value={robo.corteVinco} onChange={e => setRobo({...robo, corteVinco: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('corte')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Dobradeira Padrão</label>
                      <select value={robo.dobra} onChange={e => setRobo({...robo, dobra: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('dobra')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Alceadeira Padrão</label>
                      <select value={robo.alceadeira} onChange={e => setRobo({...robo, alceadeira: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('alceadeira')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Grampeadeira Padrão</label>
                      <select value={robo.grampo} onChange={e => setRobo({...robo, grampo: e.target.value})} className="w-full border border-indigo-300 rounded p-2 text-xs font-bold text-slate-700 bg-white">
                        <option value="">Automático...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('grampo') || String(m.tipo || '').toLowerCase().includes('canoa')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                      </select>
                    </div>
                    
                  </div>

                  <div className="flex justify-end">
                    <button onClick={() => executarAutomacaoEmMassa(false)} disabled={skusAlvoRobo.length === 0} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold px-6 py-2 rounded shadow flex items-center gap-2 text-xs uppercase tracking-wide transition-colors">
                      <i className="fas fa-magic"></i> Calcular {skusAlvoRobo.length} Item(s) Automático
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-md shadow-sm w-full overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-3 pl-4 w-12 text-center">Abrir</th>
                    <th className="p-3 w-32">SKU Produto</th>
                    <th className="p-3 w-56">Descrição</th>
                    <th className="p-3 w-20 text-right">Tiragem</th>
                    <th className="p-3 w-28 border-r border-slate-200 pl-4">Acabamento</th>
                    <th className="p-3 text-center w-24 text-blue-800 bg-blue-50/50">T. Miolo</th>
                    <th className="p-3 text-center w-24 text-indigo-800 bg-indigo-50/50">T. Capas</th>
                    <th className="p-3 text-center w-24 text-teal-800 bg-teal-50/50">T. Extras (Enc)</th>
                    <th className="p-3 text-center w-24 text-amber-800 bg-amber-50/50">T. Dobra</th>
                    <th className="p-3 text-center w-24 text-purple-800 bg-purple-50/50">T. Alcear</th>
                    <th className="p-3 text-center w-24 border-r border-slate-200 text-emerald-800 bg-emerald-50/50">T. Final</th>
                    <th className="p-3 text-center w-28 text-slate-900 bg-slate-200 font-black pr-4">Tempo Total SKU</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {skus.map((u, index) => {
                    const temCalculo = u.dados_calculo != null;
                    const src = u.dados_calculo || {};
                    
                    const tImp = temCalculo && src.impressao?.resultado ? src.impressao.resultado.totais.total : 'Pend.';
                    const tImpCapa = temCalculo && src.impressao_capa?.resultado ? src.impressao_capa.resultado.totais.total : '-';
                    const tBenCapa = temCalculo && src.beneficiamento_capa?.resultado ? src.beneficiamento_capa.resultado.totais.total : '-';
                    const tEmpCapa = temCalculo && src.empastamento_capa?.resultado ? src.empastamento_capa.resultado.totais.total : '-';
                    
                    const tCapaConsolidado = (tImpCapa === '-' && tBenCapa === '-' && tEmpCapa === '-') ? '-' : somarTodasAsStringsDeTempo([tImpCapa, tBenCapa, tEmpCapa]);
                    
                    const tImpEnc = temCalculo && src.impressao_encarte?.resultado ? src.impressao_encarte.resultado.totais.total : '-';
                    const tImpAde = temCalculo && src.impressao_adesivo?.resultado ? src.impressao_adesivo.resultado.totais.total : '-';
                    const tCortV = temCalculo && src.corte_vinco?.resultado ? src.corte_vinco.resultado.totais.total : '-';
                    
                    const tEncConsolidado = (tImpEnc === '-' && tImpAde === '-' && tCortV === '-') ? '-' : somarTodasAsStringsDeTempo([tImpEnc, tImpAde, tCortV]);

                    const tDob = temCalculo && src.dobra?.resultado ? src.dobra.resultado.totais.total : 'Pend.';
                    const tAlc = temCalculo && src.alceamento?.resultado ? src.alceamento.resultado.totais.total : '-';
                    
                    let tFim = '-';
                    if (temCalculo && src.grampo?.resultado) tFim = src.grampo.resultado.totais.total;
                    if (temCalculo && src.espiral?.resultado) tFim = src.espiral.resultado.totais.total;

                    const tempoTotalSku = somarTodasAsStringsDeTempo([tImp, tImpCapa, tBenCapa, tEmpCapa, tImpEnc, tImpAde, tCortV, tDob, tAlc, tFim]);

                    return (
                      <tr key={`${u.id}-${index}`} className="hover:bg-blue-50/50 cursor-pointer group" onClick={() => { 
                        setOsAtual(u); 
                        const lombNum = Number(String(u.lombada || '0').replace(',', '.'));
                        
                        const tiragem = Number(u.tiragem) || 0;
                        const paginas = Number(u.paginacao) || 0;
                        const totalFolhasMiolo = tiragem * Math.ceil(paginas / 2);
                        
                        let techMiolo = "ROTATIVA - OFFSET";
                        if (totalFolhasMiolo <= 500) techMiolo = "PLANA - DIGITAL";
                        else if (tiragem <= 2500) techMiolo = "ROTATIVA - DIGITAL";
                        else if (tiragem <= 10450) techMiolo = "PLANA - OFFSET";

                        let techCapa = tiragem < 1500 ? "PLANA - DIGITAL" : "PLANA - OFFSET";

                        const mqImpRec = getMaquinaIdeal('Impressão', techMiolo);
                        const mqImpCapRec = getMaquinaDedicada('capa') || getMaquinaIdeal('Impressão', techCapa);
                        const mqImpEncRec = getMaquinaDedicada('encarte') || mqImpRec;

                        const mqBenRec = getMaquinaMaisRapida('Beneficiamento');
                        const mqEmpRec = getMaquinaMaisRapida('Empastamento', 'Capa Dura');
                        const mqCorRec = getMaquinaMaisRapida('Corte');
                        const mqDobRec = getMaquinaMaisRapida('Dobra');
                        
                        const analiseImpClica = calcularImpressao(mqImpRec, Number(u.paginacao), Number(u.tiragem));
                        const cadernosClica = analiseImpClica ? analiseImpClica.totais.qtd : 1;

                        const acab = String(u.acabamento || '').toUpperCase();
                        let mqAlcRec = getMaquinaAlceamentoIdeal(acab, cadernosClica);

                        const mqGraRec = getMaquinaMaisRapida('Grampo', 'Canoa');
                        const mqFurRec = getMaquinaMaisRapida('Furação', 'Espiral');
                        
                        const mqEspRec = getMaquinaEspiralAdequada(lombNum, mqImpRec);

                        setIdMaquinaImpressao(temCalculo && src.impressao?.maquina_id ? String(src.impressao.maquina_id) : (mqImpRec ? String(mqImpRec.id) : ''));
                        setIdMaquinaImpressaoCapa(temCalculo && src.impressao_capa?.maquina_id ? String(src.impressao_capa.maquina_id) : (mqImpCapRec ? String(mqImpCapRec.id) : ''));
                        setIdMaquinaBeneficiamentoCapa(temCalculo && src.beneficiamento_capa?.maquina_id ? String(src.beneficiamento_capa.maquina_id) : (mqBenRec ? String(mqBenRec.id) : ''));
                        setIdMaquinaEmpastamentoCapa(temCalculo && src.empastamento_capa?.maquina_id ? String(src.empastamento_capa.maquina_id) : (mqEmpRec ? String(mqEmpRec.id) : ''));
                        setIdMaquinaImpressaoEncarte(temCalculo && src.impressao_encarte?.maquina_id ? String(src.impressao_encarte.maquina_id) : (mqImpEncRec ? String(mqImpEncRec.id) : ''));
                        setIdMaquinaImpressaoAdesivo(temCalculo && src.impressao_adesivo?.maquina_id ? String(src.impressao_adesivo.maquina_id) : (mqImpRec ? String(mqImpRec.id) : ''));
                        setIdMaquinaCorteVinco(temCalculo && src.corte_vinco?.maquina_id ? String(src.corte_vinco.maquina_id) : (mqCorRec ? String(mqCorRec.id) : ''));
                        
                        setIdMaquinaDobra(temCalculo && src.dobra?.maquina_id ? String(src.dobra.maquina_id) : (mqDobRec ? String(mqDobRec.id) : ''));
                        setIdMaquinaAlceadeira(temCalculo && src.alceamento?.maquina_id ? String(src.alceamento.maquina_id) : (mqAlcRec ? String(mqAlcRec.id) : ''));
                        setIdMaquinaGrampo(temCalculo && src.grampo?.maquina_id ? String(src.grampo.maquina_id) : (mqGraRec ? String(mqGraRec.id) : ''));
                        setIdMaquinaFuracao(temCalculo && src.espiral?.maquina_furacao_id ? String(src.espiral.maquina_furacao_id) : (mqFurRec ? String(mqFurRec.id) : ''));
                        setIdMaquinaEspiral(temCalculo && src.espiral?.maquina_espiral_id ? String(src.espiral.maquina_espiral_id) : (mqEspRec ? String(mqEspRec.id) : ''));
                        setEtapa(3); 
                      }}>
                        <td className="p-3 pl-4 text-center text-slate-400 group-hover:text-blue-600"><i className="fas fa-arrow-right"></i></td>
                        <td className="p-3 font-mono font-bold text-slate-800">{u.sku_miolo}</td>
                        <td className="p-3 truncate max-w-[200px]" title={u.descricao}>{u.descricao}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-700">{Number(u.tiragem).toLocaleString('pt-BR')}</td>
                        <td className="p-3 uppercase text-[10px] border-r border-slate-200 font-bold text-slate-500 pl-4">{u.acabamento}</td>
                        <td className={`p-3 text-center font-mono text-[11px] ${tImp === 'Pend.' ? 'text-slate-400 italic' : 'font-bold text-blue-900 bg-blue-50/20'}`}>{tImp}</td>
                        <td className={`p-3 text-center font-mono text-[11px] ${tCapaConsolidado === '-' ? 'text-slate-400 italic' : 'font-bold text-indigo-900 bg-indigo-50/20'}`}>{tCapaConsolidado}</td>
                        <td className={`p-3 text-center font-mono text-[11px] ${tEncConsolidado === '-' ? 'text-slate-400 italic' : 'font-bold text-teal-900 bg-teal-50/20'}`}>{tEncConsolidado}</td>
                        <td className={`p-3 text-center font-mono text-[11px] ${tDob === 'Pend.' ? 'text-slate-400 italic' : 'font-bold text-amber-900 bg-amber-50/20'}`}>{tDob}</td>
                        <td className={`p-3 text-center font-mono text-[11px] ${tAlc === '-' ? 'text-slate-400 italic' : 'font-bold text-purple-900 bg-purple-50/20'}`}>{tAlc}</td>
                        <td className={`p-3 text-center font-mono text-[11px] border-r border-slate-200 ${tFim === '-' ? 'text-slate-400 italic' : 'font-bold text-emerald-900 bg-emerald-50/20'}`}>{tFim}</td>
                        <td className={`p-3 text-center font-mono text-[12px] font-black pr-4 ${tempoTotalSku === 'Pend.' ? 'text-slate-400 italic' : 'text-slate-950 bg-slate-200/60'}`}>{tempoTotalSku}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}

      {/* ETAPA 3: DETALHAMENTO DA O.S. MANUAL */}
      {etapa === 3 && osAtual && (() => {
        const maqImpressao = maquinasCargadas.find(m => String(m.id) === String(idMaquinaImpressao || ''));
        const analiseImpressao = calcularImpressao(maqImpressao, Number(osAtual.paginacao), Number(osAtual.tiragem));
        const tProduzidaCabecalho = analiseImpressao ? analiseImpressao.parametros.tiragemProduzida : Math.round(Number(osAtual.tiragem) + 175 + (Number(osAtual.tiragem) * 0.06));

        const capasDoItem = capasDoLote.filter(c => String(c.sku_ref) === String(osAtual.sku_miolo));
        const exigeCapa = capasDoItem.length > 0;
        const maqImpCapa = maquinasCargadas.find(m => String(m.id) === String(idMaquinaImpressaoCapa || ''));
        const analiseImpCapa = exigeCapa ? calcularImpressaoCapa(maqImpCapa, capasDoItem, Number(osAtual.tiragem)) : null;

        const exigeBeneficiamento = capasDoItem.some(c => {
          const b = String(c.beneficiamento || '').toUpperCase();
          return b.includes('LAMINAÇÃO') || b.includes('VERNIZ');
        });
        const maqBenCapa = maquinasCargadas.find(m => String(m.id) === String(idMaquinaBeneficiamentoCapa || ''));
        const analiseBenCapa = exigeBeneficiamento ? calcularBeneficiamentoCapa(maqBenCapa, capasDoItem, Number(osAtual.tiragem), maqImpCapa) : null;

        const exigeEmpastamento = capasDoItem.some(c => String(c.tipo_capa || '').toUpperCase().includes('DURA'));
        const maqEmpCapa = maquinasCargadas.find(m => String(m.id) === String(idMaquinaEmpastamentoCapa || ''));
        const analiseEmpCapa = exigeEmpastamento ? calcularEmpastamentoCapa(maqEmpCapa, capasDoItem, Number(osAtual.tiragem), maqImpCapa) : null;

        // CALCULOS DE ENCARTE
        const encarteItem = encartesDoLote.find(e => String(e.sku_miolo) === String(osAtual.sku_miolo));
        
        const exigeEncarte = encarteItem && Number(encarteItem.paginacao_encarte) > 0;
        const maqImpEncarte = maquinasCargadas.find(m => String(m.id) === String(idMaquinaImpressaoEncarte || ''));
        const analiseImpEncarte = exigeEncarte ? calcularImpressao(maqImpEncarte, Number(encarteItem.paginacao_encarte), Number(encarteItem.tiragem || osAtual.tiragem)) : null;

        const exigeAdesivo = encarteItem && Number(encarteItem.paginacao_adesivo) > 0;
        const maqImpAdesivo = maquinasCargadas.find(m => String(m.id) === String(idMaquinaImpressaoAdesivo || ''));
        const analiseImpAdesivo = exigeAdesivo ? calcularImpressao(maqImpAdesivo, Number(encarteItem.paginacao_adesivo), Number(encarteItem.tiragem || osAtual.tiragem)) : null;

        const exigeCorteVinco = encarteItem && (String(encarteItem.corte_vinco_encarte || '').toLowerCase() === 'sim' || String(encarteItem.corte_vinco_adesivo || '').toLowerCase() === 'sim');
        const maqCorteVinco = maquinasCargadas.find(m => String(m.id) === String(idMaquinaCorteVinco || ''));
        const analiseCorteVinco = exigeCorteVinco ? calcularCorteVinco(maqCorteVinco, analiseImpEncarte, analiseImpAdesivo, encarteItem) : null;

        const maqDobra = maquinasCargadas.find(m => String(m.id) === String(idMaquinaDobra || ''));
        const analiseDobra = calcularDobra(maqDobra, analiseImpressao, maqImpressao, Number(osAtual.paginacao) || 0);

        const acabamento = String(osAtual.acabamento || '').toUpperCase();
        
        const exigeAlceamento = acabamento.includes('LOMBADA') || acabamento.includes('PUR') || acabamento.includes('ESPIRAL') || acabamento.includes('WIRE-O');
        const maqAlceadeira = maquinasCargadas.find(m => String(m.id) === String(idMaquinaAlceadeira || ''));
        const analiseAlceamento = exigeAlceamento ? calcularAlceamento(maqAlceadeira, analiseImpressao, maqImpressao) : null;

        const exigeGrampo = acabamento.includes('CANOA') || acabamento.includes('GRAMPO');
        const maqGrampo = maquinasCargadas.find(m => String(m.id) === String(idMaquinaGrampo || ''));
        const analiseGrampo = exigeGrampo ? calcularGrampo(maqGrampo, analiseImpressao, Number(osAtual.paginacao) || 0, maqImpressao) : null;

        const exigeEspiral = acabamento.includes('ESPIRAL') || acabamento.includes('WIRE-O');
        const maqFuracao = maquinasCargadas.find(m => String(m.id) === String(idMaquinaFuracao || ''));
        const maqEspiral = maquinasCargadas.find(m => String(m.id) === String(idMaquinaEspiral || ''));
        const analiseEspiral = exigeEspiral ? calcularEspiral(maqFuracao, maqEspiral, analiseImpressao, Number(osAtual.paginacao), osAtual.lombada) : null;

        const totalSkusLote = skus.length;
        const skusConcluidosLote = skus.filter(s => s.dados_calculo != null).length;
        const skusRestantesLote = totalSkusLote - skusConcluidosLote;

        return (
          <div className="w-full text-left font-sans text-slate-800 pb-24">
            
            <div className="bg-slate-800 text-white rounded-t-lg p-4 flex justify-between items-center shadow-sm">
              <div>
                <h2 className="text-lg font-bold uppercase tracking-wide">Ordem de Serviço: {osAtual.sku_miolo}</h2>
                <p className="text-slate-300 text-xs font-mono mt-1">
                  Lote: {filtroProducao} | Progresso Lote: <span className="text-emerald-400 font-bold">{skusConcluidosLote} de {totalSkusLote}</span> calculados ({skusRestantesLote} restantes)
                </p>
              </div>
              <button onClick={() => { setEtapa(2); carregarItensDoLote(filtroProducao, grafica); }} className="bg-slate-700 border border-slate-600 hover:bg-slate-600 text-xs font-bold px-4 py-2 rounded transition-colors shadow-sm">Voltar para a Fila</button>
            </div>

            {/* GRID PRINCIPAL (MIOLO) */}
            <div className="bg-white border-x border-b border-slate-200 rounded-b-lg p-5 grid grid-cols-2 md:grid-cols-5 gap-6 shadow-sm mb-4">
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase">Produto</span>
                <span className="text-sm font-bold text-slate-800">{osAtual.descricao}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase">Acabamento</span>
                <span className="text-sm font-bold text-slate-700">{osAtual.acabamento || '-'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase">Tiragem Comercial</span>
                <span className="text-sm font-mono font-bold text-slate-700">{Number(osAtual.tiragem).toLocaleString('pt-BR')} ex.</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-blue-600 uppercase">Tiragem C/ Quebras</span>
                <span className="text-sm font-mono font-black text-blue-800">{tProduzidaCabecalho.toLocaleString('pt-BR')} ex.</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase">Lombada Fim</span>
                <span className="text-sm font-mono font-bold text-slate-700">{osAtual.paginacao}p | {osAtual.lombada}mm</span>
              </div>
            </div>

            {/* RAIO-X DE CAPAS E EXTRAS */}
            {(exigeCapa || exigeEncarte || exigeAdesivo) && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm mb-6">
                {exigeCapa && (
                  <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded md:col-span-1">
                    <span className="block text-[10px] font-bold text-indigo-800 uppercase mb-2">Estrutura de Capas ({capasDoItem.length})</span>
                    <ul className="space-y-2">
                      {capasDoItem.map((c, i) => (
                        <li key={i} className="text-xs text-slate-700 font-mono leading-tight">
                          <span className="font-bold text-indigo-900 block truncate" title={c.sku_capa}>{c.sku_capa}</span>
                          {c.tipo_capa} | <span className="font-bold text-indigo-700">{c.cores}</span>
                          {c.beneficiamento && c.beneficiamento !== '-' && <span className="block text-[10px] text-sky-700 uppercase mt-0.5">+ {c.beneficiamento}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {(exigeEncarte || exigeAdesivo) && (
                  <div className="bg-teal-50/50 border border-teal-100 p-3 rounded md:col-span-2 flex flex-col justify-center">
                    <span className="block text-[10px] font-bold text-teal-800 uppercase mb-2">Itens Extras Acoplados</span>
                    <div className="flex gap-8">
                      {exigeEncarte && (
                        <div className="text-xs text-slate-700 font-mono">
                          <span className="font-bold text-teal-900 block mb-1"><i className="fas fa-file-alt mr-1"></i> ENCARTE</span>
                          Paginação: {encarteItem.paginacao_encarte} pgs <br/>
                          Corte/Vinco: <span className={String(encarteItem.corte_vinco_encarte).toLowerCase() === 'sim' ? 'text-red-600 font-bold uppercase' : 'uppercase'}>{encarteItem.corte_vinco_encarte || 'NÃO'}</span>
                        </div>
                      )}
                      {exigeAdesivo && (
                        <div className="text-xs text-slate-700 font-mono">
                          <span className="font-bold text-yellow-700 block mb-1"><i className="fas fa-sticky-note mr-1"></i> ADESIVO</span>
                          Paginação: {encarteItem.paginacao_adesivo} pgs <br/>
                          Corte/Vinco: <span className={String(encarteItem.corte_vinco_adesivo).toLowerCase() === 'sim' ? 'text-red-600 font-bold uppercase' : 'uppercase'}>{encarteItem.corte_vinco_adesivo || 'NÃO'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 🔥 1. IMPRESSÃO (SEÇÃO UNIFICADA) */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSecao('impressao')}>
                <h3 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-2"><span className="bg-slate-800 text-white w-6 h-6 flex items-center justify-center rounded text-xs">1</span> Setor de Impressão</h3>
                <i className={`fas fa-chevron-${secoes.impressao ? 'up' : 'down'} text-slate-500`}></i>
              </div>

              {secoes.impressao && (
                <div className="p-4 space-y-6">
                  
                  {/* 1.1 Impressão Miolo */}
                  <div className="border border-slate-200 rounded-md p-4 bg-slate-50/30">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-xs font-black uppercase text-blue-900 tracking-wider">1.1 Impressão de Miolo</h4>
                      <div className="flex items-center gap-2 relative">
                        <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'impMiolo' ? null : 'impMiolo'); }} className="text-slate-400 hover:text-blue-600 text-lg transition-colors">
                          <i className="fas fa-info-circle"></i>
                        </button>
                        {tooltipAtivo === 'impMiolo' && (
                          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-slate-700 leading-relaxed animate-in zoom-in-95 duration-150 cursor-default" onClick={(e) => e.stopPropagation()}>
                            <div className="border-b border-slate-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase tracking-wider text-amber-400 font-mono text-[11px]">Memorial de Cálculo: Imp. Miolo</h4><button onClick={() => setTooltipAtivo(null)} className="text-gray-400 hover:text-white font-bold">X</button></div>
                            <div className="space-y-3 text-slate-300 font-normal normal-case">
                              <p><strong>1. Tiragem com Quebra:</strong> O sistema identifica se a máquina é <strong>Offset</strong> (Tiragem + 175 folhas + 6%) ou <strong>Digital</strong> (Tiragem + 22 folhas + 5%). Total Carga Real = <strong>{analiseImpressao?.parametros.tiragemProduzida.toLocaleString('pt-BR')} folhas</strong>.</p>
                              <p><strong>2. Regra Físicas de Cores (Passadas):</strong> A impressora alocada tem {analiseImpressao?.parametros.qtdCores} cores. Como ela imprime apenas de um lado por vez, o papel precisa passar <strong>{analiseImpressao?.parametros.passadas} vezes</strong> por dentro dela (Frente e depois Verso). Logo, o número de giros e setups dobra automaticamente!</p>
                              <p><strong>3. Engenharia de Cadernos e Poses:</strong> Dividimos as {osAtual.paginacao} páginas do livro pelo tamanho máximo da chapa ({analiseImpressao?.parametros.capacidadeMax}p). Deu {analiseImpressao?.parametros.cadernosInteiros} cadernos inteiros. A sobra de {analiseImpressao?.parametros.paginasRestantes} páginas entra em uma chapa fracionada com <strong>{analiseImpressao?.parametros.posesFracionado} poses (cópias juntas)</strong>, reduzindo os giros pela metade!</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <select value={idMaquinaImpressao} onChange={(e) => setIdMaquinaImpressao(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                      <option value="">Selecione o equipamento do miolo...</option>
                      {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('impressão')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo} ({mq.maq_cores || mq.cores || '?'} Cores)</option>)}
                    </select>
                    
                    {analiseImpressao && (
                      <div className="mb-3 bg-slate-100 border border-slate-200 p-2 rounded text-[11px] flex gap-6 font-bold text-slate-600 uppercase tracking-wide">
                        <span>Velocidade: <span className="text-blue-700 font-mono">{analiseImpressao.parametros.velocidade.toLocaleString('pt-BR')} giros/h</span></span>
                        <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseImpressao.maquinaSetupStr}</span></span>
                      </div>
                    )}

                    {analiseImpressao && (
                      <table className="w-full text-left border-collapse text-sm border border-slate-200 bg-white">
                        <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                          <tr>
                            <th className="p-2 pl-4">Estrutura de Cadernos</th>
                            <th className="p-2 text-center">Qtd</th>
                            <th className="p-2 text-right">Giros Máquina</th>
                            <th className="p-2 text-center">Setup</th>
                            <th className="p-2 text-center">Rodagem</th>
                            <th className="p-2 text-center pr-4">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-slate-700 text-xs">
                          {analiseImpressao.linhas.map((l, i) => (
                            <tr key={i}><td className="p-2 pl-4 text-[10px]">{l.tipo}</td><td className="p-2 text-center">{l.qtd}</td><td className="p-2 text-right">{l.giros.toLocaleString('pt-BR')}</td><td className="p-2 text-center">{l.setup}</td><td className="p-2 text-center">{l.rodagem}</td><td className="p-2 text-center font-bold text-slate-800 pr-4">{l.total}</td></tr>
                          ))}
                          <tr className="bg-blue-50/50 font-bold border-t border-slate-200">
                            <td className="p-3 pl-4 uppercase font-sans text-xs">Total Miolo ({analiseImpressao.parametros.passadas}x Passadas)</td><td className="p-3 text-center">{analiseImpressao.totais.qtd}</td><td className="p-3 text-right">{analiseImpressao.totais.giros.toLocaleString('pt-BR')}</td><td className="p-3 text-center">{analiseImpressao.totais.setup}</td><td className="p-3 text-center">{analiseImpressao.totais.rodagem}</td><td className="p-3 text-center pr-4 text-blue-800">{analiseImpressao.totais.total}</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* 1.2 Impressão Capas */}
                  {exigeCapa && (
                    <div className="border border-slate-200 rounded-md p-4 bg-indigo-50/10">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-black uppercase text-indigo-900 tracking-wider">1.2 Impressão de Capas</h4>
                        <div className="flex items-center gap-2 relative">
                          <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'impCapa' ? null : 'impCapa'); }} className="text-slate-400 hover:text-indigo-600 text-lg transition-colors">
                            <i className="fas fa-info-circle"></i>
                          </button>
                          {tooltipAtivo === 'impCapa' && (
                            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-indigo-700 leading-relaxed animate-in zoom-in-95 duration-150 cursor-default" onClick={(e) => e.stopPropagation()}>
                              <div className="border-b border-indigo-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase tracking-wider text-indigo-400 font-mono text-[11px]">Memorial de Cálculo: Capas</h4><button onClick={() => setTooltipAtivo(null)} className="text-gray-400 hover:text-white font-bold">X</button></div>
                              <div className="space-y-3 text-slate-300 font-normal normal-case">
                                <p><strong>1. Capa Simples:</strong> Roda em 4 poses. Se a capa tiver impressão no verso (ex: 4x4) e a máquina for de 4 cores, ela passa duas vezes na máquina (gera 2 setups).</p>
                                <p><strong>2. Capa Dura:</strong> Roda em 2 poses porque precisa de sobra para revestir o papelão. Se tiver impressão no verso, essa impressão é feita separada (a Guarda). A guarda roda em 4 poses, exigindo um setup e giros independentes.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <select value={idMaquinaImpressaoCapa} onChange={(e) => setIdMaquinaImpressaoCapa(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                        <option value="">Selecione o equipamento das capas...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('impressão')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo} ({mq.maq_cores || mq.cores || '?'} Cores)</option>)}
                      </select>
                      
                      {analiseImpCapa && (
                        <div className="mb-3 bg-indigo-50 border border-indigo-100 p-2 rounded text-[11px] flex gap-6 font-bold text-indigo-900 uppercase tracking-wide">
                          <span>Velocidade: <span className="text-indigo-700 font-mono">{analiseImpCapa.parametros.velocidade.toLocaleString('pt-BR')} giros/h</span></span>
                          <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseImpCapa.maquinaSetupStr}</span></span>
                        </div>
                      )}

                      {analiseImpCapa && (
                        <table className="w-full text-left border-collapse text-sm border border-slate-200 bg-white">
                          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                            <tr>
                              <th className="p-2 pl-4">Tipo de Capa</th>
                              <th className="p-2 text-right">Tiragem</th>
                              <th className="p-2 text-right">C/ Quebra</th>
                              <th className="p-2 text-center">Poses</th>
                              <th className="p-2 text-right">Folhas</th>
                              <th className="p-2 text-right">Giros Máquina</th>
                              <th className="p-2 text-center">Setup</th>
                              <th className="p-2 text-center pr-4">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-slate-700 text-xs">
                            {analiseImpCapa.linhas.map((l, i) => (
                              <tr key={i}>
                                <td className="p-2 pl-4 text-[10px] truncate max-w-[150px]" title={l.tipo}>{l.tipo}</td>
                                <td className="p-2 text-right">{l.tiragem.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-right text-indigo-700 font-bold">{l.cQuebra.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-center">{l.poses}</td>
                                <td className="p-2 text-right">{l.folhas.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-right">{l.giros.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-center">{l.setupTime}</td>
                                <td className="p-2 text-center pr-4 font-bold text-slate-900">{l.total}</td>
                              </tr>
                            ))}
                            <tr className="bg-indigo-100/50 font-bold border-t border-slate-200">
                              <td className="p-3 pl-4 uppercase font-sans text-xs" colSpan={5}>Total Geral Capas</td>
                              <td className="p-3 text-right text-indigo-900">{analiseImpCapa.parametros.giros.toLocaleString('pt-BR')}</td>
                              <td className="p-3 text-center text-indigo-900">{analiseImpCapa.totais.setup}</td>
                              <td className="p-3 text-center pr-4 text-indigo-900">{analiseImpCapa.totais.total}</td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* 1.3 Impressão Encartes */}
                  {exigeEncarte && (
                    <div className="border border-slate-200 rounded-md p-4 bg-teal-50/10">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-black uppercase text-teal-900 tracking-wider">1.3 Impressão de Encartes</h4>
                      </div>
                      <select value={idMaquinaImpressaoEncarte} onChange={(e) => setIdMaquinaImpressaoEncarte(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                        <option value="">Selecione o equipamento do encarte...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('impressão')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo} ({mq.maq_cores || mq.cores || '?'} Cores)</option>)}
                      </select>
                      {analiseImpEncarte && (
                        <div className="mb-3 bg-teal-50 border border-teal-100 p-2 rounded text-[11px] flex gap-6 font-bold text-teal-900 uppercase tracking-wide">
                          <span>Velocidade: <span className="text-teal-700 font-mono">{analiseImpEncarte.parametros.velocidade.toLocaleString('pt-BR')} giros/h</span></span>
                          <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseImpEncarte.maquinaSetupStr}</span></span>
                        </div>
                      )}
                      {analiseImpEncarte && (
                        <table className="w-full text-left border-collapse text-sm border border-slate-200 bg-white">
                          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                            <tr><th className="p-2 pl-4">Estrutura de Cadernos</th><th className="p-2 text-center">Qtd</th><th className="p-2 text-right">Giros Máquina</th><th className="p-2 text-center">Setup</th><th className="p-2 text-center">Rodagem</th><th className="p-2 text-center pr-4">Total</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-slate-700 text-xs">
                            {analiseImpEncarte.linhas.map((l, i) => (
                              <tr key={i}><td className="p-2 pl-4 text-[10px]">{l.tipo}</td><td className="p-2 text-center">{l.qtd}</td><td className="p-2 text-right">{l.giros.toLocaleString('pt-BR')}</td><td className="p-2 text-center">{l.setup}</td><td className="p-2 text-center">{l.rodagem}</td><td className="p-2 text-center font-bold text-slate-800 pr-4">{l.total}</td></tr>
                            ))}
                            <tr className="bg-teal-50/50 font-bold border-t border-slate-200">
                              <td className="p-3 pl-4 uppercase font-sans text-xs">Total Encarte</td><td className="p-3 text-center">{analiseImpEncarte.totais.qtd}</td><td className="p-3 text-right">{analiseImpEncarte.totais.giros.toLocaleString('pt-BR')}</td><td className="p-3 text-center">{analiseImpEncarte.totais.setup}</td><td className="p-3 text-center">{analiseImpEncarte.totais.rodagem}</td><td className="p-3 text-center pr-4 text-teal-800">{analiseImpEncarte.totais.total}</td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* 1.4 Impressão Adesivos */}
                  {exigeAdesivo && (
                    <div className="border border-slate-200 rounded-md p-4 bg-yellow-50/10">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-black uppercase text-yellow-900 tracking-wider">1.4 Impressão de Adesivos</h4>
                      </div>
                      <select value={idMaquinaImpressaoAdesivo} onChange={(e) => setIdMaquinaImpressaoAdesivo(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                        <option value="">Selecione o equipamento do adesivo...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('impressão')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo} ({mq.maq_cores || mq.cores || '?'} Cores)</option>)}
                      </select>
                      {analiseImpAdesivo && (
                        <div className="mb-3 bg-yellow-50 border border-yellow-100 p-2 rounded text-[11px] flex gap-6 font-bold text-yellow-900 uppercase tracking-wide">
                          <span>Velocidade: <span className="text-yellow-700 font-mono">{analiseImpAdesivo.parametros.velocidade.toLocaleString('pt-BR')} giros/h</span></span>
                          <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseImpAdesivo.maquinaSetupStr}</span></span>
                        </div>
                      )}
                      {analiseImpAdesivo && (
                        <table className="w-full text-left border-collapse text-sm border border-slate-200 bg-white">
                          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                            <tr><th className="p-2 pl-4">Estrutura de Cadernos</th><th className="p-2 text-center">Qtd</th><th className="p-2 text-right">Giros Máquina</th><th className="p-2 text-center">Setup</th><th className="p-2 text-center">Rodagem</th><th className="p-2 text-center pr-4">Total</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-slate-700 text-xs">
                            {analiseImpAdesivo.linhas.map((l, i) => (
                              <tr key={i}><td className="p-2 pl-4 text-[10px]">{l.tipo}</td><td className="p-2 text-center">{l.qtd}</td><td className="p-2 text-right">{l.giros.toLocaleString('pt-BR')}</td><td className="p-2 text-center">{l.setup}</td><td className="p-2 text-center">{l.rodagem}</td><td className="p-2 text-center font-bold text-slate-800 pr-4">{l.total}</td></tr>
                            ))}
                            <tr className="bg-yellow-50/50 font-bold border-t border-slate-200">
                              <td className="p-3 pl-4 uppercase font-sans text-xs">Total Adesivo</td><td className="p-3 text-center">{analiseImpAdesivo.totais.qtd}</td><td className="p-3 text-right">{analiseImpAdesivo.totais.giros.toLocaleString('pt-BR')}</td><td className="p-3 text-center">{analiseImpAdesivo.totais.setup}</td><td className="p-3 text-center">{analiseImpAdesivo.totais.rodagem}</td><td className="p-3 text-center pr-4 text-yellow-800">{analiseImpAdesivo.totais.total}</td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* 2. DOBRA MIOLO */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSecao('dobra')}>
                <h3 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-2"><span className="bg-slate-800 text-white w-6 h-6 flex items-center justify-center rounded text-xs">2</span> Dobra (Miolo)</h3>
                
                <div className="flex items-center gap-4 relative">
                  <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'dobra' ? null : 'dobra'); }} className="text-slate-400 hover:text-blue-600 text-lg transition-colors">
                    <i className="fas fa-info-circle"></i>
                  </button>
                  {tooltipAtivo === 'dobra' && (
                    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-slate-700 leading-relaxed animate-in zoom-in-95 duration-150 cursor-default" onClick={(e) => e.stopPropagation()}>
                      <div className="border-b border-slate-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase tracking-wider text-amber-400 font-mono text-[11px]">Memorial de Cálculo: Dobra</h4><button onClick={() => setTooltipAtivo(null)} className="text-gray-400 hover:text-white font-bold">X</button></div>
                      <div className="space-y-3 text-slate-300 font-normal normal-case">
                        <p><strong>1. Trava Plana vs Rotativa:</strong> Se a impressora alocada na Etapa 1 for do tipo <strong>Rotativa</strong>, o papel já sai dobrado! O tempo de dobra zera automaticamente. Se for <strong>Plana</strong>, as folhas retas entram na dobradeira.</p>
                        <p><strong>2. Total de Entradas:</strong> É a Qtd. de cadernos multiplicada pela Tiragem Produzida. (Ex: Um livro de 2 cadernos precisa passar {analiseDobra?.totais?.entradas?.toLocaleString('pt-BR') || 0} folhas pela máquina).</p>
                        <p><strong>3. Acúmulo de Setup:</strong> Cobra-se o setup unitário multiplicado pelo número de regulagens diferentes de facas.</p>
                      </div>
                    </div>
                  )}
                  <i className={`fas fa-chevron-${secoes.dobra ? 'up' : 'down'} text-slate-500`}></i>
                </div>
              </div>
              
              {secoes.dobra && (
                <div className="p-4">
                  <select value={idMaquinaDobra} onChange={(e) => setIdMaquinaDobra(e.target.value)} disabled={!analiseImpressao} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                    <option value="">Selecione a dobradeira...</option>
                    {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('dobra')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                  </select>
                  
                  {analiseDobra && !analiseDobra.isRotativa && (
                    <>
                      <div className="mb-3 bg-slate-50 border border-slate-200 p-2.5 rounded text-xs flex gap-6 font-bold text-slate-600 uppercase tracking-wide">
                        <span>Produtividade: <span className="text-amber-700 font-mono">{analiseDobra.parametros?.velocidade?.toLocaleString('pt-BR')} fls/h</span></span>
                        <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseDobra.maquinaSetupStr}</span></span>
                      </div>
                      
                      <table className="w-full text-left border-collapse text-sm border border-slate-200 bg-white">
                        <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                          <tr>
                            <th className="p-2 pl-4">Carga Processada</th>
                            <th className="p-2 text-right">Folhas Físicas</th>
                            <th className="p-2 text-center">Setup Calculado</th>
                            <th className="p-2 text-center">Rodagem Estimada</th>
                            <th className="p-2 text-center pr-4">Total Setor</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono text-slate-700 text-xs">
                          <tr className="bg-blue-50/50 font-bold border-t border-slate-200">
                            <td className="p-3 pl-4 uppercase font-sans text-xs">Total Dobra</td>
                            <td className="p-3 text-right">{analiseDobra.totais?.entradas?.toLocaleString('pt-BR')}</td>
                            <td className="p-3 text-center">{analiseDobra.totais?.setup}</td>
                            <td className="p-3 text-center">{analiseDobra.totais?.rodagem}</td>
                            <td className="p-3 text-center pr-4 text-blue-800">{analiseDobra.totais?.total}</td>
                          </tr>
                        </tbody>
                      </table>
                    </>
                  )}
                  {analiseDobra?.isRotativa && <div className="text-center text-sm font-bold text-blue-700 p-4 bg-slate-50 border border-slate-200">Dobradeira Online na Rotativa (Sem Tempo Adicional).</div>}
                </div>
              )}
            </div>

            {/* 🔥 3. BENEFICIAMENTO DE CAPA (BOPP / VERNIZ) */}
            {exigeBeneficiamento && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 overflow-hidden border-l-4 border-l-sky-500">
                <div className="bg-sky-50/50 border-b border-slate-200 p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSecao('benefCapa')}>
                  <h3 className="text-sm font-bold uppercase text-sky-950 flex items-center gap-2"><span className="bg-sky-500 text-white w-6 h-6 flex items-center justify-center rounded text-xs">3</span> Beneficiamento Capas</h3>
                  
                  <div className="flex items-center gap-4 relative">
                    <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'benCapa' ? null : 'benCapa'); }} className="text-slate-400 hover:text-sky-600 text-lg transition-colors">
                      <i className="fas fa-info-circle"></i>
                    </button>
                    {tooltipAtivo === 'benCapa' && (
                      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-sky-700 leading-relaxed animate-in zoom-in-95 duration-150 cursor-default" onClick={(e) => e.stopPropagation()}>
                        <div className="border-b border-sky-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase tracking-wider text-sky-400 font-mono text-[11px]">Memorial de Cálculo: Beneficiamento</h4><button onClick={() => setTooltipAtivo(null)} className="text-gray-400 hover:text-white font-bold">X</button></div>
                        <div className="space-y-3 text-slate-300 font-normal normal-case">
                          <p>O sistema identificou que a Capa possui Laminação ou Verniz cadastrado no banco. O cálculo de rodagem puxa <strong>exclusivamente as folhas físicas da capa externa</strong> (excluindo, por exemplo, Guardas de capa dura, que não levam acabamento externo).</p>
                        </div>
                      </div>
                    )}
                    <i className={`fas fa-chevron-${secoes.benefCapa ? 'up' : 'down'} text-sky-500`}></i>
                  </div>
                </div>

                {secoes.benefCapa && (
                  <div className="p-4">
                    <select value={idMaquinaBeneficiamentoCapa} onChange={(e) => setIdMaquinaBeneficiamentoCapa(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                      <option value="">Selecione a laminadora/envernizadora...</option>
                      {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('beneficiamento')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                    </select>
                    
                    {analiseBenCapa && (
                      <>
                        <div className="bg-sky-50 border border-sky-100 p-2.5 rounded text-xs flex gap-6 font-bold text-sky-900 uppercase tracking-wide">
                          <span>Produtividade: <span className="text-sky-700 font-mono">{analiseBenCapa.parametros.velocidade.toLocaleString('pt-BR')} fls/h</span></span>
                          <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseBenCapa.maquinaSetupStr}</span></span>
                        </div>

                        <table className="w-full text-left border-collapse text-sm border border-slate-200 mt-4 bg-white">
                          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                            <tr>
                              <th className="p-2 pl-4">Tipo Acabamento</th>
                              <th className="p-2 text-right">Tiragem</th>
                              <th className="p-2 text-right">C/ Quebra</th>
                              <th className="p-2 text-right">Folhas p/ Máquina</th>
                              <th className="p-2 text-center">Setup</th>
                              <th className="p-2 text-center pr-4">Total Linha</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-slate-700 text-xs">
                            {analiseBenCapa.linhas.map((l, i) => (
                              <tr key={i}>
                                <td className="p-2 pl-4 text-[10px] truncate max-w-[200px]">{l.tipo}</td>
                                <td className="p-2 text-right">{l.tiragem.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-right text-sky-700 font-bold">{l.cQuebra.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-right">{l.folhas.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-center">{l.setupTime}</td>
                                <td className="p-2 text-center pr-4 font-bold text-slate-900">{l.total}</td>
                              </tr>
                            ))}
                            <tr className="bg-sky-100/50 font-bold border-t-2 border-slate-200">
                              <td className="p-3 pl-4 uppercase font-sans text-xs" colSpan={3}>TOTAL BENEFICIAMENTO</td>
                              <td className="p-3 text-right text-sky-900">{analiseBenCapa.parametros.totalFolhas.toLocaleString('pt-BR')}</td>
                              <td className="p-3 text-center text-sky-900">{analiseBenCapa.totais.setup}</td>
                              <td className="p-3 text-center pr-4 text-sky-900">{analiseBenCapa.totais.total}</td>
                            </tr>
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 🔥 3.5 EMPASTAMENTO DE CAPA DURA */}
            {exigeEmpastamento && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 overflow-hidden border-l-4 border-l-orange-500">
                <div className="bg-orange-50/50 border-b border-slate-200 p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSecao('empastCapa')}>
                  <h3 className="text-sm font-bold uppercase text-orange-950 flex items-center gap-2"><span className="bg-orange-500 text-white w-6 h-6 flex items-center justify-center rounded text-xs"><i className="fas fa-book"></i></span> Empastamento (Capa Dura)</h3>
                  
                  <div className="flex items-center gap-4 relative">
                    <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'empCapa' ? null : 'empCapa'); }} className="text-slate-400 hover:text-orange-600 text-lg transition-colors">
                      <i className="fas fa-info-circle"></i>
                    </button>
                    {/* TOOLTIP CENTRALIZADO PADRÃO */}
                    {tooltipAtivo === 'empCapa' && (
                      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-orange-700 leading-relaxed animate-in zoom-in-95 duration-150 cursor-default" onClick={(e) => e.stopPropagation()}>
                        <div className="border-b border-orange-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase tracking-wider text-orange-400 font-mono text-[11px]">Memorial de Cálculo: Empastamento</h4><button onClick={() => setTooltipAtivo(null)} className="text-gray-400 hover:text-white font-bold">X</button></div>
                        <div className="space-y-3 text-slate-300 font-normal normal-case">
                          <p>O sistema identificou uma Capa do tipo **DURA**. Esse setor calcula o tempo necessário para colar a capa impressa na chapa de papelão Paraná.</p>
                          <p>A matemática calcula <strong>capa a capa</strong>, baseando-se na tiragem com quebra necessária para montagem.</p>
                        </div>
                      </div>
                    )}
                    <i className={`fas fa-chevron-${secoes.empastCapa ? 'up' : 'down'} text-orange-500`}></i>
                  </div>
                </div>

                {secoes.empastCapa && (
                  <div className="p-4">
                    <select value={idMaquinaEmpastamentoCapa} onChange={(e) => setIdMaquinaEmpastamentoCapa(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                      <option value="">Selecione a Empastadeira...</option>
                      {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('empastamento')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                    </select>
                    
                    {analiseEmpCapa && (
                      <>
                        <div className="bg-orange-50 border border-orange-100 p-2.5 rounded text-xs flex gap-6 font-bold text-orange-900 uppercase tracking-wide">
                          <span>Produtividade: <span className="text-orange-700 font-mono">{analiseEmpCapa.parametros.velocidade.toLocaleString('pt-BR')} capas/h</span></span>
                          <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseEmpCapa.maquinaSetupStr}</span></span>
                        </div>

                        <table className="w-full text-left border-collapse text-sm border border-slate-200 mt-4 bg-white">
                          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                            <tr>
                              <th className="p-2 pl-4">Estrutura Empastada</th>
                              <th className="p-2 text-right">Tiragem Comercial</th>
                              <th className="p-2 text-right">Qtd c/ Quebra</th>
                              <th className="p-2 text-right">Capas Processadas</th>
                              <th className="p-2 text-center">Setup</th>
                              <th className="p-2 text-center pr-4">Total Linha</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-slate-700 text-xs">
                            {analiseEmpCapa.linhas.map((l, i) => (
                              <tr key={i}>
                                <td className="p-2 pl-4 text-[10px] truncate max-w-[200px]">{l.tipo}</td>
                                <td className="p-2 text-right">{l.tiragem.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-right text-orange-700 font-bold">{l.cQuebra.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-right">{l.capasProcessadas.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-center">{l.setupTime}</td>
                                <td className="p-2 text-center pr-4 font-bold text-slate-900">{l.total}</td>
                              </tr>
                            ))}
                            <tr className="bg-orange-100/50 font-bold border-t-2 border-slate-200">
                              <td className="p-3 pl-4 uppercase font-sans text-xs" colSpan={3}>TOTAL EMPASTAMENTO</td>
                              <td className="p-3 text-right text-orange-900">{analiseEmpCapa.parametros.totalCapas.toLocaleString('pt-BR')} un.</td>
                              <td className="p-3 text-center text-orange-900">{analiseEmpCapa.totais.setup}</td>
                              <td className="p-3 text-center pr-4 text-orange-900">{analiseEmpCapa.totais.total}</td>
                            </tr>
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 4. ALCEAMENTO / COLA */}
            {exigeAlceamento && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSecao('alceamento')}>
                  <h3 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-2"><span className="bg-slate-800 text-white w-6 h-6 flex items-center justify-center rounded text-xs">4</span> Alceamento / Cola {acabamento.includes('PUR') ? '(Cura: +1 dia)' : ''}</h3>
                  
                  <div className="flex items-center gap-4 relative">
                    <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'alceamento' ? null : 'alceamento'); }} className="text-slate-400 hover:text-blue-600 text-lg transition-colors">
                      <i className="fas fa-info-circle"></i>
                    </button>
                    {/* TOOLTIP CENTRALIZADO PADRÃO */}
                    {tooltipAtivo === 'alceamento' && (
                      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-slate-700 leading-relaxed animate-in zoom-in-95 duration-150 cursor-default" onClick={(e) => e.stopPropagation()}>
                        <div className="border-b border-slate-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase tracking-wider text-amber-400 font-mono text-[11px]">Memorial de Cálculo: Alceadeira</h4><button onClick={() => setTooltipAtivo(null)} className="text-gray-400 hover:text-white font-bold">X</button></div>
                        <div className="space-y-3 text-slate-300 font-normal normal-case">
                          <p><strong>1. A Lógica de Gavetas vs Tombos:</strong> A alceadeira escolhida possui <strong>{analiseAlceamento?.parametros.gavetas} gavetas</strong>. Se o livro gerou mais cadernos do que a máquina tem de gavetas, o lote precisará de mais de uma passada (tombos) para formar o bloco: <strong>{analiseAlceamento?.parametros.entradas} entrada(s)</strong> estimadas.</p>
                          <p><strong>2. Cronoanálise:</strong> O Setup unitário ({analiseAlceamento?.parametros.setupUnitario}) é multiplicado pelas entradas necessárias. A rodagem divide a tiragem produzida com perdas multiplicada pelo número de entradas, pela velocidade da esteira.</p>
                        </div>
                      </div>
                    )}
                    <i className={`fas fa-chevron-${secoes.alceamento ? 'up' : 'down'} text-slate-500`}></i>
                  </div>
                </div>
                
                {secoes.alceamento && (
                  <div className="p-4">
                    <select value={idMaquinaAlceadeira} onChange={(e) => setIdMaquinaAlceadeira(e.target.value)} disabled={!analiseImpressao} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                      <option value="">Selecione a alceadeira/coladeira...</option>
                      {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('alceadeira') || String(m.tipo || '').toLowerCase().includes('pur') || String(m.tipo || '').toLowerCase().includes('cola')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                    </select>
                    
                    {analiseAlceamento && (
                      <>
                        <div className="bg-slate-50 border border-slate-200 p-2.5 rounded text-xs flex gap-6 font-bold text-slate-600 uppercase tracking-wide">
                          <span>Produtividade: <span className="text-purple-700 font-mono">{analiseAlceamento.parametros.velocidade.toLocaleString('pt-BR')} un/h</span></span>
                          <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseAlceamento.maquinaSetupStr}</span></span>
                          <span>Volume de Livros: <span className="text-slate-900 font-mono">{analiseAlceamento.parametros.livrosAlceados.toLocaleString('pt-BR')} un.</span></span>
                        </div>
                        
                        <table className="w-full text-left border-collapse text-sm border border-slate-200 mt-4 bg-white">
                          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                            <tr>
                              <th className="p-2 pl-4">Setor</th>
                              <th className="p-2 text-right">Passadas (Tombos)</th>
                              <th className="p-2 text-center">Setup</th>
                              <th className="p-2 text-center">Rodagem</th>
                              <th className="p-2 text-center pr-4">Total Final</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono text-slate-700 text-xs">
                            <tr className="bg-purple-50/30 font-bold border-t border-slate-200">
                              <td className="p-3 pl-4 font-sans uppercase text-xs">Total Alceamento</td>
                              <td className="p-3 text-right">{analiseAlceamento.parametros.entradas}x</td>
                              <td className="p-3 text-center">{analiseAlceamento.totais.setup}</td>
                              <td className="p-3 text-center">{analiseAlceamento.totais.rodagem}</td>
                              <td className="p-3 text-center pr-4 text-purple-900">{analiseAlceamento.totais.total}</td>
                            </tr>
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 5. CANOAS / GRAMPO */}
            {exigeGrampo && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSecao('grampo')}>
                  <h3 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-2"><span className="bg-slate-800 text-white w-6 h-6 flex items-center justify-center rounded text-xs">5</span> Grampo / Canoa</h3>
                  
                  <div className="flex items-center gap-4 relative">
                    <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'grampo' ? null : 'grampo'); }} className="text-slate-400 hover:text-blue-600 text-lg transition-colors">
                      <i className="fas fa-info-circle"></i>
                    </button>
                    {/* TOOLTIP CENTRALIZADO PADRÃO */}
                    {tooltipAtivo === 'grampo' && (
                      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-slate-700 leading-relaxed animate-in zoom-in-95 duration-150 cursor-default" onClick={(e) => e.stopPropagation()}>
                        <div className="border-b border-slate-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase tracking-wider text-amber-400 font-mono text-[11px]">Memorial de Cálculo: Grampo</h4><button onClick={() => setTooltipAtivo(null)} className="text-gray-400 hover:text-white font-bold">X</button></div>
                        <div className="space-y-3 text-slate-300 font-normal normal-case">
                          <p><strong>1. Quando se aplica a Canoa?</strong> Este setor é ativado porque o acabamento do material exige grampos em revistas (Canoa).</p>
                          <p><strong>2. Divisão de Gavetas:</strong> A grampeadeira possui <strong>{analiseGrampo?.parametros.gavetas} gavetas</strong>. A quantidade de cadernos totais gerada é cruzada com a capacidade, resultando em <strong>{analiseGrampo?.parametros.entradas} tombos de máquina</strong>.</p>
                        </div>
                      </div>
                    )}
                    <i className={`fas fa-chevron-${secoes.grampo ? 'up' : 'down'} text-slate-500`}></i>
                  </div>
                </div>

                {secoes.grampo && (
                  <div className="p-4">
                    <select value={idMaquinaGrampo} onChange={(e) => setIdMaquinaGrampo(e.target.value)} disabled={!analiseImpressao} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                      <option value="">Selecione a grampeadeira...</option>
                      {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('grampo') || String(m.tipo || '').toLowerCase().includes('canoa')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                    </select>
                    
                    {analiseGrampo && (
                      <>
                        <div className="bg-slate-50 border border-slate-200 p-2.5 rounded text-xs flex gap-6 font-bold text-slate-600 uppercase tracking-wide">
                          <span>Produtividade: <span className="text-emerald-700 font-mono">{analiseGrampo.parametros.velocidade.toLocaleString('pt-BR')} un/h</span></span>
                          <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseGrampo.maquinaSetupStr}</span></span>
                          <span>Volume de Livros: <span className="text-slate-900 font-mono">{analiseGrampo.parametros.livrosGrampeados.toLocaleString('pt-BR')} un.</span></span>
                        </div>

                        <table className="w-full text-left border-collapse text-sm border border-slate-200 mt-4 bg-white">
                          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                            <tr>
                              <th className="p-2 pl-4">Setor</th>
                              <th className="p-2 text-right">Passadas (Tombos)</th>
                              <th className="p-2 text-center">Setup</th>
                              <th className="p-2 text-center">Rodagem</th>
                              <th className="p-2 text-center pr-4">Total Final</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono text-slate-700 text-xs">
                            <tr className="bg-emerald-50/30 font-bold border-t border-slate-200">
                              <td className="p-3 pl-4 font-sans uppercase text-xs">Total Grampo</td>
                              <td className="p-3 text-right">{analiseGrampo.parametros.entradas}x</td>
                              <td className="p-3 text-center">{analiseGrampo.totais.setup}</td>
                              <td className="p-3 text-center">{analiseGrampo.totais.rodagem}</td>
                              <td className="p-3 text-center pr-4 text-emerald-900">{analiseGrampo.totais.total}</td>
                            </tr>
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 6. FURAÇÃO / ESPIRAL */}
            {exigeEspiral && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSecao('espiral')}>
                  <h3 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-2"><span className="bg-slate-800 text-white w-6 h-6 flex items-center justify-center rounded text-xs">6</span> Furação e Espiralação</h3>
                  
                  <div className="flex items-center gap-4 relative">
                    <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'espiral' ? null : 'espiral'); }} className="text-slate-400 hover:text-blue-600 text-lg transition-colors">
                      <i className="fas fa-info-circle"></i>
                    </button>
                    {/* TOOLTIP CENTRALIZADO PADRÃO */}
                    {tooltipAtivo === 'espiral' && (
                      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-slate-700 leading-relaxed animate-in zoom-in-95 duration-150 cursor-default" onClick={(e) => e.stopPropagation()}>
                        <div className="border-b border-slate-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase tracking-wider text-amber-400 font-mono text-[11px]">Memorial de Cálculo: Espiral</h4><button onClick={() => setTooltipAtivo(null)} className="text-gray-400 hover:text-white font-bold">X</button></div>
                        <div className="space-y-3 text-slate-300 font-normal normal-case">
                          <p><strong>1. Furação Manual/Semi:</strong> Se a máquina de furo selecionada exigir operação manual, calcula-se multiplicando o Total de Páginas pela Tiragem com Quebras, para encontrar a carga total de batidas.</p>
                          <p><strong>2. Espiralação Automática:</strong> O cálculo de velocidade divide os ciclos da garra pela quantidade de mordidas necessárias com base na espessura da <strong>Lombada ({osAtual.lombada}mm)</strong> e cruzado com a Trava Mecânica da máquina.</p>
                        </div>
                      </div>
                    )}
                    <i className={`fas fa-chevron-${secoes.espiral ? 'up' : 'down'} text-slate-500`}></i>
                  </div>
                </div>

                {secoes.espiral && (
                  <div className="p-4 grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Máquina Furação (Opcional)</label>
                      <select value={idMaquinaFuracao} onChange={(e) => setIdMaquinaFuracao(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white">
                        <option value="">Selecione a furação...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('espiral') || String(m.tipo || '').toLowerCase().includes('fura')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Máquina Espiral/Wire-o</label>
                      <select value={idMaquinaEspiral} onChange={(e) => setIdMaquinaEspiral(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white">
                        <option value="">Selecione a espiralação...</option>
                        {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('espiral') || String(m.tipo || '').toLowerCase().includes('wire')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo} (Até {mq.limite_lombada || 0}mm)</option>)}
                      </select>
                    </div>

                    {analiseEspiral && (
                      <div className="col-span-2 mt-2">
                        <div className="bg-slate-50 border border-slate-200 p-2.5 rounded text-xs flex gap-6 font-bold text-slate-600 uppercase tracking-wide mb-4">
                          <span>
                            Veloc. Espiral Estimada: <span className={`font-mono ${analiseEspiral.parametros.hitLimit ? 'text-rose-600' : 'text-emerald-700'}`}>{analiseEspiral.parametros.velEspiral.toLocaleString('pt-BR')} un/h</span>
                            {analiseEspiral.parametros.hitLimit && <span className="text-[9px] text-rose-500 ml-1">(Travado no Limite)</span>}
                            {analiseEspiral.parametros.falhaJson && <span className="text-[9px] text-amber-500 ml-1" title="Sem cadastro de divisão/ciclos, usando Produtividade Padrão">(S/ Cadastro de Ciclos)</span>}
                          </span>
                          <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseEspiral.maquinaSetupStr}</span></span>
                          <span>Volume Final: <span className="text-slate-900 font-mono">{analiseEspiral.parametros.livrosEspiralados.toLocaleString('pt-BR')} un.</span></span>
                        </div>

                        <table className="w-full text-left border-collapse text-sm border border-slate-200 bg-white">
                          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                            <tr>
                              <th className="p-2 pl-4">Etapa Analisada</th>
                              <th className="p-2 text-center">Velocidade Aplicada</th>
                              <th className="p-2 text-center pr-4">Tempo Estimado</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono text-slate-700 text-xs">
                            <tr className="border-b border-slate-200">
                              <td className="p-3 pl-4 font-sans text-slate-700">Furação {analiseEspiral.parametros.exigeFuracaoManual ? 'Manual/Semi' : 'Automática/Em Linha'}</td>
                              <td className="p-3 text-center">{analiseEspiral.parametros.exigeFuracaoManual ? `${analiseEspiral.parametros.velFuracao.toLocaleString()} pgs/h` : '-'}</td>
                              <td className="p-3 text-center pr-4 font-bold">{analiseEspiral.totais.furacao}</td>
                            </tr>
                            <tr className="border-b border-slate-200">
                              <td className="p-3 pl-4 font-sans text-slate-700">Fechamento Espiral/Wire (Lim. Lomb: {analiseEspiral.parametros.limiteLombada || '0'}mm)</td>
                              <td className="p-3 text-center">{analiseEspiral.parametros.velEspiral.toLocaleString()} un/h</td>
                              <td className="p-3 text-center pr-4 font-bold">{analiseEspiral.totais.espiral}</td>
                            </tr>
                            <tr className="bg-emerald-50/30 font-bold border-t border-slate-200">
                              <td className="p-3 pl-4 font-sans uppercase text-xs text-emerald-900" colSpan={2}>Soma Total do Setor</td>
                              <td className="p-3 text-center pr-4 text-emerald-900">{analiseEspiral.totais.total}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 7. CORTE E VINCO */}
            {exigeCorteVinco && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 overflow-hidden border-l-4 border-l-red-500">
                <div className="bg-red-50/50 border-b border-slate-200 p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSecao('corteVinco')}>
                  <h3 className="text-sm font-bold uppercase text-red-950 flex items-center gap-2"><span className="bg-red-500 text-white w-6 h-6 flex items-center justify-center rounded text-xs">7</span> Corte e Vinco (Encartes)</h3>
                  
                  <div className="flex items-center gap-4 relative">
                    <button onClick={(e) => { e.stopPropagation(); setTooltipAtivo(tooltipAtivo === 'corteVinco' ? null : 'corteVinco'); }} className="text-slate-400 hover:text-red-600 text-lg transition-colors">
                      <i className="fas fa-info-circle"></i>
                    </button>
                    {/* TOOLTIP CENTRALIZADO PADRÃO */}
                    {tooltipAtivo === 'corteVinco' && (
                      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] bg-slate-950 text-white text-xs rounded-lg shadow-xl p-5 z-[9500] border border-red-700 leading-relaxed animate-in zoom-in-95 duration-150 cursor-default" onClick={(e) => e.stopPropagation()}>
                        <div className="border-b border-red-700 pb-2 mb-3 flex justify-between items-center"><h4 className="font-bold uppercase tracking-wider text-red-400 font-mono text-[11px]">Memorial de Cálculo: Corte e Vinco</h4><button onClick={() => setTooltipAtivo(null)} className="text-gray-400 hover:text-white font-bold">X</button></div>
                        <div className="space-y-3 text-slate-300 font-normal normal-case">
                          <p>O sistema identificou a flag "Sim" na coluna de Corte e Vinco dos Encartes/Adesivos. Ele recuperou exatamente o volume de folhas gerado na impressão dessas peças para processar o corte na velocidade parametrizada.</p>
                        </div>
                      </div>
                    )}
                    <i className={`fas fa-chevron-${secoes.corteVinco ? 'up' : 'down'} text-red-500`}></i>
                  </div>
                </div>

                {secoes.corteVinco && (
                  <div className="p-4">
                    <select value={idMaquinaCorteVinco} onChange={(e) => setIdMaquinaCorteVinco(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 bg-white mb-3">
                      <option value="">Selecione o equipamento de corte e vinco...</option>
                      {maquinasCargadas.filter(m => String(m.tipo || '').toLowerCase().includes('corte')).map(mq => <option key={mq.id} value={mq.id}>{mq.modelo}</option>)}
                    </select>
                    
                    {analiseCorteVinco && (
                      <>
                        <div className="bg-red-50 border border-red-100 p-2.5 rounded text-xs flex gap-6 font-bold text-red-900 uppercase tracking-wide">
                          <span>Produtividade: <span className="text-red-700 font-mono">{analiseCorteVinco.parametros.velocidade.toLocaleString('pt-BR')} fls/h</span></span>
                          <span>Tempo de Setup Unitário: <span className="text-amber-700 font-mono">{analiseCorteVinco.maquinaSetupStr}</span></span>
                        </div>

                        <table className="w-full text-left border-collapse text-sm border border-slate-200 mt-4 bg-white">
                          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                            <tr>
                              <th className="p-2 pl-4">Tipo Processado</th>
                              <th className="p-2 text-right">Folhas na Máquina</th>
                              <th className="p-2 text-center">Setup</th>
                              <th className="p-2 text-center pr-4">Total Linha</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-slate-700 text-xs">
                            {analiseCorteVinco.linhas.map((l, i) => (
                              <tr key={i}>
                                <td className="p-2 pl-4 text-[10px] uppercase font-bold">{l.tipo}</td>
                                <td className="p-2 text-right">{l.folhas.toLocaleString('pt-BR')}</td>
                                <td className="p-2 text-center">{l.setupTime}</td>
                                <td className="p-2 text-center pr-4 font-bold text-slate-900">{l.total}</td>
                              </tr>
                            ))}
                            <tr className="bg-red-100/50 font-bold border-t-2 border-slate-200">
                              <td className="p-3 pl-4 uppercase font-sans text-xs">TOTAL CORTE E VINCO</td>
                              <td className="p-3 text-right text-red-900">{analiseCorteVinco.parametros.totalFolhas.toLocaleString('pt-BR')}</td>
                              <td className="p-3 text-center text-red-900">{analiseCorteVinco.totais.setup}</td>
                              <td className="p-3 text-center pr-4 text-red-900">{analiseCorteVinco.totais.total}</td>
                            </tr>
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* BOTÃO GRAVAR (ATUALIZADO) */}
            <div className="flex justify-end mt-6">
              <button onClick={() => salvarOSNoBanco(analiseImpressao, analiseImpCapa, analiseBenCapa, analiseEmpCapa, analiseImpEncarte, analiseImpAdesivo, analiseCorteVinco, analiseDobra, analiseAlceamento, analiseGrampo, analiseEspiral)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-md shadow-md flex items-center gap-2 text-sm uppercase tracking-wide"><i className="fas fa-save"></i> Gravar Engenharia da O.S.</button>
            </div>

          </div>
        );
      })()}

    </div>
  );
}