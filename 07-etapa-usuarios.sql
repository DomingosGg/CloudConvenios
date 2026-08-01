-- ==========================================================================
-- Gestão de Renovações de Convênios — Etapa 6
-- Gestão de usuários, perfis e reforço de segurança
-- Execute todo este arquivo no SQL Editor do Supabase.
-- ==========================================================================

begin;

-- Garante os dois perfis usados no projeto.
insert into public.perfis_acesso (id, nome, descricao)
values
  ('administrador', 'Administrador', 'Acesso completo ao sistema, usuários e configurações.'),
  ('operador', 'Operador', 'Pode visualizar, cadastrar e editar concedentes e contatos.')
on conflict (id) do update
set nome = excluded.nome,
    descricao = excluded.descricao;

-- Garante a permissão administrativa de usuários.
insert into public.permissoes (codigo, nome, descricao)
values ('usuarios.gerenciar', 'Gerenciar usuários', 'Criar, editar, bloquear, redefinir e excluir acessos.')
on conflict (codigo) do update
set nome = excluded.nome,
    descricao = excluded.descricao;

-- Somente administrador recebe a permissão de gestão de usuários.
insert into public.perfil_permissoes (perfil_id, permissao_codigo)
values ('administrador', 'usuarios.gerenciar')
on conflict do nothing;

delete from public.perfil_permissoes
where permissao_codigo = 'usuarios.gerenciar'
  and perfil_id <> 'administrador';

-- Reforça as políticas da tabela de perfis de usuários.
alter table public.usuarios enable row level security;

drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.tem_permissao('usuarios.gerenciar')
  );

drop policy if exists usuarios_insert_admin on public.usuarios;
create policy usuarios_insert_admin on public.usuarios
  for insert to authenticated
  with check (public.tem_permissao('usuarios.gerenciar'));

drop policy if exists usuarios_update_admin on public.usuarios;
create policy usuarios_update_admin on public.usuarios
  for update to authenticated
  using (public.tem_permissao('usuarios.gerenciar'))
  with check (public.tem_permissao('usuarios.gerenciar'));

drop policy if exists usuarios_delete_admin on public.usuarios;
create policy usuarios_delete_admin on public.usuarios
  for delete to authenticated
  using (public.tem_permissao('usuarios.gerenciar'));

-- Índices para a tela administrativa.
create index if not exists usuarios_perfil_ativo_idx
  on public.usuarios (perfil_id, ativo, nome);

create index if not exists usuarios_ultimo_acesso_idx
  on public.usuarios (ultimo_acesso desc nulls last);

-- A auditoria continua visível somente para administradores.
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria
  for select to authenticated
  using (public.tem_permissao('auditoria.visualizar'));

-- Atualiza o diagnóstico da instalação.
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
    'schema_version', 'etapa-6-usuarios'
  );
$$;

revoke all on function public.healthcheck() from public;
grant execute on function public.healthcheck() to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
  'status', 'ok',
  'etapa', '6-usuarios',
  'administradores_ativos', (
    select count(*) from public.usuarios
    where perfil_id = 'administrador' and ativo = true
  ),
  'operadores_ativos', (
    select count(*) from public.usuarios
    where perfil_id = 'operador' and ativo = true
  ),
  'permissao_operador_indevida', (
    select count(*) from public.perfil_permissoes
    where perfil_id = 'operador' and permissao_codigo = 'usuarios.gerenciar'
  )
) as resultado;
