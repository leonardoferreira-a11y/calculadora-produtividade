import crypto from 'node:crypto';

/**
 * Token de sessão: `base64url(payload).base64url(hmacSHA256(payload))`.
 *
 * O payload carrega o MÍNIMO necessário para uma verificação otimista sem tocar
 * o banco (id da sessão, id do usuário, nível e expiração). Nenhum dado pessoal
 * e nenhuma senha entram aqui — o cookie é assinado, não criptografado.
 *
 * Este módulo é importado pelo `proxy.js`, portanto NÃO pode acessar o banco.
 * A verificação definitiva (sessão revogada, usuário inativo, nível alterado)
 * acontece em `lib/auth.js`, junto à fonte de dados.
 */

const SEPARADOR = '.';

function segredo() {
  const valor = process.env.AUTH_SECRET;
  if (!valor || valor.length < 32) {
    throw new Error(
      'AUTH_SECRET ausente ou curto demais. Gere um com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))" e coloque no .env.local'
    );
  }
  return valor;
}

const paraBase64Url = (buffer) => Buffer.from(buffer).toString('base64url');

function assinar(payloadB64) {
  return crypto
    .createHmac('sha256', segredo())
    .update(payloadB64)
    .digest('base64url');
}

/** Gera um identificador opaco (usado como id de sessão e token de reset). */
export function gerarTokenAleatorio(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Hash determinístico para guardar tokens no banco sem armazenar o valor bruto. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * @param {{ sid: string, uid: number, nivel: string, exp: number }} payload
 *   `exp` em segundos (epoch).
 */
export function criarTokenSessao(payload) {
  const payloadB64 = paraBase64Url(JSON.stringify(payload));
  return `${payloadB64}${SEPARADOR}${assinar(payloadB64)}`;
}

/**
 * Valida assinatura e expiração do token.
 * @returns {{ sid: string, uid: number, nivel: string, exp: number } | null}
 */
export function lerTokenSessao(token) {
  if (typeof token !== 'string' || !token.includes(SEPARADOR)) return null;

  const [payloadB64, assinaturaRecebida] = token.split(SEPARADOR);
  if (!payloadB64 || !assinaturaRecebida) return null;

  let assinaturaEsperada;
  try {
    assinaturaEsperada = assinar(payloadB64);
  } catch {
    // AUTH_SECRET não configurado: trate como sessão inválida em vez de quebrar
    // a renderização de todas as rotas.
    return null;
  }

  const a = Buffer.from(assinaturaRecebida);
  const b = Buffer.from(assinaturaEsperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (!payload?.sid || !payload?.uid || !payload?.exp) return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
