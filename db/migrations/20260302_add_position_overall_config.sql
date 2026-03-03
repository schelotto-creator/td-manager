-- Editable configuration for weighted overall by court position (global singleton row id=1).

create table if not exists public.position_overall_config (
  id smallint primary key default 1,
  settings jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint position_overall_config_singleton check (id = 1)
);

create or replace function public.touch_position_overall_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_position_overall_config_updated_at on public.position_overall_config;
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
on conflict (id) do update
set
  settings = excluded.settings,
  updated_at = timezone('utc', now());

grant select, insert, update on table public.position_overall_config
to anon, authenticated, service_role;
