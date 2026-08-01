(() => {
  'use strict';

  const cache = new Map();
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

  function normalizeCnpj(value) {
    const raw = String(value ?? '').replace(/^\s*CNPJ\s*[:\-]?\s*/i, '');
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 14) return digits.slice(0, 14);
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
  }

  function cleanText(value, max = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function normalizeDate(value) {
    if (!value) return '';
    const raw = String(value).trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return '';
  }

  function firstText(...values) {
    for (const value of values) {
      const text = cleanText(value);
      if (text) return text;
    }
    return '';
  }

  function normalizeBrasilApi(raw) {
    return {
      cnpj: normalizeCnpj(raw.cnpj),
      razaoSocial: cleanText(raw.razao_social),
      nomeFantasia: cleanText(raw.nome_fantasia),
      dataAbertura: normalizeDate(raw.data_inicio_atividade),
      situacaoCadastral: firstText(raw.descricao_situacao_cadastral, raw.situacao_cadastral),
      naturezaJuridica: cleanText(raw.natureza_juridica),
      cnaePrincipal: [cleanText(raw.cnae_fiscal), cleanText(raw.cnae_fiscal_descricao)].filter(Boolean).join(' — '),
      email: cleanText(raw.email, 254).toLowerCase(),
      telefone: cleanText(firstText(raw.ddd_telefone_1, raw.ddd_telefone_2)).replace(/\D/g, '').slice(0, 11),
      cep: cleanText(raw.cep).replace(/\D/g, '').slice(0, 8),
      logradouro: firstText([raw.descricao_tipo_de_logradouro, raw.logradouro].filter(Boolean).join(' '), raw.logradouro),
      numero: cleanText(raw.numero, 40),
      complemento: cleanText(raw.complemento, 180),
      bairro: cleanText(raw.bairro, 120),
      cidade: cleanText(raw.municipio, 120),
      estado: cleanText(raw.uf, 2).toUpperCase(),
      fontes: ['BrasilAPI'],
      consultadoEm: new Date().toISOString()
    };
  }

  function normalizeOpenCnpj(raw) {
    const data = raw?.data || raw || {};
    return {
      cnpj: normalizeCnpj(data.cnpj),
      razaoSocial: firstText(data.razaoSocial, data.legalName, data.nome),
      nomeFantasia: firstText(data.nomeFantasia, data.tradeName, data.fantasia),
      dataAbertura: normalizeDate(firstText(data.dataInicioAtividades, data.dataAbertura, data.openingDate)),
      situacaoCadastral: firstText(data.situacaoCadastral, data.status),
      naturezaJuridica: firstText(data.naturezaJuridica, data.legalNature),
      cnaePrincipal: firstText(data.cnaePrincipal?.descricao, data.cnaePrincipal, data.mainActivity),
      email: cleanText(firstText(data.email, data.correioEletronico), 254).toLowerCase(),
      telefone: cleanText(firstText(data.telefone, data.phone)).replace(/\D/g, '').slice(0, 11),
      cep: cleanText(firstText(data.cep, data.zip)).replace(/\D/g, '').slice(0, 8),
      logradouro: firstText(data.logradouro, data.endereco, data.address),
      numero: firstText(data.numero, data.number),
      complemento: firstText(data.complemento, data.complement),
      bairro: firstText(data.bairro, data.neighborhood),
      cidade: firstText(data.municipio, data.cidade, data.city),
      estado: cleanText(firstText(data.uf, data.estado, data.state), 2).toUpperCase(),
      fontes: ['OpenCNPJ'],
      consultadoEm: new Date().toISOString()
    };
  }

  async function accessToken() {
    const client = window.database?.client;
    if (!client) return '';
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data?.session?.access_token || '';
  }

  async function requestJson(url, options = {}, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } finally {
      clearTimeout(timer);
    }
  }

  async function lookupThroughFunction(cnpj) {
    const token = await accessToken();
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const { response, payload } = await requestJson(
      `/api/cnpj-lookup?cnpj=${encodeURIComponent(cnpj)}`,
      { method: 'GET', headers },
      30000
    );
    if (!response.ok || payload.ok !== true) {
      const error = new Error(payload.message || `Consulta indisponível (${response.status}).`);
      error.status = response.status;
      error.attempts = payload.attempts || [];
      throw error;
    }
    return {
      data: payload.data || {},
      attempts: payload.attempts || [],
      cached: Boolean(payload.cached),
      mode: 'function'
    };
  }

  async function lookupDirect(cnpj) {
    const providers = [
      {
        name: 'BrasilAPI',
        url: `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(cnpj)}`,
        valid: (raw) => raw && !raw.message && !raw.error && (raw.razao_social || raw.nome_fantasia),
        normalize: normalizeBrasilApi
      },
      {
        name: 'OpenCNPJ',
        url: `https://kitana.opencnpj.com/cnpj/${encodeURIComponent(cnpj)}`,
        valid: (raw) => raw && raw.success !== false && (raw.data || raw.razaoSocial || raw.cnpj),
        normalize: normalizeOpenCnpj
      }
    ];
    const attempts = [];
    for (const provider of providers) {
      try {
        const { response, payload } = await requestJson(provider.url, { headers: { Accept: 'application/json' } }, 9000);
        if (!response.ok || !provider.valid(payload)) throw new Error(payload?.message || `HTTP ${response.status}`);
        return { data: provider.normalize(payload), attempts: [...attempts, { source: provider.name, ok: true }], cached: false, mode: 'direct' };
      } catch (error) {
        attempts.push({ source: provider.name, ok: false, message: cleanText(error.message, 160) });
      }
    }
    const error = new Error('Não foi possível localizar este CNPJ nas fontes gratuitas. Confirme os 14 números ou preencha manualmente.');
    error.attempts = attempts;
    throw error;
  }

  async function lookup(value, { force = false } = {}) {
    const cnpj = normalizeCnpj(value);
    if (cnpj.length !== 14) throw new Error('Informe os 14 caracteres do CNPJ.');

    const cached = cache.get(cnpj);
    if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return { ...cached.value, cached: true };
    }

    let result;
    try {
      result = await lookupThroughFunction(cnpj);
    } catch (functionError) {
      console.warn('[CNPJ] Função do Cloudflare Pages indisponível; tentando consulta direta.', functionError);
      result = await lookupDirect(cnpj);
      result.functionError = functionError.message;
    }

    cache.set(cnpj, { createdAt: Date.now(), value: result });
    return result;
  }

  window.cnpjService = Object.freeze({ lookup, normalizeCnpj });
})();
