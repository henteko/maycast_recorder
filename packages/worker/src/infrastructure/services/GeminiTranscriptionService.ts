import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIConfig } from '../config/aiConfig.js';

export interface TranscriptionSegment {
  startTime: number;
  endTime: number;
  text: string;
}

/**
 * Gemini APIを使った文字起こしサービス
 *
 * m4aファイルをbase64エンコードしてGemini APIに送信し、
 * タイムスタンプ付きの文字起こし結果を取得する
 */
export class GeminiTranscriptionService {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor(config: AIConfig) {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.modelName = config.geminiModel;
  }

  /**
   * m4aファイルバッファを文字起こしする
   */
  async transcribe(audioBuffer: Buffer): Promise<TranscriptionSegment[]> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    const base64Audio = audioBuffer.toString('base64');

    const prompt = `You are a professional transcription service. Transcribe the following audio file with timestamps.

Output ONLY a valid JSON array with no markdown formatting, no code blocks, no extra text. Each element should have:
- "startTime": start time in seconds (number)
- "endTime": end time in seconds (number)
- "text": the transcribed text for that segment (string)

Rules:
- Segment the transcription into natural sentences or phrases (roughly 3-10 seconds each)
- Detect the language automatically and transcribe in the original language
- If there is no speech, return an empty array []
- Be accurate with timestamps
- Do not include any explanation or markdown, ONLY the JSON array`;

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/mp4',
          data: base64Audio,
        },
      },
      { text: prompt },
    ]);

    const responseText = result.response.text().trim();

    // JSONレスポンスをパース（コードブロックの除去に対応）
    let jsonText = responseText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const segments: TranscriptionSegment[] = JSON.parse(jsonText);

    // バリデーション
    if (!Array.isArray(segments)) {
      throw new Error('Gemini response is not an array');
    }

    for (const seg of segments) {
      if (typeof seg.startTime !== 'number' || typeof seg.endTime !== 'number' || typeof seg.text !== 'string') {
        throw new Error('Invalid segment format from Gemini');
      }
    }

    return segments;
  }

  /**
   * 文字起こしセグメントをWebVTT形式に変換
   */
  static toWebVTT(segments: TranscriptionSegment[]): string {
    const lines: string[] = ['WEBVTT', ''];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      lines.push(String(i + 1));
      lines.push(`${formatVTTTime(seg.startTime)} --> ${formatVTTTime(seg.endTime)}`);
      lines.push(seg.text);
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * 秒数をVTT時刻形式に変換 (HH:MM:SS.mmm)
 */
function formatVTTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
