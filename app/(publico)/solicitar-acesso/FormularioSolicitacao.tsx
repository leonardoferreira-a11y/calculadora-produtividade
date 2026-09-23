'use client';

import { useActionState } from 'react';

import { solicitarAcesso } from '@/app/actions/auth';
import Alerta from '@/app/components/ui/Alerta';
import BotaoSubmit from '@/app/components/ui/BotaoSubmit';
import Campo from '@/app/components/ui/Campo';

type EstadoSolicitacao = {
  erro?: string;
  nome?: string;
  email?: string;
  empresa?: string;
};

export default function FormularioSolicitacao() {
  const [estado, acao] = useActionState<EstadoSolicitacao, FormData>(solicitarAcesso, {});

  return (
    <form action={acao} className="flex flex-col gap-5">
      <Alerta tipo="erro">{estado?.erro}</Alerta>

      <Campo
        id="nome"
        label="Nome completo"
        placeholder="Como você assina nos relatórios"
        defaultValue={estado?.nome ?? ''}
        required
        autoFocus
      />

      <Campo
        id="email"
        label="E-mail corporativo"
        tipo="email"
        autoComplete="username"
        placeholder="seu@email.com"
        defaultValue={estado?.email ?? ''}
        required
      />

      <Campo
        id="empresa"
        label="Empresa / Gráfica"
        placeholder="Ex: ARCO "
        defaultValue={estado?.empresa ?? ''}
        className="uppercase"
      />

      <Campo
        id="senha"
        label="Senha"
        tipo="password"
        autoComplete="new-password"
        placeholder="••••••••"
        dica="Mínimo de 8 caracteres, com ao menos uma letra e um número, sem espaços."
        required
      />

      <Campo
        id="confirmacao"
        label="Confirme a senha"
        tipo="password"
        autoComplete="new-password"
        placeholder="••••••••"
        required
      />

      <BotaoSubmit className="mt-2 w-full" carregando="Enviando...">
        Solicitar acesso
      </BotaoSubmit>
    </form>
  );
}
