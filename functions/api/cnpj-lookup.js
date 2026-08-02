const VERSION = 'cloudflare-pages-cnpj-2.0.0-v849';

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

const DATA_FIELDS = [
  'cnpj',
  'razao_social',
  'nome_fantasia',
  'data_abertura',
  'situacao_cadastral',
  'natureza_juridica',
  'cnae_principal',
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'estado',
  'cidade',
  'email',
  'telefone'
];

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...extraHeaders }
  });
}

function clean(value, max = 300) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function onlyCnpjChars(value) {
  return clean(value, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') ?? '';
}

function flattenValues(value) {
  if (Array.isArray(value)) return value.flatMap(flattenValues);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(flattenValues);
  }
  return [value];
}

function normalizeEmail(value) {
  const candidates = flattenValues(value)
    .flatMap((item) => clean(item, 500).split(/[;,|\s]+/))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return candidates.find((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) || '';
}

function normalizePhone(value) {
  const candidates = flattenValues(value)
    .map((item) => clean(item, 100))
    .flatMap((item) => item.split(/[;/|]+/))
    .map((item) => item.replace(/\D/g, ''))
    .map((digits) => {
      if (digits.startsWith('55') && digits.length > 11) return digits.slice(2);
      return digits;
    })
    .filter((digits) => digits.length === 10 || digits.length === 11);

  return candidates[0] || '';
}

function formatCnaeCode(value) {
  const raw = clean(value, 40);
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 7) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}`;
  }
  return raw;
}

function formatCnae(code, description) {
  const formattedCode = formatCnaeCode(code);
  const text = clean(description, 220);
  if (formattedCode && text && formattedCode.toLowerCase() !== text.toLowerCase()) {
    return `${formattedCode} — ${text}`;
  }
  return formattedCode || text;
}

function formatNature(code, description) {
  const normalizedCode = clean(code, 40);
  const text = clean(description, 220);

  if (text && normalizedCode && text !== normalizedCode && !text.includes(normalizedCode)) {
    return `${normalizedCode} — ${text}`;
  }

  return text || normalizedCode;
}

function normalizeBrasilApi(raw) {
  return {
    cnpj: clean(raw.cnpj),
    razao_social: clean(raw.razao_social),
    nome_fantasia: clean(raw.nome_fantasia),
    data_abertura: clean(raw.data_inicio_atividade),
    situacao_cadastral: clean(first(raw.descricao_situacao_cadastral, raw.situacao_cadastral)),
    natureza_juridica: formatNature(
      first(raw.codigo_natureza_juridica, raw.natureza_juridica),
      raw.descricao_natureza_juridica
    ),
    cnae_principal: formatCnae(raw.cnae_fiscal, raw.cnae_fiscal_descricao),
    cep: clean(raw.cep),
    logradouro: clean([raw.descricao_tipo_de_logradouro, raw.logradouro].filter(Boolean).join(' ')),
    numero: clean(raw.numero),
    complemento: clean(raw.complemento),
    bairro: clean(raw.bairro),
    estado: clean(raw.uf, 2).toUpperCase(),
    cidade: clean(raw.municipio),
    email: normalizeEmail(raw.email),
    telefone: normalizePhone([raw.ddd_telefone_1, raw.ddd_telefone_2]),
    fonte_cnpj: 'BrasilAPI'
  };
}

function normalizeOpenCnpj(raw) {
  const data = raw?.data || raw || {};
  const company = data.empresa || data.company || {};
  const establishment = data.estabelecimento || data.establishment || {};
  const address = first(data.endereco, data.address, establishment.endereco, establishment.address) || {};
  const principal = first(
    data.cnae_principal,
    data.atividade_principal,
    establishment.atividade_principal,
    establishment.cnae_principal,
    data.mainActivity
  ) || {};
  const legalNature = first(
    data.natureza_juridica,
    company.natureza_juridica,
    data.legalNature,
    company.legalNature
  ) || {};

  return {
    cnpj: clean(first(data.cnpj, establishment.cnpj)),
    razao_social: clean(first(
      data.razao_social,
      data.razaoSocial,
      data.nome,
      data.legalName,
      company.razao_social,
      company.razaoSocial,
      company.nome,
      company.legalName
    )),
    nome_fantasia: clean(first(
      data.nome_fantasia,
      data.nomeFantasia,
      data.fantasia,
      data.tradeName,
      establishment.nome_fantasia,
      establishment.nomeFantasia,
      establishment.fantasia,
      establishment.tradeName
    )),
    data_abertura: clean(first(
      data.data_inicio_atividade,
      data.data_abertura,
      data.dataInicioAtividades,
      data.openingDate,
      establishment.data_inicio_atividade,
      establishment.data_abertura
    )),
    situacao_cadastral: clean(first(
      data.situacao_cadastral,
      data.descricao_situacao_cadastral,
      data.situacaoCadastral,
      data.status,
      establishment.situacao_cadastral,
      establishment.situacaoCadastral,
      establishment.status
    )),
    natureza_juridica: formatNature(
      first(
        legalNature.codigo,
        legalNature.code,
        data.codigo_natureza_juridica,
        company.codigo_natureza_juridica
      ),
      first(
        legalNature.descricao,
        legalNature.description,
        typeof legalNature === 'string' ? legalNature : '',
        data.descricao_natureza_juridica,
        company.descricao_natureza_juridica
      )
    ),
    cnae_principal: formatCnae(
      first(
        principal.codigo,
        principal.code,
        data.cnae_codigo,
        data.cnaeCodigo,
        establishment.cnae_codigo
      ),
      first(
        principal.descricao,
        principal.texto,
        principal.text,
        principal.description,
        typeof principal === 'string' ? principal : ''
      )
    ),
    cep: clean(first(data.cep, address.cep, address.zip, establishment.cep)),
    logradouro: clean(first(
      data.logradouro,
      address.logradouro,
      address.street,
      establishment.logradouro
    )),
    numero: clean(first(data.numero, address.numero, address.number, establishment.numero)),
    complemento: clean(first(
      data.complemento,
      address.complemento,
      address.complement,
      establishment.complemento
    )),
    bairro: clean(first(
      data.bairro,
      address.bairro,
      address.neighborhood,
      establishment.bairro
    )),
    estado: clean(first(
      data.uf,
      data.estado,
      data.state,
      address.uf,
      address.estado,
      address.state,
      establishment.uf
    ), 2).toUpperCase(),
    cidade: clean(first(
      data.municipio,
      data.cidade,
      data.city,
      address.municipio,
      address.cidade,
      address.city,
      establishment.municipio?.descricao,
      establishment.municipio,
      establishment.cidade
    )),
    email: normalizeEmail(first(
      data.email,
      data.emails,
      data.correioEletronico,
      establishment.email,
      establishment.emails
    )),
    telefone: normalizePhone(first(
      data.telefone,
      data.telefones,
      data.phone,
      data.phones,
      establishment.telefone,
      establishment.telefones
    )),
    fonte_cnpj: 'OpenCNPJ'
  };
}

function normalizeMinhaReceita(raw) {
  return {
    cnpj: clean(raw.cnpj),
    razao_social: clean(raw.razao_social),
    nome_fantasia: clean(raw.nome_fantasia),
    data_abertura: clean(raw.data_inicio_atividade),
    situacao_cadastral: clean(first(raw.descricao_situacao_cadastral, raw.situacao_cadastral)),
    natureza_juridica: formatNature(
      first(raw.codigo_natureza_juridica, raw.natureza_juridica),
      raw.descricao_natureza_juridica
    ),
    cnae_principal: formatCnae(raw.cnae_fiscal, raw.cnae_fiscal_descricao),
    cep: clean(raw.cep),
    logradouro: clean([raw.descricao_tipo_de_logradouro, raw.logradouro].filter(Boolean).join(' ')),
    numero: clean(raw.numero),
    complemento: clean(raw.complemento),
    bairro: clean(raw.bairro),
    estado: clean(raw.uf, 2).toUpperCase(),
    cidade: clean(raw.municipio),
    email: normalizeEmail(raw.email),
    telefone: normalizePhone([raw.ddd_telefone_1, raw.ddd_telefone_2]),
    fonte_cnpj: 'Minha Receita'
  };
}

function normalizeReceitaWs(raw) {
  const activity = Array.isArray(raw.atividade_principal) ? raw.atividade_principal[0] : null;
  return {
    cnpj: clean(raw.cnpj),
    razao_social: clean(raw.nome),
    nome_fantasia: clean(raw.fantasia),
    data_abertura: clean(raw.abertura),
    situacao_cadastral: clean(raw.situacao),
    natureza_juridica: clean(raw.natureza_juridica),
    cnae_principal: formatCnae(activity?.code, activity?.text),
    cep: clean(raw.cep),
    logradouro: clean(raw.logradouro),
    numero: clean(raw.numero),
    complemento: clean(raw.complemento),
    bairro: clean(raw.bairro),
    estado: clean(raw.uf, 2).toUpperCase(),
    cidade: clean(raw.municipio),
    email: normalizeEmail(raw.email),
    telefone: normalizePhone(raw.telefone),
    fonte_cnpj: 'ReceitaWS'
  };
}

function mergeRecords(records) {
  const result = Object.fromEntries(DATA_FIELDS.map((field) => [field, '']));
  const sources = [];

  records.forEach((record) => {
    if (!record) return;
    DATA_FIELDS.forEach((field) => {
      if (!result[field] && clean(record[field])) result[field] = clean(record[field], field === 'email' ? 254 : 300);
    });
    const source = clean(record.fonte_cnpj);
    if (source && !sources.includes(source)) sources.push(source);
  });

  if (!result.nome_fantasia) result.nome_fantasia = result.razao_social;
  result.fonte_cnpj = sources.join(', ');
  result.fontes = sources;
  return result;
}

function missingCriticalFields(data) {
  return [
    'natureza_juridica',
    'email',
    'telefone',
    'cep',
    'logradouro',
    'bairro',
    'cidade',
    'estado'
  ].some((field) => !clean(data[field]));
}

async function fetchJson(url, normalizer, sourceName, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Gestao-Renovacoes-Convenios/2.0'
      },
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();
    if (raw?.status === 'ERROR' || raw?.erro === true || raw?.success === false) {
      throw new Error(raw?.message || 'Fonte retornou erro.');
    }

    const normalized = normalizer(raw);
    if (!normalized.razao_social && !normalized.nome_fantasia) {
      throw new Error('Fonte não retornou identificação da empresa.');
    }

    return {
      source: sourceName,
      data: normalized
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaCep(cep) {
  const digits = clean(cep, 20).replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();
    if (raw?.erro) throw new Error('CEP não encontrado.');

    return {
      cep: digits,
      logradouro: clean(raw.logradouro),
      complemento: clean(raw.complemento),
      bairro: clean(raw.bairro),
      cidade: clean(raw.localidade),
      estado: clean(raw.uf, 2).toUpperCase(),
      fonte_cnpj: 'ViaCEP'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function lookup(cnpj) {
  const providers = [
    {
      name: 'BrasilAPI',
      promise: fetchJson(
        `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(cnpj)}`,
        normalizeBrasilApi,
        'BrasilAPI',
        10000
      )
    },
    {
      name: 'OpenCNPJ',
      promise: fetchJson(
        `https://kitana.opencnpj.com/cnpj/${encodeURIComponent(cnpj)}`,
        normalizeOpenCnpj,
        'OpenCNPJ',
        10000
      )
    },
    {
      name: 'Minha Receita',
      promise: fetchJson(
        `https://minhareceita.org/${encodeURIComponent(cnpj)}`,
        normalizeMinhaReceita,
        'Minha Receita',
        10000
      )
    }
  ];

  const settled = await Promise.allSettled(providers.map((provider) => provider.promise));
  const attempts = settled.map((result, index) => ({
    source: providers[index].name,
    ok: result.status === 'fulfilled',
    message: result.status === 'rejected' ? clean(result.reason?.message, 180) : ''
  }));
  const records = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value.data);

  if (!records.length) {
    try {
      const fallback = await fetchJson(
        `https://www.receitaws.com.br/v1/cnpj/${encodeURIComponent(cnpj)}`,
        normalizeReceitaWs,
        'ReceitaWS',
        12000
      );
      records.push(fallback.data);
      attempts.push({ source: 'ReceitaWS', ok: true, message: '' });
    } catch (error) {
      attempts.push({ source: 'ReceitaWS', ok: false, message: clean(error?.message, 180) });
    }
  } else {
    let preview = mergeRecords(records);
    if (missingCriticalFields(preview)) {
      try {
        const fallback = await fetchJson(
          `https://www.receitaws.com.br/v1/cnpj/${encodeURIComponent(cnpj)}`,
          normalizeReceitaWs,
          'ReceitaWS',
          12000
        );
        records.push(fallback.data);
        attempts.push({ source: 'ReceitaWS', ok: true, message: '' });
      } catch (error) {
        attempts.push({ source: 'ReceitaWS', ok: false, message: clean(error?.message, 180) });
      }
    }
  }

  if (!records.length) {
    const error = new Error('Nenhuma fonte pública respondeu no momento.');
    error.attempts = attempts;
    throw error;
  }

  let merged = mergeRecords(records);

  if (
    merged.cep
    && ['logradouro', 'bairro', 'cidade', 'estado'].some((field) => !clean(merged[field]))
  ) {
    try {
      const address = await fetchViaCep(merged.cep);
      if (address) merged = mergeRecords([...records, address]);
      attempts.push({ source: 'ViaCEP', ok: Boolean(address), message: '' });
    } catch (error) {
      attempts.push({ source: 'ViaCEP', ok: false, message: clean(error?.message, 180) });
    }
  }

  merged.attempts = attempts;
  return merged;
}

