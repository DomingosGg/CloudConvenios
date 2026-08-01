-- Verificação rápida após a instalação.
select public.healthcheck() as diagnostico;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'perfis_acesso', 'permissoes', 'perfil_permissoes', 'usuarios',
    'concedentes', 'contatos', 'configuracoes', 'auditoria',
    'notificacoes_usuario'
  )
order by table_name;

select u.nome, u.email, u.perfil_id, u.ativo,
       coalesce(array_agg(pp.permissao_codigo order by pp.permissao_codigo)
         filter (where pp.permissao_codigo is not null), '{}') as permissoes
from public.usuarios u
left join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
group by u.id, u.nome, u.email, u.perfil_id, u.ativo
order by u.perfil_id, u.email;
