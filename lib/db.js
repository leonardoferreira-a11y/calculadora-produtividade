import { Pool } from 'pg';

/**
 * Pool único de conexões com o PostgreSQL.
 *
 * O singleton em `globalThis` existe por causa do HMR: em desenvolvimento o
 * Next.js recarrega os módulos a cada alteração e, sem isso, cada reload criaria
 * um Pool novo deixando as conexões antigas penduradas.
 */
const criarPool = () =>
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

const globalParaPool = globalThis;
globalParaPool.__calculArcoPool ??= criarPool();

/** @type {import('pg').Pool} */
const pool = globalParaPool.__calculArcoPool;

/**
 * Executa uma query parametrizada. Sempre passe valores em `params` —
 * nunca interpole strings no SQL.
 */
export async function query(sql, params = []) {
  return pool.query(sql, params);
}

/** Atalho para queries que retornam no máximo uma linha. */
export async function queryUma(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
}

/** Executa `fn` dentro de uma transação, com rollback automático em erro. */
export async function comTransacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
  }
}

export { pool };
export default pool;
