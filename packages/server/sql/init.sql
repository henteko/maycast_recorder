-- Maycast Recorder Database Schema
-- PostgreSQLの初期化スクリプト（docker-entrypoint-initdb.dで自動実行）

-- Recording状態の列挙型
CREATE TYPE recording_state AS ENUM ('standby', 'recording', 'finalizing', 'synced', 'interrupted');

-- Room状態の列挙型
CREATE TYPE room_state AS ENUM ('idle', 'recording', 'finalizing', 'finished');

-- Recordingsテーブル
CREATE TABLE IF NOT EXISTS recordings (
    id          TEXT PRIMARY KEY,
    room_id     TEXT,
    state       recording_state NOT NULL DEFAULT 'standby',
    metadata    JSONB,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    total_size  BIGINT NOT NULL DEFAULT 0,
    start_time  BIGINT NOT NULL,
    end_time    BIGINT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roomsテーブル
CREATE TABLE IF NOT EXISTS rooms (
    id           TEXT PRIMARY KEY,
    access_token TEXT NOT NULL UNIQUE,
    state        room_state NOT NULL DEFAULT 'idle',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Room-Recording関連テーブル
CREATE TABLE IF NOT EXISTS room_recordings (
    room_id      TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    recording_id TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, recording_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_recordings_room_id ON recordings(room_id);
CREATE INDEX IF NOT EXISTS idx_recordings_state ON recordings(state);
CREATE INDEX IF NOT EXISTS idx_rooms_state ON rooms(state);
CREATE INDEX IF NOT EXISTS idx_rooms_access_token ON rooms(access_token);
CREATE INDEX IF NOT EXISTS idx_room_recordings_room_id ON room_recordings(room_id);

-- updated_atを自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recordingsテーブルのupdated_atトリガー
CREATE TRIGGER trigger_recordings_updated_at
    BEFORE UPDATE ON recordings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Roomsテーブルのupdated_atトリガー
CREATE TRIGGER trigger_rooms_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
