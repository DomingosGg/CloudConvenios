# Checklist de publicação no Cloudflare Pages

## GitHub

- [ ] O conteúdo deste pacote foi enviado diretamente à raiz do novo repositório.
- [ ] `index.html`, `functions/`, `_routes.json`, `_headers` e `_redirects` aparecem na raiz.
- [ ] Não existem arquivos `.env`, `.dev.vars` ou chaves administrativas no repositório.

## Cloudflare Pages

- [ ] Repositório e branch principal conectados.
- [ ] Framework preset definido como `None`.
- [ ] Build command vazio.
- [ ] Build output directory definido como `.`.
- [ ] Variável `SUPABASE_URL` cadastrada.
- [ ] Segredo `SUPABASE_SECRET_KEY` cadastrado.
- [ ] Novo deploy executado após salvar as variáveis.

## Supabase

- [ ] Site URL alterada para o novo domínio.
- [ ] Redirect URL adicionada no formato `https://SEU-PROJETO.pages.dev/**`.
- [ ] O banco atual foi mantido sem reinstalação.

## Validação

- [ ] `/api/health` responde com `platform: cloudflare-pages`.
- [ ] `/api/users-admin` responde com `ready: true`.
- [ ] Login do administrador funciona.
- [ ] Login dos operadores funciona.
- [ ] Gestão de usuários funciona.
- [ ] Consulta de CNPJ funciona ou permite preenchimento manual.
- [ ] Cadastros e contatos carregam do Supabase.
- [ ] Auditoria e notificações funcionam.
- [ ] Importação e exportação foram testadas.

Mantenha o Netlify ativo até todos os itens acima estarem concluídos.
