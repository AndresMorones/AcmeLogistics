-- Column order is intentional: caller identity -> lane -> call quality ->
-- transcript -> per-stage tokens -> end-of-call telemetry. Reordering breaks
-- the Write-to-Twin column-binding map.
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
  -- notes is NOT NULL with empty-string default so downstream readers never
  -- need a null-guard on the handoff free-text column.
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

-- One row per call_id; protects against webhook retries.
ALTER TABLE calls_log ADD CONSTRAINT calls_log_call_id_uniq UNIQUE (call_id);

-- === STATEMENT BREAK ===

CREATE INDEX idx_calls_log_created_at ON calls_log (created_at DESC);

-- === STATEMENT BREAK ===

CREATE INDEX idx_calls_log_mc_number ON calls_log (mc_number);

-- === STATEMENT BREAK ===

CREATE INDEX idx_calls_log_call_outcome ON calls_log (call_outcome);
