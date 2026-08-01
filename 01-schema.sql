-- ================================================================
-- Gestão de Renovações de Convênios — Etapa 2
-- Estrutura inicial do banco de dados Supabase/PostgreSQL
-- Execute todo este arquivo no SQL Editor do Supabase.
-- ================================================================

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ----------------------------------------------------------------
-- Catálogo de perfis e permissões
-- ----------------------------------------------------------------
create table if not exists public.perfis_acesso (
  id text primary key,
  nome text not null,
  descricao text,
  criado_em timestamptz not null default now()
);

create table if not exists public.permissoes (
  codigo text primary key,
  nome text not null,
  descricao text,
  criado_em timestamptz not null default now()
);

create table if not exists public.perfil_permissoes (
  perfil_id text not null references public.perfis_acesso(id) on delete cascade,
  permissao_codigo text not null references public.permissoes(codigo) on delete cascade,
  primary key (perfil_id, permissao_codigo)
);

insert into public.perfis_acesso (id, nome, descricao) values
  ('administrador', 'Administrador', 'Acesso completo ao sistema e à gestão de usuários.'),
  ('gestor', 'Gestor', 'Gerencia concedentes, contatos, renovações e relatórios.'),
  ('operador', 'Operador', 'Cadastra, edita e acompanha concedentes e contatos.'),
  ('consulta', 'Consulta', 'Acesso somente para visualização.')
on conflict (id) do update set
  nome = excluded.nome,
  descricao = excluded.descricao;

insert into public.permissoes (codigo, nome, descricao) values
  ('concedentes.visualizar', 'Visualizar concedentes', 'Consultar os cadastros de concedentes.'),
  ('concedentes.criar', 'Cadastrar concedentes', 'Criar novos cadastros.'),
  ('concedentes.editar', 'Editar concedentes', 'Alterar cadastros existentes.'),
  ('concedentes.excluir', 'Excluir concedentes', 'Excluir cadastros e seus contatos.'),
  ('contatos.visualizar', 'Visualizar contatos', 'Consultar o histórico de contatos.'),
  ('contatos.registrar', 'Registrar contatos', 'Criar registros de contato.'),
  ('contatos.editar', 'Editar contatos', 'Alterar registros de contato.'),
  ('contatos.excluir', 'Excluir contatos', 'Excluir registros de contato.'),
  ('renovacoes.movimentar', 'Movimentar renovações', 'Alterar a etapa no Kanban.'),
  ('relatorios.visualizar', 'Visualizar relatórios', 'Consultar indicadores e gráficos.'),
  ('dados.exportar', 'Exportar dados', 'Gerar arquivos CSV e backup.'),
  ('dados.importar', 'Importar dados', 'Importar cadastros em lote.'),
  ('usuarios.gerenciar', 'Gerenciar usuários', 'Criar, bloquear e alterar perfis.'),
  ('auditoria.visualizar', 'Visualizar auditoria', 'Consultar o histórico de alterações.'),
  ('configuracoes.gerenciar', 'Gerenciar configurações', 'Alterar configurações gerais.')
on conflict (codigo) do update set
  nome = excluded.nome,
  descricao = excluded.descricao;

-- Administrador: todas as permissões.
insert into public.perfil_permissoes (perfil_id, permissao_codigo)
select 'administrador', codigo from public.permissoes
on conflict do nothing;

-- Gestor.
insert into public.perfil_permissoes (perfil_id, permissao_codigo) values
  ('gestor', 'concedentes.visualizar'),
  ('gestor', 'concedentes.criar'),
  ('gestor', 'concedentes.editar'),
  ('gestor', 'contatos.visualizar'),
  ('gestor', 'contatos.registrar'),
  ('gestor', 'contatos.editar'),
  ('gestor', 'renovacoes.movimentar'),
  ('gestor', 'relatorios.visualizar'),
  ('gestor', 'dados.exportar'),
  ('gestor', 'auditoria.visualizar')
on conflict do nothing;

-- Operador.
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

