-- ============================================================================
-- CLOUDCONVÊNIOS V8.9.3 — SQL ÚNICO OFICIAL DO SUPABASE
-- Projeto: Gestão de Renovações de Convênios / Cloudflare Pages
--
-- FINALIDADE
--   • instalar um projeto Supabase novo; OU
--   • reconciliar/atualizar o banco existente sem apagar os dados operacionais.
--
-- COMO EXECUTAR
--   1. Supabase > SQL Editor > New query;
--   2. cole ESTE ARQUIVO INTEIRO em uma única página;
--   3. clique em Run;
--   4. confira o resultado final "CloudConvênios V8.9.3 instalado".
--
-- IMPORTANTE
--   • Este script NÃO apaga concedentes, contatos, usuários ou auditoria.
--   • A regra definitiva de duplicidade é CNPJ normalizado + marca.
--   • MFA/AAL2 permanece obrigatório, de acordo com a aplicação V8.9.3.
--   • O agendamento automático de exportação depende de segredo do Cloudflare
--     e, por segurança, não é gravado diretamente neste arquivo público.
-- ============================================================================

-- ============================================================================
-- SISTEMA DE GESTÃO DE RENOVAÇÕES DE CONVÊNIOS
-- INSTALAÇÃO COMPLETA E CONSOLIDADA DO SUPABASE — ETAPAS 1 A 7
-- Versão: 1.0 consolidada | Data: 30/07/2026
--
-- COMO USAR
-- 1. Abra o Supabase > SQL Editor > New query.
-- 2. Cole TODO este arquivo e clique em Run.
-- 3. O script pode ser executado em projeto vazio ou em banco já existente.
--    Ele preserva os dados e recria funções, políticas e gatilhos necessários.
-- 4. Depois, crie o primeiro usuário em Authentication > Users.
-- 5. Execute o arquivo PRIMEIRO-ADMINISTRADOR.sql, informando o e-mail criado.
--
-- IMPORTANTE
-- - Este arquivo NÃO cria senhas ou usuários diretamente em auth.users.
-- - As Cloudflare Pages Functions users-admin e cnpj-lookup estão no pacote do GitHub.
-- - Nunca coloque a SUPABASE_SECRET_KEY neste script ou em JavaScript público.
-- ============================================================================



-- ============================================================================
-- ETAPA 1 — ESTRUTURA INICIAL
-- ============================================================================

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

-- A unicidade definitiva é aplicada por CNPJ + marca ao final.

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


-- ============================================================================
-- ETAPA 2 — AUTENTICAÇÃO E ÚLTIMO ACESSO
-- ============================================================================

-- ================================================================
-- Gestão de Renovações de Convênios — Etapa 3.2
-- Complemento para autenticação e registro de último acesso
-- Execute todo o arquivo no SQL Editor do Supabase.
-- ================================================================

create or replace function public.registrar_ultimo_acesso()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  momento timestamptz := now();
begin
  update public.usuarios
  set
    ultimo_acesso = momento,
    atualizado_em = momento
  where id = (select auth.uid())
    and ativo = true;

  if not found then
    raise exception 'Usuário não encontrado ou inativo.';
  end if;

  return momento;
end;
$$;

revoke all on function public.registrar_ultimo_acesso() from public;
grant execute on function public.registrar_ultimo_acesso() to authenticated;

notify pgrst, 'reload schema';

select 'etapa-3-login-ok' as resultado;


-- ============================================================================
-- ETAPA 3 — DADOS ONLINE E PERFIS
-- ============================================================================

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


-- ============================================================================
-- ETAPA 4 — AUDITORIA DETALHADA
-- ============================================================================

-- ============================================================================
-- Gestão de Renovações de Convênios — Etapa 4
-- Auditoria detalhada de concedentes, contatos e movimentações do Kanban
-- Execute todo este arquivo no SQL Editor do Supabase.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Enriquece a tabela de auditoria existente.
-- ---------------------------------------------------------------------------
alter table public.auditoria
  add column if not exists usuario_nome text,
  add column if not exists usuario_email text,
  add column if not exists registro_nome text,
  add column if not exists resumo text,
  add column if not exists campos_alterados text[] not null default array[]::text[];

create index if not exists auditoria_usuario_idx
  on public.auditoria (usuario_id, criado_em desc);

create index if not exists auditoria_acao_tabela_idx
  on public.auditoria (acao, tabela, criado_em desc);

-- ---------------------------------------------------------------------------
-- 2. Recria o gatilho para guardar uma fotografia do usuário e um resumo
--    legível da operação. Os dados anteriores e novos continuam preservados.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registro_id uuid;
  v_anterior jsonb;
  v_novo jsonb;
  v_base jsonb;
  v_usuario_nome text;
  v_usuario_email text;
  v_registro_nome text;
  v_empresa_nome text;
  v_resumo text;
  v_campos text[] := array[]::text[];
begin
  v_anterior := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_novo := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_base := coalesce(v_novo, v_anterior, '{}'::jsonb);
  v_registro_id := nullif(v_base ->> 'id', '')::uuid;

  select nullif(btrim(u.nome), ''), u.email::text
    into v_usuario_nome, v_usuario_email
  from public.usuarios u
  where u.id = (select auth.uid());

  v_usuario_nome := coalesce(v_usuario_nome, v_usuario_email, 'Sistema');

  if tg_table_name = 'concedentes' then
    v_registro_nome := coalesce(
      nullif(v_base ->> 'nome_fantasia', ''),
      nullif(v_base ->> 'razao_social', ''),
      'Concedente sem nome'
    );
  elsif tg_table_name = 'contatos' then
    begin
      select coalesce(nullif(c.nome_fantasia, ''), nullif(c.razao_social, ''))
        into v_empresa_nome
      from public.concedentes c
      where c.id = nullif(v_base ->> 'concedente_id', '')::uuid;
    exception when others then
      v_empresa_nome := null;
    end;

    v_registro_nome := coalesce(
      v_empresa_nome,
      nullif(v_base ->> 'pessoa_contatada', ''),
      'Contato registrado'
    );
  else
    v_registro_nome := initcap(replace(tg_table_name, '_', ' '));
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(chave order by chave), array[]::text[])
      into v_campos
    from (
      select n.key as chave
      from jsonb_each(v_novo) n
      left join jsonb_each(v_anterior) a on a.key = n.key
      where n.value is distinct from a.value
        and n.key <> all(array[
          'atualizado_em', 'atualizado_por', 'criado_em', 'criado_por'
        ])
    ) diferencas;
  elsif tg_op = 'INSERT' then
    select coalesce(array_agg(key order by key), array[]::text[])
      into v_campos
    from jsonb_each(v_novo)
    where value <> 'null'::jsonb
      and key <> all(array[
        'id', 'atualizado_em', 'atualizado_por', 'criado_em', 'criado_por'
      ]);
  elsif tg_op = 'DELETE' then
    select coalesce(array_agg(key order by key), array[]::text[])
      into v_campos
    from jsonb_each(v_anterior)
    where value <> 'null'::jsonb
      and key <> all(array[
        'id', 'atualizado_em', 'atualizado_por', 'criado_em', 'criado_por'
      ]);
  end if;

  if tg_table_name = 'concedentes' then
    if tg_op = 'INSERT' then
      v_resumo := format('Cadastrou a concedente “%s”.', v_registro_nome);
    elsif tg_op = 'DELETE' then
      v_resumo := format('Excluiu a concedente “%s”.', v_registro_nome);
    elsif 'situacao' = any(v_campos) then
      v_resumo := format(
        'Alterou a situação de “%s” de “%s” para “%s”.',
        v_registro_nome,
        coalesce(v_anterior ->> 'situacao', 'Não informado'),
        coalesce(v_novo ->> 'situacao', 'Não informado')
      );
    else
      v_resumo := format(
        'Atualizou o cadastro de “%s” (%s campo(s) alterado(s)).',
        v_registro_nome,
        cardinality(v_campos)
      );
    end if;
  elsif tg_table_name = 'contatos' then
    if tg_op = 'INSERT' then
      v_resumo := format(
        'Registrou contato para “%s” por %s, com resultado “%s”.',
        v_registro_nome,
        coalesce(v_novo ->> 'forma_contato', 'forma não informada'),
        coalesce(v_novo ->> 'resultado_contato', 'não informado')
      );
    elsif tg_op = 'DELETE' then
      v_resumo := format('Excluiu um contato vinculado a “%s”.', v_registro_nome);
    else
      v_resumo := format(
        'Atualizou um contato vinculado a “%s” (%s campo(s) alterado(s)).',
        v_registro_nome,
        cardinality(v_campos)
      );
    end if;
  else
    v_resumo := format('%s registro em %s.', tg_op, tg_table_name);
  end if;

  insert into public.auditoria (
    usuario_id,
    usuario_nome,
    usuario_email,
    acao,
    tabela,
    registro_id,
    registro_nome,
    resumo,
    campos_alterados,
    dados_anteriores,
    dados_novos
  ) values (
    (select auth.uid()),
    v_usuario_nome,
    v_usuario_email,
    tg_op,
    tg_table_name,
    v_registro_id,
    v_registro_nome,
    v_resumo,
    v_campos,
    v_anterior,
    v_novo
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Os gatilhos já existiam; recriamos para garantir a versão atual da função.
drop trigger if exists concedentes_auditoria on public.concedentes;
create trigger concedentes_auditoria
  after insert or update or delete on public.concedentes
  for each row execute function public.registrar_auditoria();

drop trigger if exists contatos_auditoria on public.contatos;
create trigger contatos_auditoria
  after insert or update or delete on public.contatos
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- 3. Preenche informações legíveis nos registros antigos, quando possível.
-- ---------------------------------------------------------------------------
update public.auditoria a
set
  usuario_nome = coalesce(a.usuario_nome, nullif(btrim(u.nome), ''), u.email::text, 'Sistema'),
  usuario_email = coalesce(a.usuario_email, u.email::text)
from public.usuarios u
where a.usuario_id = u.id
  and (a.usuario_nome is null or a.usuario_email is null);

update public.auditoria
set registro_nome = coalesce(
      registro_nome,
      nullif(dados_novos ->> 'nome_fantasia', ''),
      nullif(dados_anteriores ->> 'nome_fantasia', ''),
      nullif(dados_novos ->> 'razao_social', ''),
      nullif(dados_anteriores ->> 'razao_social', ''),
      nullif(dados_novos ->> 'pessoa_contatada', ''),
      nullif(dados_anteriores ->> 'pessoa_contatada', ''),
      initcap(replace(tabela, '_', ' '))
    ),
    resumo = coalesce(
      resumo,
      case acao
        when 'INSERT' then 'Cadastrou um registro em ' || tabela || '.'
        when 'UPDATE' then 'Atualizou um registro em ' || tabela || '.'
        when 'DELETE' then 'Excluiu um registro em ' || tabela || '.'
        else acao || ' em ' || tabela || '.'
      end
    )
where registro_nome is null or resumo is null;

-- ---------------------------------------------------------------------------
-- 4. Auditoria é exclusiva do administrador e imutável pela aplicação.
-- ---------------------------------------------------------------------------
delete from public.perfil_permissoes
where perfil_id in ('operador', 'consulta')
  and permissao_codigo = 'auditoria.visualizar';

insert into public.perfil_permissoes (perfil_id, permissao_codigo)
values ('administrador', 'auditoria.visualizar')
on conflict do nothing;

drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria
  for select to authenticated
  using (public.tem_permissao('auditoria.visualizar'));

revoke all on public.auditoria from anon;
revoke insert, update, delete, truncate on public.auditoria from authenticated;
grant select on public.auditoria to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Atualiza o diagnóstico do sistema.
-- ---------------------------------------------------------------------------
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
    'schema_version', 'etapa-4-auditoria'
  );
