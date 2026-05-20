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
    { id: 'maquinas', titulo: 'Parque de Máquinas', icone: 'fa-cogs', cor: 'bg-blue-600', desc: 'Cadastro unificado de equipamentos e parâmetros de produtividade.', rota: '/dashboard/maquinas' },
    { id: 'producao', titulo: 'Definição de Produção', icone: 'fa-box-open', cor: 'bg-amber-500', desc: 'Importação e gestão de ordens de serviço (Miolos, Capas e Encartes).', rota: '/dashboard/producao' },
    { id: 'registros', titulo: 'Cálculo de Produção', icone: 'fa-calculator', cor: 'bg-emerald-600', desc: 'Motor de roteamento, cálculo de tempo operacional e salvar histórico de miolo/capas.', rota: '/dashboard/registros' },
    { id: 'calculo-kits', titulo: 'Cálculo de Kits', icone: 'fa-boxes', cor: 'bg-indigo-600', desc: 'Montagem final de kits, cálculo de esforço de shrink, encaixotamento e fator de complexidade.', rota: '/dashboard/calculo-kits' },
    // 🟣 NOVO MÓDULO GANTT ADICIONADO AQUI
    { id: 'gantt', titulo: 'Planejamento Gantt', icone: 'fa-stream', cor: 'bg-violet-600', desc: 'Sequenciamento visual de produção, controle de prazos e gestão de dependências entre máquinas.', rota: '/dashboard/gantt' },
    { id: 'acessos', titulo: 'Controle de Acessos', icone: 'fa-users', cor: 'bg-slate-700', desc: 'Gestão de usuários, senhas e permissões das gráficas.', rota: '/dashboard/acessos', requerAdmin: true },
  ];

  return (
    <div className="w-full">
      <h1 className="text-2xl font-black text-slate-800 mb-2 uppercase border-b-2 border-blue-600 pb-2 inline-block">Painel de Controle</h1>
      <br/>
      <p className="text-gray-600 mb-8 font-medium inline-block">Selecione o módulo que deseja acessar no sistema.</p>

      <div className="flex flex-wrap gap-6">
        {modulos
          .filter(mod => !mod.requerAdmin || String(nivel).toUpperCase() === 'ADMIN')
          .map((mod) => (
            <button
              key={mod.id}
              onClick={() => router.push(mod.rota)}
              className="w-full sm:w-[300px] md:w-[320px] bg-white border border-gray-300 rounded-lg p-6 flex flex-col items-start text-left shadow-sm hover:shadow-md hover:border-blue-500 transition-all group"
            >
              <div className={`w-12 h-12 ${mod.cor} text-white rounded-lg flex justify-center items-center text-xl mb-4 group-hover:-translate-y-1 transition-transform shadow-sm`}>
                <i className={`fas ${mod.icone}`}></i>
              </div>
              <h2 className="text-lg font-bold text-slate-800 uppercase mb-1">{mod.titulo}</h2>
              <p className="text-sm text-gray-500 leading-snug">{mod.desc}</p>
            </button>
        ))}
      </div>
    </div>
  );
}