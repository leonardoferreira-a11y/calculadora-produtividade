import 'server-only';
import bcrypt from 'bcryptjs';

import { MIN_SENHA } from './auth-constants';

const RODADAS = Number(process.env.BCRYPT_ROUNDS ?? 12);

// Reexportado por conveniência; a constante vive em `auth-constants` porque
// este módulo é `server-only` e as telas precisam da mesma regra.
export { MIN_SENHA };

/** Reconhece um hash bcrypt já gravado (distingue do legado em texto puro). */
export const ehHashBcrypt = (valor) =>
  typeof valor === 'string' && /^\$2[aby]\$\d{2}\$/.test(valor);

export async function gerarHashSenha(senha) {
  return bcrypt.hash(senha, RODADAS);
}

export async function conferirSenha(senha, hash) {
  if (!ehHashBcrypt(hash)) return false;
  return bcrypt.compare(senha, hash);
}

/**
 * Hash descartável usado para igualar o tempo de resposta quando o e-mail não
 * existe, evitando enumeração de usuários por timing. Gerado sob demanda para
 * não travar a inicialização do módulo.
 */
let hashFalso = null;

export async function gastarTempoDeVerificacao() {
  hashFalso ??= await bcrypt.hash('senha-inexistente-calcularco', RODADAS);
  await bcrypt.compare('senha-inexistente-calcularco', hashFalso);
}

/** @returns {string[]} lista de problemas; vazia quando a senha é aceitável. */
export function validarForcaSenha(senha) {
  const problemas = [];
  const valor = typeof senha === 'string' ? senha : '';

  if (valor.length < MIN_SENHA) {
    problemas.push(`Use no mínimo ${MIN_SENHA} caracteres.`);
  }
  if (/\s/.test(valor)) problemas.push('Não use espaços em branco.');
  if (!/[a-zA-Z]/.test(valor)) problemas.push('Inclua ao menos uma letra.');
  if (!/[0-9]/.test(valor)) problemas.push('Inclua ao menos um número.');

  return problemas;
}
