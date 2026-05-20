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

    // Só busca os dados do banco se for ADMIN
    if (nivel === 'ADMIN') {
      buscarDados(); 
    }
  }, []);

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
      <div className="w-full flex flex-col items-center justify-center py-20 mt-10 bg-white border border-red-200 rounded-lg shadow-sm">
        <i className="fas fa-lock text-6xl text-red-500 mb-4"></i>
        <h1 className="text-2xl font-black text-slate-800 uppercase">Acesso Negado</h1>
        <p className="text-gray-600 mt-2 font-medium">Esta tela é restrita apenas para administradores do sistema.</p>
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

      <header className="flex justify-between items-end mb-8 border-b-2 border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase">Controle de Acessos</h1>
          <p className="text-gray-600 font-medium mt-1">Gestão de usuários e permissões de segurança.</p>
        </div>
        <button 
          onClick={() => { 
            setEditandoId(null); 
            setFormData(formInicial); 
            setVerSenha(false); 
            setErroForm('');
            setModalAberto(true); 
          }} 
          className="bg-blue-600 text-white px-6 py-2.5 rounded hover:bg-blue-700 transition-colors font-bold shadow-sm flex items-center gap-2"
        >
          <i className="fas fa-plus"></i> Novo Usuário
        </button>
      </header>

      <div className="bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 border-b border-gray-300 text-xs uppercase text-slate-600 font-black">
            <tr>
              <th className="p-4">Nome</th>
              <th className="p-4">E-mail</th>
              <th className="p-4">Empresa</th>
              <th className="p-4">Nível Permissão</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {usuarios.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500 font-bold">Nenhum usuário cadastrado.</td>
              </tr>
            ) : (
              usuarios.map((u: any) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors text-sm">
                  <td className="p-4 font-bold text-slate-800">{u.nome}</td>
                  <td className="p-4 text-gray-600">{u.email}</td>
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
                      className="text-blue-600 hover:text-blue-800 font-bold uppercase text-xs border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded transition-colors"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <h2 className="text-lg font-bold uppercase tracking-wider">{editandoId ? 'Editar Usuário' : 'Novo Usuário'}</h2>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-white"><i className="fas fa-times text-xl"></i></button>
            </div>
            
            <form onSubmit={salvar} className="p-6 grid grid-cols-2 gap-4" autoComplete="off">
              
              {erroForm && (
                <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm font-bold flex items-center gap-2">
                  <i className="fas fa-exclamation-circle text-red-500"></i>
                  {erroForm}
                </div>
              )}

              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nome Completo <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.nome || ''} onChange={e => setFormData({...formData, nome: e.target.value})} autoComplete="off" className="w-full border border-gray-300 rounded p-2.5 outline-none focus:border-blue-500 text-sm" />
              </div>
              
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">E-mail (Login) <span className="text-red-500">*</span></label>
                <input type="email" required value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} autoComplete="new-email" className="w-full border border-gray-300 rounded p-2.5 outline-none focus:border-blue-500 text-sm" />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Senha <span className="text-red-500">*</span></label>
                <div className="w-full relative flex items-center">
                  <input 
                    type={verSenha ? "text" : "password"} 
                    required={!editandoId} 
                    value={formData.senha || ''} 
                    onChange={e => setFormData({...formData, senha: e.target.value})} 
                    autoComplete="new-password"
                    placeholder="Mínimo 6 chars, letras e números, sem espaços" 
                    className="w-full border border-gray-300 rounded p-2.5 pr-10 outline-none focus:border-blue-500 text-sm placeholder:text-xs" 
                  />
                  <button 
                    type="button"
                    onClick={() => setVerSenha(!verSenha)}
                    className="absolute right-3 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    <i className={`fas ${verSenha ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Empresa / Gráfica</label>
                <input type="text" value={formData.empresa || ''} onChange={e => setFormData({...formData, empresa: e.target.value})} autoComplete="off" placeholder="Ex: WALPRINT" className="w-full border border-gray-300 rounded p-2.5 outline-none focus:border-blue-500 text-sm uppercase" />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nível de Permissão</label>
                <select value={formData.nivel_permissao || ''} onChange={e => setFormData({...formData, nivel_permissao: e.target.value})} className="w-full border border-gray-300 rounded p-2.5 outline-none focus:border-blue-500 text-sm font-bold">
                  <option value="ADMIN">ADMIN</option>
                  <option value="ADMIN_MAQ">ADMIN_MAQ</option> {/* <-- ADICIONE AQUI */}
                  <option value="USER_ARCO">USER_ARCO</option>
                  <option value="USER_GRAFICA">USER_GRAFICA</option>
                </select>
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Status</label>
                <select value={formData.status || ''} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full border border-gray-300 rounded p-2.5 outline-none focus:border-blue-500 text-sm font-bold">
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </div>

              <div className="col-span-2 mt-4 pt-4 border-t border-gray-200 flex justify-end gap-3">
                <button type="button" onClick={() => setModalAberto(false)} className="px-5 py-2.5 text-sm font-bold text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50 rounded transition-colors">Cancelar</button>
                <button type="submit" className="bg-blue-600 text-white px-6 py-2.5 rounded hover:bg-blue-700 font-bold shadow-sm">Salvar Registro</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}