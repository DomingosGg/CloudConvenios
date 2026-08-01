-- ============================================================================
-- Gestão de Renovações de Convênios — Etapa 5
-- Estado individual de notificações e alertas por usuário
-- Execute todo este arquivo no SQL Editor do Supabase.
-- ============================================================================

begin;

create table if not exists public.notificacoes_usuario (
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  alerta_id text not null,
  lida_em timestamptz,
  dispensada_em timestamptz,
  adiada_ate date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, alerta_id)
);

create index if not exists notificacoes_usuario_atualizadas_idx
  on public.notificacoes_usuario (usuario_id, atualizado_em desc);

create index if not exists notificacoes_usuario_adiadas_idx
  on public.notificacoes_usuario (usuario_id, adiada_ate)
  where adiada_ate is not null;

alter table public.notificacoes_usuario enable row level security;

-- Cada usuário pode consultar e alterar somente o próprio estado de leitura.
drop policy if exists notificacoes_usuario_select on public.notificacoes_usuario;
create policy notificacoes_usuario_select on public.notificacoes_usuario
  for select to authenticated
  using (usuario_id = (select auth.uid()));

drop policy if exists notificacoes_usuario_insert on public.notificacoes_usuario;
create policy notificacoes_usuario_insert on public.notificacoes_usuario
  for insert to authenticated
  with check (usuario_id = (select auth.uid()));

drop policy if exists notificacoes_usuario_update on public.notificacoes_usuario;
create policy notificacoes_usuario_update on public.notificacoes_usuario
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

drop policy if exists notificacoes_usuario_delete on public.notificacoes_usuario;
create policy notificacoes_usuario_delete on public.notificacoes_usuario
  for delete to authenticated
  using (usuario_id = (select auth.uid()));

revoke all on public.notificacoes_usuario from anon;
grant select, insert, update, delete on public.notificacoes_usuario to authenticated;

-- Usa a função de atualização de timestamp criada nas etapas anteriores.
drop trigger if exists notificacoes_usuario_atualizado_em on public.notificacoes_usuario;
create trigger notificacoes_usuario_atualizado_em
  before update on public.notificacoes_usuario
  for each row execute function public.definir_atualizado_em();

create or replace function public.healthcheck()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'ok',
    'database_time', now(),
    'schema_version', 'etapa-5-notificacoes'
  );
$$;

revoke all on function public.healthcheck() from public;
grant execute on function public.healthcheck() to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
  'status', 'ok',
  'etapa', '5-notificacoes',
  'usuarios_ativos', (select count(*) from public.usuarios where ativo = true),
  'estados_salvos', (select count(*) from public.notificacoes_usuario)
) as resultado;
