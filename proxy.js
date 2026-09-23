import { NextResponse } from 'next/server';

import {
  AVISOS,
  COOKIE_SESSAO,
  ROTAS,
  ehRotaPublica,
  podeAcessar,
} from '@/lib/auth-constants';
import { lerTokenSessao } from '@/lib/auth-token';

/**
 * Triagem OTIMISTA de rotas (no Next.js 16 o antigo `middleware` chama-se
 * `proxy`). Aqui só lemos o cookie assinado — nada de banco, porque o proxy
 * roda em toda requisição, inclusive em prefetch.
 *
 * A verificação definitiva (sessão revogada, usuário inativado, nível alterado)
 * continua em `lib/auth.js`, junto à fonte de dados. Este arquivo evita que o
 * visitante sem sessão chegue a renderizar o painel — não é a única defesa.
 */
export function proxy(request) {
  const { pathname, search } = request.nextUrl;

  const sessao = lerTokenSessao(request.cookies.get(COOKIE_SESSAO)?.value);
  const publica = ehRotaPublica(pathname);

  // Já autenticado tentando abrir login/cadastro: manda para o painel.
  if (publica && sessao) {
    return NextResponse.redirect(new URL(ROTAS.painel, request.url));
  }

  if (publica) return NextResponse.next();

  // Raiz: atalho para o painel ou para o login.
  if (pathname === '/') {
    return NextResponse.redirect(
      new URL(sessao ? ROTAS.painel : ROTAS.login, request.url)
    );
  }

  if (!sessao) {
    const destino = new URL(ROTAS.login, request.url);
    destino.searchParams.set('aviso', AVISOS.SESSAO_EXPIRADA);
    destino.searchParams.set('proximo', `${pathname}${search}`);
    return NextResponse.redirect(destino);
  }

  if (!podeAcessar(pathname, sessao.nivel)) {
    const destino = new URL(ROTAS.painel, request.url);
    destino.searchParams.set('aviso', AVISOS.ACESSO_NEGADO);
    return NextResponse.redirect(destino);
  }

  return NextResponse.next();
}

export const config = {
  // Fora: rotas de API (cuidam da própria autorização), estáticos e imagens.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
