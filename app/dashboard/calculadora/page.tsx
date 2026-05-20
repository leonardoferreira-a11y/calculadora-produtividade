"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ==========================================
// FUNÇÕES AUXILIARES DE TEMPO E MATEMÁTICA
// ==========================================
const converterParaHorasDecimal = (timeStr: string) => {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) + ((m || 0) / 60);
};

const decimalParaHHMM = (decimalHours: number) => {
  if (!decimalHours || decimalHours <= 0) return "00:00";
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (m === 60) return `${String(h + 1).padStart(2, '0')}:00`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// O MOTOR CENTRAL DE CÁLCULO DE IMPRESSÃO
const calcularLogicaImpressao = (paginacao: number, tiragem: number, maq: any) => {
  const giroHora = maq ? Number(maq.giro_hora || maq.prod_folhas_hora || 0) : 0;
  const pgsCaderno = maq ? Number(maq.pgs_caderno || 16) : 0;
  const setupString = maq ? (maq.ajuste || '00:00') : '00:00';
  const setupUnitHrs = converterParaHorasDecimal(setupString);

  const qtdCadernos = pgsCaderno > 0 ? Math.ceil(paginacao / pgsCaderno) : 0;
  const totalGiros = qtdCadernos * tiragem;
  const rodagemPuraHrs = giroHora > 0 ? (totalGiros / giroHora) : 0;
  const setupTotalHrs = qtdCadernos * setupUnitHrs;
  const tempoTotalImpHrs = rodagemPuraHrs + setupTotalHrs;

  return { giroHora, pgsCaderno, setupString, qtdCadernos, totalGiros, rodagemPuraHrs, setupTotalHrs, tempoTotalImpHrs };
};

export default function CalculadoraProducao() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  const [miolos, setMiolos] = useState<any[]>([]);
  const [encartes, setEncartes] = useState<any[]>([]);
  const [capas, setCapas] = useState<any[]>([]);
  const [impressoras, setImpressoras] = useState<any[]>([]);
  const [planejamentos, setPlanejamentos] = useState<any[]>([]); 

  const [modalAberto, setModalAberto] = useState(false);
  const [itemAtivo, setItemAtivo] = useState<any>(null); 
  const [abaAtiva, setAbaAtiva] = useState('miolo');

  // ==========================================
  // ESTADOS GLOBAIS DE IMPRESSÃO (TODAS AS ABAS)
  // ==========================================
  const [impMiolo, setImpMiolo] = useState({ grafica: '', tipo: '', maquinaId: '' });
  const [impEncarte, setImpEncarte] = useState({ grafica: '', tipo: '', maquinaId: '' });
  const [impAdesivo, setImpAdesivo] = useState({ grafica: '', tipo: '', maquinaId: '' });
  const [impCapas, setImpCapas] = useState<Record<number, { grafica: string, tipo: string, maquinaId: string }>>({});

  useEffect(() => {
    const buscarDados = async () => {
      try {
        const res = await fetch('/api/calculadora');
        const data = await res.json();
        if (res.ok) {
          setMiolos(data.miolos || []);
          setCapas(data.capas || []);
          setEncartes(data.encartes || []);
          setImpressoras(data.impressoras || []);
          setPlanejamentos(data.planejamentos || []);
        }
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };
    buscarDados();
  }, []);

  const listaPendentes = miolos.filter(m => !planejamentos.some(p => p.sku === m.sku_miolo));
  const listaCalculados = planejamentos;

  const encarteDoItem = itemAtivo ? encartes.find(e => e.sku_miolo === itemAtivo.sku_miolo) : null;
  const capasDoItem = itemAtivo ? capas.filter(c => c.sku_ref === itemAtivo.sku_miolo) : [];

  const abrirModal = (item: any) => {
    setItemAtivo(item);
    setAbaAtiva('miolo');
    // Resetando todos os cálculos ao abrir um novo item
    setImpMiolo({ grafica: '', tipo: '', maquinaId: '' });
    setImpEncarte({ grafica: '', tipo: '', maquinaId: '' });
    setImpAdesivo({ grafica: '', tipo: '', maquinaId: '' });
    setImpCapas({});
    setModalAberto(true);
  };

  // ==========================================
  // COMPONENTE REUTILIZÁVEL: BLOCO DE IMPRESSÃO
  // ==========================================
  const RenderBlocoImpressao = ({ 
    titulo, temaCor, paginacao, tiragem, estado, setEstado 
  }: { 
    titulo: string, temaCor: 'blue' | 'amber' | 'emerald' | 'rose', 
    paginacao: number, tiragem: number, estado: any, setEstado: any 
  }) => {
    
    // Filtros em cascata (AJUSTADO PARA tipo_impressao)
    const graficasDisponiveis = [...new Set(impressoras.map(m => m.grafica))].filter(Boolean);
    const tiposDisponiveis = [...new Set(impressoras.filter(m => m.grafica === estado.grafica).map(m => m.tipo_impressao))].filter(Boolean);
    const maquinasDisponiveis = impressoras.filter(m => m.grafica === estado.grafica && m.tipo_impressao === estado.tipo);
    const maqSelected = impressoras.find(m => String(m.id) === estado.maquinaId);

    // Roda a Matemática Mágica
    const calc = calcularLogicaImpressao(paginacao, tiragem, maqSelected);

    // Classes do Tailwind dinâmicas baseadas no Tema
    const tema = {
      blue: { border: 'border-blue-200', text: 'text-blue-500', bg: 'bg-blue-50', bgResult: 'bg-blue-100', textResult: 'text-blue-700', borderResult: 'border-blue-300' },
      amber: { border: 'border-amber-200', text: 'text-amber-500', bg: 'bg-amber-50', bgResult: 'bg-amber-100', textResult: 'text-amber-700', borderResult: 'border-amber-300' },
      emerald: { border: 'border-emerald-200', text: 'text-emerald-500', bg: 'bg-emerald-50', bgResult: 'bg-emerald-100', textResult: 'text-emerald-700', borderResult: 'border-emerald-300' },
      rose: { border: 'border-rose-200', text: 'text-rose-500', bg: 'bg-rose-50', bgResult: 'bg-rose-100', textResult: 'text-rose-700', borderResult: 'border-rose-300' }
    }[temaCor];

    return (
      <div className={`bg-white p-6 rounded-xl border ${tema.border} shadow-sm border-t-4 border-t-${temaCor}-500 mb-6`}>
        <h4 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
          <i className={`fas fa-print ${tema.text}`}></i> {titulo} <span className="ml-auto text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded">Tiragem: {tiragem.toLocaleString('pt-BR')} | Págs: {paginacao}</span>
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Gráfica</label>
            <select className="w-full border border-slate-300 rounded-lg p-2.5 outline-none font-medium text-sm" value={estado.grafica} onChange={e => setEstado({ grafica: e.target.value, tipo: '', maquinaId: '' })}>
              <option value="">Selecione...</option>
              {graficasDisponiveis.map(g => <option key={g as string} value={g as string}>{g as string}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Tipo Impressão</label>
            <select className="w-full border border-slate-300 rounded-lg p-2.5 outline-none font-medium text-sm disabled:bg-slate-100" value={estado.tipo} onChange={e => setEstado({ ...estado, tipo: e.target.value, maquinaId: '' })} disabled={!estado.grafica}>
              <option value="">-</option>
              {tiposDisponiveis.map(t => <option key={t as string} value={t as string}>{t as string}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Máquina</label>
            <select className="w-full border border-slate-300 rounded-lg p-2.5 outline-none font-medium text-sm disabled:bg-slate-100 font-bold text-[#15192b]" value={estado.maquinaId} onChange={e => setEstado({ ...estado, maquinaId: e.target.value })} disabled={!estado.tipo}>
              <option value="">-</option>
              {maquinasDisponiveis.map(m => <option key={m.id} value={m.id}>{m.maquina}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300 mb-4">
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Giro/Hora</label><input type="text" readOnly value={calc.giroHora ? calc.giroHora.toLocaleString('pt-BR') : ''} className="w-full bg-slate-100 border border-slate-200 rounded p-2 text-sm font-bold text-slate-500" /></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Pgs/Caderno</label><input type="text" readOnly value={calc.pgsCaderno || ''} className="w-full bg-slate-100 border border-slate-200 rounded p-2 text-sm font-bold text-slate-500" /></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Setup Unit.</label><input type="text" readOnly value={calc.setupString} className="w-full bg-slate-100 border border-slate-200 rounded p-2 text-sm font-bold text-slate-500" /></div>
        </div>

        <div className={`grid grid-cols-4 gap-4 ${tema.bg} p-4 rounded-xl border ${tema.border} mb-6`}>
          <div><label className={`block text-[9px] font-bold ${tema.text} uppercase mb-1`}>1. Qtd Cadernos</label><input type="text" readOnly value={calc.qtdCadernos || ''} className="w-full bg-white border border-white rounded p-2 text-sm font-black text-slate-800 shadow-sm" /></div>
          <div><label className={`block text-[9px] font-bold ${tema.text} uppercase mb-1`}>2. Total Giros</label><input type="text" readOnly value={calc.totalGiros ? calc.totalGiros.toLocaleString('pt-BR') : ''} className="w-full bg-white border border-white rounded p-2 text-sm font-black text-slate-800 shadow-sm" /></div>
          <div><label className={`block text-[9px] font-bold ${tema.text} uppercase mb-1`}>3. Rodagem (HH:MM)</label><input type="text" readOnly value={decimalParaHHMM(calc.rodagemPuraHrs)} className="w-full bg-white border border-white rounded p-2 text-sm font-black text-slate-800 shadow-sm" /></div>
          <div><label className={`block text-[9px] font-bold ${tema.text} uppercase mb-1`}>4. Setup Total</label><input type="text" readOnly value={decimalParaHHMM(calc.setupTotalHrs)} className="w-full bg-white border border-white rounded p-2 text-sm font-black text-slate-800 shadow-sm" /></div>
        </div>

        <div className={`${tema.bgResult} border ${tema.borderResult} rounded-xl p-4 flex justify-between items-center shadow-inner`}>
          <span className="font-black text-slate-700 uppercase tracking-widest text-sm">⏱️ Tempo Total Impressão</span>
          <span className={`text-3xl font-black ${tema.textResult} bg-white px-8 py-2 rounded-lg shadow-sm border ${tema.borderResult}`}>{decimalParaHHMM(calc.tempoTotalImpHrs)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      {/* ... [CABEÇALHO FICA IGUAL] ... */}
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-8 border-b border-slate-200 pb-6">
        <div><h1 className="text-3xl font-black text-[#15192b]">Calculadora de Produção</h1></div>
      </header>

      <main className="max-w-7xl mx-auto mb-12">
        {listaPendentes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {listaPendentes.map((item) => {
              const temCapa = capas.some(c => c.sku_ref === item.sku_miolo);
              return (
                <div key={item.id} className={`bg-white rounded-xl border border-slate-200 border-t-4 shadow-sm p-5 flex flex-col ${temCapa ? 'border-t-amber-500' : 'border-t-red-500'}`}>
                  <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3"><span className="text-sm font-black text-slate-800">🆔 {item.sku_miolo}</span><span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${temCapa ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{temCapa ? 'Pendente ⚠️' : 'Sem Capa 🚫'}</span></div>
                  <div className="flex-1 mb-5"><label className="text-[10px] font-bold text-slate-400 uppercase">Descrição</label><p className="text-sm font-bold text-slate-700">{item.descricao}</p></div>
                  <button onClick={() => abrirModal(item)} disabled={!temCapa} className={`w-full py-3 rounded-lg text-xs font-black uppercase transition-all ${temCapa ? 'bg-[#15192b] text-white hover:bg-black' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>Calcular Produção</button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* O SUPER MODAL */}
      {modalAberto && itemAtivo && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
            
            <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-start shrink-0">
              <div><h2 className="text-2xl font-black text-[#15192b] mb-1">{itemAtivo.sku_miolo}</h2><p className="text-sm font-medium text-slate-500">{itemAtivo.descricao}</p></div>
            </div>

            <div className="flex bg-[#15192b] px-6 shrink-0">
              <button onClick={() => setAbaAtiva('miolo')} className={`px-6 py-4 text-sm font-bold transition-all border-b-4 ${abaAtiva === 'miolo' ? 'text-white border-blue-500 bg-white/5' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>📄 1. Miolo</button>
              <button onClick={() => setAbaAtiva('encartes')} className={`px-6 py-4 text-sm font-bold transition-all border-b-4 ${abaAtiva === 'encartes' ? 'text-white border-amber-500 bg-white/5' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>📑 2. Encartes</button>
              <button onClick={() => setAbaAtiva('capas')} className={`px-6 py-4 text-sm font-bold transition-all border-b-4 ${abaAtiva === 'capas' ? 'text-white border-emerald-500 bg-white/5' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>📘 3. Capas ({capasDoItem.length})</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
              
              {/* ABA MIOLO */}
              {abaAtiva === 'miolo' && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6">
                    <h4 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2"><span className="bg-slate-100 px-2 py-0.5 rounded text-xs">1</span> Parâmetros do Miolo</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300">
                      <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Lombada / Págs</label><span className="font-black text-[#15192b] text-lg">{itemAtivo.lombada}mm | {itemAtivo.paginacao}p</span></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tiragem Total</label><span className="font-black text-blue-600 text-lg">{itemAtivo.tiragem.toLocaleString('pt-BR')}</span></div>
                    </div>
                  </div>

                  {/* IMPRESSÃO DO MIOLO CHAMANDO O MOTOR */}
                  <RenderBlocoImpressao 
                    titulo="Planejamento de Impressão (Miolo)" temaCor="blue" 
                    paginacao={Number(itemAtivo.paginacao) || 0} tiragem={Number(itemAtivo.tiragem) || 0} 
                    estado={impMiolo} setEstado={setImpMiolo} 
                  />
                </div>
              )}

              {/* ABA ENCARTES */}
              {abaAtiva === 'encartes' && (
                <div className="space-y-6 animate-in fade-in">
                  {!encarteDoItem ? (
                    <div className="text-center p-12 bg-white rounded-xl border border-slate-200"><p className="font-bold text-slate-500">Sem encartes atrelados.</p></div>
                  ) : (
                    <>
                      {/* IMPRESSÃO DO ENCARTE */}
                      {Number(encarteDoItem.paginacao_encarte) > 0 && (
                        <RenderBlocoImpressao 
                          titulo="Impressão de Encarte" temaCor="amber" 
                          paginacao={Number(encarteDoItem.paginacao_encarte)} tiragem={Number(itemAtivo.tiragem)} 
                          estado={impEncarte} setEstado={setImpEncarte} 
                        />
                      )}
                      {/* IMPRESSÃO DO ADESIVO */}
                      {Number(encarteDoItem.paginacao_adesivo) > 0 && (
                        <RenderBlocoImpressao 
                          titulo="Impressão de Adesivo" temaCor="rose" 
                          paginacao={Number(encarteDoItem.paginacao_adesivo)} tiragem={Number(itemAtivo.tiragem)} 
                          estado={impAdesivo} setEstado={setImpAdesivo} 
                        />
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ABA CAPAS */}
              {abaAtiva === 'capas' && (
                <div className="space-y-6 animate-in fade-in">
                  {capasDoItem.map((capa, idx) => (
                    <div key={capa.id} className="relative">
                      {/* TÍTULO DA CAPA */}
                      <div className="bg-slate-800 text-white p-4 rounded-t-xl flex justify-between items-center">
                        <span className="font-black text-lg">Capa {idx + 1}: {capa.tipo_capa} <span className="text-slate-400 text-sm font-normal">({capa.cores})</span></span>
                        <span className="bg-slate-700 px-3 py-1 rounded text-xs font-bold uppercase">Acabamento: {capa.acabamento}</span>
                      </div>
                      <div className="bg-slate-100 p-2 border-x border-slate-200">
                         {/* IMPRESSÃO DA CAPA (Estado Dinâmico por Index) */}
                         <RenderBlocoImpressao 
                           titulo={`Impressão da Capa ${idx + 1}`} temaCor="emerald" 
                           paginacao={Number(capa.paginacao) || 0} tiragem={Number(capa.tiragem) || 0} 
                           estado={impCapas[idx] || { grafica: '', tipo: '', maquinaId: '' }} 
                           setEstado={(novoEstado: any) => setImpCapas({ ...impCapas, [idx]: { ...(impCapas[idx] || {}), ...novoEstado } })} 
                         />
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>

            <div className="bg-slate-50 p-6 border-t border-slate-200 flex justify-end items-center gap-4 shrink-0">
              <button className="text-sm font-bold text-slate-400 hover:text-slate-700 transition-colors" onClick={() => setModalAberto(false)}>Cancelar</button>
              <button className="bg-[#15192b] text-white px-8 py-3 rounded-xl font-black shadow-xl hover:scale-105 transition-all"><i className="fas fa-save mr-2"></i> Salvar Roteiro</button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}