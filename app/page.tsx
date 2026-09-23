import { redirect } from 'next/navigation';
import { obterSessao } from '@/lib/auth';
import { ROTAS } from '@/lib/auth-constants';

export default async function Page() {
  const usuario = await obterSessao();

  if (usuario) {
    redirect(ROTAS.painel);
  } else {
    redirect(ROTAS.login);
  }
}
