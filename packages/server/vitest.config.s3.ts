import { defineConfig } from 'vitest/config';

/**
 * S3統合テスト用のvitest設定
 *
 * 実行: npx vitest run --config vitest.config.s3.ts
 * 要件: LocalStackが起動していること（ポート4577）
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/S3*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
