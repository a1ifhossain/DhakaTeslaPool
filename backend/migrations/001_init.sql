CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('PASSENGER', 'DRIVER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plate TEXT NOT NULL UNIQUE,
  capacity INT NOT NULL CHECK (capacity BETWEEN 1 AND 8),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles (id),
  pickup_zone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (
    status IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES users (id),
  pool_id UUID NOT NULL REFERENCES pools (id),
  pickup_zone TEXT NOT NULL,
  destination_zone TEXT NOT NULL,
  seats INT NOT NULL CHECK (seats BETWEEN 1 AND 8),
  fare_paisa INT NOT NULL CHECK (fare_paisa >= 0),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (
    status IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED')
  ),
  payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'TESLAPAY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pool_members (
  pool_id UUID NOT NULL REFERENCES pools (id) ON DELETE CASCADE,
  ride_id UUID NOT NULL UNIQUE REFERENCES ride_requests (id) ON DELETE CASCADE,
  seats INT NOT NULL CHECK (seats > 0),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, ride_id)
);

CREATE TABLE IF NOT EXISTS status_events (
  id BIGSERIAL PRIMARY KEY,
  ride_id UUID NOT NULL REFERENCES ride_requests (id) ON DELETE CASCADE,
  pool_id UUID NOT NULL REFERENCES pools (id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users (id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pools_match ON pools (pickup_zone, status, created_at);
CREATE INDEX IF NOT EXISTS idx_rides_passenger ON ride_requests (passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_pool ON ride_requests (pool_id, status);
CREATE INDEX IF NOT EXISTS idx_events_ride ON status_events (ride_id, created_at);
