"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';

export default function GestaoProducao() {
  const router = useRouter();
  const [feedback, setFeedback] = useState({ msg: '', tipo: '' });
  const [loading, setLoading] = useState(false);
  
  const [tabelaSelecionada, setTabelaSelecionada] = useState('prod_miolo');
  const [arquivoNome, setArquivoNome] = useState('');
  const [dadosPreview, setDadosPreview] = useState<any[]>([]);
  const [dadosParaEnviar, setDadosParaEnviar] = useState<any[]>([]);
  const [cabecalhoArquivo, setCabecalhoArquivo] = useState<string[]>([]);

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
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Cadastro de Produção</h1>
            <p className="text-slate-500 text-sm mt-1">Importação massiva de ordens e tiragens via CSV</p>
          </div>
          <button 
            onClick={baixarGabarito}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-4 py-2 rounded-lg font-bold text-xs uppercase shadow-sm transition-colors flex items-center gap-2 w-max"
          >
            <i className="fas fa-file-download text-violet-500"></i>
            Baixar Gabarito ({tabelas.find(t => t.id === tabelaSelecionada)?.nome})
          </button>
        </header>

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
                    className="w-full bg-teal-600 text-white px-4 py-3 rounded-lg text-xs uppercase font-black shadow hover:bg-teal-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
                      <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider sticky top-0 shadow-sm border-b border-slate-200">
                        <th className="p-2 border-r border-slate-200 w-10 text-center">#</th>
                        {/* Como não lemos cabeçalho real no CSV, vamos puxar as colunas lógicas do array pra gerar o Header */}
                        {dadosPreview[0].map((_: any, idx: number) => (
                          <th key={idx} className="p-2 border-r border-slate-200 last:border-0">COL {idx + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dadosPreview.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
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
      </div>
    </div>
  );
}