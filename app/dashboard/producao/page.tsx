"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';

interface Lote {
  filtro_producao: string;
  grafica: string;
  total_skus: number;
  tiragem_total: number | string;
  status_calculado: boolean;
}

interface SkuDetalhe {
  sku_miolo: string;
  descricao: string | null;
  tiragem: string | number | null;
  paginacao: string | number | null;
  dt_calculo: string | null;
  dt_plan_inicio_imp: string | null;
  dt_replan_inicio_imp: string | null;
  dt_fim_aprove_arquivo: string | null;
  dt_envio_tiragem: string | null;
  tem_calculo: boolean;
}

interface RaioX {
  miolo: any;
  datas: any;
  capas: any[];
  encartes: any[];
  kits: any[];
  tem_calculo: boolean;
}

interface KitItem {
  id?: number;          // ausente = SKU adicionado agora (ainda não salvo)
  sku: string | null;
  sku_miolo?: string | null;
  descricao?: string | null;
}

interface KitEdicao {
  kit: any;             // dados gerais (id_codigo_kit, id_descricao_kit, espessura_kit_mm, ...)
  itens: KitItem[];
  opcoes: KitItem[];    // SKUs do lote disponíveis para adicionar
  tem_calculo: boolean;
}

type AbaRaioX = 'miolo' | 'capas' | 'encartes' | 'datas';
type ModalTipo = null | 'excluir' | 'duplicar' | 'aviso' | 'editar';

const chaveLote = (l: { filtro_producao: string; grafica: string }) => `${l.filtro_producao}|${l.grafica}`;

// Converte DD/MM/AA, DD/MM/AAAA ou AAAA-MM-DD em AAAA-MM-DD ('' se inválida).
const paraDataInput = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) { const [, y, mo, d] = m; return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  return '';
};

// Regra do Início Imp. automático: 5º dia útil (seg–sex) após a maior data entre
// Fim Aprov. Arquivo e Envio Tiragem. Mesma regra do fallback do Gantt (api/producao/gantt).
const DIAS_UTEIS_INICIO_IMP = 5;
const calcularInicioImp = (fimAprov: string | null | undefined, envioTiragem: string | null | undefined): string => {
  const base = [paraDataInput(fimAprov), paraDataInput(envioTiragem)].filter(Boolean).sort().pop();
  if (!base) return '';
  const d = new Date(`${base}T00:00:00Z`);
  let uteis = 0;
  while (uteis < DIAS_UTEIS_INICIO_IMP) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) uteis++;
  }
  return d.toISOString().slice(0, 10);
};

const GABARITO_UNIFICADO = "FILTRO_PRODUCAO;GRAFICA;ID_CODIGO_KIT;ID_DESCRICAO_KIT;ESPESSURA_KIT_MM;QNT_SKUS;TIPO_KIT;COM_SHRINK;TIRAGEM_KIT;SKU_CAPA;DESCRICAO_CAPA;CORES_CAPA;PAGINACAO_CAPA;TIPO_CAPA;BENEFICIAMENTO_CAPA;TIRAGEM_CAPA;SKU_MIOLO;DESCRICAO_MIOLO;TAMANHO_LOMBADA;PAGINACAO_MIOLO;ACABAMENTO_LIVRO;PAGINACAO_ENCARTE;CORTE_VINCO_ENCARTE;PAGINACAO_ADESIVO;CORTE_VINCO_ADESIVO;TIRAGEM_MIOLOS;DT_FIM_APROVE_ARQUIVO;DT_ENVIO_TIRAGEM;DT_PLAN_INICIO_IMP";

