const FUNCTION_VERSION = 'cloudflare-pages-1.4.1-jwks-es256-v83';
const ALLOWED_PROFILES = new Set(['administrador', 'operador']);

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...extraHeaders }
  });
}

function getConfig(env) {
  return {
    supabaseUrl: String(env.SUPABASE_URL || '').replace(/\/$/, ''),
    supabaseSecretKey: String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''),
    supabasePublishableKey: String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '')
  };
}

function cleanText(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

async function supabaseRequest(config, path, options = {}, { userJwt = null, apiKey = null } = {}) {
  const effectiveApiKey = apiKey || config.supabaseSecretKey;
  const headers = {
    apikey: effectiveApiKey,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (userJwt) {
    headers.Authorization = `Bearer ${userJwt}`;
  } else if (config.supabaseSecretKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${config.supabaseSecretKey}`;
  }

  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error_description || data?.error || `Erro HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.code || data?.error_code || null;
    error.details = data;
    throw error;
  }

  return data;
}

function decodeBase64Url(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeJwtPart(value) {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
  } catch {
    return null;
  }
}

function parseJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw Object.assign(new Error('Token de acesso em formato inválido.'), {
      status: 401,
      code: 'INVALID_SESSION'
    });
  }

  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (!header || !payload) {
    throw Object.assign(new Error('Não foi possível interpretar o token de acesso.'), {
      status: 401,
      code: 'INVALID_SESSION'
    });
  }

  return {
    header,
    payload,
    signingInput: new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    signature: decodeBase64Url(parts[2])
  };
}

let jwksCache = {
  projectUrl: '',
  expiresAt: 0,
  keys: []
};

