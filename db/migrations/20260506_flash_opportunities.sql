CREATE TABLE flash_opportunities (
  id bigserial PRIMARY KEY,
  player_id int NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  original_price int NOT NULL,
  flash_price int NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_by_team_id uuid REFERENCES clubes(id),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON flash_opportunities (expires_at) WHERE claimed_by_team_id IS NULL;

ALTER TABLE flash_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers can read active flash" ON flash_opportunities FOR SELECT
  USING (auth.uid() IS NOT NULL);
