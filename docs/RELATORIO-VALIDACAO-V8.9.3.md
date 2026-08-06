# Relatório de validação — CloudConvênios V8.9.3

## Estrutura

- `index.html` confirmado na raiz.
- Pages Functions mantidas em `functions/api/`.
- Um único SQL oficial em `supabase/SQL-UNICO-CLOUDCONVENIOS-V8.9.3.sql`.
- Nenhuma chave secreta adicionada ao pacote.

## Dashboard

- Dez indicadores na sequência solicitada.
- Seleção por clique com destaque visual e botão para limpar.
- Gráficos por situação, estado, polo e lista de vencimentos usam a seleção ativa.
- Filtros de marca e região são combinados com o indicador selecionado.
- Resumo duplicado Uniasselvi/Unicesumar removido.

## Região

- Norte: AC, AM, AP, PA, RO, RR e TO.
- Nordeste: AL, BA, CE, MA, PB, PE, PI, RN e SE.
- Centro-Oeste: DF, GO, MS e MT.
- Sudeste: ES, MG, RJ e SP.
- Sul: PR, RS e SC.

## Compatibilidade

Os nomes técnicos `concedentes` e `concedente_id` foram preservados no Supabase e no código de integração. A alteração para “Convênios” ocorre somente na interface e nos textos de apresentação.
