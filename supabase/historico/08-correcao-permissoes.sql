-- ================================================================
-- Correção de permissões — Administrador x Operador
-- Execute todo este arquivo no SQL Editor do Supabase.
-- ================================================================

begin;

-- O operador pode consultar, cadastrar e editar concedentes/contatos,
-- mas não recebe permissões administrativas, de exclusão ou importação.
delete from public.perfil_permissoes
where perfil_id = 'operador';

insert into public.perfil_permissoes (perfil_id, permissao_codigo) values
  ('operador', 'concedentes.visualizar'),
  ('operador', 'concedentes.criar'),
  ('operador', 'concedentes.editar'),
  ('operador', 'contatos.visualizar'),
  ('operador', 'contatos.registrar'),
  ('operador', 'contatos.editar'),
  ('operador', 'renovacoes.movimentar'),
  ('operador', 'relatorios.visualizar')
on conflict do nothing;

-- Reafirma as políticas sensíveis no próprio banco.
drop policy if exists concedentes_delete on public.concedentes;
create policy concedentes_delete on public.concedentes
  for delete to authenticated
  using (public.tem_permissao('concedentes.excluir'));

drop policy if exists contatos_delete on public.contatos;
create policy contatos_delete on public.contatos
  for delete to authenticated
  using (public.tem_permissao('contatos.excluir'));

-- As configurações deixam de ser consultáveis por qualquer usuário ativo.
-- Somente quem possui configuracoes.gerenciar poderá acessá-las.
drop policy if exists configuracoes_select on public.configuracoes;
create policy configuracoes_select on public.configuracoes
  for select to authenticated
  using (public.tem_permissao('configuracoes.gerenciar'));

-- Garante todas as permissões existentes ao administrador.
insert into public.perfil_permissoes (perfil_id, permissao_codigo)
select 'administrador', codigo
from public.permissoes
on conflict do nothing;

notify pgrst, 'reload schema';

commit;

-- Conferência: os operadores não devem ter permissões de exclusão,
-- importação/exportação, configurações, backup ou usuários.
select
  u.nome,
  u.email,
  u.perfil_id,
  u.ativo,
  coalesce(array_agg(pp.permissao_codigo order by pp.permissao_codigo)
    filter (where pp.permissao_codigo is not null), '{}') as permissoes
from public.usuarios u
left join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
where u.perfil_id in ('administrador', 'operador')
group by u.id, u.nome, u.email, u.perfil_id, u.ativo
order by u.perfil_id, u.email;
