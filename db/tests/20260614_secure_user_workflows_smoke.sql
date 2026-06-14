do $$
declare
  v_owner_id uuid;
  v_club_id uuid;
  v_initial_players jsonb;
  v_draft_players jsonb;
  v_selected_ids bigint[];
  v_count integer;
  v_status text;
begin
  select id into v_owner_id
  from auth.users
  order by created_at
  limit 1;
  if v_owner_id is null then
    raise exception 'Smoke test requires one auth user';
  end if;

  update public.clubes
  set owner_id = null
  where owner_id = v_owner_id;
  delete from public.managers
  where owner_id = v_owner_id;

  select jsonb_agg(
    jsonb_build_object(
      'name', 'Smoke Veteran ' || n,
      'nationality', 'ESP',
      'position', 'Alero',
      'age', 25,
      'height', 198,
      'shooting_3pt', 55,
      'shooting_2pt', 55,
      'defense', 55,
      'passing', 55,
      'rebounding', 55,
      'speed', 55,
      'dribbling', 55,
      'experience', 30,
      'overall', 57,
      'salary', 28500
    )
  )
  into v_initial_players
  from generate_series(1, 8) n;

  select jsonb_agg(
    jsonb_build_object(
      'name', 'Smoke Rookie ' || n,
      'nationality', 'ESP',
      'position', 'Alero',
      'age', 19,
      'height', 198,
      'shooting_3pt', 65,
      'shooting_2pt', 65,
      'defense', 65,
      'passing', 65,
      'rebounding', 65,
      'speed', 65,
      'dribbling', 65,
      'experience', 5,
      'overall', 65,
      'salary', 34750
    )
  )
  into v_draft_players
  from generate_series(1, 10) n;

  perform public.complete_onboarding_transaction(
    v_owner_id,
    'Smoke Manager',
    'Smoke Club',
    'classic',
    '#123456',
    v_initial_players
  );

  select id into v_club_id
  from public.clubes
  where owner_id = v_owner_id;

  select count(*)::integer into v_count
  from public.players
  where team_id = v_club_id;
  if v_count <> 8 then
    raise exception 'Smoke onboarding roster mismatch: %', v_count;
  end if;

  perform public.prepare_team_draft_transaction(
    v_owner_id,
    v_initial_players,
    v_draft_players
  );

  select (array_agg(id order by id))[1:2]
  into v_selected_ids
  from public.players
  where team_id is null
    and lineup_pos = 'ROOKIE_DRAFT_POOL_' || v_club_id::text;

  perform public.complete_team_draft_transaction(v_owner_id, v_selected_ids);

  select status into v_status
  from public.clubes
  where id = v_club_id;
  if v_status <> 'COMPETING' then
    raise exception 'Smoke draft status mismatch: %', v_status;
  end if;

  select count(*)::integer into v_count
  from public.players
  where team_id = v_club_id;
  if v_count <> 10 then
    raise exception 'Smoke draft roster mismatch: %', v_count;
  end if;

  perform public.update_manager_profile_transaction(
    v_owner_id,
    'Smoke Manager Updated',
    'Smoke Club Updated',
    '#654321',
    '#112233',
    'solid',
    'striped',
    'modern',
    false,
    null
  );

  perform public.save_team_tactics_transaction(
    v_owner_id,
    null,
    'BALANCED',
    'MAN_TO_MAN',
    '{
      "q1":{"PG":null,"SG":null,"SF":null,"PF":null,"C":null},
      "q2":{"PG":null,"SG":null,"SF":null,"PF":null,"C":null},
      "q3":{"PG":null,"SG":null,"SF":null,"PF":null,"C":null},
      "q4":{"PG":null,"SG":null,"SF":null,"PF":null,"C":null}
    }'::jsonb
  );

  perform public.delete_manager_account_transaction(v_owner_id);

  if exists (select 1 from public.managers where owner_id = v_owner_id) then
    raise exception 'Smoke account deletion left manager row';
  end if;
  if exists (select 1 from public.clubes where owner_id = v_owner_id) then
    raise exception 'Smoke account deletion left owned club';
  end if;
end;
$$;
