const VERSION = 'cloudflare-pages-exports-1.0.0';
const BUCKET = 'exportacoes';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function config(env) {
  return {
    url: String(env.SUPABASE_URL || '').replace(/\/$/, ''),
    secret: String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''),
    publishable: String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || ''),
    cronSecret: String(env.EXPORT_CRON_SECRET || '')
  };
}

function safeName(value, fallback = 'arquivo.xlsx') {
  const cleaned = String(value || fallback)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 150);
  return cleaned || fallback;
}

function serviceHeaders(cfg, extra = {}) {
  const headers = { apikey: cfg.secret, ...extra };
  if (cfg.secret.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.secret}`;
  return headers;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function serviceFetch(cfg, path, options = {}) {
  const response = await fetch(`${cfg.url}${path}`, {
    ...options,
    headers: serviceHeaders(cfg, options.headers || {})
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || data?.msg || `Erro HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return { response, data };
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
  if (message.includes('unrecognized jwt kid') || message.includes('token is unverifiable') || message.includes('invalid jwt')) {
    return Object.assign(new Error('Sua sessão precisa ser renovada. Saia e entre novamente.'), { status: 401, code: 'STALE_SESSION' });
  }
  return error;
}

async function verifyAdmin(request, cfg) {
  const token = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Sessão não informada.'), { status: 401, code: 'SESSION_REQUIRED' });

  let authUser;
  try {
    const response = await fetch(`${cfg.url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: cfg.publishable || cfg.secret,
        Authorization: `Bearer ${token}`
      }
    });
    const data = await parseResponse(response);
    if (!response.ok) {
      const error = new Error(data?.msg || data?.message || data?.error || `Erro HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    authUser = data;
  } catch (error) {
    throw normalizeAuthError(error);
  }

  const jwt = decodeJwtPayload(token);
  if (jwt.aal !== 'aal2') {
    throw Object.assign(new Error('Confirme o código do aplicativo autenticador para continuar.'), { status: 403, code: 'MFA_REQUIRED' });
  }

  const { data: rows } = await serviceFetch(
    cfg,
    `/rest/v1/usuarios?id=eq.${encodeURIComponent(authUser.id)}&select=id,nome,email,perfil_id,ativo`,
    { method: 'GET' }
  );
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || !profile.ativo || profile.perfil_id !== 'administrador') {
    throw Object.assign(new Error('Ação permitida somente ao administrador ativo.'), { status: 403, code: 'ADMIN_REQUIRED' });
  }
  return { authUser, profile };
}

function datePath(date = new Date()) {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`;
}

async function uploadObject(cfg, path, blob, mimeType) {
  const response = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: serviceHeaders(cfg, {
      'Content-Type': mimeType || 'application/octet-stream',
      'x-upsert': 'true'
    }),
    body: blob
  });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data?.message || data?.error || `Falha ao salvar arquivo (HTTP ${response.status}).`);
  return data;
}

async function insertHistory(cfg, record) {
  const { data } = await serviceFetch(cfg, '/rest/v1/historico_downloads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(record)
  });
  return Array.isArray(data) ? data[0] : data;
}

async function listHistory(cfg) {
  const { data } = await serviceFetch(
    cfg,
    '/rest/v1/historico_downloads?select=id,usuario_id,usuario_nome,arquivo_nome,tipo,origem,caminho_storage,mime_type,tamanho_bytes,total_registros,criado_em&order=criado_em.desc&limit=200',
    { method: 'GET' }
  );
  return Array.isArray(data) ? data : [];
}

async function getHistory(cfg, id) {
  const { data } = await serviceFetch(
    cfg,
    `/rest/v1/historico_downloads?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { method: 'GET' }
  );
  return Array.isArray(data) ? data[0] : null;
}

async function manualUpload(request, cfg, caller) {
  const filename = safeName(request.headers.get('X-Export-Filename'));
  const type = safeName(request.headers.get('X-Export-Kind') || 'planilha', 'planilha').slice(0, 50);
  const totalRecords = Math.max(0, Number(request.headers.get('X-Export-Records') || 0) || 0);
  const mimeType = String(request.headers.get('Content-Type') || 'application/octet-stream').slice(0, 160);
  const blob = await request.blob();
  if (!blob.size) throw Object.assign(new Error('O arquivo recebido está vazio.'), { status: 400 });
  if (blob.size > 25 * 1024 * 1024) throw Object.assign(new Error('O arquivo excede o limite de 25 MB.'), { status: 413 });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `manuais/${datePath()}/${timestamp}-${filename}`;
  await uploadObject(cfg, path, blob, mimeType);
  const row = await insertHistory(cfg, {
    usuario_id: caller.authUser.id,
    usuario_nome: caller.profile.nome || caller.profile.email || 'Administrador',
    arquivo_nome: filename,
    tipo: type,
    origem: 'manual',
    caminho_storage: path,
    mime_type: mimeType,
    tamanho_bytes: blob.size,
    total_registros: totalRecords
  });
  return json(201, { ok: true, version: VERSION, data: row });
}

