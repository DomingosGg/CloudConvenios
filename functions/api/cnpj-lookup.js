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

function clean(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function onlyCnpjChars(value) {
  return clean(value, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') ?? '';
}

function formatPhone(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' / ');
  return clean(value, 100);
}

function normalizeBrasilApi(raw) {
  return {
    cnpj: clean(raw.cnpj),
    razao_social: clean(raw.razao_social),
    nome_fantasia: clean(raw.nome_fantasia),
    data_abertura: clean(raw.data_inicio_atividade),
    situacao_cadastral: clean(raw.descricao_situacao_cadastral),
    natureza_juridica: clean(raw.descricao_natureza_juridica),
    cnae_principal: clean(first(raw.cnae_fiscal_descricao, raw.cnae_fiscal)),
    cep: clean(raw.cep),
    logradouro: clean([raw.descricao_tipo_de_logradouro, raw.logradouro].filter(Boolean).join(' ')),
    numero: clean(raw.numero),
    complemento: clean(raw.complemento),
    bairro: clean(raw.bairro),
    estado: clean(raw.uf, 2).toUpperCase(),
    cidade: clean(raw.municipio),
    email: clean(raw.email).toLowerCase(),
    telefone: formatPhone([raw.ddd_telefone_1, raw.ddd_telefone_2]),
    fonte_cnpj: 'BrasilAPI'
  };
}

function normalizeOpenCnpj(raw) {
  const endereco = raw.endereco || raw.address || raw.estabelecimento?.endereco || {};
  const principal = raw.cnae_principal || raw.atividade_principal || raw.estabelecimento?.atividade_principal || {};
  return {
    cnpj: clean(first(raw.cnpj, raw.estabelecimento?.cnpj)),
    razao_social: clean(first(raw.razao_social, raw.razaoSocial, raw.empresa?.razao_social)),
    nome_fantasia: clean(first(raw.nome_fantasia, raw.nomeFantasia, raw.estabelecimento?.nome_fantasia)),
    data_abertura: clean(first(raw.data_inicio_atividade, raw.data_abertura, raw.estabelecimento?.data_inicio_atividade)),
    situacao_cadastral: clean(first(raw.situacao_cadastral, raw.descricao_situacao_cadastral, raw.estabelecimento?.situacao_cadastral)),
    natureza_juridica: clean(first(raw.natureza_juridica?.descricao, raw.natureza_juridica, raw.empresa?.natureza_juridica?.descricao)),
    cnae_principal: clean(first(principal.descricao, principal.texto, principal.codigo, principal)),
    cep: clean(first(raw.cep, endereco.cep, raw.estabelecimento?.cep)),
    logradouro: clean(first(raw.logradouro, endereco.logradouro, raw.estabelecimento?.logradouro)),
    numero: clean(first(raw.numero, endereco.numero, raw.estabelecimento?.numero)),
    complemento: clean(first(raw.complemento, endereco.complemento, raw.estabelecimento?.complemento)),
    bairro: clean(first(raw.bairro, endereco.bairro, raw.estabelecimento?.bairro)),
    estado: clean(first(raw.uf, raw.estado, endereco.uf, endereco.estado, raw.estabelecimento?.uf), 2).toUpperCase(),
    cidade: clean(first(raw.municipio, raw.cidade, endereco.municipio, endereco.cidade, raw.estabelecimento?.municipio?.descricao)),
    email: clean(first(raw.email, raw.estabelecimento?.email)).toLowerCase(),
    telefone: formatPhone(first(raw.telefone, raw.telefones, raw.estabelecimento?.telefones)),
    fonte_cnpj: 'OpenCNPJ'
  };
}

function normalizeMinhaReceita(raw) {
  return {
    cnpj: clean(raw.cnpj),
    razao_social: clean(raw.razao_social),
    nome_fantasia: clean(raw.nome_fantasia),
    data_abertura: clean(raw.data_inicio_atividade),
    situacao_cadastral: clean(raw.descricao_situacao_cadastral),
    natureza_juridica: clean(raw.descricao_natureza_juridica),
    cnae_principal: clean(first(raw.cnae_fiscal_descricao, raw.cnae_fiscal)),
    cep: clean(raw.cep),
    logradouro: clean([raw.descricao_tipo_de_logradouro, raw.logradouro].filter(Boolean).join(' ')),
    numero: clean(raw.numero),
    complemento: clean(raw.complemento),
    bairro: clean(raw.bairro),
    estado: clean(raw.uf, 2).toUpperCase(),
    cidade: clean(raw.municipio),
    email: clean(raw.email).toLowerCase(),
    telefone: formatPhone([raw.ddd_telefone_1, raw.ddd_telefone_2]),
    fonte_cnpj: 'Minha Receita'
  };
}

function normalizeReceitaWs(raw) {
  const atividade = Array.isArray(raw.atividade_principal) ? raw.atividade_principal[0] : null;
  return {
    cnpj: clean(raw.cnpj),
    razao_social: clean(raw.nome),
    nome_fantasia: clean(raw.fantasia),
    data_abertura: clean(raw.abertura),
    situacao_cadastral: clean(raw.situacao),
    natureza_juridica: clean(raw.natureza_juridica),
    cnae_principal: clean(first(atividade?.text, atividade?.code)),
    cep: clean(raw.cep),
    logradouro: clean(raw.logradouro),
    numero: clean(raw.numero),
    complemento: clean(raw.complemento),
    bairro: clean(raw.bairro),
    estado: clean(raw.uf, 2).toUpperCase(),
    cidade: clean(raw.municipio),
    email: clean(raw.email).toLowerCase(),
    telefone: formatPhone(raw.telefone),
    fonte_cnpj: 'ReceitaWS'
  };
}


function toClientData(data) {
  const source = clean(data.fonte_cnpj || data.fonte || 'Consulta pública');
  const consultedAt = new Date().toISOString();

  return {
    ...data,

    // Nomes usados pelo formulário web.
    razaoSocial: clean(data.razao_social),
    nomeFantasia: clean(data.nome_fantasia),
    dataAbertura: clean(data.data_abertura),
    situacaoCadastral: clean(data.situacao_cadastral),
    naturezaJuridica: clean(data.natureza_juridica),
    cnaePrincipal: clean(data.cnae_principal),
    cidade: clean(data.cidade),
    estado: clean(data.estado, 2).toUpperCase(),
    fontes: source ? [source] : [],
    consultadoEm: consultedAt,

    // Nomes antigos mantidos para compatibilidade.
    fonte: source,
    consultado_em: consultedAt
  };
}

async function fetchJson(url, normalizer, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Gestao-Renovacoes-Convenios/1.0'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const raw = await response.json();
    if (raw?.status === 'ERROR' || raw?.erro === true) {
      throw new Error(raw?.message || 'Fonte retornou erro.');
    }

    const normalized = normalizer(raw);
    if (!normalized.razao_social && !normalized.nome_fantasia) {
      throw new Error('Fonte não retornou identificação da empresa.');
    }

    return normalized;
  } finally {
    clearTimeout(timeout);
  }
}

