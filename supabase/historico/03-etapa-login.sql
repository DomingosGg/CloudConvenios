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
