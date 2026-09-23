'use client';

import { useActionState } from 'react';

import { pedirRedefinicao } from '@/app/actions/auth';
import Alerta from '@/app/components/ui/Alerta';
import BotaoSubmit from '@/app/components/ui/BotaoSubmit';
import Campo from '@/app/components/ui/Campo';

type EstadoPedido = { erro?: string; ok?: string; email?: string };

/** Etapa 1: pedir o link de redefinição. */
export default function FormularioPedido() {
  const [estado, acao] = useActionState<EstadoPedido, FormData>(pedirRedefinicao, {});

  return (
    <form action={acao} className="flex flex-col gap-5">
      <Alerta tipo="erro">{estado?.erro}</Alerta>
      <Alerta tipo="sucesso">{estado?.ok}</Alerta>

      <Campo
        id="email"
        label="E-mail cadastrado"
        tipo="email"
        autoComplete="username"
        placeholder="seu@email.com"
        defaultValue={estado?.email ?? ''}
        required
        autoFocus
      />

      <BotaoSubmit className="mt-2 w-full" carregando="Registrando...">
        Pedir redefinição
      </BotaoSubmit>
    </form>
  );
}