async function fetchProjectJwks(config, { force = false } = {}) {
  const now = Date.now();
  if (
    !force
    && jwksCache.projectUrl === config.supabaseUrl
    && jwksCache.expiresAt > now
    && Array.isArray(jwksCache.keys)
    && jwksCache.keys.length
  ) {
    return jwksCache.keys;
  }

  const suffix = force ? `?refresh=${now}` : '';
  const response = await fetch(
    `${config.supabaseUrl}/auth/v1/.well-known/jwks.json${suffix}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data?.keys)) {
    throw Object.assign(new Error('Não foi possível consultar as chaves públicas do Supabase.'), {
      status: 503,
      code: 'JWKS_UNAVAILABLE'
    });
  }

  jwksCache = {
    projectUrl: config.supabaseUrl,
    expiresAt: now + 5 * 60 * 1000,
    keys: data.keys
  };

  return data.keys;
}

async function importVerificationKey(jwk, algorithm) {
  if (algorithm === 'ES256') {
    return crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  }

  if (algorithm === 'RS256') {
    return crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  }

  throw Object.assign(new Error(`Algoritmo de assinatura não aceito: ${algorithm || 'ausente'}.`), {
    status: 401,
    code: 'UNSUPPORTED_JWT_ALGORITHM'
  });
}

async function verifyAsymmetricJwt(token, parsed, config) {
  const algorithm = String(parsed.header.alg || '');
  const kid = String(parsed.header.kid || '');

  if (!kid) {
    throw Object.assign(new Error('O token não informa o identificador da chave de assinatura.'), {
      status: 401,
      code: 'JWT_KID_MISSING'
    });
  }

  let keys = await fetchProjectJwks(config);
  let jwk = keys.find((item) => item?.kid === kid && (!item.alg || item.alg === algorithm));

  if (!jwk) {
    keys = await fetchProjectJwks(config, { force: true });
    jwk = keys.find((item) => item?.kid === kid && (!item.alg || item.alg === algorithm));
  }

  if (!jwk) {
    throw Object.assign(new Error('A chave pública usada para assinar a sessão não foi encontrada no projeto Supabase.'), {
      status: 401,
      code: 'JWT_KID_NOT_FOUND'
    });
  }

  const publicKey = await importVerificationKey(jwk, algorithm);
  const verifyAlgorithm = algorithm === 'ES256'
    ? { name: 'ECDSA', hash: 'SHA-256' }
    : { name: 'RSASSA-PKCS1-v1_5' };

  const valid = await crypto.subtle.verify(
    verifyAlgorithm,
    publicKey,
    parsed.signature,
    parsed.signingInput
  );

  if (!valid) {
    throw Object.assign(new Error('A assinatura da sessão é inválida.'), {
      status: 401,
      code: 'INVALID_JWT_SIGNATURE'
    });
  }
}

async function verifyLegacyJwt(token, config) {
  try {
    return await supabaseRequest(
      config,
      '/auth/v1/user',
      { method: 'GET' },
      {
        userJwt: token,
        apiKey: config.supabasePublishableKey || config.supabaseSecretKey
      }
    );
  } catch (error) {
    throw Object.assign(new Error('Não foi possível validar a sessão legada.'), {
      status: 401,
      code: 'INVALID_LEGACY_SESSION',
      cause: error
    });
  }
}

function validateJwtClaims(payload, config) {
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `${config.supabaseUrl}/auth/v1`;

  if (!payload?.sub) {
    throw Object.assign(new Error('Token de acesso sem identificador de usuário.'), {
      status: 401,
      code: 'INVALID_SESSION'
    });
  }

  if (String(payload.iss || '').replace(/\/$/, '') !== expectedIssuer) {
    throw Object.assign(new Error('A sessão pertence a outro projeto do Supabase.'), {
      status: 401,
      code: 'PROJECT_MISMATCH'
    });
  }

  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= now - 15) {
    throw Object.assign(new Error('O token de acesso expirou e precisa ser renovado.'), {
      status: 401,
      code: 'SESSION_EXPIRED'
    });
  }

  if (payload.nbf && Number(payload.nbf) > now + 15) {
    throw Object.assign(new Error('A sessão ainda não está válida.'), {
      status: 401,
      code: 'SESSION_NOT_ACTIVE'
    });
  }

  if (payload.role && payload.role !== 'authenticated') {
    throw Object.assign(new Error('A credencial informada não pertence a um usuário autenticado.'), {
      status: 401,
      code: 'INVALID_SESSION_ROLE'
    });
  }

  if (payload.aal !== 'aal2') {
    throw Object.assign(new Error('Confirme o código do aplicativo autenticador para continuar.'), {
      status: 403,
      code: 'MFA_REQUIRED'
    });
  }
}

async function verifyAdministrator(request, config) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    throw Object.assign(new Error('Sessão não informada.'), {
      status: 401,
      code: 'SESSION_REQUIRED'
    });
  }

  const parsed = parseJwt(token);
  const algorithm = String(parsed.header.alg || '');
  let legacyUser = null;

  if (algorithm === 'ES256' || algorithm === 'RS256') {
    await verifyAsymmetricJwt(token, parsed, config);
  } else if (algorithm === 'HS256') {
    legacyUser = await verifyLegacyJwt(token, config);
  } else {
    throw Object.assign(new Error(`Algoritmo de sessão não suportado: ${algorithm || 'ausente'}.`), {
      status: 401,
      code: 'UNSUPPORTED_JWT_ALGORITHM'
    });
  }

  validateJwtClaims(parsed.payload, config);

  if (legacyUser?.id && legacyUser.id !== parsed.payload.sub) {
    throw Object.assign(new Error('A sessão validada não corresponde ao usuário informado.'), {
      status: 401,
      code: 'SESSION_USER_MISMATCH'
    });
  }

  const rows = await supabaseRequest(
    config,
    `/rest/v1/usuarios?id=eq.${encodeURIComponent(parsed.payload.sub)}&select=id,nome,email,perfil_id,ativo`,
    { method: 'GET' }
  );

  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.ativo !== true || profile.perfil_id !== 'administrador') {
    throw Object.assign(new Error('Ação permitida somente ao administrador ativo.'), {
      status: 403,
      code: 'ADMIN_REQUIRED'
    });
  }

  const authUser = {
    id: parsed.payload.sub,
    email: parsed.payload.email || profile.email || legacyUser?.email || null
  };

  return { authUser, profile, token, claims: parsed.payload };
}

async function listProfiles(config) {
  const data = await supabaseRequest(
    config,
    '/rest/v1/usuarios?select=id,nome,email,perfil_id,polo,ativo,ultimo_acesso,criado_em,atualizado_em&order=nome.asc',
    { method: 'GET' }
  );
  return Array.isArray(data) ? data : [];
}

async function listAuthUsers(config) {
  const data = await supabaseRequest(
    config,
    '/auth/v1/admin/users?page=1&per_page=1000',
    { method: 'GET' }
  );
  return Array.isArray(data?.users) ? data.users : [];
}

function profileFromAuth(auth) {
  const metadata = auth.user_metadata || {};
  const banned = Boolean(auth.banned_until && new Date(auth.banned_until).getTime() > Date.now());
  return {
    id: auth.id,
    nome: cleanText(metadata.nome || metadata.name || auth.email?.split('@')[0] || 'Usuário', 120),
    email: normalizeEmail(auth.email),
    perfil_id: ALLOWED_PROFILES.has(metadata.perfil_id) ? metadata.perfil_id : 'operador',
    polo: cleanText(metadata.polo, 100) || null,
    ativo: !banned,
    ultimo_acesso: auth.last_sign_in_at || null,
    criado_em: auth.created_at || null,
    atualizado_em: auth.updated_at || auth.created_at || null,
    perfil_pendente: true
  };
}

async function mergedUsers(config) {
  const [profiles, authUsers] = await Promise.all([listProfiles(config), listAuthUsers(config)]);
  const profilesMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const authMap = new Map(authUsers.map((user) => [user.id, user]));
  const ids = new Set([...profilesMap.keys(), ...authMap.keys()]);

  return [...ids]
    .map((id) => {
      const auth = authMap.get(id) || {};
      const profile = profilesMap.get(id) || profileFromAuth(auth);
      const banned = Boolean(auth.banned_until && new Date(auth.banned_until).getTime() > Date.now());
      return {
        ...profile,
        email: profile.email || auth.email || '',
        email_confirmed_at: auth.email_confirmed_at || auth.confirmed_at || null,
        last_sign_in_at: auth.last_sign_in_at || profile.ultimo_acesso || null,
        banned_until: auth.banned_until || null,
        auth_created_at: auth.created_at || profile.criado_em || null,
        is_currently_banned: banned
      };
    })
    .sort((a, b) => String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'pt-BR'));
}

async function activeAdminCount(config, exceptId = null) {
  const profiles = await listProfiles(config);
  return profiles.filter((item) => item.ativo && item.perfil_id === 'administrador' && item.id !== exceptId).length;
}

async function getProfileById(config, id) {
  const rows = await supabaseRequest(
    config,
    `/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}&select=*`,
    { method: 'GET' }
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function updateProfile(config, id, values) {
  const rows = await supabaseRequest(
    config,
    `/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...values, atualizado_em: new Date().toISOString() })
    }
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function upsertProfile(config, id, values) {
  const rows = await supabaseRequest(
    config,
    '/rest/v1/usuarios?on_conflict=id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        id,
        ...values,
        atualizado_em: new Date().toISOString()
      })
    }
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function audit(config, caller, action, targetId, targetName, summary, before, after, fields = []) {
  try {
    await supabaseRequest(config, '/rest/v1/auditoria', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        usuario_id: caller.authUser.id,
        usuario_nome: caller.profile.nome || caller.profile.email,
        usuario_email: caller.profile.email,
        acao: action,
        tabela: 'usuarios',
        registro_id: targetId,
        registro_nome: targetName || 'Usuário',
        resumo: summary,
        campos_alterados: fields,
        dados_anteriores: before || null,
        dados_novos: after || null,
        criado_em: new Date().toISOString()
      })
    });
  } catch (error) {
    console.warn('[users-admin] Falha ao registrar auditoria:', error.message);
  }
}

