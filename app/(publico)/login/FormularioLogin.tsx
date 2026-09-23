'use client';

import { useActionState } from 'react';

import { entrar } from '@/app/actions/auth';
import Alerta from '@/app/components/ui/Alerta';
import BotaoSubmit from '@/app/components/ui/BotaoSubmit';
import Campo from '@/app/components/ui/Campo';

type EstadoLogin = { erro?: string; email?: string };

export default function FormularioLogin({ proximo = '/dashboard' }: { proximo?: string }) {
  const [estado, acao] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="proximo" value={proximo} />

      <Alerta tipo="erro">{estado?.erro}</Alerta>

      <Campo
        id="email"
        label="E-mail corporativo"
        tipo="email"
        autoComplete="username"
        placeholder="seu@email.com"
        defaultValue={estado?.email ?? ''}
        required
        autoFocus
      />

      <Campo
        id="senha"
        label="Senha de acesso"
        tipo="password"
        autoComplete="current-password"
        placeholder="••••••••"
        required
      />

      <BotaoSubmit className="mt-2 w-full" carregando="Entrando...">
        Acessar Sistema
      </BotaoSubmit>
    </form>
  );
}
