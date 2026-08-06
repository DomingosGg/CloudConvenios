# Relatório de validação — CloudConvênios V8.9.2

Data da revisão: 5 de agosto de 2026.

## Verificações concluídas

- `index.html` permanece na raiz do pacote.
- Existe somente um arquivo `.sql` no projeto.
- O SQL não contém `DROP TABLE`.
- O SQL possui transações balanceadas e delimitadores de funções fechados.
- Todas as tabelas consultadas pelo JavaScript estão previstas no SQL único.
- Todas as funções RPC chamadas pela aplicação estão previstas no SQL único.
- Os 16 arquivos JavaScript passaram em `node --check`.
- Os blocos JavaScript embutidos no `index.html` passaram em `node --check`.
- Os arquivos JSON foram analisados com sucesso.
- `_routes.json`, `_headers` e `functions/api/` permanecem na estrutura do Cloudflare Pages.
- A planilha `modelo/modelo_importacao_convenios.xlsx` foi preservada.

## Regra de CNPJ

A instalação não recria índices antigos por CNPJ isolado. A restrição definitiva é aplicada ao par:

- CNPJ normalizado;
- marca (`Uniasselvi` ou `Unicesumar`).

O mesmo CNPJ pode existir em marcas diferentes, mas não pode se repetir dentro da mesma marca.

## Limite desta validação

A revisão foi feita sobre o código e o pacote fornecido. O SQL não foi executado diretamente no projeto Supabase de produção, pois o pacote não contém credenciais administrativas do banco. Antes da execução, mantenha um backup do projeto atual.
