# Changelog

## V8.9.2 — 5 de agosto de 2026

- Consolidou toda a estrutura do Supabase em um único arquivo SQL oficial.
- Removeu os scripts históricos e cumulativos que causavam dúvida de ordem de execução.
- Eliminou a recriação temporária da unicidade por CNPJ isolado.
- Manteve a regra correta de duplicidade por CNPJ normalizado + marca.
- Atualizou os identificadores de versão do site e das Cloudflare Pages Functions.
- Atualizou o endpoint `/api/version`, que ainda informava a versão 8.4.0.
- Adicionou documentação única para Supabase, GitHub e Cloudflare Pages.
- Preservou a estrutura de publicação com `index.html` na raiz.
