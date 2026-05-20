"use client";
import { useEffect, useState } from 'react';

const somarTempos = (t1: string, t2: string) => {
  const [h1, m1] = (t1 || '00:00').split(':').map(Number);
  const [h2, m2] = (t2 || '00:00').split(':').map(Number);
  
  const totalMinutos = (h1 || 0) * 60 + (m1 || 0) + (h2 || 0) * 60 + (m2 || 0);
  const h = Math.floor(totalMinutos / 60);
  const m = totalMinutos % 60;
  
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export default function ParqueMaquinas() {
  const [maquinas, setMaquinas] = useState([]);
  const [feedback, setFeedback] = useState({ msg: '', tipo: '' });
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [erroForm, setErroForm] = useState('');

  const [nivelLogado, setNivelLogado] = useState('');
  const [empresaLogada, setEmpresaLogada] = useState('');

  // ESTADO DOS FILTROS DROPDOWN
  const [dropdownAberto, setDropdownAberto] = useState<'graficas' | 'processos' | 'tecnologias' | null>(null);
  const [filtros, setFiltros] = useState<{ graficas: string[]; processos: string[]; tecnologias: string[]; }>({
    graficas: [],
    processos: [],
    tecnologias: []
  });

  const formInicial = {
    grafica: '',
    tipo: 'Impressão',
    tecnologia: 'Offset',
    modelo: '',
    maq_cores: 0,
    maquinas: 1,
    pessoas: 1,
    produtividade_unit: 0,
    produtividade_total: 0,
    metrica: 'Giros/Hora',
    limite_lombada: 0,
    setup: '00:00',
    frete: '00:00',
    ajuste: '00:00',
    pgs_caderno: 16,
    gavetas: 0,
    ciclos_min: 0,
    divisao_mm: 0,
    velocidade_limite: 0
  };
  const [formData, setFormData] = useState(formInicial);

  const mostrarAvisoTela = (msg: string, tipo: 'sucesso' | 'erro') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: '' }), 5000);
  };

  const buscarDados = async () => {
    try {
      const res = await fetch(`/api/maquinas?ts=${Date.now()}`, { cache: 'no-store' });
      const dados = await res.json();
      setMaquinas(dados);
    } catch (error) {
      console.error("Erro ao buscar máquinas:", error);
    }
  };

  useEffect(() => {
    setNivelLogado(String(localStorage.getItem('usuarioNivel')).toUpperCase());
    setEmpresaLogada(String(localStorage.getItem('usuarioEmpresa')).toUpperCase());
    buscarDados();
  }, []);

  useEffect(() => {
    const unit = Number(formData.produtividade_unit) || 0;
    const qtd = Number(formData.maquinas) || 0;
    setFormData(prev => ({ ...prev, produtividade_total: unit * qtd }));
  }, [formData.produtividade_unit, formData.maquinas]);

  useEffect(() => {
    const soma = somarTempos(formData.setup, formData.frete);
    setFormData(prev => ({ ...prev, ajuste: soma }));
  }, [formData.setup, formData.frete]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroForm('');

    let configuracoesExtras = {};
    if (formData.tipo === 'Impressão') {
      configuracoesExtras = { pgs_caderno: Number(formData.pgs_caderno) };
    } else if (formData.tipo === 'Alceadeira') {
      configuracoesExtras = { gavetas: Number(formData.gavetas) };
    } else if (formData.tipo === 'Coladeira') {
      configuracoesExtras = { gavetas: Number(formData.gavetas) };
    } else if (formData.tipo === 'Grampo') {
      configuracoesExtras = { gavetas: Number(formData.gavetas) };
    } else if (formData.tipo === 'Espiral') {
      configuracoesExtras = {
        ciclos_min: Number(formData.ciclos_min),
        divisao_mm: Number(formData.divisao_mm),
        velocidade_limite: Number(formData.velocidade_limite)
      };
    }

    const payload = { ...formData, configuracoes: configuracoesExtras };
    const url = editandoId ? `/api/maquinas/${editandoId}` : '/api/maquinas';
    const metodo = editandoId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        mostrarAvisoTela('Equipamento salvo com sucesso!', 'sucesso');
        setModalAberto(false);
        await buscarDados();
      } else {
        setErroForm('Erro do servidor ao salvar equipamento.');
      }
    } catch (error) {
      setErroForm('Erro de conexão ao tentar salvar.');
    }
  };

  const podeEditar = nivelLogado === 'ADMIN' || nivelLogado === 'ADMIN_MAQ';

  const maquinasPermitidas = maquinas.filter((m: any) => {
    if (nivelLogado === 'USER_GRAFICA') {
      return String(m.grafica).toUpperCase() === empresaLogada;
    }
    return true;
  });

  const toggleFiltro = (categoria: 'graficas' | 'processos' | 'tecnologias', valor: string) => {
    setFiltros(prev => {
      const atual = prev[categoria];
      if (atual.includes(valor)) return { ...prev, [categoria]: atual.filter(v => v !== valor) };
      return { ...prev, [categoria]: [...atual, valor] };
    });
  };

  const opcoesGraficas = Array.from(new Set(maquinasPermitidas.map((m: any) => m.grafica).filter(Boolean)));
  const opcoesProcessos = Array.from(new Set(maquinasPermitidas.map((m: any) => m.tipo).filter(Boolean)));
  const opcoesTecnologias = Array.from(new Set(maquinasPermitidas.map((m: any) => m.tecnologia).filter(Boolean)));

  const maquinasFiltradas = maquinasPermitidas.filter((m: any) => {
    const matchGrafica = filtros.graficas.length === 0 || filtros.graficas.includes(m.grafica);
    const matchProcesso = filtros.processos.length === 0 || filtros.processos.includes(m.tipo);
    const matchTecnologia = filtros.tecnologias.length === 0 || filtros.tecnologias.includes(m.tecnologia);
    return matchGrafica && matchProcesso && matchTecnologia;
  });

  const totalFiltrosAtivos = filtros.graficas.length + filtros.processos.length + filtros.tecnologias.length;

  // ----------------------------------------------------------------------
  // FUNÇÃO DE DUPLICAÇÃO DE MÁQUINAS COM OS ESTADOS CORRETOS DO SEU PROJETO
  // ----------------------------------------------------------------------
  const duplicarMaquina = (maquinaOriginal: any) => {
    const conf = maquinaOriginal.configuracoes || {};
    
    // Alimenta o formulário com as propriedades e abre o modal limpo para salvar como nova
    setFormData({
      ...formInicial,
      ...maquinaOriginal,
      ...conf,
      id: null, // Força a API a entender como um novo POST insert
      modelo: `${maquinaOriginal.modelo} (Cópia)`,
      tecnologia: maquinaOriginal.tecnologia || 'Offset'
    });

    setEditandoId(null); // Sinaliza que NÃO é uma alteração de registro existente
    setErroForm('');
    setModalAberto(true); // Abre o modal do formulário do projeto
  };

  return (
    <div className="w-full relative">
      
      {dropdownAberto && (
        <div className="fixed inset-0 z-30" onClick={() => setDropdownAberto(null)}></div>
      )}

      {feedback.msg && (
        <div className={`mb-6 px-6 py-4 rounded-lg border flex items-center gap-4 transition-all
          ${feedback.tipo === 'sucesso' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          <i className={`fas ${feedback.tipo === 'sucesso' ? 'fa-check-circle' : 'fa-times-circle'} text-xl`}></i>
          <p className="font-bold">{feedback.msg}</p>
        </div>
      )}

      <header className="flex justify-between items-end mb-6 border-b-2 border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase">Parque de Máquinas</h1>
          <p className="text-gray-600 font-medium mt-1">
            {nivelLogado === 'USER_GRAFICA' ? 'Visualização dos equipamentos da sua unidade.' : 'Cadastro unificado de equipamentos e parâmetros operacionais.'}
          </p>
        </div>
        
        {podeEditar && (
          <button 
            onClick={() => { setEditandoId(null); setFormData(formInicial); setErroForm(''); setModalAberto(true); }} 
            className="bg-blue-600 text-white px-6 py-2.5 rounded hover:bg-blue-700 transition-colors font-bold shadow-sm flex items-center gap-2"
          >
            <i className="fas fa-plus"></i> Nova Máquina
          </button>
        )}
      </header>

      {/* FILTROS */}
      {maquinasPermitidas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-6 relative z-40">
          <span className="text-sm font-bold text-slate-500 uppercase tracking-wider mr-2">
            <i className="fas fa-filter mr-1"></i> Filtros:
          </span>

          {opcoesGraficas.length > 1 && (
            <div className="relative">
              <button 
                onClick={() => setDropdownAberto(dropdownAberto === 'graficas' ? null : 'graficas')}
                className={`border px-4 py-2 rounded text-sm font-bold shadow-sm flex items-center justify-between min-w-[200px] transition-colors
                  ${dropdownAberto === 'graficas' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-gray-300 text-slate-700 hover:bg-slate-50'}`}
              >
                <span>
                  Gráficas {filtros.graficas.length > 0 && <span className="ml-1 bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs">{filtros.graficas.length}</span>}
                </span>
                <i className={`fas fa-chevron-${dropdownAberto === 'graficas' ? 'up' : 'down'} ml-3 opacity-50`}></i>
              </button>
              
              {dropdownAberto === 'graficas' && (
                <div className="absolute top-full left-0 mt-2 w-full min-w-[240px] bg-white border border-gray-200 shadow-xl rounded-lg py-2 max-h-60 overflow-y-auto">
                  {opcoesGraficas.map(g => (
                    <label key={g} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={filtros.graficas.includes(g)} onChange={() => toggleFiltro('graficas', g)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                      <span className="text-sm font-medium text-slate-700 uppercase">{g}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {opcoesProcessos.length > 0 && (
            <div className="relative">
              <button 
                onClick={() => setDropdownAberto(dropdownAberto === 'processos' ? null : 'processos')}
                className={`border px-4 py-2 rounded text-sm font-bold shadow-sm flex items-center justify-between min-w-[200px] transition-colors
                  ${dropdownAberto === 'processos' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-gray-300 text-slate-700 hover:bg-slate-50'}`}
              >
                <span>
                  Processos {filtros.processos.length > 0 && <span className="ml-1 bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs">{filtros.processos.length}</span>}
                </span>
                <i className={`fas fa-chevron-${dropdownAberto === 'processos' ? 'up' : 'down'} ml-3 opacity-50`}></i>
              </button>
              
              {dropdownAberto === 'processos' && (
                <div className="absolute top-full left-0 mt-2 w-full min-w-[240px] bg-white border border-gray-200 shadow-xl rounded-lg py-2 max-h-60 overflow-y-auto">
                  {opcoesProcessos.map(p => (
                    <label key={p} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={filtros.processos.includes(p)} onChange={() => toggleFiltro('processos', p)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                      <span className="text-sm font-medium text-slate-700">{p}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {opcoesTecnologias.length > 0 && (
            <div className="relative">
              <button 
                onClick={() => setDropdownAberto(dropdownAberto === 'tecnologias' ? null : 'tecnologias')}
                className={`border px-4 py-2 rounded text-sm font-bold shadow-sm flex items-center justify-between min-w-[200px] transition-colors
                  ${dropdownAberto === 'tecnologias' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-gray-300 text-slate-700 hover:bg-slate-50'}`}
              >
                <span>
                  Tecnologias {filtros.tecnologias.length > 0 && <span className="ml-1 bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs">{filtros.tecnologias.length}</span>}
                </span>
                <i className={`fas fa-chevron-${dropdownAberto === 'tecnologias' ? 'up' : 'down'} ml-3 opacity-50`}></i>
              </button>
              
              {dropdownAberto === 'tecnologias' && (
                <div className="absolute top-full left-0 mt-2 w-full min-w-[240px] bg-white border border-gray-200 shadow-xl rounded-lg py-2 max-h-60 overflow-y-auto">
                  {opcoesTecnologias.map(t => (
                    <label key={t} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={filtros.tecnologias.includes(t)} onChange={() => toggleFiltro('tecnologias', t)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                      <span className="text-sm font-medium text-slate-700">{t}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {totalFiltrosAtivos > 0 && (
            <button 
              onClick={() => setFiltros({ graficas: [], processos: [], tecnologias: [] })} 
              className="ml-auto text-xs font-bold text-red-500 hover:text-red-700 uppercase transition-colors px-4 py-2"
            >
              <i className="fas fa-times-circle mr-1"></i> Limpar ({totalFiltrosAtivos})
            </button>
          )}
        </div>
      )}

      {/* TABELA DE MÁQUINAS */}
      <div className="bg-white border border-gray-300 rounded-lg shadow-sm overflow-x-auto w-full relative z-10">
        <table className="w-full text-left border-collapse min-w-[1300px]">
          <thead className="bg-slate-100 border-b border-gray-300 text-xs uppercase text-slate-700 font-bold whitespace-nowrap">
            <tr>
              <th className="p-3">Gráfica</th>
              <th className="p-3">Processo</th>
              <th className="p-3">Tecnologia</th>
              <th className="p-3">Modelo / Nome</th>
              <th className="p-3 text-center">Cores</th>
              <th className="p-3 text-center">Qtd Máq</th>
              <th className="p-3 text-center">Op (Pess)</th>
              <th className="p-3 text-right">Prod. Unitária</th>
              <th className="p-3 text-right">Prod. Total</th>
              <th className="p-3">Métrica</th>
              <th className="p-3 text-center">Lomb (mm)</th>
              <th className="p-3 text-center">Setup</th>
              <th className="p-3 text-center">Frete</th>
              <th className="p-3 text-center">Stp+Frete</th>
              <th className="p-3">Parâmetros Extras</th>
              {podeEditar && <th className="p-3 text-center">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-sm text-slate-700">
            {maquinasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={podeEditar ? 16 : 15} className="p-6 text-center text-gray-500 font-medium">
                  {maquinas.length === 0 ? 'Nenhum equipamento cadastrado no parque.' : 'Nenhuma máquina encontrada para os filtros selecionados.'}
                </td>
              </tr>
            ) : (
              maquinasFiltradas.map((m: any) => {
                const conf = m.configuracoes || {};
                
                let textoExtras = "-";
                if (m.tipo === 'Impressão' && conf.pgs_caderno) textoExtras = `Págs/Cad: ${conf.pgs_caderno}`;
                if (m.tipo === 'Alceadeira' && conf.gavetas) textoExtras = `Gavetas: ${conf.gavetas}`;
                if (m.tipo === 'Coladeira' && conf.gavetas) textoExtras = `Gavetas: ${conf.gavetas}`;
                if (m.tipo === 'Grampo' && conf.gavetas) textoExtras = `Gavetas: ${conf.gavetas}`;
                if (m.tipo === 'Espiral') {
                  textoExtras = `Ciclos: ${conf.ciclos_min || 0} | Div: ${conf.divisao_mm || 0}mm | Lim: ${conf.velocidade_limite || 0}`;
                }

                return (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors whitespace-nowrap">
                    <td className="p-3 font-medium uppercase">{m.grafica}</td>
                    <td className="p-3">{m.tipo}</td>
                    <td className="p-3">{m.tecnologia || '-'}</td>
                    <td className="p-3 font-medium max-w-[180px] truncate" title={m.modelo}>{m.modelo}</td>
                    <td className="p-3 text-center">{m.maq_cores || 0}</td>
                    <td className="p-3 text-center font-bold">{m.maquinas}</td>
                    <td className="p-3 text-center">{m.pessoas}</td>
                    <td className="p-3 text-right">{Number(m.produtividade_unit).toLocaleString('pt-BR')}</td>
                    <td className="p-3 text-right font-bold">{Number(m.produtividade_total).toLocaleString('pt-BR')}</td>
                    <td className="p-3 text-slate-500 text-xs">{m.metrica || '-'}</td>
                    <td className="p-3 text-center">{m.limite_lombada || 0}</td>
                    <td className="p-3 text-center font-mono text-xs">{m.setup}</td>
                    <td className="p-3 text-center font-mono text-xs">{m.frete}</td>
                    <td className="p-3 text-center font-mono text-xs font-bold">{m.ajuste}</td>
                    <td className="p-3 text-slate-500 text-xs">{textoExtras}</td>
                    
                    {podeEditar && (
                      <td className="p-3 text-center flex items-center justify-center gap-1">
                        <button 
                          onClick={() => { 
                            setEditandoId(m.id);
                            setFormData({
                              ...formInicial,
                              ...m,
                              tecnologia: m.tecnologia || 'Offset',
                              ...conf
                            }); 
                            setErroForm(''); 
                            setModalAberto(true); 
                          }} 
                          className="text-blue-600 hover:text-blue-800 font-bold uppercase text-[11px] border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded transition-colors"
                        >
                          Editar
                        </button>

                        {/* 🔴 BOTÃO DUPLICAR CORRIGIDO DA LINHA (LENDO A VARIÁVEL M DO MAP) */}
                        <button 
                          onClick={() => duplicarMaquina(m)}
                          className="text-slate-400 hover:text-blue-600 transition-colors px-2 text-base"
                          title="Duplicar Especificações"
                        >
                          <i className="fas fa-copy"></i>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DE CADASTRO/EDIÇÃO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center shrink-0">
              <h2 className="text-lg font-bold uppercase tracking-wider">{editandoId ? 'Editar Equipamento' : 'Cadastrar Equipamento'}</h2>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-white"><i className="fas fa-times text-xl"></i></button>
            </div>
            
            <form onSubmit={salvar} className="p-6 grid grid-cols-3 gap-4 overflow-y-auto" autoComplete="off">
              {erroForm && (
                <div className="col-span-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm font-bold flex items-center gap-2 mb-2">
                  <i className="fas fa-exclamation-circle text-red-500"></i>
                  {erroForm}
                </div>
              )}

              <div className="col-span-3 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Gráfica / Empresa <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.grafica || ''} onChange={e => setFormData({...formData, grafica: e.target.value.toUpperCase()})} placeholder="Ex: WALPRINT" className="w-full border border-gray-300 rounded p-2 text-sm uppercase" />
              </div>

              <div className="col-span-3 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Tipo de Processo</label>
                <select value={formData.tipo || ''} onChange={e => setFormData({...formData, tipo: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm font-bold">
                  <option value="Impressão">Impressão (Miolo/Capa/Enc)</option>
                  <option value="Dobra">Dobra</option>
                  <option value="Alceadeira">Alceadeira</option>
                  <option value="Coladeira">Coladeira</option>
                  <option value="Espiral">Furação / Espiralação</option>
                  <option value="Grampo">Canoa / Grampo</option>
                  <option value="Corte">Corte e Vinco</option>
                  <option value="Beneficiamento">Beneficiamento</option>
                  <option value="Empastamento">Empastamento</option>
                  <option value="Shrink">Shrink</option>
                  <option value="Encaixotamento">Encaixotamento</option>
                </select>
              </div>

              <div className="col-span-3 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Tecnologia</label>
                <select value={formData.tecnologia || ''} onChange={e => setFormData({...formData, tecnologia: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm font-bold text-slate-700">
                  <option value="Offset">Offset (Plana/Rotativa)</option>
                  <option value="Digital">Digital (Laser/Jato Tinta)</option>
                  <option value="Automática">Automática</option>
                  <option value="Semiautomática">Semiautomática</option>
                  <option value="Manual">Manual / Mecânica</option>
                </select>
              </div>

              <div className="col-span-3">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Modelo / Nome Máquina <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.modelo || ''} onChange={e => setFormData({...formData, modelo: e.target.value})} placeholder="Ex: Speedmaster XL 75" className="w-full border border-gray-300 rounded p-2 text-sm" />
              </div>

              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Qtd Cores Máq</label>
                <input type="number" min="0" value={formData.maq_cores} onChange={e => setFormData({...formData, maq_cores: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm" />
              </div>

              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Qtd de Máquinas</label>
                <input type="number" min="1" value={formData.maquinas} onChange={e => setFormData({...formData, maquinas: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm font-bold" />
              </div>

              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Operadores (Pessoas)</label>
                <input type="number" min="1" value={formData.pessoas} onChange={e => setFormData({...formData, pessoas: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm" />
              </div>

              <div className="col-span-3 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Produtividade Unitária</label>
                <input type="number" min="0" value={formData.produtividade_unit} onChange={e => setFormData({...formData, produtividade_unit: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm font-bold" />
              </div>

              <div className="col-span-3 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Métrica de Velocidade</label>
                <input type="text" value={formData.metrica || ''} onChange={e => setFormData({...formData, metrica: e.target.value})} placeholder="Ex: Giros/Hora, Folhas/Hora" className="w-full border border-gray-300 rounded p-2 text-sm text-slate-700 font-bold" />
              </div>

              <div className="col-span-3 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Produtividade Total (Auto)</label>
                <input type="text" readOnly value={formData.produtividade_total.toLocaleString('pt-BR')} className="w-full bg-slate-100 border border-gray-200 rounded p-2 text-sm font-black text-slate-700" />
              </div>

              <div className="col-span-3 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Limite Lombada (mm)</label>
                <input type="number" min="0" value={formData.limite_lombada} onChange={e => setFormData({...formData, limite_lombada: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm" />
              </div>

              <div className="col-span-3 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4 mt-2">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Tempo Setup (hh:mm)</label>
                  <input type="text" value={formData.setup || ''} onChange={e => setFormData({...formData, setup: e.target.value})} placeholder="00:00" className="w-full border border-gray-300 rounded p-2 text-sm font-mono text-center" />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Tempo Frete (hh:mm)</label>
                  <input type="text" value={formData.frete || ''} onChange={e => setFormData({...formData, frete: e.target.value})} placeholder="00:00" className="w-full border border-gray-300 rounded p-2 text-sm font-mono text-center" />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Setup + Frete (Auto)</label>
                  <input type="text" readOnly value={formData.ajuste || '00:00'} className="w-full bg-slate-100 border border-gray-200 rounded p-2 text-sm font-mono font-black text-slate-700 text-center" />
                </div>
              </div>

              {formData.tipo === 'Impressão' && (
                <div className="col-span-3 bg-blue-50 border border-blue-200 p-4 rounded-lg grid grid-cols-3 gap-4 mt-2">
                  <div className="col-span-3"><h5 className="text-xs font-black text-blue-900 uppercase tracking-wider">⚙️ Configurações de Impressão</h5></div>
                  <div>
                    <label className="block text-xs font-bold text-blue-700 mb-1">Págs por Caderno</label>
                    <input type="number" min="1" value={formData.pgs_caderno} onChange={e => setFormData({...formData, pgs_caderno: Number(e.target.value)})} className="w-full border border-blue-300 rounded p-2 text-sm bg-white font-bold" />
                  </div>
                </div>
              )}

              {formData.tipo === 'Alceadeira' && (
                <div className="col-span-3 bg-amber-50 border border-amber-200 p-4 rounded-lg grid grid-cols-3 gap-4 mt-2">
                  <div className="col-span-3"><h5 className="text-xs font-black text-amber-900 uppercase tracking-wider">⚙️ Configurações de Alceamento</h5></div>
                  <div>
                    <label className="block text-xs font-bold text-amber-700 mb-1">Quantidade de Gavetas</label>
                    <input type="number" min="1" value={formData.gavetas} onChange={e => setFormData({...formData, gavetas: Number(e.target.value)})} className="w-full border border-amber-300 rounded p-2 text-sm bg-white font-bold" />
                  </div>
                </div>
              )}

              {formData.tipo === 'Coladeira' && (
                <div className="col-span-3 bg-amber-50 border border-amber-200 p-4 rounded-lg grid grid-cols-3 gap-4 mt-2">
                  <div className="col-span-3"><h5 className="text-xs font-black text-amber-900 uppercase tracking-wider">⚙️ Configurações de Coladeira</h5></div>
                  <div>
                    <label className="block text-xs font-bold text-amber-700 mb-1">Quantidade de Gavetas</label>
                    <input type="number" min="1" value={formData.gavetas} onChange={e => setFormData({...formData, gavetas: Number(e.target.value)})} className="w-full border border-amber-300 rounded p-2 text-sm bg-white font-bold" />
                  </div>
                </div>
              )}

              {formData.tipo === 'Grampo' && (
                <div className="col-span-3 bg-amber-50 border border-amber-200 p-4 rounded-lg grid grid-cols-3 gap-4 mt-2">
                  <div className="col-span-3"><h5 className="text-xs font-black text-amber-900 uppercase tracking-wider">⚙️ Configurações de Grampeadeira</h5></div>
                  <div>
                    <label className="block text-xs font-bold text-amber-700 mb-1">Quantidade de Gavetas</label>
                    <input type="number" min="1" value={formData.gavetas} onChange={e => setFormData({...formData, gavetas: Number(e.target.value)})} className="w-full border border-amber-300 rounded p-2 text-sm bg-white font-bold" />
                  </div>
                </div>
              )}

              {formData.tipo === 'Espiral' && (
                <div className="col-span-3 bg-purple-50 border border-purple-200 p-4 rounded-lg grid grid-cols-3 gap-4 mt-2">
                  <div className="col-span-3"><h5 className="text-xs font-black text-purple-900 uppercase tracking-wider">⚙️ Configurações de Espiralação Automática</h5></div>
                  <div>
                    <label className="block text-xs font-bold text-purple-700 mb-1">Ciclos por Minuto</label>
                    <input type="number" min="0" value={formData.ciclos_min} onChange={e => setFormData({...formData, ciclos_min: Number(e.target.value)})} className="w-full border border-purple-300 rounded p-2 text-sm bg-white font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-purple-700 mb-1">Divisão (mm)</label>
                    <input type="number" step="0.01" min="0" value={formData.divisao_mm} onChange={e => setFormData({...formData, divisao_mm: Number(e.target.value)})} className="w-full border border-purple-300 rounded p-2 text-sm bg-white font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-purple-700 mb-1">Velocidade Limite (L/H)</label>
                    <input type="number" min="0" value={formData.velocidade_limite} onChange={e => setFormData({...formData, velocidade_limite: Number(e.target.value)})} className="w-full border border-purple-300 rounded p-2 text-sm bg-white font-bold" />
                  </div>
                </div>
              )}

              <div className="col-span-3 mt-4 pt-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setModalAberto(false)} className="px-5 py-2.5 text-sm font-bold text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50 rounded transition-colors">Cancelar</button>
                <button type="submit" className="bg-blue-600 text-white px-6 py-2.5 rounded hover:bg-blue-700 font-bold shadow-sm">Salvar Máquina</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}