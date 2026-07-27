"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardHome() {
  const router = useRouter();
  const [nivel, setNivel] = useState('');

  useEffect(() => { 
    setNivel(localStorage.getItem('usuarioNivel') || ''); 
  }, []);

  const modulos = [
    { id: 'maquinas', titulo: 'Parque de Máquinas', icone: 'fa-cogs', iconClasses: 'bg-blue-50 text-blue-600', hoverClasses: 'group-hover:bg-blue-600 group-hover:text-white', desc: 'Cadastro unificado de equipamentos e parâmetros de produtividade.', rota: '/dashboard/maquinas' },
    { id: 'producao', titulo: 'Definição de Produção', icone: 'fa-box-open', iconClasses: 'bg-amber-50 text-amber-600', hoverClasses: 'group-hover:bg-amber-500 group-hover:text-white', desc: 'Importação e gestão de ordens de serviço (Miolos, Capas e Encartes).', rota: '/dashboard/producao' },
    { id: 'registros', titulo: 'Cálculo de Produção', icone: 'fa-calculator', iconClasses: 'bg-emerald-50 text-emerald-600', hoverClasses: 'group-hover:bg-emerald-600 group-hover:text-white', desc: 'Motor de roteamento, cálculo de tempo operacional e salvar histórico de miolo/capas.', rota: '/dashboard/registros' },
    { id: 'calculo-kits', titulo: 'Cálculo de Kits', icone: 'fa-boxes', iconClasses: 'bg-indigo-50 text-indigo-600', hoverClasses: 'group-hover:bg-indigo-600 group-hover:text-white', desc: 'Montagem final de kits, cálculo de esforço de shrink, encaixotamento e fator de complexidade.', rota: '/dashboard/calculo-kits' },
    // 🟣 NOVO MÓDULO GANTT ADICIONADO AQUI
    { id: 'gantt', titulo: 'Planejamento Gantt', icone: 'fa-stream', iconClasses: 'bg-violet-50 text-violet-600', hoverClasses: 'group-hover:bg-violet-600 group-hover:text-white', desc: 'Sequenciamento visual de produção, controle de prazos e gestão de dependências entre máquinas.', rota: '/dashboard/gantt' },
    { id: 'acessos', titulo: 'Controle de Acessos', icone: 'fa-users', iconClasses: 'bg-slate-100 text-slate-600', hoverClasses: 'group-hover:bg-slate-700 group-hover:text-white', desc: 'Gestão de usuários, senhas e permissões das gráficas.', rota: '/dashboard/acessos', requerAdmin: true },
  ];

  return (
    <div className="w-full">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Painel de Controle</h1>
        <p className="mt-1 text-sm text-slate-500 font-medium">Selecione o módulo que deseja acessar no sistema.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modulos
          .filter(mod => !mod.requerAdmin || String(nivel).toUpperCase() === 'ADMIN')
          .map((mod) => (
            <div
              key={mod.id}
              onClick={() => router.push(mod.rota)}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col h-full relative group"
            >
              <div className={`w-12 h-12 ${mod.iconClasses} rounded-lg flex justify-center items-center text-xl mb-4 transition-colors duration-300 ${mod.hoverClasses}`}>
                <i className={`fas ${mod.icone}`}></i>
              </div>
              <h2 className="text-lg font-bold text-slate-800 uppercase mb-1">{mod.titulo}</h2>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">{mod.desc}</p>

              <i className="fas fa-arrow-right text-blue-600 absolute bottom-6 right-6 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"></i>
            </div>
        ))}
      </div>
    </div>
  );
}