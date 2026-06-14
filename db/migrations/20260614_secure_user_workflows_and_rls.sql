-- Move user workflows behind service-role transactions and enforce RLS.

do $$
declare
  v_sequence text;
begin
  v_sequence := pg_get_serial_sequence('public.players', 'id');

  if v_sequence is null then
    create sequence if not exists public.players_id_seq;
    alter sequence public.players_id_seq owned by public.players.id;
    alter table public.players
      alter column id set default nextval('public.players_id_seq');
    v_sequence := 'public.players_id_seq';
  end if;

  perform setval(
    v_sequence,
    greatest(coalesce((select max(id) from public.players), 0) + 1, 1),
    false
  );
end;
$$;

create or replace function public.update_manager_profile_transaction(
  p_owner_id uuid,
  p_manager_name text default null,
  p_team_name text default null,
  p_primary_color text default null,
  p_secondary_color text default null,
  p_jersey_home text default null,
  p_jersey_away text default null,
  p_badge_shape text default null,
  p_update_badge_url boolean default false,
  p_badge_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select id into v_club_id
  from public.clubes
  where owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.managers
  where owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'Manager not found' using errcode = 'P0002';
  end if;

  if p_manager_name is not null then
    update public.managers
    set nombre = p_manager_name
    where owner_id = p_owner_id;
  end if;

  update public.clubes
  set nombre = coalesce(p_team_name, nombre),
      color_primario = coalesce(p_primary_color, color_primario),
      color_secundario = coalesce(p_secondary_color, color_secundario),
      jersey_home = coalesce(p_jersey_home, jersey_home),
      jersey_away = coalesce(p_jersey_away, jersey_away),
      escudo_forma = coalesce(p_badge_shape, escudo_forma),
      escudo_url = case when p_update_badge_url then p_badge_url else escudo_url end
  where id = v_club_id;

  return jsonb_build_object('status', 'ok', 'club_id', v_club_id);
end;
$$;

create or replace function public.save_team_tactics_transaction(
  p_owner_id uuid,
  p_match_id integer,
  p_offense text,
  p_defense text,
  p_rotations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_match record;
  v_player_id bigint;
  v_slot text;
  v_slot_value jsonb;
begin
  if p_offense not in ('BALANCED', 'RUN_AND_GUN', 'PAINT_FOCUS') then
    raise exception 'Invalid offensive tactic';
  end if;
  if p_defense not in ('MAN_TO_MAN', 'ZONE_2_3', 'PRESSING') then
    raise exception 'Invalid defensive tactic';
  end if;
  if jsonb_typeof(coalesce(p_rotations, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid rotations';
  end if;

  select id into v_club_id
  from public.clubes
  where owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;

  for v_player_id in
    select distinct (slot.value #>> '{}')::bigint
    from jsonb_each(p_rotations) quarter
    cross join lateral jsonb_each(quarter.value) slot
    where jsonb_typeof(slot.value) = 'number'
  loop
    perform 1
    from public.players
    where id = v_player_id and team_id = v_club_id;
    if not found then
      raise exception 'Player % does not belong to team', v_player_id;
    end if;
  end loop;

  if p_match_id is not null then
    select id, home_team_id, away_team_id, played
    into v_match
    from public.matches
    where id = p_match_id
    for update;

    if not found then
      raise exception 'Match not found' using errcode = 'P0002';
    end if;
    if v_match.played then
      raise exception 'Played matches cannot be edited';
    end if;
    if v_club_id <> v_match.home_team_id and v_club_id <> v_match.away_team_id then
      raise exception 'Team is not part of this match';
    end if;

    if v_club_id = v_match.home_team_id then
      update public.matches
      set home_tactics = jsonb_build_object(
            'offense', p_offense,
            'defense', p_defense,
            'rotations', p_rotations
          ),
          simulated_home_score = null,
          simulated_away_score = null,
          simulated_play_by_play = null,
          simulated_player_stats = null,
          simulation_ready_at = null
      where id = p_match_id;
    else
      update public.matches
      set away_tactics = jsonb_build_object(
            'offense', p_offense,
            'defense', p_defense,
            'rotations', p_rotations
          ),
          simulated_home_score = null,
          simulated_away_score = null,
          simulated_play_by_play = null,
          simulated_player_stats = null,
          simulation_ready_at = null
      where id = p_match_id;
    end if;

    return jsonb_build_object('status', 'ok', 'scope', 'match', 'match_id', p_match_id);
  end if;

  update public.clubes
  set tactic_offense = p_offense,
      tactic_defense = p_defense,
      rotations = p_rotations
  where id = v_club_id;

  update public.matches
  set simulated_home_score = null,
      simulated_away_score = null,
      simulated_play_by_play = null,
      simulated_player_stats = null,
      simulation_ready_at = null
  where played = false
    and (home_team_id = v_club_id or away_team_id = v_club_id);

  update public.players
  set lineup_pos = 'BENCH'
  where team_id = v_club_id;

  if jsonb_typeof(p_rotations -> 'q1') = 'object' then
    for v_slot, v_slot_value in
      select key, value from jsonb_each(p_rotations -> 'q1')
    loop
      if jsonb_typeof(v_slot_value) = 'number' then
        update public.players
        set lineup_pos = v_slot
        where id = (v_slot_value #>> '{}')::bigint
          and team_id = v_club_id;
      end if;
    end loop;
  end if;

  return jsonb_build_object('status', 'ok', 'scope', 'default', 'club_id', v_club_id);
end;
$$;

create or replace function public.complete_onboarding_transaction(
  p_owner_id uuid,
  p_manager_name text,
  p_club_name text,
  p_badge_shape text,
  p_primary_color text,
  p_players jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club record;
  v_club_id uuid;
  v_manager_id uuid;
  v_needs_roster boolean := false;
  v_player_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_owner_id::text));

  select id into v_manager_id
  from public.managers
  where owner_id = p_owner_id
  for update;

  if found then
    update public.managers set nombre = p_manager_name where id = v_manager_id;
  else
    insert into public.managers (owner_id, nombre, nivel, xp)
    values (p_owner_id, p_manager_name, 1, 0)
    returning id into v_manager_id;
  end if;

  select id, status into v_club
  from public.clubes
  where owner_id = p_owner_id
  for update;

  if found then
    if coalesce(v_club.status, 'ROOKIE_DRAFT') not in ('ROOKIE_DRAFT', 'SEASON_DRAFT') then
      raise exception 'Onboarding already completed';
    end if;
    v_club_id := v_club.id;
    update public.clubes
    set nombre = p_club_name,
        escudo_forma = p_badge_shape,
        color_primario = p_primary_color,
        is_bot = false
    where id = v_club_id;
  else
    select c.id, c.status into v_club
    from public.clubes c
    left join public.ligas l on l.id = c.league_id
    where c.is_bot = true and c.owner_id is null
    order by coalesce(l.nivel, 999), coalesce(c.pts, 0), coalesce(c.v, 0), coalesce(c.d, 0) desc, c.id
    for update of c skip locked
    limit 1;

    if found then
      v_club_id := v_club.id;
      delete from public.players where team_id = v_club_id;
      update public.clubes
      set owner_id = p_owner_id,
          nombre = p_club_name,
          escudo_forma = p_badge_shape,
          color_primario = p_primary_color,
          is_bot = false,
          presupuesto = 1000000,
          status = 'ROOKIE_DRAFT'
      where id = v_club_id;
      v_needs_roster := true;
    else
      insert into public.clubes (
        owner_id, nombre, escudo_forma, color_primario,
        presupuesto, is_bot, league_id, status
      )
      values (
        p_owner_id, p_club_name, p_badge_shape, p_primary_color,
        1000000, false, 1, 'ROOKIE_DRAFT'
      )
      returning id into v_club_id;
      v_needs_roster := true;
    end if;
  end if;

  select count(*)::integer into v_player_count
  from public.players
  where team_id = v_club_id;
  v_needs_roster := v_needs_roster or v_player_count = 0;

  if v_needs_roster then
    if jsonb_typeof(coalesce(p_players, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_players, '[]'::jsonb)) <> 8 then
      raise exception 'Initial roster must contain eight players';
    end if;

    insert into public.players (
      name, nationality, position, age, height,
      shooting_3pt, shooting_2pt, defense, passing, rebounding,
      speed, dribbling, stamina, experience, overall, salary,
      team_id, lineup_pos
    )
    select
      player->>'name',
      coalesce(player->>'nationality', 'USA'),
      player->>'position',
      (player->>'age')::integer,
      (player->>'height')::integer,
      (player->>'shooting_3pt')::integer,
      (player->>'shooting_2pt')::integer,
      (player->>'defense')::integer,
      (player->>'passing')::integer,
      (player->>'rebounding')::integer,
      (player->>'speed')::integer,
      (player->>'dribbling')::integer,
      100,
      (player->>'experience')::integer,
      (player->>'overall')::integer,
      (player->>'salary')::integer,
      v_club_id,
      'BENCH'
    from jsonb_array_elements(p_players) player;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'club_id', v_club_id,
    'manager_id', v_manager_id,
    'roster_created', v_needs_roster
  );
end;
$$;

create or replace function public.prepare_team_draft_transaction(
  p_owner_id uuid,
  p_initial_players jsonb default '[]'::jsonb,
  p_draft_players jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club record;
  v_pool_tag text;
  v_roster_count integer;
  v_pool_count integer;
begin
  select id, status into v_club
  from public.clubes
  where owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_club.status not in ('ROOKIE_DRAFT', 'SEASON_DRAFT') then
    raise exception 'Team has no pending draft';
  end if;

  v_pool_tag := case
    when v_club.status = 'ROOKIE_DRAFT' then 'ROOKIE_DRAFT_POOL_' || v_club.id::text
    else 'SEASON_DRAFT_POOL_' || v_club.id::text
  end;

  select count(*)::integer into v_roster_count
  from public.players
  where team_id = v_club.id;

  if v_club.status = 'ROOKIE_DRAFT' and v_roster_count = 0 then
    if jsonb_typeof(coalesce(p_initial_players, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_initial_players, '[]'::jsonb)) <> 8 then
      raise exception 'Initial roster must contain eight players';
    end if;

    insert into public.players (
      name, nationality, position, age, height,
      shooting_3pt, shooting_2pt, defense, passing, rebounding,
      speed, dribbling, stamina, experience, overall, salary,
      team_id, lineup_pos
    )
    select
      player->>'name', coalesce(player->>'nationality', 'USA'), player->>'position',
      (player->>'age')::integer, (player->>'height')::integer,
      (player->>'shooting_3pt')::integer, (player->>'shooting_2pt')::integer,
      (player->>'defense')::integer, (player->>'passing')::integer,
      (player->>'rebounding')::integer, (player->>'speed')::integer,
      (player->>'dribbling')::integer, 100, (player->>'experience')::integer,
      (player->>'overall')::integer, (player->>'salary')::integer,
      v_club.id, 'BENCH'
    from jsonb_array_elements(p_initial_players) player;
  end if;

  select count(*)::integer into v_pool_count
  from public.players
  where team_id is null and lineup_pos = v_pool_tag;

  if v_pool_count = 0 then
    if jsonb_typeof(coalesce(p_draft_players, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_draft_players, '[]'::jsonb)) = 0 then
      raise exception 'Draft pool cannot be empty';
    end if;

    insert into public.players (
      name, nationality, position, age, height,
      shooting_3pt, shooting_2pt, defense, passing, rebounding,
      speed, dribbling, stamina, experience, overall, salary,
      team_id, lineup_pos
    )
    select
      player->>'name', coalesce(player->>'nationality', 'USA'), player->>'position',
      (player->>'age')::integer, (player->>'height')::integer,
      (player->>'shooting_3pt')::integer, (player->>'shooting_2pt')::integer,
      (player->>'defense')::integer, (player->>'passing')::integer,
      (player->>'rebounding')::integer, (player->>'speed')::integer,
      (player->>'dribbling')::integer, 100, (player->>'experience')::integer,
      (player->>'overall')::integer, (player->>'salary')::integer,
      null, v_pool_tag
    from jsonb_array_elements(p_draft_players) player;
  end if;

  return jsonb_build_object('status', 'ok', 'club_id', v_club.id, 'pool_tag', v_pool_tag);
end;
$$;

create or replace function public.complete_team_draft_transaction(
  p_owner_id uuid,
  p_selected_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club record;
  v_pool_tag text;
  v_expected_picks integer;
  v_selected_count integer;
begin
  select id, status into v_club
  from public.clubes
  where owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_club.status not in ('ROOKIE_DRAFT', 'SEASON_DRAFT') then
    raise exception 'Team has no pending draft';
  end if;

  v_expected_picks := case when v_club.status = 'ROOKIE_DRAFT' then 2 else 1 end;
  if coalesce(cardinality(p_selected_ids), 0) <> v_expected_picks then
    raise exception 'Invalid number of draft picks';
  end if;

  v_pool_tag := case
    when v_club.status = 'ROOKIE_DRAFT' then 'ROOKIE_DRAFT_POOL_' || v_club.id::text
    else 'SEASON_DRAFT_POOL_' || v_club.id::text
  end;

  select count(*)::integer into v_selected_count
  from (
    select id
    from public.players
    where id = any(p_selected_ids)
      and team_id is null
      and lineup_pos = v_pool_tag
    for update
  ) selected;

  if v_selected_count <> v_expected_picks then
    raise exception 'One or more picks are no longer available';
  end if;

  update public.players
  set team_id = v_club.id,
      lineup_pos = 'BENCH'
  where id = any(p_selected_ids)
    and team_id is null
    and lineup_pos = v_pool_tag;

  delete from public.players
  where team_id is null
    and lineup_pos = v_pool_tag
    and id <> all(p_selected_ids);

  update public.clubes
  set status = 'COMPETING'
  where id = v_club.id;

  return jsonb_build_object(
    'status', 'ok',
    'club_id', v_club.id,
    'selected_ids', to_jsonb(p_selected_ids)
  );
end;
$$;

create or replace function public.delete_manager_account_transaction(
  p_target_owner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_club_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_club_ids
  from (
    select id
    from public.clubes
    where owner_id = p_target_owner_id
    for update
  ) owned_clubs;

  update public.players
  set team_id = null,
      lineup_pos = null
  where team_id = any(v_club_ids);

  update public.clubes
  set owner_id = null,
      is_bot = true,
      nombre = 'Bot Team ' || upper(right(replace(id::text, '-', ''), 6)),
      presupuesto = 500000,
      color_primario = '#64748b',
      color_secundario = '#1e293b',
      escudo_forma = 'classic',
      escudo_url = null,
      status = 'COMPETING'
  where id = any(v_club_ids);

  delete from public.managers where owner_id = p_target_owner_id;
  delete from auth.users where id = p_target_owner_id;

  return jsonb_build_object(
    'status', 'ok',
    'owner_id', p_target_owner_id,
    'clubs_reset', cardinality(v_club_ids)
  );
end;
$$;

revoke all on function public.update_manager_profile_transaction(
  uuid, text, text, text, text, text, text, text, boolean, text
) from public, anon, authenticated;
revoke all on function public.save_team_tactics_transaction(
  uuid, integer, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.complete_onboarding_transaction(
  uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.prepare_team_draft_transaction(
  uuid, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.complete_team_draft_transaction(
  uuid, bigint[]
) from public, anon, authenticated;
revoke all on function public.delete_manager_account_transaction(
  uuid
) from public, anon, authenticated;

grant execute on function public.update_manager_profile_transaction(
  uuid, text, text, text, text, text, text, text, boolean, text
) to service_role;
grant execute on function public.save_team_tactics_transaction(
  uuid, integer, text, text, jsonb
) to service_role;
grant execute on function public.complete_onboarding_transaction(
  uuid, text, text, text, text, jsonb
) to service_role;
grant execute on function public.prepare_team_draft_transaction(
  uuid, jsonb, jsonb
) to service_role;
grant execute on function public.complete_team_draft_transaction(
  uuid, bigint[]
) to service_role;
grant execute on function public.delete_manager_account_transaction(
  uuid
) to service_role;

do $$
begin
  if to_regprocedure('public.delete_auth_user(uuid)') is not null then
    execute 'revoke all on function public.delete_auth_user(uuid) from public, anon, authenticated';
    execute 'grant execute on function public.delete_auth_user(uuid) to service_role';
  end if;
end;
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.managers
    where owner_id = auth.uid()
      and coalesce(is_admin, false) = true
  );
$$;

revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated, service_role;

alter table public.clubes enable row level security;
alter table public.managers enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.player_stats enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.ligas enable row level security;
alter table public.grupos_liga enable row level security;

revoke all on table public.clubes from public, anon;
revoke all on table public.managers from public, anon;
revoke all on table public.players from public, anon;
revoke all on table public.matches from public, anon;
revoke all on table public.player_stats from public, anon;
revoke all on table public.finance_transactions from public, anon;
revoke all on table public.ligas from public, anon;
revoke all on table public.grupos_liga from public, anon;

grant select, insert, update, delete on table public.clubes to authenticated;
grant select, insert, update, delete on table public.managers to authenticated;
grant select, insert, update, delete on table public.players to authenticated;
grant select, insert, update, delete on table public.matches to authenticated;
grant select, insert, update, delete on table public.player_stats to authenticated;
grant select, insert, update, delete on table public.finance_transactions to authenticated;
grant select, insert, update, delete on table public.ligas to authenticated;
grant select, insert, update, delete on table public.grupos_liga to authenticated;
grant usage, select on sequence public.players_id_seq to authenticated;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'clubes',
        'managers',
        'players',
        'matches',
        'player_stats',
        'finance_transactions',
        'ligas',
        'grupos_liga'
      )
  loop
    execute format('drop policy %I on public.%I', v_policy.policyname, v_policy.tablename);
  end loop;
end;
$$;

drop policy if exists "Owners can update their own club" on public.clubes;
drop policy if exists "authenticated read clubs" on public.clubes;
drop policy if exists "admins manage clubs" on public.clubes;
create policy "authenticated read clubs"
on public.clubes for select to authenticated using (true);
create policy "admins manage clubs"
on public.clubes for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "authenticated read own manager" on public.managers;
drop policy if exists "admins manage managers" on public.managers;
create policy "authenticated read own manager"
on public.managers for select to authenticated
using (owner_id = auth.uid() or public.is_current_user_admin());
create policy "admins manage managers"
on public.managers for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "Public can read players" on public.players;
drop policy if exists "authenticated read players" on public.players;
drop policy if exists "admins manage players" on public.players;
create policy "authenticated read players"
on public.players for select to authenticated
using (
  (
    coalesce(lineup_pos, '') not like 'ROOKIE_DRAFT_POOL_%'
    and coalesce(lineup_pos, '') not like 'SEASON_DRAFT_POOL_%'
  )
  or public.is_current_user_admin()
);
create policy "admins manage players"
on public.players for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "authenticated read matches" on public.matches;
drop policy if exists "admins manage matches" on public.matches;
create policy "authenticated read matches"
on public.matches for select to authenticated using (true);
create policy "admins manage matches"
on public.matches for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "authenticated read player stats" on public.player_stats;
drop policy if exists "admins manage player stats" on public.player_stats;
create policy "authenticated read player stats"
on public.player_stats for select to authenticated using (true);
create policy "admins manage player stats"
on public.player_stats for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "authenticated read own finances" on public.finance_transactions;
drop policy if exists "admins manage finances" on public.finance_transactions;
create policy "authenticated read own finances"
on public.finance_transactions for select to authenticated
using (
  exists (
    select 1 from public.clubes
    where clubes.id = finance_transactions.team_id
      and clubes.owner_id = auth.uid()
  )
  or public.is_current_user_admin()
);
create policy "admins manage finances"
on public.finance_transactions for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "authenticated read leagues" on public.ligas;
drop policy if exists "admins manage leagues" on public.ligas;
create policy "authenticated read leagues"
on public.ligas for select to authenticated using (true);
create policy "admins manage leagues"
on public.ligas for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "authenticated read league groups" on public.grupos_liga;
drop policy if exists "admins manage league groups" on public.grupos_liga;
create policy "authenticated read league groups"
on public.grupos_liga for select to authenticated using (true);
create policy "admins manage league groups"
on public.grupos_liga for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'economy_rules',
    'match_simulator_config',
    'position_overall_config'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('revoke all on table public.%I from public, anon', v_table);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', v_table);
      for v_policy in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = v_table
      loop
        execute format('drop policy %I on public.%I', v_policy, v_table);
      end loop;
      execute format('drop policy if exists "authenticated read config" on public.%I', v_table);
      execute format('drop policy if exists "admins manage config" on public.%I', v_table);
      execute format(
        'create policy "authenticated read config" on public.%I for select to authenticated using (true)',
        v_table
      );
      execute format(
        'create policy "admins manage config" on public.%I for all to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin())',
        v_table
      );
    end if;
  end loop;

  if to_regclass('public.github_integration_config') is not null then
    alter table public.github_integration_config enable row level security;
    revoke all on table public.github_integration_config from public, anon;
    grant select, insert, update, delete on table public.github_integration_config to authenticated;
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = 'github_integration_config'
    loop
      execute format(
        'drop policy %I on public.github_integration_config',
        v_policy
      );
    end loop;
    drop policy if exists "admins manage github config" on public.github_integration_config;
    create policy "admins manage github config"
    on public.github_integration_config for all to authenticated
    using (public.is_current_user_admin())
    with check (public.is_current_user_admin());
  end if;
end;
$$;

revoke insert, update, delete on table storage.objects from anon;

update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'escudos';

drop policy if exists "Public Insert" on storage.objects;
drop policy if exists "Public Update" on storage.objects;
drop policy if exists "owners upload club badges" on storage.objects;
drop policy if exists "owners update club badges" on storage.objects;
drop policy if exists "owners delete club badges" on storage.objects;

create policy "owners upload club badges"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'escudos'
  and exists (
    select 1
    from public.clubes
    where clubes.owner_id = auth.uid()
      and clubes.id::text = (storage.foldername(name))[1]
  )
);

create policy "owners update club badges"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'escudos'
  and exists (
    select 1
    from public.clubes
    where clubes.owner_id = auth.uid()
      and clubes.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'escudos'
  and exists (
    select 1
    from public.clubes
    where clubes.owner_id = auth.uid()
      and clubes.id::text = (storage.foldername(name))[1]
  )
);

create policy "owners delete club badges"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'escudos'
  and exists (
    select 1
    from public.clubes
    where clubes.owner_id = auth.uid()
      and clubes.id::text = (storage.foldername(name))[1]
  )
);

notify pgrst, 'reload schema';
