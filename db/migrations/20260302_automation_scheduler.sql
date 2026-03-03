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

  with league_levels as (
    select
      c.id as club_id,
      coalesce(l.nivel, 1) as league_level,
      coalesce(c.fan_mood, 50) as fan_mood
    from public.clubes c
    left join public.ligas l on l.id = c.league_id
  ),
  econ as (
    select
      ll.club_id,
      ll.fan_mood,
      coalesce(
        er.sponsorship_base,
        case ll.league_level
          when 1 then 250000
          when 2 then 400000
          else 800000
        end
      ) as sponsorship_base,
      coalesce(
        er.ticket_revenue_base,
        case ll.league_level
          when 1 then 250000
          when 2 then 300000
          else 600000
        end
      ) as ticket_revenue_base,
      coalesce(
        er.venue_maintenance,
        case ll.league_level
          when 1 then 25000
          when 2 then 75000
          else 150000
        end
      ) as venue_maintenance
    from league_levels ll
    left join public.economy_rules er on er.league_level = ll.league_level
  ),
  payroll as (
    select
      p.team_id as club_id,
      sum(
        round(
          (least(greatest(coalesce(p.overall, 1), 1), 99) * 500)
          + (
            power(
              greatest(least(greatest(coalesce(p.overall, 1), 1), 99) - 60, 0),
              2
            ) * 180
          )
        )
      )::bigint as salaries
    from public.players p
    where p.team_id is not null
    group by p.team_id
  ),
  balance as (
    select
      e.club_id,
      (e.sponsorship_base + (e.fan_mood * 1000))::bigint as sponsorship_income,
      e.ticket_revenue_base::bigint as ticket_income,
      coalesce(p.salaries, 0)::bigint as salary_expense,
      e.venue_maintenance::bigint as maintenance_expense,
      (
        (e.sponsorship_base + (e.fan_mood * 1000))
        + e.ticket_revenue_base
      )::bigint as total_income,
      (
        coalesce(p.salaries, 0)
        + e.venue_maintenance
      )::bigint as total_expense,
      (
        (e.sponsorship_base + (e.fan_mood * 1000))
        + e.ticket_revenue_base
        - coalesce(p.salaries, 0)
        - e.venue_maintenance
      )::bigint as net_delta
    from econ e
    left join payroll p on p.club_id = e.club_id
  )
  update public.clubes c
  set presupuesto = coalesce(c.presupuesto, 0) + b.net_delta
  from balance b
  where c.id = b.club_id;

  get diagnostics v_clubs_updated = row_count;

  with league_levels as (
    select
      c.id as club_id,
      coalesce(l.nivel, 1) as league_level,
      coalesce(c.fan_mood, 50) as fan_mood
    from public.clubes c
    left join public.ligas l on l.id = c.league_id
  ),
  econ as (
    select
      ll.club_id,
      ll.fan_mood,
      coalesce(
        er.sponsorship_base,
        case ll.league_level
          when 1 then 250000
          when 2 then 400000
          else 800000
        end
      ) as sponsorship_base,
      coalesce(
        er.ticket_revenue_base,
        case ll.league_level
          when 1 then 250000
          when 2 then 300000
          else 600000
        end
      ) as ticket_revenue_base,
      coalesce(
        er.venue_maintenance,
        case ll.league_level
          when 1 then 25000
          when 2 then 75000
          else 150000
        end
      ) as venue_maintenance
    from league_levels ll
    left join public.economy_rules er on er.league_level = ll.league_level
  ),
  payroll as (
    select
      p.team_id as club_id,
      sum(
        round(
          (least(greatest(coalesce(p.overall, 1), 1), 99) * 500)
          + (
            power(
              greatest(least(greatest(coalesce(p.overall, 1), 1), 99) - 60, 0),
              2
            ) * 180
          )
        )
      )::bigint as salaries
    from public.players p
    where p.team_id is not null
    group by p.team_id
  ),
  balance as (
    select
      e.club_id,
      (e.sponsorship_base + (e.fan_mood * 1000))::bigint as sponsorship_income,
      e.ticket_revenue_base::bigint as ticket_income,
      coalesce(p.salaries, 0)::bigint as salary_expense,
      e.venue_maintenance::bigint as maintenance_expense,
      (
        (e.sponsorship_base + (e.fan_mood * 1000))
        + e.ticket_revenue_base
      )::bigint as total_income,
      (
        coalesce(p.salaries, 0)
        + e.venue_maintenance
      )::bigint as total_expense
    from econ e
    left join payroll p on p.club_id = e.club_id
  )
  select
    coalesce(sum(total_income), 0),
    coalesce(sum(total_expense), 0)
  into
    v_total_income,
    v_total_expense
  from balance;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_transactions'
      and column_name = 'owner_id'
  ) into v_has_owner_id;

  if v_has_owner_id then
    execute $sql$
      with league_levels as (
        select
          c.id as club_id,
          coalesce(l.nivel, 1) as league_level,
          coalesce(c.fan_mood, 50) as fan_mood
        from public.clubes c
        left join public.ligas l on l.id = c.league_id
      ),
      econ as (
        select
          ll.club_id,
          ll.fan_mood,
          coalesce(
            er.sponsorship_base,
            case ll.league_level
              when 1 then 250000
              when 2 then 400000
              else 800000
            end
          ) as sponsorship_base,
          coalesce(
            er.ticket_revenue_base,
            case ll.league_level
              when 1 then 250000
              when 2 then 300000
              else 600000
            end
          ) as ticket_revenue_base,
          coalesce(
            er.venue_maintenance,
            case ll.league_level
              when 1 then 25000
              when 2 then 75000
              else 150000
            end
          ) as venue_maintenance
        from league_levels ll
        left join public.economy_rules er on er.league_level = ll.league_level
      ),
      payroll as (
        select
          p.team_id as club_id,
          sum(
            round(
              (least(greatest(coalesce(p.overall, 1), 1), 99) * 500)
              + (
                power(
                  greatest(least(greatest(coalesce(p.overall, 1), 1), 99) - 60, 0),
                  2
                ) * 180
              )
            )
          )::bigint as salaries
        from public.players p
        where p.team_id is not null
        group by p.team_id
      ),
      balance as (
        select
          e.club_id,
          c.owner_id,
          (e.sponsorship_base + (e.fan_mood * 1000))::bigint as sponsorship_income,
          e.ticket_revenue_base::bigint as ticket_income,
          coalesce(p.salaries, 0)::bigint as salary_expense,
          e.venue_maintenance::bigint as maintenance_expense
        from econ e
        join public.clubes c on c.id = e.club_id
        left join payroll p on p.club_id = e.club_id
      )
      insert into public.finance_transactions (team_id, owner_id, concepto, monto, tipo)
      select
        b.club_id,
        b.owner_id,
        'Ingreso semanal: patrocinadores y socios',
        b.sponsorship_income,
        'INGRESO'
      from balance b
      where b.owner_id is not null
      union all
      select
        b.club_id,
        b.owner_id,
        'Ingreso semanal: taquillas y entradas',
        b.ticket_income,
        'INGRESO'
      from balance b
      where b.owner_id is not null
      union all
      select
        b.club_id,
        b.owner_id,
        'Pago semanal: salarios plantilla',
        -b.salary_expense,
        'GASTO'
      from balance b
      where b.owner_id is not null
      union all
      select
        b.club_id,
        b.owner_id,
        'Gasto semanal: mantenimiento pabellón',
        -b.maintenance_expense,
        'GASTO'
      from balance b
      where b.owner_id is not null
    $sql$;
  else
    execute $sql$
      with league_levels as (
        select
          c.id as club_id,
          coalesce(l.nivel, 1) as league_level,
          coalesce(c.fan_mood, 50) as fan_mood
        from public.clubes c
        left join public.ligas l on l.id = c.league_id
      ),
      econ as (
        select
          ll.club_id,
          ll.fan_mood,
          coalesce(
            er.sponsorship_base,
            case ll.league_level
              when 1 then 250000
              when 2 then 400000
              else 800000
            end
          ) as sponsorship_base,
          coalesce(
            er.ticket_revenue_base,
            case ll.league_level
              when 1 then 250000
              when 2 then 300000
              else 600000
            end
          ) as ticket_revenue_base,
          coalesce(
            er.venue_maintenance,
            case ll.league_level
              when 1 then 25000
              when 2 then 75000
              else 150000
            end
          ) as venue_maintenance
        from league_levels ll
        left join public.economy_rules er on er.league_level = ll.league_level
      ),
      payroll as (
        select
          p.team_id as club_id,
          sum(
            round(
              (least(greatest(coalesce(p.overall, 1), 1), 99) * 500)
              + (
                power(
                  greatest(least(greatest(coalesce(p.overall, 1), 1), 99) - 60, 0),
                  2
                ) * 180
              )
            )
          )::bigint as salaries
        from public.players p
        where p.team_id is not null
        group by p.team_id
      ),
      balance as (
        select
          e.club_id,
          (e.sponsorship_base + (e.fan_mood * 1000))::bigint as sponsorship_income,
          e.ticket_revenue_base::bigint as ticket_income,
          coalesce(p.salaries, 0)::bigint as salary_expense,
          e.venue_maintenance::bigint as maintenance_expense
        from econ e
        left join payroll p on p.club_id = e.club_id
      )
      insert into public.finance_transactions (team_id, concepto, monto, tipo)
      select
        b.club_id,
        'Ingreso semanal: patrocinadores y socios',
        b.sponsorship_income,
        'INGRESO'
      from balance b
      union all
      select
        b.club_id,
        'Ingreso semanal: taquillas y entradas',
        b.ticket_income,
        'INGRESO'
      from balance b
      union all
      select
        b.club_id,
        'Pago semanal: salarios plantilla',
        -b.salary_expense,
        'GASTO'
      from balance b
      union all
      select
        b.club_id,
        'Gasto semanal: mantenimiento pabellón',
        -b.maintenance_expense,
        'GASTO'
      from balance b
    $sql$;
  end if;

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
