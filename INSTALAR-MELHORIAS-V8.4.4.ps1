
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms

function Pause-End {
  Write-Host ""
  Read-Host "Pressione ENTER para fechar"
}

function Find-Git {
  $cmd = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $patterns = @(
    "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe",
    "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\mingw64\bin\git.exe",
    "$env:ProgramFiles\Git\cmd\git.exe",
    "${env:ProgramFiles(x86)}\Git\cmd\git.exe"
  )

  foreach ($pattern in $patterns) {
    $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($found) { return $found.FullName }
  }

  return $null
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " CLOUDCONVENIOS V8.4.4 — SEGURANÇA E IMPORTAÇÃO INTELIGENTE" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Selecione a pasta CloudConvenios aberta pelo GitHub Desktop." -ForegroundColor Yellow

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Selecione a pasta CloudConvenios que contém a pasta .git"
$dialog.ShowNewFolderButton = $false

if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
  Write-Host "Operação cancelada." -ForegroundColor Yellow
  Pause-End
  exit 0
}

$repo = $dialog.SelectedPath
$payload = Join-Path $PSScriptRoot "ARQUIVOS-CORRIGIDOS"

if (-not (Test-Path (Join-Path $repo ".git"))) {
  Write-Host "ERRO: a pasta selecionada não contém .git." -ForegroundColor Red
  Write-Host "Use GitHub Desktop > Show in Explorer e selecione exatamente a pasta aberta." -ForegroundColor Yellow
  Pause-End
  exit 1
}

$indexPath = Join-Path $repo "index.html"
$appPath = Join-Path $repo "js\app.js"
$functionPath = Join-Path $repo "functions\api\admin-data.js"

if (-not (Test-Path $indexPath) -or -not (Test-Path $appPath)) {
  Write-Host "ERRO: index.html ou js\app.js não foi encontrado." -ForegroundColor Red
  Pause-End
  exit 1
}

$backup = Join-Path (Split-Path -Parent $repo) (
  (Split-Path -Leaf $repo) + "-BACKUP-V8.4.4-" + (Get-Date -Format "yyyyMMdd-HHmmss")
)

New-Item -ItemType Directory -Force -Path (Join-Path $backup "js") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backup "functions\api") | Out-Null

Copy-Item $indexPath (Join-Path $backup "index.html") -Force
Copy-Item $appPath (Join-Path $backup "js\app.js") -Force
if (Test-Path $functionPath) {
  Copy-Item $functionPath (Join-Path $backup "functions\api\admin-data.js") -Force
}

Write-Host ""
Write-Host "Copiando o código atualizado..." -ForegroundColor Cyan
Copy-Item (Join-Path $payload "js\app.js") $appPath -Force
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $functionPath) | Out-Null
Copy-Item (Join-Path $payload "functions\api\admin-data.js") $functionPath -Force

$index = Get-Content $indexPath -Raw -Encoding UTF8

# Remove a área de demonstração.
$demoPattern = '(?s)\s*<div class="card"><div class="card-title"><h3>Dados de demonstração</h3>.*?(?=<div class="card"><div class="card-title"><h3>Banco de dados online</h3>)'
$index = [regex]::Replace($index, $demoPattern, '', 1)

# Atualiza o cartão de exclusão total.
$storagePattern = '(?s)<div class="card"><div class="card-title"><h3>Armazenamento online</h3>.*?(?=<div class="card" id="migrationCard">)'
$storageReplacement = @'
<div class="card"><div class="card-title"><h3>Armazenamento online</h3></div><div class="setting-row"><div><strong>Registros sincronizados</strong><small id="storageSummary">0 concedentes e 0 contatos no Supabase.</small></div><span class="badge badge-success"><i class="fa-solid fa-cloud"></i>Online</span></div><div class="setting-row"><div><strong>Excluir todos os dados operacionais</strong><small>Exige a senha atual do administrador. Exclui concedentes e contatos, preservando usuários, permissões, configurações, auditoria e exportações.</small></div><button class="btn btn-danger" id="clearAllBtn"><i class="fa-solid fa-triangle-exclamation"></i>Excluir dados</button></div></div>
'@
$index = [regex]::Replace($index, $storagePattern, $storageReplacement, 1)

# A importação passa a enriquecer campos vazios obrigatoriamente.
$index = $index.Replace(
  'Importe CSV, XLS ou XLSX com validação, prévia e complementação opcional por CNPJ.',
  'Importe CSV, XLS ou XLSX com validação, prévia e preenchimento automático dos campos ausentes pelo CNPJ.'
)

