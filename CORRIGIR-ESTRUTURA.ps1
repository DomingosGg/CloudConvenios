
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " CORRECAO AUTOMATICA - CLOUDCONVENIOS / CLOUDFLARE PAGES" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

if (-not (Test-Path ".git")) {
    Write-Host "ERRO: esta pasta nao parece ser o repositorio clonado." -ForegroundColor Red
    Write-Host "Copie estes dois arquivos para dentro da pasta CloudConvenios aberta pelo GitHub Desktop." -ForegroundColor Yellow
    Read-Host "Pressione ENTER para sair"
    exit 1
}

if (-not (Test-Path "index.html")) {
    Write-Host "ERRO: index.html nao encontrado na raiz do repositorio." -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit 1
}

$dirs = @(
    "css",
    "js",
    "functions",
    "functions\api",
    "modelo"
)

foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

function Move-IfPresent {
    param(
        [Parameter(Mandatory=$true)][string]$Source,
        [Parameter(Mandatory=$true)][string]$Destination
    )

    if (Test-Path $Source) {
        $parent = Split-Path -Parent $Destination
        if ($parent) {
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
        }

        if (Test-Path $Destination) {
            Remove-Item $Destination -Force
        }

        Move-Item $Source $Destination -Force
        Write-Host "Movido: $Source -> $Destination" -ForegroundColor Green
    }
}

# Arquivos visuais
Move-IfPresent "style.css" "css\style.css"

# JavaScript público do navegador
$browserJs = @(
    "app.js",
    "audit.js",
    "auth.js",
    "cnpj-service.js",
    "data-service.js",
    "notifications.js",
    "supabase-client.js",
    "supabase-config.js",
    "user-management.js"
)
foreach ($file in $browserJs) {
    Move-IfPresent $file ("js\" + $file)
}

# Cloudflare Pages Functions
$functions = @(
    "cnpj-lookup.js",
    "health.js",
    "users-admin.js"
)
foreach ($file in $functions) {
    Move-IfPresent $file ("functions\api\" + $file)
}

# Modelo de importação
Move-IfPresent "modelo_importacao_convenios.xlsx" "modelo\modelo_importacao_convenios.xlsx"

# Garante o roteamento somente da API
$routes = @'
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": []
}
'@
Set-Content -Path "_routes.json" -Value $routes -Encoding UTF8

# Remove arquivos que podem fazer o projeto voltar ao modo Worker
$workerFiles = @("wrangler.json", "wrangler.jsonc", "wrangler.toml", "_redirects")
foreach ($file in $workerFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "Removido: $file" -ForegroundColor Yellow
    }
}

$required = @(
    "index.html",
    "css\style.css",
    "js\app.js",
    "functions\api\health.js",
    "functions\api\users-admin.js",
    "functions\api\cnpj-lookup.js",
    "_routes.json"
)

$missing = @()
foreach ($item in $required) {
    if (-not (Test-Path $item)) {
        $missing += $item
    }
}

Write-Host ""
if ($missing.Count -eq 0) {
    Write-Host "ESTRUTURA CORRIGIDA COM SUCESSO." -ForegroundColor Green
    Write-Host ""
    Write-Host "Agora volte ao GitHub Desktop:" -ForegroundColor Cyan
    Write-Host "1. No campo Summary, escreva: Corrigir estrutura das Functions"
    Write-Host "2. Clique em Commit to main"
    Write-Host "3. Clique em Push origin"
    Write-Host "4. Aguarde o novo deploy no Cloudflare"
    Write-Host "5. Teste: https://cloudconvenios.pages.dev/api/health"
} else {
    Write-Host "A estrutura foi parcialmente corrigida, mas faltaram estes arquivos:" -ForegroundColor Red
    foreach ($item in $missing) {
        Write-Host " - $item" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Nesse caso, copie novamente o conteúdo do ZIP completo do projeto para esta pasta." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Pressione ENTER para fechar"
