-- Keep privileged game mutations behind authenticated server routes.

revoke all on function public.finalize_match_transaction(bigint, integer, integer, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.finalize_match_transaction(bigint, integer, integer, jsonb, jsonb)
to service_role;

do $$
begin
  if to_regprocedure('public.run_weekly_maintenance(boolean)') is not null then
    execute 'revoke all on function public.run_weekly_maintenance(boolean) from public, anon, authenticated';
    execute 'grant execute on function public.run_weekly_maintenance(boolean) to service_role';
  end if;
end;
$$;

revoke all on table public.automation_runs from public, anon, authenticated;
grant select, insert, update on table public.automation_runs to service_role;

create table if not exists public.training_config (
  id integer primary key default 1,
  settings jsonb not null,
  constraint training_config_singleton check (id = 1)
);

alter table public.training_config enable row level security;
revoke insert, update, delete on table public.training_config from public, anon, authenticated;
grant select on table public.training_config to authenticated;
grant all on table public.training_config to service_role;

drop policy if exists "authenticated can read training config" on public.training_config;
create policy "authenticated can read training config"
on public.training_config
for select
to authenticated
using (true);

create table if not exists public.market_listings (
  id bigserial primary key,
  player_id bigint not null,
  seller_team_id uuid not null,
  starting_price integer not null check (starting_price > 0),
  current_price integer not null check (current_price > 0),
  buyer_team_id uuid,
  ends_at timestamptz not null,
  status text not null default 'active'
    check (status in ('active', 'sold', 'expired')),
  created_at timestamptz not null default now(),
  constraint market_listings_player_id_fkey
    foreign key (player_id) references public.players(id) on delete cascade,
  constraint market_listings_seller_team_id_fkey
    foreign key (seller_team_id) references public.clubes(id) on delete cascade,
  constraint market_listings_buyer_team_id_fkey
    foreign key (buyer_team_id) references public.clubes(id) on delete set null
);

create unique index if not exists idx_market_listings_active_player
  on public.market_listings (player_id)
  where status = 'active';
create index if not exists idx_market_listings_active_ends_at
  on public.market_listings (ends_at)
  where status = 'active';

alter table public.market_listings enable row level security;
revoke insert, update, delete on table public.market_listings from public, anon, authenticated;
grant select on table public.market_listings to authenticated;
grant all on table public.market_listings to service_role;

drop policy if exists "authenticated can read market listings" on public.market_listings;
create policy "authenticated can read market listings"
on public.market_listings
for select
to authenticated
using (true);

create or replace function public.place_market_bid_transaction(
  p_listing_id bigint,
  p_buyer_team_id uuid,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_buyer_budget integer;
  v_min_bid integer;
  v_net_deduction integer;
begin
  if p_amount <= 0 then
    raise exception 'Invalid bid amount';
  end if;

  select id, player_id, seller_team_id, buyer_team_id, current_price, ends_at, status
  into v_listing
  from public.market_listings
  where id = p_listing_id
  for update;

  if not found or v_listing.status <> 'active' then
    raise exception 'Auction not found or already closed' using errcode = 'P0002';
  end if;
  if v_listing.seller_team_id = p_buyer_team_id then
    raise exception 'Cannot bid on own auction';
  end if;
  if v_listing.ends_at <= now() then
    raise exception 'Auction has ended';
  end if;

  v_min_bid := v_listing.current_price
    + greatest(10000, ceil(v_listing.current_price * 0.05)::integer);
  if p_amount < v_min_bid then
    raise exception 'Minimum bid is %', v_min_bid;
  end if;

  perform 1
  from public.clubes
  where id in (p_buyer_team_id, v_listing.buyer_team_id)
  order by id
  for update;

  select presupuesto
  into v_buyer_budget
  from public.clubes
  where id = p_buyer_team_id;

  if not found then
    raise exception 'Buyer team not found' using errcode = 'P0002';
  end if;

  v_net_deduction := case
    when v_listing.buyer_team_id = p_buyer_team_id
      then p_amount - v_listing.current_price
    else p_amount
  end;

  if v_buyer_budget < v_net_deduction then
    raise exception 'Insufficient budget';
  end if;

  if v_listing.buyer_team_id is not null
     and v_listing.buyer_team_id <> p_buyer_team_id then
    update public.clubes
    set presupuesto = presupuesto + v_listing.current_price
    where id = v_listing.buyer_team_id;
  end if;

  update public.clubes
  set presupuesto = presupuesto - v_net_deduction
  where id = p_buyer_team_id;

  update public.market_listings
  set current_price = p_amount,
      buyer_team_id = p_buyer_team_id
  where id = p_listing_id;

  return jsonb_build_object(
    'status', 'ok',
    'new_budget', v_buyer_budget - v_net_deduction,
    'previous_buyer_team_id', v_listing.buyer_team_id,
    'player_id', v_listing.player_id
  );
end;
$$;

create or replace function public.assign_training_focus_transaction(
  p_team_id uuid,
  p_player_id bigint,
  p_focus text,
  p_cost integer,
  p_stamina_cost integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player record;
  v_budget integer;
begin
  if p_focus not in (
    'shooting_3pt', 'shooting_2pt', 'defense', 'rebounding',
    'passing', 'dribbling', 'speed'
  ) then
    raise exception 'Invalid training focus';
  end if;
  if p_cost < 0 or p_stamina_cost <= 0 then
    raise exception 'Invalid training cost';
  end if;

  select id, name, stamina, entrenos_semanales, injured_until
  into v_player
  from public.players
  where id = p_player_id and team_id = p_team_id
  for update;

  if not found then
    raise exception 'Player not found in team' using errcode = 'P0002';
  end if;
  if v_player.injured_until is not null and v_player.injured_until >= current_date then
    raise exception 'Player is injured';
  end if;
  if coalesce(v_player.entrenos_semanales, 0) >= 1 then
    raise exception 'Weekly training already assigned';
  end if;
  if coalesce(v_player.stamina, 0) < p_stamina_cost then
    raise exception 'Insufficient stamina';
  end if;

  select presupuesto into v_budget
  from public.clubes
  where id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_budget < p_cost then
    raise exception 'Insufficient budget';
  end if;

  update public.players
  set training_focus = p_focus,
      stamina = coalesce(stamina, 0) - p_stamina_cost,
      entrenos_semanales = coalesce(entrenos_semanales, 0) + 1
  where id = p_player_id;

  update public.clubes
  set presupuesto = presupuesto - p_cost
  where id = p_team_id;

  insert into public.finance_transactions (team_id, concepto, monto, tipo, fecha)
  values (
    p_team_id,
    'Gimnasio: ' || v_player.name || ' (Foco: ' || p_focus || ')',
    -p_cost,
    'GASTO',
    now()
  );

  return jsonb_build_object(
    'status', 'ok',
    'new_budget', v_budget - p_cost,
    'new_stamina', v_player.stamina - p_stamina_cost,
    'weekly_trainings', v_player.entrenos_semanales + 1
  );
end;
$$;

create or replace function public.heal_player_transaction(
  p_team_id uuid,
  p_player_id bigint,
  p_cost integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player record;
  v_budget integer;
begin
  if p_cost < 0 then
    raise exception 'Invalid healing cost';
  end if;

  select id, name, stamina
  into v_player
  from public.players
  where id = p_player_id and team_id = p_team_id
  for update;

  if not found then
    raise exception 'Player not found in team' using errcode = 'P0002';
  end if;

  select presupuesto into v_budget
  from public.clubes
  where id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_budget < p_cost then
    raise exception 'Insufficient budget';
  end if;

  update public.players set stamina = 100 where id = p_player_id;
  update public.clubes set presupuesto = presupuesto - p_cost where id = p_team_id;

  insert into public.finance_transactions (team_id, concepto, monto, tipo, fecha)
  values (
    p_team_id,
    'Fisio: ' || v_player.name || ' (Recuperación)',
    -p_cost,
    'GASTO',
    now()
  );

  return jsonb_build_object(
    'status', 'ok',
    'new_budget', v_budget - p_cost,
    'new_stamina', 100
  );
end;
$$;

create or replace function public.upgrade_manager_talent_transaction(
  p_owner_id uuid,
  p_talent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager record;
  v_current_level integer;
begin
  if p_talent not in (
    'talento_ojo', 'talento_financiero', 'talento_mentor',
    'talento_staff', 'talento_idolo'
  ) then
    raise exception 'Invalid talent';
  end if;

  select *
  into v_manager
  from public.managers
  where owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'Manager not found' using errcode = 'P0002';
  end if;
  if coalesce(v_manager.puntos_talento, 0) <= 0 then
    raise exception 'No talent points available';
  end if;

  v_current_level := case p_talent
    when 'talento_ojo' then coalesce(v_manager.talento_ojo, 0)
    when 'talento_financiero' then coalesce(v_manager.talento_financiero, 0)
    when 'talento_mentor' then coalesce(v_manager.talento_mentor, 0)
    when 'talento_staff' then coalesce(v_manager.talento_staff, 0)
    when 'talento_idolo' then coalesce(v_manager.talento_idolo, 0)
  end;

  if v_current_level >= 3 then
    raise exception 'Talent already at maximum';
  end if;

  update public.managers
  set puntos_talento = puntos_talento - 1,
      talento_ojo = coalesce(talento_ojo, 0) + case when p_talent = 'talento_ojo' then 1 else 0 end,
      talento_financiero = coalesce(talento_financiero, 0) + case when p_talent = 'talento_financiero' then 1 else 0 end,
      talento_mentor = coalesce(talento_mentor, 0) + case when p_talent = 'talento_mentor' then 1 else 0 end,
      talento_staff = coalesce(talento_staff, 0) + case when p_talent = 'talento_staff' then 1 else 0 end,
      talento_idolo = coalesce(talento_idolo, 0) + case when p_talent = 'talento_idolo' then 1 else 0 end
  where id = v_manager.id;

  return jsonb_build_object(
    'status', 'ok',
    'talent', p_talent,
    'new_level', v_current_level + 1,
    'remaining_points', v_manager.puntos_talento - 1
  );
end;
$$;

create or replace function public.sign_free_agent_transaction(
  p_team_id uuid,
  p_player_id bigint,
  p_price integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget integer;
  v_player record;
begin
  if p_price <= 0 then
    raise exception 'Invalid signing price';
  end if;

  select presupuesto into v_budget
  from public.clubes
  where id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;

  select id, name, team_id into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found or v_player.team_id is not null then
    raise exception 'Player is no longer a free agent';
  end if;
  if v_budget < p_price then
    raise exception 'Insufficient budget';
  end if;

  update public.players
  set team_id = p_team_id,
      lineup_pos = 'BENCH'
  where id = p_player_id;

  update public.clubes
  set presupuesto = presupuesto - p_price
  where id = p_team_id;

  insert into public.finance_transactions (team_id, concepto, monto, tipo, fecha)
  values (
    p_team_id,
    'Mercado: Fichaje ' || v_player.name,
    -p_price,
    'GASTO',
    now()
  );

  return jsonb_build_object(
    'status', 'ok',
    'new_budget', v_budget - p_price,
    'player_name', v_player.name
  );
end;
$$;

create or replace function public.remove_roster_player_transaction(
  p_team_id uuid,
  p_player_id bigint,
  p_sale_price integer,
  p_concept text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget integer;
  v_roster_size integer;
  v_player record;
begin
  if p_sale_price < 0 then
    raise exception 'Invalid sale price';
  end if;

  select presupuesto into v_budget
  from public.clubes
  where id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;

  select id, name into v_player
  from public.players
  where id = p_player_id and team_id = p_team_id
  for update;

  if not found then
    raise exception 'Player not found in team' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_roster_size
  from public.players
  where team_id = p_team_id;

  if v_roster_size <= 5 then
    raise exception 'Team must keep at least five players';
  end if;

  update public.players
  set team_id = null,
      lineup_pos = null
  where id = p_player_id;

  if p_sale_price > 0 then
    update public.clubes
    set presupuesto = presupuesto + p_sale_price
    where id = p_team_id;

    insert into public.finance_transactions (team_id, concepto, monto, tipo, fecha)
    values (
      p_team_id,
      coalesce(nullif(p_concept, ''), 'Mercado: Venta ' || v_player.name),
      p_sale_price,
      'INGRESO',
      now()
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'new_budget', v_budget + p_sale_price,
    'player_name', v_player.name
  );
end;
$$;

create or replace function public.scout_player_transaction(
  p_owner_id uuid,
  p_team_id uuid,
  p_player_id bigint,
  p_cost integer,
  p_stats text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget integer;
  v_manager record;
  v_player_key text := p_player_id::text;
  v_existing_stats jsonb;
  v_merged_stats jsonb;
  v_new_ojeos jsonb;
  v_stat text;
begin
  if p_cost <= 0 or coalesce(array_length(p_stats, 1), 0) = 0 then
    raise exception 'Invalid scouting request';
  end if;

  foreach v_stat in array p_stats loop
    if v_stat not in (
      'speed', 'stamina', 'shooting_3pt', 'shooting_2pt',
      'dribbling', 'defense', 'rebounding', 'passing'
    ) then
      raise exception 'Invalid scouting stat';
    end if;
  end loop;

  select presupuesto into v_budget
  from public.clubes
  where id = p_team_id and owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_budget < p_cost then
    raise exception 'Insufficient budget';
  end if;

  perform 1
  from public.players
  where id = p_player_id and team_id is null
  for update;
  if not found then
    raise exception 'Player is no longer available';
  end if;

  select id, coalesce(ojeos, '{}'::jsonb) as ojeos
  into v_manager
  from public.managers
  where owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'Manager not found' using errcode = 'P0002';
  end if;

  v_existing_stats := coalesce(v_manager.ojeos -> v_player_key, '[]'::jsonb);
  select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
  into v_merged_stats
  from (
    select distinct value
    from jsonb_array_elements_text(v_existing_stats || to_jsonb(p_stats)) as stats(value)
  ) merged;

  v_new_ojeos := jsonb_set(v_manager.ojeos, array[v_player_key], v_merged_stats, true);

  update public.managers set ojeos = v_new_ojeos where id = v_manager.id;
  update public.clubes set presupuesto = presupuesto - p_cost where id = p_team_id;

  insert into public.finance_transactions (team_id, concepto, monto, tipo, fecha)
  values (p_team_id, 'Mercado: Ojeo de jugador', -p_cost, 'GASTO', now());

  return jsonb_build_object(
    'status', 'ok',
    'new_budget', v_budget - p_cost,
    'new_ojeos', v_new_ojeos,
    'new_stats', to_jsonb(p_stats)
  );
end;
$$;

revoke all on function public.place_market_bid_transaction(bigint, uuid, integer)
from public, anon, authenticated;
revoke all on function public.assign_training_focus_transaction(uuid, bigint, text, integer, integer)
from public, anon, authenticated;
revoke all on function public.heal_player_transaction(uuid, bigint, integer)
from public, anon, authenticated;
revoke all on function public.upgrade_manager_talent_transaction(uuid, text)
from public, anon, authenticated;
revoke all on function public.sign_free_agent_transaction(uuid, bigint, integer)
from public, anon, authenticated;
revoke all on function public.remove_roster_player_transaction(uuid, bigint, integer, text)
from public, anon, authenticated;
revoke all on function public.scout_player_transaction(uuid, uuid, bigint, integer, text[])
from public, anon, authenticated;

grant execute on function public.place_market_bid_transaction(bigint, uuid, integer)
to service_role;
grant execute on function public.assign_training_focus_transaction(uuid, bigint, text, integer, integer)
to service_role;
grant execute on function public.heal_player_transaction(uuid, bigint, integer)
to service_role;
grant execute on function public.upgrade_manager_talent_transaction(uuid, text)
to service_role;
grant execute on function public.sign_free_agent_transaction(uuid, bigint, integer)
to service_role;
grant execute on function public.remove_roster_player_transaction(uuid, bigint, integer, text)
to service_role;
grant execute on function public.scout_player_transaction(uuid, uuid, bigint, integer, text[])
to service_role;

notify pgrst, 'reload schema';