function validateBaseUser(input, { creating = false } = {}) {
  const nome = cleanText(input.nome, 120);
  const email = normalizeEmail(input.email);
  const perfil_id = cleanText(input.perfil_id, 30);
  const polo = cleanText(input.polo, 100) || null;
  const ativo = input.ativo !== false;
  const password = String(input.password || '');

  if (nome.length < 2) {
    throw Object.assign(new Error('Informe o nome completo do usuário.'), { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw Object.assign(new Error('Informe um e-mail válido.'), { status: 400 });
  }
  if (!ALLOWED_PROFILES.has(perfil_id)) {
    throw Object.assign(new Error('Perfil de acesso inválido.'), { status: 400 });
  }
  if (creating && password.length < 8) {
    throw Object.assign(new Error('A senha provisória deve possuir pelo menos 8 caracteres.'), { status: 400 });
  }

  return { nome, email, perfil_id, polo, ativo, password };
}

async function createUser(config, caller, payload) {
  const values = validateBaseUser(payload, { creating: true });
  const created = await supabaseRequest(config, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: values.email,
      password: values.password,
      email_confirm: true,
      user_metadata: {
        nome: values.nome,
        perfil_id: values.perfil_id,
        polo: values.polo
      }
    })
  });

  const authUser = created?.user || created;
  if (!authUser?.id) {
    throw Object.assign(new Error('O usuário foi criado, mas o identificador não foi retornado.'), { status: 500 });
  }

  try {
    const profile = await upsertProfile(config, authUser.id, {
      nome: values.nome,
      email: values.email,
      perfil_id: values.perfil_id,
      polo: values.polo,
      ativo: values.ativo
    });

    if (!values.ativo) {
      await supabaseRequest(config, `/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ ban_duration: '876000h' })
      });
    }

    await audit(
      config,
      caller,
      'INSERT',
      authUser.id,
      values.nome,
      `${caller.profile.nome || caller.profile.email} criou o usuário ${values.nome}.`,
      null,
      profile,
      ['nome', 'email', 'perfil_id', 'polo', 'ativo']
    );

    return profile;
  } catch (error) {
    try {
      await supabaseRequest(config, `/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, { method: 'DELETE' });
    } catch {
      // Evita esconder o erro original.
    }
    throw error;
  }
}

