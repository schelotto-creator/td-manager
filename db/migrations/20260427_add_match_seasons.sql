-- Conserva el histórico: la temporada existente pasa a ser la 1 y los
-- calendarios nuevos se insertan como temporadas posteriores.

alter table public.matches
  add column if not exists season_number integer;

update public.matches
set season_number = 1
where season_number is null;

alter table public.matches
  alter column season_number set default 1,
  alter column season_number set not null;

create index if not exists idx_matches_season_group_home
  on public.matches (season_number, home_team_id);

create index if not exists idx_matches_season_group_away
  on public.matches (season_number, away_team_id);

create index if not exists idx_matches_season_played_match_date
  on public.matches (season_number, played, match_date);

drop trigger if exists trg_set_match_date_from_jornada on public.matches;
drop function if exists public.set_match_date_from_jornada();
drop function if exists public.compute_match_date_from_jornada(integer);

create or replace function public.compute_match_date_from_jornada(
  p_jornada integer,
  p_season_number integer
)
returns timestamptz
language sql
immutable
as $$
  select (
    (
      date '2026-03-04'
      + ((((greatest(coalesce(p_season_number, 1), 1) - 1) * 8)
        + ((greatest(coalesce(p_jornada, 1), 1) - 1) / 2)) * 7)
      + case when (greatest(coalesce(p_jornada, 1), 1) % 2) = 0 then 3 else 0 end
    )
    + case when (greatest(coalesce(p_jornada, 1), 1) % 2) = 0 then time '12:30' else time '18:30' end
  ) at time zone 'Europe/Madrid';
$$;

create or replace function public.compute_match_date_from_jornada(p_jornada integer)
returns timestamptz
language sql
immutable
as $$
  select public.compute_match_date_from_jornada(p_jornada, 1);
$$;

create or replace function public.set_match_date_from_jornada()
returns trigger
language plpgsql
as $$
begin
  if new.match_date is null and new.jornada is not null then
    new.match_date := public.compute_match_date_from_jornada(new.jornada, new.season_number);
  end if;
  return new;
end;
$$;

create trigger trg_set_match_date_from_jornada
before insert or update of jornada, match_date, season_number
on public.matches
for each row
execute function public.set_match_date_from_jornada();

update public.matches
set match_date = public.compute_match_date_from_jornada(jornada, season_number)
where match_date is null
  and jornada is not null;

drop view if exists public.view_player_season_stats;

create view public.view_player_season_stats as
with active_season as (
  select coalesce(max(season_number), 1) as season_number
  from public.matches
),
season_stats as (
  select
    ps.player_id,
    count(distinct ps.match_id)::integer as games_played,
    avg(coalesce(ps.points, 0))::double precision as ppg,
    avg(coalesce(ps.rebounds, 0))::double precision as rpg,
    avg(coalesce(ps.assists, 0))::double precision as apg,
    avg(coalesce(ps.points, 0) + coalesce(ps.rebounds, 0) + coalesce(ps.assists, 0))::double precision as efficiency
  from public.player_stats ps
  join public.matches m on m.id = ps.match_id
  where m.season_number = (select season_number from active_season)
  group by ps.player_id
)
select
  p.id,
  p.name,
  p.position,
  c.nombre as team_name,
  p.team_id::text as team_id,
  s.games_played,
  s.ppg,
  s.rpg,
  s.apg,
  s.efficiency
from season_stats s
join public.players p on p.id = s.player_id
left join public.clubes c on c.id::text = p.team_id::text;

grant select on public.view_player_season_stats to anon, authenticated, service_role;
