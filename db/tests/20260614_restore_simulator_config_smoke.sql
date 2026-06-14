do $$
begin
  if to_regclass('public.match_simulator_config') is null
     or to_regclass('public.position_overall_config') is null then
    raise exception 'Simulator configuration tables were not created';
  end if;

  if not exists (
    select 1
    from public.match_simulator_config
    where id = 1
      and settings ?& array[
        'foulBaseChance',
        'shotAverageQualityImpact',
        'turnoverAverageQualityImpact'
      ]
  ) then
    raise exception 'Match simulator defaults are incomplete';
  end if;

  if not exists (
    select 1
    from public.position_overall_config
    where id = 1
      and settings ?& array['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot']
  ) then
    raise exception 'Position overall defaults are incomplete';
  end if;

  if has_table_privilege('anon', 'public.match_simulator_config', 'select')
     or has_table_privilege('anon', 'public.position_overall_config', 'select') then
    raise exception 'Anonymous config access remains enabled';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.match_simulator_config'::regclass
  ) or not (
    select relrowsecurity
    from pg_class
    where oid = 'public.position_overall_config'::regclass
  ) then
    raise exception 'RLS is not enabled for simulator configuration';
  end if;
end;
$$;