async function updateUser(config, caller, payload) {
  const id = cleanText(payload.id, 50);
  const before = await getProfileById(config, id);
  if (!before) {
    throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
  }

  const values = validateBaseUser(payload);

  if (id === caller.authUser.id && (values.perfil_id !== 'administrador' || !values.ativo)) {
    throw Object.assign(new Error('Você não pode remover o próprio perfil de administrador nem bloquear o próprio acesso.'), { status: 400 });
  }

  if (before.perfil_id === 'administrador' && before.ativo && (values.perfil_id !== 'administrador' || !values.ativo)) {
    if (await activeAdminCount(config, id) < 1) {
      throw Object.assign(new Error('O sistema precisa manter pelo menos um administrador ativo.'), { status: 400 });
    }
  }

  await supabaseRequest(config, `/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      email: values.email,
      user_metadata: {
        nome: values.nome,
        perfil_id: values.perfil_id,
        polo: values.polo
      },
      ban_duration: values.ativo ? 'none' : '876000h'
    })
  });

  const after = await updateProfile(config, id, {
    nome: values.nome,
    email: values.email,
    perfil_id: values.perfil_id,
    polo: values.polo,
    ativo: values.ativo
  });

  const changed = ['nome', 'email', 'perfil_id', 'polo', 'ativo'].filter(
    (field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after?.[field] ?? null)
  );

  await audit(
    config,
    caller,
    'UPDATE',
    id,
    values.nome,
    `${caller.profile.nome || caller.profile.email} atualizou o usuário ${values.nome}.`,
    before,
    after,
    changed
  );

  return after;
}

async function setStatus(config, caller, payload) {
  const id = cleanText(payload.id, 50);
  const ativo = payload.ativo === true;
  const before = await getProfileById(config, id);

  if (!before) {
    throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
  }
  if (id === caller.authUser.id && !ativo) {
    throw Object.assign(new Error('Você não pode bloquear o próprio acesso.'), { status: 400 });
  }
  if (before.perfil_id === 'administrador' && before.ativo && !ativo && await activeAdminCount(config, id) < 1) {
    throw Object.assign(new Error('O sistema precisa manter pelo menos um administrador ativo.'), { status: 400 });
  }

  await supabaseRequest(config, `/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ ban_duration: ativo ? 'none' : '876000h' })
  });

  const after = await updateProfile(config, id, { ativo });
  await audit(
    config,
    caller,
    'UPDATE',
    id,
    before.nome,
    `${caller.profile.nome || caller.profile.email} ${ativo ? 'reativou' : 'bloqueou'} o usuário ${before.nome}.`,
    before,
    after,
    ['ativo']
  );

  return after;
}

