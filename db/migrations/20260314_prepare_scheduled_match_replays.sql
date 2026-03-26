-- Precalculate scheduled match replays before kickoff without closing standings early.

alter table public.matches
  add column if not exists simulated_home_score integer,
  add column if not exists simulated_away_score integer,
  add column if not exists simulated_play_by_play jsonb,
  add column if not exists simulated_player_stats jsonb,
  add column if not exists simulation_ready_at timestamptz;

create index if not exists idx_matches_pending_simulated_match_date
  on public.matches (match_date)
  where played = false and simulated_play_by_play is not null;
