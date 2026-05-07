-- Season objectives: 3 auto-generated goals per team per season
CREATE TABLE IF NOT EXISTS season_objectives (
  id          BIGSERIAL PRIMARY KEY,
  team_id     UUID NOT NULL,
  season_number INT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('top_x', 'win_matches', 'sell_for', 'train_players', 'sign_players')),
  target_value  INT NOT NULL,
  current_value INT NOT NULL DEFAULT 0,
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  xp_reward     INT NOT NULL DEFAULT 0,
  budget_reward INT NOT NULL DEFAULT 0,
  description   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, season_number, type)
);

CREATE INDEX IF NOT EXISTS idx_season_objectives_team_season
  ON season_objectives (team_id, season_number);
CREATE INDEX IF NOT EXISTS idx_season_objectives_type_completed
  ON season_objectives (team_id, type, completed);
