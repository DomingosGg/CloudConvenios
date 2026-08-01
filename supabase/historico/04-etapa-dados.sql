-- ================================================================
-- Gestão de Renovações de Convênios — Etapa 3.3
-- Dados online, perfis simplificados e atualização do diagnóstico
-- Execute todo este arquivo no SQL Editor do Supabase.
-- ================================================================

begin;

-- Mantém o perfil Operador somente com as permissões necessárias
-- para cadastrar, editar e acompanhar os locais.
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

-- Garante que o administrador possua todas as permissões cadastradas.
insert into public.perfil_permissoes (perfil_id, permissao_codigo)
select 'administrador', codigo
from public.permissoes
on conflict do nothing;

-- Atualiza o diagnóstico exibido no site.
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
    'schema_version', 'etapa-3.3'
  );
$$;

revoke all on function public.healthcheck() from public;
grant execute on function public.healthcheck() to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
  'status', 'ok',
  'etapa', '3.3',
  'operadores', (
    select count(*)
    from public.usuarios
    where perfil_id = 'operador' and ativo = true
  ),
  'administradores', (
    select count(*)
    from public.usuarios
    where perfil_id = 'administrador' and ativo = true
  )
) as resultado;
