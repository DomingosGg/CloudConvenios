(() => {
  'use strict';

  const client = window.database?.client || null;
  const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

  const cnpjKey = (value = '') => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const brandKey = (value = '') => {
    const key = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (key === 'uniasselvi') return 'Uniasselvi';
    if (key === 'unicesumar') return 'Unicesumar';
    return '';
  };
  const companyRegistrationKey = (company = {}) => {
    const cnpj = cnpjKey(company.cnpj);
    const brand = brandKey(company.marca);
    return cnpj && brand ? `${cnpj}|${brand}` : '';
  };
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


  function emailCommunicationFromDatabase(row = {}) {
    return {
      id: row.id,
      templateId: row.modelo_id || null,
      marca: row.marca || '',
      situacaoOrigem: row.situacao_origem || '',
      destinatario: row.destinatario || '',
      assunto: row.assunto || '',
      corpo: row.corpo || '',
      status: row.status || 'preparado',
      usuarioId: row.usuario_id || null,
      usuarioNome: row.usuario_nome || '',
      usuarioEmail: row.usuario_email || '',
      preparadoEm: row.preparado_em || row.criado_em || '',
      confirmadoEm: row.confirmado_em || '',
      criadoEm: row.criado_em || ''
    };
  }

  function emailTemplateFromDatabase(row = {}) {
    return {
      id: row.id,
      situacao: row.situacao || '',
      marca: row.marca || '',
      titulo: row.titulo || '',
      corpo: row.corpo || '',
      situacaoAposEnvio: row.situacao_apos_envio || '',
      proximaAcao: row.proxima_acao || '',
      diasProximoContato: Number(row.dias_proximo_contato || 0),
      ativo: row.ativo !== false,
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
      marca: row.marca || '',
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
      responsavelAcompanhamento: row.responsavel_acompanhamento || '',
      prioridade: row.prioridade || 'Média',
      situacao: row.situacao || 'Não contatado',
      formasContato: Array.isArray(row.formas_contato) ? row.formas_contato : [],
      observacoes: row.observacoes || '',
      contatos: Array.isArray(row.contatos) ? row.contatos.map(contactFromDatabase) : [],
      comunicacoes: Array.isArray(row.comunicacoes_email) ? row.comunicacoes_email.map(emailCommunicationFromDatabase) : [],
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
      marca: nullable(company.marca),
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
      responsavel_acompanhamento: nullable(company.responsavelAcompanhamento),
      prioridade: ['Baixa','Média','Alta','Urgente'].includes(company.prioridade) ? company.prioridade : 'Média',
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
      return new Error('Já existe uma concedente cadastrada com este CNPJ para a mesma marca.');
    }
    if (error.code === '42501' || normalized.includes('row-level security') || normalized.includes('permission denied')) {
      return new Error('Seu perfil não possui permissão para realizar esta ação.');
    }
    if (
      (error.code === 'PGRST204' || error.code === '42703' || normalized.includes('column'))
      && normalized.includes('marca')
    ) {
      return new Error('A coluna de marca ainda não foi criada no Supabase. Execute o arquivo 1-EXECUTAR-NO-SUPABASE.sql e tente novamente.');
    }
    return new Error(message);
  }

  async function listCompanies() {
    assertClient();

    const contactsSelect = `
      contatos (
        id, data_contato, horario, responsavel, forma_contato,
        pessoa_contatada, resultado_contato, proxima_acao,
        proximo_contato, observacoes, criado_em, atualizado_em
      )
    `;

    const communicationsSelect = `
      comunicacoes_email (
        id, modelo_id, marca, situacao_origem, destinatario, assunto, corpo,
        status, usuario_id, usuario_nome, usuario_email,
        preparado_em, confirmado_em, criado_em
      )
    `;

    const currentSelect = `
      id, cnpj, razao_social, nome_fantasia, marca, data_abertura, situacao_cadastral,
      natureza_juridica, cnae_principal, logradouro, numero, complemento, bairro,
      fonte_cnpj, consultado_em, inicio_vigencia, fim_vigencia, data_cadastro,
      estado, cidade, cep, email, telefone, polo, responsavel_acompanhamento,
      prioridade, situacao, formas_contato, observacoes, demonstracao,
      criado_em, atualizado_em, ${contactsSelect}, ${communicationsSelect}
    `;

    let result = await client
      .from('concedentes')
      .select(currentSelect)
      .order('atualizado_em', { ascending: false });

    const missingWorkflowSchema = result.error && (
      result.error.code === 'PGRST204'
      || result.error.code === '42703'
      || ['marca','responsavel_acompanhamento','prioridade','comunicacoes_email'].some((name) =>
        String(result.error.message || '').toLowerCase().includes(name)
      )
    );

    if (missingWorkflowSchema) {
      console.warn('[Dados] O fluxo operacional V8.6.0 ainda não foi instalado. Carregando em modo compatível.');
      result = await client
        .from('concedentes')
        .select(`
          id, cnpj, razao_social, nome_fantasia, marca, data_abertura, situacao_cadastral,
          natureza_juridica, cnae_principal, logradouro, numero, complemento, bairro,
          fonte_cnpj, consultado_em, inicio_vigencia, fim_vigencia, data_cadastro,
          estado, cidade, cep, email, telefone, polo, situacao,
          formas_contato, observacoes, demonstracao, criado_em, atualizado_em,
          ${contactsSelect}
        `)
        .order('atualizado_em', { ascending: false });
    }

    if (result.error) throw databaseError(result.error, 'Não foi possível carregar as concedentes.');
    return (result.data || []).map(companyFromDatabase);
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


  async function updateCompanyManagement(id, values = {}) {
    assertClient();
    const payload = {
      responsavel_acompanhamento: nullable(values.responsavelAcompanhamento),
      prioridade: ['Baixa','Média','Alta','Urgente'].includes(values.prioridade) ? values.prioridade : 'Média'
    };
    const { data, error } = await client
      .from('concedentes')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw databaseError(error, 'Não foi possível atualizar o acompanhamento.');
    return companyFromDatabase({ ...data, contatos: [], comunicacoes_email: [] });
  }

  async function listEmailTemplates() {
    assertClient();
    const { data, error } = await client
      .from('modelos_email')
      .select('*')
      .order('situacao', { ascending: true })
      .order('marca', { ascending: true });
    if (error) throw databaseError(error, 'Não foi possível carregar os modelos de e-mail.');
    return (data || []).map(emailTemplateFromDatabase);
  }

  async function saveEmailTemplate(template = {}) {
    assertAdmin();
    const payload = {
      situacao: String(template.situacao || '').trim(),
      marca: brandKey(template.marca),
      titulo: String(template.titulo || '').trim(),
      corpo: String(template.corpo || '').trim(),
      situacao_apos_envio: String(template.situacaoAposEnvio || '').trim(),
      proxima_acao: nullable(template.proximaAcao),
      dias_proximo_contato: Math.max(0, Number(template.diasProximoContato || 0)),
      ativo: template.ativo !== false
    };
    if (/^[0-9a-f-]{36}$/i.test(template.id || '')) payload.id = template.id;
    const { data, error } = await client
      .from('modelos_email')
      .upsert(payload, { onConflict: 'situacao,marca' })
      .select('*')
      .single();
    if (error) throw databaseError(error, 'Não foi possível salvar o modelo de e-mail.');
    return emailTemplateFromDatabase(data);
  }

  async function createEmailCommunication(values = {}) {
    assertClient();
    const payload = {
      concedente_id: values.companyId,
      modelo_id: values.templateId || null,
      marca: brandKey(values.marca),
      situacao_origem: String(values.situacaoOrigem || '').trim(),
      destinatario: String(values.destinatario || '').trim(),
      assunto: String(values.assunto || '').trim(),
      corpo: String(values.corpo || ''),
      status: values.status || 'preparado',
      usuario_id: values.usuarioId || window.currentUser?.id || null,
      usuario_nome: String(values.usuarioNome || window.currentUser?.nome || ''),
      usuario_email: String(values.usuarioEmail || window.currentUser?.email || '')
    };
    const { data, error } = await client
      .from('comunicacoes_email')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw databaseError(error, 'Não foi possível registrar a preparação do e-mail.');
    return emailCommunicationFromDatabase(data);
  }

  async function updateEmailCommunicationStatus(id, status) {
    assertClient();
    const normalizedStatus = ['preparado','enviado','nao_enviado'].includes(status) ? status : 'preparado';
    const payload = {
      status: normalizedStatus,
      confirmado_em: normalizedStatus === 'preparado' ? null : new Date().toISOString()
    };
    const { data, error } = await client
      .from('comunicacoes_email')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw databaseError(error, 'Não foi possível atualizar o histórico do e-mail.');
    return emailCommunicationFromDatabase(data);
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
    let communicationsInserted = 0;
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
        for (const communication of original.comunicacoes || []) {
          try {
            const { error } = await client.from('comunicacoes_email').insert({
              concedente_id: company.id,
              modelo_id: /^[0-9a-f-]{36}$/i.test(communication.templateId || '') ? communication.templateId : null,
              marca: brandKey(communication.marca || original.marca),
              situacao_origem: communication.situacaoOrigem || original.situacao || '',
              destinatario: communication.destinatario || '',
              assunto: communication.assunto || '',
              corpo: communication.corpo || '',
              status: ['preparado','enviado','nao_enviado'].includes(communication.status) ? communication.status : 'preparado',
              usuario_id: communication.usuarioId || null,
              usuario_nome: communication.usuarioNome || '',
              usuario_email: communication.usuarioEmail || '',
              preparado_em: communication.preparadoEm || communication.criadoEm || new Date().toISOString(),
              confirmado_em: communication.confirmadoEm || null
            });
            if (error) throw databaseError(error);
            communicationsInserted += 1;
          } catch (communicationError) {
            errors.push(`${original.nomeFantasia || original.razaoSocial}: ${communicationError.message}`);
          }
        }
      } catch (error) {
        rejected += 1;
        errors.push(`${original.nomeFantasia || original.razaoSocial || 'Registro sem nome'}: ${error.message}`);
      }
    }

    return { inserted, contactsInserted, communicationsInserted, rejected, errors };
  }

  async function replaceAll(companies) {
    assertAdmin();
    await clearAll();
    return insertCompaniesWithContacts(companies);
  }

  async function replaceAllWorkflow(companies, templates = []) {
    assertAdmin();
    await clearAll();
    const result = await insertCompaniesWithContacts(companies);
    let templatesRestored = 0;
    for (const template of templates || []) {
      try {
        await saveEmailTemplate(template);
        templatesRestored += 1;
      } catch (error) {
        result.errors.push(`Modelo ${template.situacao || ''} / ${template.marca || ''}: ${error.message}`);
      }
    }
    return { ...result, templatesRestored };
  }

  async function migrateLocal(companies) {
    assertAdmin();
    const current = await listCompanies();
    const registrationMap = new Map(
      current
        .map((item) => [companyRegistrationKey(item), item])
        .filter(([key]) => Boolean(key))
    );
    let inserted = 0;
    let updated = 0;
    let contactsInserted = 0;
    let rejected = 0;
    const errors = [];

    for (const source of companies || []) {
      try {
        const registrationKey = companyRegistrationKey(source);
        const existing = registrationKey ? registrationMap.get(registrationKey) : null;
        let target;
        if (existing) {
          target = await updateCompany({ ...source, id: existing.id, contatos: existing.contatos || [] });
          updated += 1;
        } else {
          target = await createCompany(source);
          inserted += 1;
          if (registrationKey) registrationMap.set(registrationKey, target);
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
    updateCompanyManagement,
    createContact,
    updateContact,
    listEmailTemplates,
    saveEmailTemplate,
    createEmailCommunication,
    updateEmailCommunicationStatus,
    deleteDemonstration,
    clearAll,
    insertCompaniesWithContacts,
    replaceAll,
    replaceAllWorkflow,
    migrateLocal,
    companyFromDatabase,
    contactFromDatabase
  });
})();
