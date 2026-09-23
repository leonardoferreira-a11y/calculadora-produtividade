'use client';

import { useEffect, useState } from 'react';

import { MIN_SENHA } from '@/lib/auth-constants';

type Usuario = {
  id: number;
  nome: string;
  email: string;
  empresa: string | null;
  nivel_permissao: string;
  status: string;
  ultimo_login_em: string | null;
  senha_definida: boolean;
};

const CORES_NIVEL: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  ADMIN_MAQ: 'bg-indigo-100 text-indigo-700',
  USER_ARCO: 'bg-blue-100 text-blue-700',
  USER_GRAFICA: 'bg-orange-100 text-orange-700',
};

const CORES_STATUS: Record<string, string> = {
  ativo: 'bg-green-500',
  pendente: 'bg-amber-500',
  inativo: 'bg-red-500',
};

const rotulo = (valor: string) =>
  valor ? valor.charAt(0).toUpperCase() + valor.slice(1).toLowerCase() : '-';

const formatarData = (valor: string | null) =>
  valor ? new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const formInicial = {
  nome: '',
  email: '',
  empresa: '',
  nivel_permissao: 'USER_GRAFICA',
  status: 'Ativo',
  senha: '',
};

export default function ControleAcessos() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [feedback, setFeedback] = useState({ msg: '', tipo: '' });
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [formData, setFormData] = useState(formInicial);
  const [linkGerado, setLinkGerado] = useState<{ email: string; link: string } | null>(null);

  const mostrarAvisoTela = (msg: string, tipo: 'sucesso' | 'erro') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: '' }), 5000);
  };

  const buscarDados = async () => {
    try {
      const res = await fetch(`/api/usuarios?ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Falha ao carregar usuários.');
      setUsuarios(await res.json());
    } catch (error) {
      console.error(error);
      mostrarAvisoTela('Não foi possível carregar a lista de usuários.', 'erro');
    }
  };

  useEffect(() => {
    buscarDados();
  }, []);

  /** Espelha as regras do servidor (`validarForcaSenha`) para avisar antes do POST. */
  const validarSenha = (senha: string) => {
    if (/\s/.test(senha)) return 'A senha não pode conter espaços em branco.';
    if (senha.length < MIN_SENHA) return `A senha deve ter no mínimo ${MIN_SENHA} caracteres.`;
    if (!/[a-zA-Z]/.test(senha)) return 'A senha deve conter pelo menos 1 letra.';
    if (!/[0-9]/.test(senha)) return 'A senha deve conter pelo menos 1 número.';
    return '';
  };

  const abrirNovo = () => {
    setEditandoId(null);
    setFormData(formInicial);
    setVerSenha(false);
    setErroForm('');
    setModalAberto(true);
  };

  const abrirEdicao = (u: Usuario) => {
    setEditandoId(u.id);
    // A senha NUNCA volta do servidor: em branco significa "manter a atual".
    setFormData({
      nome: u.nome ?? '',
      email: u.email ?? '',
      empresa: u.empresa ?? '',
      nivel_permissao: u.nivel_permissao ?? 'USER_GRAFICA',
      status: rotulo(String(u.status)),
      senha: '',
    });
    setVerSenha(false);
    setErroForm('');
    setModalAberto(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroForm('');

    if (formData.senha || !editandoId) {
      const problema = validarSenha(formData.senha);
      if (problema) {
        setErroForm(problema);
        return;
      }
    }

    setSalvando(true);
    try {
      const res = await fetch(editandoId ? `/api/usuarios/${editandoId}` : '/api/usuarios', {
        method: editandoId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const dados = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroForm(dados.message || 'Erro do servidor ao salvar usuário.');
        return;
      }

      mostrarAvisoTela('Usuário salvo com sucesso!', 'sucesso');
      setModalAberto(false);
      await buscarDados();
    } catch {
      setErroForm('Erro de conexão ao tentar salvar.');
    } finally {
      setSalvando(false);
    }
  };

  /** Aprova uma solicitação de acesso vinda da tela pública (`/solicitar-acesso`). */
  const aprovar = async (u: Usuario) => {
    const res = await fetch(`/api/usuarios/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: u.nome,
        email: u.email,
        empresa: u.empresa,
        nivel_permissao: u.nivel_permissao,
        status: 'Ativo',
      }),
    });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
      mostrarAvisoTela(dados.message || 'Não foi possível aprovar o acesso.', 'erro');
      return;
    }
    mostrarAvisoTela(`Acesso de ${u.nome} aprovado.`, 'sucesso');
    await buscarDados();
  };

  /** Gera o link de redefinição — não há SMTP, o Admin entrega o link. */
  const gerarLink = async (u: Usuario) => {
    const res = await fetch(`/api/usuarios/${u.id}/reset-link`, { method: 'POST' });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
      mostrarAvisoTela(dados.message || 'Não foi possível gerar o link.', 'erro');
      return;
    }
    setLinkGerado({ email: u.email, link: dados.link });
  };

  return (
    <div className="w-full">
      {feedback.msg && (
        <div
          className={`mb-6 px-6 py-4 rounded-lg border flex items-center gap-4 transition-all
          ${feedback.tipo === 'sucesso' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}
        >
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
          onClick={abrirNovo}
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
              <th className="p-4">Último acesso</th>
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
            {usuarios.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500 font-bold">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            ) : (
              usuarios.map((u) => {
                const situacao = String(u.status ?? '').toLowerCase();
                return (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-800">
                      {u.nome}
                      {!u.senha_definida && (
                        <span className="ml-2 text-[10px] font-black uppercase text-amber-600" title="Conta sem senha utilizável">
                          sem senha
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-500">{u.email}</td>
                    <td className="p-4 font-bold text-slate-700">{u.empresa || '-'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-black ${CORES_NIVEL[u.nivel_permissao] ?? 'bg-slate-100 text-slate-700'}`}>
                        {u.nivel_permissao}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded text-xs font-bold text-white ${CORES_STATUS[situacao] ?? 'bg-slate-400'}`}>
                        {rotulo(situacao)}
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 text-xs font-bold">{formatarData(u.ultimo_login_em)}</td>
                    <td className="p-4 text-right whitespace-nowrap">
                      {situacao === 'pendente' && (
                        <button
                          onClick={() => aprovar(u)}
                          className="text-slate-400 hover:text-emerald-600 transition-colors p-2"
                          title="Aprovar solicitação de acesso"
                        >
                          <i className="fas fa-user-check"></i>
                        </button>
                      )}
                      <button
                        onClick={() => gerarLink(u)}
                        className="text-slate-400 hover:text-amber-600 transition-colors p-2"
                        title="Gerar link de redefinição de senha"
                      >
                        <i className="fas fa-key"></i>
                      </button>
                      <button
                        onClick={() => abrirEdicao(u)}
                        className="text-slate-400 hover:text-blue-600 transition-colors p-2"
                        title="Editar usuário"
                      >
                        <i className="fas fa-pen"></i>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {linkGerado && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <h2 className="text-lg font-bold uppercase tracking-wider">Link de redefinição</h2>
              <button onClick={() => setLinkGerado(null)} className="text-slate-400 hover:text-white">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 font-medium">
                Entregue este link para <strong className="text-slate-900">{linkGerado.email}</strong>. Ele vale
                por <strong>1 hora</strong> e só pode ser usado uma vez.
              </p>
              <textarea
                readOnly
                value={linkGerado.link}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-4 w-full border border-slate-200 rounded-lg p-3 text-xs font-mono bg-slate-50 text-slate-700 break-all"
              />
              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(linkGerado.link).then(() => {
                      mostrarAvisoTela('Link copiado para a área de transferência!', 'sucesso');
                    }).catch(() => {
                      mostrarAvisoTela('Erro ao copiar. Tente selecionear e copiar manualmente.', 'erro');
                    });
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md shadow-emerald-600/30 transition-all text-sm flex items-center gap-2"
                >
                  <i className="fas fa-copy"></i>Copiar Link
                </button>
                <button
                  onClick={() => setLinkGerado(null)}
                  className="bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 font-bold py-2.5 px-6 rounded-lg shadow-sm transition-all text-sm"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <h2 className="text-lg font-bold uppercase tracking-wider">
                {editandoId ? 'Editar Usuário' : 'Novo Usuário'}
              </h2>
              <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-white">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <form onSubmit={salvar} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4" autoComplete="off">
              {erroForm && (
                <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm font-bold flex items-center gap-2">
                  <i className="fas fa-exclamation-circle text-red-500"></i>
                  {erroForm}
                </div>
              )}

              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Nome Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  autoComplete="off"
                  className="w-full border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm"
                />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  E-mail (Login) <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  autoComplete="new-email"
                  className="w-full border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm"
                />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  {editandoId ? 'Nova senha' : 'Senha'}{' '}
                  {!editandoId && <span className="text-red-500">*</span>}
                </label>
                <div className="w-full relative flex items-center">
                  <input
                    type={verSenha ? 'text' : 'password'}
                    required={!editandoId}
                    value={formData.senha}
                    onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                    autoComplete="new-password"
                    placeholder={
                      editandoId
                        ? 'Deixe em branco para manter a senha atual'
                        : `Mínimo ${MIN_SENHA} chars, letras e números, sem espaços`
                    }
                    className="w-full border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all pr-10 outline-none text-sm placeholder:text-xs"
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
                {/* As senhas ficam com hash bcrypt: não há como exibi-las de volta. */}
                <p className="mt-1 text-[11px] text-slate-500 font-medium">
                  Senhas são armazenadas com hash e não podem ser consultadas.
                </p>
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Empresa / Gráfica</label>
                <input
                  type="text"
                  value={formData.empresa}
                  onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                  autoComplete="off"
                  placeholder="Ex: WALPRINT"
                  className="w-full border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm uppercase"
                />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nível de Permissão</label>
                <select
                  value={formData.nivel_permissao}
                  onChange={(e) => setFormData({ ...formData, nivel_permissao: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm font-bold"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="ADMIN_MAQ">ADMIN_MAQ</option>
                  <option value="USER_ARCO">USER_ARCO</option>
                  <option value="USER_GRAFICA">USER_GRAFICA</option>
                </select>
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm font-bold"
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </div>

              <div className="col-span-2 mt-4 pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-blue-600/20 transition-all text-sm flex items-center gap-2"
                >
                  {salvando ? 'Salvando…' : 'Salvar Registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
