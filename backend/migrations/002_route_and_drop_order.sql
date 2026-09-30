ALTER TABLE ride_requests
ADD COLUMN IF NOT EXISTS route_distance_m INT
CHECK (route_distance_m IS NULL OR route_distance_m > 0);

ALTER TABLE pools
ADD COLUMN IF NOT EXISTS drop_order JSONB NOT NULL DEFAULT '[]'::jsonb;