$enrichPattern = '(?s)<label class="switch-row import-enrich-option">.*?</label>'
$enrichReplacement = @'
<label class="switch-row import-enrich-option import-enrich-required"><input id="importEnrichCnpj" type="checkbox" checked disabled /><span class="switch-control"></span><span><strong>Completar automaticamente os campos vazios pelo CNPJ</strong><small>Inclui Razão Social, Nome Fantasia, situação cadastral, natureza jurídica, CNAE, endereço, telefone e e-mail quando disponíveis nas fontes públicas.</small></span></label>
'@
$index = [regex]::Replace($index, $enrichPattern, $enrichReplacement, 1)

# Modal protegido por senha.
if (-not $index.Contains('id="clearAllPasswordModalBackdrop"')) {
  $confirmBlock = '<div class="modal-backdrop" id="confirmModalBackdrop" aria-hidden="true"><div class="modal sm"><div class="modal-header"><h3 id="confirmTitle">Confirmar ação</h3><button class="icon-btn" data-close="confirmModalBackdrop"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><p id="confirmMessage" style="margin:0;line-height:1.6"></p></div><div class="modal-footer"><button class="btn btn-secondary" data-close="confirmModalBackdrop">Cancelar</button><button class="btn btn-danger" id="confirmActionBtn">Confirmar</button></div></div></div>'

  $passwordModal = @'

  <div class="modal-backdrop" id="clearAllPasswordModalBackdrop" data-admin-only aria-hidden="true">
    <div class="modal sm" role="dialog" aria-modal="true" aria-labelledby="clearAllPasswordTitle">
      <div class="modal-header">
        <div><h3 id="clearAllPasswordTitle">Excluir dados operacionais</h3><p class="modal-subtitle">Confirmação protegida pela senha atual do administrador.</p></div>
        <button class="icon-btn" type="button" data-close="clearAllPasswordModalBackdrop" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="clearAllPasswordForm" novalidate>
        <div class="modal-body">
          <div class="summary-box audit-delete-warning"><i class="fa-solid fa-triangle-exclamation"></i><span>Serão excluídos permanentemente todos os cadastros de concedentes e seus contatos. Usuários, permissões, configurações, auditoria e histórico de exportações serão preservados.</span></div>
          <div class="field">
            <label>Senha atual do administrador <span class="required">*</span></label>
            <div class="password-field">
              <input class="form-control" id="clearAllPassword" type="password" autocomplete="current-password" maxlength="256" required />
              <button class="password-toggle" id="clearAllPasswordToggle" type="button" aria-label="Mostrar senha"><i class="fa-regular fa-eye"></i></button>
            </div>
            <span class="field-hint">A senha é enviada somente à Function segura para validação no Supabase e não é armazenada.</span>
          </div>
          <label class="check-option clear-all-acknowledge"><input id="clearAllAcknowledge" type="checkbox" required /> Estou ciente de que esta exclusão é permanente.</label>
          <div class="auth-message hidden" id="clearAllPasswordError"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" type="button" data-close="clearAllPasswordModalBackdrop">Cancelar</button>
          <button class="btn btn-danger" id="clearAllConfirmBtn" type="submit"><i class="fa-solid fa-trash"></i>Excluir dados</button>
        </div>
      </form>
    </div>
  </div>
'@

  if (-not $index.Contains($confirmBlock)) {
    throw "Não foi possível localizar o modal de confirmação para inserir a proteção por senha."
  }

  $index = $index.Replace($confirmBlock, $confirmBlock + $passwordModal)
}

# Substitui somente o módulo app.js incorporado ao index.
$app = Get-Content $appPath -Raw -Encoding UTF8
$appMarker = "/* ===== app.js ===== */"
$appStart = $index.IndexOf($appMarker)
$scriptEnd = $index.IndexOf("  </script>", $appStart)

if ($appStart -lt 0 -or $scriptEnd -le $appStart) {
  throw "Não foi possível localizar o módulo app.js incorporado ao index.html."
}

$index = $index.Substring(0, $appStart) +
  $appMarker + "`r`n" + $app.Trim() + "`r`n" +
  $index.Substring($scriptEnd)

# Versão e limpeza de cache.
$index = [regex]::Replace(
  $index,
  '<meta name="app-version" content="[^"]*"\s*/>',
  '<meta name="app-version" content="8.4.4" />'
)

$index = [regex]::Replace(
  $index,
  "window\.__CONVENIOS_BUILD__\s*=\s*'[^']*';",
  "window.__CONVENIOS_BUILD__ = '8.4.4-security-import';"
)

