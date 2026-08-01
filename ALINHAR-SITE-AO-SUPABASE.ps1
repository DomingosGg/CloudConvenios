
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

$ProjectUrl = "https://uvsilamqohytjuzdjrok.supabase.co"
$ProjectRef = "uvsilamqohytjuzdjrok"
$ReleaseVersion = "8.4.1"

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

function Replace-Config {
  param(
    [string]$Path,
    [string]$PublishableKey
  )

  if (-not (Test-Path $Path)) {
    throw "Arquivo não encontrado: $Path"
  }

  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8

  $content = [regex]::Replace(
    $content,
    'SUPABASE_URL\s*:\s*"[^"]*"',
    ('SUPABASE_URL: "' + $ProjectUrl + '"')
  )

  $content = [regex]::Replace(
    $content,
    'SUPABASE_PUBLISHABLE_KEY\s*:\s*"[^"]*"',
    ('SUPABASE_PUBLISHABLE_KEY: "' + $PublishableKey + '"')
  )

  Set-Content -LiteralPath $Path -Value $content -Encoding UTF8
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " ALINHAR SITE AO SUPABASE CORRETO — CLOUDCONVENIOS V8.4.1" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Projeto Supabase de destino:" -ForegroundColor Yellow
Write-Host $ProjectUrl -ForegroundColor Green
Write-Host ""

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Selecione a pasta CloudConvenios aberta pelo GitHub Desktop"
$dialog.ShowNewFolderButton = $false

if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
  Write-Host "Operação cancelada." -ForegroundColor Yellow
  Pause-End
  exit 0
}

$repo = $dialog.SelectedPath

if (-not (Test-Path (Join-Path $repo ".git"))) {
  Write-Host "ERRO: a pasta escolhida não contém .git." -ForegroundColor Red
  Write-Host "No GitHub Desktop, clique em Show in Explorer e selecione exatamente essa pasta." -ForegroundColor Yellow
  Pause-End
  exit 1
}

$indexPath = Join-Path $repo "index.html"
$configPath = Join-Path $repo "js\supabase-config.js"

if (-not (Test-Path $indexPath) -or -not (Test-Path $configPath)) {
  Write-Host "ERRO: index.html ou js\supabase-config.js não foi encontrado." -ForegroundColor Red
  Pause-End
  exit 1
}

$publishableKey = [Microsoft.VisualBasic.Interaction]::InputBox(
  "Cole a Publishable key do projeto $ProjectRef.`n`nEla começa normalmente com sb_publishable_.`nNão cole a Secret key.",
  "Chave pública do Supabase",
  ""
).Trim()

if (-not $publishableKey) {
  Write-Host "Nenhuma chave pública foi informada. Operação cancelada." -ForegroundColor Yellow
  Pause-End
  exit 0
}

if (
  -not $publishableKey.StartsWith("sb_publishable_") -and
  -not $publishableKey.StartsWith("eyJ")
) {
  Write-Host "A chave informada não parece ser uma Publishable key nem uma anon key legada." -ForegroundColor Red
  Write-Host "Abra Supabase > Settings > API Keys e copie a chave pública do projeto correto." -ForegroundColor Yellow
  Pause-End
  exit 1
}

$parent = Split-Path -Parent $repo
$name = Split-Path -Leaf $repo
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $parent ($name + "-BACKUP-ANTES-SUPABASE-" + $stamp)

Write-Host ""
Write-Host "Criando backup..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path (Join-Path $backup "js") | Out-Null
Copy-Item -LiteralPath $indexPath -Destination (Join-Path $backup "index.html") -Force
Copy-Item -LiteralPath $configPath -Destination (Join-Path $backup "js\supabase-config.js") -Force

Write-Host "Atualizando o front-end..." -ForegroundColor Cyan
Replace-Config -Path $indexPath -PublishableKey $publishableKey
Replace-Config -Path $configPath -PublishableKey $publishableKey

# Atualiza marcadores de versão e evita cache da configuração anterior.
$index = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$index = [regex]::Replace(
  $index,
  '<meta name="app-version" content="[^"]*"\s*/>',
  '<meta name="app-version" content="8.4.1" />'
)
$index = [regex]::Replace(
  $index,
  'window\.__CONVENIOS_BUILD__\s*=\s*''[^'']*'';',
  "window.__CONVENIOS_BUILD__ = '8.4.1-supabase-aligned';"
)
$index = [regex]::Replace(
  $index,
  'css/style\.css\?v=[^"'']+',
  'css/style.css?v=8.4.1'
)
Set-Content -LiteralPath $indexPath -Value $index -Encoding UTF8

