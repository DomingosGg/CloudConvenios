# Correção de inicialização do login

Esta versão corrige o travamento em **Verificando acesso**.

## Alterações

- Os módulos JavaScript próprios do sistema também estão incorporados ao `index.html`.
- A tela de login é exibida automaticamente se a validação inicial demorar.
- A inicialização funciona mesmo quando o evento `DOMContentLoaded` já ocorreu.
- Os arquivos separados da pasta `js/` continuam incluídos para manutenção.

## Publicação

Envie todo o conteúdo deste pacote para a raiz do repositório e aguarde o deploy do Netlify. Não é necessário executar novamente o SQL do Supabase.