$index = [regex]::Replace(
  $index,
  'id="releaseMarkerV[^"]*" data-version="[^"]*"',
  'id="releaseMarkerV844" data-version="8.4.4"'
)

Set-Content $indexPath $index -Encoding UTF8
Set-Content (Join-Path $repo "VERSAO.txt") `
  "8.4.4 - Remoção da demonstração, exclusão protegida por senha e importação automática pelo CNPJ" `
  -Encoding UTF8

$buildInfoPath = Join-Path $repo "build-info.json"
$buildInfo = @{
  version = "8.4.4"
  release = "security-import-enhancements"
  features = @{
    dados_demonstracao_removidos = $true
    exclusao_total_com_senha_administrador = $true
    preserva_usuarios_permissoes_configuracoes_auditoria = $true
    importacao_completa_campos_vazios_por_cnpj = $true
    importacao_cnae_automatico = $true
  }
}
$buildInfo | ConvertTo-Json -Depth 6 |
  Set-Content $buildInfoPath -Encoding UTF8

Write-Host "Validando a atualização..." -ForegroundColor Cyan

$indexCheck = Get-Content $indexPath -Raw -Encoding UTF8
$appCheck = Get-Content $appPath -Raw -Encoding UTF8
$functionCheck = Get-Content $functionPath -Raw -Encoding UTF8

$validations = @(
  @{ Content = $indexCheck; Text = '8.4.4-security-import'; Label = 'Versão V8.4.4' },
  @{ Content = $indexCheck; Text = 'id="clearAllPasswordModalBackdrop"'; Label = 'Modal com senha administrativa' },
  @{ Content = $indexCheck; Text = 'Completar automaticamente os campos vazios pelo CNPJ'; Label = 'Importação automática' },
  @{ Content = $appCheck; Text = 'CNPJ_FILL_FIELDS.some'; Label = 'Consulta de todos os campos vazios, incluindo CNAE' },
  @{ Content = $appCheck; Text = "fetch('/api/admin-data'"; Label = 'Exclusão pela Function protegida' },
  @{ Content = $functionCheck; Text = "grant_type=password"; Label = 'Validação da senha no Supabase' },
  @{ Content = $functionCheck; Text = "payload.aal !== 'aal2'"; Label = 'Confirmação de MFA' }
)

foreach ($validation in $validations) {
  if (-not $validation.Content.Contains($validation.Text)) {
    throw "Falha na validação: $($validation.Label)"
  }
  Write-Host " [OK] $($validation.Label)" -ForegroundColor Green
}

if (
  $indexCheck.Contains('<h3>Dados de demonstração</h3>') -or
  $appCheck.Contains('deleteDemoBtn') -or
  $appCheck.Contains('reloadDemoBtn')
) {
  throw "A área de demonstração ainda foi encontrada após a atualização."
}

Write-Host " [OK] Dados de demonstração removidos" -ForegroundColor Green

$git = Find-Git
$pushOk = $false

if ($git) {
  Write-Host ""
  Write-Host "Criando commit e enviando ao GitHub..." -ForegroundColor Cyan
  & $git -C $repo add -A
  & $git -C $repo commit -m "Implementar segurança e importação automática V8.4.4"

  if ($LASTEXITCODE -eq 0) {
    & $git -C $repo push origin main
    if ($LASTEXITCODE -eq 0) {
      $pushOk = $true
    }
  }
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " CLOUDCONVENIOS V8.4.4 INSTALADO E VALIDADO" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green

if (-not $pushOk) {
  Write-Host ""
  Write-Host "Conclua no GitHub Desktop:" -ForegroundColor Yellow
  Write-Host "1. Summary: Implementar segurança e importação automática V8.4.4"
  Write-Host "2. Commit to main"
  Write-Host "3. Push origin"
} else {
  Write-Host "Commit e Push origin concluídos automaticamente." -ForegroundColor Green
}

Write-Host ""
Write-Host "Após o deploy verde no Cloudflare:" -ForegroundColor Cyan
Write-Host "1. Pressione Ctrl + F5."
Write-Host "2. Confira que Dados de demonstração não aparece em Configurações."
Write-Host "3. Teste a importação com a coluna CNAE vazia e um CNPJ válido."
Write-Host "4. Em Configurações, Excluir dados deverá solicitar a senha atual."
Write-Host ""
Write-Host "Não é necessário executar SQL nem alterar variáveis do Cloudflare." -ForegroundColor Yellow
Write-Host "Backup: $backup" -ForegroundColor DarkGray

try {
  Start-Process "https://cloudconvenios.pages.dev/api/admin-data"
} catch {}

Pause-End
