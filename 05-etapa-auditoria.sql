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
