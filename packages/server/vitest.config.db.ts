import { defineConfig } from 'vitest/config';

/**
 * DB統合テスト用のvitest設定
 *
 * 実行: npx vitest run --config vitest.config.db.ts
 * 要件: TEST_DATABASE_URL 環境変数が設定されていること
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/Postgres*.test.ts'],
    // DB統合テストはテーブルを共有するため、ファイル間の並列実行を無効化
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
