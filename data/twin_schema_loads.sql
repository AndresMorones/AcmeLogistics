CREATE TABLE loads (
  load_id TEXT PRIMARY KEY,
  origin_city TEXT NOT NULL,
  origin_state TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  destination_state TEXT NOT NULL,
  pickup_datetime TIMESTAMPTZ,
  delivery_datetime TIMESTAMPTZ,
  equipment_type TEXT NOT NULL,
  loadboard_rate DOUBLE PRECISION NOT NULL,
  weight DOUBLE PRECISION,
  commodity_type TEXT,
  num_of_pieces BIGINT,
  miles BIGINT,
  dimensions TEXT,
  notes TEXT
);

-- Composite index covers the dominant search predicate (lane + equipment) so
-- carrier-side queries hit a single index instead of full scans.
CREATE INDEX idx_loads_lane_equipment ON loads (origin_state, destination_state, equipment_type);
CREATE INDEX idx_loads_pickup ON loads (pickup_datetime);
