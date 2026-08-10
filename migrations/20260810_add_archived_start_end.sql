-- Migration: add archived flag and start/end timestamps to interventions
-- Run this in Supabase SQL editor or via your migration tooling

ALTER TABLE interventions
ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

ALTER TABLE interventions
ADD COLUMN IF NOT EXISTS start_time timestamptz;

ALTER TABLE interventions
ADD COLUMN IF NOT EXISTS end_time timestamptz;

-- Optional index to speed up archived queries
CREATE INDEX IF NOT EXISTS idx_interventions_archived ON interventions (archived);