$$;

revoke all on function public.healthcheck() from public;
grant execute on function public.healthcheck() to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- Conferência final.
select jsonb_build_object(
  'status', 'ok',
  'etapa', '4-auditoria',
  'registros_auditoria', (select count(*) from public.auditoria),
  'administradores_com_acesso', (
    select count(distinct u.id)
    from public.usuarios u
    join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
    where u.ativo = true
      and pp.permissao_codigo = 'auditoria.visualizar'
  )
) as resultado;


-- ============================================================================
-- ETAPA 5 — NOTIFICAÇÕES
-- ============================================================================

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


-- ============================================================================
-- ETAPA 6 — GESTÃO DE USUÁRIOS
-- ============================================================================

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


-- ============================================================================
-- CORREÇÃO FINAL DE PERMISSÕES
-- ============================================================================

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


-- ============================================================================
-- ETAPA 7 — MELHORIAS CONSOLIDADAS
-- ============================================================================

-- ============================================================================
-- Gestão de Renovações de Convênios — Etapa 7
-- Identidade visual, cadastro por CNPJ, importação avançada e auditoria
-- Execute todo este arquivo no SQL Editor do Supabase.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Novos dados cadastrais retornados pelas consultas de CNPJ.
-- ---------------------------------------------------------------------------
alter table public.concedentes
  add column if not exists data_abertura date,
  add column if not exists situacao_cadastral text,
  add column if not exists natureza_juridica text,
  add column if not exists cnae_principal text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists fonte_cnpj text,
  add column if not exists consultado_em timestamptz;

create index if not exists concedentes_situacao_cadastral_idx
  on public.concedentes (situacao_cadastral);

-- Aceita CNPJ numérico e o novo formato alfanumérico, mantendo 14 caracteres.
alter table public.concedentes
  drop constraint if exists concedentes_cnpj_check;

alter table public.concedentes
  add constraint concedentes_cnpj_check check (
    cnpj is null
    or btrim(cnpj) = ''
    or length(regexp_replace(upper(cnpj), '[^A-Z0-9]', '', 'g')) = 14
  );

-- Índices antigos por CNPJ isolado são removidos na consolidação final.

-- ---------------------------------------------------------------------------
-- 2. Permissão exclusiva do administrador para excluir itens da auditoria.
-- ---------------------------------------------------------------------------
insert into public.permissoes (codigo, nome, descricao)
values (
  'auditoria.excluir',
  'Excluir registros da auditoria',
  'Remove registros selecionados e preserva um comprovante técnico permanente.'
)
on conflict (codigo) do update
set nome = excluded.nome,
    descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_id, permissao_codigo)
values ('administrador', 'auditoria.excluir')
on conflict do nothing;

delete from public.perfil_permissoes
where permissao_codigo = 'auditoria.excluir'
  and perfil_id <> 'administrador';

-- A aplicação continua sem DELETE direto. A exclusão só ocorre pela função abaixo.
revoke delete, truncate on public.auditoria from authenticated;

create or replace function public.excluir_registros_auditoria(
  p_ids bigint[],
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_usuario_nome text;
  v_usuario_email text;
  v_ids bigint[];
  v_quantidade integer := 0;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 500);
begin
  if v_usuario_id is null then
    raise exception 'Sessão não identificada.' using errcode = '42501';
  end if;

  if not public.tem_permissao('auditoria.excluir') then
    raise exception 'Somente o administrador pode excluir registros da auditoria.' using errcode = '42501';
  end if;

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Nenhum registro foi selecionado.' using errcode = '22023';
  end if;

  if length(v_motivo) < 3 then
    raise exception 'Informe um motivo com pelo menos 3 caracteres.' using errcode = '22023';
  end if;

  -- Registros com tabela = auditoria são comprovantes permanentes e não podem
  -- ser apagados nem mesmo por esta função.
  select array_agg(a.id order by a.id)
    into v_ids
  from public.auditoria a
  where a.id = any(p_ids)
    and lower(a.tabela) <> 'auditoria';

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'Os registros selecionados não existem ou são comprovantes permanentes.' using errcode = '22023';
  end if;

  delete from public.auditoria a
  where a.id = any(v_ids);
  get diagnostics v_quantidade = row_count;

  select nullif(btrim(u.nome), ''), u.email::text
    into v_usuario_nome, v_usuario_email
  from public.usuarios u
  where u.id = v_usuario_id;

  v_usuario_nome := coalesce(v_usuario_nome, v_usuario_email, 'Administrador');

  insert into public.auditoria (
    usuario_id,
    usuario_nome,
    usuario_email,
    acao,
    tabela,
    registro_id,
    registro_nome,
    resumo,
    campos_alterados,
    dados_anteriores,
    dados_novos
  ) values (
    v_usuario_id,
    v_usuario_nome,
    v_usuario_email,
    'DELETE',
    'auditoria',
    null,
    'Limpeza administrativa da auditoria',
    format('Excluiu %s registro(s) da auditoria. Motivo: %s', v_quantidade, v_motivo),
    array['registros_excluidos', 'ids_excluidos', 'motivo']::text[],
    jsonb_build_object(
      'registros_excluidos', v_quantidade,
      'ids_excluidos', to_jsonb(v_ids),
      'motivo', v_motivo
    ),
    jsonb_build_object(
      'comprovante_permanente', true,
      'excluido_por', v_usuario_id,
      'excluido_em', now()
    )
  );

  return jsonb_build_object(
    'status', 'ok',
    'excluidos', v_quantidade,
    'ids', to_jsonb(v_ids),
    'comprovante_permanente', true
  );
end;
$$;

