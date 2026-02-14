import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * PostgreSQL コネクションプールを取得
 *
 * DATABASE_URL環境変数から接続情報を取得し、シングルトンのPoolを返す
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('❌ [PostgreSQL] Unexpected pool error:', err);
    });
  }

  return pool;
}

/**
 * PostgreSQL コネクションプールを閉じる
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