function csvEscape(value) {
  const text = String(value ?? '').replace(/"/g, '""');
  return /[;"\n\r]/.test(text) ? `"${text}"` : text;
}

function csvBlob(rows) {
  return new Blob(['\uFEFF' + rows.map((row) => row.map(csvEscape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

async function queryAll(cfg, table, select, order = '') {
  const suffix = order ? `&order=${encodeURIComponent(order)}` : '';
  const { data } = await serviceFetch(cfg, `/rest/v1/${table}?select=${encodeURIComponent(select)}${suffix}`, { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

async function automaticExport(request, cfg) {
  if (!cfg.cronSecret) throw Object.assign(new Error('EXPORT_CRON_SECRET não foi configurado no Cloudflare.'), { status: 503 });
  const supplied = String(request.headers.get('X-Cron-Secret') || '');
  if (!supplied || supplied !== cfg.cronSecret) throw Object.assign(new Error('Segredo da rotina automática inválido.'), { status: 401 });

  const [companies, contacts] = await Promise.all([
    queryAll(cfg, 'concedentes', '*', 'razao_social.asc'),
    queryAll(cfg, 'contatos', '*', 'data_contato.desc')
  ]);

  const companyRows = [[
    'ID','CNPJ','Razão Social','Nome Fantasia','Início da Vigência','Fim da Vigência','Dias restantes','Data do Cadastro',
    'Estado','Cidade','CEP','E-mail','Telefone','Polo','Situação','Forma de Contato','Observações','Atualizado em'
  ], ...companies.map((item) => {
    const end = item.fim_vigencia ? new Date(`${item.fim_vigencia}T12:00:00Z`) : null;
    const today = new Date(); today.setUTCHours(12, 0, 0, 0);
    const days = end ? Math.ceil((end - today) / 86400000) : '';
    return [item.id,item.cnpj,item.razao_social,item.nome_fantasia,item.inicio_vigencia,item.fim_vigencia,days,item.data_cadastro,item.estado,item.cidade,item.cep,item.email,item.telefone,item.polo,item.situacao,(item.formas_contato || []).join(', '),item.observacoes,item.atualizado_em];
  })];

  const companyMap = new Map(companies.map((item) => [item.id, item]));
  const contactRows = [[
    'ID','Concedente','CNPJ','Data do contato','Horário','Responsável','Forma de contato','Pessoa contatada',
    'Resultado','Próxima ação','Próximo contato','Observações','Atualizado em'
  ], ...contacts.map((item) => {
    const company = companyMap.get(item.concedente_id) || {};
    return [item.id,company.nome_fantasia || company.razao_social || item.concedente_id,company.cnpj || '',item.data_contato,item.horario,item.responsavel,item.forma_contato,item.pessoa_contatada,item.resultado_contato,item.proxima_acao,item.proximo_contato,item.observacoes,item.atualizado_em];
  })];

  const stamp = new Date().toISOString().slice(0, 10);
  const exports = [
    { filename: `concedentes_${stamp}.csv`, type: 'concedentes-automatico', rows: companyRows, count: companies.length },
    { filename: `contatos_${stamp}.csv`, type: 'contatos-automatico', rows: contactRows, count: contacts.length }
  ];
  const saved = [];
  for (const item of exports) {
    const blob = csvBlob(item.rows);
    const path = `automaticas/${datePath()}/${item.filename}`;
    await uploadObject(cfg, path, blob, blob.type);
    saved.push(await insertHistory(cfg, {
      usuario_id: null,
      usuario_nome: 'Rotina automática 18h',
      arquivo_nome: item.filename,
      tipo: item.type,
      origem: 'automatica',
      caminho_storage: path,
      mime_type: blob.type,
      tamanho_bytes: blob.size,
      total_registros: item.count
    }));
  }
  return json(200, { ok: true, version: VERSION, data: { items: saved, companies: companies.length, contacts: contacts.length } });
}

async function downloadStored(cfg, item) {
  const response = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${item.caminho_storage.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'GET',
    headers: serviceHeaders(cfg)
  });
  if (!response.ok) {
    const data = await parseResponse(response);
    throw Object.assign(new Error(data?.message || data?.error || 'Arquivo não encontrado no armazenamento.'), { status: response.status });
  }
  const headers = new Headers();
  headers.set('Content-Type', item.mime_type || response.headers.get('Content-Type') || 'application/octet-stream');
  headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(item.arquivo_nome)}`);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: 200, headers });
}

export async function onRequest(context) {
  const { request, env } = context;
  const cfg = config(env);
  if (!cfg.url || !cfg.secret) return json(503, { ok: false, error: 'Variáveis do Supabase não configuradas.' });

  try {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.searchParams.get('action') === 'automatic') {
      return await automaticExport(request, cfg);
    }

    const caller = await verifyAdmin(request, cfg);

    if (request.method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const item = await getHistory(cfg, id);
        if (!item) return json(404, { ok: false, error: 'Exportação não encontrada.' });
        return await downloadStored(cfg, item);
      }
      return json(200, { ok: true, version: VERSION, data: { items: await listHistory(cfg) } });
    }

    if (request.method === 'POST') return await manualUpload(request, cfg, caller);
    return json(405, { ok: false, error: 'Método não permitido.' }, { Allow: 'GET, POST' });
  } catch (error) {
    console.error('[exports]', error);
    return json(Number(error?.status || 500), {
      ok: false,
      code: error?.code || null,
      error: error?.message || 'Erro interno na função de exportações.'
    });
  }
}
