-- Index for fase column used in playoff queries (ensure-group-playoffs, activateProjectedPlayoff)
create index if not exists idx_matches_fase
  on public.matches (fase);

-- Index for clubes grupo_id used in team lookups from both calendar and leagues pages
create index if not exists idx_clubes_grupo_id
  on public.clubes (grupo_id);
