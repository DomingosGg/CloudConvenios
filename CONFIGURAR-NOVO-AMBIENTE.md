# Novo GitHub e Supabase — instalação completa

## GitHub

Envie **todo o conteúdo desta pasta** para a raiz do novo repositório. O arquivo `index.html` já está na raiz.

## Supabase

### Mesmo projeto Supabase
Não execute novamente o banco se tudo já está funcionando. Apenas mantenha o `js/supabase-config.js` e configure no Netlify as variáveis `SUPABASE_URL` e `SUPABASE_SECRET_KEY`.

### Novo projeto Supabase
1. Abra **SQL Editor > New query**.
2. Execute `supabase/INSTALACAO-COMPLETA-SUPABASE.sql` integralmente.
3. Crie o primeiro usuário em **Authentication > Users**.
4. Edite o e-mail em `supabase/PRIMEIRO-ADMINISTRADOR.sql` e execute.
5. Atualize `js/supabase-config.js` com a URL e a chave pública/anon do novo projeto.
6. No Netlify, configure `SUPABASE_URL` e `SUPABASE_SECRET_KEY`.
7. Faça um novo deploy.

## Funções já incluídas
- `netlify/functions/users-admin.js`
- `netlify/functions/cnpj-lookup.js`
- Funções SQL de permissões, auditoria, exclusão controlada, último acesso, diagnóstico e promoção do administrador.

Nunca publique a `SUPABASE_SECRET_KEY` no GitHub ou nos arquivos JavaScript do site.
