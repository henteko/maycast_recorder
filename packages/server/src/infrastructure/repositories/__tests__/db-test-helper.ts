import pg from 'pg';

const { Pool } = pg;

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://maycast_test:maycast_test@localhost:5433/maycast_test';

let pool: pg.Pool | null = null;

/**
 * テスト用のPostgreSQLコネクションプールを取得
 */
export function getTestPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: TEST_DATABASE_URL,
      max: 5,
    });
  }
  return pool;
}

/**
 * テスト前にテーブルのデータをクリアする
 */
export async function cleanDatabase(p: pg.Pool): Promise<void> {
  await p.query('DELETE FROM room_recordings');
  await p.query('DELETE FROM recordings');
  await p.query('DELETE FROM rooms');
}

/**
 * テスト後にコネクションプールを閉じる
 */
export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
