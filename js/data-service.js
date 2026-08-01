(() => {
  'use strict';

  const client = window.database?.client || null;
  const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

  const cnpjKey = (value = '') => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nullable = (value) => {
    const text = String(value ?? '').trim();
    return text || null;
  };

  function contactFromDatabase(row = {}) {
    return {
      id: row.id,
      data: row.data_contato || '',
      horario: String(row.horario || '').slice(0, 5),
      responsavel: row.responsavel || '',
      forma: row.forma_contato || '',
      pessoa: row.pessoa_contatada || '',
      resultado: row.resultado_contato || '',
      proximaAcao: row.proxima_acao || '',
      proximaData: row.proximo_contato || '',
      observacoes: row.observacoes || '',
      createdAt: row.criado_em || '',
      updatedAt: row.atualizado_em || ''
    };
  }

  function companyFromDatabase(row = {}) {
    return {
      id: row.id,
      cnpj: row.cnpj || '',
      razaoSocial: row.razao_social || '',
      nomeFantasia: row.nome_fantasia || '',
      dataAbertura: row.data_abertura || '',
      situacaoCadastral: row.situacao_cadastral || '',
      naturezaJuridica: row.natureza_juridica || '',
      cnaePrincipal: row.cnae_principal || '',
      logradouro: row.logradouro || '',
      numero: row.numero || '',
      complemento: row.complemento || '',
      bairro: row.bairro || '',
      fonteCnpj: row.fonte_cnpj || '',
      consultadoEm: row.consultado_em || '',
      inicioVigencia: row.inicio_vigencia || '',
      fimVigencia: row.fim_vigencia || '',
      dataCadastro: row.data_cadastro || '',
      estado: row.estado || '',
      cidade: row.cidade || '',
      cep: row.cep || '',
      email: row.email || '',
      telefone: row.telefone || '',
      polo: row.polo || '',
      situacao: row.situacao || 'Não contatado',
      formasContato: Array.isArray(row.formas_contato) ? row.formas_contato : [],
      observacoes: row.observacoes || '',
      contatos: Array.isArray(row.contatos) ? row.contatos.map(contactFromDatabase) : [],
      demo: Boolean(row.demonstracao),
      createdAt: row.criado_em || '',
      updatedAt: row.atualizado_em || ''
    };
  }

  function companyToDatabase(company = {}, { includeId = false } = {}) {
    const payload = {
      cnpj: nullable(company.cnpj),
      razao_social: String(company.razaoSocial || '').trim(),
      nome_fantasia: String(company.nomeFantasia || '').trim(),
      data_abertura: nullable(company.dataAbertura),
      situacao_cadastral: nullable(company.situacaoCadastral),
      natureza_juridica: nullable(company.naturezaJuridica),
      cnae_principal: nullable(company.cnaePrincipal),
      logradouro: nullable(company.logradouro),
      numero: nullable(company.numero),
      complemento: nullable(company.complemento),
      bairro: nullable(company.bairro),
      fonte_cnpj: nullable(company.fonteCnpj),
      consultado_em: nullable(company.consultadoEm),
      inicio_vigencia: nullable(company.inicioVigencia),
      fim_vigencia: nullable(company.fimVigencia),
      data_cadastro: nullable(company.dataCadastro),
      estado: String(company.estado || '').trim().toUpperCase(),
      cidade: String(company.cidade || '').trim(),
      cep: nullable(company.cep),
      email: nullable(company.email),
      telefone: nullable(company.telefone),
      polo: String(company.polo || '').trim(),
      situacao: company.situacao || 'Não contatado',
      formas_contato: Array.isArray(company.formasContato) ? company.formasContato : [],
      observacoes: nullable(company.observacoes),
      demonstracao: Boolean(company.demo)
    };

    if (includeId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(company.id || '')) {
      payload.id = company.id;
    }

    return payload;
  }

  function contactToDatabase(contact = {}, companyId) {
    return {
      concedente_id: companyId,
      data_contato: contact.data,
      horario: contact.horario,
      responsavel: String(contact.responsavel || '').trim(),
      forma_contato: contact.forma,
      pessoa_contatada: nullable(contact.pessoa),
      resultado_contato: contact.resultado,
      proxima_acao: nullable(contact.proximaAcao),
      proximo_contato: nullable(contact.proximaData),
      observacoes: nullable(contact.observacoes)
    };
  }

  function assertClient() {
    if (!client) throw new Error('A conexão com o Supabase não está disponível.');
    if (!window.currentUser?.id) throw new Error('Sua sessão expirou. Entre novamente no sistema.');
  }

  function assertAdmin() {
    assertClient();
    const role = String(window.currentUser?.perfil || '').trim().toLowerCase();
    if (role !== 'administrador') {
      throw new Error('Esta operação é exclusiva do administrador.');
    }
  }

  function databaseError(error, fallback = 'Falha na operação com o banco de dados.') {
    if (!error) return new Error(fallback);
    const message = error.message || error.details || fallback;
    const normalized = String(message).toLowerCase();
    if (error.code === '23505' || normalized.includes('duplicate key')) {
      return new Error('Já existe uma concedente cadastrada com este CNPJ.');
    }
    if (error.code === '42501' || normalized.includes('row-level security') || normalized.includes('permission denied')) {
      return new Error('Seu perfil não possui permissão para realizar esta ação.');
    }
    return new Error(message);
  }

  async function listCompanies() {
    assertClient();
    const { data, error } = await client
      .from('concedentes')
      .select(`
        id, cnpj, razao_social, nome_fantasia, data_abertura, situacao_cadastral,
        natureza_juridica, cnae_principal, logradouro, numero, complemento, bairro,
        fonte_cnpj, consultado_em, inicio_vigencia, fim_vigencia, data_cadastro,
        estado, cidade, cep, email, telefone, polo, situacao,
        formas_contato, observacoes, demonstracao, criado_em, atualizado_em,
        contatos (
          id, data_contato, horario, responsavel, forma_contato,
          pessoa_contatada, resultado_contato, proxima_acao,
          proximo_contato, observacoes, criado_em, atualizado_em
        )
      `)
      .order('atualizado_em', { ascending: false });

    if (error) throw databaseError(error, 'Não foi possível carregar as concedentes.');
    return (data || []).map(companyFromDatabase);
  }

  async function createCompany(company, { preserveId = false } = {}) {
    assertClient();
    const payload = companyToDatabase(company, { includeId: preserveId });
    const { data, error } = await client
      .from('concedentes')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw databaseError(error, 'Não foi possível cadastrar a concedente.');
    return companyFromDatabase({ ...data, contatos: [] });
  }

  async function updateCompany(company) {
    assertClient();
    const payload = companyToDatabase(company);
    const { data, error } = await client
      .from('concedentes')
      .update(payload)
      .eq('id', company.id)
      .select('*')
      .single();

    if (error) throw databaseError(error, 'Não foi possível atualizar a concedente.');
    return companyFromDatabase({ ...data, contatos: company.contatos || [] });
  }

  async function saveCompany(company, exists = false) {
    return exists ? updateCompany(company) : createCompany(company);
  }

  async function deleteCompany(id) {
    assertAdmin();
    const { error } = await client.from('concedentes').delete().eq('id', id);
    if (error) throw databaseError(error, 'Não foi possível excluir a concedente.');
  }

  async function updateCompanyStatus(id, status, formasContato) {
    assertClient();
    const payload = { situacao: status };
    if (Array.isArray(formasContato)) payload.formas_contato = formasContato;
    const { data, error } = await client
      .from('concedentes')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw databaseError(error, 'Não foi possível atualizar a situação.');
    return companyFromDatabase(data);
  }

  async function createContact(companyId, contact, company) {
    assertClient();
    const { data, error } = await client
      .from('contatos')
      .insert(contactToDatabase(contact, companyId))
      .select('*')
      .single();
    if (error) throw databaseError(error, 'Não foi possível registrar o contato.');

    const formas = [...new Set([...(company?.formasContato || []), contact.forma].filter(Boolean))];
    try {
      await updateCompanyStatus(companyId, contact.resultado, formas);
    } catch (updateError) {
      // O contato foi salvo. Mantemos o registro e informamos a falha ao chamador.
      throw new Error(`O contato foi registrado, mas a situação da concedente não foi atualizada: ${updateError.message}`);
    }

    return contactFromDatabase(data);
  }

  async function updateContact(companyId, contact, company) {
    assertClient();
    if (!contact?.id) throw new Error('Registro de contato inválido.');

    const { data, error } = await client
      .from('contatos')
      .update(contactToDatabase(contact, companyId))
      .eq('id', contact.id)
      .eq('concedente_id', companyId)
      .select('*')
      .single();

    if (error) throw databaseError(error, 'Não foi possível atualizar o contato.');

    const saved = contactFromDatabase(data);
    const projectedContacts = (company?.contatos || []).map((item) => item.id === saved.id ? saved : item);
    const latest = [...projectedContacts].sort((a, b) => `${b.data} ${b.horario}`.localeCompare(`${a.data} ${a.horario}`))[0] || saved;
    const formas = [...new Set(projectedContacts.map((item) => item.forma).filter(Boolean))];

    try {
      await updateCompanyStatus(companyId, latest.resultado || company?.situacao || 'Não contatado', formas);
    } catch (updateError) {
      throw new Error(`O contato foi atualizado, mas a situação da concedente não foi sincronizada: ${updateError.message}`);
    }

    return saved;
  }

  async function deleteDemonstration() {
    assertAdmin();
    const { data, error } = await client
      .from('concedentes')
      .delete()
      .eq('demonstracao', true)
      .select('id');
    if (error) throw databaseError(error, 'Não foi possível excluir os dados de demonstração.');
    return data?.length || 0;
  }

  async function clearAll() {
    assertAdmin();
    const { data, error } = await client
      .from('concedentes')
      .delete()
      .neq('id', ZERO_UUID)
      .select('id');
    if (error) throw databaseError(error, 'Não foi possível limpar os dados do banco.');
    return data?.length || 0;
  }

  async function insertCompaniesWithContacts(companies, options = {}) {
    assertClient();
    const preserveIds = Boolean(options.preserveIds);
    let inserted = 0;
    let contactsInserted = 0;
    let rejected = 0;
    const errors = [];

    for (const original of companies || []) {
      try {
        const company = await createCompany(original, { preserveId: preserveIds });
        inserted += 1;
        for (const contact of original.contatos || []) {
          try {
            const { error } = await client
              .from('contatos')
              .insert(contactToDatabase(contact, company.id));
            if (error) throw databaseError(error);
            contactsInserted += 1;
          } catch (contactError) {
            errors.push(`${original.nomeFantasia || original.razaoSocial}: ${contactError.message}`);
          }
        }
      } catch (error) {
        rejected += 1;
        errors.push(`${original.nomeFantasia || original.razaoSocial || 'Registro sem nome'}: ${error.message}`);
      }
    }

    return { inserted, contactsInserted, rejected, errors };
  }

  async function replaceAll(companies) {
    assertAdmin();
    await clearAll();
    return insertCompaniesWithContacts(companies);
  }

  async function migrateLocal(companies) {
    assertAdmin();
    const current = await listCompanies();
    const cnpjMap = new Map(current.filter((item) => cnpjKey(item.cnpj)).map((item) => [cnpjKey(item.cnpj), item]));
    let inserted = 0;
    let updated = 0;
    let contactsInserted = 0;
    let rejected = 0;
    const errors = [];

    for (const source of companies || []) {
      try {
        const digits = cnpjKey(source.cnpj);
        const existing = digits ? cnpjMap.get(digits) : null;
        let target;
        if (existing) {
          target = await updateCompany({ ...source, id: existing.id, contatos: existing.contatos || [] });
          updated += 1;
        } else {
          target = await createCompany(source);
          inserted += 1;
          if (digits) cnpjMap.set(digits, target);
        }

        const existingContactKeys = new Set((existing?.contatos || []).map((contact) => `${contact.data}|${contact.horario}|${contact.resultado}|${contact.responsavel}`));
        for (const contact of source.contatos || []) {
          const key = `${contact.data}|${contact.horario}|${contact.resultado}|${contact.responsavel}`;
          if (existingContactKeys.has(key)) continue;
          const { error } = await client.from('contatos').insert(contactToDatabase(contact, target.id));
          if (error) throw databaseError(error);
          contactsInserted += 1;
          existingContactKeys.add(key);
        }
      } catch (error) {
        rejected += 1;
        errors.push(`${source.nomeFantasia || source.razaoSocial || 'Registro sem nome'}: ${error.message}`);
      }
    }

    return { inserted, updated, contactsInserted, rejected, errors };
  }

  window.remoteData = Object.freeze({
    listCompanies,
    createCompany,
    updateCompany,
    saveCompany,
    deleteCompany,
    updateCompanyStatus,
    createContact,
    updateContact,
    deleteDemonstration,
    clearAll,
    insertCompaniesWithContacts,
    replaceAll,
    migrateLocal,
    companyFromDatabase,
    contactFromDatabase
  });
})();
