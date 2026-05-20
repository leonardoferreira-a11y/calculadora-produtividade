"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginCalculArco() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const router = useRouter();

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setErro('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('usuarioNome', data.usuario.nome);
        localStorage.setItem('usuarioNivel', data.usuario.nivel_permissao);
        localStorage.setItem('usuarioEmpresa', data.usuario.empresa);

        router.push('/dashboard');
      } else {
        setErro(data.message);
      }
    } catch (error) {
      setErro('Erro de conexão com o servidor.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">

      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-[#3b82f6]/10 to-transparent z-0"></div>

      <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md border border-slate-200 relative z-10">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-[#15192b] tracking-tight">
            Bem Vindo a <span className="text-[#3b82f6]">CalculArco</span>
          </h1>
          <p className="text-sm text-slate-500 mt-2 font-medium">Gestão de Produtividade Gráfica</p>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm text-center font-medium">
            {erro}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">E-mail corporativo</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-slate-900 outline-none focus:bg-white focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20 transition-all"
              placeholder="seu@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Senha de acesso</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-slate-900 outline-none focus:bg-white focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20 transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-[#3b82f6] text-white font-black text-lg py-3 mt-4 rounded-lg hover:bg-[#2563eb] transition-colors shadow-lg shadow-blue-500/30"
          >
            Acessar Sistema
          </button>
        </form>

      </div>
    </div>
  );
}