async function lookup(cnpj) {
  const primarySources = [
    fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(cnpj)}`, normalizeBrasilApi),
    fetchJson(`https://kitana.opencnpj.com/cnpj/${encodeURIComponent(cnpj)}`, normalizeOpenCnpj),
    fetchJson(`https://minhareceita.org/${encodeURIComponent(cnpj)}`, normalizeMinhaReceita)
  ];

  try {
    return await Promise.any(primarySources);
  } catch {
    return fetchJson(`https://www.receitaws.com.br/v1/cnpj/${encodeURIComponent(cnpj)}`, normalizeReceitaWs, 12000);
  }
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  if (!['GET', 'POST'].includes(request.method)) {
    return json(405, { ok: false, message: 'Método não permitido.' }, { Allow: 'GET, POST, OPTIONS' });
  }

  try {
    const url = new URL(request.url);
    let supplied = url.searchParams.get('cnpj') || '';

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        supplied = body?.cnpj || body?.documento || supplied;
      } catch {
        // O parâmetro da URL continua válido mesmo sem JSON.
      }
    }

    const cnpj = onlyCnpjChars(supplied);
    if (cnpj.length !== 14) {
      return json(400, { ok: false, message: 'Informe um CNPJ com 14 caracteres.' });
    }
    if (!/^\d{14}$/.test(cnpj)) {
      return json(422, {
        ok: false,
        message: 'A consulta automática está disponível para CNPJ numérico. O preenchimento manual continua liberado.'
      });
    }

    const data = await lookup(cnpj);
    const clientData = toClientData(data);

    // Retorna os dois padrões de nomes para compatibilidade.
    return json(200, {
      ok: true,
      data: clientData,
      ...clientData,
      source: clientData.fonte_cnpj,
      fonte: clientData.fonte_cnpj
    });
  } catch (error) {
    console.error('[cnpj-lookup]', error.message);
    return json(502, {
      ok: false,
      message: 'Nenhuma fonte pública respondeu no momento. Preencha os campos manualmente e tente novamente mais tarde.'
    });
  }
}
