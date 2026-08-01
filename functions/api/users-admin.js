const FUNCTION_VERSION = 'cloudflare-pages-1.3.0-session-stable';
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

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(atob(normalized));
  } catch {
    return {};
  }
}

function normalizeAuthError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (
    message.includes('unrecognized jwt kid')
    || message.includes('token is unverifiable')
    || message.includes('unable to parse or verify signature')
    || message.includes('invalid jwt')
  ) {
    return Object.assign(new Error('Sua sessão de segurança precisa ser renovada. Entre novamente no sistema.'), {
      status: 401,
      code: 'STALE_SESSION'
    });
  }
  return error;
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

  const jwt = decodeJwtPayload(token);
  const expectedIssuer = `${config.supabaseUrl}/auth/v1`;

  if (!jwt.sub) {
    throw Object.assign(new Error('Token de acesso sem identificador de usuário.'), {
      status: 401,
      code: 'INVALID_SESSION'
    });
  }

  if (jwt.iss && String(jwt.iss).replace(/\/$/, '') !== expectedIssuer) {
    throw Object.assign(new Error('A sessão pertence a outro projeto do Supabase.'), {
      status: 401,
      code: 'PROJECT_MISMATCH'
    });
  }

  if (Number(jwt.exp || 0) <= Math.floor(Date.now() / 1000)) {
    throw Object.assign(new Error('O token de acesso expirou e precisa ser renovado.'), {
      status: 401,
      code: 'SESSION_EXPIRED'
    });
  }

  if (jwt.aal !== 'aal2') {
    throw Object.assign(new Error('Confirme o código do aplicativo autenticador para continuar.'), {
      status: 403,
      code: 'MFA_REQUIRED'
    });
  }

  let rows;
  try {
    /*
     * O Data API/PostgREST do próprio projeto valida a assinatura do JWT
     * (inclusive ES256) e aplica as políticas RLS usando o token do usuário.
     * Isso evita depender do endpoint /auth/v1/user na borda.
     */
    rows = await supabaseRequest(
      config,
      `/rest/v1/usuarios?id=eq.${encodeURIComponent(jwt.sub)}&select=id,nome,email,perfil_id,ativo`,
      { method: 'GET' },
      { userJwt: token, apiKey: config.supabaseSecretKey }
    );
  } catch (error) {
    throw normalizeAuthError(error);
  }

  const profile = Array.isArray(rows) ? rows[0] : null;

  if (!profile) {
    throw Object.assign(new Error('O perfil desta sessão não foi encontrado ou não está autorizado.'), {
      status: 403,
      code: 'PROFILE_NOT_AUTHORIZED'
    });
  }

  if (profile.ativo !== true || profile.perfil_id !== 'administrador') {
    throw Object.assign(new Error('Ação permitida somente ao administrador ativo.'), {
      status: 403,
      code: 'ADMIN_REQUIRED'
    });
  }

  const authUser = {
    id: jwt.sub,
    email: jwt.email || profile.email || null
  };

  return { authUser, profile, token };
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
    serverKeyType
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
