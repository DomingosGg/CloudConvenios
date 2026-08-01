# Correção das Netlify Functions

Este pacote usa a configuração atual da pasta de funções:

```toml
[build]
  publish = "."

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```

Depois de enviar todo o conteúdo para a raiz do GitHub:

1. No Netlify, confirme que o Base directory está vazio.
2. Confirme Publish directory como `.`.
3. Confirme Functions directory como `netlify/functions`.
4. Execute **Deploy project without cache**.
5. Em **Logs & metrics > Functions**, confirme estas funções:
   - `ping`
   - `users-admin`
   - `cnpj-lookup`

Teste:

- `/.netlify/functions/ping`
- `/api/users-admin`

A função `users-admin` deve responder JSON com `ok: true`.
