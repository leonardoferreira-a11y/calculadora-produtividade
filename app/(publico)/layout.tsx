import type { ReactNode } from 'react';

/**
 * Casca das telas públicas (login, solicitar acesso, redefinir senha).
 *
 * Não faz checagem de sessão: quem já está autenticado é desviado para o painel
 * pelo `proxy.js` antes de chegar aqui.
 */
export default function LayoutPublico({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="absolute left-0 top-0 z-0 h-1/2 w-full bg-gradient-to-b from-[#3b82f6]/10 to-transparent" />

      <div className="relative z-10 mb-8 flex flex-col items-center">
        <img
          src="/logo.png"
          alt="CalculArco"
          className="h-16 w-auto object-contain"
        />
      </div>

      {children}

      <footer className="relative z-10 mt-8 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
        CalculArco · Gestão de Produtividade Gráfica
      </footer>
    </div>
  );
}
