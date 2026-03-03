-- Editable configuration for the basketball match simulator (global singleton row id=1).

create table if not exists public.match_simulator_config (
  id smallint primary key default 1,
  settings jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint match_simulator_config_singleton check (id = 1)
);

create or replace function public.touch_match_simulator_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_match_simulator_config_updated_at on public.match_simulator_config;
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
    'offensiveReboundRate', 0.55,
    'baseTwoPointChance', 51,
    'baseThreePointChance', 35,
    'shotAttackerEnergyImpact', 0.35,
    'shotDefenderEnergyImpact', 0.15,
    'shotSkillImpact', 0.16,
    'shotChanceMin', 16,
    'shotChanceMax', 72,
    'turnoverBaseChance', 7,
    'turnoverLowEnergyImpact', 0.22,
    'turnoverDefenseEnergyImpact', 0.06,
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
on conflict (id) do update
set
  settings = excluded.settings,
  updated_at = timezone('utc', now());

grant select, insert, update on table public.match_simulator_config
to anon, authenticated, service_role;
