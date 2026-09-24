CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  price bigint NOT NULL CHECK (price >= 0 AND price <= 1000000000000),
  type text NOT NULL CHECK (type IN ('rent', 'sale', 'shortlet')),
  bedrooms integer NOT NULL CHECK (bedrooms BETWEEN 0 AND 100),
  location_text text NOT NULL CHECK (length(btrim(location_text)) BETWEEN 1 AND 300),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  agent_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listings_created_at_id_idx ON listings (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS listings_filters_idx ON listings (type, bedrooms, price);