-- Consulta.
insert into public.perfil_permissoes (perfil_id, permissao_codigo) values
  ('consulta', 'concedentes.visualizar'),
  ('consulta', 'contatos.visualizar'),
  ('consulta', 'relatorios.visualizar')
on conflict do nothing;

-- ----------------------------------------------------------------
-- Usuários vinculados ao Supabase Auth
-- ----------------------------------------------------------------
create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email citext not null,
  perfil_id text not null default 'consulta' references public.perfis_acesso(id),
  polo text,
  ativo boolean not null default true,
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists usuarios_email_unique
  on public.usuarios (lower(email::text));

-- ----------------------------------------------------------------
-- Concedentes
-- ----------------------------------------------------------------
create table if not exists public.concedentes (
  id uuid primary key default gen_random_uuid(),
  cnpj text,
  razao_social text not null,
  nome_fantasia text not null,
  inicio_vigencia date,
  fim_vigencia date,
  data_cadastro date not null default current_date,
  estado varchar(2) not null,
  cidade text not null,
  cep text,
  email citext,
  telefone text,
  polo text not null,
  situacao text not null default 'Não contatado',
  formas_contato text[] not null default array[]::text[],
  observacoes text,
  demonstracao boolean not null default false,
  criado_por uuid references auth.users(id) on delete set null,
  atualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint concedentes_estado_check check (estado ~ '^[A-Z]{2}$'),
  constraint concedentes_datas_check check (
    inicio_vigencia is null or fim_vigencia is null or fim_vigencia >= inicio_vigencia
  ),
  constraint concedentes_cnpj_check check (
    cnpj is null or btrim(cnpj) = '' or length(regexp_replace(cnpj, '\D', '', 'g')) = 14
  ),
  constraint concedentes_situacao_check check (situacao in (
    'Não contatado',
    'Contato iniciado',
    'Aguardando retorno',
    'Documentação solicitada',
    'Documentação recebida',
    'Em análise',
    'Renovação em andamento',
    'Renovado',
    'Não possui interesse',
    'Contato não localizado',
    'Convênio encerrado'
  ))
);

-- Permite vários cadastros sem CNPJ, mas impede CNPJ preenchido em duplicidade.
create unique index if not exists concedentes_cnpj_digits_unique
  on public.concedentes ((regexp_replace(cnpj, '\D', '', 'g')))
  where nullif(regexp_replace(cnpj, '\D', '', 'g'), '') is not null;

create index if not exists concedentes_fim_vigencia_idx on public.concedentes (fim_vigencia);
create index if not exists concedentes_estado_cidade_idx on public.concedentes (estado, cidade);
create index if not exists concedentes_polo_idx on public.concedentes (polo);
create index if not exists concedentes_situacao_idx on public.concedentes (situacao);

-- ----------------------------------------------------------------
-- Histórico de contatos
-- ----------------------------------------------------------------
create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  concedente_id uuid not null references public.concedentes(id) on delete cascade,
  data_contato date not null,
  horario time not null,
  responsavel text not null,
  forma_contato text not null,
  pessoa_contatada text,
  resultado_contato text not null,
  proxima_acao text,
  proximo_contato date,
  observacoes text,
  criado_por uuid references auth.users(id) on delete set null,
  atualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists contatos_concedente_idx on public.contatos (concedente_id);
create index if not exists contatos_data_idx on public.contatos (data_contato desc, horario desc);
create index if not exists contatos_proximo_idx on public.contatos (proximo_contato);

-- ----------------------------------------------------------------
-- Configurações e auditoria
-- ----------------------------------------------------------------
create table if not exists public.configuracoes (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  descricao text,
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users(id) on delete set null,
  acao text not null,
  tabela text not null,
  registro_id uuid,
  dados_anteriores jsonb,
  dados_novos jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists auditoria_registro_idx on public.auditoria (tabela, registro_id);
create index if not exists auditoria_data_idx on public.auditoria (criado_em desc);

-- ----------------------------------------------------------------
-- Funções utilitárias
-- ----------------------------------------------------------------
create or replace function public.definir_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create or replace function public.definir_usuario_operacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por = coalesce(new.criado_por, (select auth.uid()));
  end if;
  new.atualizado_por = (select auth.uid());
  return new;
end;
$$;

create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usuarios (id, nome, email, perfil_id, ativo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    new.email,
    'consulta',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = (select auth.uid())
      and u.ativo = true
  );
$$;

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
  );
