import type { Recording } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';

/**
 * 録画一覧レスポンス
 */
export interface ListRecordingsResponse {
  recordings: Recording[];
}

/**
 * 録画一覧取得 Use Case
 *
 * ビジネスフロー:
 * 1. すべてのRecordingを取得
 * 2. DTOに変換して返す
 */
export class ListRecordingsUseCase {
  private recordingRepository: IRecordingRepository;

  constructor(recordingRepository: IRecordingRepository) {
    this.recordingRepository = recordingRepository;
  }

  async execute(): Promise<ListRecordingsResponse> {
    const recordingEntities = await this.recordingRepository.findAll();

    const recordings = recordingEntities.map((entity) => entity.toDTO());

    // 作成日時の降順でソート
    recordings.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return { recordings };
  }
}
