-- Live production schema (29 cols). Column order is intentional and semantic:
-- caller identity -> lane -> call quality -> transcript -> per-stage tokens ->
-- end-of-call telemetry. Reordering breaks the mental model used by docs and
-- by the Write-to-Twin column-binding map below.
-- STATEMENT BREAK markers must remain — Twin's SQL editor and the
-- POST /api/v2/twin/sql endpoint accept ONE statement per request, so the
-- paste/exec workflow splits this file on those markers. Do not delete.
CREATE TABLE calls_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  call_id TEXT NOT NULL,

  mc_number TEXT,
  carrier_name TEXT,
  callback_phone TEXT,
  fmcsa_eligibility_failure_reason TEXT,

  lane_origin TEXT,
  lane_dest TEXT,

  call_outcome TEXT,
  sentiment TEXT,
  case_health_score BIGINT,
  audit_remarks TEXT,
  -- `notes` is NOT NULL with empty-string default so the handoff free-text
  -- column always exists for downstream readers (avoids null-guards everywhere).
  notes TEXT NOT NULL DEFAULT '',

  transcript TEXT,

  extract_input_tokens INTEGER,
  extract_output_tokens INTEGER,
  extract_reasoning_tokens INTEGER,
  extract_cached_input_tokens INTEGER,
  extract_uncached_input_tokens INTEGER,

  chs_input_tokens INTEGER,
  chs_output_tokens INTEGER,
  chs_reasoning_tokens INTEGER,
  chs_cached_input_tokens INTEGER,
  chs_uncached_input_tokens INTEGER,

  duration_seconds BIGINT,
  intermediate_response_count BIGINT,
  p70_latency_ms INTEGER,
  p90_latency_ms INTEGER
);

-- === STATEMENT BREAK ===

-- Idempotency invariant: exactly one row per call_id. Webhook retries from the
-- platform must not be able to create duplicate rows for the same conversation.
ALTER TABLE calls_log ADD CONSTRAINT calls_log_call_id_uniq UNIQUE (call_id);

-- === STATEMENT BREAK ===

-- DESC matches the dashboard's recency queries ("last 24h", recent-calls list)
-- so the index can be scanned in order without a sort step.
CREATE INDEX idx_calls_log_created_at ON calls_log (created_at DESC);

-- === STATEMENT BREAK ===

-- Carrier rollup queries filter/group by mc_number ("show all calls from MC ...").
CREATE INDEX idx_calls_log_mc_number ON calls_log (mc_number);

-- === STATEMENT BREAK ===

-- Funnel widget runs `GROUP BY call_outcome` to compute outcome distribution.
CREATE INDEX idx_calls_log_call_outcome ON calls_log (call_outcome);
