import {
  createFile,
  MP4BoxBuffer,
  type ISOFile,
  type Track,
  type Sample,
  type Movie,
  type BoxKind,
} from 'mp4box';

/**
 * AudioExtractionService
 *
 * MP4ファイルから音声トラックのみを抽出し、M4A (audio/mp4) Blobとして返す。
 * mp4box.js を使ってMP4コンテナの解析・再構築を行う。
 */
export class AudioExtractionService {
  /**
   * MP4データから音声トラックを抽出してM4A Blobを生成する
   * @param mp4Data 結合済みMP4データ (init segment + chunks)
   * @returns M4A Blob (audio/mp4)
   * @throws Error 音声トラックが見つからない場合
   */
  async extract(mp4Data: ArrayBuffer): Promise<Blob> {
    const { info, samples } = await this.parseAndExtractSamples(mp4Data);

    const audioTrack = info.audioTracks[0];
    if (!audioTrack) {
      throw new Error('No audio track found');
    }

    return this.buildM4A(audioTrack, samples);
  }

  /**
   * 入力MP4を解析し、音声トラックのサンプルを抽出する
   */
  private parseAndExtractSamples(
    mp4Data: ArrayBuffer
  ): Promise<{ info: Movie; samples: Sample[] }> {
    return new Promise((resolve, reject) => {
      const mp4boxFile: ISOFile = createFile();
      let movieInfo: Movie | null = null;
      const audioSamples: Sample[] = [];

      mp4boxFile.onError = (_module: string, message: string) => {
        reject(new Error(`MP4 parse error: ${message}`));
      };

      mp4boxFile.onReady = (info: Movie) => {
        movieInfo = info;

        if (info.audioTracks.length === 0) {
          reject(new Error('No audio track found'));
          return;
        }

        const audioTrack = info.audioTracks[0];
        mp4boxFile.setExtractionOptions(audioTrack.id);
        mp4boxFile.start();
      };

      mp4boxFile.onSamples = (
        _id: number,
        _user: unknown,
        samples: Sample[]
      ) => {
        audioSamples.push(...samples);
      };

      // appendBuffer requires fileStart property on the buffer
      const buffer = MP4BoxBuffer.fromArrayBuffer(mp4Data.slice(0), 0);
      mp4boxFile.appendBuffer(buffer);
      mp4boxFile.flush();

      if (!movieInfo) {
        reject(new Error('Failed to parse MP4: moov box not found'));
        return;
      }

      resolve({ info: movieInfo, samples: audioSamples });
    });
  }

  /**
   * 抽出したサンプルから新しいM4Aファイルを構築する
   */
  private buildM4A(audioTrack: Track, samples: Sample[]): Blob {
    const outputFile: ISOFile = createFile();

    // 元の sample description (sample entry box) から codec-specific な子ボックスを取得
    const descriptionBoxes = this.getDescriptionBoxes(samples);

    // 音声トラックのコーデックタイプを取得 (例: "mp4a.40.2" -> "mp4a")
    const codecType = audioTrack.codec.split('.')[0];

    const trackId = outputFile.addTrack({
      timescale: audioTrack.timescale,
      media_duration: audioTrack.samples_duration,
      duration: audioTrack.duration,
      language: audioTrack.language,
      hdlr: 'soun',
      type: codecType as 'mp4a',
      channel_count: audioTrack.audio?.channel_count,
      samplerate: audioTrack.audio?.sample_rate,
      samplesize: audioTrack.audio?.sample_size,
      description_boxes: descriptionBoxes,
    });

    if (!trackId) {
      throw new Error(
        `Unsupported audio codec: ${audioTrack.codec}`
      );
    }

    // サンプルを追加
    for (const sample of samples) {
      if (!sample.data) {
        continue;
      }
      outputFile.addSample(trackId, sample.data, {
        duration: sample.duration,
        dts: sample.dts,
        cts: sample.cts,
        is_sync: sample.is_sync,
        is_leading: sample.is_leading,
        depends_on: sample.depends_on,
        is_depended_on: sample.is_depended_on,
        has_redundancy: sample.has_redundancy,
        degradation_priority: sample.degradation_priority,
        subsamples: sample.subsamples,
      });
    }

    // DataStream からバッファを取得して Blob を生成
    const dataStream = outputFile.getBuffer();

    return new Blob([dataStream.buffer], { type: 'audio/mp4' });
  }

  /**
   * サンプルの description (sample entry box) から codec-specific な子ボックスを取得する。
   * 例: mp4a の場合、esds ボックスが含まれる。
   */
  private getDescriptionBoxes(samples: Sample[]): BoxKind[] {
    if (samples.length === 0) {
      return [];
    }

    const description = samples[0].description;
    if (!description) {
      return [];
    }

    // sample.description は SampleEntry (ContainerBox) なので boxes プロパティを持つ
    // 実行時は具象 Box サブクラスのインスタンスであるため BoxKind にキャスト可能
    const sampleEntry = description as unknown as { boxes?: BoxKind[] };
    return sampleEntry.boxes ?? [];
  }
}
