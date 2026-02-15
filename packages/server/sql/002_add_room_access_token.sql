-- Migration: Add access_token column to rooms table
-- Run this migration on existing databases that were created with the original init.sql

-- Add access_token column (nullable first for existing rows)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS access_token TEXT;

-- Generate access tokens for existing rooms that don't have one
UPDATE rooms SET access_token = gen_random_uuid()::text WHERE access_token IS NULL;

-- Make the column NOT NULL and UNIQUE
ALTER TABLE rooms ALTER COLUMN access_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_access_token ON rooms(access_token);
