# Leia antes de publicar

Este pacote deve ser publicado como **Cloudflare Pages com integração ao GitHub**, e não como Cloudflare Worker.

## Arquivos que não devem existir no repositório

- `_redirects`
- `wrangler.json`
- `wrangler.jsonc`
- `wrangler.toml`

A antiga regra `/* /index.html 200` foi removida porque o Cloudflare já trata `index.html` automaticamente e a regra causava um ciclo infinito.

## Configuração correta no Cloudflare

1. Acesse **Workers & Pages**.
2. Crie uma nova aplicação do tipo **Pages**.
3. Escolha **Connect to Git** e selecione o repositório.
4. Framework preset: `None`.
5. Build command: deixe vazio.
6. Build output directory: `.`.
7. Root directory: deixe vazio.
8. Não informe comando de deploy com `wrangler deploy`.

## Variáveis e segredos

Cadastre em **Settings > Variables and Secrets**:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` como segredo criptografado

Depois salve e execute um novo deploy.

## Testes

- `/api/health`
- `/api/users-admin`
- login do administrador
- login dos operadores
- gestão de usuários
- consulta de CNPJ

A pasta `functions/` precisa permanecer na raiz do projeto. Ela é convertida automaticamente em Pages Functions.
