"use client";
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [nome, setNome] = useState('');
  const [nivel, setNivel] = useState('');

  useEffect(() => {
    setNome(localStorage.getItem('usuarioNome') || 'Usuário');
    setNivel(localStorage.getItem('usuarioNivel') || ''); // Pega o nível
  }, []);

  const menu = [
    { titulo: 'Início', rota: '/dashboard' },
    { titulo: 'Máquinas', rota: '/dashboard/maquinas' },
    { titulo: 'Definição de Produção', rota: '/dashboard/producao' },
    { titulo: 'Cálculo de Produção', rota: '/dashboard/registros' },
    { titulo: 'Cálculo de Kits', rota: '/dashboard/calculo-kits' },
    { titulo: 'Gantt', rota: '/dashboard/gantt'},
    { titulo: 'Dashboard - Fluxo', rota: '/dashboard/fluxo', requerAdmin: true },    
    { titulo: 'Acessos', rota: '/dashboard/acessos', requerAdmin: true }

  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-900">
      
      {/* MENU SUPERIOR (Alinhamento clássico à esquerda) */}
      <header className="bg-slate-900 text-white shadow-md z-50">
        <div className="w-full px-8 flex justify-between items-center h-16">
          
          {/* LADO ESQUERDO: Logo + Menu colados */}
          <div className="flex items-center gap-10">
            {/* LOGO */}
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white w-8 h-8 flex justify-center items-center rounded font-bold shadow-sm">
                <i className="fas fa-layer-group"></i>
              </div>
              <span className="text-xl font-bold uppercase tracking-wider">CalculArco</span>
            </div>

            {/* LINKS GERAIS */}
          <nav className="flex space-x-2">
            {menu
              // 👇 Ajuste esta linha do filtro:
              .filter(item => !item.requerAdmin || String(nivel).toUpperCase() === 'ADMIN')
              .map(item => {
                // A REGRA DE OURO: Para o Início, o pathname tem que ser EXATAMENTE '/dashboard'
                const isActive = item.rota === '/dashboard' 
                  ? pathname === '/dashboard' 
                  : pathname.startsWith(item.rota);

                return (
                  <Link key={item.rota} href={item.rota}
                    className={`px-4 py-2 rounded font-bold text-sm transition-colors
                      ${isActive 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-300 hover:bg-slate-800 hover:text-white'}
                    `}
                  >
                    {item.titulo}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* LADO DIREITO: Usuário e Sair */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-gray-300 uppercase">{nome}</span>
            <button 
              onClick={() => { localStorage.clear(); router.push('/'); }}
              className="text-red-400 hover:text-red-300 text-sm font-bold uppercase border-l border-slate-700 pl-4"
            >
              Sair <i className="fas fa-sign-out-alt ml-1"></i>
            </button>
          </div>

        </div>
      </header>

      {/* ÁREA DE CONTEÚDO */}
      <main className="flex-1 w-full px-8 py-8 flex flex-col items-start">
        {children}
      </main>
      
    </div>
  );
}