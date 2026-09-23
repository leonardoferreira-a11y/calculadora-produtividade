import Link from 'next/link';

import { ROTAS } from '@/lib/auth-constants';
import Alerta from '@/app/components/ui/Alerta';

import CartaoAuth from '../_components/CartaoAuth';
import FormularioNovaSenha from './FormularioNovaSenha';
import FormularioPedido from './FormularioPedido';

export const metadata = { title: 'Redefinir senha · CalculArco' };

/**
 * Uma única rota cobre as duas etapas:
 *  - sem `?token=`  -> pede o e-mail e registra a solicitação
 *  - com `?token=`  -> permite escolher a nova senha
 */
export default async function PaginaRedefinirSenha({
  searchParams,
}: {
  // No Next.js 16 `searchParams` é uma Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  const valor = Array.isArray(token) ? token[0] : token;
  const temToken = typeof valor === 'string' && valor.length > 0;

  return (
    <CartaoAuth
      icone="fa-key"
      titulo={temToken ? 'Nova senha' : 'Redefinir senha'}
      subtitulo={
        temToken
          ? 'Escolha uma nova senha. Todas as sessões abertas serão encerradas.'
          : 'Informe seu e-mail para registrar o pedido de redefinição.'
      }
      rodape={
        <Link href={ROTAS.login} className="font-black text-[#3b82f6] hover:underline">
          Voltar para o login
        </Link>
      }
    >
      {temToken ? (
        <FormularioNovaSenha token={valor} />
      ) : (
        <>
          <Alerta tipo="info">
            O envio automático por e-mail ainda não está configurado. O link de
            redefinição é liberado por um administrador na tela de Acessos.
          </Alerta>
          <FormularioPedido />
        </>
      )}
    </CartaoAuth>
  );
}
