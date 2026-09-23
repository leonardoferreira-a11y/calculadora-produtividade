'use client';

import { useActionState } from 'react';

import { redefinirSenha } from '@/app/actions/auth';
import Alerta from '@/app/components/ui/Alerta';
import BotaoSubmit from '@/app/components/ui/BotaoSubmit';
import Campo from '@/app/components/ui/Campo';

type EstadoNovaSenha = { erro?: string };

/** Etapa 2: chegou pelo link com `?token=` e escolhe a nova senha. */
export default function FormularioNovaSenha({ token }: { token: string }) {
  const [estado, acao] = useActionState<EstadoNovaSenha, FormData>(redefinirSenha, {});

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      <Alerta tipo="erro">{estado?.erro}</Alerta>

      <Campo
        id="senha"
        label="Nova senha"
        tipo="password"
        autoComplete="new-password"
        placeholder="••••••••"
        dica="Mínimo de 8 caracteres, com ao menos uma letra e um número, sem espaços."
        required
        autoFocus
      />

      <Campo
        id="confirmacao"
        label="Confirme a nova senha"
        tipo="password"
        autoComplete="new-password"
        placeholder="••••••••"
        required
      />

      <BotaoSubmit className="mt-2 w-full" carregando="Salvando...">
        Salvar nova senha
      </BotaoSubmit>
    </form>
  );
}
