import type { ReactNode } from 'react';

/** Cartão branco usado pelas três telas públicas (login, cadastro, senha). */
export default function CartaoAuth({
  icone,
  titulo,
  subtitulo,
  children,
  rodape,
}: {
  icone: string;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  return (
    <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="px-10 pt-10 pb-8">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <i className={`fas ${icone} text-2xl text-[#3b82f6]`} aria-hidden />
            </span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-[#15192b]">{titulo}</h1>

          {subtitulo ? (
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
              {subtitulo}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">{children}</div>
      </div>

      {rodape ? (
        <div className="border-t border-slate-200 bg-slate-50 px-10 py-4 text-center text-sm font-bold text-slate-500">
          {rodape}
        </div>
      ) : null}
    </div>
  );
}
