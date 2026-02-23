export interface AIConfig {
  geminiApiKey: string;
  geminiModel: string;
}

/**
 * Gemini AI設定を取得
 *
 * GEMINI_API_KEY が未設定の場合は null を返す
 */
export function getAIConfig(): AIConfig | null {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return null;
  }

  return {
    geminiApiKey,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
  };
}
