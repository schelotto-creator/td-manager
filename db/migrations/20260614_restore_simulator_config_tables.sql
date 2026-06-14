-- Restore simulator configuration tables that were missing from production.

create table if not exists public.match_simulator_config (
  id smallint primary key default 1,
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  constraint match_simulator_config_singleton check (id = 1)
);

create or replace function public.touch_match_simulator_config_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_match_simulator_config_updated_at
on public.match_simulator_config;
create trigger trg_touch_match_simulator_config_updated_at
before update on public.match_simulator_config
for each row
execute function public.touch_match_simulator_config_updated_at();

insert into public.match_simulator_config (id, settings)
values (
  1,
  jsonb_build_object(
    'quarterDurationSeconds', 600,
    'possessionMinSeconds', 14,
    'possessionMaxSeconds', 24,
    'threePointAttemptRate', 0.35,
    'assistRate', 0.35,
    'foulBaseChance', 18,
    'shootingFoulRate', 0.58,
    'bonusTeamFoulLimit', 5,
    'freeThrowBaseChance', 72,
    'freeThrowSkillImpact', 0.18,
    'offensiveReboundRate', 0.55,
    'baseTwoPointChance', 51,
    'baseThreePointChance', 35,
    'shotAttackerEnergyImpact', 0.35,
    'shotDefenderEnergyImpact', 0.15,
    'shotSkillImpact', 0.16,
    'shotAverageQualityImpact', 0.12,
    'shotChanceMin', 16,
    'shotChanceMax', 72,
    'turnoverBaseChance', 7,
    'turnoverLowEnergyImpact', 0.22,
    'turnoverDefenseEnergyImpact', 0.06,
    'turnoverAverageQualityImpact', 0.08,
    'turnoverChanceMin', 6,
    'turnoverChanceMax', 26,
    'onCourtQuarterRecovery', 10,
    'benchQuarterRecovery', 24,
    'benchPossessionRecovery', 0.22,
    'drainAttackBase', 0.62,
    'drainDefenseBase', 0.46,
    'drainPerPossessionSecond', 0.06,
    'tieBreakerStrengthImpact', 0.8,
    'tieBreakerMinChance', 35,
    'tieBreakerMaxChance', 65,
    'tieBreakerPoints', 2
  )
)
on conflict (id) do nothing;

create table if not exists public.position_overall_config (
  id smallint primary key default 1,
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  constraint position_overall_config_singleton check (id = 1)
);

create or replace function public.touch_position_overall_config_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_position_overall_config_updated_at
on public.position_overall_config;
create trigger trg_touch_position_overall_config_updated_at
before update on public.position_overall_config
for each row
execute function public.touch_position_overall_config_updated_at();

insert into public.position_overall_config (id, settings)
values (
  1,
  jsonb_build_object(
    'Base',
    jsonb_build_object(
      'shooting_3pt', 0.15,
      'shooting_2pt', 0,
      'defense', 0.05,
      'passing', 0.35,
      'rebounding', 0,
      'speed', 0.20,
      'dribbling', 0.25
    ),
    'Escolta',
    jsonb_build_object(
      'shooting_3pt', 0.35,
      'shooting_2pt', 0.20,
      'defense', 0.10,
      'passing', 0,
      'rebounding', 0,
      'speed', 0.20,
      'dribbling', 0.15
    ),
    'Alero',
    jsonb_build_object(
      'shooting_3pt', 0.20,
      'shooting_2pt', 0.20,
      'defense', 0.20,
      'passing', 0.10,
      'rebounding', 0.10,
      'speed', 0.20,
      'dribbling', 0
    ),
    'Ala-Pívot',
    jsonb_build_object(
      'shooting_3pt', 0,
      'shooting_2pt', 0.25,
      'defense', 0.30,
      'passing', 0.05,
      'rebounding', 0.30,
      'speed', 0.10,
      'dribbling', 0
    ),
    'Pívot',
    jsonb_build_object(
      'shooting_3pt', 0,
      'shooting_2pt', 0.20,
      'defense', 0.35,
      'passing', 0,
      'rebounding', 0.40,
      'speed', 0.05,
      'dribbling', 0
    )
  )
)
on conflict (id) do nothing;

alter table public.match_simulator_config enable row level security;
alter table public.position_overall_config enable row level security;

revoke all on table public.match_simulator_config from public, anon;
revoke all on table public.position_overall_config from public, anon;
grant select, insert, update, delete on table public.match_simulator_config
to authenticated, service_role;
grant select, insert, update, delete on table public.position_overall_config
to authenticated, service_role;

drop policy if exists "authenticated read config"
on public.match_simulator_config;
drop policy if exists "admins manage config"
on public.match_simulator_config;
create policy "authenticated read config"
on public.match_simulator_config
for select to authenticated
using (true);
create policy "admins manage config"
on public.match_simulator_config
for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "authenticated read config"
on public.position_overall_config;
drop policy if exists "admins manage config"
on public.position_overall_config;
create policy "authenticated read config"
on public.position_overall_config
for select to authenticated
using (true);
create policy "admins manage config"
on public.position_overall_config
for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

notify pgrst, 'reload schema';
