# Atualização V8 — CloudConvenios

Esta versão inclui:

1. Correção da página de usuários para renovar automaticamente sessões JWT antigas e utilizar a chave publicável correta na validação.
2. Edição de registros do histórico de contatos.
3. Rolagem horizontal do Kanban pela roda do mouse e pelo arraste do fundo do quadro.
4. Coluna **Dias restantes** na página de concedentes e nas exportações.
5. Validação obrigatória por aplicativo autenticador (TOTP) depois do e-mail e da senha.
6. Exportações em Excel, histórico de downloads, armazenamento privado dos arquivos e novo modelo de importação.
7. Exportação automática diária às 18:00 para a pasta privada `exportacoes/automaticas` do Supabase Storage.

## Ordem recomendada de instalação

### 1. Atualizar o Supabase

No painel do Supabase, abra **SQL Editor → New query**, copie todo o conteúdo de:

`supabase/ATUALIZACAO-8-AJUSTES.sql`

Execute o código. O resultado final deve indicar a versão:

`v1.1-ajustes-cloudflare`

### 2. Configurar as variáveis do Cloudflare Pages

Abra **Cloudflare → Workers & Pages → cloudconvenios → Settings → Variables and Secrets**.

Mantenha as variáveis atuais e confirme estas quatro:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` — segredo criptografado
- `SUPABASE_PUBLISHABLE_KEY` — copie a chave pública existente em `js/supabase-config.js`
- `EXPORT_CRON_SECRET` — crie um texto secreto forte e exclusivo

O valor de `EXPORT_CRON_SECRET` não deve ser colocado no GitHub nem em arquivos públicos.

### 3. Publicar os arquivos

Use o instalador entregue com o pacote, selecione a pasta local `CloudConvenios`, depois no GitHub Desktop:

1. Escreva no campo **Summary**: `Atualização V8 do CloudConvenios`.
2. Clique em **Commit to main**.
3. Clique em **Push origin**.
4. Aguarde o novo deploy ficar verde no Cloudflare Pages.

### 4. Programar a exportação das 18:00

Abra o arquivo:

`supabase/CONFIGURAR-EXPORTACAO-AUTOMATICA.sql`

Substitua todas as ocorrências de:

`SUBSTITUA_POR_UM_SEGREDO_FORTE`

pelo mesmo valor cadastrado em `EXPORT_CRON_SECRET` no Cloudflare.

Depois execute o arquivo no SQL Editor do Supabase. A rotina será programada para **21:00 UTC**, correspondente a **18:00 no horário de Brasília (UTC-3)**.

## Primeiro acesso após a atualização

No próximo login, cada usuário deverá:

1. Informar e-mail e senha.
2. Escanear o QR Code com Microsoft Authenticator, Google Authenticator, 1Password, Authy ou aplicativo TOTP compatível.
3. Informar o código de seis dígitos.

Nos acessos seguintes, o sistema solicitará apenas o código atual do aplicativo depois da senha.

Se um usuário perder o acesso ao autenticador, o fator poderá ser removido no painel do Supabase em **Authentication → Users → usuário → MFA factors**.

## Exportações e pasta automática

Os downloads manuais em Excel e o modelo de importação passam a ser registrados na tela:

**Configurações → Histórico de exportações e downloads**

As exportações automáticas são armazenadas na pasta privada:

`Supabase Storage → exportacoes → automaticas`

Um site executado no navegador não pode gravar sozinho todos os dias em uma pasta local do Windows, principalmente quando o computador ou navegador estiver fechado. Por isso, a sincronização automática foi implementada em uma pasta online privada e confiável. Os arquivos podem ser baixados novamente pelo histórico do sistema.

## Testes recomendados

- Entrar com e-mail, senha e código TOTP.
- Abrir a página Usuários e clicar em Atualizar.
- Editar um contato existente.
- Usar a roda do mouse na tela de Renovações.
- Conferir a coluna Dias restantes.
- Exportar uma planilha e conferir o histórico.
- Baixar o novo modelo de importação.
- Testar `https://cloudconvenios.pages.dev/api/health`.
- Testar `https://cloudconvenios.pages.dev/api/users-admin`.
