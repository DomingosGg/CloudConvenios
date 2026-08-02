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

  function flattenValues(value) {
    if (Array.isArray(value)) return value.flatMap(flattenValues);
    if (value && typeof value === 'object') return Object.values(value).flatMap(flattenValues);
    return [value];
  }

  function normalizeEmail(value) {
    const candidates = flattenValues(value)
      .flatMap((item) => cleanText(item, 500).split(/[;,|\s]+/))
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return candidates.find((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) || '';
  }

  function normalizePhone(value) {
    const candidates = flattenValues(value)
      .map((item) => cleanText(item, 120))
      .flatMap((item) => item.split(/[;/|]+/))
      .map((item) => item.replace(/\D/g, ''))
      .map((digits) => digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits)
      .filter((digits) => digits.length === 10 || digits.length === 11);

    return candidates[0] || '';
  }


  function formatCnaeCode(value) {
    const raw = cleanText(value, 40);
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 7) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}`;
    }
    return raw;
  }

  function formatCnae(code, description) {
    const formattedCode = formatCnaeCode(code);
    const text = cleanText(description, 220);
    if (formattedCode && text && normalizeTextForCompare(formattedCode) !== normalizeTextForCompare(text)) {
      return `${formattedCode} — ${text}`;
    }
    return formattedCode || text;
  }

  function formatNature(code, description) {
    const normalizedCode = cleanText(code, 40);
    const text = cleanText(description, 220);

    if (text && normalizedCode && text !== normalizedCode && !text.includes(normalizedCode)) {
      return `${normalizedCode} — ${text}`;
    }

    return text || normalizedCode;
  }

  function normalizeTextForCompare(value) {
    return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function classifyLegalNature(value = '') {
    const raw = cleanText(value, 300);
    if (!raw) return 'Não identificado';
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (/^1\d{3}$/.test(digits) || ['2011','2038'].includes(digits)) return 'Público';
    const text = normalizeTextForCompare(raw);
    const terms = ['orgao publico','autarquia','fundacao publica','fundo publico','empresa publica','sociedade de economia mista','consorcio publico','estado ou distrito federal','municipio','uniao','comissao polinacional'];
    if (terms.some((term) => text.includes(term))) return 'Público';
    if (digits.startsWith('5')) return 'Não identificado';
    return 'Privado';
  }

  function normalizeBrasilApi(raw) {
    return {
      cnpj: normalizeCnpj(raw.cnpj),
      razaoSocial: cleanText(raw.razao_social),
      nomeFantasia: cleanText(raw.nome_fantasia),
      dataAbertura: normalizeDate(raw.data_inicio_atividade),
      situacaoCadastral: firstText(raw.descricao_situacao_cadastral, raw.situacao_cadastral),
      naturezaJuridica: formatNature(firstText(raw.codigo_natureza_juridica, raw.natureza_juridica), raw.descricao_natureza_juridica),
      tipoNatureza: classifyLegalNature(formatNature(firstText(raw.codigo_natureza_juridica, raw.natureza_juridica), raw.descricao_natureza_juridica)),
      cnaePrincipal: formatCnae(raw.cnae_fiscal, raw.cnae_fiscal_descricao),
      email: normalizeEmail(raw.email),
      telefone: normalizePhone([raw.ddd_telefone_1, raw.ddd_telefone_2]),
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
      naturezaJuridica: formatNature(
        firstText(data.naturezaJuridica?.codigo, data.legalNature?.code, data.codigoNaturezaJuridica),
        firstText(
          data.naturezaJuridica?.descricao,
          data.legalNature?.description,
          typeof data.naturezaJuridica === 'string' ? data.naturezaJuridica : '',
          typeof data.legalNature === 'string' ? data.legalNature : ''
        )
      ),
      tipoNatureza: classifyLegalNature(formatNature(
        firstText(data.naturezaJuridica?.codigo, data.legalNature?.code, data.codigoNaturezaJuridica),
        firstText(data.naturezaJuridica?.descricao, data.legalNature?.description, typeof data.naturezaJuridica === 'string' ? data.naturezaJuridica : '', typeof data.legalNature === 'string' ? data.legalNature : '')
      )),
      cnaePrincipal: formatCnae(
        firstText(data.cnaePrincipal?.codigo, data.cnaePrincipal?.code, data.cnaeCodigo, data.mainActivity?.code),
        firstText(data.cnaePrincipal?.descricao, data.cnaePrincipal?.description, data.mainActivity?.text, data.mainActivity)
      ),
      email: normalizeEmail(firstText(data.email, data.emails, data.correioEletronico)),
      telefone: normalizePhone(firstText(data.telefone, data.telefones, data.phone, data.phones)),
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


  function normalizeFunctionResponse(raw) {
    const data = raw?.data || raw || {};
    const source = firstText(
      Array.isArray(data.fontes) ? data.fontes.join(', ') : data.fontes,
      data.fonte,
      data.fonte_cnpj,
      raw?.source,
      raw?.fonte
    );

    return {
      cnpj: normalizeCnpj(firstText(data.cnpj)),
      razaoSocial: firstText(data.razaoSocial, data.razao_social, data.nome, data.legalName),
      nomeFantasia: firstText(data.nomeFantasia, data.nome_fantasia, data.fantasia, data.tradeName),
      dataAbertura: normalizeDate(firstText(
        data.dataAbertura,
        data.data_abertura,
        data.data_inicio_atividade,
        data.abertura,
        data.openingDate
      )),
      situacaoCadastral: firstText(
        data.situacaoCadastral,
        data.situacao_cadastral,
        data.descricao_situacao_cadastral,
        data.situacao,
        data.status
      ),
      naturezaJuridica: firstText(
        data.naturezaJuridica,
        data.natureza_juridica,
        data.descricao_natureza_juridica,
        data.legalNature
      ),
      tipoNatureza: firstText(data.tipoNatureza, data.tipo_natureza) || classifyLegalNature(firstText(data.naturezaJuridica, data.natureza_juridica, data.descricao_natureza_juridica, data.legalNature)),
      cnaePrincipal: firstText(
        data.cnaePrincipal,
        formatCnae(
          firstText(data.cnae_codigo, data.cnaeCodigo, data.cnae_fiscal, data.mainActivity?.code),
          firstText(data.cnae_descricao, data.cnaeDescricao, data.cnae_fiscal_descricao, data.mainActivity?.text)
        ),
        data.cnae_principal,
        data.mainActivity
      ),
      email: normalizeEmail(firstText(data.email, data.emails, data.correioEletronico)),
      telefone: normalizePhone(firstText(data.telefone, data.telefones, data.phone, data.phones)),
      cep: cleanText(firstText(data.cep, data.zip))
        .replace(/\D/g, '')
        .slice(0, 8),
      logradouro: firstText(data.logradouro, data.endereco, data.address),
      numero: firstText(data.numero, data.number),
      complemento: firstText(data.complemento, data.complement),
      bairro: firstText(data.bairro, data.neighborhood),
      cidade: firstText(data.cidade, data.municipio, data.city),
      estado: cleanText(firstText(data.estado, data.uf, data.state), 2).toUpperCase(),
      fontes: source
        ? source.split(',').map((item) => cleanText(item)).filter(Boolean)
        : [],
      consultadoEm: firstText(data.consultadoEm, data.consultado_em) || new Date().toISOString()
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
      data: normalizeFunctionResponse(payload.data || payload),
      attempts: payload.attempts || [],
      cached: Boolean(payload.cached),
      mode: 'function'
    };
  }

  function mergeCompanyData(records) {
    const fields = [
      'cnpj', 'razaoSocial', 'nomeFantasia', 'dataAbertura', 'situacaoCadastral',
      'naturezaJuridica', 'tipoNatureza', 'cnaePrincipal', 'email', 'telefone', 'cep',
      'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado'
    ];
    const merged = Object.fromEntries(fields.map((field) => [field, '']));
    const sources = [];

    records.forEach((record) => {
      if (!record) return;
      fields.forEach((field) => {
        if (!merged[field] && cleanText(record[field])) merged[field] = record[field];
      });
      (record.fontes || []).forEach((source) => {
        const text = cleanText(source);
        if (text && !sources.includes(text)) sources.push(text);
      });
    });

    if (!merged.nomeFantasia) merged.nomeFantasia = merged.razaoSocial;
    merged.tipoNatureza = merged.tipoNatureza || classifyLegalNature(merged.naturezaJuridica);
    merged.fontes = sources;
    merged.consultadoEm = new Date().toISOString();
    return merged;
  }

  async function lookupCepDirect(cep) {
    const digits = cleanText(cep).replace(/\D/g, '').slice(0, 8);
    if (digits.length !== 8) return null;

    const { response, payload } = await requestJson(
      `https://viacep.com.br/ws/${digits}/json/`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' },
      7000
    );

    if (!response.ok || payload?.erro) throw new Error('CEP não localizado.');

    return {
      cep: digits,
      logradouro: cleanText(payload.logradouro),
      complemento: cleanText(payload.complemento),
      bairro: cleanText(payload.bairro),
      cidade: cleanText(payload.localidade),
      estado: cleanText(payload.uf, 2).toUpperCase(),
      fontes: ['ViaCEP'],
      consultadoEm: new Date().toISOString()
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
        valid: (raw) => raw && raw.success !== false && (raw.data || raw.razaoSocial || raw.razao_social || raw.cnpj),
        normalize: normalizeOpenCnpj
      }
    ];

    const settled = await Promise.allSettled(providers.map(async (provider) => {
      const { response, payload } = await requestJson(
        provider.url,
        { headers: { Accept: 'application/json' }, cache: 'no-store' },
        10000
      );
      if (!response.ok || !provider.valid(payload)) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      return provider.normalize(payload);
    }));

    const attempts = settled.map((result, index) => ({
      source: providers[index].name,
      ok: result.status === 'fulfilled',
      message: result.status === 'rejected' ? cleanText(result.reason?.message, 160) : ''
    }));
    const records = settled
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);

    if (!records.length) {
      const error = new Error('Não foi possível localizar este CNPJ nas fontes gratuitas. Confirme os 14 números ou preencha manualmente.');
      error.attempts = attempts;
      throw error;
    }

    let merged = mergeCompanyData(records);

    if (
      merged.cep
      && ['logradouro', 'bairro', 'cidade', 'estado'].some((field) => !cleanText(merged[field]))
    ) {
      try {
        const address = await lookupCepDirect(merged.cep);
        if (address) merged = mergeCompanyData([...records, address]);
        attempts.push({ source: 'ViaCEP', ok: Boolean(address), message: '' });
      } catch (error) {
        attempts.push({ source: 'ViaCEP', ok: false, message: cleanText(error?.message, 160) });
      }
    }

    return {
      data: merged,
      attempts,
      cached: false,
      mode: 'direct'
    };
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
