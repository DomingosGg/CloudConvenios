# CloudConvênios V8.9.3

Sistema de acompanhamento e gestão de renovações de convênios, publicado no Cloudflare Pages e conectado ao Supabase.

## Alterações desta versão

- Dashboard com dez indicadores organizados em duas sequências.
- Indicadores clicáveis: a seleção passa a filtrar gráficos, distribuição por estado, distribuição por polo e vencimentos.
- Filtro global por região: Sul, Sudeste, Centro-Oeste, Nordeste e Norte.
- O filtro regional é aplicado aos painéis operacionais, incluindo Convênios, Renovações, Contatos, Minha fila, Calendário, Relatórios, Qualidade dos dados, Exceções e Metas.
- Remoção do quadro duplicado de resumo por marca do Dashboard.
- Padronização visual de “Concedentes” para “Convênios”, sem alterar os nomes técnicos das tabelas do Supabase.

## Estrutura oficial

- `index.html` permanece na raiz para publicação no Cloudflare Pages.
- `functions/api/` contém as Pages Functions.
- `supabase/SQL-UNICO-CLOUDCONVENIOS-V8.9.3.sql` é o único SQL oficial.
- `modelo/` contém a planilha padrão de importação.
- `docs/GUIA-SUPABASE-E-GITHUB.md` contém o passo a passo de atualização.

## Publicação

Extraia o ZIP e envie o conteúdo interno para a raiz da branch `main`. Não crie uma pasta adicional em volta do `index.html`.
