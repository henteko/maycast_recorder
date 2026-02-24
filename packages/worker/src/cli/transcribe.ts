/**
 * CLI: ローカルm4aファイルを文字起こししてVTTを出力する
 *
 * Usage: npx tsx src/cli/transcribe.ts <m4a-file-path>
 *
 * DEEPGRAM_API_KEY 環境変数が必要
 * 出力: 入力ファイルと同じディレクトリに .vtt ファイルを生成
 */
import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname, basename, join } from 'path';
import { getTranscriptionConfig } from '../infrastructure/config/aiConfig.js';
import { DeepgramTranscriptionService } from '../infrastructure/services/DeepgramTranscriptionService.js';

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: npx tsx src/cli/transcribe.ts <m4a-file-path>');
    process.exit(1);
  }

  const config = getTranscriptionConfig();
  if (!config) {
    console.error('Error: DEEPGRAM_API_KEY environment variable is not set');
    process.exit(1);
  }

  const absPath = resolve(inputPath);
  const audioBuffer = await readFile(absPath);
  console.log(`📂 Input: ${absPath} (${audioBuffer.length} bytes)`);

  const service = new DeepgramTranscriptionService(config);

  console.log('🎤 Transcribing with Deepgram Nova-3...');
  const segments = await service.transcribe(audioBuffer);
  console.log(`📝 Got ${segments.length} segments`);

  const vttContent = DeepgramTranscriptionService.toWebVTT(segments);

  const vttFileName = basename(absPath).replace(/\.[^.]+$/, '.vtt');
  const vttPath = join(dirname(absPath), vttFileName);
  await writeFile(vttPath, vttContent, 'utf-8');

  console.log(`✅ Output: ${vttPath}`);
  console.log('---');
  console.log(vttContent);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
