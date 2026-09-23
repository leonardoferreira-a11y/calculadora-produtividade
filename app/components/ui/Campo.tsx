'use client';

import { useId, useState } from 'react';

type CampoProps = {
  id: string;
  label: string;
  tipo?: string;
  dica?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'name' | 'type'>;

const ESTILO_INPUT =
  'w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-all ' +
  'placeholder:text-slate-400 focus:border-[#3b82f6] focus:bg-white focus:ring-2 focus:ring-[#3b82f6]/20';

/**
 * Campo de formulário das telas de autenticação.
 *
 * `id` também vira o `name`, que é como as Server Actions leem o valor do
 * `FormData`. Campos de senha ganham o botão de mostrar/ocultar.
 */
export default function Campo({
  id,
  label,
  tipo = 'text',
  dica,
  className = '',
  ...resto
}: CampoProps) {
  const [visivel, setVisivel] = useState(false);
  const idDica = useId();

  const ehSenha = tipo === 'password';
  const tipoEfetivo = ehSenha && visivel ? 'text' : tipo;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={id}
          type={tipoEfetivo}
          aria-describedby={dica ? idDica : undefined}
          className={`${ESTILO_INPUT} ${ehSenha ? 'pr-12' : ''}`}
          {...resto}
        />

        {ehSenha ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisivel((v) => !v)}
            aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition-colors hover:text-[#3b82f6]"
          >
            <i className={visivel ? 'fas fa-eye-slash' : 'fas fa-eye'} aria-hidden />
          </button>
        ) : null}
      </div>

      {dica ? (
        <p id={idDica} className="mt-1.5 text-xs font-medium text-slate-500">
          {dica}
        </p>
      ) : null}
    </div>
  );
}
