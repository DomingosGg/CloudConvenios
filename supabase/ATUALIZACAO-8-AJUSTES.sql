-- ================================================================
-- ATUALIZAÇÃO 8 — MFA, histórico de exportações e ajustes gerais
-- Execute uma única vez no SQL Editor do Supabase.
-- ================================================================

begin;

create table if not exists public.historico_downloads (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_nome text not null default 'Sistema',
  arquivo_nome text not null,
  tipo text not null default 'planilha',
  origem text not null default 'manual' check (origem in ('manual', 'automatica')),
  caminho_storage text not null,
  mime_type text not null default 'application/octet-stream',
  tamanho_bytes bigint not null default 0 check (tamanho_bytes >= 0),
  total_registros integer not null default 0 check (total_registros >= 0),
  criado_em timestamptz not null default now()
);

create index if not exists historico_downloads_data_idx
  on public.historico_downloads (criado_em desc);

create index if not exists historico_downloads_usuario_idx
  on public.historico_downloads (usuario_id, criado_em desc);

alter table public.historico_downloads enable row level security;

drop policy if exists historico_downloads_select on public.historico_downloads;
create policy historico_downloads_select
  on public.historico_downloads
  for select
  to authenticated
  using (public.tem_permissao('dados.exportar'));

-- Escritas são feitas apenas pela Cloudflare Function com chave secreta.
revoke all on public.historico_downloads from anon;
grant select on public.historico_downloads to authenticated;
grant all on public.historico_downloads to service_role;

-- Pasta privada onde ficam as cópias das planilhas exportadas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exportacoes',
  'exportacoes',
  false,
  26214400,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/csv;charset=utf-8',
    'application/json',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Atualiza o diagnóstico do ambiente.
create or replace function public.healthcheck()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'status', 'ok',
    'database_time', now(),
    'schema_version', 'v1.1-ajustes-cloudflare'
  );
$$;

revoke all on function public.healthcheck() from public;
grant execute on function public.healthcheck() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;

select public.healthcheck() as diagnostico;

-- Enforce AAL2 in all permission-based database policies.
create or replace function public.tem_permissao(permissao text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios u
    join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
    where u.id = (select auth.uid())
      and u.ativo = true
      and pp.permissao_codigo = permissao
      and coalesce((select auth.jwt())->>'aal', 'aal1') = 'aal2'
  );
$$;

revoke all on function public.tem_permissao(text) from public;
grant execute on function public.tem_permissao(text) to authenticated;
