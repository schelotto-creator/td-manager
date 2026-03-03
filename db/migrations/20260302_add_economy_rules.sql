-- Editable economy rules by league level (used by /admin, /training and /finance)

create table if not exists public.economy_rules (
  league_level smallint primary key,
  sponsorship_base integer not null check (sponsorship_base >= 0),
  ticket_revenue_base integer not null check (ticket_revenue_base >= 0),
  venue_maintenance integer not null check (venue_maintenance >= 0),
  training_cost_multiplier numeric(6,4) not null check (training_cost_multiplier > 0),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint economy_rules_league_level_check check (league_level between 1 and 3)
);

create or replace function public.touch_economy_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_economy_rules_updated_at on public.economy_rules;
create trigger trg_touch_economy_rules_updated_at
before update on public.economy_rules
for each row
execute function public.touch_economy_rules_updated_at();

insert into public.economy_rules (
  league_level,
  sponsorship_base,
  ticket_revenue_base,
  venue_maintenance,
  training_cost_multiplier
)
values
  (1, 250000, 250000, 25000, 0.35),
  (2, 400000, 300000, 75000, 0.40),
  (3, 800000, 600000, 150000, 0.45)
on conflict (league_level) do update
set
  sponsorship_base = excluded.sponsorship_base,
  ticket_revenue_base = excluded.ticket_revenue_base,
  venue_maintenance = excluded.venue_maintenance,
  training_cost_multiplier = excluded.training_cost_multiplier,
  updated_at = timezone('utc', now());

grant select, insert, update on table public.economy_rules
to anon, authenticated, service_role;
