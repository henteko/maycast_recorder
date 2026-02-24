export interface TranscriptionConfig {
  deepgramApiKey: string;
}

/**
 * Deepgram文字起こし設定を取得
 *
 * DEEPGRAM_API_KEY が未設定の場合は null を返す
 */
export function getTranscriptionConfig(): TranscriptionConfig | null {
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    return null;
  }

  return {
    deepgramApiKey,
  };
}
