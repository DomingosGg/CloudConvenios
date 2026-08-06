const FUNCTION_VERSION = 'cloudflare-pages-8.9.2-admin-data';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const BASE_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
});

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

function assertConfig(config) {
  if (!config.supabaseUrl || !config.supabaseSecretKey || !config.supabasePublishableKey) {
    throw Object.assign(
      new Error('As variáveis do Supabase não estão completas no Cloudflare.'),
      { status: 503, code: 'SERVER_CONFIGURATION_ERROR' }
    );
  }
}

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function decodeBase64Url(value) {
  const input = String(value || '');
  const normalized = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=');

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
    throw Object.assign(new Error('Sessão administrativa inválida.'), {
      status: 401,
      code: 'INVALID_SESSION'
    });
  }

  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (!header || !payload) {
    throw Object.assign(new Error('Não foi possível interpretar a sessão administrativa.'), {
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
    && jwksCache.keys.length
  ) {
    return jwksCache.keys;
  }

  const response = await fetch(
    `${config.supabaseUrl}/auth/v1/.well-known/jwks.json${force ? `?refresh=${now}` : ''}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data?.keys)) {
    throw Object.assign(new Error('Não foi possível validar as chaves públicas do Supabase.'), {
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

  throw Object.assign(new Error(`Algoritmo de sessão não aceito: ${algorithm || 'ausente'}.`), {
    status: 401,
    code: 'UNSUPPORTED_JWT_ALGORITHM'
  });
}

async function verifyAsymmetricJwt(parsed, config) {
  const algorithm = String(parsed.header.alg || '');
  const kid = String(parsed.header.kid || '');

  if (!kid) {
    throw Object.assign(new Error('A sessão não informa a chave de assinatura.'), {
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
    throw Object.assign(new Error('A chave usada pela sessão não pertence ao projeto Supabase atual.'), {
      status: 401,
      code: 'JWT_KID_NOT_FOUND'
    });
  }

  const publicKey = await importVerificationKey(jwk, algorithm);
  const verificationAlgorithm = algorithm === 'ES256'
    ? { name: 'ECDSA', hash: 'SHA-256' }
    : { name: 'RSASSA-PKCS1-v1_5' };

  const valid = await crypto.subtle.verify(
    verificationAlgorithm,
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

function validateClaims(payload, config) {
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `${config.supabaseUrl}/auth/v1`;

  if (!payload?.sub) {
    throw Object.assign(new Error('Sessão sem identificador de usuário.'), {
      status: 401,
      code: 'INVALID_SESSION'
    });
  }

  if (String(payload.iss || '').replace(/\/$/, '') !== expectedIssuer) {
    throw Object.assign(new Error('O site e a função estão ligados a projetos Supabase diferentes.'), {
      status: 401,
      code: 'PROJECT_MISMATCH'
    });
  }

  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= now - 15) {
    throw Object.assign(new Error('A sessão expirou. Entre novamente.'), {
      status: 401,
      code: 'SESSION_EXPIRED'
    });
  }

  if (payload.role && payload.role !== 'authenticated') {
    throw Object.assign(new Error('A credencial não pertence a um usuário autenticado.'), {
      status: 401,
      code: 'INVALID_SESSION_ROLE'
    });
  }

  if (payload.aal !== 'aal2') {
    throw Object.assign(new Error('Confirme o código do aplicativo autenticador antes de excluir os dados.'), {
      status: 403,
      code: 'MFA_REQUIRED'
    });
  }
}

async function requestSupabase(config, path, options = {}, credentials = {}) {
  const apiKey = credentials.apiKey || config.supabaseSecretKey;
  const headers = {
    apikey: apiKey,
    Accept: 'application/json',
    ...(options.headers || {})
  };

  if (credentials.userJwt) {
    headers.Authorization = `Bearer ${credentials.userJwt}`;
  } else if (config.supabaseSecretKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${config.supabaseSecretKey}`;
  }

  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers,
    cache: 'no-store'
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
    const message = data?.msg
      || data?.message
      || data?.error_description
      || data?.error
      || `Erro HTTP ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.code = data?.code || data?.error_code || null;
    error.details = data;
    throw error;
  }

  return { data, response };
}

async function verifyLegacyJwt(token, config) {
  try {
    await requestSupabase(
      config,
      '/auth/v1/user',
      { method: 'GET' },
      {
        userJwt: token,
        apiKey: config.supabasePublishableKey
      }
    );
  } catch (cause) {
    throw Object.assign(new Error('Não foi possível validar a sessão administrativa.'), {
      status: 401,
      code: 'INVALID_SESSION',
      cause
    });
  }
}

async function getAdministratorProfile(token, parsed, config) {
  const path = `/rest/v1/usuarios?id=eq.${encodeURIComponent(parsed.payload.sub)}&select=id,nome,email,perfil_id,ativo`;

  try {
    const { data } = await requestSupabase(
      config,
      path,
      { method: 'GET' },
      {
        userJwt: token,
        apiKey: config.supabasePublishableKey
      }
    );

    const profile = Array.isArray(data) ? data[0] : null;
    if (profile) return profile;
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    const signingProblem = message.includes('jwt')
      || message.includes('signature')
      || message.includes('token')
      || message.includes('kid');

    if (!signingProblem) throw error;
  }

  const { data } = await requestSupabase(config, path, { method: 'GET' });
  return Array.isArray(data) ? data[0] : null;
}

async function verifyAdministrator(token, config) {
  const parsed = parseJwt(token);
  validateClaims(parsed.payload, config);

  const algorithm = String(parsed.header.alg || '');

  if (algorithm === 'ES256' || algorithm === 'RS256') {
    await verifyAsymmetricJwt(parsed, config);
  } else if (algorithm === 'HS256') {
    await verifyLegacyJwt(token, config);
  } else {
    throw Object.assign(new Error(`Algoritmo de sessão não suportado: ${algorithm || 'ausente'}.`), {
      status: 401,
      code: 'UNSUPPORTED_JWT_ALGORITHM'
    });
  }

  const profile = await getAdministratorProfile(token, parsed, config);

  if (!profile || profile.ativo !== true || profile.perfil_id !== 'administrador') {
    throw Object.assign(new Error('A exclusão de todos os dados é permitida somente ao administrador ativo.'), {
      status: 403,
      code: 'ADMIN_REQUIRED'
    });
  }

  const email = cleanText(parsed.payload.email || profile.email, 254).toLowerCase();
  if (!email) {
    throw Object.assign(new Error('O e-mail da conta administrativa não foi encontrado.'), {
      status: 400,
      code: 'ADMIN_EMAIL_MISSING'
    });
  }

  return {
    id: parsed.payload.sub,
    email,
    profile
  };
}

async function verifyCurrentPassword(administrator, password, config) {
  const response = await fetch(
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        email: administrator.email,
        password
      }),
      cache: 'no-store'
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw Object.assign(new Error('Senha administrativa incorreta.'), {
      status: 401,
      code: 'INVALID_PASSWORD'
    });
  }

  if (data?.user?.id !== administrator.id) {
    throw Object.assign(new Error('A senha informada não pertence ao administrador conectado.'), {
      status: 401,
      code: 'PASSWORD_USER_MISMATCH'
    });
  }
}

function parseExactCount(response) {
  const contentRange = response.headers.get('Content-Range') || '';
  const total = contentRange.split('/').pop();
  return /^\d+$/.test(total) ? Number(total) : 0;
}

async function countVisibleRows(table, token, config) {
  const { response } = await requestSupabase(
    config,
    `/rest/v1/${table}?select=id&limit=1`,
    {
      method: 'GET',
      headers: {
        Prefer: 'count=exact',
        Range: '0-0'
      }
    },
    {
      userJwt: token,
      apiKey: config.supabasePublishableKey
    }
  );

  return parseExactCount(response);
}

async function clearOperationalData(token, config) {
  const contactsCount = await countVisibleRows('contatos', token, config);

  const { data } = await requestSupabase(
    config,
    `/rest/v1/concedentes?id=neq.${ZERO_UUID}&select=id`,
    {
      method: 'DELETE',
      headers: {
        Prefer: 'return=representation'
      }
    },
    {
      userJwt: token,
      apiKey: config.supabasePublishableKey
    }
  );

  return {
    concedentes_excluidas: Array.isArray(data) ? data.length : 0,
    contatos_excluidos: contactsCount
  };
}

export async function onRequestGet() {
  return json(200, {
    ok: true,
    version: FUNCTION_VERSION,
    ready: true,
    action: 'clear_all_requires_admin_password'
  });
}

export async function onRequestPost(context) {
  try {
    const config = getConfig(context.env);
    assertConfig(config);

    const authHeader = context.request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      throw Object.assign(new Error('Sessão administrativa não informada.'), {
        status: 401,
        code: 'SESSION_REQUIRED'
      });
    }

    const body = await context.request.json().catch(() => ({}));
    const action = cleanText(body?.action, 40);
    const password = String(body?.password || '');

    if (action !== 'clear_all') {
      throw Object.assign(new Error('Ação administrativa inválida.'), {
        status: 400,
        code: 'INVALID_ACTION'
      });
    }

    if (!password || password.length > 256) {
      throw Object.assign(new Error('Informe a senha atual da conta administrativa.'), {
        status: 400,
        code: 'PASSWORD_REQUIRED'
      });
    }

    const administrator = await verifyAdministrator(token, config);
    await verifyCurrentPassword(administrator, password, config);
    const result = await clearOperationalData(token, config);

    return json(200, {
      ok: true,
      version: FUNCTION_VERSION,
      message: 'Dados operacionais excluídos com confirmação de senha.',
      data: {
        ...result,
        preservados: [
          'contas de autenticação',
          'perfis de usuários',
          'permissões',
          'configurações',
          'auditoria',
          'histórico de exportações'
        ]
      }
    });
  } catch (error) {
    console.error('[admin-data]', {
      code: error?.code || null,
      status: error?.status || 500,
      message: error?.message || 'Erro desconhecido'
    });

    return json(
      Number(error?.status) || 500,
      {
        ok: false,
        version: FUNCTION_VERSION,
        code: error?.code || 'ADMIN_DATA_ERROR',
        message: error?.message || 'Não foi possível concluir a operação administrativa.'
      }
    );
  }
}
