"use client";
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

// RBAC: matrix of which roles can see each route
const RBAC: Record<string, string[]> = {
  '/dashboard':            ['ADMIN', 'ADMIN_MAQ', 'USER_ARCO', 'USER_GRAFICA'],
  '/dashboard/maquinas':   ['ADMIN', 'ADMIN_MAQ'],
  '/dashboard/producao':   ['ADMIN', 'USER_ARCO', 'USER_GRAFICA'],
  '/dashboard/registros':  ['ADMIN', 'USER_ARCO', 'USER_GRAFICA'],
  '/dashboard/calculo-kits': ['ADMIN', 'USER_ARCO', 'USER_GRAFICA'],
  '/dashboard/gantt':      ['ADMIN', 'ADMIN_MAQ', 'USER_ARCO'],
  '/dashboard/fluxo':      ['ADMIN', 'USER_ARCO'],
  '/dashboard/acessos':    ['ADMIN'],
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [nome, setNome] = useState('');
  const [nivel, setNivel] = useState('');

  useEffect(() => {
    setNome(localStorage.getItem('usuarioNome') || 'Usuário');
    setNivel(localStorage.getItem('usuarioNivel') || '');
  }, []);

  const menu = [
    { titulo: 'Início',                rota: '/dashboard' },
    { titulo: 'Máquinas',              rota: '/dashboard/maquinas' },
    { titulo: 'Definição de Produção', rota: '/dashboard/producao' },
    { titulo: 'Cálculo de Produção',   rota: '/dashboard/registros' },
    { titulo: 'Cálculo de Kits',       rota: '/dashboard/calculo-kits' },
    { titulo: 'Gantt',                 rota: '/dashboard/gantt' },
    { titulo: 'Dashboard - Fluxo',     rota: '/dashboard/fluxo' },
    { titulo: 'Acessos',               rota: '/dashboard/acessos' },
  ];

  const nivelUp = String(nivel).toUpperCase();
  const menuVisivel = menu.filter(item => {
    const permitidos = RBAC[item.rota] || [];
    return permitidos.includes(nivelUp);
  });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-900">
      <header className="bg-slate-900 text-white shadow-md z-50">
        <div className="w-full px-8 flex justify-between items-center h-16">

          <div className="flex items-center gap-10">
            {/* LOGO */}
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Logo"
                className="h-8 w-auto object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
              <span className="text-xl font-bold uppercase tracking-wider">CalculArco</span>
            </div>

            <nav className="flex space-x-2">
              {menuVisivel.map(item => {
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

          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-slate-500 uppercase bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{nivelUp}</span>
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

      <main className="flex-1 w-full px-8 py-8 flex flex-col items-start">
        {children}
      </main>
    </div>
  );
}