revoke all on function public.excluir_registros_auditoria(bigint[], text) from public;
grant execute on function public.excluir_registros_auditoria(bigint[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Mantém a leitura da auditoria exclusiva do administrador.
-- ---------------------------------------------------------------------------
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria
  for select to authenticated
  using (public.tem_permissao('auditoria.visualizar'));

grant select on public.auditoria to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Atualiza o diagnóstico da instalação.
-- ---------------------------------------------------------------------------
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
    'schema_version', 'etapa-7-melhorias'
  );
$$;

revoke all on function public.healthcheck() from public;
grant execute on function public.healthcheck() to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
  'status', 'ok',
  'etapa', '7-melhorias',
  'novas_colunas', (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'concedentes'
      and column_name in (
        'data_abertura', 'situacao_cadastral', 'natureza_juridica',
        'cnae_principal', 'logradouro', 'numero', 'complemento',
        'bairro', 'fonte_cnpj', 'consultado_em'
      )
  ),
  'administrador_pode_excluir_auditoria', exists (
    select 1 from public.perfil_permissoes
    where perfil_id = 'administrador'
      and permissao_codigo = 'auditoria.excluir'
  ),
  'operador_pode_excluir_auditoria', exists (
    select 1 from public.perfil_permissoes
    where perfil_id = 'operador'
      and permissao_codigo = 'auditoria.excluir'
  )
) as resultado;


-- ============================================================================
-- CONSOLIDAÇÃO FINAL, COMPATIBILIDADE E FERRAMENTAS DE INSTALAÇÃO
-- ============================================================================

begin;

-- Cadastra em public.usuarios usuários de Auth que eventualmente já existiam
-- antes da instalação do gatilho. Perfis existentes nunca são sobrescritos.
insert into public.usuarios (
  id, nome, email, perfil_id, ativo, criado_em, atualizado_em
)
select
  au.id,
  coalesce(nullif(btrim(au.raw_user_meta_data ->> 'nome'), ''), split_part(au.email, '@', 1), ''),
  au.email::citext,
  'consulta',
  true,
  coalesce(au.created_at, now()),
  now()
from auth.users au
where au.email is not null
on conflict (id) do nothing;

-- Permissões finais do Operador: somente rotina operacional.
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

-- Funções sensíveis ficam exclusivamente com o Administrador.
delete from public.perfil_permissoes
where perfil_id <> 'administrador'
  and permissao_codigo in (
    'usuarios.gerenciar',
    'auditoria.visualizar',
    'auditoria.excluir',
    'configuracoes.gerenciar',
    'concedentes.excluir',
    'contatos.excluir',
    'dados.importar'
  );

-- Garante que o Administrador possua todas as permissões atuais e futuras
-- já cadastradas neste momento.
insert into public.perfil_permissoes (perfil_id, permissao_codigo)
select 'administrador', codigo
from public.permissoes
on conflict do nothing;

-- Ferramenta segura para promover um usuário já criado no Supabase Auth.
-- A execução fica restrita ao proprietário do banco/SQL Editor.
create or replace function public.promover_administrador_por_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios%rowtype;
begin
  if nullif(btrim(coalesce(p_email, '')), '') is null then
    raise exception 'Informe o e-mail do usuário.' using errcode = '22023';
  end if;

  update public.usuarios
  set perfil_id = 'administrador',
      ativo = true,
      atualizado_em = now()
  where lower(email::text) = lower(btrim(p_email))
  returning * into v_usuario;

  if not found then
    raise exception 'Usuário não encontrado em public.usuarios. Crie-o primeiro em Authentication > Users.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'id', v_usuario.id,
    'nome', v_usuario.nome,
    'email', v_usuario.email,
    'perfil', v_usuario.perfil_id,
    'ativo', v_usuario.ativo
  );
end;
$$;

revoke all on function public.promover_administrador_por_email(text) from public;
revoke all on function public.promover_administrador_por_email(text) from anon;
revoke all on function public.promover_administrador_por_email(text) from authenticated;

-- Diagnóstico final consolidado.
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
    'schema_version', 'v1.0-etapa-7-consolidada',
    'usuarios', (select count(*) from public.usuarios),
    'concedentes', (select count(*) from public.concedentes),
    'contatos', (select count(*) from public.contatos),
    'auditoria', (select count(*) from public.auditoria)
  );
$$;

revoke all on function public.healthcheck() from public;
grant execute on function public.healthcheck() to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- RESULTADO FINAL DA INSTALAÇÃO
select jsonb_build_object(
  'status', 'ok',
  'versao', 'v1.0-etapa-7-consolidada',
  'tabelas', (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'perfis_acesso', 'permissoes', 'perfil_permissoes', 'usuarios',
        'concedentes', 'contatos', 'configuracoes', 'auditoria',
        'notificacoes_usuario'
      )
  ),
  'funcoes_principais', (
    select count(*)
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in (
        'healthcheck', 'registrar_ultimo_acesso', 'usuario_ativo',
        'tem_permissao', 'registrar_auditoria',
        'excluir_registros_auditoria', 'promover_administrador_por_email'
      )
  ),
  'administradores_ativos', (
    select count(*) from public.usuarios
    where perfil_id = 'administrador' and ativo = true
  ),
  'operadores_ativos', (
    select count(*) from public.usuarios
    where perfil_id = 'operador' and ativo = true
  ),
  'operador_com_permissao_indevida', exists (
    select 1
    from public.perfil_permissoes
    where perfil_id = 'operador'
      and permissao_codigo in (
        'usuarios.gerenciar', 'auditoria.visualizar', 'auditoria.excluir',
        'configuracoes.gerenciar', 'concedentes.excluir', 'contatos.excluir',
        'dados.importar', 'dados.exportar'
      )
  )
) as resultado_instalacao;

select public.healthcheck() as diagnostico;


-- ================================================================
-- ATUALIZAÇÃO 8 INCORPORADA AO INSTALADOR COMPLETO
-- ================================================================
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

-- Atualização 8: exigir autenticação em dois fatores (AAL2) nas permissões.
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

-- ============================================================================
-- MÓDULO FINAL — AUTOMAÇÃO, COLABORAÇÃO, GOVERNANÇA E NATUREZA JURÍDICA
-- Este bloco sucede a estrutura-base e consolida as funções das versões 8.6–8.9.
-- ============================================================================

-- Execute no projeto uvsilamqohytjuzdjrok
-- Revisado a partir do repositório real enviado pelo usuário.
-- CLOUDCONVENIOS V8.9.1 — CORREÇÃO DEFINITIVA DA RAIZ — MIGRAÇÃO CUMULATIVA E CORREÇÃO DE ESTABILIDADE
-- Reaplica com segurança todas as estruturas da V8.8.0 e adiciona a classificação Público/Privado.
-- PROJETO ESPERADO: uvsilamqohytjuzdjrok

-- CLOUDCONVENIOS V8.8.0 — MIGRAÇÃO CUMULATIVA
-- AUTOMAÇÃO, COLABORAÇÃO, METAS, CALENDÁRIO, EXCEÇÕES E GOVERNANÇA
--
-- Este arquivo inclui as estruturas das versões anteriores e pode ser executado
-- com segurança no projeto uvsilamqohytjuzdjrok.
--
-- CLOUDCONVENIOS V8.6.0
-- FLUXO OPERACIONAL COMPLETO
--
-- Inclui:
-- • responsável e prioridade no convênio;
-- • modelos editáveis de e-mail;
-- • histórico de recados preparados e confirmados;
-- • regra de duplicidade CNPJ + marca;
-- • políticas de acesso para usuários autenticados.
--
-- PROJETO ESPERADO: uvsilamqohytjuzdjrok

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------
-- 1. CAMPOS OPERACIONAIS NA CONCEDENTE
-- ------------------------------------------------------------------

alter table public.concedentes
  add column if not exists marca text,
  add column if not exists responsavel_acompanhamento text,
  add column if not exists prioridade text default 'Média';

update public.concedentes
set marca = case
  when lower(trim(marca)) = 'uniasselvi' then 'Uniasselvi'
  when lower(trim(marca)) = 'unicesumar' then 'Unicesumar'
  else marca
end
where marca is not null;

update public.concedentes
set prioridade = 'Média'
where prioridade is null
   or prioridade not in ('Baixa','Média','Alta','Urgente');

alter table public.concedentes
  alter column prioridade set default 'Média';

alter table public.concedentes
  drop constraint if exists concedentes_marca_check;

alter table public.concedentes
  add constraint concedentes_marca_check
  check (marca is null or marca in ('Uniasselvi','Unicesumar'));

alter table public.concedentes
  drop constraint if exists concedentes_prioridade_check;

alter table public.concedentes
  add constraint concedentes_prioridade_check
  check (prioridade in ('Baixa','Média','Alta','Urgente'));

comment on column public.concedentes.responsavel_acompanhamento is
  'Responsável atual pelo acompanhamento da renovação.';

comment on column public.concedentes.prioridade is
  'Prioridade operacional: Baixa, Média, Alta ou Urgente.';

-- ------------------------------------------------------------------
-- 2. DUPLICIDADE SOMENTE POR CNPJ + MARCA
-- ------------------------------------------------------------------

alter table public.concedentes
  drop constraint if exists concedentes_cnpj_key;

alter table public.concedentes
  drop constraint if exists concedentes_cnpj_unique;

alter table public.concedentes
  drop constraint if exists unique_cnpj;

do $$
declare
  item record;
