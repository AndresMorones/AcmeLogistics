-- apply_rate is NUMERIC(10,2) — currency in DOUBLE PRECISION accumulates rounding
-- drift on aggregates (sum-of-bookings, margin %); fixed scale keeps reports exact.
CREATE TABLE bookings (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  call_id TEXT NOT NULL,
  mc_number TEXT NOT NULL,
  load_id TEXT NOT NULL,
  apply_rate NUMERIC(10,2) NOT NULL
);

-- === STATEMENT BREAK ===

-- Idempotency guard: HR webhook retries on transient Write-to-Twin failures
-- would otherwise double-insert the same booking; second attempt no-ops cleanly.
ALTER TABLE bookings ADD CONSTRAINT bookings_call_load_uniq UNIQUE (call_id, load_id);

-- === STATEMENT BREAK ===

-- DESC ordering matches dashboard "recent bookings" queries — index already sorted.
CREATE INDEX idx_bookings_created_at ON bookings (created_at DESC);

-- === STATEMENT BREAK ===

CREATE INDEX idx_bookings_call_id ON bookings (call_id);

-- === STATEMENT BREAK ===

CREATE INDEX idx_bookings_mc_number ON bookings (mc_number);

-- === STATEMENT BREAK ===

CREATE INDEX idx_bookings_load_id ON bookings (load_id);
