-- Operational guardrails and health reporting for the application match runner.

create table if not exists public.simulator_runtime (
  runtime_key text primary key,
  status text not null default 'idle'
    check (status in ('idle', 'running', 'ok', 'error')),
  run_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  details jsonb not null default '{}'::jsonb
);

alter table public.simulator_runtime enable row level security;
revoke all on table public.simulator_runtime from public, anon, authenticated;
grant all on table public.simulator_runtime to service_role;

create or replace function public.claim_simulator_run(
  p_run_id uuid,
  p_stale_after_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  insert into public.simulator_runtime (
    runtime_key,
    status,
    run_id,
    started_at,
    finished_at,
    heartbeat_at,
    last_error,
    details
  )
  values (
    'match_scheduler',
    'running',
    p_run_id,
    now(),
    null,
    now(),
    null,
    jsonb_build_object('status', 'running')
  )
  on conflict (runtime_key) do update
  set status = 'running',
      run_id = excluded.run_id,
      started_at = excluded.started_at,
      finished_at = null,
      heartbeat_at = excluded.heartbeat_at,
      last_error = null,
      details = excluded.details
  where public.simulator_runtime.status <> 'running'
     or public.simulator_runtime.heartbeat_at
        < now() - make_interval(secs => greatest(60, p_stale_after_seconds))
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.finish_simulator_run(
  p_run_id uuid,
  p_status text,
  p_details jsonb default '{}'::jsonb,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if p_status not in ('ok', 'error') then
    raise exception 'Invalid simulator status';
  end if;

  update public.simulator_runtime
  set status = p_status,
      finished_at = now(),
      heartbeat_at = now(),
      last_success_at = case when p_status = 'ok' then now() else last_success_at end,
      last_error = case when p_status = 'error' then nullif(p_error, '') else null end,
      details = coalesce(p_details, '{}'::jsonb)
  where runtime_key = 'match_scheduler'
    and run_id = p_run_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.get_simulator_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due integer;
  v_prepared_due integer;
  v_due_unprepared integer;
  v_future_unprepared integer;
  v_missing_replay integer;
  v_pending_without_date integer;
  v_oldest_due record;
  v_latest_played record;
  v_next_unplayed record;
  v_runtime public.simulator_runtime%rowtype;
  v_health_status text := 'healthy';
begin
  select count(*)::integer into v_due
  from public.matches
  where played = false and match_date is not null and match_date <= now();

  select count(*)::integer into v_prepared_due
  from public.matches
  where played = false
    and match_date is not null
    and match_date <= now()
    and simulated_play_by_play is not null;

  select count(*)::integer into v_due_unprepared
  from public.matches
  where played = false
    and match_date is not null
    and match_date <= now()
    and simulated_play_by_play is null;

  select count(*)::integer into v_future_unprepared
  from public.matches
  where played = false
    and match_date > now()
    and simulated_play_by_play is null;

  select count(*)::integer into v_missing_replay
  from public.matches
  where played = true
    and (play_by_play is null or play_by_play = '[]'::jsonb);

  select count(*)::integer into v_pending_without_date
  from public.matches
  where played = false and match_date is null;

  select id, match_date into v_oldest_due
  from public.matches
  where played = false and match_date is not null and match_date <= now()
  order by match_date, id
  limit 1;

  select id, match_date into v_latest_played
  from public.matches
  where played = true
  order by match_date desc nulls last, id desc
  limit 1;

  select id, match_date into v_next_unplayed
  from public.matches
  where played = false and match_date is not null
  order by match_date, id
  limit 1;

  select * into v_runtime
  from public.simulator_runtime
  where runtime_key = 'match_scheduler';

  if v_due > 0
     and v_oldest_due.match_date < now() - interval '15 minutes' then
    v_health_status := 'critical';
  elsif v_due_unprepared > 0
     or v_missing_replay > 0
     or v_pending_without_date > 0
     or v_runtime.status = 'error' then
    v_health_status := 'warning';
  elsif v_runtime.status = 'running' then
    v_health_status := 'running';
  end if;

  return jsonb_build_object(
    'status', v_health_status,
    'checked_at', now(),
    'due', v_due,
    'prepared_due', v_prepared_due,
    'due_unprepared', v_due_unprepared,
    'future_unprepared', v_future_unprepared,
    'played_missing_replay', v_missing_replay,
    'pending_without_date', v_pending_without_date,
    'oldest_due', case when v_oldest_due.id is null then null else
      jsonb_build_object('id', v_oldest_due.id, 'match_date', v_oldest_due.match_date) end,
    'latest_played', case when v_latest_played.id is null then null else
      jsonb_build_object('id', v_latest_played.id, 'match_date', v_latest_played.match_date) end,
    'next_unplayed', case when v_next_unplayed.id is null then null else
      jsonb_build_object('id', v_next_unplayed.id, 'match_date', v_next_unplayed.match_date) end,
    'runtime', case when v_runtime.runtime_key is null then null else
      jsonb_build_object(
        'status', v_runtime.status,
        'run_id', v_runtime.run_id,
        'started_at', v_runtime.started_at,
        'finished_at', v_runtime.finished_at,
        'heartbeat_at', v_runtime.heartbeat_at,
        'last_success_at', v_runtime.last_success_at,
        'last_error', v_runtime.last_error,
        'details', v_runtime.details
      ) end
  );
end;
$$;

revoke all on function public.claim_simulator_run(uuid, integer)
from public, anon, authenticated;
revoke all on function public.finish_simulator_run(uuid, text, jsonb, text)
from public, anon, authenticated;
revoke all on function public.get_simulator_health()
from public, anon, authenticated;

grant execute on function public.claim_simulator_run(uuid, integer)
to service_role;
grant execute on function public.finish_simulator_run(uuid, text, jsonb, text)
to service_role;
grant execute on function public.get_simulator_health()
to service_role;

-- These jobs call the obsolete SQL engine, which references players.ovr and
-- bypasses the application engine's stats, injuries, objectives and replay flow.
-- The application scheduler also owns weekly maintenance, so remove the
-- overlapping legacy routines to prevent duplicate financial/progression runs.
do $$
declare
  v_job record;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    for v_job in
      select jobid
      from cron.job
      where command ilike '%simular_jornada_playbyplay%'
         or command ilike '%ejecutar_cierre_semanal%'
         or command ilike '%rutina_semanal_forma%'
         or command ilike '%rutina_semanal_finanzas%'
         or command ilike '%reset_entrenos_semanales%'
    loop
      perform cron.unschedule(v_job.jobid);
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';
