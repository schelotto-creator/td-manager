do $$
declare
  v_run_id uuid := gen_random_uuid();
  v_other_run_id uuid := gen_random_uuid();
  v_claimed boolean;
  v_health jsonb;
begin
  select public.claim_simulator_run(v_run_id, 600) into v_claimed;
  if not v_claimed then
    raise exception 'First simulator lock claim failed';
  end if;

  select public.claim_simulator_run(v_other_run_id, 600) into v_claimed;
  if v_claimed then
    raise exception 'Concurrent simulator lock claim was accepted';
  end if;

  perform public.finish_simulator_run(
    v_run_id,
    'ok',
    jsonb_build_object('finalized', 0),
    null
  );

  select public.get_simulator_health() into v_health;
  if v_health #>> '{runtime,status}' <> 'ok' then
    raise exception 'Simulator runtime did not finish successfully: %', v_health;
  end if;

  if exists (
    select 1
    from cron.job
    where command ilike '%simular_jornada_playbyplay%'
       or command ilike '%ejecutar_cierre_semanal%'
       or command ilike '%rutina_semanal_forma%'
       or command ilike '%rutina_semanal_finanzas%'
       or command ilike '%reset_entrenos_semanales%'
  ) then
    raise exception 'Legacy database automation jobs were not removed';
  end if;
end;
$$;