$versionPath = Join-Path $repo "VERSAO.txt"
Set-Content -LiteralPath $versionPath `
  -Value "8.4.1 - Front-end alinhado ao Supabase $ProjectRef" `
  -Encoding UTF8

$buildInfoPath = Join-Path $repo "build-info.json"
$buildInfo = @{
  version = "8.4.1"
  release = "supabase-project-aligned"
  supabase_project_ref = $ProjectRef
  supabase_url = $ProjectUrl
  secret_key_in_frontend = $false
}
$buildInfo | ConvertTo-Json -Depth 5 |
  Set-Content -LiteralPath $buildInfoPath -Encoding UTF8

# Atualiza o diagnóstico da Function para exibir somente a referência pública do projeto.
$healthPath = Join-Path $repo "functions\api\health.js"
if (Test-Path $healthPath) {
  $health = Get-Content -LiteralPath $healthPath -Raw -Encoding UTF8

  if (-not $health.Contains("supabase_project_ref")) {
    $health = $health.Replace(
      "const secretConfigured = Boolean(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);",
      "const secretConfigured = Boolean(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);`n  const supabaseProjectRef = (() => { try { return new URL(supabaseUrl).hostname.split('.')[0] || null; } catch { return null; } })();"
    )

    $health = $health.Replace(
      "supabase_url_configured: Boolean(supabaseUrl),",
      "supabase_url_configured: Boolean(supabaseUrl),`n    supabase_project_ref: supabaseProjectRef,"
    )

    Set-Content -LiteralPath $healthPath -Value $health -Encoding UTF8
  }
}

Write-Host "Validando os arquivos..." -ForegroundColor Cyan
$indexCheck = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$configCheck = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8

if (-not $indexCheck.Contains($ProjectUrl)) {
  throw "O index.html não recebeu a URL correta."
}
if (-not $configCheck.Contains($ProjectUrl)) {
  throw "O arquivo js\supabase-config.js não recebeu a URL correta."
}
if (-not $indexCheck.Contains($publishableKey)) {
  throw "O index.html não recebeu a chave pública."
}
if (-not $configCheck.Contains($publishableKey)) {
  throw "O arquivo js\supabase-config.js não recebeu a chave pública."
}

Write-Host " [OK] index.html" -ForegroundColor Green
Write-Host " [OK] js\supabase-config.js" -ForegroundColor Green
Write-Host " [OK] URL: $ProjectUrl" -ForegroundColor Green
Write-Host " [OK] Nenhuma Secret key foi gravada no front-end" -ForegroundColor Green

$git = Find-Git
$pushOk = $false

if ($git) {
  Write-Host ""
  Write-Host "Criando commit e enviando ao GitHub..." -ForegroundColor Cyan
  & $git -C $repo add -A
  & $git -C $repo commit -m "Alinhar site ao Supabase $ProjectRef"
  if ($LASTEXITCODE -eq 0) {
    & $git -C $repo push origin main
    if ($LASTEXITCODE -eq 0) {
      $pushOk = $true
    }
  }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host " FRONT-END ALINHADO AO PROJETO SUPABASE CORRETO" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "URL configurada nos arquivos:" -ForegroundColor Cyan
Write-Host $ProjectUrl -ForegroundColor Green
Write-Host ""

if (-not $pushOk) {
  Write-Host "No GitHub Desktop, conclua:" -ForegroundColor Yellow
  Write-Host "1. Summary: Alinhar site ao Supabase correto"
  Write-Host "2. Commit to main"
  Write-Host "3. Push origin"
} else {
  Write-Host "Commit e Push origin concluídos automaticamente." -ForegroundColor Green
}

Write-Host ""
Write-Host "CONFIRA NO CLOUDFLARE — Production:" -ForegroundColor Yellow
Write-Host "SUPABASE_URL = $ProjectUrl"
Write-Host "SUPABASE_PUBLISHABLE_KEY = a mesma chave pública informada"
Write-Host "SUPABASE_SECRET_KEY = a Secret key do mesmo projeto, marcada como Secret"
Write-Host ""
Write-Host "Depois faça Retry deployment e entre novamente em janela anônima." -ForegroundColor Yellow
Write-Host ""
Write-Host "Backup criado em: $backup" -ForegroundColor DarkGray

try {
  Start-Process "https://cloudconvenios.pages.dev/build-info.json?cache=$stamp"
} catch {}

Pause-End
