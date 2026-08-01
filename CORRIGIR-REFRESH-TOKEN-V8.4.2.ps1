
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

function Patch-UserManagement {
  param([string]$Content)

  $newTokenBlock = @'
  function isInvalidRefreshTokenError(error) {
    const message = String(
      error?.message ||
      error?.error_description ||
      error?.code ||
      ''
    ).toLowerCase();

    return message.includes('invalid refresh token')
      || message.includes('refresh token not found')
      || message.includes('refresh_token_not_found')
      || message.includes('refresh_token_already_used');
  }

  function removeStoredAuthTokens() {
    const stores = [window.localStorage, window.sessionStorage];

    for (const store of stores) {
      try {
        const keys = [];
        for (let index = 0; index < store.length; index += 1) {
          const key = store.key(index);
          if (key && /^sb-[a-z0-9-]+-auth-token$/i.test(key)) keys.push(key);
        }
        keys.forEach((key) => store.removeItem(key));
      } catch {}
    }
  }

  async function invalidateBrokenSession(client) {
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // Um refresh token inexistente também pode fazer o signOut falhar.
    }

    removeStoredAuthTokens();
    window.currentUser = null;
    document.dispatchEvent(new CustomEvent('auth:invalid-session'));
  }

  async function getAccessToken() {
    const client = getClient();
    if (!client) {
      const error = new Error('Cliente do Supabase indisponível. Recarregue a página.');
      error.code = 'CLIENT_UNAVAILABLE';
      throw error;
    }

    // getSession já renova automaticamente quando necessário. Não chamamos
    // refreshSession manualmente para evitar rotação concorrente do refresh token.
    const result = await client.auth.getSession();

    if (result.error) {
      if (isInvalidRefreshTokenError(result.error)) {
        await invalidateBrokenSession(client);
        const error = new Error('A sessão salva não é mais válida. Entre novamente com seu e-mail e senha.');
        error.code = 'RELOGIN_REQUIRED';
        throw error;
      }
      throw result.error;
    }

    const session = result.data?.session || null;
    const token = session?.access_token || '';

    if (!token) {
      const error = new Error('Não existe uma sessão ativa. Entre novamente.');
      error.code = 'RELOGIN_REQUIRED';
      throw error;
    }

    const claims = decodeJwtPayload(token);
    const expiresAt = Number(claims.exp || 0);

    if (expiresAt && expiresAt <= Math.floor(Date.now() / 1000)) {
      await invalidateBrokenSession(client);
      const error = new Error('A sessão expirou. Entre novamente.');
      error.code = 'RELOGIN_REQUIRED';
      throw error;
    }

    return token;
  }

  async function api
'@

  $tokenPattern = '(?s)  async function getAccessToken\(\{ refresh = false \} = \{\}\) \{.*?\n  \}\n\n  async function api'
  if (-not [regex]::IsMatch($Content, $tokenPattern)) {
    throw "Não foi possível localizar getAccessToken no código."
  }
  $Content = [regex]::Replace($Content, $tokenPattern, $newTokenBlock, 1)

  $newApiBlock = @'
  async function api(action, payload = {}) {
    const token = await getAccessToken();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ action, payload }),
      cache: 'no-store'
    });

    let result = null;
    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (!response.ok || !result?.ok) {
      const rawMessage = result?.message || `Falha na gestão de usuários (${response.status}).`;
      const code = String(result?.code || '');

      const message = response.status === 404
        ? 'A função users-admin não foi encontrada no Cloudflare Pages.'
        : code === 'PROJECT_MISMATCH'
          ? rawMessage
          : code === 'MFA_REQUIRED'
            ? 'Confirme o código do aplicativo autenticador e tente novamente.'
            : response.status === 401
              ? `${rawMessage} Saia e entre novamente caso a sessão não seja reconhecida.`
              : rawMessage;

      setBackendStatus(response.status === 401 ? 'warning' : 'error', message);

      const error = new Error(message);
      error.code = code;
      error.status = response.status;
      throw error;
    }

    setBackendStatus('ok', `Função de usuários conectada — versão ${result.version || 'atual'} · cliente ${CLIENT_BUILD}.`);
    return result.data;
  }

  function setLoading
