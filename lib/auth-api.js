import 'server-only';
import { NextResponse } from 'next/server';

import { obterSessao } from './auth';

/**
 * Guardas de sessão para Route Handlers (`app/api/**`).
 *
 * O `proxy.js` não roda em `/api/*`, e `exigirUsuario`/`exigirAdmin` fazem
 * `redirect()` — o que não serve para uma API. Aqui devolvemos status HTTP.
 *
 * Uso:
 *   const { usuario, recusa } = await exigirSessaoApi();
 *   if (recusa) return recusa;
 */
export async function exigirSessaoApi() {
  const usuario = await obterSessao();
  if (!usuario) {
    return {
      usuario: null,
      recusa: NextResponse.json(
        { message: 'Sessão inválida ou expirada.' },
        { status: 401 }
      ),
    };
  }
  return { usuario, recusa: null };
}

export async function exigirAdminApi() {
  const { usuario, recusa } = await exigirSessaoApi();
  if (recusa) return { usuario: null, recusa };

  if (!usuario.ehAdmin) {
    return {
      usuario: null,
      recusa: NextResponse.json(
        { message: 'Acesso restrito a administradores.' },
        { status: 403 }
      ),
    };
  }
  return { usuario, recusa: null };
}
