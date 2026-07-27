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

type AbaRaioX = 'miolo' | 'capas' | 'encartes' | 'datas';
type ModalTipo = null | 'excluir' | 'duplicar' | 'aviso' | 'editar';

export default function GestaoProducao() {
  const router = useRouter();
  const [feedback, setFeedback] = useState({ msg: '', tipo: '' });
  const [loading, setLoading] = useState(false);

  // VIEW PRINCIPAL: alterna entre importação de CSV e gestão de lotes.
  const [viewAtiva, setViewAtiva] = useState<'importar' | 'lotes'>('importar');

  const [tabelaSelecionada, setTabelaSelecionada] = useState('prod_miolo');
  const [arquivoNome, setArquivoNome] = useState('');
  const [dadosPreview, setDadosPreview] = useState<any[]>([]);
  const [dadosParaEnviar, setDadosParaEnviar] = useState<any[]>([]);
  const [cabecalhoArquivo, setCabecalhoArquivo] = useState<string[]>([]);

  // ESTADOS DA GESTÃO DE LOTES
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [modalTipo, setModalTipo] = useState<ModalTipo>(null);
  const [loteAtivo, setLoteAtivo] = useState<Lote | null>(null);
  const [limparCalculos, setLimparCalculos] = useState(false);
  // Campos de formulário dos modais
  const [formNome, setFormNome] = useState('');
  const [formGrafica, setFormGrafica] = useState('');
  const [formTiragem, setFormTiragem] = useState('');
  const [formDuplicarNome, setFormDuplicarNome] = useState('');

  // FILTROS da lista geral de lotes
  const [filtroGrafica, setFiltroGrafica] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  // DRILL-DOWN: visão detalhada dos SKUs de um lote
  const [loteExpandido, setLoteExpandido] = useState<Lote | null>(null);
  const [skus, setSkus] = useState<SkuDetalhe[]>([]);
  const [kitsLote, setKitsLote] = useState<any[]>([]);
  const [loadingSkus, setLoadingSkus] = useState(false);
  const [abaLote, setAbaLote] = useState<'produtos' | 'kits'>('produtos');

  // DUPLICAR SKU
  const [duplicarAlvo, setDuplicarAlvo] = useState<SkuDetalhe | null>(null);
  const [duplicarNome, setDuplicarNome] = useState('');

  // EDIÇÃO "RAIO-X" DE SKU
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

  const tabelas = [
    { id: 'prod_miolo', nome: 'Miolo', colunas: 8, cabecalho: 'FILTRO_PRODUCAO;GRAFICA;SKU_MIOLO;DESCRICAO;TIRAGEM;LOMBADA;PAGINACAO;ACABAMENTO' },
    { id: 'prod_capas', nome: 'Capas', colunas: 12, cabecalho: 'FILTRO_PRODUCAO;GRAFICA;SKU_CAPA;DESCRICAO;TIRAGEM;CORES;PAGINACAO;ACABAMENTO;TAMANHO_LOMBADA;SKU_REF;TIPO_CAPA;BENEFICIAMENTO' },
    { id: 'prod_encarte', nome: 'Encarte', colunas: 9, cabecalho: 'FILTRO_PRODUCAO;GRAFICA;SKU_MIOLO;DESCRICAO;TIRAGEM;PAGINACAO_ENCARTE;CORTE_VINCO_ENCARTE;PAGINACAO_ADESIVO;CORTE_VINCO_ADESIVO' },
    { id: 'prod_kits', nome: 'Kits', colunas: 10, cabecalho: 'FILTRO_PRODUCAO;GRAFICA;ID_CODIGO_KIT;ID_DESCRICAO_KIT;ID_CODIGO_SKU_CAPA;ESPESSURA_KIT_MM;QNT_SKUS;TIRAGEM;TIPO_KIT;COM_SHRINK' },
    { id: 'prod_datas_iniciais', nome: 'Datas Iniciais', colunas: 8, cabecalho: 'FILTRO_PRODUCAO;SKU;GRAFICA;DT_FIM_APROVE_ARQUIVO;DT_ENVIO_TIRAGEM;DT_PLAN_INICIO_IMP;DT_REPLAN_INICIO_IMP;DT_CALCULO' },
  ];

  const mostrarAviso = (msg: string, tipo: 'sucesso' | 'erro') => {
    setFeedback({ msg, tipo });
    // Erros costumam ser longos (linha + motivo) — damos mais tempo de leitura.
    setTimeout(() => setFeedback({ msg: '', tipo: '' }), tipo === 'erro' ? 15000 : 6000);
  };

  const mudarTabela = (id: string) => {
    setTabelaSelecionada(id);
    setArquivoNome('');
    setDadosPreview([]);
    setDadosParaEnviar([]);
    setCabecalhoArquivo([]);
  };

  const baixarGabarito = () => {
    const tabAtual = tabelas.find(t => t.id === tabelaSelecionada);
    if (!tabAtual) return;
    
    const blob = new Blob(["\uFEFF" + tabAtual.cabecalho], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Gabarito_Upload_${tabAtual.nome}.csv`);
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
      header: false,
      skipEmptyLines: 'greedy',
      encoding: "ISO-8859-1", 
      complete: (results) => {
        const linhas = results.data as string[][];
        
        if (linhas.length < 2) {
          mostrarAviso("Arquivo vazio ou sem dados.", "erro");
          setLoading(false);
          return;
        }

        const cabecalho = (linhas[0] || []).map(c => String(c || '').trim());
        setCabecalhoArquivo(cabecalho);

        const apenasDados = linhas.slice(1);

        const limparNumero = (val: string) => {
          if (!val) return null;
          return val.toString().replace(/\./g, '').trim();
        };

        const dadosFormatados = apenasDados.map((row, index) => {
          try {
            if (tabelaSelecionada === 'prod_miolo') {
              return { c1: row[0], c2: row[1], c3: row[2], c4: row[3], c5: limparNumero(row[4]), c6: row[5], c7: limparNumero(row[6]), c8: row[7] };
            }
            if (tabelaSelecionada === 'prod_capas') {
              return { c1: row[0], c2: row[1], c3: row[2], c4: row[3], c5: limparNumero(row[4]), c6: row[5], c7: limparNumero(row[6]), c8: row[7], c9: row[8], c10: row[9], c11: row[10], c12: row[11] };
            }
            if (tabelaSelecionada === 'prod_encarte') {
              return { c1: row[0], c2: row[1], c3: row[2], c4: row[3], c5: limparNumero(row[4]), c6: limparNumero(row[5]), c7: row[6], c8: limparNumero(row[7]), c9: row[8] };
            }
            if (tabelaSelecionada === 'prod_kits') {
              return { c1: row[0], c2: row[1], c3: row[2], c4: row[3], c5: row[4], c6: row[5], c7: limparNumero(row[6]), c8: limparNumero(row[7]), c9: row[8], c10: row[9] };
            }
            if (tabelaSelecionada === 'prod_datas_iniciais') {
              return { c1: row[0], c2: row[1], c3: row[2], c4: row[3], c5: row[4], c6: row[5], c7: row[6], c8: row[7] };
            }
          } catch (e) {
            console.error(`Erro ao processar linha ${index + 2}`, e);
          }
          return null;
        }).filter(item => item !== null);

        setDadosParaEnviar(dadosFormatados);
        setDadosPreview(apenasDados.slice(0, 10)); 
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
        body: JSON.stringify({
          tabela: tabelaSelecionada,
          dados: dadosParaEnviar,
          cabecalho: cabecalhoArquivo
        })
      });

      const data = await res.json();

      if (res.ok) {
        mostrarAviso(data.message, 'sucesso');
        setArquivoNome('');
        setDadosPreview([]);
        setDadosParaEnviar([]);
        setCabecalhoArquivo([]);
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

  // ──────────────────────────────────────────────────────────────────────
  // GESTÃO DE LOTES
  // ──────────────────────────────────────────────────────────────────────
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

  // Carrega os lotes ao entrar na aba de Gestão de Lotes.
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

  const formatarNumero = (val: number | string) =>
    (Number(val) || 0).toLocaleString('pt-BR');

  // EXCLUIR
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

  // DUPLICAR
  const abrirDuplicar = (lote: Lote) => { setLoteAtivo(lote); setFormDuplicarNome(''); setModalTipo('duplicar'); };

  const confirmarDuplicar = async () => {
    if (!loteAtivo) return;
    if (!formDuplicarNome.trim()) { mostrarAviso('Informe o novo nome do lote.', 'erro'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/producao/gestao-lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filtro_producao: loteAtivo.filtro_producao,
          grafica: loteAtivo.grafica,
          novo_filtro_producao: formDuplicarNome.trim()
        })
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

  // EDITAR
  const prepararFormEdicao = (lote: Lote) => {
    setFormNome(lote.filtro_producao);
    setFormGrafica(lote.grafica);
    setFormTiragem('');
  };

  const abrirEditar = (lote: Lote) => {
    setLoteAtivo(lote);
    if (lote.status_calculado) {
      // Aviso crítico antes de prosseguir — editar apagará os cálculos.
      setModalTipo('aviso');
    } else {
      setLimparCalculos(false);
      prepararFormEdicao(lote);
      setModalTipo('editar');
    }
  };

  // Usuário aceitou o aviso crítico: segue para edição limpando os cálculos.
  const prosseguirAposAviso = () => {
    if (!loteAtivo) return;
    setLimparCalculos(true);
    prepararFormEdicao(loteAtivo);
    setModalTipo('editar');
  };

  const confirmarEditar = async () => {
    if (!loteAtivo) return;
    setLoading(true);
    const body: any = {
      filtro_producao: loteAtivo.filtro_producao,
      grafica: loteAtivo.grafica,
      limpar_calculos: limparCalculos
    };
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

  // ──────────────────────────────────────────────────────────────────────
  // DRILL-DOWN: SKUs DO LOTE
  // ──────────────────────────────────────────────────────────────────────
  // Normaliza QUALQUER formato de data (ISO, timestamp, DD/MM/AAAA, D-M-AA...)
  // para o padrão YYYY-MM-DD exigido pelo <input type="date">.
  const forceDateInputFormat = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    const s = String(dateStr).trim();
    if (!s) return '';
    // ISO: YYYY-MM-DD ou YYYY/MM/DD (também pega timestamps YYYY-MM-DDTHH:mm).
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      const [, y, mo, d] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // BR: DD/MM/AAAA, D/M/AA, DD-MM-AAAA, etc.
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return '';
  };

  // Formato amigável DD/MM/AAAA para exibição na tabela.
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
        // A API agora retorna { produtos, kits }.
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

  const abrirLote = (lote: Lote) => {
    setLoteExpandido(lote);
    setAbaLote('produtos');
    carregarSkus(lote);
  };

  const voltarLotes = () => {
    setLoteExpandido(null);
    setSkus([]);
    setKitsLote([]);
  };

  // ── EDIÇÃO RAIO-X ──────────────────────────────────────────────────────
  // Assinatura das quantidades (tiragem/paginação de todas as partes) — usada
  // para detectar alterações que exigem limpar o cálculo.
  const assinaturaQtd = (d: RaioX | null): string => {
    if (!d) return '';
    const partes: any[] = [d.miolo?.tiragem, d.miolo?.paginacao];
    (d.capas || []).forEach(c => partes.push(c.tiragem, c.paginacao));
    (d.encartes || []).forEach(e => partes.push(e.tiragem, e.paginacao_encarte, e.paginacao_adesivo));
    (d.kits || []).forEach(k => partes.push(k.tiragem));
    return partes.map(v => (v == null ? '' : String(v).trim())).join('|');
  };

  const quantidadesAlteradas = (): boolean =>
    !!raioX && !!raioXOriginal && assinaturaQtd(raioX) !== assinaturaQtd(raioXOriginal);

  const abrirEditarSku = async (sku: SkuDetalhe) => {
    if (!loteExpandido) return;
    setSkuBase(sku);
    setAbaRaioX('miolo');
    setSkuModalAberto(true);
    setRaioX(null);
    setRaioXOriginal(null);
    setLoadingDetalhe(true);
    try {
      const params = new URLSearchParams({ sku: sku.sku_miolo, filtro: loteExpandido.filtro_producao, grafica: loteExpandido.grafica });
      const res = await fetch(`/api/producao/gestao-lotes/detalhes?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        // Normaliza TODAS as datas para YYYY-MM-DD já ao abrir o modal.
        const datasBrutas = data.datas || {};
        const datasNormalizadas: any = {};
        ['dt_calculo', 'dt_plan_inicio_imp', 'dt_replan_inicio_imp', 'dt_fim_aprove_arquivo', 'dt_envio_tiragem']
          .forEach(k => { datasNormalizadas[k] = forceDateInputFormat(datasBrutas[k]); });

        const normalizado: RaioX = {
          miolo: data.miolo || {},
          datas: datasNormalizadas,
          capas: Array.isArray(data.capas) ? data.capas : [],
          encartes: Array.isArray(data.encartes) ? data.encartes : [],
          kits: [], // Kits não fazem parte da edição do miolo.
          tem_calculo: !!data.tem_calculo,
        };
        setRaioX(normalizado);
        setRaioXOriginal(JSON.parse(JSON.stringify(normalizado)));
      } else {
        mostrarAviso(data.message || 'Erro ao carregar detalhes do SKU.', 'erro');
        fecharSkuModal();
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao carregar detalhes do SKU.', 'erro');
      fecharSkuModal();
    } finally {
      setLoadingDetalhe(false);
    }
  };

  const fecharSkuModal = () => {
    setSkuModalAberto(false);
    setSkuBase(null);
    setRaioX(null);
    setRaioXOriginal(null);
  };

  // Handlers de edição imutável do Raio-X.
  const updMiolo = (campo: string, valor: string) =>
    setRaioX(d => d ? { ...d, miolo: { ...d.miolo, [campo]: valor } } : d);
  const updData = (campo: string, valor: string) =>
    setRaioX(d => d ? { ...d, datas: { ...d.datas, [campo]: valor } } : d);
  const updItem = (tipo: 'capas' | 'encartes' | 'kits', idx: number, campo: string, valor: string) =>
    setRaioX(d => {
      if (!d) return d;
      const arr = [...(d[tipo] as any[])];
      arr[idx] = { ...arr[idx], [campo]: valor };
      return { ...d, [tipo]: arr };
    });

  const confirmarEditarSku = async () => {
    if (!skuBase || !raioX || !loteExpandido) return;
    setLoading(true);
    // Força limpar cálculo se havia cálculo e alguma tiragem/paginação mudou.
    const limpar = raioX.tem_calculo && quantidadesAlteradas();
    try {
      const res = await fetch('/api/producao/gestao-lotes/detalhes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_miolo: skuBase.sku_miolo,
          filtro_producao: loteExpandido.filtro_producao,
          grafica: loteExpandido.grafica,
          miolo: raioX.miolo,
          datas: raioX.datas,
          capas: raioX.capas,
          encartes: raioX.encartes,
          kits: raioX.kits,
          limpar_calculo: limpar,
        })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAviso(data.message || 'SKU atualizado!', 'sucesso');
        fecharSkuModal();
        carregarSkus(loteExpandido);
      } else {
        mostrarAviso(data.message || 'Erro ao editar SKU.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao editar SKU.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  // ── EXCLUIR SKU ────────────────────────────────────────────────────────
  const confirmarExcluirSku = async () => {
    if (!skuExcluirAlvo || !loteExpandido) return;
    setLoading(true);
    try {
      const res = await fetch('/api/producao/gestao-lotes/detalhes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_miolo: skuExcluirAlvo.sku_miolo,
          filtro_producao: loteExpandido.filtro_producao,
          grafica: loteExpandido.grafica,
        })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAviso(data.message || 'SKU excluído!', 'sucesso');
        setSkuExcluirAlvo(null);
        carregarSkus(loteExpandido);
      } else {
        mostrarAviso(data.message || 'Erro ao excluir SKU.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao excluir SKU.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  // ── MOVER SKU DE LOTE ──────────────────────────────────────────────────
  const abrirMoverSku = (sku: SkuDetalhe) => { setMoverAlvo(sku); setMoverNome(''); };

  const confirmarMoverSku = async () => {
    if (!moverAlvo || !loteExpandido) return;
    if (!moverNome.trim()) { mostrarAviso('Informe o nome do lote de destino.', 'erro'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/producao/gestao-lotes/detalhes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_miolo: moverAlvo.sku_miolo,
          filtro_producao_atual: loteExpandido.filtro_producao,
          grafica: loteExpandido.grafica,
          novo_filtro_producao: moverNome.trim(),
        })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAviso(data.message || 'SKU movido!', 'sucesso');
        setMoverAlvo(null);
        carregarSkus(loteExpandido);
      } else {
        mostrarAviso(data.message || 'Erro ao mover SKU.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao mover SKU.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  // ── DUPLICAR SKU ───────────────────────────────────────────────────────
  const abrirDuplicarSku = (sku: SkuDetalhe) => { setDuplicarAlvo(sku); setDuplicarNome(''); };

  const confirmarDuplicarSku = async () => {
    if (!duplicarAlvo || !loteExpandido) return;
    if (!duplicarNome.trim()) { mostrarAviso('Informe o nome do novo SKU.', 'erro'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/producao/gestao-lotes/detalhes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_origem: duplicarAlvo.sku_miolo,
          novo_sku: duplicarNome.trim(),
          filtro_producao: loteExpandido.filtro_producao,
          grafica: loteExpandido.grafica,
        })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAviso(data.message || 'SKU duplicado!', 'sucesso');
        setDuplicarAlvo(null);
        carregarSkus(loteExpandido);
      } else {
        mostrarAviso(data.message || 'Erro ao duplicar SKU.', 'erro');
      }
    } catch (error) {
      mostrarAviso('Erro de rede ao duplicar SKU.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  // Listas derivadas para os filtros da tela de lotes.
  const graficasDisponiveis = Array.from(new Set(lotes.map(l => l.grafica).filter(Boolean))).sort();
  const lotesFiltrados = lotes.filter(l => {
    if (filtroGrafica && l.grafica !== filtroGrafica) return false;
    if (filtroStatus === 'calculado' && !l.status_calculado) return false;
    if (filtroStatus === 'aberto' && l.status_calculado) return false;
    return true;
  });

  // Configuração de campos por aba do Raio-X (label, chave, tipo, se conta como quantidade).
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
    { k: 'id_codigo_kit', label: 'Código Kit', type: 'text', ro: true },
    { k: 'id_descricao_kit', label: 'Descrição Kit', type: 'text' },
    { k: 'id_codigo_sku_capa', label: 'Código SKU Capa', type: 'text', ro: true },
    { k: 'espessura_kit_mm', label: 'Espessura (mm)', type: 'number' },
    { k: 'qnt_skus', label: 'Qtd. SKUs', type: 'number' },
    { k: 'tiragem', label: 'Tiragem', type: 'number', qtd: true },
    { k: 'tipo_kit', label: 'Tipo Kit', type: 'text' },
    { k: 'com_shrink', label: 'Com Shrink', type: 'text' },
  ];

  const inputCls = (ro?: boolean) =>
    `w-full border rounded-lg p-2.5 text-sm font-medium outline-none transition-all ${ro ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-slate-50 text-slate-800 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'}`;

  return (
    <div className="w-full min-h-screen bg-slate-100 font-sans flex flex-col relative">
      
      {/* TOAST PADRÃO */}
      {feedback.msg && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[9999] w-[90vw] max-w-2xl px-6 py-3 rounded-lg shadow-2xl border flex items-start gap-3 transition-all duration-300
          ${feedback.tipo === 'sucesso' ? 'bg-white border-teal-500 text-teal-700' : 'bg-white border-red-500 text-red-700'}`}>
          <i className={`fas ${feedback.tipo === 'sucesso' ? 'fa-check-circle text-teal-500' : 'fa-times-circle text-red-500'} text-xl mt-0.5 shrink-0`}></i>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-xs uppercase tracking-wider text-slate-800 mb-1">Aviso do Sistema</p>
            <p className="font-medium text-sm break-words whitespace-pre-wrap">{feedback.msg}</p>
          </div>
          <button onClick={() => setFeedback({ msg: '', tipo: '' })} className="text-slate-400 hover:text-slate-700 shrink-0" aria-label="Fechar aviso">
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      {/* 🔴 O CONTAINER DO DASHBOARD FOI BLINDADO COM min-h-[300px] */}
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-6 min-h-[300px]">
        
        {/* CABEÇALHO PADRÃO DASHBOARD */}
        <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Cadastro de Produção</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              {viewAtiva === 'importar'
                ? 'Importação massiva de ordens e tiragens via CSV'
                : 'Gerenciamento de lotes já importados (editar, duplicar e excluir)'}
            </p>
          </div>
          {viewAtiva === 'importar' && (
            <button
              onClick={baixarGabarito}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold text-xs uppercase py-2.5 px-5 rounded-lg shadow-sm transition-all flex items-center gap-2 w-max"
            >
              <i className="fas fa-file-download text-violet-500"></i>
              Baixar Gabarito ({tabelas.find(t => t.id === tabelaSelecionada)?.nome})
            </button>
          )}
        </header>

        {/* VIEW SWITCHER PRINCIPAL */}
        <div className="flex gap-2 mb-6 bg-slate-200/60 p-1.5 rounded-xl w-max">
          <button
            onClick={() => setViewAtiva('importar')}
            className={`px-6 py-2.5 rounded-lg font-bold uppercase text-xs transition-all flex items-center gap-2
              ${viewAtiva === 'importar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <i className="fas fa-cloud-upload-alt"></i> Importar Novo CSV
          </button>
          <button
            onClick={() => setViewAtiva('lotes')}
            className={`px-6 py-2.5 rounded-lg font-bold uppercase text-xs transition-all flex items-center gap-2
              ${viewAtiva === 'lotes' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <i className="fas fa-layer-group"></i> Gestão de Lotes
          </button>
        </div>

        {viewAtiva === 'importar' && (
        <main className="w-full space-y-6">

          {/* ABAS DE SELEÇÃO NO MESMO FORMATO DO GANTT */}
          <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
            {tabelas.map(tab => (
              <button
                key={tab.id}
                onClick={() => mudarTabela(tab.id)}
                className={`px-6 py-2.5 rounded-lg shadow-sm font-bold uppercase text-xs transition-all whitespace-nowrap border
                  ${tabelaSelecionada === tab.id ? 'bg-slate-800 text-white border-slate-900 scale-[1.02]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}
                `}
              >
                {tab.nome}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* ÁREA DE UPLOAD (Painel Esquerdo) */}
            <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
              <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center text-lg">
                  <i className="fas fa-file-csv"></i>
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800 uppercase">Upload de Arquivo</h2>
                  <p className="text-xs text-slate-500 font-medium">Formato de Tabela: <strong>{tabelas.find(t => t.id === tabelaSelecionada)?.nome}</strong></p>
                </div>
              </div>

              <label className="w-full relative cursor-pointer flex-1 flex flex-col justify-center min-h-[150px]">
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
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Linhas Prontas:</span>
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

            {/* ÁREA DE PRÉ-VISUALIZAÇÃO (Painel Direito) */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[400px]">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <h3 className="font-black text-slate-700 uppercase tracking-wider text-xs flex items-center gap-2">
                  <i className="fas fa-table text-violet-500"></i> Pré-visualização
                </h3>
                {dadosPreview.length > 0 && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">Mostrando {dadosPreview.length} amostras</span>}
              </div>
              
              <div className="flex-1 overflow-auto bg-white p-0">
                {dadosPreview.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-20">
                    <i className="fas fa-folder-open text-4xl"></i>
                    <p className="font-bold text-sm">Nenhum arquivo carregado na memória.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider sticky top-0 shadow-sm border-b border-slate-200">
                        <th className="p-2 border-r border-slate-200 w-10 text-center">#</th>
                        {/* Como não lemos cabeçalho real no CSV, vamos puxar as colunas lógicas do array pra gerar o Header */}
                        {dadosPreview[0].map((_: any, idx: number) => (
                          <th key={idx} className="p-2 border-r border-slate-200 last:border-0">COL {idx + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                      {dadosPreview.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-2 bg-slate-50 font-bold text-slate-400 border-r border-slate-200 text-center">{i + 1}</td>
                          {row.map((cell: string, j: number) => (
                            <td key={j} className="p-2 font-medium text-slate-700 border-r border-slate-100 last:border-0 whitespace-nowrap">{cell || '-'}</td>
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

        {/* ══════════════════ VIEW: GESTÃO DE LOTES (lista geral) ══════════════════ */}
        {viewAtiva === 'lotes' && !loteExpandido && (
        <main className="w-full">
          {/* FILTROS */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5 tracking-wider">Gráfica</label>
              <select
                value={filtroGrafica}
                onChange={(e) => setFiltroGrafica(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all min-w-[180px]"
              >
                <option value="">Todas as gráficas</option>
                {graficasDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5 tracking-wider">Status</label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all min-w-[160px]"
              >
                <option value="">Todos os status</option>
                <option value="calculado">Calculado</option>
                <option value="aberto">Aberto</option>
              </select>
            </div>
            {(filtroGrafica || filtroStatus) && (
              <button
                onClick={() => { setFiltroGrafica(''); setFiltroStatus(''); }}
                className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1.5 ml-auto"
              >
                <i className="fas fa-times-circle"></i> Limpar filtros
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="font-black text-slate-700 uppercase tracking-wider text-xs flex items-center gap-2">
                <i className="fas fa-layer-group text-blue-500"></i> Lotes Cadastrados
              </h3>
              <div className="flex items-center gap-3">
                {!loadingLotes && (
                  <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">{lotesFiltrados.length} de {lotes.length} lote(s)</span>
                )}
                <button
                  onClick={carregarLotes}
                  disabled={loadingLotes}
                  className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1.5 disabled:opacity-50"
                >
                  <i className={`fas fa-sync-alt ${loadingLotes ? 'fa-spin' : ''}`}></i> Atualizar
                </button>
              </div>
            </div>

            <div className="overflow-auto">
              {loadingLotes ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24">
                  <i className="fas fa-spinner fa-spin text-4xl"></i>
                  <p className="font-bold text-sm text-slate-400">Carregando lotes...</p>
                </div>
              ) : lotesFiltrados.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24">
                  <i className="fas fa-box-open text-4xl"></i>
                  <p className="font-bold text-sm">
                    {lotes.length === 0 ? 'Nenhum lote cadastrado. Importe um CSV para começar.' : 'Nenhum lote corresponde aos filtros selecionados.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="p-3">Lote</th>
                      <th className="p-3">Gráfica</th>
                      <th className="p-3 text-center">Total SKUs</th>
                      <th className="p-3 text-right">Tiragem Total</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center w-px whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {lotesFiltrados.map((lote, i) => (
                      <tr key={`${lote.filtro_producao}|${lote.grafica}|${i}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-bold text-slate-800">{lote.filtro_producao}</td>
                        <td className="p-3 font-medium text-slate-600">{lote.grafica}</td>
                        <td className="p-3 text-center font-medium text-slate-700">{lote.total_skus}</td>
                        <td className="p-3 text-right font-medium text-slate-700 tabular-nums">{formatarNumero(lote.tiragem_total)}</td>
                        <td className="p-3 text-center">
                          {lote.status_calculado ? (
                            <span className="inline-flex items-center gap-1.5 bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase">
                              <i className="fas fa-check-circle"></i> Calculado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase">
                              <i className="fas fa-clock"></i> Aberto
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                            <button
                              onClick={() => abrirLote(lote)}
                              className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"
                            >
                              <i className="fas fa-search"></i> Ver SKUs
                            </button>
                            <button
                              onClick={() => abrirEditar(lote)}
                              className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"
                            >
                              <i className="fas fa-pen"></i> Editar
                            </button>
                            <button
                              onClick={() => abrirDuplicar(lote)}
                              className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"
                            >
                              <i className="fas fa-copy"></i> Duplicar
                            </button>
                            <button
                              onClick={() => abrirExcluir(lote)}
                              className="bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"
                            >
                              <i className="fas fa-trash"></i> Excluir
                            </button>
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

        {/* ══════════════════ VIEW: DRILL-DOWN (SKUs do lote) ══════════════════ */}
        {viewAtiva === 'lotes' && loteExpandido && (
        <main className="w-full">
          <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <button
                onClick={voltarLotes}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 px-4 py-2 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-2"
              >
                <i className="fas fa-arrow-left"></i> Voltar aos Lotes
              </button>
              <div>
                <h2 className="text-lg font-black text-slate-800">{loteExpandido.filtro_producao}</h2>
                <p className="text-xs text-slate-500 font-medium">Gráfica: {loteExpandido.grafica}</p>
              </div>
            </div>
            <button
              onClick={() => carregarSkus(loteExpandido)}
              disabled={loadingSkus}
              className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1.5 disabled:opacity-50"
            >
              <i className={`fas fa-sync-alt ${loadingSkus ? 'fa-spin' : ''}`}></i> Atualizar
            </button>
          </div>

          {/* SWITCHER: Produtos vs Kits */}
          <div className="flex gap-2 mb-4 bg-slate-200/60 p-1.5 rounded-xl w-max">
            <button
              onClick={() => setAbaLote('produtos')}
              className={`px-5 py-2 rounded-lg font-bold uppercase text-xs transition-all flex items-center gap-2
                ${abaLote === 'produtos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              📦 Gestão de Produtos <span className="text-[10px] opacity-70">({skus.length})</span>
            </button>
            <button
              onClick={() => setAbaLote('kits')}
              className={`px-5 py-2 rounded-lg font-bold uppercase text-xs transition-all flex items-center gap-2
                ${abaLote === 'kits' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🧩 Gestão de Kits <span className="text-[10px] opacity-70">({kitsLote.length})</span>
            </button>
          </div>

          {abaLote === 'produtos' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="font-black text-slate-700 uppercase tracking-wider text-xs flex items-center gap-2">
                <i className="fas fa-list-ul text-blue-500"></i> Produtos do Lote
              </h3>
              {!loadingSkus && (
                <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">{skus.length} SKU(s)</span>
              )}
            </div>

            <div className="overflow-auto">
              {loadingSkus ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24">
                  <i className="fas fa-spinner fa-spin text-4xl"></i>
                  <p className="font-bold text-sm text-slate-400">Carregando SKUs...</p>
                </div>
              ) : skus.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24">
                  <i className="fas fa-box-open text-4xl"></i>
                  <p className="font-bold text-sm">Nenhum SKU encontrado neste lote.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="p-3">SKU</th>
                      <th className="p-3">Descrição</th>
                      <th className="p-3 text-right">Tiragem</th>
                      <th className="p-3 text-center">Data de Cálculo</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center w-px whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {skus.map((sku, i) => (
                      <tr key={`${sku.sku_miolo}|${i}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-bold text-slate-800 whitespace-nowrap">{sku.sku_miolo}</td>
                        <td className="p-3 font-medium text-slate-600 max-w-xs truncate">{sku.descricao || '—'}</td>
                        <td className="p-3 text-right font-medium text-slate-700 tabular-nums">{formatarNumero(sku.tiragem ?? 0)}</td>
                        <td className="p-3 text-center font-medium text-slate-700 whitespace-nowrap">{fmtData(sku.dt_calculo)}</td>
                        <td className="p-3 text-center">
                          {sku.tem_calculo ? (
                            <span className="inline-flex items-center gap-1.5 bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase">
                              <i className="fas fa-check-circle"></i> Calculado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase">
                              <i className="fas fa-clock"></i> Pendente
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                            <button
                              onClick={() => abrirEditarSku(sku)}
                              className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"
                            >
                              <i className="fas fa-pen"></i> Editar SKU
                            </button>
                            <button
                              onClick={() => abrirDuplicarSku(sku)}
                              title="Duplicar SKU"
                              className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"
                            >
                              <i className="fas fa-copy"></i> Duplicar
                            </button>
                            <button
                              onClick={() => abrirMoverSku(sku)}
                              title="Mover para outro lote"
                              className="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase shadow-sm transition-all flex items-center gap-1.5"
                            >
                              <i className="fas fa-arrows-alt"></i> Mover
                            </button>
                            <button
                              onClick={() => setSkuExcluirAlvo(sku)}
                              title="Excluir SKU"
                              className="bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
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

          {/* ABA: GESTÃO DE KITS */}
          {abaLote === 'kits' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="font-black text-slate-700 uppercase tracking-wider text-xs flex items-center gap-2">
                <i className="fas fa-puzzle-piece text-blue-500"></i> Kits do Lote
              </h3>
              {!loadingSkus && (
                <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">{kitsLote.length} kit(s)</span>
              )}
            </div>

            <div className="overflow-auto">
              {loadingSkus ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24">
                  <i className="fas fa-spinner fa-spin text-4xl"></i>
                  <p className="font-bold text-sm text-slate-400">Carregando kits...</p>
                </div>
              ) : kitsLote.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 py-24">
                  <i className="fas fa-box-open text-4xl"></i>
                  <p className="font-bold text-sm">Nenhum kit cadastrado neste lote.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="p-3">Código Kit</th>
                      <th className="p-3">Descrição</th>
                      <th className="p-3">SKU Capa</th>
                      <th className="p-3 text-center">Qtd. SKUs</th>
                      <th className="p-3 text-right">Tiragem</th>
                      <th className="p-3 text-center">Shrink</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {kitsLote.map((kit, i) => (
                      <tr key={kit.id ?? `${kit.id_codigo_kit}|${i}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-bold text-slate-800 whitespace-nowrap font-mono">{kit.id_codigo_kit || '—'}</td>
                        <td className="p-3 font-medium text-slate-600 max-w-xs truncate">{kit.id_descricao_kit || '—'}</td>
                        <td className="p-3 font-medium text-slate-600 font-mono">{kit.id_codigo_sku_capa || '—'}</td>
                        <td className="p-3 text-center font-medium text-slate-700">{kit.qnt_skus ?? '—'}</td>
                        <td className="p-3 text-right font-medium text-slate-700 tabular-nums">{formatarNumero(kit.tiragem ?? 0)}</td>
                        <td className="p-3 text-center font-medium text-slate-600">{kit.com_shrink || '—'}</td>
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

      {/* ══════════════════ MODAIS DA GESTÃO DE LOTES ══════════════════ */}
      {modalTipo && loteAtivo && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={fecharModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>

            {/* MODAL: EXCLUIR */}
            {modalTipo === 'excluir' && (
              <div>
                <div className="p-6 flex items-start gap-4">
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl shrink-0">
                    <i className="fas fa-trash"></i>
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800">Excluir lote?</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Tem certeza que deseja excluir o lote <strong className="text-slate-800">{loteAtivo.filtro_producao}</strong> ({loteAtivo.grafica})?
                      Isso apagará todos os dados das tabelas físicas e os cálculos associados. Esta ação não pode ser desfeita.
                    </p>
                  </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                  <button onClick={fecharModal} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
                  <button onClick={confirmarExcluir} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-red-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
                    {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>} Excluir Definitivamente
                  </button>
                </div>
              </div>
            )}

            {/* MODAL: DUPLICAR */}
            {modalTipo === 'duplicar' && (
              <div>
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-5">
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl shrink-0">
                      <i className="fas fa-copy"></i>
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-800">Duplicar lote</h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Copiando <strong className="text-slate-800">{loteAtivo.filtro_producao}</strong> ({loteAtivo.grafica}). O novo lote nasce sem cálculos.
                      </p>
                    </div>
                  </div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Novo Nome do Lote</label>
                  <input
                    autoFocus
                    type="text"
                    value={formDuplicarNome}
                    onChange={(e) => setFormDuplicarNome(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !loading) confirmarDuplicar(); }}
                    placeholder="Ex.: LOTE_2026_COPIA"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                  <button onClick={fecharModal} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
                  <button onClick={confirmarDuplicar} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
                    {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-copy"></i>} Duplicar Lote
                  </button>
                </div>
              </div>
            )}

            {/* MODAL: AVISO CRÍTICO (lote já calculado) */}
            {modalTipo === 'aviso' && (
              <div>
                <div className="p-6 flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-xl shrink-0">
                    <i className="fas fa-exclamation-triangle"></i>
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800">Atenção: cálculos existentes</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Este lote já possui cálculos prontos. Editar esses dados apagará os cálculos atuais. Deseja prosseguir?
                    </p>
                  </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                  <button onClick={fecharModal} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
                  <button onClick={prosseguirAposAviso} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2">
                    <i className="fas fa-arrow-right"></i> Prosseguir
                  </button>
                </div>
              </div>
            )}

            {/* MODAL: EDITAR */}
            {modalTipo === 'editar' && (
              <div>
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-5">
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl shrink-0">
                      <i className="fas fa-pen"></i>
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-800">Editar lote</h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Alterações são aplicadas em cascata em todas as tabelas do lote.
                      </p>
                    </div>
                  </div>

                  {limparCalculos && (
                    <div className="mb-5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-2">
                      <i className="fas fa-exclamation-triangle"></i> Os cálculos deste lote serão apagados ao salvar.
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Novo Nome do Lote</label>
                      <input
                        type="text"
                        value={formNome}
                        onChange={(e) => setFormNome(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Nova Gráfica</label>
                      <input
                        type="text"
                        value={formGrafica}
                        onChange={(e) => setFormGrafica(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                        Tiragem em Massa <span className="text-slate-400 normal-case font-medium">(opcional)</span>
                      </label>
                      <input
                        type="number"
                        value={formTiragem}
                        onChange={(e) => setFormTiragem(e.target.value)}
                        placeholder="Deixe em branco para manter as tiragens atuais"
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Se preenchido, sobrescreve a tiragem de TODOS os SKUs do lote.</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                  <button onClick={fecharModal} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
                  <button onClick={confirmarEditar} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
                    {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Salvar Alterações
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ══════════════════ MODAL: RAIO-X (EDITAR SKU) ══════════════════ */}
      {skuModalAberto && skuBase && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={fecharSkuModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Cabeçalho */}
            <div className="p-5 border-b border-slate-100 flex items-center gap-4">
              <div className="w-11 h-11 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-lg shrink-0">
                <i className="fas fa-x-ray"></i>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-slate-800">Raio-X do SKU</h2>
                <p className="text-sm text-slate-500 font-mono truncate">{skuBase.sku_miolo}</p>
              </div>
            </div>

            {loadingDetalhe || !raioX ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-3 py-24">
                <i className="fas fa-spinner fa-spin text-4xl"></i>
                <p className="font-bold text-sm text-slate-400">Carregando detalhes...</p>
              </div>
            ) : (
              <>
                {/* Alerta de cálculo */}
                {raioX.tem_calculo && (
                  <div className={`mx-5 mt-4 rounded-lg px-3 py-2.5 text-xs font-bold flex items-center gap-2 border
                    ${quantidadesAlteradas() ? 'bg-red-50 border-red-300 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    <i className="fas fa-exclamation-triangle"></i>
                    {quantidadesAlteradas()
                      ? 'Atenção: a alteração de tiragem/paginação APAGARÁ o cálculo deste SKU ao salvar.'
                      : 'Este SKU já possui cálculo. Alterar Tiragem ou Paginação de qualquer parte apagará o cálculo.'}
                  </div>
                )}

                {/* Abas internas */}
                <div className="px-5 pt-4">
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-max">
                    {([
                      { id: 'miolo', label: 'Miolo' },
                      { id: 'capas', label: `Capas (${raioX.capas.length})` },
                      { id: 'encartes', label: `Encartes (${raioX.encartes.length})` },
                      { id: 'datas', label: 'Datas' },
                    ] as { id: AbaRaioX; label: string }[]).map(t => (
                      <button
                        key={t.id}
                        onClick={() => setAbaRaioX(t.id)}
                        className={`px-4 py-1.5 rounded-md font-bold uppercase text-[11px] transition-all
                          ${abaRaioX === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conteúdo das abas */}
                <div className="flex-1 overflow-auto px-5 py-4">
                  {/* MIOLO */}
                  {abaRaioX === 'miolo' && (
                    <div className="grid grid-cols-2 gap-4">
                      {CAMPOS_MIOLO.map(c => (
                        <div key={c.k} className={c.k === 'descricao' ? 'col-span-2' : ''}>
                          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">{c.label}</label>
                          <input
                            type={c.type}
                            value={raioX.miolo?.[c.k] ?? ''}
                            disabled={(c as any).ro}
                            onChange={(e) => updMiolo(c.k, e.target.value)}
                            className={inputCls((c as any).ro)}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CAPAS */}
                  {abaRaioX === 'capas' && (
                    raioX.capas.length === 0 ? (
                      <p className="text-sm text-slate-400 font-medium py-8 text-center">Nenhuma capa vinculada a este SKU.</p>
                    ) : raioX.capas.map((capa, idx) => (
                      <div key={capa.id ?? idx} className="border border-slate-200 rounded-xl p-4 mb-3">
                        <p className="text-[11px] font-black text-slate-400 uppercase mb-3">Capa #{idx + 1}</p>
                        <div className="grid grid-cols-2 gap-4">
                          {CAMPOS_CAPA.map(c => (
                            <div key={c.k}>
                              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">{c.label}</label>
                              <input
                                type={c.type}
                                value={capa[c.k] ?? ''}
                                disabled={(c as any).ro}
                                onChange={(e) => updItem('capas', idx, c.k, e.target.value)}
                                className={inputCls((c as any).ro)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}

                  {/* ENCARTES */}
                  {abaRaioX === 'encartes' && (
                    raioX.encartes.length === 0 ? (
                      <p className="text-sm text-slate-400 font-medium py-8 text-center">Nenhum encarte vinculado a este SKU.</p>
                    ) : raioX.encartes.map((enc, idx) => (
                      <div key={enc.id ?? idx} className="border border-slate-200 rounded-xl p-4 mb-3">
                        <p className="text-[11px] font-black text-slate-400 uppercase mb-3">Encarte #{idx + 1}</p>
                        <div className="grid grid-cols-2 gap-4">
                          {CAMPOS_ENCARTE.map(c => (
                            <div key={c.k} className={c.k === 'descricao' ? 'col-span-2' : ''}>
                              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">{c.label}</label>
                              <input
                                type={c.type}
                                value={enc[c.k] ?? ''}
                                disabled={(c as any).ro}
                                onChange={(e) => updItem('encartes', idx, c.k, e.target.value)}
                                className={inputCls((c as any).ro)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}

                  {/* DATAS */}
                  {abaRaioX === 'datas' && (
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <p className="text-[11px] font-black text-slate-400 uppercase mb-3">Datas do SKU</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="block text-[11px] font-bold uppercase text-blue-600 mb-1.5">Data de Cálculo (início no Gantt)</label>
                          <input type="date" value={forceDateInputFormat(raioX.datas?.dt_calculo)} onChange={(e) => updData('dt_calculo', e.target.value)} className={inputCls()} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">Início Imp. (Planejado)</label>
                          <input type="date" value={forceDateInputFormat(raioX.datas?.dt_plan_inicio_imp)} onChange={(e) => updData('dt_plan_inicio_imp', e.target.value)} className={inputCls()} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">Início Imp. (Replanejado)</label>
                          <input type="date" value={forceDateInputFormat(raioX.datas?.dt_replan_inicio_imp)} onChange={(e) => updData('dt_replan_inicio_imp', e.target.value)} className={inputCls()} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">Fim Aprov. Arquivo</label>
                          <input type="date" value={forceDateInputFormat(raioX.datas?.dt_fim_aprove_arquivo)} onChange={(e) => updData('dt_fim_aprove_arquivo', e.target.value)} className={inputCls()} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">Envio Tiragem</label>
                          <input type="date" value={forceDateInputFormat(raioX.datas?.dt_envio_tiragem)} onChange={(e) => updData('dt_envio_tiragem', e.target.value)} className={inputCls()} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Rodapé */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={fecharSkuModal} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
              <button onClick={confirmarEditarSku} disabled={loading || loadingDetalhe || !raioX} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
                {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Salvar SKU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ MODAL: EXCLUIR SKU ══════════════════ */}
      {skuExcluirAlvo && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setSkuExcluirAlvo(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl shrink-0">
                <i className="fas fa-trash"></i>
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-800">Excluir SKU?</h2>
                <p className="text-sm text-slate-500 mt-1">
                  O SKU <strong className="text-slate-800 font-mono">{skuExcluirAlvo.sku_miolo}</strong> será removido permanentemente de todas as tabelas (miolo, capas, encartes, kits, datas e cálculos). Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setSkuExcluirAlvo(null)} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
              <button onClick={confirmarExcluirSku} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-red-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
                {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>} Excluir SKU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ MODAL: MOVER SKU ══════════════════ */}
      {moverAlvo && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setMoverAlvo(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl shrink-0">
                  <i className="fas fa-arrows-alt"></i>
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">Mover SKU de lote</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Movendo <strong className="text-slate-800 font-mono">{moverAlvo.sku_miolo}</strong> e tudo que o acompanha (capas, encartes, kits, datas e cálculos) para outro lote.
                  </p>
                </div>
              </div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Lote de Destino</label>
              <input
                autoFocus
                type="text"
                value={moverNome}
                onChange={(e) => setMoverNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !loading) confirmarMoverSku(); }}
                placeholder="Nome do lote de destino"
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setMoverAlvo(null)} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
              <button onClick={confirmarMoverSku} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
                {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-arrows-alt"></i>} Mover SKU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ MODAL: DUPLICAR SKU ══════════════════ */}
      {duplicarAlvo && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setDuplicarAlvo(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl shrink-0">
                  <i className="fas fa-copy"></i>
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">Duplicar SKU</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Copiando <strong className="text-slate-800 font-mono">{duplicarAlvo.sku_miolo}</strong> (miolo, capas, encartes e datas) no mesmo lote. O novo SKU nasce sem cálculos.
                  </p>
                </div>
              </div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Digite o nome do novo SKU</label>
              <input
                autoFocus
                type="text"
                value={duplicarNome}
                onChange={(e) => setDuplicarNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !loading) confirmarDuplicarSku(); }}
                placeholder="Ex.: SKU-0001-COPIA"
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setDuplicarAlvo(null)} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
              <button onClick={confirmarDuplicarSku} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
                {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-copy"></i>} Duplicar SKU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}