begin
  for item in
    select constraint_info.conname
    from (
      select
        constraint_entry.conname,
        array_agg(
          attribute_entry.attname::text
          order by key_position.position
        ) as column_names
      from pg_constraint constraint_entry
      join lateral unnest(constraint_entry.conkey)
        with ordinality as key_position(attnum, position)
        on true
      join pg_attribute attribute_entry
        on attribute_entry.attrelid = constraint_entry.conrelid
       and attribute_entry.attnum = key_position.attnum
      where constraint_entry.conrelid = 'public.concedentes'::regclass
        and constraint_entry.contype = 'u'
      group by constraint_entry.conname
    ) constraint_info
    where constraint_info.column_names = array['cnpj']::text[]
  loop
    execute format(
      'alter table public.concedentes drop constraint %I',
      item.conname
    );
  end loop;
end $$;

do $$
declare
  item record;
begin
  for item in
    select index_entry.relname as index_name
    from pg_index index_data
    join pg_class table_entry
      on table_entry.oid = index_data.indrelid
    join pg_namespace schema_entry
      on schema_entry.oid = table_entry.relnamespace
    join pg_class index_entry
      on index_entry.oid = index_data.indexrelid
    left join pg_constraint constraint_entry
      on constraint_entry.conindid = index_data.indexrelid
    where schema_entry.nspname = 'public'
      and table_entry.relname = 'concedentes'
      and index_data.indisunique
      and not index_data.indisprimary
      and constraint_entry.oid is null
      and index_data.indnkeyatts = 1
      and lower(pg_get_indexdef(index_data.indexrelid)) like '%cnpj%'
      and lower(pg_get_indexdef(index_data.indexrelid)) not like '%marca%'
  loop
    execute format(
      'drop index if exists public.%I',
      item.index_name
    );
  end loop;
end $$;

do $$
declare
  duplicate_list text;
begin
  select string_agg(
    format('%s / %s (%s registros)', normalized_cnpj, marca, quantity),
    '; '
  )
  into duplicate_list
  from (
    select
      regexp_replace(upper(cnpj), '[^A-Z0-9]', '', 'g') as normalized_cnpj,
      marca,
      count(*) as quantity
    from public.concedentes
    where cnpj is not null
      and btrim(cnpj) <> ''
      and marca in ('Uniasselvi','Unicesumar')
    group by regexp_replace(upper(cnpj), '[^A-Z0-9]', '', 'g'), marca
    having count(*) > 1
    order by count(*) desc
    limit 20
  ) duplicates;

  if duplicate_list is not null then
    raise exception
      'Existem pares CNPJ + marca duplicados: %. Corrija-os antes de executar novamente.',
      duplicate_list;
  end if;
end $$;

drop index if exists public.concedentes_cnpj_marca_unique_idx;

create unique index concedentes_cnpj_marca_unique_idx
  on public.concedentes (
    regexp_replace(upper(cnpj), '[^A-Z0-9]', '', 'g'),
    marca
  )
  where cnpj is not null
    and btrim(cnpj) <> ''
    and marca in ('Uniasselvi','Unicesumar');

-- ------------------------------------------------------------------
-- 3. MODELOS DE E-MAIL EDITÁVEIS
-- ------------------------------------------------------------------

create table if not exists public.modelos_email (
  id uuid primary key default gen_random_uuid(),
  situacao text not null,
  marca text not null,
  titulo text not null,
  corpo text not null,
  situacao_apos_envio text not null,
  proxima_acao text,
  dias_proximo_contato integer not null default 7,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint modelos_email_marca_check
    check (marca in ('Uniasselvi','Unicesumar')),
  constraint modelos_email_dias_check
    check (dias_proximo_contato between 0 and 365),
  constraint modelos_email_situacao_marca_unique
    unique (situacao, marca)
);

comment on table public.modelos_email is
  'Modelos usados na composição dos recados do Outlook.';

-- ------------------------------------------------------------------
-- 4. HISTÓRICO DAS COMUNICAÇÕES POR E-MAIL
-- ------------------------------------------------------------------

create table if not exists public.comunicacoes_email (
  id uuid primary key default gen_random_uuid(),
  concedente_id uuid not null references public.concedentes(id) on delete cascade,
  modelo_id uuid references public.modelos_email(id) on delete set null,
  marca text not null,
  situacao_origem text not null,
  destinatario text not null,
  assunto text not null,
  corpo text not null,
  status text not null default 'preparado',
  usuario_id uuid,
  usuario_nome text,
  usuario_email text,
  preparado_em timestamptz not null default now(),
  confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint comunicacoes_email_marca_check
    check (marca in ('Uniasselvi','Unicesumar')),
  constraint comunicacoes_email_status_check
    check (status in ('preparado','enviado','nao_enviado'))
);

create index if not exists comunicacoes_email_concedente_idx
  on public.comunicacoes_email (concedente_id, preparado_em desc);

create index if not exists comunicacoes_email_status_idx
  on public.comunicacoes_email (status, preparado_em desc);

-- ------------------------------------------------------------------
-- 5. ATUALIZAÇÃO AUTOMÁTICA DO CAMPO atualizado_em
-- ------------------------------------------------------------------

create or replace function public.cloudconvenios_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists modelos_email_touch_updated_at
  on public.modelos_email;

create trigger modelos_email_touch_updated_at
before update on public.modelos_email
for each row
execute function public.cloudconvenios_touch_updated_at();

-- ------------------------------------------------------------------
-- 6. PERMISSÕES E RLS
-- ------------------------------------------------------------------

create or replace function public.cloudconvenios_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios usuario
    where usuario.id = auth.uid()
      and usuario.perfil_id = 'administrador'
      and usuario.ativo = true
  );
$$;

revoke all on function public.cloudconvenios_is_admin() from public;
grant execute on function public.cloudconvenios_is_admin() to authenticated;

grant select on public.modelos_email to authenticated;
grant insert, update, delete on public.modelos_email to authenticated;
grant select, insert, update on public.comunicacoes_email to authenticated;
grant delete on public.comunicacoes_email to authenticated;

alter table public.modelos_email enable row level security;
alter table public.comunicacoes_email enable row level security;

drop policy if exists modelos_email_leitura_autenticada
  on public.modelos_email;
create policy modelos_email_leitura_autenticada
on public.modelos_email
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists modelos_email_gestao_administrador
  on public.modelos_email;
create policy modelos_email_gestao_administrador
on public.modelos_email
for all
to authenticated
using (
  public.cloudconvenios_is_admin()
)
with check (
  public.cloudconvenios_is_admin()
);

drop policy if exists comunicacoes_email_leitura_autenticada
  on public.comunicacoes_email;
create policy comunicacoes_email_leitura_autenticada
on public.comunicacoes_email
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists comunicacoes_email_insercao_autenticada
  on public.comunicacoes_email;
create policy comunicacoes_email_insercao_autenticada
on public.comunicacoes_email
for insert
to authenticated
with check (
  auth.uid() is not null
  and (usuario_id is null or usuario_id = auth.uid())
);

drop policy if exists comunicacoes_email_atualizacao_propria_ou_admin
  on public.comunicacoes_email;
create policy comunicacoes_email_atualizacao_propria_ou_admin
on public.comunicacoes_email
for update
to authenticated
using (
  usuario_id = auth.uid()
  or public.cloudconvenios_is_admin()
)
with check (
  usuario_id = auth.uid()
  or public.cloudconvenios_is_admin()
);

drop policy if exists comunicacoes_email_exclusao_administrador
  on public.comunicacoes_email;
create policy comunicacoes_email_exclusao_administrador
on public.comunicacoes_email
for delete
to authenticated
using (
  public.cloudconvenios_is_admin()
);

-- ------------------------------------------------------------------
-- 7. MODELOS PADRÃO — NÃO SOBRESCREVE EDIÇÕES EXISTENTES
-- ------------------------------------------------------------------

insert into public.modelos_email (
  situacao,
  marca,
  titulo,
  corpo,
  situacao_apos_envio,
  proxima_acao,
  dias_proximo_contato,
  ativo
)
select
  modelo.situacao,
  marca.nome,
  modelo.titulo,
  modelo.corpo,
  modelo.situacao_apos_envio,
  modelo.proxima_acao,
  modelo.dias_proximo_contato,
  true
