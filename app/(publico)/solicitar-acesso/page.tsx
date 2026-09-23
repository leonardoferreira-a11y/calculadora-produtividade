import Link from 'next/link';

import { ROTAS } from '@/lib/auth-constants';
import Alerta from '@/app/components/ui/Alerta';

import CartaoAuth from '../_components/CartaoAuth';
import FormularioSolicitacao from './FormularioSolicitacao';

export const metadata = { title: 'Solicitar acesso · CalculArco' };

export default function PaginaSolicitarAcesso() {
  return (
    <CartaoAuth
      icone="fa-user-plus"
      titulo="Solicitar acesso"
      subtitulo="Preencha seus dados. Um administrador libera o acesso em seguida."
      rodape={
        <>
          Já tem cadastro?{' '}
          <Link href={ROTAS.login} className="font-black text-[#3b82f6] hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <Alerta tipo="info">
        Seu cadastro nasce com status <strong>Pendente</strong> e só permite login
        depois que um administrador mudar para <strong>Ativo</strong>.
      </Alerta>

      <FormularioSolicitacao />
    </CartaoAuth>
  );
}
