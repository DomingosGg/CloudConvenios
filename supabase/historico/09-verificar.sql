-- Execute depois de schema.sql para confirmar a instalação.

select public.healthcheck() as diagnostico;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'perfis_acesso', 'permissoes', 'perfil_permissoes', 'usuarios',
    'concedentes', 'contatos', 'configuracoes', 'auditoria'
  )
order by table_name;

select p.id as perfil, count(pp.permissao_codigo) as total_permissoes
from public.perfis_acesso p
left join public.perfil_permissoes pp on pp.perfil_id = p.id
group by p.id
order by p.id;
