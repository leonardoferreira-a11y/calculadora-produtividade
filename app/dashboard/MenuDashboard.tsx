'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { sair } from '@/app/actions/auth';
import { MENSAGENS_AVISO, podeAcessar } from '@/lib/auth-constants';

export type UsuarioSessao = {
  id: number;
  nome: string;
  email: string;
  empresa: string | null;
  nivel_permissao: string;
  ehAdmin: boolean;
};

const MENU = [
  { titulo: 'Início',                rota: '/dashboard' },
  { titulo: 'Máquinas',              rota: '/dashboard/maquinas' },
  { titulo: 'Definição de Produção', rota: '/dashboard/producao' },
  { titulo: 'Cálculo de Produção',   rota: '/dashboard/registros' },
  { titulo: 'Cálculo de Kits',       rota: '/dashboard/calculo-kits' },
  { titulo: 'Gantt',                 rota: '/dashboard/gantt' },
  // { titulo: 'Dashboard - Fluxo', rota: '/dashboard/fluxo' },  // oculto — módulo interno
  { titulo: 'Acessos',               rota: '/dashboard/acessos' },
];

/** Mostra o `?aviso=` deixado por um redirect (sessão expirada, acesso negado). */
function AvisoDaUrl() {
  const searchParams = useSearchParams();
  const codigo = searchParams.get('aviso');
  const mensagem = codigo ? MENSAGENS_AVISO[codigo] : undefined;

  if (!mensagem) return null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-6 py-4 text-amber-800">
      <i className="fas fa-triangle-exclamation text-xl" aria-hidden />
      <p className="font-bold">{mensagem}</p>
    </div>
  );
}

export default function MenuDashboard({
  usuario,
  children,
}: {
  usuario: UsuarioSessao;
  children: ReactNode;
}) {
  const pathname = usePathname();

  /**
   * Espelha a sessão no localStorage.
   *
   * A autorização de verdade vive no servidor (`lib/auth.js` + `proxy.js`);
   * isto existe só para as telas antigas que ainda leem `usuarioNivel` e
   * `usuarioEmpresa` para mostrar/esconder botões.
   */
  useEffect(() => {
    localStorage.setItem('usuarioNome', usuario.nome);
    localStorage.setItem('usuarioNivel', usuario.nivel_permissao);
    localStorage.setItem('usuarioEmpresa', usuario.empresa ?? '');
  }, [usuario.nome, usuario.nivel_permissao, usuario.empresa]);

  const menuVisivel = MENU.filter((item) =>
    podeAcessar(item.rota, usuario.nivel_permissao)
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 font-sans text-slate-900">
      <header className="z-50 bg-slate-900 text-white shadow-md">
        <div className="flex w-full flex-col gap-4 px-4 py-3 md:h-16 md:flex-row md:items-center md:justify-between md:gap-0 md:px-8 md:py-0">

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-10">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="" className="h-8 w-auto object-contain" />
              <span className="text-xl font-bold uppercase tracking-wider">CalculArco</span>
            </div>

            <nav className="flex flex-wrap gap-2">
              {menuVisivel.map((item) => {
                const ativo =
                  item.rota === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(item.rota);
                return (
                  <Link
                    key={item.rota}
                    href={item.rota}
                    className={`rounded px-4 py-2 text-sm font-bold transition-colors ${
                      ativo
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {item.titulo}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs font-bold uppercase text-slate-500">
              {usuario.nivel_permissao}
            </span>
            <span className="text-sm font-bold uppercase text-slate-300">{usuario.nome}</span>

            {/* Sair passa pela Server Action: apaga a sessão no banco e o cookie. */}
            <form
              action={async () => {
                localStorage.clear();
                await sair();
              }}
            >
              <button
                type="submit"
                className="border-l border-slate-700 pl-4 text-sm font-bold uppercase text-red-400 hover:text-red-300"
              >
                Sair <i className="fas fa-sign-out-alt ml-1" aria-hidden />
              </button>
            </form>
          </div>

        </div>
      </header>

      <main className="flex w-full flex-1 flex-col items-start px-4 py-6 md:px-8 md:py-8">
        <Suspense fallback={null}>
          <AvisoDaUrl />
        </Suspense>
        {children}
      </main>
    </div>
  );
}
