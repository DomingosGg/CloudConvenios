-- =====================================================================
-- EXPORTAÇÃO AUTOMÁTICA DIÁRIA ÀS 18:00 (HORÁRIO DE BRASÍLIA / UTC-3)
-- Execute SOMENTE depois de:
-- 1) publicar a nova versão no Cloudflare Pages;
-- 2) criar no Cloudflare o segredo EXPORT_CRON_SECRET;
-- 3) substituir abaixo SUBSTITUA_POR_UM_SEGREDO_FORTE pelo MESMO valor.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Ajuste apenas se o endereço definitivo do site for diferente.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'cloudconvenios_site_url') then
    perform vault.create_secret(
      'https://cloudconvenios.pages.dev',
      'cloudconvenios_site_url',
      'Endereço da aplicação CloudConvenios'
    );
  else
    perform vault.update_secret(
      (select id from vault.decrypted_secrets where name = 'cloudconvenios_site_url'),
      'https://cloudconvenios.pages.dev',
      'cloudconvenios_site_url',
      'Endereço da aplicação CloudConvenios'
    );
  end if;

  if not exists (select 1 from vault.decrypted_secrets where name = 'cloudconvenios_export_cron_secret') then
    perform vault.create_secret(
      'SUBSTITUA_POR_UM_SEGREDO_FORTE',
      'cloudconvenios_export_cron_secret',
      'Segredo compartilhado com a Cloudflare Function de exportações'
    );
  else
    perform vault.update_secret(
      (select id from vault.decrypted_secrets where name = 'cloudconvenios_export_cron_secret'),
      'SUBSTITUA_POR_UM_SEGREDO_FORTE',
      'cloudconvenios_export_cron_secret',
      'Segredo compartilhado com a Cloudflare Function de exportações'
    );
  end if;
end $$;

-- Remove a rotina anterior, caso já exista.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'cloudconvenios-exportacao-diaria-18h';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

-- O Supabase Cron usa UTC. 21:00 UTC corresponde a 18:00 no horário de Brasília.
select cron.schedule(
  'cloudconvenios-exportacao-diaria-18h',
  '0 21 * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'cloudconvenios_site_url'
      ) || '/api/exports?action=automatic',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cloudconvenios_export_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);

select jobid, jobname, schedule, active
from cron.job
where jobname = 'cloudconvenios-exportacao-diaria-18h';