from (
  values
  (
    'Não contatado',
    'Renovação de convênio | {{MARCA}} e {{LOCAL}}',
    E'Prezados, {{SAUDACAO}}, tudo bem?\n\nVerificamos que o convênio firmado entre a {{MARCA}} e {{LOCAL}} encontra-se próximo do término de sua vigência.\n\nGostaríamos de verificar o interesse na renovação do convênio, por meio de um termo aditivo.\n\nCaso haja interesse na renovação do convênio, formalizaremos o aditivo para apreciação.\n\nPermanecemos à disposição para quaisquer esclarecimentos e aguardamos o retorno.\n\nAtenciosamente,',
    'Aguardando retorno',
    'Aguardar retorno sobre o interesse na renovação',
    7
  ),
  (
    'Aguardando retorno',
    'Solicitação de análise da renovação de convênio | {{MARCA}}',
    E'Prezados, {{SAUDACAO}}.\n\nAnteriormente, entramos em contato para verificar o interesse na renovação do convênio vigente com a {{MARCA}}, pelo período de mais 60 meses.\n\nA continuidade da parceria reforça a cooperação entre as instituições e contribui diretamente para a formação dos acadêmicos, ao possibilitar a aplicação prática dos conhecimentos adquiridos durante sua trajetória acadêmica.\n\nPara a concedente, o convênio representa uma oportunidade de aproximação com o ambiente educacional, participação no desenvolvimento de novos profissionais e contato com talentos que poderão contribuir futuramente com o mercado de trabalho.\n\nDiante disso, solicitamos a gentileza de confirmar o interesse na renovação, para iniciarmos os procedimentos necessários e assegurar a continuidade da parceria.\n\nPermanecemos à disposição para quaisquer esclarecimentos.\n\nAtenciosamente,',
    'Aguardando retorno',
    'Realizar novo acompanhamento da renovação',
    7
  ),
  (
    'Documentação solicitada',
    'Solicitação de análise documental da renovação de convênio | {{MARCA}}',
    E'Prezados, {{SAUDACAO}}, tudo bem?\n\nAnteriormente, encaminhamos o aditivo para renovação do convênio vigente com a {{MARCA}}, pelo período de mais 60 meses.\n\nSolicitamos a confirmação do recebimento e a análise documental para seguimento do processo.\n\nEm caso de recebimento e interesse, pedimos que envie o documento assinado, para atualizarmos o cadastro em nosso sistema. Ressaltamos que o representante da instituição realizará a assinatura do documento e uma cópia será encaminhada para apreciação.\n\nAgradecemos desde já pela pareceria e atenção.\n\nAtenciosamente,',
    'Documentação solicitada',
    'Acompanhar a análise documental e o recebimento do aditivo assinado',
    7
  )
) as modelo(
  situacao,
  titulo,
  corpo,
  situacao_apos_envio,
  proxima_acao,
  dias_proximo_contato
)
cross join (
  values ('Uniasselvi'), ('Unicesumar')
) as marca(nome)
on conflict (situacao, marca) do nothing;

commit;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- VALIDAÇÕES
-- ------------------------------------------------------------------

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'concedentes'
  and column_name in ('marca','responsavel_acompanhamento','prioridade')
order by column_name;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'concedentes'
  and indexname = 'concedentes_cnpj_marca_unique_idx';

select
  (select count(*) from public.modelos_email) as modelos_email,
  (select count(*) from public.comunicacoes_email) as comunicacoes_email;


-- ==================================================================
-- CLOUDCONVENIOS V8.7.0
-- PRODUTIVIDADE, BLOQUEIO DE EDIÇÃO E FILTROS SALVOS
-- ==================================================================

begin;

-- ------------------------------------------------------------------
-- 8. FILTROS E VISUALIZAÇÕES SALVAS POR USUÁRIO
-- ------------------------------------------------------------------

create table if not exists public.filtros_salvos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  nome text not null,
  painel text not null,
  filtros jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint filtros_salvos_painel_check
    check (painel in ('concedentes','fila','relatorios')),
  constraint filtros_salvos_nome_check
    check (char_length(btrim(nome)) between 1 and 80),
  constraint filtros_salvos_usuario_painel_nome_unique
    unique (usuario_id, painel, nome)
);

create index if not exists filtros_salvos_usuario_painel_idx
  on public.filtros_salvos (usuario_id, painel, nome);

drop trigger if exists filtros_salvos_touch_updated_at
  on public.filtros_salvos;

create trigger filtros_salvos_touch_updated_at
before update on public.filtros_salvos
for each row
execute function public.cloudconvenios_touch_updated_at();

alter table public.filtros_salvos enable row level security;

grant select, insert, update, delete
  on public.filtros_salvos
  to authenticated;

drop policy if exists filtros_salvos_leitura_propria
  on public.filtros_salvos;
create policy filtros_salvos_leitura_propria
on public.filtros_salvos
for select
to authenticated
using (usuario_id = auth.uid());

drop policy if exists filtros_salvos_insercao_propria
  on public.filtros_salvos;
create policy filtros_salvos_insercao_propria
on public.filtros_salvos
for insert
to authenticated
with check (usuario_id = auth.uid());

drop policy if exists filtros_salvos_atualizacao_propria
  on public.filtros_salvos;
create policy filtros_salvos_atualizacao_propria
on public.filtros_salvos
for update
to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());

drop policy if exists filtros_salvos_exclusao_propria
  on public.filtros_salvos;
create policy filtros_salvos_exclusao_propria
on public.filtros_salvos
for delete
to authenticated
using (usuario_id = auth.uid());

comment on table public.filtros_salvos is
  'Atalhos pessoais de filtros das telas operacionais.';

-- ------------------------------------------------------------------
-- 9. BLOQUEIO TEMPORÁRIO DE EDIÇÃO
-- ------------------------------------------------------------------

