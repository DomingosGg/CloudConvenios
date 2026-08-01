# Sistema de Gestão de Renovações — Cloudflare Pages

Esta pasta está pronta para ser enviada à **raiz de um novo repositório GitHub** e conectada ao Cloudflare Pages.

## Estrutura principal

- `index.html` — aplicação principal
- `css/` e `js/` — interface e regras do sistema
- `functions/api/users-admin.js` — gestão administrativa de usuários
- `functions/api/cnpj-lookup.js` — consulta de CNPJ
- `functions/api/health.js` — diagnóstico do ambiente
- `_routes.json` — limita as Functions às rotas `/api/*`
- `_headers` — cabeçalhos de segurança e cache
- `modelo/` — modelo de importação, quando presente na origem
- `supabase/` — scripts SQL e referências do banco, quando presentes na origem

## Publicação

1. Envie **todo o conteúdo desta pasta** para a raiz do novo repositório.
2. No Cloudflare, crie um projeto Pages conectado ao repositório.
3. Use `None` como framework, deixe o comando de build vazio e use `.` como diretório de saída.
4. Em **Settings → Variables and Secrets**, cadastre:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` como segredo
5. Faça um novo deploy após cadastrar as variáveis.
6. Teste `https://SEU-DOMINIO.pages.dev/api/health`.
7. Atualize no Supabase as URLs de autenticação para o novo domínio.

## Banco existente

Ao continuar usando o mesmo projeto Supabase, não execute novamente a instalação completa e não apague dados. A troca do GitHub/Cloudflare não altera o banco.

## Segurança

Nunca publique `SUPABASE_SECRET_KEY`, arquivos `.env` ou `.dev.vars`. A chave pública/anon usada pelo navegador pode permanecer em `js/supabase-config.js`, desde que as políticas RLS estejam ativas.
