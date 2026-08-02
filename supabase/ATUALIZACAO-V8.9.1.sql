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
      regexp_replace(cnpj, '[^0-9]', '', 'g') as normalized_cnpj,
      marca,
      count(*) as quantity
    from public.concedentes
    where cnpj is not null
      and btrim(cnpj) <> ''
      and marca in ('Uniasselvi','Unicesumar')
    group by regexp_replace(cnpj, '[^0-9]', '', 'g'), marca
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
    regexp_replace(cnpj, '[^0-9]', '', 'g'),
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
