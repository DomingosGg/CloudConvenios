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
      'A vida é um fluxo constante de miudezas que, quando somadas, compõem um cenário extraordinariamente bonito. Viver é bom pela simples imprevisibilidade dos dias, pela capacidade que o amanhã tem de ser completamente diferente de hoje. Há uma beleza silenciosa no ato de acordar e perceber que o mundo continuou girando enquanto dormíamos, que o sol insiste em nascer e que a luz invade a janela sem pedir licença, desenhando formas geométricas geométricas no chão do quarto. É o café quente que preenche a caneca e o aroma que desperta os sentidos, um ritual diário que nos ancora no presente.A existência ganha cor nos pequenos contrastes. É o frescor do vento batendo no rosto após um dia longo e exaustivo, ou a sensação reconfortante de tomar um banho morno e vestir uma roupa limpa. Viver é bom porque nos permite experimentar o mundo através dos sentidos: sentir o gosto de uma fruta madura, ouvir a nossa música favorita no rádio por pura coincidência, tocar a textura das folhas de uma árvore ou caminhar descalço na grama úmida de manhã. São momentos que não custam nada, mas que preenchem o peito com uma gratidão genuína e espontânea.Os laços humanos tornam essa jornada ainda mais rica. A vida se manifesta no riso frouxo compartilhado com amigos por causa de uma piada interna, no abraço apertado de alguém que não víamos há tempos e no olhar de cumplicidade que dispensa qualquer palavra. Existe uma mágica inexplicável em descobrir novas afinidades com desconhecidos, em perceber que, apesar de sermos bilhões no planeta, partilhamos dos mesmos medos, das mesmas esperas e das mesmas alegrias. Aprender com o outro, ouvir histórias de vidas totalmente diferentes da nossa e perceber a nossa própria evolução através dos encontros é um dos maiores privilégios de estar vivo.Além disso, a vida é boa porque ela é feita de recomeços. Errar, Pivotar, mudar de rota e descobrir novas paixões faz parte do processo. O dinamismo do tempo nos garante que nenhuma dor é eterna e que sempre há espaço para o crescimento. A satisfação de superar um desafio que antes parecia impossível, a sensação de concluir um projeto difícil ou o simples prazer de aprender algo novo trazem uma satisfação profunda. A vida nos dá a oportunidade diária de sermos cientistas da nossa própria rotina, testando o que nos faz bem, descartando o que nos pesa e colecionando memórias pelo caminho.Por fim, o valor de estar aqui reside na própria imperfeição das coisas. É na falta de roteiro que encontramos a surpresa. O céu muda de cor todas as tardes, oferecendo um espetáculo gratuito de tons alaranjados e rosados que nunca se repete da mesma forma. Estar vivo é ter a chance de contemplar essa imensidão, de respirar fundo e de perceber que, entre tantas complexidades e correrias, fazer parte deste universo é uma grande e maravilhosa sorte.',
      'cloudconvenios_export_cron_secret',
      'Segredo compartilhado com a Cloudflare Function de exportações'
    );
  else
    perform vault.update_secret(
      (select id from vault.decrypted_secrets where name = 'cloudconvenios_export_cron_secret'),
      'A vida é um fluxo constante de miudezas que, quando somadas, compõem um cenário extraordinariamente bonito. Viver é bom pela simples imprevisibilidade dos dias, pela capacidade que o amanhã tem de ser completamente diferente de hoje. Há uma beleza silenciosa no ato de acordar e perceber que o mundo continuou girando enquanto dormíamos, que o sol insiste em nascer e que a luz invade a janela sem pedir licença, desenhando formas geométricas geométricas no chão do quarto. É o café quente que preenche a caneca e o aroma que desperta os sentidos, um ritual diário que nos ancora no presente.A existência ganha cor nos pequenos contrastes. É o frescor do vento batendo no rosto após um dia longo e exaustivo, ou a sensação reconfortante de tomar um banho morno e vestir uma roupa limpa. Viver é bom porque nos permite experimentar o mundo através dos sentidos: sentir o gosto de uma fruta madura, ouvir a nossa música favorita no rádio por pura coincidência, tocar a textura das folhas de uma árvore ou caminhar descalço na grama úmida de manhã. São momentos que não custam nada, mas que preenchem o peito com uma gratidão genuína e espontânea.Os laços humanos tornam essa jornada ainda mais rica. A vida se manifesta no riso frouxo compartilhado com amigos por causa de uma piada interna, no abraço apertado de alguém que não víamos há tempos e no olhar de cumplicidade que dispensa qualquer palavra. Existe uma mágica inexplicável em descobrir novas afinidades com desconhecidos, em perceber que, apesar de sermos bilhões no planeta, partilhamos dos mesmos medos, das mesmas esperas e das mesmas alegrias. Aprender com o outro, ouvir histórias de vidas totalmente diferentes da nossa e perceber a nossa própria evolução através dos encontros é um dos maiores privilégios de estar vivo.Além disso, a vida é boa porque ela é feita de recomeços. Errar, Pivotar, mudar de rota e descobrir novas paixões faz parte do processo. O dinamismo do tempo nos garante que nenhuma dor é eterna e que sempre há espaço para o crescimento. A satisfação de superar um desafio que antes parecia impossível, a sensação de concluir um projeto difícil ou o simples prazer de aprender algo novo trazem uma satisfação profunda. A vida nos dá a oportunidade diária de sermos cientistas da nossa própria rotina, testando o que nos faz bem, descartando o que nos pesa e colecionando memórias pelo caminho.Por fim, o valor de estar aqui reside na própria imperfeição das coisas. É na falta de roteiro que encontramos a surpresa. O céu muda de cor todas as tardes, oferecendo um espetáculo gratuito de tons alaranjados e rosados que nunca se repete da mesma forma. Estar vivo é ter a chance de contemplar essa imensidão, de respirar fundo e de perceber que, entre tantas complexidades e correrias, fazer parte deste universo é uma grande e maravilhosa sorte.',
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