'@

  $apiPattern = '(?s)  async function api\(action, payload = \{\}, attempt = 0\) \{.*?\n  \}\n\n  function setLoading'
  if (-not [regex]::IsMatch($Content, $apiPattern)) {
    throw "Não foi possível localizar a função api da gestão de usuários."
  }
  $Content = [regex]::Replace($Content, $apiPattern, $newApiBlock, 1)

  return $Content
}

function Patch-Auth {
  param([string]$Content)

  if (-not $Content.Contains('function clearInvalidLocalSession()')) {
    $helper = @'

  function isInvalidRefreshTokenError(error) {
    const message = errorText(error);
    return message.includes('invalid refresh token')
      || message.includes('refresh token not found')
      || message.includes('refresh_token_not_found')
      || message.includes('refresh_token_already_used');
  }

  function removeStoredAuthTokens() {
    const stores = [window.localStorage, window.sessionStorage];

    for (const store of stores) {
      try {
        const keys = [];
        for (let index = 0; index < store.length; index += 1) {
          const key = store.key(index);
          if (key && /^sb-[a-z0-9-]+-auth-token$/i.test(key)) keys.push(key);
        }
        keys.forEach((key) => store.removeItem(key));
      } catch {}
    }
  }

  async function clearInvalidLocalSession() {
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // A sessão inválida pode impedir a chamada ao servidor.
    }

    removeStoredAuthTokens();
    currentProfile = null;
    window.currentUser = null;
  }
'@

    $anchor = @'
  function errorText(error) {
    return String(error?.message || error?.error_description || '').toLowerCase();
  }
'@

    if (-not $Content.Contains($anchor)) {
      throw "Não foi possível localizar errorText no módulo de autenticação."
    }
    $Content = $Content.Replace($anchor, $anchor + $helper)
  }

  $refreshProfilePattern = @'
      if (attempt === 0 && isTransientSessionError(lastError)) {
        try {
          await client.auth.refreshSession();
        } catch (refreshError) {
          console.warn('[Auth] Não foi possível renovar a sessão durante a validação do perfil:', refreshError);
        }
      }

'@
  $Content = $Content.Replace($refreshProfilePattern, '')

  $oldPermanent = @'
      if (isPermanentAccessError(error)) {
        nextSignedOutNotice = { message, type: 'error' };
        await client.auth.signOut({ scope: 'local' });
        return;
      }
'@
  $newPermanent = @'
      if (isPermanentAccessError(error)) {
        nextSignedOutNotice = {
          message: isInvalidRefreshTokenError(error)
            ? 'A sessão anterior não é mais válida. Entre novamente.'
            : message,
          type: 'error'
        };
        await clearInvalidLocalSession();
        showGuest(nextSignedOutNotice.message, 'error');
        return;
      }
'@
  $Content = $Content.Replace($oldPermanent, $newPermanent)

  $oldBootCatch = @'
    } catch (error) {
      showGuest(authErrorMessage(error));
    }
'@
  $newBootCatch = @'
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        await clearInvalidLocalSession();
        showGuest('A sessão anterior não é mais válida. Entre novamente com seu e-mail e senha.', 'warning');
        return;
      }
      showGuest(authErrorMessage(error));
    }
'@

  # Substitui apenas a ocorrência da inicialização próxima ao fim do módulo.
  $lastIndex = $Content.LastIndexOf($oldBootCatch)
  if ($lastIndex -ge 0) {
    $Content = $Content.Substring(0, $lastIndex) + $newBootCatch + $Content.Substring($lastIndex + $oldBootCatch.Length)
  }

  return $Content
}

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host " CLOUDCONVENIOS V8.4.2 — CORREÇÃO DO REFRESH TOKEN" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan
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
if (-not (Test-Path (Join-Path $repo ".git"))) {
  Write-Host "ERRO: a pasta escolhida não contém .git." -ForegroundColor Red
  Pause-End
  exit 1
}

$indexPath = Join-Path $repo "index.html"
$authPath = Join-Path $repo "js\auth.js"
$userPath = Join-Path $repo "js\user-management.js"

foreach ($file in @($indexPath, $authPath, $userPath)) {
  if (-not (Test-Path $file)) {
    throw "Arquivo obrigatório não encontrado: $file"
  }
}

