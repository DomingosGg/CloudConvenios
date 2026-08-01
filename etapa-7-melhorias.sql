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

drop index if exists public.concedentes_cnpj_digits_unique;
create unique index if not exists concedentes_cnpj_key_unique
  on public.concedentes ((regexp_replace(upper(cnpj), '[^A-Z0-9]', '', 'g')))
  where nullif(regexp_replace(upper(cnpj), '[^A-Z0-9]', '', 'g'), '') is not null;

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
