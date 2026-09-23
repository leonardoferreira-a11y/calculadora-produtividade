'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Botão de envio que se desabilita sozinho enquanto a Server Action roda.
 * Precisa estar DENTRO do `<form>` — é assim que o `useFormStatus` enxerga o
 * estado de envio.
 */
export default function BotaoSubmit({
  children,
  carregando = 'Enviando...',
  className = '',
}: {
  children: ReactNode;
  carregando?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg bg-[#3b82f6] px-5 py-3 text-lg font-black text-white shadow-lg shadow-blue-500/30 transition-colors hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none ${className}`}
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <i className="fas fa-circle-notch fa-spin" aria-hidden />
          {carregando}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