$$;

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registro uuid;
begin
  if tg_op = 'DELETE' then
    registro := old.id;
    insert into public.auditoria (
      usuario_id, acao, tabela, registro_id, dados_anteriores, dados_novos
    ) values (
      (select auth.uid()), tg_op, tg_table_name, registro, to_jsonb(old), null
    );
    return old;
  elsif tg_op = 'UPDATE' then
    registro := new.id;
    insert into public.auditoria (
      usuario_id, acao, tabela, registro_id, dados_anteriores, dados_novos
    ) values (
      (select auth.uid()), tg_op, tg_table_name, registro, to_jsonb(old), to_jsonb(new)
    );
    return new;
  else
    registro := new.id;
    insert into public.auditoria (
      usuario_id, acao, tabela, registro_id, dados_anteriores, dados_novos
    ) values (
      (select auth.uid()), tg_op, tg_table_name, registro, null, to_jsonb(new)
    );
    return new;
  end if;
end;
$$;

-- Função pública de diagnóstico. Não retorna dados do sistema.
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
    'schema_version', 'etapa-2'
  );
$$;

-- ----------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

drop trigger if exists usuarios_atualizado_em on public.usuarios;
create trigger usuarios_atualizado_em
  before update on public.usuarios
  for each row execute function public.definir_atualizado_em();

drop trigger if exists concedentes_atualizado_em on public.concedentes;
create trigger concedentes_atualizado_em
  before update on public.concedentes
  for each row execute function public.definir_atualizado_em();

drop trigger if exists concedentes_usuario_operacao on public.concedentes;
create trigger concedentes_usuario_operacao
  before insert or update on public.concedentes
  for each row execute function public.definir_usuario_operacao();

drop trigger if exists contatos_atualizado_em on public.contatos;
create trigger contatos_atualizado_em
  before update on public.contatos
  for each row execute function public.definir_atualizado_em();

drop trigger if exists contatos_usuario_operacao on public.contatos;
create trigger contatos_usuario_operacao
  before insert or update on public.contatos
  for each row execute function public.definir_usuario_operacao();

drop trigger if exists configuracoes_atualizado_em on public.configuracoes;
create trigger configuracoes_atualizado_em
  before update on public.configuracoes
  for each row execute function public.definir_atualizado_em();

drop trigger if exists concedentes_auditoria on public.concedentes;
create trigger concedentes_auditoria
  after insert or update or delete on public.concedentes
  for each row execute function public.registrar_auditoria();

drop trigger if exists contatos_auditoria on public.contatos;
create trigger contatos_auditoria
  after insert or update or delete on public.contatos
  for each row execute function public.registrar_auditoria();

-- ----------------------------------------------------------------
-- Row Level Security (RLS)
-- ----------------------------------------------------------------
alter table public.perfis_acesso enable row level security;
alter table public.permissoes enable row level security;
alter table public.perfil_permissoes enable row level security;
alter table public.usuarios enable row level security;
alter table public.concedentes enable row level security;
alter table public.contatos enable row level security;
alter table public.configuracoes enable row level security;
alter table public.auditoria enable row level security;

-- Catálogos: usuários autenticados e ativos podem consultar.
drop policy if exists perfis_select on public.perfis_acesso;
create policy perfis_select on public.perfis_acesso
  for select to authenticated
  using (public.usuario_ativo());

drop policy if exists permissoes_select on public.permissoes;
create policy permissoes_select on public.permissoes
  for select to authenticated
  using (public.usuario_ativo());

drop policy if exists perfil_permissoes_select on public.perfil_permissoes;
create policy perfil_permissoes_select on public.perfil_permissoes
  for select to authenticated
  using (public.usuario_ativo());

-- Usuários: cada usuário consulta o próprio perfil; administradores gerenciam todos.
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

