# Guia de atualização — Supabase, GitHub e Cloudflare Pages

## 1. Faça um backup antes da atualização

No Supabase, exporte os dados ou confirme que o backup do projeto está disponível. O SQL V8.9.2 não contém comandos `DROP TABLE`, mas o backup continua recomendado antes de qualquer alteração estrutural.

## 2. Atualize o Supabase usando uma única página

1. Acesse **Supabase > SQL Editor**.
2. Crie uma consulta nova.
3. Abra `supabase/SQL-UNICO-CLOUDCONVENIOS-V8.9.2.sql`.
4. Copie o arquivo inteiro e cole na consulta.
5. Clique em **Run** apenas uma vez.
6. Confirme que o resultado final contém `CloudConvênios V8.9.2 instalado`.

Não execute os arquivos SQL das versões anteriores. Eles foram removidos deste pacote justamente para evitar instalação parcial ou fora de ordem.

### Primeiro administrador em projeto novo

Depois de criar o usuário em **Authentication > Users**, execute em uma nova consulta:

```sql
select public.promover_administrador_por_email('SEU_EMAIL@EMPRESA.COM.BR');
```

Em um projeto já existente, os administradores atuais são preservados.

## 3. Variáveis necessárias no Cloudflare Pages

Em **Cloudflare > Workers & Pages > seu projeto > Settings > Variables and Secrets**, mantenha:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` como segredo
- `EXPORT_CRON_SECRET` como segredo, quando a exportação automática estiver ativa

Nunca coloque `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `EXPORT_CRON_SECRET` no GitHub.

## 4. Exportação automática diária às 18h

O banco e o bucket `exportacoes` são preparados pelo SQL único. O agendamento via Supabase Cron depende de um segredo compartilhado com o Cloudflare e não pode ser publicado dentro do ZIP.

Caso o agendamento atual já esteja funcionando, ele pode ser mantido. Para recriá-lo, use o endereço definitivo do site e o mesmo valor de `EXPORT_CRON_SECRET` configurado no Cloudflare.

## 5. Atualize o GitHub

1. Extraia o ZIP.
2. Abra a pasta `CloudConvenios-V8.9.2-GitHub-Cloudflare`.
3. Copie **o conteúdo interno da pasta** para a raiz do repositório.
4. Confirme que `index.html`, `_headers`, `_routes.json`, `functions/` e `supabase/` estão na raiz.
5. Faça commit e push para a branch `main`.

Exemplo com Git:

```bash
git add .
git commit -m "Release V8.9.2 - Supabase em SQL único"
git push origin main
```

## 6. Valide a publicação

Após o deploy automático do Cloudflare Pages, confira:

- `/api/health`
- `/api/version`
- login e MFA
- carregamento das concedentes
- cadastro do mesmo CNPJ em marcas diferentes
- cadastro bloqueado para o mesmo CNPJ e a mesma marca
- acesso do operador sem Configurações, Excluir, Importar, Exportar e Backup
- histórico de downloads e auditoria

## 7. Arquivos que não devem retornar ao projeto

Não recoloque pastas de backup, scripts SQL históricos, `.git` de outro repositório, arquivos `.env`, `.dev.vars` ou chaves secretas.
