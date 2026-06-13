-- Align production with the match simulator expected by the application.

alter table public.matches
  add column if not exists simulated_home_score integer,
  add column if not exists simulated_away_score integer,
  add column if not exists simulated_play_by_play jsonb,
  add column if not exists simulated_player_stats jsonb,
  add column if not exists simulation_ready_at timestamptz;

alter table public.clubes
  add column if not exists pj integer not null default 0,
  add column if not exists v integer not null default 0,
  add column if not exists d integer not null default 0,
  add column if not exists pts integer not null default 0;

alter table public.player_stats
  add column if not exists team_id uuid,
  add column if not exists turnovers integer not null default 0,
  add column if not exists fouls_committed integer not null default 0,
  add column if not exists fouls_received integer not null default 0,
  add column if not exists efficiency integer not null default 0;

update public.player_stats ps
set team_id = p.team_id
from public.players p
where ps.team_id is null
  and p.id = ps.player_id
  and p.team_id is not null;

create index if not exists idx_matches_pending_simulated_match_date
  on public.matches (match_date)
  where played = false and simulated_play_by_play is not null;

create index if not exists idx_players_team_id_id
  on public.players (team_id, id);

create index if not exists idx_player_stats_match_player
  on public.player_stats (match_id, player_id);

-- Rebuild the live table from played regular games in the latest season.
update public.clubes
set pj = 0, v = 0, d = 0, pts = 0;

with active_season as (
  select coalesce(max(season_number), 1) as season_number
  from public.matches
),
team_results as (
  select
    home_team_id as team_id,
    1 as pj,
    case when home_score > away_score then 1 else 0 end as v,
    case when home_score < away_score then 1 else 0 end as d,
    case when home_score > away_score then 2 else 1 end as pts
  from public.matches
  where played = true
    and upper(coalesce(fase, 'REGULAR')) = 'REGULAR'
    and season_number = (select season_number from active_season)

  union all

  select
    away_team_id as team_id,
    1 as pj,
    case when away_score > home_score then 1 else 0 end as v,
    case when away_score < home_score then 1 else 0 end as d,
    case when away_score > home_score then 2 else 1 end as pts
  from public.matches
  where played = true
    and upper(coalesce(fase, 'REGULAR')) = 'REGULAR'
    and season_number = (select season_number from active_season)
),
standings as (
  select
    team_id,
    sum(pj)::integer as pj,
    sum(v)::integer as v,
    sum(d)::integer as d,
    sum(pts)::integer as pts
  from team_results
  group by team_id
)
update public.clubes c
set pj = s.pj,
    v = s.v,
    d = s.d,
    pts = s.pts
from standings s
where c.id = s.team_id;

create or replace function public.finalize_match_transaction(
  p_match_id bigint,
  p_home_score integer,
  p_away_score integer,
  p_play_by_play jsonb,
  p_player_stats jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_stats jsonb;
  v_stats_saved integer := 0;
begin
  select id, home_team_id, away_team_id, played, coalesce(fase, 'REGULAR') as fase
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id using errcode = 'P0002';
  end if;

  if v_match.played then
    return jsonb_build_object('status', 'already_played', 'match_id', p_match_id);
  end if;

  if p_home_score = p_away_score then
    raise exception 'Draw score is not allowed for match %', p_match_id;
  end if;

  update public.matches
  set played = true,
      home_score = p_home_score,
      away_score = p_away_score,
      play_by_play = p_play_by_play
  where id = p_match_id;

  if upper(v_match.fase) = 'REGULAR' then
    update public.clubes
    set pj = pj + 1,
        v = v + case when p_home_score > p_away_score then 1 else 0 end,
        d = d + case when p_home_score < p_away_score then 1 else 0 end,
        pts = pts + case when p_home_score > p_away_score then 2 else 1 end
    where id = v_match.home_team_id;

    update public.clubes
    set pj = pj + 1,
        v = v + case when p_away_score > p_home_score then 1 else 0 end,
        d = d + case when p_away_score < p_home_score then 1 else 0 end,
        pts = pts + case when p_away_score > p_home_score then 2 else 1 end
    where id = v_match.away_team_id;
  end if;

  v_stats := case
    when jsonb_typeof(coalesce(p_player_stats, '[]'::jsonb)) = 'array'
      then coalesce(p_player_stats, '[]'::jsonb)
    else '[]'::jsonb
  end;

  delete from public.player_stats
  where match_id = p_match_id;

  insert into public.player_stats (
    match_id,
    player_id,
    team_id,
    points,
    rebounds,
    assists,
    turnovers,
    fouls_committed,
    fouls_received,
    efficiency
  )
  select
    p_match_id,
    (stat->>'player_id')::integer,
    nullif(stat->>'team_id', '')::uuid,
    coalesce((stat->>'points')::integer, 0),
    coalesce((stat->>'rebounds')::integer, 0),
    coalesce((stat->>'assists')::integer, 0),
    coalesce((stat->>'turnovers')::integer, 0),
    coalesce((stat->>'fouls_committed')::integer, 0),
    coalesce((stat->>'fouls_received')::integer, 0),
    coalesce((stat->>'efficiency')::integer, 0)
  from jsonb_array_elements(v_stats) as stat
  where nullif(stat->>'player_id', '') is not null;

  get diagnostics v_stats_saved = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'match_id', p_match_id,
    'fase', upper(v_match.fase),
    'stats_rows_in_payload', jsonb_array_length(v_stats),
    'stats_rows_saved', v_stats_saved
  );
end;
$$;

grant execute on function public.finalize_match_transaction(bigint, integer, integer, jsonb, jsonb)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
