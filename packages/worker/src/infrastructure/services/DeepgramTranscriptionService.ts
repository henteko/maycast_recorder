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

    // 日本語モードではDeepgramがワード間にスペースを挿入するため全スペースを除去
    return utterances.map((utterance) => ({
      startTime: utterance.start,
      endTime: utterance.end,
      text: utterance.transcript.replace(/\s+/g, ''),
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
 * 秒数をVTT時刻形式に変換 (HH:MM:SS.mmm)
 */
function formatVTTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
