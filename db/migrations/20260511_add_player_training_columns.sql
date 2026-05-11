-- Add training and injury tracking columns to players
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS training_focus     TEXT,
  ADD COLUMN IF NOT EXISTS entrenos_semanales INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS injured_until      DATE;
