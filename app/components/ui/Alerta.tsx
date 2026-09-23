import type { ReactNode } from 'react';

type TipoAlerta = 'erro' | 'sucesso' | 'aviso' | 'info';

const ESTILOS: Record<TipoAlerta, { caixa: string; icone: string }> = {
  erro: {
    caixa: 'bg-red-50 border-red-200 text-red-700',
    icone: 'fa-circle-exclamation text-red-500',
  },
  sucesso: {
    caixa: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    icone: 'fa-circle-check text-emerald-500',
  },
  aviso: {
    caixa: 'bg-amber-50 border-amber-200 text-amber-800',
    icone: 'fa-triangle-exclamation text-amber-500',
  },
  info: {
    caixa: 'bg-blue-50 border-blue-200 text-blue-800',
    icone: 'fa-circle-info text-blue-500',
  },
};

/**
 * Caixa de mensagem das telas de autenticação.
 * Não renderiza nada quando `children` está vazio — isso deixa o chamador
 * escrever `<Alerta tipo="erro">{estado?.erro}</Alerta>` sem condicional.
 */
export default function Alerta({
  tipo = 'info',
  children,
}: {
  tipo?: TipoAlerta;
  children?: ReactNode;
}) {
  if (!children) return null;

  const estilo = ESTILOS[tipo] ?? ESTILOS.info;

  return (
    <div
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${estilo.caixa}`}
    >
      <i className={`fas ${estilo.icone} mt-0.5`} aria-hidden />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}
