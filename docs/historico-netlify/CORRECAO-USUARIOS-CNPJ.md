# Correção 7.1 — Usuários e consulta de CNPJ

## Alterações

- A página Usuários agora verifica automaticamente se a função `users-admin` foi publicada e se as variáveis do Supabase estão corretas.
- A tela mostra uma mensagem objetiva quando `SUPABASE_URL` ou `SUPABASE_SECRET_KEY` estiver ausente ou incorreta.
- Compatibilidade com chave moderna `sb_secret_` e chave legada `service_role`.
- Criação de usuário passa a fazer `upsert` do perfil público, evitando usuários criados no Auth sem registro na tabela `usuarios`.
- A listagem reconcilia usuários do Supabase Auth com os perfis públicos.
- A consulta de CNPJ não depende mais obrigatoriamente da chave secreta do Supabase.
- Fallback de consulta no navegador quando a função do Cloudflare Pages estiver indisponível.
- Fontes no servidor: BrasilAPI, OpenCNPJ, CNPJá pública, Minha Receita e ReceitaWS.
- Falha das APIs não marca o CNPJ como inválido nem impede o preenchimento manual.
- Colar valores com o prefixo `CNPJ:` passa a ser aceito corretamente.

## Publicação

Substitua todo o conteúdo da raiz do GitHub por este pacote e aguarde o deploy do Netlify.

No Netlify, mantenha:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` com uma chave que comece por `sb_secret_`

Depois do deploy, abra **Usuários**. A faixa de diagnóstico deverá ficar verde.
