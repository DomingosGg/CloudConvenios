# Sistema de Gestão de Renovações de Convênios

Versão preparada para publicação no **Cloudflare Pages**, com banco de dados e autenticação no **Supabase**.

## Arquivos que devem ficar na raiz do repositório

- `index.html`
- `404.html`
- `css/`
- `js/`
- `functions/`
- `modelo/`
- `supabase/`
- `_headers`
- `_redirects`
- `_routes.json`

## Configuração do Cloudflare Pages

1. Conecte este repositório em **Workers & Pages → Create → Pages → Connect to Git**.
2. Framework preset: `None`.
3. Build command: deixe vazio.
4. Build output directory: `.`.
5. Em **Settings → Variables and Secrets**, cadastre:
   - `SUPABASE_URL` como variável;
   - `SUPABASE_SECRET_KEY` como segredo.
6. Execute um novo deploy depois de salvar as variáveis.

## Testes após a publicação

Abra os endereços abaixo, substituindo pelo domínio do projeto:

- `/api/health`
- `/api/users-admin`

Depois, teste no sistema:

- login;
- listagem, criação e edição de usuários;
- permissões de administrador e operador;
- consulta automática de CNPJ;
- cadastro, edição, auditoria e notificações;
- importação e exportação.

## Supabase existente

A migração de hospedagem não exige reinstalar o banco. Mantenha o mesmo projeto Supabase e não execute novamente `INSTALACAO-COMPLETA-SUPABASE.sql` quando o banco atual já estiver funcionando.

No Supabase, atualize **Authentication → URL Configuration** para o novo domínio `pages.dev` ou domínio próprio.

## Segurança

Nunca envie `SUPABASE_SECRET_KEY`, `.env` ou `.dev.vars` para o GitHub. A chave publicável usada no navegador pode permanecer em `js/supabase-config.js`, desde que as políticas RLS do banco estejam ativas.

Consulte `CHECKLIST-PUBLICACAO.md` antes de desativar o Netlify.