function toClientData(data) {
  const sources = Array.isArray(data.fontes)
    ? data.fontes
    : clean(data.fonte_cnpj)
      ? clean(data.fonte_cnpj).split(',').map((item) => clean(item)).filter(Boolean)
      : [];
  const consultedAt = new Date().toISOString();

  return {
    ...data,

    razaoSocial: clean(data.razao_social),
    nomeFantasia: clean(data.nome_fantasia),
    dataAbertura: clean(data.data_abertura),
    situacaoCadastral: clean(data.situacao_cadastral),
    naturezaJuridica: clean(data.natureza_juridica),
    cnaePrincipal: clean(data.cnae_principal),
    email: normalizeEmail(data.email),
    telefone: normalizePhone(data.telefone),
    cep: clean(data.cep).replace(/\D/g, '').slice(0, 8),
    logradouro: clean(data.logradouro),
    numero: clean(data.numero),
    complemento: clean(data.complemento),
    bairro: clean(data.bairro),
    cidade: clean(data.cidade),
    estado: clean(data.estado, 2).toUpperCase(),
    fontes: sources,
    consultadoEm: consultedAt,

    fonte: sources.join(', '),
    consultado_em: consultedAt
  };
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

    return json(200, {
      ok: true,
      version: VERSION,
      data: clientData,
      ...clientData,
      attempts: data.attempts || [],
      source: clientData.fontes.join(', '),
      fonte: clientData.fontes.join(', ')
    });
  } catch (error) {
    console.error('[cnpj-lookup]', error?.message || error);
    return json(502, {
      ok: false,
      version: VERSION,
      attempts: error?.attempts || [],
      message: 'Nenhuma fonte pública respondeu no momento. Preencha os campos manualmente e tente novamente mais tarde.'
    });
  }
}