async function setPassword(config, caller, payload) {
  const id = cleanText(payload.id, 50);
  const password = String(payload.password || '');

  if (password.length < 8) {
    throw Object.assign(new Error('A senha provisória deve possuir pelo menos 8 caracteres.'), { status: 400 });
  }

  const profile = await getProfileById(config, id);
  if (!profile) {
    throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
  }

  await supabaseRequest(config, `/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ password })
  });

  await audit(
    config,
    caller,
    'UPDATE',
    id,
    profile.nome,
    `${caller.profile.nome || caller.profile.email} definiu uma nova senha provisória para ${profile.nome}.`,
    { senha: 'Protegida' },
    { senha: 'Alterada' },
    ['senha']
  );

  return { id, updated: true };
}

async function deleteUser(config, caller, payload) {
  const id = cleanText(payload.id, 50);
  const before = await getProfileById(config, id);

  if (!before) {
    throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
  }
  if (id === caller.authUser.id) {
    throw Object.assign(new Error('Você não pode excluir o próprio usuário.'), { status: 400 });
  }
  if (before.perfil_id === 'administrador' && before.ativo && await activeAdminCount(config, id) < 1) {
    throw Object.assign(new Error('O sistema precisa manter pelo menos um administrador ativo.'), { status: 400 });
  }

  await audit(
    config,
    caller,
    'DELETE',
    id,
    before.nome,
    `${caller.profile.nome || caller.profile.email} excluiu o usuário ${before.nome}.`,
    before,
    null,
    ['nome', 'email', 'perfil_id', 'polo', 'ativo']
  );

  await supabaseRequest(config, `/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return { id, deleted: true };
}

function describeServerKey(key) {
  const value = String(key || '');
  if (!value) return 'ausente';
  if (value.startsWith('sb_secret_')) return 'secret_key';
  if (value.startsWith('sb_publishable_') || value.startsWith('anon-')) return 'publishable_incorreta';
  if (value.startsWith('eyJ')) return 'service_role_jwt';
  return 'formato_desconhecido';
}

function healthPayload(env) {
  const config = getConfig(env);
  const serverKeyType = describeServerKey(config.supabaseSecretKey);
  const validServerKey = ['secret_key', 'service_role_jwt'].includes(serverKeyType);
  return {
    ready: Boolean(config.supabaseUrl && config.supabaseSecretKey && validServerKey),
    platform: 'cloudflare-pages',
    version: FUNCTION_VERSION,
    supabaseUrlConfigured: Boolean(config.supabaseUrl),
    serverKeyConfigured: Boolean(config.supabaseSecretKey),
    publishableKeyConfigured: Boolean(config.supabasePublishableKey),
    serverKeyType,
    jwtVerification: 'jwks-es256-rs256'
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  if (request.method === 'GET') {
    return json(200, { ok: true, version: FUNCTION_VERSION, data: healthPayload(env) });
  }

  if (request.method !== 'POST') {
    return json(405, { ok: false, message: 'Método não permitido.' }, { Allow: 'GET, POST, OPTIONS' });
  }

  const config = getConfig(env);
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    return json(500, {
      ok: false,
      message: 'As variáveis SUPABASE_URL e SUPABASE_SECRET_KEY não estão configuradas no Cloudflare Pages.'
    });
  }

  try {
    const caller = await verifyAdministrator(request, config);
    let body;
    try {
      body = await request.json();
    } catch {
      throw Object.assign(new Error('Corpo da requisição inválido.'), { status: 400 });
    }

    const action = cleanText(body?.action, 40);
    const payload = body?.payload || {};

    let result;
    if (action === 'list') result = await mergedUsers(config);
    else if (action === 'create') result = await createUser(config, caller, payload);
    else if (action === 'update') result = await updateUser(config, caller, payload);
    else if (action === 'set-status') result = await setStatus(config, caller, payload);
    else if (action === 'set-password') result = await setPassword(config, caller, payload);
    else if (action === 'delete') result = await deleteUser(config, caller, payload);
    else throw Object.assign(new Error('Ação administrativa inválida.'), { status: 400 });

    return json(200, { ok: true, version: FUNCTION_VERSION, data: result });
  } catch (error) {
    console.error('[users-admin]', error.status || 500, error.message);
    return json(error.status || 500, {
      ok: false,
      code: error.code || null,
      message: error.message || 'Não foi possível concluir a operação.'
    });
  }
}
