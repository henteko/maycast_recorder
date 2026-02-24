import { createClient } from '@deepgram/sdk';
import type { TranscriptionConfig } from '../config/aiConfig.js';

export interface TranscriptionSegment {
  startTime: number;
  endTime: number;
  text: string;
}

/**
 * Deepgram Nova-3を使った文字起こしサービス
 *
 * m4aファイルバッファをDeepgram APIに送信し、
 * タイムスタンプ付きの文字起こし結果を取得する
 */
export class DeepgramTranscriptionService {
  private readonly apiKey: string;

  constructor(config: TranscriptionConfig) {
    this.apiKey = config.deepgramApiKey;
  }

  /**
   * m4aファイルバッファを文字起こしする
   */
  async transcribe(audioBuffer: Buffer): Promise<TranscriptionSegment[]> {
    const deepgram = createClient(this.apiKey);

    const { result } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-3',
        smart_format: true,
        utterances: true,
        language: 'ja',
      },
    );

    const utterances = result?.results?.utterances;
    if (!utterances || utterances.length === 0) {
      return [];
    }

    return utterances.map((utterance) => ({
      startTime: utterance.start,
      endTime: utterance.end,
      text: removeJapaneseSpaces(utterance.transcript),
    }));
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
 * 日本語文字間のスペースを除去する
 *
 * Deepgramは日本語のワード間にスペースを挿入するが、
 * 日本語では単語間のスペースは不要なため除去する
 */
function removeJapaneseSpaces(text: string): string {
  // ひらがな・カタカナ・漢字・全角記号間のスペースを除去
  // \u3000-\u303F: CJK記号・句読点（、。など）
  // \u3040-\u309F: ひらがな
  // \u30A0-\u30FF: カタカナ
  // \u4E00-\u9FFF: 漢字
  // \uFF00-\uFFEF: 全角英数・記号
  const cjk = '\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF';
  return text.replace(new RegExp(`(?<=[${cjk}])\\s+(?=[${cjk}])`, 'g'), '');
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
