import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { RecordingEntity, RecordingNotFoundError } from '@maycast/common-types';
import { PostgresRecordingRepository } from '../PostgresRecordingRepository.js';
import { getTestPool, cleanDatabase, closeTestPool } from './db-test-helper.js';

describe('PostgresRecordingRepository', () => {
  const pool = getTestPool();
  const repository = new PostgresRecordingRepository(pool);

  beforeEach(async () => {
    await cleanDatabase(pool);
  });

  afterAll(async () => {
    await closeTestPool();
  });

  describe('save / findById', () => {
    it('Recordingを保存して取得できる', async () => {
      const recording = RecordingEntity.create('rec-001');
      await repository.save(recording);

      const found = await repository.findById('rec-001');
      expect(found).not.toBeNull();
      expect(found!.getId()).toBe('rec-001');
      expect(found!.getState()).toBe('standby');
      expect(found!.getChunkCount()).toBe(0);
      expect(found!.getTotalSize()).toBe(0);
    });

    it('roomId付きのRecordingを保存して取得できる', async () => {
      const recording = RecordingEntity.create('rec-002', 'room-001');
      await repository.save(recording);

      const found = await repository.findById('rec-002');
      expect(found).not.toBeNull();
      expect(found!.getRoomId()).toBe('room-001');
    });

    it('metadata付きのRecordingを保存して取得できる', async () => {
      const recording = RecordingEntity.create('rec-003');
      recording.setMetadata({
        displayName: 'Test Recording',
        videoConfig: {
          codec: 'avc1.42001E',
          width: 1920,
          height: 1080,
          frameRate: 30,
          bitrate: 5000000,
        },
      });
      await repository.save(recording);

      const found = await repository.findById('rec-003');
      expect(found).not.toBeNull();
      const metadata = found!.getMetadata();
      expect(metadata?.displayName).toBe('Test Recording');
      expect(metadata?.videoConfig?.width).toBe(1920);
      expect(metadata?.videoConfig?.height).toBe(1080);
    });

    it('同じIDで保存すると上書きされる（UPSERT）', async () => {
      const recording = RecordingEntity.create('rec-004');
      await repository.save(recording);

      recording.startRecording();
      await repository.save(recording);

      const found = await repository.findById('rec-004');
      expect(found!.getState()).toBe('recording');
    });

    it('存在しないIDで取得するとnullを返す', async () => {
      const found = await repository.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('すべてのRecordingを取得できる', async () => {
      await repository.save(RecordingEntity.create('rec-a'));
      await repository.save(RecordingEntity.create('rec-b'));
      await repository.save(RecordingEntity.create('rec-c'));

      const all = await repository.findAll();
      expect(all).toHaveLength(3);
    });

    it('レコードがない場合は空配列を返す', async () => {
      const all = await repository.findAll();
      expect(all).toEqual([]);
    });
  });

  describe('delete', () => {
    it('Recordingを削除できる', async () => {
      await repository.save(RecordingEntity.create('rec-del'));

      await repository.delete('rec-del');

      const found = await repository.findById('rec-del');
      expect(found).toBeNull();
    });

    it('存在しないIDを削除してもエラーにならない', async () => {
      await expect(repository.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('updateState', () => {
    it('Recording状態を更新できる', async () => {
      await repository.save(RecordingEntity.create('rec-state'));

      await repository.updateState('rec-state', 'recording');

      const found = await repository.findById('rec-state');
      expect(found!.getState()).toBe('recording');
    });

    it('存在しないIDで更新するとRecordingNotFoundErrorを投げる', async () => {
      await expect(
        repository.updateState('non-existent', 'recording')
      ).rejects.toThrow(RecordingNotFoundError);
    });
  });

  describe('updateMetadata', () => {
    it('Recordingメタデータを更新できる', async () => {
      await repository.save(RecordingEntity.create('rec-meta'));

      const metadata = {
        displayName: 'Updated Name',
        audioConfig: {
          codec: 'opus',
          sampleRate: 48000,
          channelCount: 2,
          bitrate: 128000,
        },
      };
      await repository.updateMetadata('rec-meta', metadata);

      const found = await repository.findById('rec-meta');
      expect(found!.getMetadata()?.displayName).toBe('Updated Name');
      expect(found!.getMetadata()?.audioConfig?.codec).toBe('opus');
    });

    it('存在しないIDで更新するとRecordingNotFoundErrorを投げる', async () => {
      await expect(
        repository.updateMetadata('non-existent', { displayName: 'test' })
      ).rejects.toThrow(RecordingNotFoundError);
    });
  });

  describe('incrementChunkCount', () => {
    it('チャンク数をインクリメントできる', async () => {
      await repository.save(RecordingEntity.create('rec-chunk'));

      await repository.incrementChunkCount('rec-chunk');
      await repository.incrementChunkCount('rec-chunk');
      await repository.incrementChunkCount('rec-chunk');

      const found = await repository.findById('rec-chunk');
      expect(found!.getChunkCount()).toBe(3);
    });

    it('存在しないIDでインクリメントするとRecordingNotFoundErrorを投げる', async () => {
      await expect(
        repository.incrementChunkCount('non-existent')
      ).rejects.toThrow(RecordingNotFoundError);
    });
  });
});
