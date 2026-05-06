-- Add status lifecycle columns to the loads table.
-- 'A' = Active (pitchable), 'I' = Inactive (booked OR past pickup OR withdrawn).
-- booked_at + booked_by_call_id are audit columns, populated by the
-- /v1/events/call-ended webhook handler when a load gets booked in a call.

-- === STATEMENT BREAK ===
ALTER TABLE loads ADD COLUMN status TEXT NOT NULL DEFAULT 'A';

-- === STATEMENT BREAK ===
ALTER TABLE loads ADD COLUMN booked_at TEXT NULL;

-- === STATEMENT BREAK ===
ALTER TABLE loads ADD COLUMN booked_by_call_id TEXT NULL;

-- Backfill: any load whose pickup is already in the past flips to 'I'.
-- Cutoff is the literal date 2026-05-05 (today); strings sort lexicographically
-- the same as chronologically because pickup_datetime stored as
-- "YYYY-MM-DDTHH:MM:SSZ".
-- === STATEMENT BREAK ===
UPDATE loads SET status = 'I' WHERE pickup_datetime < '2026-05-05';
