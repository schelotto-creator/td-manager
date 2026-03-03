-- Atomic finalization for league/playoff games.
-- Run this script in Supabase SQL Editor before production kickoff.

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
  v_stats_count integer := coalesce(jsonb_array_length(p_player_stats), 0);
  v_stats_saved integer := 0;
  v_warning text := null;

  v_match_col text;
  v_player_col text;
  v_team_col text;
  v_points_col text;
  v_rebounds_col text;
  v_assists_col text;
  v_turnovers_col text;
  v_efficiency_col text;

  v_match_udt text;
  v_player_udt text;
  v_team_udt text;

  v_insert_cols text;
  v_select_cols text;
begin
  select
    id,
    home_team_id,
    away_team_id,
    played,
    coalesce(fase, 'REGULAR') as fase
  into v_match
  from matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id using errcode = 'P0002';
  end if;

  if v_match.played then
    return jsonb_build_object(
      'status', 'already_played',
      'match_id', p_match_id
    );
  end if;

  if p_home_score = p_away_score then
    raise exception 'Draw score is not allowed for match %', p_match_id;
  end if;

  update matches
  set
    played = true,
    home_score = p_home_score,
    away_score = p_away_score,
    play_by_play = p_play_by_play
  where id = p_match_id;

  if upper(v_match.fase) = 'REGULAR' then
    update clubes
    set
      pj = coalesce(pj, 0) + 1,
      v = coalesce(v, 0) + case when p_home_score > p_away_score then 1 else 0 end,
      d = coalesce(d, 0) + case when p_home_score < p_away_score then 1 else 0 end,
      pts = coalesce(pts, 0) + case when p_home_score > p_away_score then 2 else 1 end
    where id = v_match.home_team_id;

    update clubes
    set
      pj = coalesce(pj, 0) + 1,
      v = coalesce(v, 0) + case when p_away_score > p_home_score then 1 else 0 end,
      d = coalesce(d, 0) + case when p_away_score < p_home_score then 1 else 0 end,
      pts = coalesce(pts, 0) + case when p_away_score > p_home_score then 2 else 1 end
    where id = v_match.away_team_id;
  end if;

  if v_stats_count > 0 then
    select
      case
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'match_id') then 'match_id'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'game_id') then 'game_id'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'partido_id') then 'partido_id'
        else null
      end,
      case
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'player_id') then 'player_id'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'jugador_id') then 'jugador_id'
        else null
      end,
      case
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'team_id') then 'team_id'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'equipo_id') then 'equipo_id'
        else null
      end,
      case
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'points') then 'points'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'pts') then 'pts'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'puntos') then 'puntos'
        else null
      end,
      case
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'rebounds') then 'rebounds'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'reb') then 'reb'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'rebotes') then 'rebotes'
        else null
      end,
      case
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'assists') then 'assists'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'ast') then 'ast'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'asistencias') then 'asistencias'
        else null
      end,
      case
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'turnovers') then 'turnovers'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'tov') then 'tov'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'perdidas') then 'perdidas'
        else null
      end,
      case
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'efficiency') then 'efficiency'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'val') then 'val'
        when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_stats' and column_name = 'valoracion') then 'valoracion'
        else null
      end
    into
      v_match_col,
      v_player_col,
      v_team_col,
      v_points_col,
      v_rebounds_col,
      v_assists_col,
      v_turnovers_col,
      v_efficiency_col;

    if v_match_col is null or v_player_col is null or v_team_col is null then
      raise exception 'player_stats schema unsupported: missing match/player/team keys';
    end if;
    if v_points_col is null or v_rebounds_col is null or v_assists_col is null then
      raise exception 'player_stats schema unsupported: missing points/rebounds/assists columns';
    end if;

    select udt_name into v_match_udt
    from information_schema.columns
    where table_schema = 'public' and table_name = 'player_stats' and column_name = v_match_col;

    select udt_name into v_player_udt
    from information_schema.columns
    where table_schema = 'public' and table_name = 'player_stats' and column_name = v_player_col;

    select udt_name into v_team_udt
    from information_schema.columns
    where table_schema = 'public' and table_name = 'player_stats' and column_name = v_team_col;

    execute format('delete from player_stats where %I = $1', v_match_col) using p_match_id;

    v_insert_cols := format('%I,%I,%I,%I,%I,%I', v_match_col, v_player_col, v_team_col, v_points_col, v_rebounds_col, v_assists_col);

    v_select_cols :=
      case
        when v_match_udt = 'int8' then '$2::bigint'
        when v_match_udt = 'int4' then '$2::integer'
        when v_match_udt = 'uuid' then '$2::uuid'
        else '$2'
      end
      || ','
      || case
        when v_player_udt = 'int8' then 'nullif(s->>''player_id'','''')::bigint'
        when v_player_udt = 'int4' then 'nullif(s->>''player_id'','''')::integer'
        when v_player_udt = 'uuid' then 'nullif(s->>''player_id'','''')::uuid'
        else 'nullif(s->>''player_id'','''')'
      end
      || ','
      || case
        when v_team_udt = 'int8' then 'nullif(s->>''team_id'','''')::bigint'
        when v_team_udt = 'int4' then 'nullif(s->>''team_id'','''')::integer'
        when v_team_udt = 'uuid' then 'nullif(s->>''team_id'','''')::uuid'
        else 'nullif(s->>''team_id'','''')'
      end
      || ',coalesce((s->>''points'')::integer, 0)'
      || ',coalesce((s->>''rebounds'')::integer, 0)'
      || ',coalesce((s->>''assists'')::integer, 0)';

    if v_turnovers_col is not null then
      v_insert_cols := v_insert_cols || format(',%I', v_turnovers_col);
      v_select_cols := v_select_cols || ',coalesce((s->>''turnovers'')::integer, 0)';
    end if;

    if v_efficiency_col is not null then
      v_insert_cols := v_insert_cols || format(',%I', v_efficiency_col);
      v_select_cols := v_select_cols || ',coalesce((s->>''efficiency'')::integer, 0)';
    end if;

    execute format(
      'insert into player_stats (%s) select %s from jsonb_array_elements($1) as s',
      v_insert_cols,
      v_select_cols
    )
    using p_player_stats, p_match_id;

    get diagnostics v_stats_saved = row_count;
  else
    v_warning := 'No player stats payload received';
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'match_id', p_match_id,
    'fase', upper(v_match.fase),
    'stats_rows_in_payload', v_stats_count,
    'stats_rows_saved', v_stats_saved,
    'warning', v_warning
  );
end;
$$;

grant execute on function public.finalize_match_transaction(bigint, integer, integer, jsonb, jsonb)
to anon, authenticated, service_role;

