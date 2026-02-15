import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { RoomEntity, RoomNotFoundError } from '@maycast/common-types';
import { PostgresRoomRepository } from '../PostgresRoomRepository.js';
import { getTestPool, cleanDatabase, closeTestPool } from './db-test-helper.js';

const TEST_ACCESS_KEY = 'test-access-key';

describe('PostgresRoomRepository', () => {
  const pool = getTestPool();
  const repository = new PostgresRoomRepository(pool);

  beforeEach(async () => {
    await cleanDatabase(pool);
  });

  afterAll(async () => {
    await closeTestPool();
  });

  describe('save / findById', () => {
    it('Roomを保存して取得できる', async () => {
      const room = RoomEntity.create('room-001', TEST_ACCESS_KEY);
      await repository.save(room);

      const found = await repository.findById('room-001');
      expect(found).not.toBeNull();
      expect(found!.getId()).toBe('room-001');
      expect(found!.getState()).toBe('idle');
      expect(found!.getRecordingIds()).toEqual([]);
    });

    it('recordingIds付きのRoomを保存して取得できる', async () => {
      const room = RoomEntity.create('room-002', TEST_ACCESS_KEY);
      room.addRecording('rec-a');
      room.addRecording('rec-b');
      await repository.save(room);

      const found = await repository.findById('room-002');
      expect(found).not.toBeNull();
      expect(found!.getRecordingIds()).toEqual(['rec-a', 'rec-b']);
    });

    it('同じIDで保存すると上書きされる（UPSERT）', async () => {
      const room = RoomEntity.create('room-003', TEST_ACCESS_KEY);
      await repository.save(room);

      room.addRecording('rec-x');
      room.startRecording();
      await repository.save(room);

      const found = await repository.findById('room-003');
      expect(found!.getState()).toBe('recording');
      expect(found!.getRecordingIds()).toEqual(['rec-x']);
    });

    it('存在しないIDで取得するとnullを返す', async () => {
      const found = await repository.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('すべてのRoomを取得できる', async () => {
      await repository.save(RoomEntity.create('room-a', TEST_ACCESS_KEY));
      await repository.save(RoomEntity.create('room-b', TEST_ACCESS_KEY));

      const all = await repository.findAll();
      expect(all).toHaveLength(2);
    });

    it('レコードがない場合は空配列を返す', async () => {
      const all = await repository.findAll();
      expect(all).toEqual([]);
    });

    it('各RoomのrecordingIdsも取得できる', async () => {
      const room1 = RoomEntity.create('room-r1', TEST_ACCESS_KEY);
      room1.addRecording('rec-1');
      await repository.save(room1);

      const room2 = RoomEntity.create('room-r2', TEST_ACCESS_KEY);
      room2.addRecording('rec-2');
      room2.addRecording('rec-3');
      await repository.save(room2);

      const all = await repository.findAll();
      const roomMap = new Map(all.map((r) => [r.getId(), r]));

      expect(roomMap.get('room-r1')!.getRecordingIds()).toEqual(['rec-1']);
      expect(roomMap.get('room-r2')!.getRecordingIds()).toEqual(['rec-2', 'rec-3']);
    });
  });

  describe('delete', () => {
    it('Roomを削除できる', async () => {
      await repository.save(RoomEntity.create('room-del', TEST_ACCESS_KEY));

      await repository.delete('room-del');

      const found = await repository.findById('room-del');
      expect(found).toBeNull();
    });

    it('削除時にroom_recordingsもCASCADE削除される', async () => {
      const room = RoomEntity.create('room-cascade', TEST_ACCESS_KEY);
      room.addRecording('rec-cas');
      await repository.save(room);

      await repository.delete('room-cascade');

      // room_recordingsも削除されているか確認
      const result = await pool.query(
        "SELECT COUNT(*) FROM room_recordings WHERE room_id = 'room-cascade'"
      );
      expect(Number(result.rows[0].count)).toBe(0);
    });

    it('存在しないIDを削除してもエラーにならない', async () => {
      await expect(repository.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('updateState', () => {
    it('Room状態を更新できる', async () => {
      await repository.save(RoomEntity.create('room-state', TEST_ACCESS_KEY));

      await repository.updateState('room-state', 'recording');

      const found = await repository.findById('room-state');
      expect(found!.getState()).toBe('recording');
    });

    it('存在しないIDで更新するとRoomNotFoundErrorを投げる', async () => {
      await expect(
        repository.updateState('non-existent', 'recording')
      ).rejects.toThrow(RoomNotFoundError);
    });
  });

  describe('addRecording', () => {
    it('RoomにRecordingを追加できる', async () => {
      await repository.save(RoomEntity.create('room-add', TEST_ACCESS_KEY));

      await repository.addRecording('room-add', 'rec-new');

      const found = await repository.findById('room-add');
      expect(found!.getRecordingIds()).toContain('rec-new');
    });

    it('同じRecordingを重複追加してもエラーにならない', async () => {
      await repository.save(RoomEntity.create('room-dup', TEST_ACCESS_KEY));

      await repository.addRecording('room-dup', 'rec-dup');
      await repository.addRecording('room-dup', 'rec-dup');

      const found = await repository.findById('room-dup');
      expect(found!.getRecordingIds()).toEqual(['rec-dup']);
    });

    it('存在しないRoomに追加するとRoomNotFoundErrorを投げる', async () => {
      await expect(
        repository.addRecording('non-existent', 'rec-x')
      ).rejects.toThrow(RoomNotFoundError);
    });
  });

  describe('removeRecording', () => {
    it('RoomからRecordingを削除できる', async () => {
      const room = RoomEntity.create('room-rem', TEST_ACCESS_KEY);
      room.addRecording('rec-keep');
      room.addRecording('rec-remove');
      await repository.save(room);

      await repository.removeRecording('room-rem', 'rec-remove');

      const found = await repository.findById('room-rem');
      expect(found!.getRecordingIds()).toEqual(['rec-keep']);
    });

    it('存在しないRecordingを削除してもエラーにならない', async () => {
      await repository.save(RoomEntity.create('room-rem2', TEST_ACCESS_KEY));
      await expect(
        repository.removeRecording('room-rem2', 'non-existent')
      ).resolves.not.toThrow();
    });

    it('存在しないRoomから削除するとRoomNotFoundErrorを投げる', async () => {
      await expect(
        repository.removeRecording('non-existent', 'rec-x')
      ).rejects.toThrow(RoomNotFoundError);
    });
  });

  describe('accessKey', () => {
    it('保存したaccessKeyが正しく復元される', async () => {
      const room = RoomEntity.create('room-key', 'my-secret-key');
      await repository.save(room);

      const found = await repository.findById('room-key');
      expect(found).not.toBeNull();
      expect(found!.getAccessKey()).toBe('my-secret-key');
      expect(found!.validateAccessKey('my-secret-key')).toBe(true);
      expect(found!.validateAccessKey('wrong-key')).toBe(false);
    });
  });
});