-- Concedentes.
drop policy if exists concedentes_select on public.concedentes;
create policy concedentes_select on public.concedentes
  for select to authenticated
  using (public.tem_permissao('concedentes.visualizar'));

drop policy if exists concedentes_insert on public.concedentes;
create policy concedentes_insert on public.concedentes
  for insert to authenticated
  with check (public.tem_permissao('concedentes.criar'));

drop policy if exists concedentes_update on public.concedentes;
create policy concedentes_update on public.concedentes
  for update to authenticated
  using (public.tem_permissao('concedentes.editar'))
  with check (public.tem_permissao('concedentes.editar'));

drop policy if exists concedentes_delete on public.concedentes;
create policy concedentes_delete on public.concedentes
  for delete to authenticated
  using (public.tem_permissao('concedentes.excluir'));

-- Contatos.
drop policy if exists contatos_select on public.contatos;
create policy contatos_select on public.contatos
  for select to authenticated
  using (public.tem_permissao('contatos.visualizar'));

drop policy if exists contatos_insert on public.contatos;
create policy contatos_insert on public.contatos
  for insert to authenticated
  with check (public.tem_permissao('contatos.registrar'));

drop policy if exists contatos_update on public.contatos;
create policy contatos_update on public.contatos
  for update to authenticated
  using (public.tem_permissao('contatos.editar'))
  with check (public.tem_permissao('contatos.editar'));

drop policy if exists contatos_delete on public.contatos;
create policy contatos_delete on public.contatos
  for delete to authenticated
  using (public.tem_permissao('contatos.excluir'));

-- Configurações.
drop policy if exists configuracoes_select on public.configuracoes;
create policy configuracoes_select on public.configuracoes
  for select to authenticated
  using (public.usuario_ativo());

drop policy if exists configuracoes_insert on public.configuracoes;
create policy configuracoes_insert on public.configuracoes
  for insert to authenticated
  with check (public.tem_permissao('configuracoes.gerenciar'));

drop policy if exists configuracoes_update on public.configuracoes;
create policy configuracoes_update on public.configuracoes
  for update to authenticated
  using (public.tem_permissao('configuracoes.gerenciar'))
  with check (public.tem_permissao('configuracoes.gerenciar'));

drop policy if exists configuracoes_delete on public.configuracoes;
create policy configuracoes_delete on public.configuracoes
  for delete to authenticated
  using (public.tem_permissao('configuracoes.gerenciar'));

-- Auditoria: somente perfis autorizados consultam; gravação ocorre por trigger.
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria
  for select to authenticated
  using (public.tem_permissao('auditoria.visualizar'));

-- ----------------------------------------------------------------
-- Permissões da API
-- ----------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on public.perfis_acesso from anon;
revoke all on public.permissoes from anon;
revoke all on public.perfil_permissoes from anon;
revoke all on public.usuarios from anon;
revoke all on public.concedentes from anon;
revoke all on public.contatos from anon;
revoke all on public.configuracoes from anon;
revoke all on public.auditoria from anon;

-- O usuário autenticado recebe acesso à API; o RLS decide cada operação.
grant select on public.perfis_acesso, public.permissoes, public.perfil_permissoes to authenticated;
grant select, insert, update, delete on public.usuarios to authenticated;
grant select, insert, update, delete on public.concedentes to authenticated;
grant select, insert, update, delete on public.contatos to authenticated;
grant select, insert, update, delete on public.configuracoes to authenticated;
grant select on public.auditoria to authenticated;
grant usage, select on sequence public.auditoria_id_seq to authenticated;

revoke all on function public.definir_atualizado_em() from public;
revoke all on function public.definir_usuario_operacao() from public;
revoke all on function public.criar_perfil_novo_usuario() from public;
revoke all on function public.registrar_auditoria() from public;
revoke all on function public.usuario_ativo() from public;
revoke all on function public.tem_permissao(text) from public;
grant execute on function public.usuario_ativo() to authenticated;
grant execute on function public.tem_permissao(text) to authenticated;

revoke all on function public.healthcheck() from public;
grant execute on function public.healthcheck() to anon, authenticated;

commit;
