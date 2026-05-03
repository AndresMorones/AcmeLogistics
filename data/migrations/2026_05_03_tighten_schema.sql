-- Migration: tighten currency precision + enforce call_id NOT NULL
-- Date: 2026-05-03
-- Apply via HR Twin SQL editor (paste one statement at a time, separated by STATEMENT BREAK markers).
-- Safe to run multiple times: PostgreSQL no-ops ALTER COLUMN TYPE / SET NOT NULL when already in target state.

-- ============================================================================
-- 1. bookings.apply_rate: DOUBLE PRECISION -> NUMERIC(10,2)
-- ----------------------------------------------------------------------------
-- Currency in float is unsafe (rounding drift on aggregates). NUMERIC(10,2)
-- preserves exact dollars-and-cents. Existing values cast losslessly as long
-- as they fit within (10,2) — i.e., max $99,999,999.99.
-- ============================================================================

ALTER TABLE bookings
  ALTER COLUMN apply_rate TYPE NUMERIC(10,2)
  USING apply_rate::NUMERIC(10,2);

-- === STATEMENT BREAK ===

-- ============================================================================
-- 2. calls_log.call_id: TEXT -> TEXT NOT NULL
-- ----------------------------------------------------------------------------
-- UNIQUE(call_id) currently allows multiple NULLs in PostgreSQL by default,
-- which silently undermines the uniqueness guarantee. Adding NOT NULL makes
-- the constraint actually enforceable.
--
-- PRE-MIGRATION CHECK — run this first; abort if count > 0:
--   SELECT COUNT(*) AS null_call_ids FROM calls_log WHERE call_id IS NULL;
--
-- If null_call_ids > 0, decide BEFORE running the ALTER below:
--   (a) backfill with a deterministic placeholder, e.g.
--       UPDATE calls_log SET call_id = 'unknown-' || id::text WHERE call_id IS NULL;
--   (b) or DELETE the orphan rows:
--       DELETE FROM calls_log WHERE call_id IS NULL;
-- ============================================================================

ALTER TABLE calls_log
  ALTER COLUMN call_id SET NOT NULL;