create table if not exists public.bloqueios_edicao (
  concedente_id uuid primary key
    references public.concedentes(id) on delete cascade,
  usuario_id uuid not null,
  usuario_nome text,
  usuario_email text,
  adquirido_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create index if not exists bloqueios_edicao_expira_idx
  on public.bloqueios_edicao (expira_em);

alter table public.bloqueios_edicao enable row level security;

grant select on public.bloqueios_edicao to authenticated;

drop policy if exists bloqueios_edicao_leitura_autenticada
  on public.bloqueios_edicao;
create policy bloqueios_edicao_leitura_autenticada
on public.bloqueios_edicao
for select
to authenticated
using (auth.uid() is not null);

create or replace function public.cloudconvenios_adquirir_bloqueio(
  p_concedente_id uuid,
  p_usuario_nome text default null,
  p_usuario_email text default null,
  p_ttl_segundos integer default 150
)
returns table (
  adquirido boolean,
  concedente_id uuid,
  usuario_id uuid,
  usuario_nome text,
  usuario_email text,
  adquirido_em timestamptz,
  expira_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  normalized_ttl integer;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.usuarios usuario
    where usuario.id = current_user_id
      and usuario.ativo = true
  ) then
    raise exception 'Usuário inativo ou não cadastrado.';
  end if;

  normalized_ttl := greatest(60, least(coalesce(p_ttl_segundos, 150), 600));

  delete from public.bloqueios_edicao bloqueio
  where bloqueio.expira_em <= now();

  insert into public.bloqueios_edicao (
    concedente_id,
    usuario_id,
    usuario_nome,
    usuario_email,
    adquirido_em,
    expira_em
  )
  values (
    p_concedente_id,
    current_user_id,
    nullif(btrim(coalesce(p_usuario_nome, '')), ''),
    nullif(btrim(coalesce(p_usuario_email, '')), ''),
    now(),
    now() + make_interval(secs => normalized_ttl)
  )
  on conflict (concedente_id) do update
  set
    usuario_id = current_user_id,
    usuario_nome = excluded.usuario_nome,
    usuario_email = excluded.usuario_email,
    adquirido_em = case
      when bloqueios_edicao.usuario_id = current_user_id
        then bloqueios_edicao.adquirido_em
      else now()
    end,
    expira_em = excluded.expira_em
  where
    bloqueios_edicao.expira_em <= now()
    or bloqueios_edicao.usuario_id = current_user_id;

  return query
  select
    bloqueio.usuario_id = current_user_id as adquirido,
    bloqueio.concedente_id,
    bloqueio.usuario_id,
    bloqueio.usuario_nome,
    bloqueio.usuario_email,
    bloqueio.adquirido_em,
    bloqueio.expira_em
  from public.bloqueios_edicao bloqueio
  where bloqueio.concedente_id = p_concedente_id;
end;
$$;

create or replace function public.cloudconvenios_liberar_bloqueio(
  p_concedente_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  delete from public.bloqueios_edicao bloqueio
  where bloqueio.concedente_id = p_concedente_id
    and (
      bloqueio.usuario_id = auth.uid()
      or public.cloudconvenios_is_admin()
      or bloqueio.expira_em <= now()
    );

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.cloudconvenios_adquirir_bloqueio(
  uuid, text, text, integer
) from public;
revoke all on function public.cloudconvenios_liberar_bloqueio(uuid)
  from public;

grant execute on function public.cloudconvenios_adquirir_bloqueio(
  uuid, text, text, integer
) to authenticated;
grant execute on function public.cloudconvenios_liberar_bloqueio(uuid)
  to authenticated;

comment on table public.bloqueios_edicao is
  'Reservas temporárias para evitar que dois usuários sobrescrevam o mesmo cadastro.';

-- ------------------------------------------------------------------
-- 10. AÇÕES EM MASSA
-- ------------------------------------------------------------------

create or replace function public.cloudconvenios_aplicar_acao_em_massa(
  p_ids uuid[],
  p_responsavel text default null,
  p_prioridade text default null,
  p_situacao text default null,
  p_proxima_acao text default null,
  p_proximo_contato date default null,
  p_usuario_nome text default null,
  p_usuario_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  updated_count integer := 0;
  contacts_count integer := 0;
  clean_responsible text;
  clean_priority text;
  clean_status text;
  clean_action text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.usuarios usuario
    where usuario.id = current_user_id
      and usuario.ativo = true
  ) then
    raise exception 'Usuário inativo ou não cadastrado.';
  end if;

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Nenhum cadastro foi selecionado.';
  end if;

  clean_responsible := nullif(btrim(coalesce(p_responsavel, '')), '');
  clean_priority := nullif(btrim(coalesce(p_prioridade, '')), '');
  clean_status := nullif(btrim(coalesce(p_situacao, '')), '');
  clean_action := nullif(btrim(coalesce(p_proxima_acao, '')), '');

  if clean_priority is not null
     and clean_priority not in ('Baixa','Média','Alta','Urgente') then
    raise exception 'Prioridade inválida.';
  end if;

  if clean_status is not null
     and clean_status not in (
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
     ) then
    raise exception 'Situação inválida.';
  end if;

  update public.concedentes concedente
  set
    responsavel_acompanhamento = case
      when clean_responsible is null then concedente.responsavel_acompanhamento
      when clean_responsible = '__CLEAR__' then null
      else clean_responsible
    end,
    prioridade = coalesce(clean_priority, concedente.prioridade),
    situacao = coalesce(clean_status, concedente.situacao),
    atualizado_em = now(),
    atualizado_por = current_user_id
  where concedente.id = any(p_ids);

  get diagnostics updated_count = row_count;

  if clean_status is not null
     or clean_action is not null
     or p_proximo_contato is not null then
    insert into public.contatos (
      concedente_id,
      data_contato,
      horario,
      responsavel,
      forma_contato,
      pessoa_contatada,
      resultado_contato,
      proxima_acao,
      proximo_contato,
      observacoes,
      criado_por,
      atualizado_por
    )
    select
      concedente.id,
      current_date,
      localtime(0),
      coalesce(
        nullif(btrim(coalesce(p_usuario_nome, '')), ''),
        nullif(btrim(coalesce(p_usuario_email, '')), ''),
        'Usuário'
      ),
      'Outro',
      null,
      coalesce(clean_status, concedente.situacao),
      clean_action,
      p_proximo_contato,
      'Atualização em massa registrada pelo CloudConvênios.',
      current_user_id,
      current_user_id
    from public.concedentes concedente
    where concedente.id = any(p_ids);

    get diagnostics contacts_count = row_count;
  end if;

  return jsonb_build_object(
    'updated', updated_count,
    'contactsInserted', contacts_count
  );
end;
$$;

revoke all on function public.cloudconvenios_aplicar_acao_em_massa(
  uuid[], text, text, text, text, date, text, text
) from public;

grant execute on function public.cloudconvenios_aplicar_acao_em_massa(
  uuid[], text, text, text, text, date, text, text
) to authenticated;

comment on function public.cloudconvenios_aplicar_acao_em_massa(
  uuid[], text, text, text, text, date, text, text
) is
  'Atualiza responsável, prioridade, situação e acompanhamento para vários convênios.';

commit;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- VALIDAÇÕES V8.7.0
-- ------------------------------------------------------------------

select
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('filtros_salvos','bloqueios_edicao')
order by table_name;

select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'cloudconvenios_adquirir_bloqueio',
    'cloudconvenios_liberar_bloqueio',
    'cloudconvenios_aplicar_acao_em_massa'
  )
order by routine_name;


-- ==================================================================
-- CLOUDCONVENIOS V8.8.0
-- AUTOMAÇÃO, COLABORAÇÃO, METAS, DESFAZER E MANUTENÇÃO
-- ==================================================================

begin;

-- ------------------------------------------------------------------
-- 11. ETIQUETAS PERSONALIZADAS
-- ------------------------------------------------------------------

alter table public.concedentes
  add column if not exists etiquetas text[] not null default '{}'::text[];

update public.concedentes
set etiquetas = '{}'::text[]
where etiquetas is null;

create index if not exists concedentes_etiquetas_gin_idx
  on public.concedentes using gin (etiquetas);

comment on column public.concedentes.etiquetas is
  'Etiquetas personalizadas para filtros, relatórios e priorização.';

-- ------------------------------------------------------------------
-- 12. REGRAS AUTOMÁTICAS DE FLUXO
-- ------------------------------------------------------------------

create table if not exists public.regras_fluxo (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  evento text not null,
  marca text,
  situacao_origem text,
  situacao_destino text,
  proxima_acao text,
  dias_uteis integer not null default 0,
  dias_atraso integer not null default 0,
  prioridade_destino text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint regras_fluxo_evento_check
    check (evento in ('email_enviado','situacao_alterada','prazo_atrasado')),
  constraint regras_fluxo_marca_check
    check (marca is null or marca in ('Uniasselvi','Unicesumar')),
  constraint regras_fluxo_prioridade_check
    check (prioridade_destino is null or prioridade_destino in ('Baixa','Média','Alta','Urgente')),
  constraint regras_fluxo_dias_check
    check (dias_uteis between 0 and 365 and dias_atraso between 0 and 365),
  constraint regras_fluxo_nome_check
    check (char_length(btrim(nome)) between 1 and 120),
  constraint regras_fluxo_nome_unique unique (nome)
);

create index if not exists regras_fluxo_evento_idx
  on public.regras_fluxo (evento, ativo, dias_atraso);

drop trigger if exists regras_fluxo_touch_updated_at on public.regras_fluxo;
create trigger regras_fluxo_touch_updated_at
before update on public.regras_fluxo
for each row execute function public.cloudconvenios_touch_updated_at();

insert into public.regras_fluxo (
  nome, evento, situacao_origem, situacao_destino,
  proxima_acao, dias_uteis, dias_atraso, prioridade_destino, ativo
)
values
  ('Primeiro e-mail enviado', 'email_enviado', 'Não contatado', 'Aguardando retorno', 'Cobrar retorno da concedente', 5, 0, null, true),
  ('Reforço de retorno enviado', 'email_enviado', 'Aguardando retorno', 'Aguardando retorno', 'Cobrar novo retorno da concedente', 5, 0, null, true),
  ('Aditivo encaminhado', 'email_enviado', 'Documentação solicitada', 'Documentação solicitada', 'Acompanhar análise e documento assinado', 7, 0, null, true),
  ('Atraso de cinco dias', 'prazo_atrasado', null, null, 'Priorizar cobrança de retorno', 0, 5, 'Alta', true),
  ('Atraso de dez dias', 'prazo_atrasado', null, null, 'Escalonar pendência ao administrador', 0, 10, 'Urgente', true)
on conflict do nothing;

-- ------------------------------------------------------------------
-- 13. COMENTÁRIOS INTERNOS E MENÇÕES
-- ------------------------------------------------------------------

create table if not exists public.comentarios_internos (
  id uuid primary key default gen_random_uuid(),
  concedente_id uuid not null references public.concedentes(id) on delete cascade,
  texto text not null,
  usuario_id uuid not null,
  usuario_nome text,
  usuario_email text,
  mencoes text[] not null default '{}'::text[],
  lido_por uuid[] not null default '{}'::uuid[],
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint comentarios_internos_texto_check
    check (char_length(btrim(texto)) between 1 and 5000)
);

create index if not exists comentarios_internos_concedente_idx
  on public.comentarios_internos (concedente_id, criado_em desc);
create index if not exists comentarios_internos_mencoes_gin_idx
  on public.comentarios_internos using gin (mencoes);

drop trigger if exists comentarios_internos_touch_updated_at on public.comentarios_internos;
create trigger comentarios_internos_touch_updated_at
before update on public.comentarios_internos
for each row execute function public.cloudconvenios_touch_updated_at();

create or replace function public.cloudconvenios_marcar_comentario_lido(
  p_comentario_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.comentarios_internos
  set lido_por = case
    when auth.uid() = any(lido_por) then lido_por
    else array_append(lido_por, auth.uid())
  end
  where id = p_comentario_id;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.cloudconvenios_marcar_comentario_lido(uuid) from public;
grant execute on function public.cloudconvenios_marcar_comentario_lido(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 14. METAS OPERACIONAIS
-- ------------------------------------------------------------------

create table if not exists public.metas_operacionais (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  escopo text not null default 'usuario',
  usuario_id uuid,
  usuario_nome text,
  usuario_email text,
  usuario_chave uuid generated always as (
    coalesce(usuario_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) stored,
  meta_contatos integer not null default 0,
  meta_renovacoes integer not null default 0,
  meta_pendencias integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint metas_operacionais_escopo_check
    check (escopo in ('usuario','equipe')),
  constraint metas_operacionais_valores_check
    check (meta_contatos >= 0 and meta_renovacoes >= 0 and meta_pendencias >= 0),
  constraint metas_operacionais_competencia_check
    check (extract(day from competencia) = 1),
  constraint metas_operacionais_unique
    unique (competencia, escopo, usuario_chave)
);

create index if not exists metas_operacionais_competencia_idx
  on public.metas_operacionais (competencia, escopo);

drop trigger if exists metas_operacionais_touch_updated_at on public.metas_operacionais;
create trigger metas_operacionais_touch_updated_at
before update on public.metas_operacionais
for each row execute function public.cloudconvenios_touch_updated_at();

-- ------------------------------------------------------------------
-- 15. CONFIGURAÇÕES DO SISTEMA E MODO DE MANUTENÇÃO
-- ------------------------------------------------------------------

create table if not exists public.configuracoes_sistema (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint configuracoes_sistema_chave_check
    check (char_length(btrim(chave)) between 1 and 80)
);

drop trigger if exists configuracoes_sistema_touch_updated_at on public.configuracoes_sistema;
create trigger configuracoes_sistema_touch_updated_at
before update on public.configuracoes_sistema
for each row execute function public.cloudconvenios_touch_updated_at();

insert into public.configuracoes_sistema (chave, valor)
values ('manutencao', '{"ativo":false,"mensagem":"","inicioEm":"","fimEm":""}'::jsonb)
on conflict (chave) do nothing;

-- ------------------------------------------------------------------
-- 16. OPERAÇÕES REVERSÍVEIS
-- ------------------------------------------------------------------

create table if not exists public.operacoes_reversiveis (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  tipo text not null,
  descricao text not null,
  payload jsonb not null,
  expira_em timestamptz not null,
  desfeita_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint operacoes_reversiveis_tipo_check
    check (char_length(btrim(tipo)) between 1 and 60),
  constraint operacoes_reversiveis_descricao_check
    check (char_length(btrim(descricao)) between 1 and 240)
);

create index if not exists operacoes_reversiveis_usuario_idx
  on public.operacoes_reversiveis (usuario_id, criado_em desc);
create index if not exists operacoes_reversiveis_expira_idx
  on public.operacoes_reversiveis (expira_em);

create or replace function public.cloudconvenios_registrar_operacao(
  p_tipo text,
  p_descricao text,
  p_ids uuid[],
  p_expira_minutos integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  operation_id uuid;
  snapshot jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Nenhum cadastro foi informado.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(company) order by company.id), '[]'::jsonb)
  into snapshot
  from public.concedentes company
  where company.id = any(p_ids);

  if jsonb_array_length(snapshot) = 0 then
    raise exception 'Nenhum cadastro válido foi localizado.';
  end if;

  insert into public.operacoes_reversiveis (
    usuario_id, tipo, descricao, payload, expira_em
  )
  values (
    auth.uid(),
    left(coalesce(nullif(btrim(p_tipo), ''), 'alteracao'), 60),
    left(coalesce(nullif(btrim(p_descricao), ''), 'Alteração de cadastro'), 240),
    jsonb_build_object('concedentes', snapshot),
    now() + make_interval(mins => greatest(1, least(coalesce(p_expira_minutos, 10), 60)))
  )
  returning id into operation_id;

  return operation_id;
end;
$$;

create or replace function public.cloudconvenios_desfazer_operacao(
  p_operacao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  operation_record public.operacoes_reversiveis%rowtype;
  item jsonb;
  restored integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into operation_record
  from public.operacoes_reversiveis
  where id = p_operacao_id
  for update;

  if not found then
    raise exception 'Operação não encontrada.';
  end if;

  if operation_record.usuario_id <> auth.uid()
     and not public.cloudconvenios_is_admin() then
    raise exception 'Esta operação pertence a outro usuário.';
  end if;

  if operation_record.desfeita_em is not null then
    raise exception 'Esta operação já foi desfeita.';
  end if;

  if operation_record.expira_em <= now() then
    raise exception 'O prazo para desfazer esta operação expirou.';
  end if;

  for item in
    select value from jsonb_array_elements(operation_record.payload->'concedentes')
  loop
    update public.concedentes
    set
      cnpj = item->>'cnpj',
      razao_social = coalesce(item->>'razao_social', ''),
      nome_fantasia = coalesce(item->>'nome_fantasia', ''),
      marca = nullif(item->>'marca', ''),
      data_abertura = nullif(item->>'data_abertura', '')::date,
      situacao_cadastral = nullif(item->>'situacao_cadastral', ''),
      natureza_juridica = nullif(item->>'natureza_juridica', ''),
      cnae_principal = nullif(item->>'cnae_principal', ''),
      logradouro = nullif(item->>'logradouro', ''),
      numero = nullif(item->>'numero', ''),
      complemento = nullif(item->>'complemento', ''),
      bairro = nullif(item->>'bairro', ''),
      fonte_cnpj = nullif(item->>'fonte_cnpj', ''),
      consultado_em = nullif(item->>'consultado_em', '')::timestamptz,
      inicio_vigencia = nullif(item->>'inicio_vigencia', '')::date,
      fim_vigencia = nullif(item->>'fim_vigencia', '')::date,
      data_cadastro = nullif(item->>'data_cadastro', '')::date,
      estado = coalesce(item->>'estado', ''),
      cidade = coalesce(item->>'cidade', ''),
      cep = nullif(item->>'cep', ''),
      email = nullif(item->>'email', ''),
      telefone = nullif(item->>'telefone', ''),
      polo = coalesce(item->>'polo', ''),
      responsavel_acompanhamento = nullif(item->>'responsavel_acompanhamento', ''),
      prioridade = coalesce(nullif(item->>'prioridade', ''), 'Média'),
      etiquetas = case
        when jsonb_typeof(item->'etiquetas') = 'array'
          then array(select jsonb_array_elements_text(item->'etiquetas'))
        else '{}'::text[]
      end,
      situacao = coalesce(nullif(item->>'situacao', ''), 'Não contatado'),
      formas_contato = case
        when jsonb_typeof(item->'formas_contato') = 'array'
          then array(select jsonb_array_elements_text(item->'formas_contato'))
        else '{}'::text[]
      end,
      observacoes = nullif(item->>'observacoes', ''),
      demonstracao = coalesce((item->>'demonstracao')::boolean, false)
    where id = (item->>'id')::uuid;

    restored := restored + 1;
  end loop;

  update public.operacoes_reversiveis
  set desfeita_em = now()
  where id = p_operacao_id;

  return jsonb_build_object('restored', restored, 'operationId', p_operacao_id);
end;
$$;

revoke all on function public.cloudconvenios_registrar_operacao(text,text,uuid[],integer) from public;
revoke all on function public.cloudconvenios_desfazer_operacao(uuid) from public;
grant execute on function public.cloudconvenios_registrar_operacao(text,text,uuid[],integer) to authenticated;
grant execute on function public.cloudconvenios_desfazer_operacao(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 17. PERMISSÕES E POLÍTICAS
-- ------------------------------------------------------------------

grant select on public.regras_fluxo to authenticated;
grant insert, update, delete on public.regras_fluxo to authenticated;
grant select, insert, update, delete on public.comentarios_internos to authenticated;
grant select, insert, update, delete on public.metas_operacionais to authenticated;
grant select, insert, update, delete on public.configuracoes_sistema to authenticated;
grant select, insert, update, delete on public.operacoes_reversiveis to authenticated;

alter table public.regras_fluxo enable row level security;
alter table public.comentarios_internos enable row level security;
alter table public.metas_operacionais enable row level security;
alter table public.configuracoes_sistema enable row level security;
alter table public.operacoes_reversiveis enable row level security;

-- Regras: leitura autenticada, gestão administrativa.
drop policy if exists regras_fluxo_leitura on public.regras_fluxo;
create policy regras_fluxo_leitura on public.regras_fluxo
for select to authenticated using (auth.uid() is not null);
drop policy if exists regras_fluxo_gestao on public.regras_fluxo;
create policy regras_fluxo_gestao on public.regras_fluxo
for all to authenticated
using (public.cloudconvenios_is_admin())
with check (public.cloudconvenios_is_admin());

-- Comentários: todos leem e inserem; autor ou administrador exclui.
drop policy if exists comentarios_internos_leitura on public.comentarios_internos;
create policy comentarios_internos_leitura on public.comentarios_internos
for select to authenticated using (auth.uid() is not null);
drop policy if exists comentarios_internos_insercao on public.comentarios_internos;
create policy comentarios_internos_insercao on public.comentarios_internos
for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists comentarios_internos_atualizacao on public.comentarios_internos;
create policy comentarios_internos_atualizacao on public.comentarios_internos
for update to authenticated
using (usuario_id = auth.uid() or public.cloudconvenios_is_admin())
with check (usuario_id = auth.uid() or public.cloudconvenios_is_admin());
drop policy if exists comentarios_internos_exclusao on public.comentarios_internos;
create policy comentarios_internos_exclusao on public.comentarios_internos
for delete to authenticated
using (usuario_id = auth.uid() or public.cloudconvenios_is_admin());

-- Metas e configurações: leitura autenticada e gestão administrativa.
drop policy if exists metas_operacionais_leitura on public.metas_operacionais;
create policy metas_operacionais_leitura on public.metas_operacionais
for select to authenticated using (auth.uid() is not null);
drop policy if exists metas_operacionais_gestao on public.metas_operacionais;
create policy metas_operacionais_gestao on public.metas_operacionais
for all to authenticated
using (public.cloudconvenios_is_admin())
with check (public.cloudconvenios_is_admin());

drop policy if exists configuracoes_sistema_leitura on public.configuracoes_sistema;
create policy configuracoes_sistema_leitura on public.configuracoes_sistema
for select to authenticated using (auth.uid() is not null);
drop policy if exists configuracoes_sistema_gestao on public.configuracoes_sistema;
create policy configuracoes_sistema_gestao on public.configuracoes_sistema
for all to authenticated
using (public.cloudconvenios_is_admin())
with check (public.cloudconvenios_is_admin());

-- Operações reversíveis: usuário acessa as próprias; administrador acessa todas.
drop policy if exists operacoes_reversiveis_proprias on public.operacoes_reversiveis;
create policy operacoes_reversiveis_proprias on public.operacoes_reversiveis
for all to authenticated
using (usuario_id = auth.uid() or public.cloudconvenios_is_admin())
with check (usuario_id = auth.uid() or public.cloudconvenios_is_admin());

commit;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- VALIDAÇÕES V8.8.0
-- ------------------------------------------------------------------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'concedentes'
  and column_name = 'etiquetas';

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'regras_fluxo',
    'comentarios_internos',
    'metas_operacionais',
    'configuracoes_sistema',
    'operacoes_reversiveis'
  )
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'cloudconvenios_marcar_comentario_lido',
    'cloudconvenios_registrar_operacao',
    'cloudconvenios_desfazer_operacao'
  )
order by routine_name;

select count(*) as regras_automaticas
from public.regras_fluxo;


-- ==================================================================
-- COMPLEMENTO V8.8.1 — PÚBLICO/PRIVADO
-- ==================================================================

-- CLOUDCONVENIOS V8.8.1 — CORREÇÃO DE ESTABILIDADE E CLASSIFICAÇÃO JURÍDICA
-- Projeto esperado: uvsilamqohytjuzdjrok

begin;

alter table public.concedentes
  add column if not exists tipo_natureza text;

create or replace function public.cloudconvenios_classificar_natureza_juridica(
  p_natureza text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  raw text := btrim(coalesce(p_natureza, ''));
  digits text;
  normalized text;
begin
  if raw = '' then
    return 'Não identificado';
  end if;

  digits := left(regexp_replace(raw, '[^0-9]', '', 'g'), 4);
  normalized := lower(translate(raw,
    'ÁÀÃÂÉÊÍÓÔÕÚÜÇáàãâéêíóôõúüç',
    'AAAAEEIOOOUUCaaaaeeiooouuc'
  ));

  if digits ~ '^1[0-9]{3}$' or digits in ('2011','2038') then
    return 'Público';
  end if;

  if normalized like any (array[
    '%orgao publico%', '%autarquia%', '%fundacao publica%', '%fundo publico%',
    '%empresa publica%', '%sociedade de economia mista%', '%consorcio publico%',
    '%estado ou distrito federal%', '%municipio%', '%uniao%', '%comissao polinacional%'
  ]) then
    return 'Público';
  end if;

  if digits like '5%' then
    return 'Não identificado';
  end if;

  return 'Privado';
end;
$$;

update public.concedentes
set tipo_natureza = public.cloudconvenios_classificar_natureza_juridica(natureza_juridica);

alter table public.concedentes
  alter column tipo_natureza set default 'Não identificado';

alter table public.concedentes
  alter column tipo_natureza set not null;

alter table public.concedentes
  drop constraint if exists concedentes_tipo_natureza_check;

alter table public.concedentes
  add constraint concedentes_tipo_natureza_check
  check (tipo_natureza in ('Público','Privado','Não identificado'));

create or replace function public.cloudconvenios_definir_tipo_natureza()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tipo_natureza := public.cloudconvenios_classificar_natureza_juridica(new.natureza_juridica);
  return new;
end;
$$;

drop trigger if exists concedentes_definir_tipo_natureza on public.concedentes;
create trigger concedentes_definir_tipo_natureza
before insert or update of natureza_juridica, tipo_natureza
on public.concedentes
for each row execute function public.cloudconvenios_definir_tipo_natureza();

create index if not exists concedentes_tipo_natureza_idx
  on public.concedentes (tipo_natureza);

comment on column public.concedentes.tipo_natureza is
  'Classificação automática Público, Privado ou Não identificado, baseada na natureza jurídica do CNPJ.';

commit;
notify pgrst, 'reload schema';

-- RESULTADOS DE CONFERÊNCIA
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'concedentes'
  and column_name in ('natureza_juridica','tipo_natureza')
order by ordinal_position;

select tipo_natureza, count(*) as quantidade
from public.concedentes
group by tipo_natureza
order by tipo_natureza;

-- ============================================================================
-- CONSOLIDAÇÃO FINAL V8.9.3
-- ============================================================================

begin;

-- Remove definitivamente índices antigos que bloqueavam o mesmo CNPJ em marcas
-- diferentes. A regra vigente é o par CNPJ normalizado + marca.
drop index if exists public.concedentes_cnpj_digits_unique;
drop index if exists public.concedentes_cnpj_key_unique;

-- Recria a regra final usando normalização compatível com CNPJ alfanumérico.
drop index if exists public.concedentes_cnpj_marca_unique_idx;
create unique index concedentes_cnpj_marca_unique_idx
  on public.concedentes (
    regexp_replace(upper(cnpj), '[^A-Z0-9]', '', 'g'),
    marca
  )
  where cnpj is not null
    and btrim(cnpj) <> ''
    and marca in ('Uniasselvi','Unicesumar');

-- Registro técnico único da versão do banco.
create table if not exists public.cloudconvenios_schema_version (
  id smallint primary key default 1 check (id = 1),
  versao text not null,
  descricao text not null,
  aplicado_em timestamptz not null default now()
);

insert into public.cloudconvenios_schema_version (id, versao, descricao, aplicado_em)
values (
  1,
  '8.9.3',
  'SQL único consolidado e alinhado à versão V8.9.3 do Dashboard regional',
  now()
)
on conflict (id) do update
set versao = excluded.versao,
    descricao = excluded.descricao,
    aplicado_em = excluded.aplicado_em;

alter table public.cloudconvenios_schema_version enable row level security;
revoke all on public.cloudconvenios_schema_version from anon, authenticated;
grant select on public.cloudconvenios_schema_version to service_role;

-- Permissões sempre sincronizadas: administrador recebe todas; operador apenas
-- as ações operacionais definidas pelo projeto.
insert into public.perfil_permissoes (perfil_id, permissao_codigo)
select 'administrador', codigo
from public.permissoes
on conflict do nothing;

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

-- Função final de autorização. O token precisa ter AAL2, pois a interface exige
-- autenticação por aplicativo autenticador antes de liberar o sistema.
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

-- Diagnóstico oficial consumido pela aplicação.
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
    'schema_version', '8.9.3-sql-unico',
    'concedentes', (select count(*) from public.concedentes),
    'usuarios_ativos', (select count(*) from public.usuarios where ativo = true),
    'mfa_required', true
  );
$$;

revoke all on function public.healthcheck() from public;
grant execute on function public.healthcheck() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- ============================================================================
-- RESULTADO FINAL / CONFERÊNCIA
-- ============================================================================
select jsonb_build_object(
  'resultado', 'CloudConvênios V8.9.3 instalado',
  'diagnostico', public.healthcheck(),
  'tabelas_publicas', (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'perfis_acesso','permissoes','perfil_permissoes','usuarios',
        'concedentes','contatos','configuracoes','auditoria',
        'notificacoes_usuario','historico_downloads','modelos_email',
        'comunicacoes_email','filtros_salvos','bloqueios_edicao',
        'regras_fluxo','comentarios_internos','metas_operacionais',
        'configuracoes_sistema','operacoes_reversiveis',
        'cloudconvenios_schema_version'
      )
  ),
  'funcoes_principais', (
    select count(*)
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in (
        'healthcheck','tem_permissao','registrar_ultimo_acesso',
        'excluir_registros_auditoria','promover_administrador_por_email',
        'cloudconvenios_adquirir_bloqueio','cloudconvenios_liberar_bloqueio',
        'cloudconvenios_aplicar_acao_em_massa',
        'cloudconvenios_marcar_comentario_lido',
        'cloudconvenios_registrar_operacao','cloudconvenios_desfazer_operacao'
      )
  )
) as conferencia_final;

-- PRIMEIRO ADMINISTRADOR (somente em instalação nova):
-- 1. Crie o usuário em Authentication > Users.
-- 2. Depois execute, em uma nova consulta, trocando o e-mail:
-- select public.promover_administrador_por_email('SEU_EMAIL@EMPRESA.COM.BR');

-- EXPORTAÇÃO AUTOMÁTICA ÀS 18H:
-- O agendamento utiliza pg_cron + pg_net e exige o mesmo EXPORT_CRON_SECRET
-- configurado no Cloudflare Pages. Consulte docs/GUIA-SUPABASE-E-GITHUB.md.
