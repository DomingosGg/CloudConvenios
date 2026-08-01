# Sistema completo — versão 7.1

> Inclui correção da gestão de usuários e consulta automática de CNPJ. Veja `CORRECAO-USUARIOS-CNPJ.md`.

# Sistema de Gestão de Renovações de Convênios

Este é o pacote **completo e consolidado** do sistema, pronto para ser colocado na raiz do repositório GitHub conectado ao Netlify.

## Estrutura principal

- `index.html` — página principal, já na raiz
- `404.html` — página de contingência
- `netlify.toml` — configuração do Netlify
- `css/` — estilos completos
- `js/` — aplicação completa
- `netlify/functions/` — funções `users-admin` e `cnpj-lookup`
- `modelo/` — planilha-modelo de importação
- `supabase/` — SQL atual e histórico de recuperação

## Publicação no GitHub

1. Extraia o ZIP.
2. Abra o repositório conectado ao Netlify.
3. Substitua os arquivos da raiz pelos arquivos deste pacote.
4. Confirme o commit.
5. Aguarde o deploy automático do Netlify.

O `index.html` já está diretamente na raiz. Não mova arquivos entre pastas.

## Variáveis necessárias no Netlify

Mantenha configuradas:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

A chave secreta deve permanecer somente nas variáveis de ambiente do Netlify.

## Banco de dados

Para atualizar um banco que já estava funcionando até a Etapa 6, execute somente:

- `supabase/etapa-7-melhorias.sql`

A pasta `supabase/historico/` contém cópias dos scripts anteriores para recuperação e referência. **Não execute todos os scripts históricos em um banco já configurado**, salvo quando estiver reconstruindo um projeto novo e souber a ordem adequada.

## Funções esperadas no Netlify

Após o deploy, devem aparecer em **Logs & metrics → Functions**:

- `users-admin`
- `cnpj-lookup`

## Recursos incluídos

- Login e perfis Administrador/Operador
- Permissões por perfil
- Cadastro, edição e gestão de concedentes
- Kanban de renovações
- Histórico de contatos
- Relatórios
- Auditoria administrativa
- Exclusão controlada de auditorias
- Notificações individuais
- Gestão de usuários
- Consulta automática de CNPJ em múltiplas APIs gratuitas
- Importação avançada por CSV/XLS/XLSX
- Identidade visual roxa, amarela e branca
