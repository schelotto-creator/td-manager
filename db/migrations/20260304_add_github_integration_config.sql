-- Configuración de integración GitHub para sincronización manual desde /admin.

create table if not exists public.github_integration_config (
  id smallint primary key default 1,
  owner text not null,
  repo text not null,
  branch text not null default 'main',
  last_synced_at timestamptz,
  last_commit_sha text,
  last_commit_message text,
  last_commit_url text,
  last_commit_author text,
  last_sync_status text not null default 'idle' check (last_sync_status in ('idle', 'success', 'error')),
  last_sync_error text,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint github_integration_config_singleton check (id = 1)
);

create or replace function public.touch_github_integration_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_github_integration_config_updated_at on public.github_integration_config;
create trigger trg_touch_github_integration_config_updated_at
before update on public.github_integration_config
for each row
execute function public.touch_github_integration_config_updated_at();

insert into public.github_integration_config (id, owner, repo, branch)
values (1, 'schelotto-creator', 'td-manager', 'main')
on conflict (id) do nothing;

grant select, insert, update on table public.github_integration_config
to anon, authenticated, service_role;
