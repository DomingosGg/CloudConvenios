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
      tipoNatureza: row.tipo_natureza || '',
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
      etiquetas: Array.isArray(row.etiquetas) ? row.etiquetas : [],
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
      tipo_natureza: ['Público','Privado','Não identificado'].includes(company.tipoNatureza) ? company.tipoNatureza : null,
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
      etiquetas: Array.isArray(company.etiquetas)
        ? [...new Set(company.etiquetas.map((item) => String(item || '').trim()).filter(Boolean))]
        : [],
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
      return new Error('A coluna de marca ainda não foi criada no Supabase. Execute o arquivo supabase/SQL-UNICO-CLOUDCONVENIOS-V8.9.2.sql e tente novamente.');
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
      natureza_juridica, tipo_natureza, cnae_principal, logradouro, numero, complemento, bairro,
      fonte_cnpj, consultado_em, inicio_vigencia, fim_vigencia, data_cadastro,
      estado, cidade, cep, email, telefone, polo, responsavel_acompanhamento,
      prioridade, etiquetas, situacao, formas_contato, observacoes, demonstracao,
      criado_em, atualizado_em, ${contactsSelect}, ${communicationsSelect}
    `;

    let result = await client
      .from('concedentes')
      .select(currentSelect)
      .order('atualizado_em', { ascending: false });

    const missingNatureTypeColumn = result.error && (
      result.error.code === 'PGRST204'
      || result.error.code === '42703'
      || String(result.error.message || '').toLowerCase().includes('tipo_natureza')
    );

    if (missingNatureTypeColumn) {
      console.warn('[Dados] A coluna tipo_natureza ainda não foi instalada. Mantendo o carregamento em modo compatível.');
      result = await client
        .from('concedentes')
        .select(currentSelect.replace('tipo_natureza, ', ''))
        .order('atualizado_em', { ascending: false });
    }

    const missingWorkflowSchema = result.error && (
      result.error.code === 'PGRST204'
      || result.error.code === '42703'
      || ['marca','responsavel_acompanhamento','prioridade','etiquetas','comunicacoes_email'].some((name) =>
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

  function missingNatureTypeError(error) {
    return Boolean(error) && (
      error.code === 'PGRST204'
      || error.code === '42703'
      || String(error.message || '').toLowerCase().includes('tipo_natureza')
    );
  }

  async function createCompany(company, { preserveId = false } = {}) {
    assertClient();
    const payload = companyToDatabase(company, { includeId: preserveId });
    let result = await client
      .from('concedentes')
      .insert(payload)
      .select('*')
      .single();

    if (missingNatureTypeError(result.error)) {
      const compatiblePayload = { ...payload };
      delete compatiblePayload.tipo_natureza;
      result = await client.from('concedentes').insert(compatiblePayload).select('*').single();
    }

    if (result.error) throw databaseError(result.error, 'Não foi possível cadastrar a concedente.');
    return companyFromDatabase({ ...result.data, contatos: [] });
  }

  async function updateCompany(company) {
    assertClient();
    const payload = companyToDatabase(company);
    let result = await client
      .from('concedentes')
      .update(payload)
      .eq('id', company.id)
      .select('*')
      .single();

    if (missingNatureTypeError(result.error)) {
      const compatiblePayload = { ...payload };
      delete compatiblePayload.tipo_natureza;
      result = await client
        .from('concedentes')
        .update(compatiblePayload)
        .eq('id', company.id)
        .select('*')
        .single();
    }

    if (result.error) throw databaseError(result.error, 'Não foi possível atualizar a concedente.');
    return companyFromDatabase({ ...result.data, contatos: company.contatos || [] });
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
    const payload = {};
    if (Object.prototype.hasOwnProperty.call(values, 'responsavelAcompanhamento')) {
      payload.responsavel_acompanhamento = nullable(values.responsavelAcompanhamento);
    }
    if (Object.prototype.hasOwnProperty.call(values, 'prioridade')) {
      payload.prioridade = ['Baixa','Média','Alta','Urgente'].includes(values.prioridade)
        ? values.prioridade
        : 'Média';
    }
    if (Object.prototype.hasOwnProperty.call(values, 'situacao') && values.situacao) {
      payload.situacao = String(values.situacao).trim();
    }
    if (Object.prototype.hasOwnProperty.call(values, 'etiquetas')) {
      payload.etiquetas = Array.isArray(values.etiquetas)
        ? [...new Set(values.etiquetas.map((item) => String(item || '').trim()).filter(Boolean))]
        : [];
    }
    if (!Object.keys(payload).length) throw new Error('Nenhuma alteração de acompanhamento foi informada.');
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


  function savedFilterFromDatabase(row = {}) {
    return {
      id: row.id,
      usuarioId: row.usuario_id || null,
      nome: row.nome || '',
      painel: row.painel || '',
      filtros: row.filtros && typeof row.filtros === 'object' ? row.filtros : {},
      createdAt: row.criado_em || '',
      updatedAt: row.atualizado_em || ''
    };
  }

  async function bulkUpdateCompanies(ids = [], values = {}) {
    assertClient();
    const cleanIds = [...new Set((ids || []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
    if (!cleanIds.length) throw new Error('Nenhuma concedente válida foi selecionada.');
    const { data, error } = await client.rpc('cloudconvenios_aplicar_acao_em_massa', {
      p_ids: cleanIds,
      p_responsavel: values.responsavelAcompanhamento || null,
      p_prioridade: values.prioridade || null,
      p_situacao: values.situacao || null,
      p_proxima_acao: values.proximaAcao || null,
      p_proximo_contato: values.proximaData || null,
      p_usuario_nome: window.currentUser?.nome || window.currentUser?.email || 'Usuário',
      p_usuario_email: window.currentUser?.email || null
    });
    if (error) throw databaseError(error, 'Não foi possível aplicar as ações em massa.');
    return data && typeof data === 'object' ? data : { updated: cleanIds.length, contactsInserted: 0 };
  }

  async function listSavedFilters(panel = '') {
    assertClient();
    let query = client
      .from('filtros_salvos')
      .select('*')
      .eq('usuario_id', window.currentUser?.id)
      .order('painel', { ascending: true })
      .order('nome', { ascending: true });
    if (panel) query = query.eq('painel', panel);
    const { data, error } = await query;
    if (error) throw databaseError(error, 'Não foi possível carregar os filtros salvos.');
    return (data || []).map(savedFilterFromDatabase);
  }

  async function saveSavedFilter(values = {}) {
    assertClient();
    const payload = {
      usuario_id: window.currentUser?.id,
      nome: String(values.nome || '').trim().slice(0, 80),
      painel: String(values.painel || '').trim(),
      filtros: values.filtros && typeof values.filtros === 'object' ? values.filtros : {}
    };
    if (!payload.usuario_id || !payload.nome || !['concedentes','fila','relatorios'].includes(payload.painel)) {
      throw new Error('Dados do filtro salvo inválidos.');
    }
    const { data, error } = await client
      .from('filtros_salvos')
      .upsert(payload, { onConflict: 'usuario_id,painel,nome' })
      .select('*')
      .single();
    if (error) throw databaseError(error, 'Não foi possível salvar a visualização.');
    return savedFilterFromDatabase(data);
  }

  async function deleteSavedFilter(id) {
    assertClient();
    const { error } = await client
      .from('filtros_salvos')
      .delete()
      .eq('id', id)
      .eq('usuario_id', window.currentUser?.id);
    if (error) throw databaseError(error, 'Não foi possível excluir o filtro salvo.');
    return true;
  }

  function editLockFromDatabase(row = {}, acquired = false) {
    return {
      acquired: Boolean(acquired),
      companyId: row.concedente_id || row.company_id || '',
      usuarioId: row.usuario_id || null,
      usuarioNome: row.usuario_nome || '',
      usuarioEmail: row.usuario_email || '',
      acquiredAt: row.adquirido_em || '',
      expiresAt: row.expira_em || ''
    };
  }

  async function acquireEditLock(companyId, ttlSeconds = 150) {
    assertClient();
    const { data, error } = await client.rpc('cloudconvenios_adquirir_bloqueio', {
      p_concedente_id: companyId,
      p_usuario_nome: window.currentUser?.nome || window.currentUser?.email || 'Usuário',
      p_usuario_email: window.currentUser?.email || null,
      p_ttl_segundos: Math.max(60, Math.min(600, Number(ttlSeconds || 150)))
    });
    if (error) throw databaseError(error, 'Não foi possível verificar o bloqueio de edição.');
    const row = Array.isArray(data) ? data[0] : data;
    return editLockFromDatabase(row || {}, row?.adquirido ?? row?.acquired);
  }

  async function releaseEditLock(companyId) {
    assertClient();
    const { data, error } = await client.rpc('cloudconvenios_liberar_bloqueio', {
      p_concedente_id: companyId
    });
    if (error) throw databaseError(error, 'Não foi possível liberar o bloqueio de edição.');
    return Boolean(data);
  }

  async function healthCheck() {
    assertClient();
    const startedAt = performance.now();
    const { count, error } = await client
      .from('concedentes')
      .select('id', { count: 'exact', head: true });
    if (error) throw databaseError(error, 'O Supabase não respondeu à verificação.');
    return {
      ok: true,
      companies: Number(count || 0),
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: new Date().toISOString()
    };
  }


  // ==================================================================
  // V8.8.0 — AUTOMAÇÃO, COLABORAÇÃO E GOVERNANÇA
  // ==================================================================

  function flowRuleFromDatabase(row = {}) {
    return {
      id: row.id,
      nome: row.nome || '',
      evento: row.evento || '',
      marca: row.marca || '',
      situacaoOrigem: row.situacao_origem || '',
      situacaoDestino: row.situacao_destino || '',
      proximaAcao: row.proxima_acao || '',
      diasUteis: Number(row.dias_uteis || 0),
      diasAtraso: Number(row.dias_atraso || 0),
      prioridadeDestino: row.prioridade_destino || '',
      ativo: row.ativo !== false,
      createdAt: row.criado_em || '',
      updatedAt: row.atualizado_em || ''
    };
  }

  async function listFlowRules() {
    assertClient();
    const { data, error } = await client
      .from('regras_fluxo')
      .select('*')
      .order('evento', { ascending: true })
      .order('dias_atraso', { ascending: true })
      .order('nome', { ascending: true });
    if (error) throw databaseError(error, 'Não foi possível carregar as regras automáticas.');
    return (data || []).map(flowRuleFromDatabase);
  }

  async function saveFlowRule(rule = {}) {
    assertAdmin();
    const payload = {
      nome: String(rule.nome || '').trim(),
      evento: String(rule.evento || '').trim(),
      marca: brandKey(rule.marca) || null,
      situacao_origem: nullable(rule.situacaoOrigem),
      situacao_destino: nullable(rule.situacaoDestino),
      proxima_acao: nullable(rule.proximaAcao),
      dias_uteis: Math.max(0, Math.min(365, Number(rule.diasUteis || 0))),
      dias_atraso: Math.max(0, Math.min(365, Number(rule.diasAtraso || 0))),
      prioridade_destino: ['Baixa','Média','Alta','Urgente'].includes(rule.prioridadeDestino)
        ? rule.prioridadeDestino
        : null,
      ativo: rule.ativo !== false
    };
    if (!payload.nome || !['email_enviado','situacao_alterada','prazo_atrasado'].includes(payload.evento)) {
      throw new Error('Regra automática inválida.');
    }
    if (/^[0-9a-f-]{36}$/i.test(rule.id || '')) payload.id = rule.id;
    const { data, error } = await client.from('regras_fluxo').upsert(payload).select('*').single();
    if (error) throw databaseError(error, 'Não foi possível salvar a regra automática.');
    return flowRuleFromDatabase(data);
  }

  async function deleteFlowRule(id) {
    assertAdmin();
    const { error } = await client.from('regras_fluxo').delete().eq('id', id);
    if (error) throw databaseError(error, 'Não foi possível excluir a regra automática.');
    return true;
  }

  function commentFromDatabase(row = {}) {
    return {
      id: row.id,
      companyId: row.concedente_id,
      texto: row.texto || '',
      usuarioId: row.usuario_id || null,
      usuarioNome: row.usuario_nome || '',
      usuarioEmail: row.usuario_email || '',
      mencoes: Array.isArray(row.mencoes) ? row.mencoes : [],
      lidoPor: Array.isArray(row.lido_por) ? row.lido_por : [],
      createdAt: row.criado_em || '',
      updatedAt: row.atualizado_em || ''
    };
  }

  async function listCompanyComments(companyId) {
    assertClient();
    const { data, error } = await client
      .from('comentarios_internos')
      .select('*')
      .eq('concedente_id', companyId)
      .order('criado_em', { ascending: false });
    if (error) throw databaseError(error, 'Não foi possível carregar os comentários internos.');
    return (data || []).map(commentFromDatabase);
  }

  async function createInternalComment(companyId, values = {}) {
    assertClient();
    const payload = {
      concedente_id: companyId,
      texto: String(values.texto || '').trim(),
      usuario_id: window.currentUser?.id,
      usuario_nome: window.currentUser?.nome || window.currentUser?.email || 'Usuário',
      usuario_email: window.currentUser?.email || null,
      mencoes: Array.isArray(values.mencoes)
        ? [...new Set(values.mencoes.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))]
        : []
    };
    if (!payload.texto) throw new Error('Digite um comentário.');
    const { data, error } = await client.from('comentarios_internos').insert(payload).select('*').single();
    if (error) throw databaseError(error, 'Não foi possível registrar o comentário.');
    return commentFromDatabase(data);
  }

  async function listMyMentions() {
    assertClient();
    const email = String(window.currentUser?.email || '').trim().toLowerCase();
    if (!email) return [];
    const { data, error } = await client
      .from('comentarios_internos')
      .select('*, concedentes(id, cnpj, razao_social, nome_fantasia, marca)')
      .contains('mencoes', [email])
      .order('criado_em', { ascending: false })
      .limit(100);
    if (error) throw databaseError(error, 'Não foi possível carregar suas menções.');
    return (data || []).map((row) => ({
      ...commentFromDatabase(row),
      company: row.concedentes ? {
        id: row.concedentes.id,
        cnpj: row.concedentes.cnpj || '',
        razaoSocial: row.concedentes.razao_social || '',
        nomeFantasia: row.concedentes.nome_fantasia || '',
        marca: row.concedentes.marca || ''
      } : null,
      lida: Array.isArray(row.lido_por) && row.lido_por.includes(window.currentUser?.id)
    }));
  }

  async function markInternalCommentRead(id) {
    assertClient();
    const { data, error } = await client.rpc('cloudconvenios_marcar_comentario_lido', {
      p_comentario_id: id
    });
    if (error) throw databaseError(error, 'Não foi possível marcar a menção como lida.');
    return Boolean(data);
  }

  async function deleteInternalComment(id) {
    assertClient();
    const { error } = await client.from('comentarios_internos').delete().eq('id', id);
    if (error) throw databaseError(error, 'Não foi possível excluir o comentário.');
    return true;
  }

  async function searchInternalComments(term) {
    assertClient();
    const clean = String(term || '').trim();
    if (clean.length < 2) return [];
    const safe = clean.replace(/[,%()]/g, ' ');
    const { data, error } = await client
      .from('comentarios_internos')
      .select('id, concedente_id, texto, usuario_nome, usuario_email, criado_em, concedentes(id, cnpj, razao_social, nome_fantasia, marca)')
      .ilike('texto', `%${safe}%`)
      .order('criado_em', { ascending: false })
      .limit(20);
    if (error) throw databaseError(error, 'Não foi possível pesquisar os comentários.');
    return (data || []).map((row) => ({
      id: row.id,
      companyId: row.concedente_id,
      texto: row.texto || '',
      usuarioNome: row.usuario_nome || '',
      createdAt: row.criado_em || '',
      company: row.concedentes ? {
        id: row.concedentes.id,
        cnpj: row.concedentes.cnpj || '',
        razaoSocial: row.concedentes.razao_social || '',
        nomeFantasia: row.concedentes.nome_fantasia || '',
        marca: row.concedentes.marca || ''
      } : null
    }));
  }

  function goalFromDatabase(row = {}) {
    return {
      id: row.id,
      competencia: row.competencia || '',
      escopo: row.escopo || 'usuario',
      usuarioId: row.usuario_id || null,
      usuarioNome: row.usuario_nome || '',
      usuarioEmail: row.usuario_email || '',
      metaContatos: Number(row.meta_contatos || 0),
      metaRenovacoes: Number(row.meta_renovacoes || 0),
      metaPendencias: Number(row.meta_pendencias || 0),
      createdAt: row.criado_em || '',
      updatedAt: row.atualizado_em || ''
    };
  }

  async function listOperationalGoals(competencia = '') {
    assertClient();
    let query = client.from('metas_operacionais').select('*').order('usuario_nome', { ascending: true });
    if (competencia) query = query.eq('competencia', competencia);
    const { data, error } = await query;
    if (error) throw databaseError(error, 'Não foi possível carregar as metas operacionais.');
    return (data || []).map(goalFromDatabase);
  }

  async function saveOperationalGoal(goal = {}) {
    assertAdmin();
    const payload = {
      competencia: goal.competencia,
      escopo: goal.escopo === 'equipe' ? 'equipe' : 'usuario',
      usuario_id: goal.escopo === 'equipe' ? null : goal.usuarioId || null,
      usuario_nome: goal.escopo === 'equipe' ? 'Equipe' : String(goal.usuarioNome || '').trim(),
      usuario_email: goal.escopo === 'equipe' ? null : nullable(goal.usuarioEmail),
      meta_contatos: Math.max(0, Number(goal.metaContatos || 0)),
      meta_renovacoes: Math.max(0, Number(goal.metaRenovacoes || 0)),
      meta_pendencias: Math.max(0, Number(goal.metaPendencias || 0))
    };
    const { data, error } = await client
      .from('metas_operacionais')
      .upsert(payload, { onConflict: 'competencia,escopo,usuario_chave' })
      .select('*')
      .single();
    if (error) throw databaseError(error, 'Não foi possível salvar a meta operacional.');
    return goalFromDatabase(data);
  }

  async function listActiveOperators() {
    assertClient();
    const { data, error } = await client
      .from('usuarios')
      .select('id,nome,email,perfil_id,ativo')
      .eq('ativo', true)
      .in('perfil_id', ['administrador','gestor','operador'])
      .order('nome', { ascending: true });
    if (error) throw databaseError(error, 'Não foi possível carregar os responsáveis.');
    return (data || []).map((row) => ({
      id: row.id,
      nome: row.nome || row.email || '',
      email: row.email || '',
      perfil: row.perfil_id || ''
    }));
  }

  async function getSystemConfiguration(key) {
    assertClient();
    const { data, error } = await client.from('configuracoes_sistema').select('*').eq('chave', key).maybeSingle();
    if (error) throw databaseError(error, 'Não foi possível carregar a configuração do sistema.');
    return data ? {
      chave: data.chave,
      valor: data.valor && typeof data.valor === 'object' ? data.valor : {},
      updatedAt: data.atualizado_em || ''
    } : { chave: key, valor: {}, updatedAt: '' };
  }

  async function setSystemConfiguration(key, value = {}) {
    assertAdmin();
    const payload = {
      chave: String(key || '').trim(),
      valor: value && typeof value === 'object' ? value : {},
      atualizado_por: window.currentUser?.id || null
    };
    const { data, error } = await client.from('configuracoes_sistema').upsert(payload).select('*').single();
    if (error) throw databaseError(error, 'Não foi possível salvar a configuração do sistema.');
    return { chave: data.chave, valor: data.valor || {}, updatedAt: data.atualizado_em || '' };
  }

  async function registerUndoOperation(type, description, ids = [], minutes = 10) {
    assertClient();
    const cleanIds = [...new Set((ids || []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
    if (!cleanIds.length) return null;
    const { data, error } = await client.rpc('cloudconvenios_registrar_operacao', {
      p_tipo: String(type || 'alteracao').slice(0, 60),
      p_descricao: String(description || 'Alteração de cadastro').slice(0, 240),
      p_ids: cleanIds,
      p_expira_minutos: Math.max(1, Math.min(60, Number(minutes || 10)))
    });
    if (error) throw databaseError(error, 'Não foi possível preparar a opção de desfazer.');
    return data || null;
  }

  async function deleteUndoOperation(id) {
    assertClient();
    if (!id) return false;
    const { error } = await client.from('operacoes_reversiveis').delete().eq('id', id).eq('usuario_id', window.currentUser?.id);
    if (error) throw databaseError(error, 'Não foi possível remover a operação temporária.');
    return true;
  }

  async function listUndoOperations() {
    assertClient();
    const { data, error } = await client
      .from('operacoes_reversiveis')
      .select('id,tipo,descricao,expira_em,desfeita_em,criado_em')
      .eq('usuario_id', window.currentUser?.id)
      .is('desfeita_em', null)
      .gt('expira_em', new Date().toISOString())
      .order('criado_em', { ascending: false })
      .limit(10);
    if (error) throw databaseError(error, 'Não foi possível carregar as operações reversíveis.');
    return (data || []).map((row) => ({
      id: row.id,
      tipo: row.tipo || '',
      descricao: row.descricao || '',
      expiresAt: row.expira_em || '',
      undoneAt: row.desfeita_em || '',
      createdAt: row.criado_em || ''
    }));
  }

  async function undoOperation(id) {
    assertClient();
    const { data, error } = await client.rpc('cloudconvenios_desfazer_operacao', {
      p_operacao_id: id
    });
    if (error) throw databaseError(error, 'Não foi possível desfazer a alteração.');
    return data || { restored: 0 };
  }

  async function listActiveEditLocks() {
    assertClient();
    const { data, error } = await client
      .from('bloqueios_edicao')
      .select('*')
      .gt('expira_em', new Date().toISOString())
      .order('adquirido_em', { ascending: true });
    if (error) throw databaseError(error, 'Não foi possível carregar os bloqueios de edição.');
    return (data || []).map((row) => editLockFromDatabase(row, false));
  }

  async function exportSupplementalData() {
    assertAdmin();
    const safe = async (table, order = '') => {
      let query = client.from(table).select('*');
      if (order) query = query.order(order, { ascending: true });
      const { data, error } = await query;
      if (error) return [];
      return data || [];
    };
    const [rules, comments, goals, settings, savedFilters] = await Promise.all([
      safe('regras_fluxo','nome'),
      safe('comentarios_internos','criado_em'),
      safe('metas_operacionais','competencia'),
      safe('configuracoes_sistema','chave'),
      safe('filtros_salvos','nome')
    ]);
    return {
      regrasFluxo: rules,
      comentariosInternos: comments,
      metasOperacionais: goals,
      configuracoesSistema: settings,
      filtrosSalvos: savedFilters
    };
  }

  async function restoreSupplementalData(extra = {}) {
    assertAdmin();
    const insertRows = async (table, rows, options = {}) => {
      if (!Array.isArray(rows) || !rows.length) return 0;
      const { error } = await client.from(table).upsert(rows, options);
      if (error) throw databaseError(error, `Não foi possível restaurar ${table}.`);
      return rows.length;
    };
    for (const table of ['comentarios_internos','metas_operacionais','regras_fluxo']) {
      const { error } = await client.from(table).delete().not('id','is',null);
      if (error) throw databaseError(error, `Não foi possível preparar a restauração de ${table}.`);
    }
    const goals = (extra.metasOperacionais || []).map((row) => {
      const copy = { ...row };
      delete copy.usuario_chave;
      return copy;
    });
    const result = {};
    result.rules = await insertRows('regras_fluxo', extra.regrasFluxo || []);
    result.comments = await insertRows('comentarios_internos', extra.comentariosInternos || []);
    result.goals = await insertRows('metas_operacionais', goals);
    result.settings = await insertRows('configuracoes_sistema', extra.configuracoesSistema || [], { onConflict: 'chave' });
    return result;
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
    bulkUpdateCompanies,
    listSavedFilters,
    saveSavedFilter,
    deleteSavedFilter,
    acquireEditLock,
    releaseEditLock,
    healthCheck,
    listFlowRules,
    saveFlowRule,
    deleteFlowRule,
    listCompanyComments,
    createInternalComment,
    listMyMentions,
    markInternalCommentRead,
    deleteInternalComment,
    searchInternalComments,
    listOperationalGoals,
    saveOperationalGoal,
    listActiveOperators,
    getSystemConfiguration,
    setSystemConfiguration,
    registerUndoOperation,
    deleteUndoOperation,
    listUndoOperations,
    undoOperation,
    listActiveEditLocks,
    exportSupplementalData,
    restoreSupplementalData,
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