$backup = Join-Path (Split-Path -Parent $repo) (
  (Split-Path -Leaf $repo) + "-BACKUP-V8.4.2-" + (Get-Date -Format "yyyyMMdd-HHmmss")
)
New-Item -ItemType Directory -Force -Path (Join-Path $backup "js") | Out-Null
Copy-Item $indexPath (Join-Path $backup "index.html") -Force
Copy-Item $authPath (Join-Path $backup "js\auth.js") -Force
Copy-Item $userPath (Join-Path $backup "js\user-management.js") -Force

Write-Host ""
Write-Host "Aplicando a correção..." -ForegroundColor Cyan

$index = Get-Content $indexPath -Raw -Encoding UTF8
$index = Patch-UserManagement $index
$index = Patch-Auth $index
$index = [regex]::Replace(
  $index,
  '<meta name="app-version" content="[^"]*"\s*/>',
  '<meta name="app-version" content="8.4.2" />'
)
$index = [regex]::Replace(
  $index,
  "window\.__CONVENIOS_BUILD__\s*=\s*'[^']*';",
  "window.__CONVENIOS_BUILD__ = '8.4.2-refresh-token-fix';"
)
Set-Content $indexPath $index -Encoding UTF8

$auth = Get-Content $authPath -Raw -Encoding UTF8
$auth = Patch-Auth $auth
Set-Content $authPath $auth -Encoding UTF8

$user = Get-Content $userPath -Raw -Encoding UTF8
$user = Patch-UserManagement $user
$user = [regex]::Replace(
  $user,
  "const CLIENT_BUILD\s*=\s*'[^']*';",
  "const CLIENT_BUILD = '8.4.2-refresh-token-fix';"
)
Set-Content $userPath $user -Encoding UTF8

Set-Content (Join-Path $repo "VERSAO.txt") `
  "8.4.2 - Correção de refresh token inválido e sessão antiga" `
  -Encoding UTF8

Write-Host "Validando..." -ForegroundColor Cyan
$indexCheck = Get-Content $indexPath -Raw -Encoding UTF8
$userCheck = Get-Content $userPath -Raw -Encoding UTF8
$authCheck = Get-Content $authPath -Raw -Encoding UTF8

$markers = @(
  @{ Content = $indexCheck; Text = "8.4.2-refresh-token-fix"; Label = "Versão no index" },
  @{ Content = $indexCheck; Text = "removeStoredAuthTokens"; Label = "Limpeza automática no index" },
  @{ Content = $userCheck; Text = "getSession já renova automaticamente"; Label = "Sem refresh manual na gestão de usuários" },
  @{ Content = $authCheck; Text = "clearInvalidLocalSession"; Label = "Recuperação da autenticação" }
)

foreach ($marker in $markers) {
  if (-not $marker.Content.Contains($marker.Text)) {
    throw "Falha na validação: $($marker.Label)"
  }
  Write-Host " [OK] $($marker.Label)" -ForegroundColor Green
}

$git = Find-Git
$pushOk = $false
if ($git) {
  Write-Host ""
  Write-Host "Enviando ao GitHub..." -ForegroundColor Cyan
  & $git -C $repo add -A
  & $git -C $repo commit -m "Corrigir refresh token e sessão V8.4.2"
  if ($LASTEXITCODE -eq 0) {
    & $git -C $repo push origin main
    if ($LASTEXITCODE -eq 0) { $pushOk = $true }
  }
}

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Green
Write-Host " CORREÇÃO V8.4.2 INSTALADA" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green

if (-not $pushOk) {
  Write-Host ""
  Write-Host "No GitHub Desktop:" -ForegroundColor Yellow
  Write-Host "1. Summary: Corrigir refresh token V8.4.2"
  Write-Host "2. Commit to main"
  Write-Host "3. Push origin"
} else {
  Write-Host "Commit e Push origin concluídos." -ForegroundColor Green
}

Write-Host ""
Write-Host "Após o deploy verde:" -ForegroundColor Cyan
Write-Host "1. Feche todas as abas do CloudConvenios."
Write-Host "2. Abra novamente o site."
Write-Host "3. Entre com e-mail e senha do projeto Supabase atual."
Write-Host ""
Write-Host "Backup: $backup" -ForegroundColor DarkGray

Pause-End
