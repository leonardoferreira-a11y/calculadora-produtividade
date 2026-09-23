import Link from 'next/link';

import { AVISOS, MENSAGENS_AVISO, ROTAS } from '@/lib/auth-constants';
import Alerta from '@/app/components/ui/Alerta';

import CartaoAuth from '../_components/CartaoAuth';
import FormularioLogin from './FormularioLogin';

export const metadata = { title: 'Entrar · CalculArco' };

const TIPO_POR_AVISO: Record<string, 'sucesso' | 'aviso' | 'info'> = {
  [AVISOS.CADASTRO_ENVIADO]: 'sucesso',
  [AVISOS.SENHA_ALTERADA]: 'sucesso',
  [AVISOS.SESSAO_EXPIRADA]: 'aviso',
  [AVISOS.ACESSO_NEGADO]: 'aviso',
  [AVISOS.SAIU]: 'info',
};

/** Só aceita destinos internos — `?proximo=` não pode virar open redirect. */
function destinoSeguro(valor: string | string[] | undefined) {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (!bruto || !bruto.startsWith('/') || bruto.startsWith('//')) return ROTAS.painel;
  return bruto;
}

export default async function PaginaLogin({
  searchParams,
}: {
  // No Next.js 16 `searchParams` é uma Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { aviso, proximo } = await searchParams;
  const codigo = Array.isArray(aviso) ? aviso[0] : aviso;
  const mensagem = codigo ? MENSAGENS_AVISO[codigo] : undefined;

  return (
    <CartaoAuth
      icone="fa-lock"
      titulo={
        <>
          Bem Vindo a <span className="text-[#3b82f6]">CalculArco</span>
        </>
      }
      subtitulo="Gestão de Produtividade Gráfica"
      rodape={
        <>
          Ainda não tem acesso?{' '}
          <Link
            href={ROTAS.solicitarAcesso}
            className="font-black text-[#3b82f6] hover:underline"
          >
            Solicitar cadastro
          </Link>
        </>
      }
    >
      {mensagem ? (
        <Alerta tipo={(codigo && TIPO_POR_AVISO[codigo]) || 'info'}>{mensagem}</Alerta>
      ) : null}

      <FormularioLogin proximo={destinoSeguro(proximo)} />

      <p className="text-center text-sm font-bold">
        <Link
          href={ROTAS.redefinirSenha}
          className="text-slate-500 transition-colors hover:text-[#3b82f6]"
        >
          Esqueci minha senha
        </Link>
      </p>
    </CartaoAuth>
  );
}
