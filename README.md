# CloudConvênios V8.9.2

Sistema de acompanhamento e gestão de renovações de convênios, publicado no Cloudflare Pages e conectado ao Supabase.

## Estrutura oficial

- `index.html` permanece na raiz para publicação no Cloudflare Pages.
- `functions/api/` contém as Pages Functions.
- `supabase/SQL-UNICO-CLOUDCONVENIOS-V8.9.2.sql` é o **único SQL oficial** do projeto.
- `modelo/` contém a planilha padrão de importação.
- `docs/GUIA-SUPABASE-E-GITHUB.md` contém o passo a passo de atualização.

## Regra de atualização do Supabase

Não execute scripts SQL antigos. Abra uma única página no SQL Editor e execute integralmente:

`supabase/SQL-UNICO-CLOUDCONVENIOS-V8.9.2.sql`

O script é cumulativo e foi preparado para instalação nova ou reconciliação do banco atual, preservando os dados operacionais.

## Publicação

Envie o conteúdo desta pasta para a raiz da branch `main`. Não crie uma pasta adicional em volta do `index.html`.

## Variáveis do Cloudflare Pages

Consulte `docs/GUIA-SUPABASE-E-GITHUB.md`. Nunca publique a chave secreta do Supabase nem o `EXPORT_CRON_SECRET` no GitHub.