export default function GestaoProducao() {
  const router = useRouter();
  const [feedback, setFeedback] = useState({ msg: '', tipo: '' });
  const [loading, setLoading] = useState(false);

  // VIEW PRINCIPAL
  const [viewAtiva, setViewAtiva] = useState<'importar' | 'lotes'>('importar');

  const [arquivoNome, setArquivoNome] = useState('');
  const [dadosPreview, setDadosPreview] = useState<any[]>([]);
  const [dadosParaEnviar, setDadosParaEnviar] = useState<any[]>([]);

  // ESTADOS DA GESTÃO DE LOTES
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [modalTipo, setModalTipo] = useState<ModalTipo>(null);
  const [loteAtivo, setLoteAtivo] = useState<Lote | null>(null);
  const [limparCalculos, setLimparCalculos] = useState(false);
  
  const [formNome, setFormNome] = useState('');
  const [formGrafica, setFormGrafica] = useState('');
  const [formTiragem, setFormTiragem] = useState('');
  const [formDuplicarNome, setFormDuplicarNome] = useState('');

  const [filtroGrafica, setFiltroGrafica] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  // AÇÕES EM MASSA
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [massaModal, setMassaModal] = useState<null | 'excluir' | 'duplicar'>(null);
  const [sufixoMassa, setSufixoMassa] = useState('- CÓPIA');

  // MODAL DE KIT
  const [kitEdicao, setKitEdicao] = useState<KitEdicao | null>(null);
  const [kitOriginal, setKitOriginal] = useState<KitEdicao | null>(null);
  const [kitCodigoAberto, setKitCodigoAberto] = useState<string | null>(null);
  const [loadingKit, setLoadingKit] = useState(false);
  const [kitNovoSku, setKitNovoSku] = useState('');

  // DRILL-DOWN
  const [loteExpandido, setLoteExpandido] = useState<Lote | null>(null);
  const [skus, setSkus] = useState<SkuDetalhe[]>([]);
  const [kitsLote, setKitsLote] = useState<any[]>([]);
  const [loadingSkus, setLoadingSkus] = useState(false);
  const [abaLote, setAbaLote] = useState<'produtos' | 'kits'>('produtos');

  // DUPLICAR SKU
  const [duplicarAlvo, setDuplicarAlvo] = useState<SkuDetalhe | null>(null);
  const [duplicarNome, setDuplicarNome] = useState('');

  // EDIÇÃO RAIO-X
  const [skuModalAberto, setSkuModalAberto] = useState(false);
  const [skuBase, setSkuBase] = useState<SkuDetalhe | null>(null);
  const [raioX, setRaioX] = useState<RaioX | null>(null);
  const [raioXOriginal, setRaioXOriginal] = useState<RaioX | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [abaRaioX, setAbaRaioX] = useState<AbaRaioX>('miolo');

  // EXCLUIR / MOVER SKU
  const [skuExcluirAlvo, setSkuExcluirAlvo] = useState<SkuDetalhe | null>(null);
  const [moverAlvo, setMoverAlvo] = useState<SkuDetalhe | null>(null);
  const [moverNome, setMoverNome] = useState('');

  const mostrarAviso = (msg: string, tipo: 'sucesso' | 'erro') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: '' }), tipo === 'erro' ? 15000 : 6000);
  };

  const baixarGabarito = () => {
    const blob = new Blob(["\uFEFF" + GABARITO_UNIFICADO], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Gabarito_Planilha_Mestra.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArquivoNome(file.name);
    setLoading(true);

    Papa.parse(file, {
      header: true, // Agora lemos o CSV gerando objetos com chaves iguais ao cabeçalho
      skipEmptyLines: true,
      encoding: "ISO-8859-1", 
      complete: (results) => {
        const linhas = results.data;
        
        if (!linhas || linhas.length === 0) {
          mostrarAviso("Arquivo vazio ou sem dados.", "erro");
          setLoading(false);
          return;
        }

        setDadosParaEnviar(linhas);
        setDadosPreview(linhas.slice(0, 10)); 
        setLoading(false);
      },
      error: (err) => {
        mostrarAviso(`Erro ao ler CSV: ${err.message}`, "erro");
        setLoading(false);
      }
    });
  };

  const importarDados = async () => {
    if (dadosParaEnviar.length === 0) return;
    setLoading(true);

    try {
      const res = await fetch('/api/importacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dados: dadosParaEnviar })
      });

      const data = await res.json();

      if (res.ok) {
        mostrarAviso(data.message, 'sucesso');
        setArquivoNome('');
        setDadosPreview([]);
        setDadosParaEnviar([]);
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      } else {
        mostrarAviso(data.error || data.message || 'Erro ao importar.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao tentar importar.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  // ===================== GESTÃO DE LOTES E RESTANTE (INALTERADO) =====================
  const carregarLotes = async () => {
    setLoadingLotes(true);
    try {
      const res = await fetch('/api/producao/gestao-lotes');
      const data = await res.json();
      if (res.ok) {
        setLotes(Array.isArray(data) ? data : []);
      } else {
        mostrarAviso(data.message || 'Erro ao carregar lotes.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao carregar lotes.', 'erro');
    } finally {
      setLoadingLotes(false);
    }
  };

  useEffect(() => {
    if (viewAtiva === 'lotes') carregarLotes();
  }, [viewAtiva]);

  const fecharModal = () => {
    setModalTipo(null);
    setLoteAtivo(null);
    setLimparCalculos(false);
    setFormNome('');
    setFormGrafica('');
    setFormTiragem('');
    setFormDuplicarNome('');
  };

  const formatarNumero = (val: number | string) => (Number(val) || 0).toLocaleString('pt-BR');

  const abrirExcluir = (lote: Lote) => { setLoteAtivo(lote); setModalTipo('excluir'); };

  const confirmarExcluir = async () => {
    if (!loteAtivo) return;
    setLoading(true);
    try {
      const res = await fetch('/api/producao/gestao-lotes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filtro_producao: loteAtivo.filtro_producao, grafica: loteAtivo.grafica })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAviso(data.message || 'Lote apagado com sucesso!', 'sucesso');
        fecharModal();
        carregarLotes();
      } else {
        mostrarAviso(data.message || 'Erro ao excluir lote.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao excluir lote.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  const abrirDuplicar = (lote: Lote) => { setLoteAtivo(lote); setFormDuplicarNome(''); setModalTipo('duplicar'); };

  const confirmarDuplicar = async () => {
    if (!loteAtivo) return;
    if (!formDuplicarNome.trim()) { mostrarAviso('Informe o novo nome do lote.', 'erro'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/producao/gestao-lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filtro_producao: loteAtivo.filtro_producao, grafica: loteAtivo.grafica, novo_filtro_producao: formDuplicarNome.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAviso(data.message || 'Lote duplicado!', 'sucesso');
        fecharModal();
        carregarLotes();
      } else {
        mostrarAviso(data.message || 'Erro ao duplicar lote.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao duplicar lote.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  const prepararFormEdicao = (lote: Lote) => { setFormNome(lote.filtro_producao); setFormGrafica(lote.grafica); setFormTiragem(''); };

  const abrirEditar = (lote: Lote) => {
    setLoteAtivo(lote);
    if (lote.status_calculado) { setModalTipo('aviso'); } else { setLimparCalculos(false); prepararFormEdicao(lote); setModalTipo('editar'); }
  };

  const prosseguirAposAviso = () => { if (!loteAtivo) return; setLimparCalculos(true); prepararFormEdicao(loteAtivo); setModalTipo('editar'); };

  const confirmarEditar = async () => {
    if (!loteAtivo) return;
    setLoading(true);
    const body: any = { filtro_producao: loteAtivo.filtro_producao, grafica: loteAtivo.grafica, limpar_calculos: limparCalculos };
    if (formNome.trim()) body.novo_filtro_producao = formNome.trim();
    if (formGrafica.trim()) body.nova_grafica = formGrafica.trim();
    if (formTiragem.trim() !== '') body.nova_tiragem = formTiragem.trim();

    try {
      const res = await fetch('/api/producao/gestao-lotes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAviso(data.message || 'Lote atualizado com sucesso!', 'sucesso');
        fecharModal();
        carregarLotes();
      } else {
        mostrarAviso(data.message || 'Erro ao editar lote.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao editar lote.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  // ===================== AÇÕES EM MASSA =====================
  const lotesSelecionados = (): Lote[] => lotesFiltrados.filter(l => selecionados.has(chaveLote(l)));

  const alternarSelecao = (lote: Lote) => setSelecionados(s => {
    const n = new Set(s);
    const k = chaveLote(lote);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const alternarTodos = () => setSelecionados(s => {
    const todosMarcados = lotesFiltrados.length > 0 && lotesFiltrados.every(l => s.has(chaveLote(l)));
    const n = new Set(s);
    lotesFiltrados.forEach(l => { if (todosMarcados) n.delete(chaveLote(l)); else n.add(chaveLote(l)); });
    return n;
  });

  const executarMassa = async () => {
    const alvo = lotesSelecionados();
    if (!massaModal || alvo.length === 0) return;
    setLoading(true);
    const lotesBody = alvo.map(l => ({ filtro_producao: l.filtro_producao, grafica: l.grafica }));
    try {
      const res = await fetch('/api/producao/gestao-lotes', {
        method: massaModal === 'excluir' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(massaModal === 'excluir' ? { lotes: lotesBody } : { lotes: lotesBody, sufixo: sufixoMassa.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAviso(data.message || 'Operação concluída!', 'sucesso');
        setMassaModal(null);
        setSelecionados(new Set());
        carregarLotes();
      } else {
        mostrarAviso(data.message || 'Erro na operação em massa.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede na operação em massa.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  const forceDateInputFormat = paraDataInput;

  const fmtData = (v: string | null | undefined): string => {
    const d = forceDateInputFormat(v);
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  const carregarSkus = async (lote: Lote) => {
    setLoadingSkus(true);
    try {
      const params = new URLSearchParams({ filtro: lote.filtro_producao, grafica: lote.grafica });
      const res = await fetch(`/api/producao/gestao-lotes/detalhes?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setSkus(Array.isArray(data?.produtos) ? data.produtos : []);
        setKitsLote(Array.isArray(data?.kits) ? data.kits : []);
      } else {
        mostrarAviso(data.message || 'Erro ao carregar SKUs.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao carregar SKUs.', 'erro');
    } finally {
      setLoadingSkus(false);
    }
  };

  const abrirLote = (lote: Lote) => { setLoteExpandido(lote); setAbaLote('produtos'); carregarSkus(lote); };
  const voltarLotes = () => { setLoteExpandido(null); setSkus([]); setKitsLote([]); };

  const assinaturaQtd = (d: RaioX | null): string => {
    if (!d) return '';
    const partes: any[] = [d.miolo?.tiragem, d.miolo?.paginacao];
    (d.capas || []).forEach(c => partes.push(c.tiragem, c.paginacao));
    (d.encartes || []).forEach(e => partes.push(e.tiragem, e.paginacao_encarte, e.paginacao_adesivo));
    (d.kits || []).forEach(k => partes.push(k.tiragem));
    return partes.map(v => (v == null ? '' : String(v).trim())).join('|');
  };

  const quantidadesAlteradas = (): boolean => !!raioX && !!raioXOriginal && assinaturaQtd(raioX) !== assinaturaQtd(raioXOriginal);

  const abrirEditarSku = async (sku: SkuDetalhe) => {
    if (!loteExpandido) return;
    setSkuBase(sku); setAbaRaioX('miolo'); setSkuModalAberto(true); setRaioX(null); setRaioXOriginal(null); setLoadingDetalhe(true);
    try {
      const params = new URLSearchParams({ sku: sku.sku_miolo, filtro: loteExpandido.filtro_producao, grafica: loteExpandido.grafica });
      const res = await fetch(`/api/producao/gestao-lotes/detalhes?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        const datasBrutas = data.datas || {};
        const datasNormalizadas: any = {};
        ['dt_calculo', 'dt_plan_inicio_imp', 'dt_replan_inicio_imp', 'dt_fim_aprove_arquivo', 'dt_envio_tiragem']
          .forEach(k => { datasNormalizadas[k] = forceDateInputFormat(datasBrutas[k]); });
        const normalizado: RaioX = { miolo: data.miolo || {}, datas: datasNormalizadas, capas: Array.isArray(data.capas) ? data.capas : [], encartes: Array.isArray(data.encartes) ? data.encartes : [], kits: [], tem_calculo: !!data.tem_calculo };
        setRaioX(normalizado); setRaioXOriginal(JSON.parse(JSON.stringify(normalizado)));
      } else { mostrarAviso(data.message || 'Erro ao carregar detalhes.', 'erro'); fecharSkuModal(); }
    } catch (error) { mostrarAviso('Erro de rede.', 'erro'); fecharSkuModal(); } finally { setLoadingDetalhe(false); }
  };

  const fecharSkuModal = () => { setSkuModalAberto(false); setSkuBase(null); setRaioX(null); setRaioXOriginal(null); };

  const updMiolo = (campo: string, valor: string) => setRaioX(d => d ? { ...d, miolo: { ...d.miolo, [campo]: valor } } : d);
  const updData = (campo: string, valor: string) => setRaioX(d => d ? { ...d, datas: { ...d.datas, [campo]: valor } } : d);
  const updItem = (tipo: 'capas' | 'encartes' | 'kits', idx: number, campo: string, valor: string) =>
    setRaioX(d => { if (!d) return d; const arr = [...(d[tipo] as any[])]; arr[idx] = { ...arr[idx], [campo]: valor }; return { ...d, [tipo]: arr }; });

  const confirmarEditarSku = async () => {
    if (!skuBase || !raioX || !loteExpandido) return;
    setLoading(true);
    const limpar = raioX.tem_calculo && quantidadesAlteradas();
    // Datas: só o Início Imp. é editável e ele é gravado em dt_calculo (ajuste manual,
    // prioridade máxima no Gantt). Fim Aprov./Envio/Plan/Replan não são reenviados.
    const inicioAlterado = (raioX.datas?.dt_calculo || '') !== (raioXOriginal?.datas?.dt_calculo || '');
    const datas = inicioAlterado ? { dt_calculo: raioX.datas?.dt_calculo || null } : undefined;
    try {
      const res = await fetch('/api/producao/gestao-lotes/detalhes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_miolo: skuBase.sku_miolo, filtro_producao: loteExpandido.filtro_producao, grafica: loteExpandido.grafica, miolo: raioX.miolo, datas, capas: raioX.capas, encartes: raioX.encartes, kits: raioX.kits, limpar_calculo: limpar })
      });
      const data = await res.json();
      if (res.ok) { mostrarAviso(data.message || 'SKU atualizado!', 'sucesso'); fecharSkuModal(); carregarSkus(loteExpandido); } else { mostrarAviso(data.message || 'Erro.', 'erro'); }
    } catch (error) { mostrarAviso('Erro de rede.', 'erro'); } finally { setLoading(false); }
  };

  const confirmarExcluirSku = async () => {
    if (!skuExcluirAlvo || !loteExpandido) return;
    setLoading(true);
    try {
      const res = await fetch('/api/producao/gestao-lotes/detalhes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_miolo: skuExcluirAlvo.sku_miolo, filtro_producao: loteExpandido.filtro_producao, grafica: loteExpandido.grafica })
      });
      const data = await res.json();
      if (res.ok) { mostrarAviso(data.message || 'SKU excluído!', 'sucesso'); setSkuExcluirAlvo(null); carregarSkus(loteExpandido); } else { mostrarAviso(data.message || 'Erro.', 'erro'); }
    } catch (error) { mostrarAviso('Erro de rede.', 'erro'); } finally { setLoading(false); }
  };

  const abrirMoverSku = (sku: SkuDetalhe) => { setMoverAlvo(sku); setMoverNome(''); };
  const confirmarMoverSku = async () => {
    if (!moverAlvo || !loteExpandido) return;
    if (!moverNome.trim()) { mostrarAviso('Informe destino.', 'erro'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/producao/gestao-lotes/detalhes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_miolo: moverAlvo.sku_miolo, filtro_producao_atual: loteExpandido.filtro_producao, grafica: loteExpandido.grafica, novo_filtro_producao: moverNome.trim() })
      });
      const data = await res.json();
      if (res.ok) { mostrarAviso(data.message || 'SKU movido!', 'sucesso'); setMoverAlvo(null); carregarSkus(loteExpandido); } else { mostrarAviso(data.message || 'Erro.', 'erro'); }
    } catch (error) { mostrarAviso('Erro de rede.', 'erro'); } finally { setLoading(false); }
  };

  const abrirDuplicarSku = (sku: SkuDetalhe) => { setDuplicarAlvo(sku); setDuplicarNome(''); };
  const confirmarDuplicarSku = async () => {
    if (!duplicarAlvo || !loteExpandido) return;
    if (!duplicarNome.trim()) { mostrarAviso('Informe novo SKU.', 'erro'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/producao/gestao-lotes/detalhes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_origem: duplicarAlvo.sku_miolo, novo_sku: duplicarNome.trim(), filtro_producao: loteExpandido.filtro_producao, grafica: loteExpandido.grafica })
      });
      const data = await res.json();
      if (res.ok) { mostrarAviso(data.message || 'SKU duplicado!', 'sucesso'); setDuplicarAlvo(null); carregarSkus(loteExpandido); } else { mostrarAviso(data.message || 'Erro.', 'erro'); }
    } catch (error) { mostrarAviso('Erro de rede.', 'erro'); } finally { setLoading(false); }
  };

  // ===================== KITS =====================
  // prod_kits tem uma linha por SKU filho: agrupa por código do kit para a listagem.
  const kitsAgrupados = (() => {
    const mapa = new Map<string, { codigo: string; descricao: string | null; qnt_skus: any; tiragem: any; com_shrink: any; espessura: any; tem_calculo: boolean; itens: { sku: string | null; descricao: string | null }[] }>();
    kitsLote.forEach(k => {
      const cod = String(k.id_codigo_kit ?? '').trim();
      const key = cod.toUpperCase();
      if (!mapa.has(key)) mapa.set(key, { codigo: cod, descricao: null, qnt_skus: null, tiragem: null, com_shrink: null, espessura: null, tem_calculo: false, itens: [] });
      const g = mapa.get(key)!;
      g.descricao ??= k.id_descricao_kit || null;
      g.qnt_skus ??= k.qnt_skus;
      g.tiragem ??= k.tiragem;
      g.com_shrink ??= k.com_shrink || null;
      g.espessura ??= k.espessura_kit_mm || null;
      g.tem_calculo ||= !!k.tem_calculo;
      g.itens.push({ sku: k.id_codigo_sku_capa, descricao: k.item_descricao });
    });
    return Array.from(mapa.values());
  })();

  const abrirKit = async (codigo: string) => {
    if (!loteExpandido) return;
    setKitCodigoAberto(codigo); setKitEdicao(null); setKitOriginal(null); setKitNovoSku(''); setLoadingKit(true);
    try {
      const params = new URLSearchParams({ filtro: loteExpandido.filtro_producao, grafica: loteExpandido.grafica, kit: codigo });
      const res = await fetch(`/api/producao/gestao-lotes/kits?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        const ed: KitEdicao = { kit: data.kit || {}, itens: data.itens || [], opcoes: data.opcoes || [], tem_calculo: !!data.tem_calculo };
        setKitEdicao(ed); setKitOriginal(JSON.parse(JSON.stringify(ed)));
      } else { mostrarAviso(data.message || 'Erro ao carregar kit.', 'erro'); fecharKit(); }
    } catch (error) { mostrarAviso('Erro de rede ao carregar kit.', 'erro'); fecharKit(); } finally { setLoadingKit(false); }
  };

  const fecharKit = () => { setKitCodigoAberto(null); setKitEdicao(null); setKitOriginal(null); setKitNovoSku(''); };

  const updKit = (campo: string, valor: string) => setKitEdicao(k => k ? { ...k, kit: { ...k.kit, [campo]: valor } } : k);

  const normSku = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase();

  const adicionarSkuKit = () => {
    if (!kitEdicao) return;
    const digitado = kitNovoSku.trim();
    if (!digitado) return;
    if (kitEdicao.itens.some(i => normSku(i.sku) === normSku(digitado) || normSku(i.sku_miolo) === normSku(digitado))) {
      mostrarAviso(`O SKU "${digitado}" já está no kit.`, 'erro'); return;
    }
    const opcao = kitEdicao.opcoes.find(o => normSku(o.sku) === normSku(digitado) || normSku(o.sku_miolo) === normSku(digitado));
    // O servidor valida e resolve miolo → capa; aqui é só a pré-visualização.
    setKitEdicao(k => k ? { ...k, itens: [...k.itens, { sku: opcao?.sku ?? digitado, sku_miolo: opcao?.sku_miolo ?? null, descricao: opcao?.descricao ?? null }] } : k);
    setKitNovoSku('');
  };

  const removerSkuKit = (idx: number) => setKitEdicao(k => k ? { ...k, itens: k.itens.filter((_, i) => i !== idx) } : k);

  const CAMPOS_KIT_GERAIS = ['espessura_kit_mm', 'qnt_skus', 'tiragem', 'tipo_kit', 'com_shrink'];
  const kitAfetaCalculo = (): boolean => {
    if (!kitEdicao || !kitOriginal) return false;
    const geraisMudaram = CAMPOS_KIT_GERAIS.some(c => String(kitEdicao.kit[c] ?? '').trim() !== String(kitOriginal.kit[c] ?? '').trim());
    const assinatura = (k: KitEdicao) => k.itens.map(i => `${i.id ?? 'novo'}:${normSku(i.sku)}`).join('|');
    return geraisMudaram || assinatura(kitEdicao) !== assinatura(kitOriginal);
  };

  const confirmarKit = async () => {
    if (!kitEdicao || !loteExpandido) return;
    if (kitEdicao.itens.length === 0) { mostrarAviso('O kit precisa ter pelo menos 1 SKU.', 'erro'); return; }
    setLoading(true);
    const dados: any = {};
    ['id_descricao_kit', ...CAMPOS_KIT_GERAIS].forEach(c => { dados[c] = kitEdicao.kit[c] ?? null; });
    try {
      const res = await fetch('/api/producao/gestao-lotes/kits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filtro_producao: loteExpandido.filtro_producao,
          grafica: loteExpandido.grafica,
          id_codigo_kit: kitEdicao.kit.id_codigo_kit,
          dados,
          itens: kitEdicao.itens.map(i => ({ id: i.id, sku: i.sku })),
          limpar_calculo: kitEdicao.tem_calculo && kitAfetaCalculo(),
        })
      });
      const data = await res.json();
      if (res.ok) { mostrarAviso(data.message || 'Kit atualizado!', 'sucesso'); fecharKit(); carregarSkus(loteExpandido); } else { mostrarAviso(data.message || 'Erro ao salvar kit.', 'erro'); }
    } catch (error) { mostrarAviso('Erro de rede ao salvar kit.', 'erro'); } finally { setLoading(false); }
  };

  const graficasDisponiveis =Array.from(new Set(lotes.map(l => l.grafica).filter(Boolean))).sort();
  const lotesFiltrados = lotes.filter(l => {
    if (filtroGrafica && l.grafica !== filtroGrafica) return false;
    if (filtroStatus === 'calculado' && !l.status_calculado) return false;
    if (filtroStatus === 'aberto' && l.status_calculado) return false;
    return true;
  });

  const CAMPOS_MIOLO = [
    { k: 'descricao', label: 'Descrição', type: 'text' },
    { k: 'tiragem', label: 'Tiragem', type: 'number', qtd: true },
    { k: 'lombada', label: 'Lombada', type: 'text' },
    { k: 'paginacao', label: 'Paginação', type: 'number', qtd: true },
    { k: 'acabamento', label: 'Acabamento', type: 'text' },
  ];
  const CAMPOS_CAPA = [
    { k: 'sku_capa', label: 'SKU Capa', type: 'text', ro: true },
    { k: 'descricao', label: 'Descrição', type: 'text' },
    { k: 'tiragem', label: 'Tiragem', type: 'number', qtd: true },
    { k: 'cores', label: 'Cores', type: 'text' },
    { k: 'paginacao', label: 'Paginação', type: 'number', qtd: true },
    { k: 'acabamento', label: 'Acabamento', type: 'text' },
    { k: 'tamanho_lombada', label: 'Tamanho Lombada', type: 'text' },
    { k: 'sku_ref', label: 'SKU Ref (miolo)', type: 'text', ro: true },
    { k: 'tipo_capa', label: 'Tipo Capa', type: 'text' },
    { k: 'beneficiamento', label: 'Beneficiamento', type: 'text' },
  ];
  const CAMPOS_ENCARTE = [
    { k: 'descricao', label: 'Descrição', type: 'text' },
    { k: 'tiragem', label: 'Tiragem', type: 'number', qtd: true },
    { k: 'paginacao_encarte', label: 'Paginação Encarte', type: 'number', qtd: true },
    { k: 'corte_vinco_encarte', label: 'Corte/Vinco Encarte', type: 'text' },
    { k: 'paginacao_adesivo', label: 'Paginação Adesivo', type: 'number', qtd: true },
    { k: 'corte_vinco_adesivo', label: 'Corte/Vinco Adesivo', type: 'text' },
  ];
  const CAMPOS_KIT = [
    { k: 'id_descricao_kit', label: 'Descrição do Kit', type: 'text', full: true },
    { k: 'espessura_kit_mm', label: 'Espessura (mm)', type: 'text' },
    { k: 'qnt_skus', label: 'Qtd. SKUs', type: 'number' },
    { k: 'tiragem', label: 'Tiragem', type: 'number' },
    { k: 'tipo_kit', label: 'Tipo Kit', type: 'text' },
    { k: 'com_shrink', label: 'Com Shrink', type: 'text' },
  ];

  const qtdSelecionados = lotesFiltrados.filter(l => selecionados.has(chaveLote(l))).length;
  const todosSelecionados = lotesFiltrados.length > 0 && qtdSelecionados === lotesFiltrados.length;

  const inputCls = (ro?: boolean) => `w-full border rounded-lg p-2.5 text-sm font-medium outline-none transition-all ${ro ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-slate-50 text-slate-800 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'}`;

  return (
    <div className="w-full min-h-screen bg-slate-100 font-sans flex flex-col relative">
      
      {feedback.msg && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-9999 w-[90vw] max-w-2xl px-6 py-3 rounded-lg shadow-2xl border flex items-start gap-3 transition-all duration-300
          ${feedback.tipo === 'sucesso' ? 'bg-white border-teal-500 text-teal-700' : 'bg-white border-red-500 text-red-700'}`}>
          <i className={`fas ${feedback.tipo === 'sucesso' ? 'fa-check-circle text-teal-500' : 'fa-times-circle text-red-500'} text-xl mt-0.5 shrink-0`}></i>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-xs uppercase tracking-wider text-slate-800 mb-1">Aviso do Sistema</p>
            <p className="font-medium text-sm wrap-break-word whitespace-pre-wrap">{feedback.msg}</p>
          </div>
          <button onClick={() => setFeedback({ msg: '', tipo: '' })} className="text-slate-400 hover:text-slate-700 shrink-0"><i className="fas fa-times"></i></button>
        </div>
      )}

      <div className="w-full max-w-400 mx-auto px-4 sm:px-8 py-6 min-h-75">
        
        <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Cadastro de Produção</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              {viewAtiva === 'importar' ? 'Importação Mestra Unificada de ordens via CSV' : 'Gerenciamento de lotes já importados (editar, duplicar e excluir)'}
            </p>
          </div>
          {viewAtiva === 'importar' && (
            <button
              onClick={baixarGabarito}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold text-xs uppercase py-2.5 px-5 rounded-lg shadow-sm transition-all flex items-center gap-2 w-max"
            >
              <i className="fas fa-file-download text-violet-500"></i> Baixar Gabarito Mestre
            </button>
          )}
        </header>

        <div className="flex gap-2 mb-6 bg-slate-200/60 p-1.5 rounded-xl w-max">
          <button onClick={() => setViewAtiva('importar')} className={`px-6 py-2.5 rounded-lg font-bold uppercase text-xs transition-all flex items-center gap-2 ${viewAtiva === 'importar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <i className="fas fa-cloud-upload-alt"></i> Importar Novo CSV
          </button>
          <button onClick={() => setViewAtiva('lotes')} className={`px-6 py-2.5 rounded-lg font-bold uppercase text-xs transition-all flex items-center gap-2 ${viewAtiva === 'lotes' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <i className="fas fa-layer-group"></i> Gestão de Lotes
          </button>
        </div>

        {viewAtiva === 'importar' && (
        <main className="w-full space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* PAINEL DE UPLOAD UNIFICADO */}
            <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
              <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center text-lg">
                  <i className="fas fa-file-csv"></i>
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800 uppercase">Planilha Mestra</h2>
                  <p className="text-xs text-slate-500 font-medium">Faça upload do CSV consolidado com Kits, Capas, Miolos e Datas.</p>
                </div>
              </div>

              <label className="w-full relative cursor-pointer flex-1 flex flex-col justify-center min-h-37.5">
                <input id="fileInput" type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                <div className={`w-full h-full flex items-center justify-center border-2 border-dashed rounded-xl p-4 transition-all text-center
                  ${arquivoNome ? 'border-teal-500 bg-teal-50/50' : 'border-slate-300 hover:border-violet-400 hover:bg-slate-50'}`}>
                  {arquivoNome ? (
                    <span className="font-bold text-teal-700 truncate px-2"><i className="fas fa-check mr-2"></i> {arquivoNome}</span>
                  ) : (
                    <span className="font-bold text-slate-500 text-sm"><i className="fas fa-upload block text-2xl mb-2 text-slate-300"></i> Clique para buscar o arquivo</span>
                  )}
                </div>
              </label>

              {dadosParaEnviar.length > 0 && (
                <div className="mt-6 w-full bg-slate-50 rounded-lg border border-slate-200 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total de Linhas:</span>
                    <span className="text-xl font-black text-slate-800">{dadosParaEnviar.length}</span>
                  </div>
                  <button 
                    onClick={importarDados}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg text-xs uppercase font-black shadow-sm shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-upload-alt"></i>}
                    Processar Importação
                  </button>
                </div>
              )}
            </div>

            {/* PAINEL DE PREVIEW DINÂMICO */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-100">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <h3 className="font-black text-slate-700 uppercase tracking-wider text-xs flex items-center gap-2">
                  <i className="fas fa-table text-violet-500"></i> Pré-visualização Mestra
                </h3>
                {dadosPreview.length > 0 && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">Mostrando {dadosPreview.length} amostras</span>}
              </div>
              
              <div className="flex-1 overflow-auto bg-white p-0 custom-scrollbar">
                {dadosPreview.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-20">
                    <i className="fas fa-folder-open text-4xl"></i>
                    <p className="font-bold text-sm">Nenhum arquivo carregado na memória.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider sticky top-0 shadow-sm border-b border-slate-200 z-10">
                        <th className="p-2 border-r border-slate-200 w-10 text-center sticky left-0 bg-slate-50">#</th>
                        {Object.keys(dadosPreview[0]).map((col, idx) => (
                          <th key={idx} className="p-2 border-r border-slate-200 last:border-0 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                      {dadosPreview.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-2 bg-slate-50 font-bold text-slate-400 border-r border-slate-200 text-center sticky left-0">{i + 1}</td>
                          {Object.values(row).map((cell: any, j: number) => (
                            <td key={j} className="p-2 font-medium text-slate-700 border-r border-slate-100 last:border-0 whitespace-nowrap">{String(cell || '-')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        </main>
        )}

        {/* ===================== VIEW: GESTÃO DE LOTES E DRILL-DOWN (MANTIDO 100% INALTERADO) ===================== */}
        {viewAtiva === 'lotes' && !loteExpandido && (
        <main className="w-full">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5 tracking-wider">Gráfica</label>
              <select value={filtroGrafica} onChange={(e) => setFiltroGrafica(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all min-w-45">
                <option value="">Todas as gráficas</option>
                {graficasDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5 tracking-wider">Status</label>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all min-w-40">
                <option value="">Todos os status</option>
                <option value="calculado">Calculado</option>
                <option value="aberto">Aberto</option>
              </select>
            </div>
            {(filtroGrafica || filtroStatus) && (
              <button onClick={() => { setFiltroGrafica(''); setFiltroStatus(''); }} className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1.5 ml-auto">
                <i className="fas fa-times-circle"></i> Limpar filtros
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="font-black text-slate-700 uppercase tracking-wider text-xs flex items-center gap-2"><i className="fas fa-layer-group text-blue-500"></i> Lotes Cadastrados</h3>
              <div className="flex items-center gap-3">
                {!loadingLotes && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">{lotesFiltrados.length} de {lotes.length} lote(s)</span>}
                <button onClick={carregarLotes} disabled={loadingLotes} className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1.5 disabled:opacity-50">
                  <i className={`fas fa-sync-alt ${loadingLotes ? 'fa-spin' : ''}`}></i> Atualizar
                </button>
              </div>
            </div>

            {qtdSelecionados > 0 && (
              <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/70 flex flex-wrap items-center gap-3 transition-all">
                <span className="text-xs font-black uppercase tracking-wider text-blue-700 flex items-center gap-2"><i className="fas fa-check-square"></i> {qtdSelecionados} lote(s) selecionado(s)</span>
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={() => setSelecionados(new Set())} className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1.5 px-2"><i className="fas fa-times"></i> Limpar seleção</button>
                  <button onClick={() => { setSufixoMassa('- CÓPIA'); setMassaModal('duplicar'); }} className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"><i className="fas fa-copy"></i> Duplicar Selecionados</button>
                  <button onClick={() => setMassaModal('excluir')} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm shadow-red-600/20 transition-all flex items-center gap-1.5"><i className="fas fa-trash"></i> Excluir Selecionados</button>
                </div>
              </div>
            )}

            <div className="overflow-auto">
              {loadingLotes ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24">
                  <i className="fas fa-spinner fa-spin text-4xl"></i><p className="font-bold text-sm text-slate-400">Carregando lotes...</p>
                </div>
              ) : lotesFiltrados.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24">
                  <i className="fas fa-box-open text-4xl"></i><p className="font-bold text-sm">{lotes.length === 0 ? 'Nenhum lote cadastrado.' : 'Nenhum lote corresponde aos filtros selecionados.'}</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="p-3 w-px"><input type="checkbox" checked={todosSelecionados} ref={el => { if (el) el.indeterminate = qtdSelecionados > 0 && !todosSelecionados; }} onChange={alternarTodos} title="Selecionar todos" className="w-4 h-4 accent-blue-600 cursor-pointer align-middle" /></th>
                      <th className="p-3">Lote</th><th className="p-3">Gráfica</th><th className="p-3 text-center">Total SKUs</th><th className="p-3 text-right">Tiragem Total</th><th className="p-3 text-center">Status</th><th className="p-3 text-center w-px whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {lotesFiltrados.map((lote, i) => (
                      <tr key={`${lote.filtro_producao}|${lote.grafica}|${i}`} className={`transition-colors ${selecionados.has(chaveLote(lote)) ? 'bg-blue-50/60 hover:bg-blue-50' : 'hover:bg-slate-50/50'}`}>
                        <td className="p-3"><input type="checkbox" checked={selecionados.has(chaveLote(lote))} onChange={() => alternarSelecao(lote)} className="w-4 h-4 accent-blue-600 cursor-pointer align-middle" /></td>
                        <td className="p-3 font-bold text-slate-800">{lote.filtro_producao}</td>
                        <td className="p-3 font-medium text-slate-600">{lote.grafica}</td>
                        <td className="p-3 text-center font-medium text-slate-700">{lote.total_skus}</td>
                        <td className="p-3 text-right font-medium text-slate-700 tabular-nums">{formatarNumero(lote.tiragem_total)}</td>
                        <td className="p-3 text-center">
                          {lote.status_calculado ? (
                            <span className="inline-flex items-center gap-1.5 bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase"><i className="fas fa-check-circle"></i> Calculado</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase"><i className="fas fa-clock"></i> Aberto</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                            <button onClick={() => abrirLote(lote)} className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"><i className="fas fa-search"></i> Ver SKUs</button>
                            <button onClick={() => abrirEditar(lote)} className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"><i className="fas fa-pen"></i> Editar</button>
                            <button onClick={() => abrirDuplicar(lote)} className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"><i className="fas fa-copy"></i> Duplicar</button>
                            <button onClick={() => abrirExcluir(lote)} className="bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"><i className="fas fa-trash"></i> Excluir</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </main>
        )}

        {viewAtiva === 'lotes' && loteExpandido && (
        <main className="w-full">
          <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <button onClick={voltarLotes} className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 px-4 py-2 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-2"><i className="fas fa-arrow-left"></i> Voltar aos Lotes</button>
              <div><h2 className="text-lg font-black text-slate-800">{loteExpandido.filtro_producao}</h2><p className="text-xs text-slate-500 font-medium">Gráfica: {loteExpandido.grafica}</p></div>
            </div>
            <button onClick={() => carregarSkus(loteExpandido)} disabled={loadingSkus} className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1.5 disabled:opacity-50"><i className={`fas fa-sync-alt ${loadingSkus ? 'fa-spin' : ''}`}></i> Atualizar</button>
          </div>

          <div className="flex gap-2 mb-4 bg-slate-200/60 p-1.5 rounded-xl w-max">
            <button onClick={() => setAbaLote('produtos')} className={`px-5 py-2 rounded-lg font-bold uppercase text-xs transition-all flex items-center gap-2 ${abaLote === 'produtos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>📦 Gestão de Produtos <span className="text-[10px] opacity-70">({skus.length})</span></button>
            <button onClick={() => setAbaLote('kits')} className={`px-5 py-2 rounded-lg font-bold uppercase text-xs transition-all flex items-center gap-2 ${abaLote === 'kits' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>🧩 Gestão de Kits <span className="text-[10px] opacity-70">({kitsAgrupados.length})</span></button>
          </div>

          {abaLote === 'produtos' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center"><h3 className="font-black text-slate-700 uppercase tracking-wider text-xs flex items-center gap-2"><i className="fas fa-list-ul text-blue-500"></i> Produtos do Lote</h3>{!loadingSkus && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">{skus.length} SKU(s)</span>}</div>
            <div className="overflow-auto">
              {loadingSkus ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24"><i className="fas fa-spinner fa-spin text-4xl"></i><p className="font-bold text-sm text-slate-400">Carregando SKUs...</p></div>
              ) : skus.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24"><i className="fas fa-box-open text-4xl"></i><p className="font-bold text-sm">Nenhum SKU encontrado neste lote.</p></div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="p-3">SKU</th><th className="p-3">Descrição</th><th className="p-3 text-right">Tiragem</th><th className="p-3 text-center">Início no Gantt</th><th className="p-3 text-center">Status</th><th className="p-3 text-center w-px whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {skus.map((sku, i) => (
                      <tr key={`${sku.sku_miolo}|${i}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-bold text-slate-800 whitespace-nowrap">{sku.sku_miolo}</td>
                        <td className="p-3 font-medium text-slate-600 max-w-xs truncate">{sku.descricao || '—'}</td>
                        <td className="p-3 text-right font-medium text-slate-700 tabular-nums">{formatarNumero(sku.tiragem ?? 0)}</td>
                        <td className="p-3 text-center font-medium text-slate-700 whitespace-nowrap">{fmtData(sku.dt_calculo || sku.dt_replan_inicio_imp || sku.dt_plan_inicio_imp || calcularInicioImp(sku.dt_fim_aprove_arquivo, sku.dt_envio_tiragem))}</td>
                        <td className="p-3 text-center">
                          {sku.tem_calculo ? <span className="inline-flex items-center gap-1.5 bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase"><i className="fas fa-check-circle"></i> Calculado</span> : <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase"><i className="fas fa-clock"></i> Pendente</span>}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                            <button onClick={() => abrirEditarSku(sku)} className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"><i className="fas fa-pen"></i> Editar SKU</button>
                            <button onClick={() => abrirDuplicarSku(sku)} className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"><i className="fas fa-copy"></i> Duplicar</button>
                            <button onClick={() => abrirMoverSku(sku)} className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"><i className="fas fa-arrows-alt"></i> Mover</button>
                            <button onClick={() => setSkuExcluirAlvo(sku)} className="bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center"><i className="fas fa-trash"></i></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          )}

          {abaLote === 'kits' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center"><h3 className="font-black text-slate-700 uppercase tracking-wider text-xs flex items-center gap-2"><i className="fas fa-puzzle-piece text-blue-500"></i> Kits do Lote</h3>{!loadingSkus && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">{kitsAgrupados.length} kit(s)</span>}</div>
            <div className="overflow-auto">
              {loadingSkus ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24"><i className="fas fa-spinner fa-spin text-4xl"></i><p className="font-bold text-sm text-slate-400">Carregando kits...</p></div>
              ) : kitsAgrupados.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24"><i className="fas fa-box-open text-4xl"></i><p className="font-bold text-sm">Nenhum kit cadastrado neste lote.</p></div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="p-3">Código Kit</th><th className="p-3">Descrição</th><th className="p-3">SKUs do Kit</th><th className="p-3 text-right">Tiragem</th><th className="p-3 text-center">Shrink</th><th className="p-3 text-center">Status</th><th className="p-3 text-center w-px whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {kitsAgrupados.map((kit) => (
                      <tr key={kit.codigo} onClick={() => abrirKit(kit.codigo)} className="hover:bg-blue-50/40 transition-colors cursor-pointer align-top">
                        <td className="p-3 font-bold text-slate-800 whitespace-nowrap font-mono">{kit.codigo || '—'}</td>
                        <td className="p-3 font-medium text-slate-600 max-w-xs">{kit.descricao || '—'}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1.5 max-w-md">
                            {kit.itens.slice(0, 4).map((it, j) => (
                              <span key={j} title={it.descricao || ''} className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded font-mono">{it.sku || 'sem SKU'}</span>
                            ))}
                            {kit.itens.length > 4 && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">+{kit.itens.length - 4}</span>}
                          </div>
                          <p className="text-[10px] font-bold uppercase text-slate-400 mt-1.5">{kit.itens.length} SKU(s) vinculado(s){kit.qnt_skus != null && Number(kit.qnt_skus) !== kit.itens.length ? ` · planilha: ${kit.qnt_skus}` : ''}</p>
                        </td>
                        <td className="p-3 text-right font-medium text-slate-700 tabular-nums">{formatarNumero(kit.tiragem ?? 0)}</td>
                        <td className="p-3 text-center font-medium text-slate-600">{kit.com_shrink || '—'}</td>
                        <td className="p-3 text-center">
                          {kit.tem_calculo ? <span className="inline-flex items-center gap-1.5 bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase"><i className="fas fa-check-circle"></i> Calculado</span> : <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase"><i className="fas fa-clock"></i> Pendente</span>}
                        </td>
                        <td className="p-3">
                          <button onClick={(e) => { e.stopPropagation(); abrirKit(kit.codigo); }} className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap"><i className="fas fa-pen"></i> Editar Kit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          )}
        </main>
        )}
      </div>

      {/* ===================== MODAIS (MANTIDOS INALTERADOS) ===================== */}
      {modalTipo && loteAtivo && (
        <div className="fixed inset-0 z-9990 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={fecharModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {modalTipo === 'excluir' && (
              <div>
                <div className="p-6 flex items-start gap-4">
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl shrink-0"><i className="fas fa-trash"></i></div>
                  <div><h2 className="text-lg font-black text-slate-800">Excluir lote?</h2><p className="text-sm text-slate-500 mt-1">Tem certeza que deseja excluir o lote <strong className="text-slate-800">{loteAtivo.filtro_producao}</strong>? Esta ação não pode ser desfeita.</p></div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                  <button onClick={fecharModal} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
                  <button onClick={confirmarExcluir} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-red-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>} Excluir Definitivamente</button>
                </div>
              </div>
            )}
            {modalTipo === 'duplicar' && (
              <div>
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-5"><div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl shrink-0"><i className="fas fa-copy"></i></div><div><h2 className="text-lg font-black text-slate-800">Duplicar lote</h2><p className="text-sm text-slate-500 mt-1">Copiando <strong className="text-slate-800">{loteAtivo.filtro_producao}</strong>. O novo lote nasce sem cálculos.</p></div></div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Novo Nome</label>
                  <input autoFocus type="text" value={formDuplicarNome} onChange={(e) => setFormDuplicarNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !loading) confirmarDuplicar(); }} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"/>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                  <button onClick={fecharModal} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
                  <button onClick={confirmarDuplicar} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-copy"></i>} Duplicar</button>
                </div>
              </div>
            )}
            {modalTipo === 'aviso' && (
              <div>
                <div className="p-6 flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-xl shrink-0"><i className="fas fa-exclamation-triangle"></i></div>
                  <div><h2 className="text-lg font-black text-slate-800">Atenção: cálculos existentes</h2><p className="text-sm text-slate-500 mt-1">Este lote já possui cálculos prontos. Editar esses dados apagará os cálculos atuais. Deseja prosseguir?</p></div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                  <button onClick={fecharModal} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
                  <button onClick={prosseguirAposAviso} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2"><i className="fas fa-arrow-right"></i> Prosseguir</button>
                </div>
              </div>
            )}
            {modalTipo === 'editar' && (
              <div>
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-5"><div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl shrink-0"><i className="fas fa-pen"></i></div><div><h2 className="text-lg font-black text-slate-800">Editar lote</h2><p className="text-sm text-slate-500 mt-1">Alterações são aplicadas em cascata.</p></div></div>
                  {limparCalculos && <div className="mb-5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-2"><i className="fas fa-exclamation-triangle"></i> Os cálculos deste lote serão apagados.</div>}
                  <div className="space-y-4">
                    <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Novo Nome</label><input type="text" value={formNome} onChange={(e) => setFormNome(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"/></div>
                    <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Nova Gráfica</label><input type="text" value={formGrafica} onChange={(e) => setFormGrafica(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"/></div>
                    <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Tiragem em Massa</label><input type="number" value={formTiragem} onChange={(e) => setFormTiragem(e.target.value)} placeholder="Deixe em branco para manter atuais" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"/></div>
                  </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                  <button onClick={fecharModal} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
                  <button onClick={confirmarEditar} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Salvar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {massaModal && (
        <div className="fixed inset-0 z-9990 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => !loading && setMassaModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 ${massaModal === 'excluir' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}><i className={`fas ${massaModal === 'excluir' ? 'fa-trash' : 'fa-copy'}`}></i></div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">{massaModal === 'excluir' ? `Excluir ${qtdSelecionados} lote(s)?` : `Duplicar ${qtdSelecionados} lote(s)`}</h2>
                  <p className="text-sm text-slate-500 mt-1">{massaModal === 'excluir' ? 'Todos os dados e cálculos destes lotes serão apagados. Esta ação não pode ser desfeita.' : 'As cópias nascem sem cálculos. Se o nome já existir, um número é acrescentado automaticamente.'}</p>
                </div>
              </div>
              {massaModal === 'duplicar' && (
                <div className="mb-4">
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Sufixo do novo nome</label>
                  <input autoFocus type="text" value={sufixoMassa} onChange={(e) => setSufixoMassa(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !loading) executarMassa(); }} placeholder="- CÓPIA" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"/>
                </div>
              )}
              <div className="border border-slate-200 rounded-xl max-h-56 overflow-auto divide-y divide-slate-100">
                {lotesSelecionados().map(l => (
                  <div key={chaveLote(l)} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-bold text-slate-800 truncate">{l.filtro_producao}{massaModal === 'duplicar' && <span className="text-blue-600 font-medium"> → {l.filtro_producao} {sufixoMassa.trim() || '- CÓPIA'}</span>}</span>
                    <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded shrink-0">{l.grafica}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setMassaModal(null)} disabled={loading} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm disabled:opacity-50">Cancelar</button>
              {massaModal === 'excluir' ? (
                <button onClick={executarMassa} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-red-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>} Excluir Definitivamente</button>
              ) : (
                <button onClick={executarMassa} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-copy"></i>} Duplicar</button>
              )}
            </div>
          </div>
        </div>
      )}

      {kitCodigoAberto && (
        <div className="fixed inset-0 z-9990 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={fecharKit}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center gap-4">
              <div className="w-11 h-11 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-lg shrink-0"><i className="fas fa-puzzle-piece"></i></div>
              <div className="min-w-0"><h2 className="text-lg font-black text-slate-800">Editar Kit</h2><p className="text-sm text-slate-500 font-mono truncate">{kitCodigoAberto}</p></div>
            </div>

            {loadingKit || !kitEdicao ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-3 py-24"><i className="fas fa-spinner fa-spin text-4xl"></i><p className="font-bold text-sm text-slate-400">Carregando...</p></div>
            ) : (
              <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
                {kitEdicao.tem_calculo && (
                  <div className={`rounded-lg px-3 py-2.5 text-xs font-bold flex items-center gap-2 border ${kitAfetaCalculo() ? 'bg-red-50 border-red-300 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    <i className="fas fa-exclamation-triangle"></i>{kitAfetaCalculo() ? 'A alteração apagará o cálculo deste kit.' : 'Alterar dados técnicos ou SKUs apagará o cálculo deste kit.'}
                  </div>
                )}

                <div className="border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-black text-slate-400 uppercase mb-3">Informações Gerais</p>
                  <div className="grid grid-cols-2 gap-4">
                    {CAMPOS_KIT.map(c => (
                      <div key={c.k} className={c.full ? 'col-span-2' : ''}><label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">{c.label}</label><input type={c.type} value={kitEdicao.kit?.[c.k] ?? ''} onChange={(e) => updKit(c.k, e.target.value)} className={inputCls()} /></div>
                    ))}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <p className="text-[11px] font-black text-slate-500 uppercase flex items-center gap-2"><i className="fas fa-layer-group text-blue-500"></i> SKUs do Kit</p>
                    <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">{kitEdicao.itens.length} SKU(s)</span>
                  </div>
                  {kitEdicao.itens.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">Nenhum SKU. Adicione ao menos um.</p>
                  ) : (
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100">
                          <th className="px-4 py-2">SKU</th><th className="px-4 py-2">Descrição</th><th className="px-4 py-2 w-px"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {kitEdicao.itens.map((it, idx) => (
                          <tr key={it.id ?? `novo-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-800 whitespace-nowrap">
                              {it.sku || <span className="text-slate-400 italic font-sans font-medium">sem SKU</span>}
                              {it.id == null && <span className="ml-2 text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-sans uppercase">novo</span>}
                              {it.sku_miolo && normSku(it.sku_miolo) !== normSku(it.sku) && <p className="text-[10px] text-slate-400 font-medium">miolo: {it.sku_miolo}</p>}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">{it.descricao || '—'}</td>
                            <td className="px-4 py-2.5"><button onClick={() => removerSkuKit(idx)} title="Remover do kit" className="bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 rounded-lg shadow-sm transition-all"><i className="fas fa-times"></i></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="p-3 border-t border-slate-200 bg-slate-50/60 flex gap-2">
                    <input list="kit-opcoes-sku" type="text" value={kitNovoSku} onChange={(e) => setKitNovoSku(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarSkuKit(); } }} placeholder="SKU da capa ou do miolo deste lote" className={inputCls()} />
                    <datalist id="kit-opcoes-sku">
                      {kitEdicao.opcoes.filter(o => !kitEdicao.itens.some(i => normSku(i.sku) === normSku(o.sku))).map(o => (
                        <option key={o.sku ?? ''} value={o.sku ?? ''}>{o.descricao || ''}</option>
                      ))}
                    </datalist>
                    <button onClick={adicionarSkuKit} disabled={!kitNovoSku.trim()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg font-black text-xs uppercase shadow-sm shadow-blue-600/20 transition-all flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"><i className="fas fa-plus"></i> Adicionar</button>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={fecharKit} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
              <button onClick={confirmarKit} disabled={loading || loadingKit || !kitEdicao} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Salvar Kit</button>
            </div>
          </div>
        </div>
      )}

      {skuModalAberto && skuBase && (
        <div className="fixed inset-0 z-9990 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={fecharSkuModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center gap-4">
              <div className="w-11 h-11 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-lg shrink-0"><i className="fas fa-x-ray"></i></div>
              <div className="min-w-0"><h2 className="text-lg font-black text-slate-800">Raio-X do SKU</h2><p className="text-sm text-slate-500 font-mono truncate">{skuBase.sku_miolo}</p></div>
            </div>

            {loadingDetalhe || !raioX ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-3 py-24"><i className="fas fa-spinner fa-spin text-4xl"></i><p className="font-bold text-sm text-slate-400">Carregando...</p></div>
            ) : (
              <>
                {raioX.tem_calculo && (
                  <div className={`mx-5 mt-4 rounded-lg px-3 py-2.5 text-xs font-bold flex items-center gap-2 border ${quantidadesAlteradas() ? 'bg-red-50 border-red-300 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    <i className="fas fa-exclamation-triangle"></i>{quantidadesAlteradas() ? 'A alteração apagará o cálculo.' : 'Alterar Tiragem ou Paginação apagará o cálculo.'}
                  </div>
                )}
                <div className="px-5 pt-4">
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-max">
                    {([{ id: 'miolo', label: 'Miolo' }, { id: 'capas', label: `Capas (${raioX.capas.length})` }, { id: 'encartes', label: `Encartes (${raioX.encartes.length})` }, { id: 'datas', label: 'Datas' }] as const).map(t => (
                      <button key={t.id} onClick={() => setAbaRaioX(t.id)} className={`px-4 py-1.5 rounded-md font-bold uppercase text-[11px] transition-all ${abaRaioX === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{t.label}</button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-auto px-5 py-4">
                  {abaRaioX === 'miolo' && (
                    <div className="grid grid-cols-2 gap-4">
                      {CAMPOS_MIOLO.map(c => (
                        <div key={c.k} className={c.k === 'descricao' ? 'col-span-2' : ''}><label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">{c.label}</label><input type={c.type as any} value={raioX.miolo?.[c.k] ?? ''} disabled={(c as any).ro} onChange={(e) => updMiolo(c.k, e.target.value)} className={inputCls((c as any).ro)} /></div>
                      ))}
                    </div>
                  )}
                  {abaRaioX === 'capas' && (
                    raioX.capas.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Nenhuma capa.</p> : raioX.capas.map((capa, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-xl p-4 mb-3"><p className="text-[11px] font-black text-slate-400 uppercase mb-3">Capa #{idx + 1}</p><div className="grid grid-cols-2 gap-4">
                        {CAMPOS_CAPA.map(c => (
                          <div key={c.k}><label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">{c.label}</label><input type={c.type as any} value={capa[c.k] ?? ''} disabled={(c as any).ro} onChange={(e) => updItem('capas', idx, c.k, e.target.value)} className={inputCls((c as any).ro)} /></div>
                        ))}
                      </div></div>
                    ))
                  )}
                  {abaRaioX === 'encartes' && (
                    raioX.encartes.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Nenhum encarte.</p> : raioX.encartes.map((enc, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-xl p-4 mb-3"><p className="text-[11px] font-black text-slate-400 uppercase mb-3">Encarte #{idx + 1}</p><div className="grid grid-cols-2 gap-4">
                        {CAMPOS_ENCARTE.map(c => (
                          <div key={c.k} className={c.k === 'descricao' ? 'col-span-2' : ''}><label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">{c.label}</label><input type={c.type as any} value={enc[c.k] ?? ''} disabled={(c as any).ro} onChange={(e) => updItem('encartes', idx, c.k, e.target.value)} className={inputCls((c as any).ro)} /></div>
                        ))}
                      </div></div>
                    ))
                  )}
                  {abaRaioX === 'datas' && (() => {
                    const d = raioX.datas || {};
                    const automatico = calcularInicioImp(d.dt_fim_aprove_arquivo, d.dt_envio_tiragem);
                    const origem = d.dt_calculo ? 'manual' : d.dt_replan_inicio_imp ? 'replan' : d.dt_plan_inicio_imp ? 'plan' : automatico ? 'auto' : 'vazio';
                    const efetivo = d.dt_calculo || d.dt_replan_inicio_imp || d.dt_plan_inicio_imp || automatico;
                    const ORIGENS: Record<string, { txt: string; cls: string }> = {
                      manual: { txt: 'Ajuste manual', cls: 'bg-blue-100 text-blue-700' },
                      replan: { txt: 'Planilha (Replan)', cls: 'bg-slate-200 text-slate-600' },
                      plan: { txt: 'Planilha (Plan)', cls: 'bg-slate-200 text-slate-600' },
                      auto: { txt: `Automático (${DIAS_UTEIS_INICIO_IMP} dias úteis)`, cls: 'bg-teal-100 text-teal-700' },
                      vazio: { txt: 'Sem data', cls: 'bg-amber-100 text-amber-700' },
                    };
                    return (
                      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                        <p className="text-[11px] font-black text-slate-400 uppercase mb-3">Datas do SKU</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">Fim Aprov. Arquivo</label><input type="date" value={d.dt_fim_aprove_arquivo || ''} disabled className={inputCls(true)} /></div>
                          <div><label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">Envio Tiragem</label><input type="date" value={d.dt_envio_tiragem || ''} disabled className={inputCls(true)} /></div>
                          <div className="col-span-2">
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-[11px] font-bold uppercase text-blue-600">Início Imp.</label>
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${ORIGENS[origem].cls}`}>{ORIGENS[origem].txt}</span>
                            </div>
                            <div className="flex gap-2">
                              <input type="date" value={efetivo || ''} onChange={(e) => updData('dt_calculo', e.target.value)} className={inputCls()} />
                              {d.dt_calculo && (
                                <button onClick={() => updData('dt_calculo', '')} title="Descarta o ajuste manual e volta à data da planilha / regra automática" className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-300 px-3 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap"><i className="fas fa-undo"></i> Restaurar</button>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                              Regra: {DIAS_UTEIS_INICIO_IMP} dias úteis após a maior data entre Fim Aprov. e Envio Tiragem{automatico ? <> = <strong className="text-slate-700">{fmtData(automatico)}</strong></> : ' (sem datas base)'}.
                              {' '}Alterar este campo grava um ajuste manual, que passa a ser o início do SKU no Gantt.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={fecharSkuModal} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
              <button onClick={confirmarEditarSku} disabled={loading || loadingDetalhe || !raioX} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Salvar SKU</button>
            </div>
          </div>
        </div>
      )}

      {skuExcluirAlvo && (
        <div className="fixed inset-0 z-9990 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setSkuExcluirAlvo(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl shrink-0"><i className="fas fa-trash"></i></div>
              <div><h2 className="text-lg font-black text-slate-800">Excluir SKU?</h2><p className="text-sm text-slate-500 mt-1">O SKU <strong className="text-slate-800 font-mono">{skuExcluirAlvo.sku_miolo}</strong> será removido permanentemente.</p></div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setSkuExcluirAlvo(null)} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
              <button onClick={confirmarExcluirSku} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-red-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>} Excluir</button>
            </div>
          </div>
        </div>
      )}

      {moverAlvo && (
        <div className="fixed inset-0 z-9990 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setMoverAlvo(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5"><div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl shrink-0"><i className="fas fa-arrows-alt"></i></div><div><h2 className="text-lg font-black text-slate-800">Mover SKU</h2><p className="text-sm text-slate-500 mt-1">Movendo <strong className="text-slate-800 font-mono">{moverAlvo.sku_miolo}</strong>.</p></div></div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Lote de Destino</label>
              <input autoFocus type="text" value={moverNome} onChange={(e) => setMoverNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !loading) confirmarMoverSku(); }} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 outline-none transition-all" />
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setMoverAlvo(null)} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
              <button onClick={confirmarMoverSku} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm flex items-center gap-2 disabled:opacity-50">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-arrows-alt"></i>} Mover</button>
            </div>
          </div>
        </div>
      )}

      {duplicarAlvo && (
        <div className="fixed inset-0 z-9990 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setDuplicarAlvo(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5"><div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl shrink-0"><i className="fas fa-copy"></i></div><div><h2 className="text-lg font-black text-slate-800">Duplicar SKU</h2><p className="text-sm text-slate-500 mt-1">Copiando <strong className="text-slate-800 font-mono">{duplicarAlvo.sku_miolo}</strong>.</p></div></div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Novo nome do SKU</label>
              <input autoFocus type="text" value={duplicarNome} onChange={(e) => setDuplicarNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !loading) confirmarDuplicarSku(); }} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 outline-none transition-all" />
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setDuplicarAlvo(null)} className="bg-white border border-slate-200 text-slate-700 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
              <button onClick={confirmarDuplicarSku} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm flex items-center gap-2 disabled:opacity-50">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-copy"></i>} Duplicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}