"use client";
import { useEffect, useState } from 'react';

export default function ControleAcessos() {
  const [usuarios, setUsuarios] = useState([]);
  const [feedback, setFeedback] = useState({ msg: '', tipo: '' });
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  
  const [erroForm, setErroForm] = useState('');
  
  // NOVO: Estado para ler quem está logado
  const [nivelLogado, setNivelLogado] = useState('');

  // BARREIRA TEMPORÁRIA: exige senha para abrir a tela de cadastros/acessos.
  // (provisório — os níveis de acesso reais serão ajustados depois)
  const SENHA_ACESSO = '27031999';
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [senhaInput, setSenhaInput] = useState('');
  const [erroSenha, setErroSenha] = useState('');
  
  const formInicial = { 
    nome: '', 
    email: '', 
    empresa: '', 
    nivel_permissao: 'USER_GRAFICA', 
    status: 'Ativo',
    senha: '' 
  };
  const [formData, setFormData] = useState(formInicial);

  const mostrarAvisoTela = (msg: string, tipo: 'sucesso' | 'erro') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: '' }), 5000);
  };

  const buscarDados = async () => {
    try {
      const res = await fetch(`/api/usuarios?ts=${Date.now()}`, { cache: 'no-store' });
      const dados = await res.json();
      setUsuarios(dados);
    } catch (error) { 
      console.error(error); 
    }
  };

  useEffect(() => {
    // Pega o nível de permissão de quem acabou de logar
    const nivel = localStorage.getItem('usuarioNivel') || '';
    setNivelLogado(nivel);

    // Mantém liberado durante a sessão do navegador se já validou a senha.
    if (sessionStorage.getItem('acessos_desbloqueado') === '1') {
      setDesbloqueado(true);
    }

    // Só busca os dados do banco se for ADMIN
    if (nivel === 'ADMIN') {
      buscarDados();
    }
  }, []);

  const validarSenhaAcesso = (e: React.FormEvent) => {
    e.preventDefault();
    if (senhaInput === SENHA_ACESSO) {
      sessionStorage.setItem('acessos_desbloqueado', '1');
      setDesbloqueado(true);
      setSenhaInput('');
      setErroSenha('');
    } else {
      setErroSenha('Senha incorreta. Tente novamente.');
      setSenhaInput('');
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroForm('');

    // VALIDAÇÃO DE SENHA (Sem espaços, mínimo 6 chars, 1 letra, 1 número)
    if (formData.senha) {
      const temLetra = /[a-zA-Z]/.test(formData.senha);
      const temNumero = /[0-9]/.test(formData.senha);
      const temEspaco = /\s/.test(formData.senha);
      const temTamanhoMinimo = formData.senha.length >= 6;

      if (temEspaco) {
        setErroForm('A senha não pode conter espaços em branco.');
        return; 
      }
      if (!temLetra || !temNumero || !temTamanhoMinimo) {
        setErroForm('A senha deve ter no mínimo 6 caracteres, contendo pelo menos 1 letra e 1 número.');
        return; 
      }
    }

    const url = editandoId ? `/api/usuarios/${editandoId}` : '/api/usuarios';
    const metodo = editandoId ? 'PUT' : 'POST';
    
    try {
      const res = await fetch(url, { 
        method: metodo, 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(formData) 
      });
      
      if (res.ok) { 
        mostrarAvisoTela(`Usuário salvo com sucesso!`, 'sucesso'); 
        setModalAberto(false); 
        await buscarDados(); 
      } else {
        setErroForm('Erro do servidor ao salvar usuário.');
      }
    } catch (error) { 
      setErroForm('Erro de conexão ao tentar salvar.'); 
    }
  };

  // BLOQUEIO DE TELA (Mostra isso se ele digitar a URL direto)
  // 👇 Ajuste esta linha do IF:
  if (nivelLogado && String(nivelLogado).toUpperCase() !== 'ADMIN') {
    return (
      <div className="w-full flex flex-col items-center justify-center py-20 mt-10 bg-white border border-red-200 rounded-xl shadow-sm">
        <i className="fas fa-lock text-6xl text-red-500 mb-4"></i>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Acesso Negado</h1>
        <p className="text-sm text-slate-500 mt-2 font-medium">Esta tela é restrita apenas para administradores do sistema.</p>
      </div>
    );
  }

  // BARREIRA DE SENHA: enquanto não validar a senha, mostra o cadeado.
  if (!desbloqueado) {
    return (
      <div className="w-full flex justify-center py-16 mt-6">
        <form
          onSubmit={validarSenhaAcesso}
          className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col items-center text-center"
        >
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <i className="fas fa-lock text-2xl text-blue-600"></i>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Área Restrita</h1>
          <p className="text-sm text-slate-500 mt-2 font-medium">
            Informe a senha de acesso para gerenciar os cadastros.
          </p>

          <input
            type="password"
            value={senhaInput}
            onChange={(e) => { setSenhaInput(e.target.value); setErroSenha(''); }}
            placeholder="Senha de acesso"
            autoFocus
            autoComplete="off"
            className="mt-6 w-full px-4 py-3 border border-slate-300 rounded-lg text-center font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          {erroSenha && (
            <p className="mt-3 text-sm font-bold text-red-600 flex items-center gap-2">
              <i className="fas fa-exclamation-circle"></i> {erroSenha}
            </p>
          )}

          <button
            type="submit"
            className="mt-5 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-sm shadow-blue-600/20 transition-all"
          >
            Entrar
          </button>
        </form>
      </div>
    );
  }

  // SE FOR ADMIN, RENDERIZA A TELA NORMALMENTE
  return (
    <div className="w-full">
      {/* ... [ TODO O RESTANTE DO CÓDIGO DA TELA FICA EXATAMENTE IGUAL ] ... */}
      
      {feedback.msg && (
        <div className={`mb-6 px-6 py-4 rounded-lg border flex items-center gap-4 transition-all
          ${feedback.tipo === 'sucesso' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          <i className={`fas ${feedback.tipo === 'sucesso' ? 'fa-check-circle' : 'fa-times-circle'} text-xl`}></i>
          <p className="font-bold">{feedback.msg}</p>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-8 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Controle de Acessos</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Gestão de usuários e permissões de segurança.</p>
        </div>
        <button
          onClick={() => {
            setEditandoId(null);
            setFormData(formInicial);
            setVerSenha(false);
            setErroForm('');
            setModalAberto(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2 w-max"
        >
          <i className="fas fa-plus"></i> Novo Usuário
        </button>
      </header>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
            <tr>
              <th className="p-4">Nome</th>
              <th className="p-4">E-mail</th>
              <th className="p-4">Empresa</th>
              <th className="p-4">Nível Permissão</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
            {usuarios.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-500 font-bold">Nenhum usuário cadastrado.</td>
              </tr>
            ) : (
              usuarios.map((u: any) => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-bold text-slate-800">{u.nome}</td>
                  <td className="p-4 text-slate-500">{u.email}</td>
                  <td className="p-4 font-bold text-slate-700">{u.empresa || '-'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-black
                      ${u.nivel_permissao === 'ADMIN' ? 'bg-purple-100 text-purple-700' : ''}
                      ${u.nivel_permissao === 'USER_ARCO' ? 'bg-blue-100 text-blue-700' : ''}
                      ${u.nivel_permissao === 'USER_GRAFICA' ? 'bg-orange-100 text-orange-700' : ''}
                    `}>
                      {u.nivel_permissao}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded text-xs font-bold text-white ${String(u.status).toLowerCase() === 'ativo' ? 'bg-green-500' : 'bg-red-500'}`}>
                      {String(u.status).toLowerCase() === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => { 
                        setEditandoId(u.id); 
                        setFormData({
                          ...formInicial,
                          ...u,
                          senha: u.senha || '', 
                          empresa: u.empresa || '',
                          status: String(u.status).toLowerCase() === 'inativo' ? 'Inativo' : 'Ativo'
                        }); 
                        setVerSenha(false);
                        setErroForm('');
                        setModalAberto(true); 
                      }} 
                      className="text-slate-400 hover:text-blue-600 transition-colors p-2"
                      title="Editar Usuário"
                    >
                      <i className="fas fa-pen"></i>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <h2 className="text-lg font-bold uppercase tracking-wider">{editandoId ? 'Editar Usuário' : 'Novo Usuário'}</h2>
              <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-white"><i className="fas fa-times text-xl"></i></button>
            </div>
            
            <form onSubmit={salvar} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4" autoComplete="off">
              
              {erroForm && (
                <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm font-bold flex items-center gap-2">
                  <i className="fas fa-exclamation-circle text-red-500"></i>
                  {erroForm}
                </div>
              )}

              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nome Completo <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.nome || ''} onChange={e => setFormData({...formData, nome: e.target.value})} autoComplete="off" className="w-full border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none focus:border-blue-500 text-sm" />
              </div>
              
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">E-mail (Login) <span className="text-red-500">*</span></label>
                <input type="email" required value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} autoComplete="new-email" className="w-full border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none focus:border-blue-500 text-sm" />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Senha <span className="text-red-500">*</span></label>
                <div className="w-full relative flex items-center">
                  <input 
                    type={verSenha ? "text" : "password"} 
                    required={!editandoId} 
                    value={formData.senha || ''} 
                    onChange={e => setFormData({...formData, senha: e.target.value})} 
                    autoComplete="new-password"
                    placeholder="Mínimo 6 chars, letras e números, sem espaços" 
                    className="w-full border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all pr-10 outline-none focus:border-blue-500 text-sm placeholder:text-xs" 
                  />
                  <button 
                    type="button"
                    onClick={() => setVerSenha(!verSenha)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    <i className={`fas ${verSenha ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Empresa / Gráfica</label>
                <input type="text" value={formData.empresa || ''} onChange={e => setFormData({...formData, empresa: e.target.value})} autoComplete="off" placeholder="Ex: WALPRINT" className="w-full border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none focus:border-blue-500 text-sm uppercase" />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nível de Permissão</label>
                <select value={formData.nivel_permissao || ''} onChange={e => setFormData({...formData, nivel_permissao: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none focus:border-blue-500 text-sm font-bold">
                  <option value="ADMIN">ADMIN</option>
                  <option value="ADMIN_MAQ">ADMIN_MAQ</option> {/* <-- ADICIONE AQUI */}
                  <option value="USER_ARCO">USER_ARCO</option>
                  <option value="USER_GRAFICA">USER_GRAFICA</option>
                </select>
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Status</label>
                <select value={formData.status || ''} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none focus:border-blue-500 text-sm font-bold">
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </div>

              <div className="col-span-2 mt-4 pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button type="button" onClick={() => setModalAberto(false)} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm">Cancelar</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2">Salvar Registro</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}