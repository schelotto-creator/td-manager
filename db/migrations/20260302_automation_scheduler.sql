-- Automatización de temporada:
-- 1) Fecha/hora oficial de partido (match_date) calculada desde jornada.
-- 2) Mantenimiento semanal idempotente (finanzas + forma + reset entrenos).
-- 3) Registro de ejecuciones para evitar dobles cierres.

alter table public.matches
  add column if not exists match_date timestamptz;

create or replace function public.compute_match_date_from_jornada(p_jornada integer)
returns timestamptz
language sql
immutable
as $$
  select (
    (
      date '2026-03-04'
      + (((greatest(coalesce(p_jornada, 1), 1) - 1) / 2) * 7)
      + case when (greatest(coalesce(p_jornada, 1), 1) % 2) = 0 then 3 else 0 end
    )
    + case when (greatest(coalesce(p_jornada, 1), 1) % 2) = 0 then time '12:30' else time '18:30' end
  ) at time zone 'Europe/Madrid';
$$;

create or replace function public.set_match_date_from_jornada()
returns trigger
language plpgsql
as $$
begin
  if new.match_date is null and new.jornada is not null then
    new.match_date := public.compute_match_date_from_jornada(new.jornada);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_match_date_from_jornada on public.matches;
create trigger trg_set_match_date_from_jornada
before insert or update of jornada, match_date
on public.matches
for each row
execute function public.set_match_date_from_jornada();

update public.matches
set match_date = public.compute_match_date_from_jornada(jornada)
where match_date is null
  and jornada is not null;

create index if not exists idx_matches_played_match_date
  on public.matches (played, match_date);

create table if not exists public.automation_runs (
  run_key text primary key,
  run_type text not null,
  executed_at timestamptz not null default timezone('utc', now()),
  details jsonb not null default '{}'::jsonb
);

grant select, insert, update
on table public.automation_runs
to anon, authenticated, service_role;

create or replace function public.run_weekly_maintenance(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_local timestamp;
  v_due boolean;
  v_week_key text;
  v_run_key text;
  v_has_owner_id boolean := false;
  v_players_updated integer := 0;
  v_slots_reset integer := 0;
  v_clubs_updated integer := 0;
  v_total_income bigint := 0;
  v_total_expense bigint := 0;
begin
  v_now_local := timezone('Europe/Madrid', now());
  v_due := (
    extract(isodow from v_now_local) > 5
    or (
      extract(isodow from v_now_local) = 5
      and v_now_local::time >= time '01:00'
    )
  );

  if (not p_force) and (not v_due) then
    return jsonb_build_object(
      'status', 'skipped_not_due',
      'now_local', v_now_local
    );
  end if;

  v_week_key := to_char(v_now_local, 'IYYY-"W"IW');
  v_run_key := 'weekly-maintenance:' || v_week_key;

  begin
    insert into public.automation_runs (run_key, run_type, details)
    values (
      v_run_key,
      'weekly_maintenance',
      jsonb_build_object('status', 'started', 'now_local', v_now_local)
    );
  exception
    when unique_violation then
      return jsonb_build_object(
        'status', 'already_done',
        'run_key', v_run_key,
        'now_local', v_now_local
      );
  end;

  update public.players
  set forma = greatest(
    45,
    least(
      99,
      round(
        (coalesce(forma, 80)::numeric * 0.72)
        + 22
        + ((coalesce(stamina, 100)::numeric - 70) * 0.18)
        - (coalesce(entrenos_semanales, 0)::numeric * 2)
        + ((random() * 8) - 4)
      )
    )
  );

  get diagnostics v_players_updated = row_count;

  update public.players
  set entrenos_semanales = 0
  where coalesce(entrenos_semanales, 0) <> 0;

  get diagnostics v_slots_reset = row_count;

  update public.automation_runs
  set details = jsonb_build_object(
    'status', 'ok',
    'week_key', v_week_key,
    'now_local', v_now_local,
    'clubs_updated', v_clubs_updated,
    'players_form_updated', v_players_updated,
    'weekly_train_slots_reset', v_slots_reset,
    'total_income', v_total_income,
    'total_expense', v_total_expense,
    'net_delta', (v_total_income - v_total_expense)
  )
  where run_key = v_run_key;

  return jsonb_build_object(
    'status', 'ok',
    'run_key', v_run_key,
    'now_local', v_now_local,
    'clubs_updated', v_clubs_updated,
    'players_form_updated', v_players_updated,
    'weekly_train_slots_reset', v_slots_reset,
    'total_income', v_total_income,
    'total_expense', v_total_expense,
    'net_delta', (v_total_income - v_total_expense)
  );
end;
$$;

grant execute
on function public.run_weekly_maintenance(boolean)
to authenticated, service_role;
