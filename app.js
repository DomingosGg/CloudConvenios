(() => {
    'use strict';

    const LOCAL_DATA_KEY = 'gestao_convenios_v1';
    const THEME_KEY = 'gestao_convenios_theme';
    const situacoesContato = [
      'Não contatado','Contato iniciado','Aguardando retorno','Documentação solicitada','Documentação recebida','Em análise','Renovação em andamento','Renovado','Não possui interesse','Contato não localizado','Convênio encerrado'
    ];
    const kanbanStages = ['Não contatado','Contato iniciado','Aguardando retorno','Documentação solicitada','Documentação recebida','Em análise','Renovação em andamento','Renovado'];
    const formasContato = ['Telefone','WhatsApp','E-mail','Visita presencial','Videoconferência','Instagram','Outro'];
    const situacoesVigencia = ['Vigente','Próximo do vencimento','Vencimento crítico','Vencido','Sem vigência informada'];
    const marcasConvenio = Object.freeze(['Uniasselvi','Unicesumar']);

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
    const todayISO = () => {
      const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10);
    };
    const addDaysISO = (days) => { const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
    const addMonthsISO = (months) => { const d = new Date(); d.setHours(12,0,0,0); d.setMonth(d.getMonth()+months); return d.toISOString().slice(0,10); };
    const parseDate = (value) => value ? new Date(value + 'T12:00:00') : null;
    const formatDate = (value) => value ? parseDate(value).toLocaleDateString('pt-BR') : '—';
    const formatDateTime = (date, time) => date ? `${formatDate(date)}${time ? ' às ' + time : ''}` : '—';
    const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
    const onlyDigits = (value = '') => String(value).replace(/\D/g, '');
    const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    function normalizeBrand(value = '') {
      const key = normalize(value).replace(/[^a-z]/g, '');
      if (key === 'uniasselvi') return 'Uniasselvi';
      if (key === 'unicesumar') return 'Unicesumar';
      return '';
    }

    function companyRegistrationKey(company = {}) {
      const cnpj = cnpjKey(company.cnpj);
      const brand = normalizeBrand(company.marca);
      return cnpj && brand ? `${cnpj}|${brand}` : '';
    }

    function findDuplicateCompany(company = {}, excludeId = '') {
      const key = companyRegistrationKey(company);
      if (!key) return null;
      return state.data.concedentes.find((item) =>
        item.id !== excludeId && companyRegistrationKey(item) === key
      ) || null;
    }
    const daysBetween = (a, b) => Math.ceil((b - a) / 86400000);
    const monthDiff = (start, end) => {
      if (!start || !end) return 0;
      let months = (end.getFullYear()-start.getFullYear())*12 + end.getMonth()-start.getMonth();
      if (end.getDate() < start.getDate()) months--;
      return Math.max(0, months);
    };

    const cnpjKey = (value = '') => {
      const raw = String(value).replace(/^\s*CNPJ\s*[:\-]?\s*/i, '');
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 14) return digits.slice(0, 14);
      return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
    };
    function maskCNPJ(value) {
      const key = cnpjKey(value);
      if (!key) return '';
      if (/\D/.test(key)) return key;
      return key.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2');
    }
    function maskCEP(value) { return onlyDigits(value).slice(0,8).replace(/(\d{5})(\d)/,'$1-$2'); }
    function maskPhone(value) {
      const v = onlyDigits(value).slice(0,11);
      if (v.length <= 10) return v.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d)/,'$1-$2');
      return v.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2');
    }
    function cnpjValidLength(value) { return cnpjKey(value).length === 14; }
    function calculateVigenciaStatus(endDate) {
      if (!endDate) return 'Sem vigência informada';
      const end = parseDate(endDate); const now = parseDate(todayISO());
      const diff = daysBetween(now, end);
      if (diff < 0) return 'Vencido';
      if (diff <= 30) return 'Vencimento crítico';
      if (diff <= 90) return 'Próximo do vencimento';
      return 'Vigente';
    }
    function vigenciaInfo(startDate, endDate) {
      const start = parseDate(startDate), end = parseDate(endDate), now = parseDate(todayISO());
      const months = start && end ? monthDiff(start,end) : null;
      const days = end ? daysBetween(now,end) : null;
      let resumo = 'Sem vigência informada';
      if (months !== null && startDate && endDate) resumo = `${months} ${months === 1 ? 'mês' : 'meses'}`;
      else if (days !== null) resumo = days >= 0 ? `Faltam ${days} dias` : `Vencido há ${Math.abs(days)} dias`;
      return { months, days, resumo };
    }
    function badgeForVigencia(status) {
      const cls = {'Vigente':'badge-success','Próximo do vencimento':'badge-warning','Vencimento crítico':'badge-orange','Vencido':'badge-danger','Sem vigência informada':'badge-muted'}[status] || 'badge-muted';
      return `<span class="badge ${cls}">${escapeHTML(status)}</span>`;
    }
    function badgeForSituacao(status) {
      const cls = status === 'Renovado' ? 'badge-success' : status === 'Não contatado' ? 'badge-muted' : ['Não possui interesse','Contato não localizado','Convênio encerrado'].includes(status) ? 'badge-danger' : 'badge-blue';
      return `<span class="badge ${cls}">${escapeHTML(status || '—')}</span>`;
    }

    const LEGAL_NATURE_TYPES = Object.freeze(['Público','Privado','Não identificado']);

    function classifyLegalNature(value = '') {
      const raw = String(value || '').trim();
      if (!raw) return 'Não identificado';
      const digits = raw.replace(/\D/g, '').slice(0, 4);
      if (/^1\d{3}$/.test(digits) || ['2011','2038'].includes(digits)) return 'Público';
      const text = normalize(raw);
      const publicTerms = [
        'orgao publico','autarquia','fundacao publica','fundo publico','empresa publica',
        'sociedade de economia mista','consorcio publico','estado ou distrito federal',
        'municipio','uniao','comissao polinacional'
      ];
      if (publicTerms.some((term) => text.includes(term))) return 'Público';
      if (digits.startsWith('5')) return 'Não identificado';
      return 'Privado';
    }

    function legalNatureType(value, nature = '') {
      return LEGAL_NATURE_TYPES.includes(value) ? value : classifyLegalNature(nature);
    }

    function legalNatureTypeBadge(value, nature = '') {
      const type = legalNatureType(value, nature);
      const cls = type === 'Público' ? 'badge-blue' : type === 'Privado' ? 'badge-success' : 'badge-muted';
      return `<span class="badge ${cls}">${escapeHTML(type)}</span>`;
    }

    function runOptionalFeature(label, callback, fallback = undefined) {
      try { return callback(); }
      catch (error) {
        console.error(`[CloudConvênios] Recurso opcional indisponível: ${label}`, error);
        return fallback;
      }
    }

    const state = {
      data: { concedentes: [], theme: 'light', version: 1 },
      filtered: [],
      sort: { key: 'dataCadastro', dir: 'desc' },
      page: 1,
      pageSize: 10,
      charts: {},
      selectedContactCompanyId: null,
      editingContactId: null,
      kanbanScrollLeft: 0,
      exportHistory: [],
      exportHistoryLoadedAt: 0,
      exportHistoryLoading: false,
      automaticBackupRunning: false,
      automaticBackupLastCheck: '',
      emailTemplates: [],
      emailTemplatesLoading: false,
      workflowSchemaReady: true,
      pendingEmail: null,
      queueView: 'mine',
      queueDueFilter: '',
      qualityFilter: '',
      importRows: [],
      importErrors: [],
      importFileName: '',
      importRunning: false,
      importPreparing: false,
      importPreparationToken: 0,
      cnpjTimer: null,
      cnpjRequestId: 0,
      cnpjApplying: false,
      cnpjTouched: new Set(),
      cnpjLastKey: '',
      confirmCallback: null,
      remoteReady: false,
      loadingRemote: false
    };

    function makeDemoData() {
      const defs = [
        ['12.345.678/0001-01','Horizonte Saúde Ocupacional Ltda.','Horizonte Saúde','BA','Salvador','Polo Salvador',-300,130,'Contato iniciado',['E-mail','WhatsApp']],
        ['23.456.789/0001-12','Instituto Aprender Mais Ltda.','Aprender Mais','PE','Recife','Polo Recife',-240,75,'Aguardando retorno',['Telefone','E-mail']],
        ['34.567.890/0001-23','Tecnologia Aurora S.A.','Aurora Tech','SP','Campinas','Polo Campinas',-360,18,'Documentação solicitada',['Videoconferência','E-mail']],
        ['45.678.901/0001-34','Clínica Vida Plena Ltda.','Vida Plena','RN','Natal','Polo Natal',-450,-12,'Renovação em andamento',['WhatsApp','Telefone']],
        ['56.789.012/0001-45','Comercial Sertão Forte Ltda.','Sertão Forte','PB','Cajazeiras','Polo Cajazeiras',-180,220,'Não contatado',['E-mail']],
        ['67.890.123/0001-56','Centro Integrado Bem Estar Ltda.','CIBE','AL','Maceió','Polo Maceió',-210,48,'Documentação recebida',['Visita presencial','E-mail']],
        ['78.901.234/0001-67','Construtora Vale Verde Ltda.','Vale Verde','MG','Uberlândia','Polo Triângulo',-520,-55,'Convênio encerrado',['Telefone']],
        ['89.012.345/0001-78','Norte Logística Integrada Ltda.','NorteLog','PA','Belém','Polo Belém',-365,365,'Renovado',['E-mail','Videoconferência']],
        ['90.123.456/0001-89','Fundação Caminhos do Futuro','Caminhos do Futuro','PI','Teresina','Polo Teresina',-120,29,'Em análise',['WhatsApp']],
        ['01.234.567/0001-90','Rede Educacional Novo Tempo Ltda.','Novo Tempo','CE','Fortaleza','Polo Fortaleza',-330,88,'Contato não localizado',['Telefone','Instagram']],
        ['11.223.344/0001-55','Laboratório Alfa Diagnósticos Ltda.','Alfa Diagnósticos','GO','Goiânia','Polo Goiânia',-80,150,'Não possui interesse',['Telefone','E-mail']],
        ['22.334.455/0001-66','Serviços Integrados Atlântico Ltda.','Atlântico Serviços','SC','Florianópolis','Polo Sul',-400,null,'Não contatado',['E-mail']]
      ];
      return defs.map((d, i) => {
        const [cnpj, razaoSocial, nomeFantasia, estado, cidade, polo, startOffset, endOffset, situacao, formas] = d;
        const contatos = i % 3 === 0 ? [{
          id: uid(), data: addDaysISO(-Math.max(2, 12-i)), horario: i % 2 ? '14:30' : '09:15', responsavel: i % 2 ? 'Mariana Costa' : 'Lucas Ferreira', forma: formas[0], pessoa: 'Responsável administrativo', resultado: situacao, proximaAcao: situacao === 'Renovado' ? 'Arquivar documentação' : 'Enviar lembrete e solicitar retorno', proximaData: situacao === 'Renovado' ? '' : addDaysISO(7-i), observacoes: 'Contato fictício criado para demonstração do histórico.'
        }] : [];
        return normalizeCompany({
          id: uid(), cnpj, razaoSocial, nomeFantasia, marca: i % 2 ? 'Unicesumar' : 'Uniasselvi', inicioVigencia: addDaysISO(startOffset), fimVigencia: endOffset === null ? '' : addDaysISO(endOffset), dataCadastro: addDaysISO(-60+i*3), estado, cidade, cep: ['40000-000','50000-000','13000-000','59000-000','58900-000','57000-000','38000-000','66000-000','64000-000','60000-000','74000-000','88000-000'][i], email: `contato${i+1}@empresa-ficticia.com.br`, telefone: i % 2 ? '(81) 98888-0000' : '(71) 3333-0000', polo, situacao, formasContato: formas, observacoes: 'Registro fictício para demonstração do sistema.', contatos, demo: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
      });
    }

    function normalizeCompany(company) {
      const obj = {
        id: company.id || uid(),
        cnpj: maskCNPJ(company.cnpj || ''),
        razaoSocial: company.razaoSocial || '',
        nomeFantasia: company.nomeFantasia || '',
        marca: normalizeBrand(company.marca || company.brand || ''),
        dataAbertura: company.dataAbertura || '',
        situacaoCadastral: company.situacaoCadastral || '',
        naturezaJuridica: company.naturezaJuridica || '',
        tipoNatureza: legalNatureType(company.tipoNatureza || company.tipo_natureza || '', company.naturezaJuridica || ''),
        cnaePrincipal: company.cnaePrincipal || '',
        logradouro: company.logradouro || '',
        numero: company.numero || '',
        complemento: company.complemento || '',
        bairro: company.bairro || '',
        fonteCnpj: company.fonteCnpj || '',
        consultadoEm: company.consultadoEm || '',
        inicioVigencia: company.inicioVigencia || '',
        fimVigencia: company.fimVigencia || '',
        dataCadastro: company.dataCadastro || todayISO(),
        estado: (company.estado || '').toUpperCase().slice(0,2),
        cidade: company.cidade || '',
        cep: maskCEP(company.cep || ''),
        email: company.email || '',
        telefone: maskPhone(company.telefone || ''),
        polo: company.polo || '',
        responsavelAcompanhamento: company.responsavelAcompanhamento || company.responsavel_acompanhamento || '',
        prioridade: ['Baixa','Média','Alta','Urgente'].includes(company.prioridade) ? company.prioridade : 'Média',
        situacao: company.situacao || 'Não contatado',
        formasContato: Array.isArray(company.formasContato) ? company.formasContato : String(company.formasContato || '').split(/[,|]/).map((item) => item.trim()).filter(Boolean),
        observacoes: company.observacoes || '',
        contatos: Array.isArray(company.contatos) ? company.contatos : [],
        comunicacoes: Array.isArray(company.comunicacoes) ? company.comunicacoes : [],
        demo: Boolean(company.demo),
        createdAt: company.createdAt || new Date().toISOString(),
        updatedAt: company.updatedAt || new Date().toISOString()
      };
      const latestOperationalContact = [...obj.contatos]
        .sort((a,b)=>`${b.data || ''} ${b.horario || ''}`.localeCompare(`${a.data || ''} ${a.horario || ''}`))[0] || null;
      obj.proximaAcao = latestOperationalContact?.proximaAcao || '';
      obj.proximaData = latestOperationalContact?.proximaData || '';
      obj.responsavelOperacional = obj.responsavelAcompanhamento || latestOperationalContact?.responsavel || '';
      const vigencia = vigenciaInfo(obj.inicioVigencia, obj.fimVigencia);
      obj.situacaoVigencia = calculateVigenciaStatus(obj.fimVigencia);
      obj.vigenciaResumo = vigencia.resumo;
      obj.diasRestantes = vigencia.days;
      return obj;
    }

    function loadData() {
      try {
        const theme = localStorage.getItem(THEME_KEY);
        state.data = { concedentes: [], theme: theme === 'dark' ? 'dark' : 'light', version: 2 };
      } catch (error) {
        console.error('Erro ao carregar preferência de tema:', error);
        state.data = { concedentes: [], theme: 'light', version: 2 };
      }
    }
    function saveData() {
      try {
        localStorage.setItem(THEME_KEY, state.data.theme);
      } catch (error) {
        console.error('Erro ao salvar preferência de tema:', error);
      }
    }

    const currentRole = () => String(window.currentUser?.perfil || document.body.dataset.userRole || '').trim().toLowerCase();
    const isAdmin = () => currentRole() === 'administrador';
    const isOperator = () => currentRole() === 'operador';
    const canEdit = () => ['administrador','operador','gestor'].includes(currentRole());

    function ensureAdmin(action = 'realizar esta ação') {
      if (isAdmin()) return true;
      toast('error','Acesso restrito',`Somente o administrador pode ${action}.`);
      return false;
    }

    function setRemoteLoading(loading) {
      state.loadingRemote = loading;
      document.body.classList.toggle('data-loading', loading);
    }

    function applyAccessRules() {
      const role = currentRole();
      const admin = role === 'administrador';
      const editable = ['administrador','operador','gestor'].includes(role);

      if (role) document.body.dataset.userRole = role;
      else delete document.body.dataset.userRole;

      $$('[data-admin-only], .action-delete').forEach((element) => {
        element.classList.toggle('hidden', !admin);
        element.setAttribute('aria-hidden', String(!admin));
        if ('disabled' in element) element.disabled = !admin;
      });

      $$('[data-action="new-company"], .action-edit, .action-contact, .action-renew, .action-duplicate, #newContactGlobal, #addContactSelected').forEach((element) => {
        element.classList.toggle('hidden', !editable);
        if ('disabled' in element) element.disabled = !editable;
      });

      if (!admin) {
        closeModal('exportModalBackdrop');
        closeModal('importModalBackdrop');
        if ($('#panel-configuracoes')?.classList.contains('active') || $('#panel-auditoria')?.classList.contains('active') || $('#panel-usuarios')?.classList.contains('active')) switchPanel('dashboard');
      }
    }

    async function loadRemoteData({ silent = false } = {}) {
      if (!window.remoteData || !window.currentUser?.id || state.loadingRemote) return;
      setRemoteLoading(true);
      try {
        const companies = await window.remoteData.listCompanies();
        state.data.concedentes = companies.map(normalizeCompany);
        state.remoteReady = true;
        if (!state.selectedContactCompanyId && state.data.concedentes[0]) state.selectedContactCompanyId = state.data.concedentes[0].id;
        renderAll();
        applyAccessRules();
        if (!silent) toast('success','Dados sincronizados',`${companies.length} concedente(s) carregada(s) do banco online.`);
      } catch (error) {
        console.error(error);
        toast('error','Falha ao carregar dados',error.message || 'Não foi possível consultar o Supabase.');
      } finally {
        setRemoteLoading(false);
      }
    }

    function toast(type, title, message) {
      const node = document.createElement('div'); node.className = `toast ${type}`;
      const icon = {success:'fa-circle-check',error:'fa-circle-xmark',warning:'fa-triangle-exclamation',info:'fa-circle-info'}[type] || 'fa-circle-info';
      node.innerHTML = `<i class="fa-solid ${icon}"></i><div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span></div>`;
      $('#toastContainer').appendChild(node);
      setTimeout(() => { node.style.opacity='0'; node.style.transform='translateX(20px)'; setTimeout(()=>node.remove(),240); }, 4200);
    }
    function openModal(id) { const el = $('#' + id); el.classList.add('open'); el.setAttribute('aria-hidden','false'); }
    function closeModal(id) { const el = $('#' + id); el.classList.remove('open'); el.setAttribute('aria-hidden','true'); }
    function confirmAction(title, message, callback, danger = true) {
      $('#confirmTitle').textContent = title; $('#confirmMessage').textContent = message; state.confirmCallback = callback;
      $('#confirmActionBtn').className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
      openModal('confirmModalBackdrop');
    }

    function setupStaticOptions() {
      $('#situacao').innerHTML = situacoesContato.map(s=>`<option>${s}</option>`).join('');
      $('#contactMethod').innerHTML = '<option value="">Selecione...</option>' + formasContato.map(s=>`<option>${s}</option>`).join('');
      $('#contactResult').innerHTML = '<option value="">Selecione...</option>' + situacoesContato.map(s=>`<option>${s}</option>`).join('');
      $('#formasContatoGroup').innerHTML = formasContato.map((f,i)=>`<label class="check-option"><input type="checkbox" name="formasContato" value="${escapeHTML(f)}" id="forma-${i}"> ${escapeHTML(f)}</label>`).join('');
      $('#filterVigencia').innerHTML += situacoesVigencia.map(s=>`<option>${s}</option>`).join('');
      $('#filterSituacao').innerHTML += situacoesContato.map(s=>`<option>${s}</option>`).join('');
      $('#filterForma').innerHTML += formasContato.map(s=>`<option>${s}</option>`).join('');
    }

    function applyTheme() {
      document.documentElement.dataset.theme = state.data.theme;
      const icon = state.data.theme === 'dark' ? 'fa-sun' : 'fa-moon';
      $('#themeToggle').innerHTML = `<i class="fa-solid ${icon}"></i>`;
      refreshChartsIfVisible();
    }
    function toggleTheme() { state.data.theme = state.data.theme === 'dark' ? 'light' : 'dark'; saveData(); applyTheme(); toast('success','Tema alterado', state.data.theme === 'dark' ? 'Modo escuro ativado.' : 'Modo claro ativado.'); }

    function switchPanel(name) {
      if(['configuracoes','auditoria','usuarios','saude'].includes(name)&&!isAdmin()){toast('error','Acesso restrito','Somente o administrador pode acessar esta área.');name='dashboard';}
      $$('.panel').forEach(p=>p.classList.remove('active'));
      $$('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.panel === name));
      const panel = $('#panel-' + name); if (panel) panel.classList.add('active');
      const meta = {
        dashboard:['Dashboard','Visão geral dos convênios e atividades.'], concedentes:['Concedentes','Cadastro, filtros e acompanhamento das empresas.'], renovacoes:['Renovações','Fluxo Kanban do processo de renovação.'], contatos:['Contatos','Histórico e próximas ações de acompanhamento.'], fila:['Minha fila','Ações, prazos e prioridades do acompanhamento.'], qualidade:['Qualidade dos dados','Pendências cadastrais que precisam de correção.'], notificacoes:['Notificações','Alertas de vigência, contatos e acompanhamentos.'], relatorios:['Relatórios','Indicadores consolidados e análises.'], usuarios:['Usuários','Cadastro, bloqueio e gestão dos acessos.'], auditoria:['Auditoria','Histórico de ações, alterações e exclusões.'], saude:['Saúde do sistema','Disponibilidade das integrações e serviços.'], configuracoes:['Configurações','Preferências e segurança dos dados.']
      }[name];
      $('#pageTitle').textContent = meta[0]; $('#pageSubtitle').textContent = meta[1];
      if (window.innerWidth <= 900) $('#sidebar').classList.remove('mobile-open');
      if (name === 'dashboard') renderDashboard();
      if (name === 'concedentes') renderCompanies();
      if (name === 'renovacoes') renderKanban();
      if (name === 'contatos') renderContactsPanel();
      if (name === 'fila') renderWorkQueue();
      if (name === 'qualidade') renderDataQuality();
      if (name === 'notificacoes') window.notificationsPanel?.open();
      if (name === 'relatorios') renderReports();
      if (name === 'usuarios') window.userManagement?.open();
      if (name === 'auditoria') { window.auditPanel?.open(); setTimeout(ensureAuditComparisonNotice, 0); }
      if (name === 'saude') renderSystemHealth();
      if (name === 'configuracoes') { renderSettings(); loadExportHistory(); }
    }

    function chartColors() {
      return ['#1D1934','#FFC629','#5A527B','#E0A900','#6F6790','#FFE08A','#332D52','#B88900','#8D85A8','#F5D36E','#4B4567'];
    }
    function createChart(key, canvasId, config) {
      if (state.charts[key]) state.charts[key].destroy();
      const ctx = $('#' + canvasId); if (!ctx || typeof Chart === 'undefined') return;
      const textColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
      config.options = config.options || {};
      config.options.responsive = true; config.options.maintainAspectRatio = false;
      config.options.plugins = config.options.plugins || {};
      config.options.plugins.legend = {...(config.options.plugins.legend || {}), labels: {...((config.options.plugins.legend||{}).labels||{}), color:textColor, boxWidth:12, usePointStyle:true}};
      if (config.options.scales) {
        Object.values(config.options.scales).forEach(scale => { scale.ticks = {...(scale.ticks||{}), color:textColor}; scale.grid = {...(scale.grid||{}), color:'rgba(148,163,184,.15)'}; });
      }
      state.charts[key] = new Chart(ctx, config);
    }
    function countBy(arr, getter) { return arr.reduce((acc,item)=>{ const k = getter(item) || 'Não informado'; acc[k]=(acc[k]||0)+1; return acc; },{}); }
    function latestContact(company) { return [...(company.contatos||[])].sort((a,b)=>`${b.data} ${b.horario}`.localeCompare(`${a.data} ${a.horario}`))[0] || null; }

    // V8.6.1: filtros de marca nos painéis e Dashboard simplificado.
    function selectedBrandFilter(selector) {
      return normalizeBrand($(selector)?.value || '');
    }

    function filterCompaniesByBrand(companies, selector) {
      const brand = selectedBrandFilter(selector);
      return brand
        ? companies.filter((company) => normalizeBrand(company.marca) === brand)
        : companies;
    }


    function renderDashboard() {
      const data = filterCompaniesByBrand(state.data.concedentes.map(normalizeCompany), '#dashboardBrandFilter');
      const metrics = [
        ['Total de concedentes',data.length,'fa-building','primary'],
        ['Convênios vigentes',data.filter(c=>c.situacaoVigencia==='Vigente').length,'fa-circle-check','success'],
        ['Próximos do vencimento',data.filter(c=>['Próximo do vencimento','Vencimento crítico'].includes(c.situacaoVigencia)).length,'fa-clock','warning'],
        ['Convênios vencidos',data.filter(c=>c.situacaoVigencia==='Vencido').length,'fa-calendar-xmark','danger'],
        ['Renovações concluídas',data.filter(c=>c.situacao==='Renovado').length,'fa-arrows-rotate','success'],
        ['Ainda não contatadas',data.filter(c=>c.situacao==='Não contatado').length,'fa-phone-slash','orange'],
        ['Contatos em andamento',data.filter(c=>['Contato iniciado','Documentação solicitada','Documentação recebida','Em análise','Renovação em andamento'].includes(c.situacao)).length,'fa-headset','primary'],
        ['Aguardando retorno',data.filter(c=>c.situacao==='Aguardando retorno').length,'fa-hourglass-half','warning']
      ];
      $('#dashboardMetrics').innerHTML = metrics.map(([label,value,icon,tone])=>`<div class="card metric-card" data-tone="${tone}"><div class="metric-top"><div class="metric-icon"><i class="fa-solid ${icon}"></i></div></div><div class="metric-value">${value}</div><div class="metric-label">${label}</div></div>`).join('');

      const byStatus = countBy(data,c=>c.situacaoVigencia); const byState = countBy(data,c=>c.estado); const byPolo = countBy(data,c=>c.polo);
      createChart('status','chartStatus',{type:'doughnut',data:{labels:Object.keys(byStatus),datasets:[{data:Object.values(byStatus),backgroundColor:chartColors(),borderWidth:0}]},options:{cutout:'64%',plugins:{legend:{position:'bottom'}}}});
      const topStates = Object.entries(byState).sort((a,b)=>b[1]-a[1]).slice(0,8);
      createChart('state','chartState',{type:'bar',data:{labels:topStates.map(x=>x[0]),datasets:[{label:'Convênios',data:topStates.map(x=>x[1]),backgroundColor:'#1D1934',borderRadius:7}]},options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0}}}}});
      const polos = Object.entries(byPolo).sort((a,b)=>b[1]-a[1]).slice(0,10);
      createChart('polo','chartPolo',{type:'bar',data:{labels:polos.map(x=>x[0]),datasets:[{label:'Convênios',data:polos.map(x=>x[1]),backgroundColor:'#FFC629',borderRadius:7}]},options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0}},y:{grid:{display:false}}}}});

      const upcoming = data.filter(c=>c.fimVigencia).sort((a,b)=>parseDate(a.fimVigencia)-parseDate(b.fimVigencia)).slice(0,7);
      $('#upcomingList').innerHTML = upcoming.length ? upcoming.map(c=>{ const info=vigenciaInfo(c.inicioVigencia,c.fimVigencia); return `<li class="list-row"><span class="list-dot" style="background:${info.days < 0 ? '#dc2626' : info.days <= 30 ? '#f97316' : '#d9a200'}"></span><div class="list-main"><strong>${escapeHTML(c.nomeFantasia || c.razaoSocial)}</strong><small>${escapeHTML(c.cidade)}/${escapeHTML(c.estado)} • ${badgeForVigencia(c.situacaoVigencia)}</small></div><div class="list-side">${formatDate(c.fimVigencia)}<br>${info.days < 0 ? `há ${Math.abs(info.days)} dias` : `em ${info.days} dias`}</div></li>`; }).join('') : emptyState('Nenhum vencimento informado','Cadastre datas finais para acompanhar os prazos.');

      renderAlerts();
    }

    function emptyState(title, text) { return `<div class="empty-state"><i class="fa-regular fa-folder-open"></i><strong>${escapeHTML(title)}</strong><span>${escapeHTML(text)}</span></div>`; }

    function setSelectOptions(id, values, current = '') {
      const element = $(id);
      if (!element) return;
      const firstOption = element.options?.[0]?.outerHTML || '<option value="">Todos</option>';
      const normalizedValues = [...new Set((values || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      element.innerHTML = firstOption + normalizedValues
        .map((value) => `<option value="${escapeHTML(value)}" ${value === current ? 'selected' : ''}>${escapeHTML(value)}</option>`)
        .join('');
      if (current && normalizedValues.includes(current)) element.value = current;
    }

    function updateFilterOptions() {
      setSelectOptions('#filterEstado',state.data.concedentes.map(c=>c.estado),$('#filterEstado')?.value || '');
      setSelectOptions('#filterCidade',state.data.concedentes.map(c=>c.cidade),$('#filterCidade')?.value || '');
      setSelectOptions('#filterPolo',state.data.concedentes.map(c=>c.polo),$('#filterPolo')?.value || '');
      setSelectOptions('#filterMarca',state.data.concedentes.map(c=>c.marca),$('#filterMarca')?.value || '');
      setSelectOptions('#filterResponsavel',state.data.concedentes.map(c=>normalizeCompany(c).responsavelOperacional),$('#filterResponsavel')?.value || '');
    }
    function getFilteredCompanies() {
      const q = normalize($('#tableSearch').value);
      const filters = { vigencia:$('#filterVigencia').value, situacao:$('#filterSituacao').value, estado:$('#filterEstado').value, cidade:$('#filterCidade').value, polo:$('#filterPolo').value, marca:$('#filterMarca')?.value || '', responsavel:$('#filterResponsavel')?.value || '', prioridade:$('#filterPrioridade')?.value || '', forma:$('#filterForma').value, inicio:$('#filterInicio').value, fim:$('#filterFim').value, rapido:$('#filterRapido').value };
      const now = parseDate(todayISO());
      return state.data.concedentes.map(normalizeCompany).filter(c=>{
        const hay = normalize([c.cnpj,c.razaoSocial,c.nomeFantasia,c.situacaoCadastral,c.naturezaJuridica,c.tipoNatureza,c.cnaePrincipal,c.logradouro,c.numero,c.complemento,c.bairro,c.estado,c.cidade,c.cep,c.email,c.telefone,c.polo,c.marca,c.responsavelOperacional,c.prioridade,c.proximaAcao,c.proximaData,c.situacao,c.formasContato.join(' '),c.observacoes].join(' '));
        if (q && !hay.includes(q)) return false;
        if (filters.vigencia && c.situacaoVigencia !== filters.vigencia) return false;
        if (filters.situacao && c.situacao !== filters.situacao) return false;
        if (filters.estado && c.estado !== filters.estado) return false;
        if (filters.cidade && c.cidade !== filters.cidade) return false;
        if (filters.polo && c.polo !== filters.polo) return false;
        if (filters.marca && c.marca !== filters.marca) return false;
        if (filters.responsavel && c.responsavelOperacional !== filters.responsavel) return false;
        if (filters.prioridade && c.prioridade !== filters.prioridade) return false;
        if (filters.forma && !c.formasContato.includes(filters.forma)) return false;
        if (filters.inicio && (!c.inicioVigencia || c.inicioVigencia < filters.inicio)) return false;
        if (filters.fim && (!c.fimVigencia || c.fimVigencia > filters.fim)) return false;
        if (filters.rapido) {
          if (!c.fimVigencia) return false;
          const diff = daysBetween(now,parseDate(c.fimVigencia));
          if (filters.rapido === 'vencidos' && diff >= 0) return false;
          if (['30','60','90'].includes(filters.rapido) && !(diff >= 0 && diff <= Number(filters.rapido))) return false;
        }
        return true;
      }).sort((a,b)=>{
        const k=state.sort.key; let av=a[k]??'', bv=b[k]??'';
        if (k==='situacaoVigencia') { av=situacoesVigencia.indexOf(av); bv=situacoesVigencia.indexOf(bv); }
        if (['inicioVigencia','fimVigencia','dataCadastro'].includes(k)) { av=av||'0000-00-00'; bv=bv||'0000-00-00'; }
        if (k === 'diasRestantes') { av = av === null ? Number.POSITIVE_INFINITY : Number(av); bv = bv === null ? Number.POSITIVE_INFINITY : Number(bv); }
        const cmp = typeof av==='number' && typeof bv==='number' ? av-bv : String(av).localeCompare(String(bv),'pt-BR',{numeric:true});
        return state.sort.dir==='asc' ? cmp : -cmp;
      });
    }

    function daysRemainingBadge(days) {
      if (days === null || days === undefined || Number.isNaN(Number(days))) {
        return '<span class="badge badge-muted">Sem data</span>';
      }
      const value = Number(days);
      if (value < 0) return `<span class="badge badge-danger">Vencido há ${Math.abs(value)} dia${Math.abs(value) === 1 ? '' : 's'}</span>`;
      if (value <= 30) return `<span class="badge badge-orange">${value} dia${value === 1 ? '' : 's'}</span>`;
      if (value <= 90) return `<span class="badge badge-warning">${value} dias</span>`;
      return `<span class="badge badge-success">${value} dias</span>`;
    }

    function renderCompanies() {
      updateFilterOptions(); state.filtered = getFilteredCompanies();
      const total=state.filtered.length; const pages=Math.max(1,Math.ceil(total/state.pageSize)); if(state.page>pages) state.page=pages;
      const start=(state.page-1)*state.pageSize; const rows=state.filtered.slice(start,start+state.pageSize);
      $('#resultCount').textContent = `${total} ${total===1?'resultado':'resultados'}`;
      $('#paginationInfo').textContent = total ? `Exibindo ${start+1} a ${Math.min(start+state.pageSize,total)} de ${total}` : 'Nenhum registro encontrado';
      $('#companiesTableBody').innerHTML = rows.length ? rows.map(c=>`<tr>
        <td>${badgeForVigencia(c.situacaoVigencia)}</td><td>${escapeHTML(c.cnpj||'—')}</td><td class="td-truncate" title="${escapeHTML(c.razaoSocial)}">${escapeHTML(c.razaoSocial)}</td><td>${escapeHTML(c.nomeFantasia)}</td><td>${escapeHTML(c.marca||'—')}</td><td>${escapeHTML(c.situacaoCadastral||'—')}</td><td class="td-truncate" title="${escapeHTML(c.naturezaJuridica||'')}">${escapeHTML(c.naturezaJuridica||'—')}</td><td>${legalNatureTypeBadge(c.tipoNatureza,c.naturezaJuridica)}</td><td class="td-truncate" title="${escapeHTML(c.cnaePrincipal||'')}">${escapeHTML(c.cnaePrincipal||'—')}</td><td>${formatDate(c.inicioVigencia)}</td><td>${formatDate(c.fimVigencia)}</td><td>${daysRemainingBadge(c.diasRestantes)}</td><td>${formatDate(c.dataCadastro)}</td><td>${escapeHTML(c.vigenciaResumo)}</td><td>${escapeHTML(c.estado)}</td><td>${escapeHTML(c.cidade)}</td><td>${escapeHTML(c.cep||'—')}</td><td>${escapeHTML(c.email||'—')}</td><td>${escapeHTML(c.telefone||'—')}</td><td>${escapeHTML(c.polo)}</td><td>${badgeForSituacao(c.situacao)}</td><td>${escapeHTML(c.formasContato.join(', ')||'—')}</td>
        <td><div class="actions-cell"><button class="btn btn-secondary btn-icon action-view" data-id="${c.id}" title="Visualizar"><i class="fa-solid fa-eye"></i></button><button class="btn btn-secondary btn-icon action-edit" data-id="${c.id}" title="Editar"><i class="fa-solid fa-pen"></i></button><button class="btn btn-secondary btn-icon action-contact" data-id="${c.id}" title="Registrar contato"><i class="fa-solid fa-phone"></i></button><button class="btn btn-secondary btn-icon action-renew" data-id="${c.id}" title="Marcar como renovado"><i class="fa-solid fa-circle-check"></i></button><button class="btn btn-secondary btn-icon action-duplicate" data-id="${c.id}" title="Duplicar"><i class="fa-solid fa-copy"></i></button><button class="btn btn-danger btn-icon action-delete" data-id="${c.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button></div></td>
      </tr>`).join('') : `<tr><td colspan="31">${emptyState('Nenhum cadastro encontrado','Ajuste os filtros ou cadastre uma nova concedente.')}</td></tr>`;
      renderPagination(pages); bindTableActions();
    }
    function renderPagination(pages) {
      const holder=$('#paginationControls'); let html=`<button class="page-btn" data-page="${state.page-1}" ${state.page===1?'disabled':''}><i class="fa-solid fa-chevron-left"></i></button>`;
      const range=[]; for(let i=Math.max(1,state.page-2);i<=Math.min(pages,state.page+2);i++) range.push(i);
      html += range.map(i=>`<button class="page-btn ${i===state.page?'active':''}" data-page="${i}">${i}</button>`).join('');
      html += `<button class="page-btn" data-page="${state.page+1}" ${state.page===pages?'disabled':''}><i class="fa-solid fa-chevron-right"></i></button>`;
      holder.innerHTML=html; $$('.page-btn',holder).forEach(btn=>btn.addEventListener('click',()=>{ if(!btn.disabled){state.page=Number(btn.dataset.page);renderCompanies();}}));
    }
    function bindTableActions() {
      $$('.action-view').forEach(b=>b.onclick=()=>viewCompany(b.dataset.id));
      $$('.action-edit').forEach(b=>b.onclick=()=>openCompanyForm(b.dataset.id));
      $$('.action-contact').forEach(b=>b.onclick=()=>openContactForm(b.dataset.id));
      $$('.action-renew').forEach(b=>b.onclick=()=>markRenewed(b.dataset.id));
      $$('.action-duplicate').forEach(b=>b.onclick=()=>duplicateCompany(b.dataset.id));
      $$('.action-delete').forEach(b=>b.onclick=()=>deleteCompany(b.dataset.id));
    }

    const CNPJ_FILL_FIELDS = [
      'razaoSocial','nomeFantasia','dataAbertura','situacaoCadastral','naturezaJuridica','tipoNatureza','cnaePrincipal',
      'email','telefone','cep','logradouro','numero','complemento','bairro','cidade','estado'
    ];

    function setCnpjLookupStatus(kind = 'idle', message = 'Ao completar o CNPJ, a consulta será feita automaticamente.') {
      const status = $('#cnpjLookupStatus');
      const spinner = $('#cnpjSpinner');
      if (status) {
        status.textContent = message;
        status.className = `field-hint cnpj-status-${kind}`;
      }
      spinner?.classList.toggle('hidden', kind !== 'loading');
    }

    function resetCnpjLookupState() {
      clearTimeout(state.cnpjTimer);
      state.cnpjRequestId += 1;
      state.cnpjApplying = false;
      state.cnpjTouched.clear();
      state.cnpjLastKey = '';
      const form = $('#companyForm');
      if (form) {
        delete form.dataset.fonteCnpj;
        delete form.dataset.consultadoEm;
      }
      $$('.api-fill-field', form || document).forEach((field) => field.classList.remove('api-autofilled', 'api-manual-edited'));
      $('#cnpjSourceBox')?.classList.add('hidden');
      if ($('#cnpjSourceText')) $('#cnpjSourceText').textContent = '';
      setCnpjLookupStatus();
    }

    function ensureLegalNatureClassificationUI() {
      const natureField = $('#naturezaJuridica')?.closest('.field');
      if (natureField && !$('#tipoNatureza')) {
        natureField.insertAdjacentHTML('afterend', `<div class="field"><label>Público/Privado</label><input class="form-control" id="tipoNatureza" value="Não identificado" readonly/><span class="field-hint">Classificação automática conforme a natureza jurídica do CNPJ.</span></div>`);
      }
      const header = $('#companiesTableBody')?.closest('table')?.querySelector('thead tr');
      if (header && !header.querySelector('[data-legal-nature-type]')) {
        const statusHeader = [...header.children].find((cell) => normalize(cell.textContent) === 'situacao cadastral');
        statusHeader?.insertAdjacentHTML('afterend','<th data-legal-nature-type="true" data-sort="tipoNatureza">Público/Privado</th>');
      }
    }

    function updateLegalNatureClassification() {
      const nature = $('#naturezaJuridica')?.value || '';
      const field = $('#tipoNatureza');
      if (field) field.value = classifyLegalNature(nature);
    }

    function resetCompanyForm() {
      $('#companyForm').reset();
      $('#companyId').value = '';
      $('#dataCadastro').value = todayISO();
      $('#situacao').value = 'Não contatado';
      $('#estado').value = '';
      if ($('#tipoNatureza')) $('#tipoNatureza').value = 'Não identificado';
      $$('input[name="marcaConvenio"]').forEach((input) => { input.checked = false; });
      $('#marcaConvenioGroup')?.classList.remove('invalid');
      $$('#companyForm .invalid').forEach((element) => element.classList.remove('invalid'));
      resetCnpjLookupState();
      updateVigenciaForm();
      const body = $('#companyModalBody') || $('.company-modal-body');
      if (body) body.scrollTop = 0;
    }

    function setFormValueFromApi(id, value) {
      const field = $('#' + id);
      if (!field || value === null || value === undefined || String(value).trim() === '') return false;
      if (state.cnpjTouched.has(id)) return false;
      state.cnpjApplying = true;
      if (id === 'cep') field.value = maskCEP(value);
      else if (id === 'telefone') field.value = maskPhone(value);
      else if (id === 'estado') field.value = String(value).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
      else field.value = String(value).trim();
      field.classList.add('api-autofilled');
      field.classList.remove('api-manual-edited', 'invalid');
      state.cnpjApplying = false;
      return true;
    }

    function setEmptyFormValueFromApi(id, value) {
      const field = $('#' + id);
      if (!field || String(field.value || '').trim()) return false;
      return setFormValueFromApi(id, value);
    }

    async function fetchCepAddress(cepValue) {
      const cep = onlyDigits(cepValue);
      if (cep.length !== 8) throw new Error('CEP incompleto.');

      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) throw new Error(`Falha na consulta do CEP (${response.status}).`);

      const data = await response.json();
      if (data?.erro) throw new Error('CEP não encontrado.');
      return data;
    }

    async function applyCepAddressAutomatically(
      cepValue,
      { requestId = null, expectedCnpj = '', manual = false } = {}
    ) {
      const hint = $('#cepHint');
      const cep = onlyDigits(cepValue);

      if (!cep) return 0;
      if (cep.length !== 8) {
        if (manual && hint) hint.textContent = 'CEP incompleto. Informe 8 números.';
        return 0;
      }

      if (hint) {
        hint.textContent = manual
          ? 'Consultando ViaCEP…'
          : 'Complementando o endereço automaticamente pelo CEP…';
      }

      try {
        const data = await fetchCepAddress(cep);

        if (
          requestId !== null
          && (
            requestId !== state.cnpjRequestId
            || (expectedCnpj && cnpjKey($('#cnpj')?.value) !== expectedCnpj)
          )
        ) {
          return 0;
        }

        let populated = 0;
        [
          ['logradouro', data.logradouro],
          ['complemento', data.complemento],
          ['bairro', data.bairro],
          ['cidade', data.localidade],
          ['estado', data.uf]
        ].forEach(([id, value]) => {
          if (setEmptyFormValueFromApi(id, value || '')) populated += 1;
        });

        if (hint) {
          hint.textContent = populated
            ? 'Endereço preenchido automaticamente. Todos os campos continuam editáveis.'
            : 'CEP consultado. Os campos já preenchidos foram preservados.';
        }

        return populated;
      } catch (error) {
        console.warn('[CEP] Consulta indisponível:', error);
        if (hint) {
          hint.textContent = manual
            ? 'Não foi possível consultar o CEP. Preencha o endereço manualmente.'
            : 'O CEP foi identificado, mas o complemento automático do endereço não respondeu.';
        }

        if (manual && String(error?.message || '').includes('não encontrado')) {
          toast('warning', 'CEP não encontrado', 'Verifique o número informado.');
        }

        return 0;
      }
    }

    async function performCnpjLookup(rawValue) {
      const key = cnpjKey(rawValue);
      if (key.length !== 14 || !window.cnpjService) return;
      if (key === state.cnpjLastKey) return;

      const requestId = ++state.cnpjRequestId;
      state.cnpjLastKey = key;
      setCnpjLookupStatus('loading', 'Consultando dados cadastrais automaticamente…');
      $('#cnpj')?.classList.remove('invalid');

      try {
        const result = await window.cnpjService.lookup(key);
        if (requestId !== state.cnpjRequestId || cnpjKey($('#cnpj')?.value) !== key) return;
        const data = result?.data || {};
        let populated = 0;
        CNPJ_FILL_FIELDS.forEach((id) => {
          if (setFormValueFromApi(id, data[id])) populated += 1;
        });
        const automaticType = legalNatureType(data.tipoNatureza || data.tipo_natureza || '', data.naturezaJuridica || $('#naturezaJuridica')?.value || '');
        if ($('#tipoNatureza')) {
          $('#tipoNatureza').value = automaticType;
          $('#tipoNatureza').classList.add('api-autofilled');
        }
        if (!$('#nomeFantasia')?.value.trim() && $('#razaoSocial')?.value.trim()) {
          populated += setFormValueFromApi('nomeFantasia', $('#razaoSocial').value) ? 1 : 0;
        }

        const addressIncomplete = ['logradouro', 'bairro', 'cidade', 'estado']
          .some((id) => !String($('#' + id)?.value || '').trim());

        if ($('#cep')?.value && addressIncomplete) {
          populated += await applyCepAddressAutomatically($('#cep').value, {
            requestId,
            expectedCnpj: key,
            manual: false
          });
        }

        const sources = Array.isArray(data.fontes) ? data.fontes : (data.fonte ? [data.fonte] : []);
        const form = $('#companyForm');
        if (form) {
          form.dataset.fonteCnpj = sources.join(', ');
          form.dataset.consultadoEm = data.consultadoEm || new Date().toISOString();
        }
        const sourceBox = $('#cnpjSourceBox');
        const sourceText = $('#cnpjSourceText');
        if (sourceText) sourceText.textContent = sources.length
          ? `Dados encontrados em ${sources.join(' + ')}. Revise e ajuste qualquer informação antes de salvar.`
          : 'Dados encontrados automaticamente. Revise e ajuste qualquer informação antes de salvar.';
        sourceBox?.classList.remove('hidden');

        if (populated) {
          setCnpjLookupStatus('success', `${populated} campo(s) preenchido(s). Todos continuam editáveis.`);
          toast('success', 'CNPJ localizado', 'Os dados foram preenchidos automaticamente e podem ser ajustados.');
        } else {
          setCnpjLookupStatus('warning', 'O CNPJ foi localizado, mas não trouxe novos dados. Preencha manualmente.');
        }
      } catch (error) {
        if (requestId !== state.cnpjRequestId) return;
        console.warn('[CNPJ] Consulta automática indisponível:', error);
        state.cnpjLastKey = '';
        $('#cnpj')?.classList.remove('invalid');
        setCnpjLookupStatus('warning', error.message || 'A consulta automática não respondeu. O CNPJ pode ser salvo e os dados permanecem editáveis.');
        $('#cnpjSourceBox')?.classList.add('hidden');
      }
    }

    function clearPreviousAutomaticCnpjValues(nextKey) {
      if (!state.cnpjLastKey || state.cnpjLastKey === nextKey) return;
      CNPJ_FILL_FIELDS.forEach((id) => {
        const field = $('#' + id);
        if (!field || state.cnpjTouched.has(id) || !field.classList.contains('api-autofilled')) return;
        field.value = '';
        field.classList.remove('api-autofilled');
      });
      const form = $('#companyForm');
      if (form) {
        delete form.dataset.fonteCnpj;
        delete form.dataset.consultadoEm;
      }
      $('#cnpjSourceBox')?.classList.add('hidden');
      if ($('#cnpjSourceText')) $('#cnpjSourceText').textContent = '';
      state.cnpjLastKey = '';
    }

    function scheduleCnpjLookup() {
      clearTimeout(state.cnpjTimer);
      const input = $('#cnpj');
      const key = cnpjKey(input?.value);
      clearPreviousAutomaticCnpjValues(key);
      if (input) input.value = maskCNPJ(input.value);
      if (!key) {
        state.cnpjLastKey = '';
        setCnpjLookupStatus();
        return;
      }
      if (key.length < 14) {
        setCnpjLookupStatus('idle', `Digite mais ${14 - key.length} caractere(s) para consultar automaticamente.`);
        return;
      }
      setCnpjLookupStatus('pending', 'CNPJ completo. A consulta começará em instantes…');
      state.cnpjTimer = setTimeout(() => performCnpjLookup(key), 650);
    }

    function openCompanyForm(id = null, preset = null) {
      resetCompanyForm();
      const company = id ? state.data.concedentes.find((item) => item.id === id) : preset;
      $('#companyModalTitle').textContent = id ? 'Editar concedente' : preset ? 'Duplicar concedente' : 'Cadastrar concedente';
      if (company) {
        state.cnpjApplying = true;
        $('#companyId').value = id || '';
        [
          'cnpj','razaoSocial','nomeFantasia','dataAbertura','situacaoCadastral','naturezaJuridica','cnaePrincipal',
          'logradouro','numero','complemento','bairro','inicioVigencia','fimVigencia','dataCadastro','estado','cidade',
          'cep','email','telefone','polo','responsavelAcompanhamento','prioridade','situacao','observacoes'
        ].forEach((key) => { const field = $('#' + key); if (field) field.value = company[key] || ''; });
        $$('input[name="formasContato"]').forEach((checkbox) => { checkbox.checked = (company.formasContato || []).includes(checkbox.value); });
        $$('input[name="marcaConvenio"]').forEach((input) => {
          input.checked = normalizeBrand(company.marca) === input.value;
        });
        const form = $('#companyForm');
        if (form) {
          form.dataset.fonteCnpj = company.fonteCnpj || '';
          form.dataset.consultadoEm = company.consultadoEm || '';
        }
        state.cnpjLastKey = cnpjKey(company.cnpj);
        if (company.fonteCnpj) {
          $('#cnpjSourceText').textContent = `Última consulta automática: ${company.fonteCnpj}. Todos os campos permanecem editáveis.`;
          $('#cnpjSourceBox').classList.remove('hidden');
        }
        state.cnpjApplying = false;
      }
      updateVigenciaForm();
      openModal('companyModalBackdrop');
      setTimeout(() => (id ? $('#razaoSocial') : $('#cnpj'))?.focus(), 100);
    }

    function duplicateCompany(id) {
      const company = state.data.concedentes.find((item) => item.id === id);
      if (!company) return;
      const originalBrand = normalizeBrand(company.marca);
      const copy = typeof structuredClone === 'function'
        ? structuredClone(company)
        : JSON.parse(JSON.stringify(company));
      copy.id = '';
      copy.marca = '';
      copy.dataCadastro = todayISO();
      copy.contatos = [];
      copy.demo = false;
      openCompanyForm(null, copy);
      state.cnpjLastKey = cnpjKey(copy.cnpj);
      toast(
        'info',
        'Cadastro para outra marca',
        `O CNPJ foi mantido. Selecione uma marca diferente de ${originalBrand || 'a marca original'} antes de salvar.`
      );
    }

    function updateVigenciaForm() {
      const start = $('#inicioVigencia').value;
      const end = $('#fimVigencia').value;
      const info = vigenciaInfo(start, end);
      const status = calculateVigenciaStatus(end);
      $('#situacaoVigencia').value = status;
      $('#vigenciaResumo').value = info.resumo;
      let detail = `Situação: <strong>${escapeHTML(status)}</strong>. `;
      if (info.months !== null) detail += `Duração total aproximada: <strong>${info.months} ${info.months === 1 ? 'mês' : 'meses'}</strong>. `;
      if (info.days !== null) detail += info.days >= 0 ? `Restam <strong>${info.days} dias</strong>.` : `Vencido há <strong>${Math.abs(info.days)} dias</strong>.`;
      if (info.days === null) detail = 'Informe a data final para calcular a situação e os dias restantes.';
      $('#vigenciaDetails').innerHTML = detail;
    }

    function getCompanyFormData() {
      const form = $('#companyForm');
      return normalizeCompany({
        id: $('#companyId').value || uid(),
        cnpj: $('#cnpj').value,
        razaoSocial: $('#razaoSocial').value.trim(),
        nomeFantasia: $('#nomeFantasia').value.trim() || $('#razaoSocial').value.trim(),
        dataAbertura: $('#dataAbertura').value,
        situacaoCadastral: $('#situacaoCadastral').value.trim(),
        naturezaJuridica: $('#naturezaJuridica').value.trim(),
        tipoNatureza: legalNatureType($('#tipoNatureza')?.value || '', $('#naturezaJuridica').value),
        cnaePrincipal: $('#cnaePrincipal').value.trim(),
        logradouro: $('#logradouro').value.trim(),
        numero: $('#numero').value.trim(),
        complemento: $('#complemento').value.trim(),
        bairro: $('#bairro').value.trim(),
        fonteCnpj: form?.dataset.fonteCnpj || '',
        consultadoEm: form?.dataset.consultadoEm || '',
        inicioVigencia: $('#inicioVigencia').value,
        fimVigencia: $('#fimVigencia').value,
        dataCadastro: $('#dataCadastro').value,
        estado: $('#estado').value.trim().toUpperCase(),
        cidade: $('#cidade').value.trim(),
        cep: $('#cep').value,
        email: $('#email').value.trim(),
        telefone: $('#telefone').value,
        polo: $('#polo').value.trim(),
        responsavelAcompanhamento: $('#responsavelAcompanhamento')?.value.trim() || '',
        prioridade: $('#prioridade')?.value || 'Média',
        marca: document.querySelector('input[name="marcaConvenio"]:checked')?.value || '',
        situacao: $('#situacao').value,
        formasContato: $$('input[name="formasContato"]:checked').map((item) => item.value),
        observacoes: $('#observacoes').value.trim()
      });
    }

    function validateCompanyForm(data) {
      let valid = true;
      $$('#companyForm .invalid').forEach((element) => element.classList.remove('invalid'));
      ['razaoSocial','nomeFantasia','dataCadastro','estado','cidade','situacao'].forEach((id) => {
        const element = $('#' + id);
        if (!element.value.trim()) { element.classList.add('invalid'); valid = false; }
      });
      if (data.estado.length !== 2) { $('#estado').classList.add('invalid'); valid = false; }
      if (!normalizeBrand(data.marca)) {
        $('#marcaConvenioGroup')?.classList.add('invalid');
        valid = false;
      }
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { $('#email').classList.add('invalid'); valid = false; }
      if (data.cnpj && !cnpjValidLength(data.cnpj)) {
        $('#cnpj').classList.add('invalid'); valid = false;
        toast('error', 'CNPJ inválido', 'Informe os 14 caracteres do CNPJ.');
      }
      if (data.inicioVigencia && data.fimVigencia && data.fimVigencia < data.inicioVigencia) {
        $('#fimVigencia').classList.add('invalid'); valid = false;
        toast('error', 'Datas inválidas', 'A data final não pode ser anterior à data inicial.');
      }
      if (!valid) toast('error', 'Revise o formulário', 'Preencha corretamente os campos destacados.');
      return valid;
    }

    // V8.5.3: duplicidade definida pela combinação CNPJ + marca.
    async function saveCompany(data) {
      if (!canEdit()) { toast('error','Acesso restrito','Seu perfil não pode alterar concedentes.'); return; }
      const existingIndex=state.data.concedentes.findIndex(c=>c.id===data.id);
      const duplicate = findDuplicateCompany(data, data.id);
      if (duplicate) {
        $('#cnpj').classList.add('invalid');
        $('#marcaConvenioGroup')?.classList.add('invalid');
        toast(
          'error',
          'CNPJ e marca duplicados',
          `Este CNPJ já está cadastrado para a marca ${normalizeBrand(data.marca)}.`
        );
        return;
      }
      const submit=$('#companyForm button[type="submit"]');
      if(submit){submit.disabled=true;submit.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i>Salvando...';}
      try {
        const previous=existingIndex>=0?state.data.concedentes[existingIndex]:null;
        data.contatos=previous?.contatos||[]; data.demo=previous?.demo||false;
        const saved=normalizeCompany(await window.remoteData.saveCompany(data,existingIndex>=0));
        saved.contatos=data.contatos;
        if(existingIndex>=0) state.data.concedentes[existingIndex]=saved; else state.data.concedentes.unshift(saved);
        closeModal('companyModalBackdrop'); renderAll(); applyAccessRules();
        toast('success',existingIndex>=0?'Cadastro atualizado':'Concedente cadastrada',existingIndex>=0?'As informações foram salvas no banco online.':'O novo cadastro foi salvo no banco online.');
      } catch(error) {
        console.error(error); toast('error','Não foi possível salvar',error.message||'Falha ao gravar no Supabase.');
      } finally {
        if(submit){submit.disabled=false;submit.innerHTML='<i class="fa-solid fa-floppy-disk"></i>Salvar concedente';}
      }
    }
    function viewCompany(id) {
      const company = state.data.concedentes.find((item) => item.id === id);
      if (!company) return;
      const info = vigenciaInfo(company.inicioVigencia, company.fimVigencia);
      const address = [company.logradouro, company.numero, company.complemento, company.bairro].filter(Boolean).join(', ');
      const source = company.fonteCnpj
        ? `${escapeHTML(company.fonteCnpj)}${company.consultadoEm ? ` — ${escapeHTML(new Date(company.consultadoEm).toLocaleString('pt-BR'))}` : ''}`
        : '—';
      const fields = [
        ['Situação da Vigência', badgeForVigencia(company.situacaoVigencia)],
        ['CNPJ', escapeHTML(company.cnpj || '—')],
        ['Razão Social', escapeHTML(company.razaoSocial)],
        ['Nome Fantasia', escapeHTML(company.nomeFantasia)],
        ['Marca do convênio', escapeHTML(company.marca || '—')],
        ['Situação cadastral', escapeHTML(company.situacaoCadastral || '—')],
        ['Data de abertura', formatDate(company.dataAbertura)],
        ['Natureza jurídica', escapeHTML(company.naturezaJuridica || '—')],
        ['Público/Privado', legalNatureTypeBadge(company.tipoNatureza, company.naturezaJuridica)],
        ['CNAE principal', escapeHTML(company.cnaePrincipal || '—')],
        ['Endereço', escapeHTML(address || '—')],
        ['CEP', escapeHTML(company.cep || '—')],
        ['Cidade/Estado', escapeHTML([company.cidade, company.estado].filter(Boolean).join('/') || '—')],
        ['E-mail', escapeHTML(company.email || '—')],
        ['Telefone', escapeHTML(company.telefone || '—')],
        ['Início da Vigência', formatDate(company.inicioVigencia)],
        ['Fim da Vigência', formatDate(company.fimVigencia)],
        ['Data do Cadastro', formatDate(company.dataCadastro)],
        ['Vigência', escapeHTML(company.vigenciaResumo)],
        ['Dias restantes', info.days === null ? '—' : String(info.days)],
        ['Polo', escapeHTML(company.polo)],
        ['Situação do contato', badgeForSituacao(company.situacao)],
        ['Formas de contato', escapeHTML(company.formasContato.join(', ') || '—')],
        ['Fonte da consulta de CNPJ', source],
        ['Observações', escapeHTML(company.observacoes || '—')]
      ];
      $('#viewModalBody').innerHTML = `<div class="detail-grid">${fields.map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="card-title" style="margin-top:22px"><h3>Histórico de contatos (${company.contatos.length})</h3>${canEdit() ? `<button class="btn btn-sm btn-primary" onclick="window.appOpenContact('${company.id}')"><i class="fa-solid fa-plus"></i>Registrar contato</button>` : ''}</div>${renderTimelineHTML(company)}`;
      openModal('viewModalBackdrop');
    }
    window.appOpenContact=(id)=>{closeModal('viewModalBackdrop');openContactForm(id);};
    function deleteCompany(id) { const c=state.data.concedentes.find(x=>x.id===id); if(!c||!ensureAdmin('excluir concedentes'))return; confirmAction('Excluir concedente',`Deseja excluir permanentemente “${c.nomeFantasia || c.razaoSocial}” e todo o histórico de contatos?`,async()=>{try{await window.remoteData.deleteCompany(id);state.data.concedentes=state.data.concedentes.filter(x=>x.id!==id);if(state.selectedContactCompanyId===id)state.selectedContactCompanyId=null;renderAll();applyAccessRules();toast('success','Cadastro excluído','A concedente foi removida do banco online.');}catch(error){toast('error','Falha ao excluir',error.message||'Não foi possível excluir o cadastro.');}}); }
    function markRenewed(id) {
      const company = state.data.concedentes.find((item) => item.id === id);
      if (!company || !canEdit()) return;
      confirmAction('Marcar como renovado', `Confirmar a renovação de “${company.nomeFantasia || company.razaoSocial}”?`, async () => {
        const previous = company.situacao;
        try {
          await window.remoteData.updateCompanyStatus(id, 'Renovado', company.formasContato);
          company.situacao = 'Renovado';
          company.updatedAt = new Date().toISOString();
          renderAll();
          applyAccessRules();
          toast('success', 'Renovação concluída', 'O cadastro foi marcado como Renovado.');
        } catch (error) {
          company.situacao = previous;
          renderAll();
          applyAccessRules();
          toast('error', 'Falha ao atualizar', error.message || 'Não foi possível atualizar a renovação.');
          return;
        }
        try {
          await applyAutomaticFlowRule(company, 'situacao_alterada', previous);
          await loadRemoteData({ silent: true });
        } catch (error) {
          console.warn('[Fluxo automático após renovação]', error);
          toast('warning', 'Renovação salva', 'A renovação foi concluída, mas a regra automática complementar não pôde ser aplicada.');
        }
      }, false);
    }

    async function lookupCEP() {
      return applyCepAddressAutomatically($('#cep').value, { manual: true });
    }

    function refreshContactSelect() {
      const opts=state.data.concedentes.slice().sort((a,b)=>(a.nomeFantasia||a.razaoSocial).localeCompare(b.nomeFantasia||b.razaoSocial,'pt-BR')).map(c=>`<option value="${c.id}">${escapeHTML(c.nomeFantasia||c.razaoSocial)} — ${escapeHTML(c.cnpj||'sem CNPJ')}</option>`).join('');
      $('#contactCompanySelect').innerHTML='<option value="">Selecione...</option>'+opts;
    }
    function openContactForm(companyId=null, contactId=null) {
      $('#contactForm').reset();
      $$('#contactForm .invalid').forEach(e=>e.classList.remove('invalid'));
      refreshContactSelect();

      const company = companyId ? state.data.concedentes.find((item) => item.id === companyId) : null;
      const contact = contactId && company ? (company.contatos || []).find((item) => item.id === contactId) : null;
      state.editingContactId = contact?.id || null;

      $('#contactId').value = contact?.id || '';
      $('#contactCompanyId').value = companyId || '';
      $('#contactCompanySelect').value = companyId || '';
      $('#contactCompanySelect').disabled = Boolean(contact);
      $('#contactDate').value = contact?.data || todayISO();
      $('#contactTime').value = contact?.horario || new Date().toTimeString().slice(0,5);
      $('#contactResponsible').value = contact?.responsavel || window.currentUser?.nome || '';
      $('#contactMethod').value = contact?.forma || '';
      $('#contactPerson').value = contact?.pessoa || '';
      $('#contactResult').value = contact?.resultado || '';
      $('#contactNextAction').value = contact?.proximaAcao || '';
      $('#contactNextDate').value = contact?.proximaData || '';
      $('#contactNotes').value = contact?.observacoes || '';

      $('#contactModalTitle').textContent = contact ? 'Editar contato' : 'Registrar contato';
      $('#contactSubmitBtn').innerHTML = contact
        ? '<i class="fa-solid fa-floppy-disk"></i>Salvar alterações'
        : '<i class="fa-solid fa-floppy-disk"></i>Registrar contato';

      openModal('contactModalBackdrop');
      setTimeout(() => $('#contactDate')?.focus(), 60);
    }

    async function saveContact() {
      if(!canEdit()){toast('error','Acesso restrito','Seu perfil não pode registrar ou editar contatos.');return;}
      const companyId=$('#contactCompanySelect').value;
      const company=state.data.concedentes.find(c=>c.id===companyId);
      const contactId=$('#contactId').value.trim();

      let valid=true;
      ['contactCompanySelect','contactDate','contactTime','contactResponsible','contactMethod','contactResult'].forEach(id=>{
        const el=$('#'+id);
        el.classList.toggle('invalid',!el.value.trim());
        if(!el.value.trim())valid=false;
      });

      if(!valid||!company){toast('error','Revise o formulário','Preencha os campos obrigatórios do contato.');return;}

      const contact={
        id:contactId||uid(),
        data:$('#contactDate').value,
        horario:$('#contactTime').value,
        responsavel:$('#contactResponsible').value.trim(),
        forma:$('#contactMethod').value,
        pessoa:$('#contactPerson').value.trim(),
        resultado:$('#contactResult').value,
        proximaAcao:$('#contactNextAction').value.trim(),
        proximaData:$('#contactNextDate').value,
        observacoes:$('#contactNotes').value.trim()
      };

      const editing=Boolean(contactId);
      const submit=$('#contactSubmitBtn');
      if(submit){
        submit.disabled=true;
        submit.innerHTML=`<i class="fa-solid fa-spinner fa-spin"></i>${editing?'Salvando...':'Registrando...'}`;
      }

      try{
        const saved=editing
          ? await window.remoteData.updateContact(companyId,contact,company)
          : await window.remoteData.createContact(companyId,contact,company);

        company.contatos=company.contatos||[];
        if(editing){
          const index=company.contatos.findIndex((item)=>item.id===saved.id);
          if(index>=0)company.contatos[index]=saved;
        }else{
          company.contatos.push(saved);
        }

        const latest=[...company.contatos].sort((a,b)=>`${b.data} ${b.horario}`.localeCompare(`${a.data} ${a.horario}`))[0];
        company.situacao=latest?.resultado||company.situacao;
        company.formasContato=[...new Set(company.contatos.map((item)=>item.forma).filter(Boolean))];
        company.updatedAt=new Date().toISOString();

        state.editingContactId=null;
        state.selectedContactCompanyId=companyId;
        closeModal('contactModalBackdrop');
        renderAll();
        applyAccessRules();
        switchPanel('contatos');
        toast('success',editing?'Contato atualizado':'Contato registrado',editing?'As alterações foram salvas no histórico.':'O histórico e a situação foram salvos no banco online.');
      }catch(error){
        console.error(error);
        toast('error',editing?'Falha ao editar contato':'Falha ao registrar contato',error.message||'Não foi possível salvar o contato.');
      }finally{
        $('#contactCompanySelect').disabled=false;
        if(submit){
          submit.disabled=false;
          submit.innerHTML=editing
            ? '<i class="fa-solid fa-floppy-disk"></i>Salvar alterações'
            : '<i class="fa-solid fa-floppy-disk"></i>Registrar contato';
        }
      }
    }
    function renderTimelineHTML(company) {
      const contacts=[...(company.contatos||[])].sort((a,b)=>`${b.data} ${b.horario}`.localeCompare(`${a.data} ${a.horario}`));
      if(!contacts.length)return emptyState('Nenhum contato registrado','Use o botão “Registrar contato” para criar o primeiro histórico.');
      return `<div class="timeline">${contacts.map(c=>`<div class="timeline-item"><div class="timeline-card"><div class="timeline-head"><strong>${escapeHTML(c.resultado)}</strong><div class="timeline-head-actions"><span>${formatDateTime(c.data,c.horario)}</span>${canEdit()?`<button class="btn btn-sm btn-secondary timeline-edit-contact" type="button" data-edit-contact="${c.id}" data-company-id="${company.id}" title="Editar contato"><i class="fa-solid fa-pen"></i></button>`:''}</div></div><div class="timeline-grid"><div><span>Responsável:</span> ${escapeHTML(c.responsavel)}</div><div><span>Forma:</span> ${escapeHTML(c.forma)}</div><div><span>Pessoa contatada:</span> ${escapeHTML(c.pessoa||'—')}</div><div><span>Próxima ação:</span> ${escapeHTML(c.proximaAcao||'—')}</div><div><span>Próximo contato:</span> ${formatDate(c.proximaData)}</div></div>${c.observacoes?`<div class="timeline-notes">${escapeHTML(c.observacoes)}</div>`:''}</div></div>`).join('')}</div>`;
    }

    // V8.5.1: recados usam automaticamente a marca salva no cadastro.
    const outlookMessageStatuses = Object.freeze({
      'Não contatado': 'nao-contatado',
      'Aguardando retorno': 'aguardando-retorno',
      'Documentação solicitada': 'documentacao-solicitada'
    });

    function supportsStandardOutlookMessage(companyOrStatus) {
      const status = typeof companyOrStatus === 'string'
        ? companyOrStatus
        : companyOrStatus?.situacao;
      return Boolean(outlookMessageStatuses[String(status || '').trim()]);
    }

    function currentOutlookGreeting(date = new Date()) {
      return date.getHours() < 12 ? 'bom dia' : 'boa tarde';
    }

    function outlookLocalName(company) {
      return String(company?.nomeFantasia || company?.razaoSocial || 'Local').trim();
    }

    function primaryCompanyEmail(value) {
      const candidates = String(value || '')
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      return candidates.find((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) || '';
    }

    function isValidOutlookRecipient(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
    }

    function buildStandardOutlookMessage(company, brand, date = new Date()) {
      const statusKey = outlookMessageStatuses[String(company?.situacao || '').trim()];
      const greeting = currentOutlookGreeting(date);
      const local = outlookLocalName(company);
      const selectedBrand = String(brand || '').trim();

      if (!statusKey || !selectedBrand) return null;

      if (statusKey === 'nao-contatado') {
        return {
          subject: `Renovação de convênio | ${selectedBrand} e ${local}`,
          body: [
            `Prezados, ${greeting}, tudo bem?`,
            `Verificamos que o convênio firmado entre a ${selectedBrand} e ${local} encontra-se próximo do término de sua vigência.`,
            'Gostaríamos de verificar o interesse na renovação do convênio, por meio de um termo aditivo.',
            'Caso haja interesse na renovação do convênio, formalizaremos o aditivo para apreciação.',
            'Permanecemos à disposição para quaisquer esclarecimentos e aguardamos o retorno.',
            'Atenciosamente,'
          ].join('\n\n')
        };
      }

      if (statusKey === 'aguardando-retorno') {
        return {
          subject: `Solicitação de análise da renovação de convênio | ${selectedBrand}`,
          body: [
            `Prezados, ${greeting}.`,
            `Anteriormente, entramos em contato para verificar o interesse na renovação do convênio vigente com a ${selectedBrand}, pelo período de mais 60 meses.`,
            'A continuidade da parceria reforça a cooperação entre as instituições e contribui diretamente para a formação dos acadêmicos, ao possibilitar a aplicação prática dos conhecimentos adquiridos durante sua trajetória acadêmica.',
            'Para a concedente, o convênio representa uma oportunidade de aproximação com o ambiente educacional, participação no desenvolvimento de novos profissionais e contato com talentos que poderão contribuir futuramente com o mercado de trabalho.',
            'Diante disso, solicitamos a gentileza de confirmar o interesse na renovação, para iniciarmos os procedimentos necessários e assegurar a continuidade da parceria.',
            'Permanecemos à disposição para quaisquer esclarecimentos.',
            'Atenciosamente,'
          ].join('\n\n')
        };
      }

      return {
        subject: `Solicitação de análise documental da renovação de convênio | ${selectedBrand}`,
        body: [
          `Prezados, ${greeting}, tudo bem?`,
          `Anteriormente, encaminhamos o aditivo para renovação do convênio vigente com a ${selectedBrand}, pelo período de mais 60 meses.`,
          'Solicitamos a confirmação do recebimento e a análise documental para seguimento do processo.',
          'Em caso de recebimento e interesse, pedimos que envie o documento assinado, para atualizarmos o cadastro em nosso sistema. Ressaltamos que o representante da instituição realizará a assinatura do documento e uma cópia será encaminhada para apreciação.',
          'Agradecemos desde já pela pareceria e atenção.',
          'Atenciosamente,'
        ].join('\n\n')
      };
    }

    function ensureOutlookMessageUI() {
      if (!$('#outlookMessageModalBackdrop')) {
        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal-backdrop" id="outlookMessageModalBackdrop" aria-hidden="true">
            <div class="modal lg">
              <form id="outlookMessageForm" novalidate>
                <div class="modal-header">
                  <div>
                    <h3>Preparar recado no Outlook</h3>
                    <span id="outlookMessageModalSubtitle" style="display:block;color:var(--muted);font-size:12px;margin-top:4px"></span>
                  </div>
                  <button class="icon-btn" type="button" data-close="outlookMessageModalBackdrop" aria-label="Fechar">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>
                <div class="modal-body">
                  <input type="hidden" id="outlookMessageCompanyId">
                  <div class="summary-box" style="margin-bottom:16px">
                    <i class="fa-brands fa-microsoft"></i>
                    O sistema abrirá o Outlook corporativo com destinatário, título e recado preenchidos. Revise a mensagem no Outlook antes de pressionar Enviar.
                  </div>
                  <div class="form-grid">
                    <div class="form-group">
                      <label>Concedente</label>
                      <input id="outlookMessageCompany" type="text" readonly>
                    </div>
                    <div class="form-group">
                      <label>Situação</label>
                      <input id="outlookMessageSituation" type="text" readonly>
                    </div>
                    <div class="form-group full">
                      <label>Marca do convênio</label>
                      <input id="outlookMessageBrand" type="text" readonly>
                      <small>A marca foi definida no cadastro da concedente e será aplicada automaticamente ao recado.</small>
                    </div>
                    <div class="form-group full">
                      <label>Destinatário <span class="required">*</span></label>
                      <input id="outlookMessageRecipient" type="email" autocomplete="off" placeholder="contato@concedente.com.br" required>
                      <small>O endereço foi preenchido com o e-mail cadastrado e pode ser corrigido antes de abrir o Outlook.</small>
                    </div>
                    <div class="form-group full">
                      <label>Título do e-mail</label>
                      <input id="outlookMessageSubject" type="text" readonly>
                    </div>
                    <div class="form-group full">
                      <label>Corpo do e-mail</label>
                      <textarea id="outlookMessageBody" rows="16" readonly></textarea>
                    </div>
                  </div>
                  <div id="outlookMessageValidation" class="summary-box" style="margin-top:14px">
                    A marca do convênio será carregada automaticamente do cadastro.
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-close="outlookMessageModalBackdrop">Cancelar</button>
                  <button type="submit" class="btn btn-primary" id="openOutlookMessage" disabled>
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>Abrir no Outlook
                  </button>
                </div>
              </form>
            </div>
          </div>
        `);
      }

      const addContactButton = $('#addContactSelected');
      if (addContactButton && !$('#prepareOutlookSelected')) {
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.flexWrap = 'wrap';
        actions.style.gap = '8px';

        const outlookButton = document.createElement('button');
        outlookButton.type = 'button';
        outlookButton.id = 'prepareOutlookSelected';
        outlookButton.className = 'btn btn-sm btn-secondary hidden';
        outlookButton.innerHTML = '<i class="fa-solid fa-envelope"></i>Preparar recado';

        addContactButton.parentElement.insertBefore(actions, addContactButton);
        actions.appendChild(outlookButton);
        actions.appendChild(addContactButton);
      }
    }

    function setOutlookMessageValidation(message, type = 'info') {
      const box = $('#outlookMessageValidation');
      if (!box) return;
      box.textContent = message;
      box.style.borderColor = type === 'error'
        ? 'rgba(220,38,38,.35)'
        : type === 'success'
          ? 'rgba(22,163,74,.35)'
          : '';
      box.style.color = type === 'error'
        ? '#b91c1c'
        : type === 'success'
          ? '#15803d'
          : '';
    }

    function selectedOutlookBrand() {
      const company = state.data.concedentes.find(
        (item) => item.id === $('#outlookMessageCompanyId')?.value
      );
      return normalizeBrand(company?.marca);
    }

    function refreshOutlookMessagePreview() {
      const company = state.data.concedentes.find(
        (item) => item.id === $('#outlookMessageCompanyId')?.value
      );
      const brand = selectedOutlookBrand();
      const draft = company && brand
        ? buildStandardOutlookMessage(company, brand)
        : null;
      const recipient = $('#outlookMessageRecipient')?.value.trim() || '';
      const submit = $('#openOutlookMessage');

      if ($('#outlookMessageSubject')) {
        $('#outlookMessageSubject').value = draft?.subject || '';
      }
      if ($('#outlookMessageBody')) {
        $('#outlookMessageBody').value = draft?.body || '';
      }

      const brandOk = Boolean(brand);
      const recipientOk = isValidOutlookRecipient(recipient);
      const draftOk = Boolean(draft);

      if (submit) submit.disabled = !(brandOk && recipientOk && draftOk);

      if (!brandOk) {
        setOutlookMessageValidation('A concedente não possui marca definida. Edite o cadastro e selecione Uniasselvi ou Unicesumar.', 'error');
      } else if (!recipientOk) {
        setOutlookMessageValidation('Informe um endereço de e-mail válido para continuar.', 'error');
      } else {
        setOutlookMessageValidation('Recado validado. O Outlook será aberto para sua conferência e envio.', 'success');
      }
    }

    function openOutlookMessage(companyId) {
      ensureOutlookMessageUI();
      const company = state.data.concedentes.find((item) => item.id === companyId);

      if (!company) {
        toast('error', 'Concedente não encontrada', 'Não foi possível localizar o cadastro selecionado.');
        return;
      }

      if (!supportsStandardOutlookMessage(company)) {
        toast(
          'warning',
          'Recado específico necessário',
          'Esta situação não utiliza um dos recados padronizados configurados.'
        );
        return;
      }

      if (!normalizeBrand(company.marca)) {
        toast(
          'warning',
          'Marca não informada',
          'Edite a concedente e selecione Uniasselvi ou Unicesumar antes de preparar o recado.'
        );
        openCompanyForm(company.id);
        setTimeout(() => document.querySelector('input[name="marcaConvenio"]')?.focus(), 120);
        return;
      }

      $('#outlookMessageCompanyId').value = company.id;
      $('#outlookMessageCompany').value = outlookLocalName(company);
      $('#outlookMessageSituation').value = company.situacao || '';
      $('#outlookMessageBrand').value = normalizeBrand(company.marca);
      $('#outlookMessageRecipient').value = primaryCompanyEmail(company.email);
      $('#outlookMessageSubject').value = '';
      $('#outlookMessageBody').value = '';
      $('#outlookMessageModalSubtitle').textContent = `${outlookLocalName(company)} • ${company.situacao} • ${company.marca}`;

      refreshOutlookMessagePreview();
      openModal('outlookMessageModalBackdrop');

      if (!$('#outlookMessageRecipient').value) {
        setTimeout(() => $('#outlookMessageRecipient')?.focus(), 80);
        toast(
          'warning',
          'E-mail não cadastrado',
          'Informe o destinatário na janela de validação antes de abrir o Outlook.'
        );
      }
    }

    // V8.5.2: composição do Outlook com espaços percent-encoded.
    function submitOutlookMessage(event) {
      event.preventDefault();

      const company = state.data.concedentes.find(
        (item) => item.id === $('#outlookMessageCompanyId')?.value
      );
      const brand = selectedOutlookBrand();
      const recipient = $('#outlookMessageRecipient')?.value.trim() || '';
      const draft = company && brand
        ? buildStandardOutlookMessage(company, brand)
        : null;

      if (!company || !supportsStandardOutlookMessage(company)) {
        setOutlookMessageValidation('A concedente ou a situação não é válida para este recado.', 'error');
        return;
      }

      if (!brand) {
        setOutlookMessageValidation('A marca não está definida no cadastro da concedente.', 'error');
        return;
      }

      if (!isValidOutlookRecipient(recipient)) {
        setOutlookMessageValidation('Informe um endereço de e-mail válido.', 'error');
        $('#outlookMessageRecipient')?.focus();
        return;
      }

      if (!draft) {
        setOutlookMessageValidation('Não foi possível gerar o recado desta situação.', 'error');
        return;
      }

      // O Outlook Web não interpreta corretamente espaços serializados como "+".
      // Cada valor é codificado individualmente para manter espaços como "%20".
      const outlookQuery = [
        `to=${encodeURIComponent(recipient)}`,
        `subject=${encodeURIComponent(draft.subject)}`,
        `body=${encodeURIComponent(draft.body)}`
      ].join('&');

      const outlookUrl =
        `https://outlook.office.com/mail/deeplink/compose?${outlookQuery}`;

      const outlookWindow = window.open(outlookUrl, '_blank');
      if (!outlookWindow) {
        setOutlookMessageValidation(
          'O navegador bloqueou a nova guia. Libere pop-ups para este site e tente novamente.',
          'error'
        );
        toast('error', 'Outlook bloqueado', 'Permita a abertura de pop-ups para preparar o recado.');
        return;
      }

      try { outlookWindow.opener = null; } catch {}
      closeModal('outlookMessageModalBackdrop');
      toast(
        'success',
        'Recado preparado',
        'O Outlook foi aberto. Revise o conteúdo e pressione Enviar.'
      );
    }

    function renderContactsPanel() {
      const q=normalize($('#contactCompanySearch').value); const companies=state.data.concedentes.filter(c=>normalize(`${c.nomeFantasia} ${c.razaoSocial} ${c.cnpj} ${c.cidade}`).includes(q)).sort((a,b)=>(a.nomeFantasia||a.razaoSocial).localeCompare(b.nomeFantasia||b.razaoSocial,'pt-BR'));
      $('#contactCompanyList').innerHTML=companies.length?companies.map(c=>`<div class="contact-company-item ${state.selectedContactCompanyId===c.id?'active':''}" data-id="${c.id}"><strong>${escapeHTML(c.nomeFantasia||c.razaoSocial)}</strong><small>${escapeHTML(c.cidade)}/${escapeHTML(c.estado)} • ${escapeHTML(c.marca||'Sem marca')} • ${c.contatos.length} contato(s)</small></div>`).join(''):emptyState('Nenhuma concedente encontrada','Ajuste a pesquisa.');
      $$('.contact-company-item').forEach(el=>el.onclick=()=>{state.selectedContactCompanyId=el.dataset.id;renderContactsPanel();});
      const c=state.data.concedentes.find(x=>x.id===state.selectedContactCompanyId);
      const outlookButton = $('#prepareOutlookSelected');
      if(c){
        $('#contactTimelineTitle').textContent=c.nomeFantasia||c.razaoSocial;
        $('#contactTimelineSubtitle').textContent=`${c.cnpj||'Sem CNPJ'} • ${c.cidade}/${c.estado} • ${c.marca||'Sem marca'}`;
        $('#addContactSelected').classList.remove('hidden');
        if(outlookButton){
          outlookButton.dataset.companyId=c.id;
          outlookButton.classList.toggle('hidden',!supportsStandardOutlookMessage(c));
          outlookButton.title=supportsStandardOutlookMessage(c)
            ? `Preparar recado padrão para ${c.situacao}`
            : 'Esta situação utiliza um recado específico';
        }
        $('#contactTimeline').innerHTML=renderTimelineHTML(c);
      }else{
        $('#contactTimelineTitle').textContent='Selecione uma concedente';
        $('#contactTimelineSubtitle').textContent='O histórico será exibido aqui.';
        $('#addContactSelected').classList.add('hidden');
        if(outlookButton){
          outlookButton.dataset.companyId='';
          outlookButton.classList.add('hidden');
        }
        $('#contactTimeline').innerHTML=emptyState('Nenhuma concedente selecionada','Escolha uma empresa na lista ao lado.');
      }
    }

    function renderKanban() {
      $('#kanbanBoard').innerHTML=kanbanStages.map(stage=>{const companies=state.data.concedentes.filter(c=>c.situacao===stage);return `<section class="kanban-column" data-stage="${stage}"><div class="kanban-head"><strong>${stage}</strong><span class="kanban-count">${companies.length}</span></div><div class="kanban-list">${companies.map(c=>{const info=vigenciaInfo(c.inicioVigencia,c.fimVigencia);const lc=latestContact(c);return `<article class="kanban-card" draggable="true" data-id="${c.id}"><h4>${escapeHTML(c.nomeFantasia||c.razaoSocial)}</h4><div class="company-name">${escapeHTML(c.razaoSocial)}</div><div class="kanban-info"><div>CNPJ<strong>${escapeHTML(c.cnpj||'—')}</strong></div><div>Localização<strong>${escapeHTML(c.cidade)}/${escapeHTML(c.estado)}</strong></div><div>Polo<strong>${escapeHTML(c.polo||'—')}</strong></div><div>Marca<strong>${escapeHTML(c.marca||'—')}</strong></div><div>Fim da vigência<strong>${formatDate(c.fimVigencia)}</strong></div><div>Dias restantes<strong>${info.days===null?'—':info.days}</strong></div><div>Último contato<strong>${lc?formatDate(lc.data):'—'}</strong></div></div><div class="kanban-footer"><span class="badge ${info.days!==null&&info.days<0?'badge-danger':info.days!==null&&info.days<=30?'badge-orange':'badge-muted'}">${info.days===null?'Sem data':info.days<0?'Vencido':`${info.days} dias`}</span><div style="display:flex;gap:6px"><button class="btn btn-sm btn-secondary" data-kanban-contact="${c.id}" title="Registrar contato"><i class="fa-solid fa-phone"></i></button>${supportsStandardOutlookMessage(c)?`<button class="btn btn-sm btn-secondary" data-kanban-outlook="${c.id}" title="Preparar recado no Outlook"><i class="fa-solid fa-envelope"></i></button>`:''}</div></div>${lc&&lc.proximaAcao?`<div style="font-size:10px;color:var(--muted);margin-top:8px">Próxima ação: ${escapeHTML(lc.proximaAcao)}</div>`:''}</article>`;}).join('')}</div></section>`;}).join('');
      $$('.kanban-card').forEach((card) => {
        card.addEventListener('dragstart', (event) => {
          if (!canEdit() || maintenanceBlocksWrites()) {
            event.preventDefault();
            ensureOperationalWrite('movimentar o Kanban');
            return;
          }
          event.dataTransfer.setData('text/plain', card.dataset.id);
          card.style.opacity = '.55';
        });
        card.addEventListener('dragend', () => { card.style.opacity = '1'; });
      });
      $$('.kanban-column').forEach((column) => {
        column.addEventListener('dragover', (event) => {
          if (!canEdit() || maintenanceBlocksWrites()) return;
          event.preventDefault();
          column.classList.add('drag-over');
        });
        column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
        column.addEventListener('drop', async (event) => {
          event.preventDefault();
          column.classList.remove('drag-over');
          if (!canEdit()) {
            toast('error', 'Acesso restrito', 'Seu perfil não pode movimentar o Kanban.');
            return;
          }
          if (!ensureOperationalWrite('movimentar o Kanban')) return;
          const id = event.dataTransfer.getData('text/plain');
          const company = state.data.concedentes.find((item) => item.id === id);
          const destination = column.dataset.stage;
          if (!company || company.situacao === destination) return;
          const previous = company.situacao;
          try {
            await window.remoteData.updateCompanyStatus(id, destination, company.formasContato);
            company.situacao = destination;
            renderAll();
            applyAccessRules();
            toast('success', 'Etapa atualizada', `O cartão foi movido para “${destination}”.`);
          } catch (error) {
            company.situacao = previous;
            renderAll();
            applyAccessRules();
            toast('error', 'Falha ao mover cartão', error.message || 'Não foi possível atualizar a etapa.');
            return;
          }
          try {
            await applyAutomaticFlowRule(company, 'situacao_alterada', previous);
            await loadRemoteData({ silent: true });
          } catch (error) {
            console.warn('[Fluxo automático após Kanban]', error);
            toast('warning', 'Etapa salva', 'O Kanban foi atualizado, mas a regra automática complementar não pôde ser aplicada.');
          }
        });
      });
      $$('[data-kanban-contact]').forEach(b=>b.onclick=e=>{e.stopPropagation();openContactForm(b.dataset.kanbanContact);});
      $$('[data-kanban-outlook]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openOutlookMessage(b.dataset.kanbanOutlook);});
      const board = $('#kanbanBoard');
      const scroller = board?.closest('.kanban-wrap');
      if (scroller) {
        scroller.scrollLeft = state.kanbanScrollLeft || 0;
        enableKanbanMouseScroll(scroller);
      }
    }

    // V8.4.7: deslocamento lateral somente por clique e arraste.
    // A roda do mouse mantém a rolagem vertical normal da página.
    function enableKanbanMouseScroll(scroller = document.querySelector('.kanban-wrap')) {
      if (!scroller || scroller.dataset.mouseScrollBound === 'true') return;
      scroller.dataset.mouseScrollBound = 'true';
      scroller.setAttribute('aria-label', 'Quadro de renovações: clique e arraste uma área vazia para mover lateralmente');
      scroller.style.cursor = 'grab';
      scroller.style.overscrollBehaviorX = 'contain';

      scroller.addEventListener('scroll', () => {
        state.kanbanScrollLeft = scroller.scrollLeft;
      }, { passive: true });

      let dragging = false;
      let startX = 0;
      let startScroll = 0;
      let activePointerId = null;

      scroller.addEventListener('pointerdown', (event) => {
        if (
          event.button !== 0
          || event.target.closest('button, input, select, textarea, a, .kanban-card')
        ) return;
        dragging = true;
        activePointerId = event.pointerId;
        startX = event.clientX;
        startScroll = scroller.scrollLeft;
        scroller.style.cursor = 'grabbing';
        scroller.style.userSelect = 'none';
        scroller.setPointerCapture?.(event.pointerId);
      });

      scroller.addEventListener('pointermove', (event) => {
        if (!dragging || event.pointerId !== activePointerId) return;
        event.preventDefault();
        scroller.scrollLeft = startScroll - (event.clientX - startX);
      });

      const stopDragging = () => {
        if (!dragging) return;
        dragging = false;
        scroller.style.cursor = 'grab';
        scroller.style.userSelect = '';
        if (activePointerId !== null) {
          try { scroller.releasePointerCapture?.(activePointerId); } catch {}
        }
        activePointerId = null;
      };

      scroller.addEventListener('pointerup', stopDragging);
      scroller.addEventListener('pointercancel', stopDragging);
      scroller.addEventListener('lostpointercapture', stopDragging);

    }

    function renderAlerts() {
      document.dispatchEvent(new CustomEvent('app:data-updated'));
    }


    function renderReports() {
      const data=state.data.concedentes.map(normalizeCompany), total=data.length, renewed=data.filter(c=>c.situacao==='Renovado').length, contacts=data.reduce((s,c)=>s+c.contatos.length,0), noContact=data.filter(c=>!c.contatos.length).length, percent=total?((renewed/total)*100).toFixed(1):'0,0';
      const metrics=[['Total de convênios',total,'fa-file-contract','primary'],['Renovações concluídas',renewed,'fa-circle-check','success'],['Percentual de renovação',`${String(percent).replace('.',',')}%`,'fa-percent','success'],['Contatos realizados',contacts,'fa-comments','primary'],['Concedentes sem contato',noContact,'fa-phone-slash','orange'],['Estados atendidos',new Set(data.map(c=>c.estado).filter(Boolean)).size,'fa-map','primary'],['Cidades atendidas',new Set(data.map(c=>`${c.estado}-${c.cidade}`).filter(x=>!x.endsWith('-'))).size,'fa-city','primary'],['Polos cadastrados',new Set(data.map(c=>c.polo).filter(Boolean)).size,'fa-location-dot','primary']];
      $('#reportMetrics').innerHTML=metrics.map(([l,v,i,t])=>`<div class="card metric-card" data-tone="${t}"><div class="metric-icon"><i class="fa-solid ${i}"></i></div><div class="metric-value">${v}</div><div class="metric-label">${l}</div></div>`).join('');
      const byV=countBy(data,c=>c.situacaoVigencia), byS=countBy(data,c=>c.situacao);
      createChart('reportV','reportChartVigencia',{type:'doughnut',data:{labels:Object.keys(byV),datasets:[{data:Object.values(byV),backgroundColor:chartColors(),borderWidth:0}]},options:{cutout:'58%',plugins:{legend:{position:'bottom'}}}});
      createChart('reportS','reportChartSituacao',{type:'bar',data:{labels:Object.keys(byS),datasets:[{label:'Total',data:Object.values(byS),backgroundColor:'#1D1934',borderRadius:6}]},options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0}},y:{grid:{display:false}}}}});
      const monthMap={}; data.filter(c=>c.fimVigencia).forEach(c=>{const d=parseDate(c.fimVigencia);const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;monthMap[k]=(monthMap[k]||0)+1;}); const months=Object.keys(monthMap).sort().slice(-12);
      createChart('reportM','reportChartMes',{type:'line',data:{labels:months.map(m=>{const[y,mo]=m.split('-');return new Date(Number(y),Number(mo)-1,1).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});}),datasets:[{label:'Vencimentos',data:months.map(m=>monthMap[m]),borderColor:'#16a34a',backgroundColor:'rgba(22,163,74,.12)',fill:true,tension:.3}]},options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0}}}}});
      const loc=countBy(data,c=>`${c.estado}|${c.cidade}`); $('#reportLocationBody').innerHTML=Object.entries(loc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{const[e,c]=k.split('|');return`<tr><td>${escapeHTML(e)}</td><td>${escapeHTML(c)}</td><td>${v}</td></tr>`;}).join('');
      const polos=countBy(data,c=>c.polo); $('#reportPoloBody').innerHTML=Object.entries(polos).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${escapeHTML(k)}</td><td>${v}</td><td>${total?((v/total)*100).toFixed(1).replace('.',','):'0,0'}%</td></tr>`).join('');
    }
    function renderSettings() {
      const contacts = state.data.concedentes.reduce((sum, company) => sum + company.contatos.length, 0);
      $('#storageSummary').textContent = `${state.data.concedentes.length} concedente(s) e ${contacts} contato(s) no Supabase.`;
      renderExportHistory();
      updateAutomaticBackupStatus();
    }

    function renderAll() {
      state.data.concedentes=state.data.concedentes.map(normalizeCompany); updateFilterOptions(); renderAlerts(); renderSettings();
      const active=$('.panel.active')?.id.replace('panel-','')||'dashboard';
      if(active==='dashboard')renderDashboard(); if(active==='concedentes')renderCompanies(); if(active==='renovacoes')renderKanban(); if(active==='contatos')renderContactsPanel(); if(active==='fila')renderWorkQueue(); if(active==='qualidade')renderDataQuality(); if(active==='notificacoes')window.notificationsPanel?.open(); if(active==='relatorios')renderReports();
      applyAccessRules();
    }
    function refreshChartsIfVisible(){setTimeout(()=>{const active=$('.panel.active')?.id;if(active==='panel-dashboard')renderDashboard();if(active==='panel-relatorios')renderReports();},30);}

    const CSV_HEADERS = ['Situação da Vigência','CNPJ','Razão Social','Nome Fantasia','Marca','Data de Abertura','Situação Cadastral','Natureza Jurídica','Público/Privado','CNAE Principal (código e descrição)','CEP','Logradouro','Número','Complemento','Bairro','Estado','Cidade','E-mail','Telefone','Polo','Responsável pelo acompanhamento','Prioridade','Etiquetas','Início da Vigência','Fim da Vigência','Dias restantes','Data do Cadastro','Vigência','Situação','Forma de Contato','Fonte do CNPJ','Última consulta do CNPJ','Observações'];
    function csvEscape(value){const s=String(value??'').replace(/"/g,'""');return /[;"\n\r]/.test(s)?`"${s}"`:s;}
    function companyToCsvRow(c){return [c.situacaoVigencia,c.cnpj,c.razaoSocial,c.nomeFantasia,c.marca,formatDate(c.dataAbertura),c.situacaoCadastral,c.naturezaJuridica,legalNatureType(c.tipoNatureza,c.naturezaJuridica),c.cnaePrincipal,c.cep,c.logradouro,c.numero,c.complemento,c.bairro,c.estado,c.cidade,c.email,c.telefone,c.polo,c.responsavelAcompanhamento||'',c.prioridade||'Média',normalizeTags(c.etiquetas).join(', '),formatDate(c.inicioVigencia),formatDate(c.fimVigencia),c.diasRestantes??'',formatDate(c.dataCadastro),c.vigenciaResumo,c.situacao,c.formasContato.join(', '),c.fonteCnpj,c.consultadoEm?new Date(c.consultadoEm).toLocaleString('pt-BR'):'',c.observacoes];}

    function formatBytes(bytes) {
      const value = Number(bytes || 0);
      if (!value) return '—';
      if (value < 1024) return `${value} B`;
      if (value < 1024 ** 2) return `${(value / 1024).toFixed(1).replace('.', ',')} KB`;
      return `${(value / (1024 ** 2)).toFixed(1).replace('.', ',')} MB`;
    }

    function safeFileName(value) {
      return String(value || 'arquivo')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 150);
    }

    function downloadBlob(content, type, filename) {
      const blob = content instanceof Blob ? content : new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return blob;
    }

    async function saveBlobToDevice(blob, filename, { usePicker = false } = {}) {
      const fileBlob = blob instanceof Blob ? blob : new Blob([blob]);
      if (usePicker && typeof window.showSaveFilePicker === 'function') {
        try {
          const extension = String(filename).includes('.') ? `.${String(filename).split('.').pop()}` : '';
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: extension === '.json' ? 'Arquivo JSON' : 'Planilha do Excel',
              accept: {
                [(fileBlob.type || 'application/octet-stream').split(';')[0]]: extension ? [extension] : []
              }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(fileBlob);
          await writable.close();
          return true;
        } catch (error) {
          if (error?.name === 'AbortError') return false;
          console.warn('[Download] O seletor de arquivos falhou; usando download padrão.', error);
        }
      }
      downloadBlob(fileBlob, fileBlob.type || 'application/octet-stream', filename);
      return true;
    }

    function workbookBlob(sheetDefinitions) {
      if (!window.XLSX) throw new Error('O gerador de planilhas não foi carregado. Atualize a página.');
      const workbook = window.XLSX.utils.book_new();
      sheetDefinitions.forEach(({ name, rows, widths = [] }) => {
        const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
        if (widths.length) worksheet['!cols'] = widths.map((width) => ({ wch: width }));
        worksheet['!autofilter'] = rows.length && rows[0].length
          ? { ref: window.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: rows[0].length - 1 } }) }
          : undefined;
        window.XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
      });
      const array = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
      return new Blob([array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    async function getAuthenticatedToken({ refresh = false } = {}) {
      const client = window.database?.client;
      if (!client) throw new Error('A conexão de autenticação não está disponível.');
      const result = refresh ? await client.auth.refreshSession() : await client.auth.getSession();
      if (result.error) throw result.error;
      const token = result.data?.session?.access_token;
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
      return token;
    }

    async function exportApi(path = '', options = {}, retry = true) {
      const token = await getAuthenticatedToken();
      const response = await fetch(`/api/exports${path}`, {
        cache: 'no-store',
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.headers || {})
        }
      });
      if (response.status === 401 && retry) {
        const refreshed = await getAuthenticatedToken({ refresh: true });
        return fetch(`/api/exports${path}`, {
          cache: 'no-store',
          ...options,
          headers: {
            Authorization: `Bearer ${refreshed}`,
            ...(options.headers || {})
          }
        });
      }
      return response;
    }

    async function saveExportHistory(blob, filename, kind, totalRecords = 0) {
      try {
        const response = await exportApi('', {
          method: 'POST',
          headers: {
            'Content-Type': blob.type || 'application/octet-stream',
            'X-Export-Filename': safeFileName(filename),
            'X-Export-Kind': String(kind || 'planilha').slice(0, 50),
            'X-Export-Records': String(Number(totalRecords || 0))
          },
          body: blob
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || payload?.message || `Erro HTTP ${response.status}`);
        state.exportHistoryLoadedAt = 0;
        await loadExportHistory({ silent: true });
        return true;
      } catch (error) {
        console.warn('[Exportações] Não foi possível registrar o arquivo:', error);
        toast('warning', 'Arquivo baixado sem histórico', error.message || 'Não foi possível salvar uma cópia na pasta online.');
        return false;
      }
    }

    async function completeSpreadsheetDownload(blob, filename, kind, totalRecords = 0) {
      downloadBlob(blob, blob.type, filename);
      return saveExportHistory(blob, filename, kind, totalRecords);
    }

    async function exportCompanies(mode) {
      if (!ensureAdmin('exportar cadastros')) return;
      let rows = [];
      const now = parseDate(todayISO());
      if (mode === 'all') rows = state.data.concedentes;
      if (mode === 'filtered') rows = getFilteredCompanies();
      if (mode === 'expired') rows = state.data.concedentes.filter((company) => calculateVigenciaStatus(company.fimVigencia) === 'Vencido');
      if (mode === 'upcoming') rows = state.data.concedentes.filter((company) => company.fimVigencia && (() => {
        const days = daysBetween(now, parseDate(company.fimVigencia));
        return days >= 0 && days <= 90;
      })());
      if (!rows.length) {
        toast('warning', 'Nada para exportar', 'Nenhum registro corresponde à opção escolhida.');
        return;
      }

      const filename = `renovacoes_convenios_${new Date().toLocaleDateString('pt-BR').replaceAll('/', '-')}.xlsx`;
      const blob = workbookBlob([{
        name: 'Concedentes',
        rows: [CSV_HEADERS, ...rows.map(companyToCsvRow)],
        widths: [23,19,34,28,16,22,28,24,16,38,12,28,10,20,20,10,22,30,18,20,28,14,34,18,18,16,18,24,24,28,24,24,40]
      }]);
      closeModal('exportModalBackdrop');
      await completeSpreadsheetDownload(blob, filename, `concedentes-${mode}`, rows.length);
      toast('success', 'Exportação concluída', `${rows.length} registro(s) exportado(s) e salvos no histórico.`);
    }

    async function exportContacts() {
      if (!ensureAdmin('exportar contatos')) return;
      const headers = ['Concedente','CNPJ','Data do contato','Horário','Responsável','Forma de contato','Pessoa contatada','Resultado do contato','Próxima ação','Próximo contato','Observações'];
      const rows = state.data.concedentes.flatMap((company) => (company.contatos || []).map((contact) => [
        company.nomeFantasia || company.razaoSocial, company.cnpj, formatDate(contact.data), contact.horario,
        contact.responsavel, contact.forma, contact.pessoa, contact.resultado, contact.proximaAcao,
        formatDate(contact.proximaData), contact.observacoes
      ]));
      if (!rows.length) {
        toast('warning', 'Sem contatos', 'Não há histórico para exportar.');
        return;
      }
      const filename = `historico_contatos_${new Date().toLocaleDateString('pt-BR').replaceAll('/', '-')}.xlsx`;
      const blob = workbookBlob([{ name: 'Contatos', rows: [headers, ...rows], widths: [34,19,18,12,24,20,24,28,34,18,45] }]);
      closeModal('exportModalBackdrop');
      await completeSpreadsheetDownload(blob, filename, 'contatos', rows.length);
      toast('success', 'Histórico exportado', `${rows.length} contato(s) exportado(s) e salvos no histórico.`);
    }

    async function exportReportCSV() {
      if (!ensureAdmin('exportar relatórios')) return;
      const total = state.data.concedentes.length;
      const renewed = state.data.concedentes.filter((company) => company.situacao === 'Renovado').length;
      const contacts = state.data.concedentes.reduce((sum, company) => sum + company.contatos.length, 0);
      const sections = [
        ['Indicador','Valor'],
        ['Total de convênios', total],
        ['Renovações concluídas', renewed],
        ['Percentual de renovação', total ? `${((renewed / total) * 100).toFixed(1).replace('.', ',')}%` : '0,0%'],
        ['Contatos realizados', contacts],
        ['Concedentes sem contato', state.data.concedentes.filter((company) => !company.contatos.length).length],
        [],
        ['Situação da Vigência','Total'],
        ...Object.entries(countBy(state.data.concedentes, (company) => company.situacaoVigencia)),
        [],
        ['Situação do Contato','Total'],
        ...Object.entries(countBy(state.data.concedentes, (company) => company.situacao)),
        [],
        ['Estado','Total'],
        ...Object.entries(countBy(state.data.concedentes, (company) => company.estado)),
        [],
        ['Cidade','Total'],
        ...Object.entries(countBy(state.data.concedentes, (company) => company.cidade)),
        [],
        ['Polo','Total'],
        ...Object.entries(countBy(state.data.concedentes, (company) => company.polo))
      ];
      const filename = `relatorios_convenios_${new Date().toLocaleDateString('pt-BR').replaceAll('/', '-')}.xlsx`;
      const blob = workbookBlob([{ name: 'Relatórios', rows: sections, widths: [38,20] }]);
      await completeSpreadsheetDownload(blob, filename, 'relatorios', total);
      toast('success', 'Relatório exportado', 'A planilha foi gerada e registrada no histórico.');
    }

    function renderExportHistory() {
      const body = $('#exportHistoryBody');
      const status = $('#exportHistoryStatus');
      if (!body || !status) return;
      if (state.exportHistoryLoading) {
        status.textContent = 'Atualizando histórico…';
        body.innerHTML = '<tr><td colspan="7"><div class="empty-state compact"><i class="fa-solid fa-spinner fa-spin"></i><strong>Carregando arquivos</strong></div></td></tr>';
        return;
      }
      status.textContent = state.exportHistoryLoadedAt
        ? `Atualizado em ${new Date(state.exportHistoryLoadedAt).toLocaleString('pt-BR')}`
        : 'Ainda não atualizado';
      if (!state.exportHistory.length) {
        body.innerHTML = '<tr><td colspan="7"><div class="empty-state compact"><i class="fa-solid fa-folder-open"></i><strong>Nenhuma exportação registrada</strong><span>Os próximos downloads serão armazenados automaticamente.</span></div></td></tr>';
        return;
      }
      body.innerHTML = state.exportHistory.map((item) => `
        <tr>
          <td><strong>${escapeHTML(item.arquivo_nome || 'Arquivo')}</strong><small class="table-cell-note">${escapeHTML(item.origem === 'automatica' ? 'Exportação automática' : 'Download manual')}</small></td>
          <td>${escapeHTML(item.tipo || '—')}</td>
          <td>${escapeHTML(item.usuario_nome || 'Sistema')}</td>
          <td>${Number(item.total_registros || 0).toLocaleString('pt-BR')}</td>
          <td>${formatBytes(item.tamanho_bytes)}</td>
          <td>${item.criado_em ? new Date(item.criado_em).toLocaleString('pt-BR') : '—'}</td>
          <td><button class="btn btn-sm btn-secondary" type="button" data-download-export="${item.id}" title="Baixar novamente"><i class="fa-solid fa-download"></i></button></td>
        </tr>`).join('');
    }

    async function loadExportHistory({ force = false, silent = false } = {}) {
      if (!isAdmin()) return;
      if (!force && state.exportHistoryLoadedAt && Date.now() - state.exportHistoryLoadedAt < 60000) {
        renderExportHistory();
        return;
      }
      state.exportHistoryLoading = true;
      renderExportHistory();
      try {
        const response = await exportApi('');
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || payload?.message || `Erro HTTP ${response.status}`);
        state.exportHistory = Array.isArray(payload?.data?.items) ? payload.data.items : [];
        state.exportHistoryLoadedAt = Date.now();
      } catch (error) {
        console.error('[Exportações] Falha ao carregar histórico:', error);
        if (!silent) toast('error', 'Falha ao carregar exportações', error.message || 'Não foi possível consultar o histórico.');
      } finally {
        state.exportHistoryLoading = false;
        renderExportHistory();
        updateAutomaticBackupStatus();
      }
    }


    function saoPauloClock(date = new Date()) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(date).reduce((accumulator, part) => {
        if (part.type !== 'literal') accumulator[part.type] = part.value;
        return accumulator;
      }, {});
      return {
        dateKey: `${parts.year}-${parts.month}-${parts.day}`,
        hour: Number(parts.hour || 0),
        minute: Number(parts.minute || 0)
      };
    }

    function updateAutomaticBackupStatus(message = '') {
      const holder = $('#automaticBackupStatus');
      if (!holder) return;
      if (message) {
        holder.textContent = message;
        return;
      }
      const clock = saoPauloClock();
      const todayBackup = state.exportHistory.find((item) => (
        item.origem === 'automatica'
        && String(item.tipo || '').includes('backup-json')
        && String(item.arquivo_nome || '').includes(clock.dateKey)
      ));
      holder.textContent = todayBackup
        ? `Backup de hoje concluído em ${new Date(todayBackup.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
        : clock.hour >= 18
          ? 'Backup de hoje ainda não identificado. O sistema fará uma nova tentativa.'
          : 'Próxima execução programada para hoje às 18:00.';
    }

    async function runAutomaticBackup({ force = false, silent = false } = {}) {
      if (!isAdmin() || state.automaticBackupRunning) return null;
      state.automaticBackupRunning = true;
      const button = $('#runAutomaticBackupNow');
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Executando…';
      }
      updateAutomaticBackupStatus('Gerando backup online…');
      try {
        const response = await exportApi('?action=automatic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok !== true) {
          throw new Error(payload?.error || payload?.message || `Erro HTTP ${response.status}`);
        }
        state.exportHistoryLoadedAt = 0;
        await loadExportHistory({ force: true, silent: true });
        updateAutomaticBackupStatus(
          payload?.data?.skipped
            ? 'O backup de hoje já havia sido concluído.'
            : 'Backup online concluído com sucesso.'
        );
        if (!silent) {
          toast(
            'success',
            payload?.data?.skipped ? 'Backup já existente' : 'Backup automático concluído',
            payload?.data?.skipped
              ? 'A cópia de hoje já estava disponível no histórico.'
              : 'Foram salvos o backup JSON e as planilhas de concedentes e contatos.'
          );
        }
        return payload.data || {};
      } catch (error) {
        console.error('[Backup automático]', error);
        updateAutomaticBackupStatus(`Falha na última tentativa: ${error.message || 'erro desconhecido'}`);
        if (!silent) toast('error', 'Falha no backup automático', error.message || 'Não foi possível gerar a cópia online.');
        return null;
      } finally {
        state.automaticBackupRunning = false;
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fa-solid fa-play"></i>Executar agora';
        }
      }
    }

    async function checkAutomaticBackupSchedule() {
      if (!window.currentUser?.id || !isAdmin() || state.automaticBackupRunning) return;
      const clock = saoPauloClock();
      if (clock.hour < 18) {
        updateAutomaticBackupStatus();
        return;
      }
      if (state.automaticBackupLastCheck === clock.dateKey) {
        updateAutomaticBackupStatus();
        return;
      }
      state.automaticBackupLastCheck = clock.dateKey;
      await runAutomaticBackup({ force: false, silent: true });
    }

    function startAutomaticBackupScheduler() {
      if (window.__automaticBackupTimer) clearInterval(window.__automaticBackupTimer);
      checkAutomaticBackupSchedule();
      window.__automaticBackupTimer = setInterval(checkAutomaticBackupSchedule, 5 * 60 * 1000);
    }

    async function downloadHistoryFile(id) {
      try {
        const response = await exportApi(`?id=${encodeURIComponent(id)}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || payload?.message || `Erro HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        const filename = decodeURIComponent(match?.[1] || match?.[2] || 'exportacao.xlsx');
        await saveBlobToDevice(blob, filename);
      } catch (error) {
        toast('error', 'Falha no download', error.message || 'Não foi possível baixar o arquivo.');
      }
    }

    function parseCSV(text) {
      const cleaned = String(text || '').replace(/^\uFEFF/, '');
      const firstLine = cleaned.split(/\r?\n/, 1)[0] || '';
      const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
      const rows = [];
      let row = [];
      let cell = '';
      let quoted = false;
      for (let index = 0; index < cleaned.length; index += 1) {
        const character = cleaned[index];
        const next = cleaned[index + 1];
        if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; }
        else if (character === '"') quoted = !quoted;
        else if (character === delimiter && !quoted) { row.push(cell); cell = ''; }
        else if ((character === '\n' || character === '\r') && !quoted) {
          if (character === '\r' && next === '\n') index += 1;
          row.push(cell);
          if (row.some((value) => String(value).trim() !== '')) rows.push(row);
          row = []; cell = '';
        } else cell += character;
      }
      row.push(cell);
      if (row.some((value) => String(value).trim() !== '')) rows.push(row);
      return rows;
    }

    function importHeaderKey(value) {
      return normalize(value).replace(/[^a-z0-9]/g, '');
    }

    const IMPORT_ALIASES = Object.freeze({
      cnpj: ['cnpj'],
      razaoSocial: ['razaosocial','razao','nomerazao'],
      nomeFantasia: ['nomefantasia','fantasia'],
      marca: ['marca','marcadoconvenio','instituicao','ies'],
      responsavelAcompanhamento: ['responsavelpeloacompanhamento','responsavelacompanhamento','responsavel','operador'],
      prioridade: ['prioridade'],
      etiquetas: ['etiquetas','tags','marcadores'],
      dataAbertura: ['datadeabertura','dataabertura','abertura'],
      situacaoCadastral: ['situacaocadastral','statuscadastral'],
      naturezaJuridica: ['naturezajuridica'],
      tipoNatureza: ['publicoprivado','tiponatureza','classificacaojuridica','setorjuridico'],
      cnaePrincipal: ['cnaeprincipal','cnaeprincipalcodigoedescricao','cnaecodigoedescricao','cnae','atividadeprincipal'],
      cep: ['cep'],
      logradouro: ['logradouro','endereco','rua','avenida'],
      numero: ['numero','numerodoendereco'],
      complemento: ['complemento'],
      bairro: ['bairro'],
      estado: ['estado','uf'],
      cidade: ['cidade','municipio'],
      email: ['email','emailcontato','correioeletronico'],
      telefone: ['telefone','celular','fone'],
      polo: ['polo','poloopcional'],
      inicioVigencia: ['iniciodavigencia','iniciovigencia','datainiciovigencia'],
      fimVigencia: ['fimdavigencia','fimvigencia','datafimvigencia'],
      dataCadastro: ['datadocadastro','datacadastro'],
      situacao: ['situacao','situacaodocontato','status'],
      formasContato: ['formadecontato','formasdecontato'],
      observacoes: ['observacoes','observacao']
    });

    function importCellText(value) {
      if (value === null || value === undefined) return '';
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
        return adjusted.toISOString().slice(0, 10);
      }
      return String(value).trim();
    }

    function importDateToISO(value) {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
        return adjusted.toISOString().slice(0, 10);
      }
      if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
        const parsed = window.XLSX.SSF.parse_date_code(value);
        if (parsed) return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
      const text = importCellText(value);
      if (!text) return '';
      if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
      const brazilian = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
      if (brazilian) return `${brazilian[3]}-${brazilian[2].padStart(2, '0')}-${brazilian[1].padStart(2, '0')}`;
      return '';
    }

    function valueFromImportRow(row, headerIndexes, property) {
      const aliases = IMPORT_ALIASES[property] || [];
      const header = aliases.find((alias) => headerIndexes.has(alias));
      return header ? row[headerIndexes.get(header)] : '';
    }

    function mapImportedRows(rows) {
      if (!Array.isArray(rows) || rows.length < 2) return [];
      const headerIndexes = new Map();
      rows[0].forEach((header, index) => {
        const key = importHeaderKey(header);
        if (key && !headerIndexes.has(key)) headerIndexes.set(key, index);
      });
      if (!headerIndexes.has('cnpj') && !headerIndexes.has('razaosocial') && !headerIndexes.has('nomefantasia')) {
        throw new Error('A planilha não possui colunas reconhecidas. Use o modelo de importação.');
      }

      return rows.slice(1).filter((row) => row.some((value) => importCellText(value) !== '')).map((row, rowIndex) => {
        const raw = (property) => valueFromImportRow(row, headerIndexes, property);
        const company = normalizeCompany({
          cnpj: importCellText(raw('cnpj')),
          razaoSocial: importCellText(raw('razaoSocial')),
          nomeFantasia: importCellText(raw('nomeFantasia')),
          marca: normalizeBrand(importCellText(raw('marca'))),
          responsavelAcompanhamento: importCellText(raw('responsavelAcompanhamento')),
          prioridade: ['Baixa','Média','Alta','Urgente'].includes(importCellText(raw('prioridade'))) ? importCellText(raw('prioridade')) : 'Média',
          etiquetas: normalizeTags(importCellText(raw('etiquetas'))),
          dataAbertura: importDateToISO(raw('dataAbertura')),
          situacaoCadastral: importCellText(raw('situacaoCadastral')),
          naturezaJuridica: importCellText(raw('naturezaJuridica')),
          tipoNatureza: legalNatureType(importCellText(raw('tipoNatureza')), importCellText(raw('naturezaJuridica'))),
          cnaePrincipal: importCellText(raw('cnaePrincipal')),
          cep: importCellText(raw('cep')),
          logradouro: importCellText(raw('logradouro')),
          numero: importCellText(raw('numero')),
          complemento: importCellText(raw('complemento')),
          bairro: importCellText(raw('bairro')),
          estado: importCellText(raw('estado')),
          cidade: importCellText(raw('cidade')),
          email: importCellText(raw('email')),
          telefone: importCellText(raw('telefone')),
          polo: importCellText(raw('polo')),
          inicioVigencia: importDateToISO(raw('inicioVigencia')),
          fimVigencia: importDateToISO(raw('fimVigencia')),
          dataCadastro: importDateToISO(raw('dataCadastro')) || todayISO(),
          situacao: importCellText(raw('situacao')) || 'Não contatado',
          formasContato: importCellText(raw('formasContato')).split(/[,|;]/).map((item) => item.trim()).filter(Boolean),
          observacoes: importCellText(raw('observacoes')),
          contatos: [],
          demo: false
        });
        if (!company.nomeFantasia && company.razaoSocial) company.nomeFantasia = company.razaoSocial;
        return {
          rowNumber: rowIndex + 2,
          company,
          sourceCompany: normalizeCompany(company),
          original: row,
          issues: [],
          warnings: [],
          duplicate: null,
          enrichmentAttempted: false,
          enrichmentEnabled: null,
          lookupError: '',
          processing: false,
          defaultedPolo: false
        };
      });
    }

    function importEnrichmentEnabled() {
      const toggle = $('#importEnrichCnpj');
      return toggle ? Boolean(toggle.checked) : true;
    }

    function applyImportDefaults(company) {
      const result = normalizeCompany(company);
      if (!result.nomeFantasia && result.razaoSocial) result.nomeFantasia = result.razaoSocial;
      return normalizeCompany(result);
    }

    function assessImportEntry(entry) {
      const company = entry.company;
      const issues = [];
      const warnings = [];
      const enrich = importEnrichmentEnabled();
      const validCnpj = !company.cnpj || cnpjValidLength(company.cnpj);
      const existing = findDuplicateCompany(company);
      const registrationKey = companyRegistrationKey(company);
      const repeatedInFile = registrationKey
        ? state.importRows.find((other) =>
            other !== entry
            && other.rowNumber < entry.rowNumber
            && companyRegistrationKey(other.company) === registrationKey
          ) || null
        : null;
      entry.duplicate = existing || repeatedInFile?.company || null;

      if (company.cnpj && !validCnpj) issues.push('CNPJ deve ter 14 caracteres');
      if (!company.cnpj && !company.razaoSocial) issues.push('Informe CNPJ ou Razão Social');
      if (company.estado && company.estado.length !== 2) issues.push('UF inválida');
      if (company.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)) issues.push('E-mail inválido');
      if (company.inicioVigencia && company.fimVigencia && company.fimVigencia < company.inicioVigencia) {
        issues.push('Fim da vigência anterior ao início');
      }
      if (company.situacao && !situacoesContato.includes(company.situacao)) warnings.push('Situação não padronizada');

      const pendingLookup = Boolean(
        enrich
        && company.cnpj
        && validCnpj
        && window.cnpjService
        && !entry.enrichmentAttempted
      );

      [
        ['razaoSocial', 'Razão Social ausente'],
        ['nomeFantasia', 'Nome Fantasia ausente'],
        ['cidade', 'Cidade ausente'],
        ['estado', 'Estado ausente']
      ].forEach(([field, message]) => {
        if (String(company[field] || '').trim()) return;
        (pendingLookup ? warnings : issues).push(
          pendingLookup ? `${message} — será consultada pelo CNPJ` : message
        );
      });

      if (!company.marca) {
        warnings.push('Marca não informada — selecione Uniasselvi ou Unicesumar após a importação');
      }
      if (!company.cnaePrincipal) {
        warnings.push(
          pendingLookup
            ? 'CNAE será consultado pelo CNPJ'
            : 'CNAE não informado ou não localizado nas fontes públicas'
        );
      }
      if (entry.lookupError) warnings.push(`Consulta CNPJ: ${entry.lookupError}`);
      if (existing) {
        warnings.push(`CNPJ já cadastrado para a marca ${normalizeBrand(company.marca)}`);
      } else if (repeatedInFile) {
        warnings.push(`CNPJ e marca repetidos na linha ${repeatedInFile.rowNumber}`);
      }

      entry.issues = [...new Set(issues)];
      entry.warnings = [...new Set(warnings)];
      return entry;
    }

    function renderImportPreview() {
      state.importRows.forEach((entry) => assessImportEntry(entry));
      const valid = state.importRows.filter((entry) => !entry.issues.length && !entry.warnings.length).length;
      const warnings = state.importRows.filter((entry) => !entry.issues.length && entry.warnings.length).length;
      const errors = state.importRows.filter((entry) => entry.issues.length).length;
      const duplicates = state.importRows.filter((entry) => entry.duplicate).length;
      const total = state.importRows.length;
      const summary = $('#importSummary');
      if (summary) summary.innerHTML = [
        ['Total', total, ''], ['Prontas', valid, 'is-valid'], ['Com avisos', warnings, 'is-warning'], ['Com erros', errors, 'is-error'], ['Duplicadas', duplicates, 'is-warning']
      ].map(([label, value, className]) => `<div class="import-summary-card ${className}"><strong>${value}</strong><span>${label}</span></div>`).join('');
      const preview = $('#importPreview');
      if (preview) preview.innerHTML = total ? `<table><thead><tr><th>Linha</th><th>Status</th><th>CNPJ</th><th>Razão Social</th><th>Nome Fantasia</th><th>Marca</th><th>UF</th><th>Cidade</th><th>Polo</th><th>Vigência final</th><th>Observações da validação</th></tr></thead><tbody>${state.importRows.slice(0, 100).map((entry) => {
        const status = entry.processing
          ? ['warning', 'Consultando']
          : entry.issues.length
            ? ['error', 'Erro']
            : entry.warnings.length
              ? ['warning', 'Revisar']
              : ['valid', 'Pronta'];
        const notes = entry.processing
          ? 'Consultando dados públicos do CNPJ…'
          : [...entry.issues, ...entry.warnings].join(' • ') || 'Linha validada';
        const company = entry.company;
        return `<tr><td>${entry.rowNumber}</td><td><span class="import-row-status ${status[0]}">${status[1]}</span></td><td>${escapeHTML(company.cnpj || '—')}</td><td>${escapeHTML(company.razaoSocial || '—')}</td><td>${escapeHTML(company.nomeFantasia || '—')}</td><td>${escapeHTML(company.marca || '—')}</td><td>${escapeHTML(company.estado || '—')}</td><td>${escapeHTML(company.cidade || '—')}</td><td>${escapeHTML(company.polo || '—')}</td><td>${formatDate(company.fimVigencia)}</td><td>${escapeHTML(notes)}</td></tr>`;
      }).join('')}</tbody></table>${total > 100 ? `<div class="summary-box">A prévia mostra as primeiras 100 linhas de ${total}.</div>` : ''}` : '<div class="empty-state"><i class="fa-solid fa-table"></i><strong>Nenhuma linha identificada</strong><span>Confira a planilha ou use o modelo recomendado.</span></div>';
      const confirm = $('#confirmImport');
      if (confirm) {
        const hasImportableRows = state.importRows.some((entry) => !entry.issues.length);
        confirm.disabled = !hasImportableRows || state.importRunning || state.importPreparing;
      }
    }

    async function readSpreadsheetRows(file) {
      const extension = String(file.name || '').split('.').pop().toLowerCase();
      if (extension === 'csv' && !window.XLSX) return parseCSV(await file.text());
      if (!window.XLSX) throw new Error('O leitor de Excel não foi carregado. Recarregue a página ou use CSV.');
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: 'array', cellDates: true });
      if (!workbook.SheetNames.length) throw new Error('A planilha não possui abas.');
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    }

    function waitImportLookup(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    function shouldRetryCnpjLookup(error) {
      const status = Number(error?.status || 0);
      const message = String(error?.message || '').toLowerCase();
      return [408, 425, 429, 500, 502, 503, 504].includes(status)
        || message.includes('temporariamente')
        || message.includes('timeout')
        || message.includes('network')
        || message.includes('fetch')
        || message.includes('limite');
    }

    async function lookupCnpjForImport(cnpj, attempts = 3) {
      let lastError = null;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          return await window.cnpjService.lookup(cnpj);
        } catch (error) {
          lastError = error;
          if (attempt >= attempts || !shouldRetryCnpjLookup(error)) break;
          await waitImportLookup(900 * attempt);
        }
      }
      throw lastError || new Error('Não foi possível consultar o CNPJ.');
    }

    async function enrichImportEntry(entry, { retry = false } = {}) {
      const enrich = importEnrichmentEnabled();
      let company = normalizeCompany(entry.company);
      entry.lookupError = '';

      const validCnpj = Boolean(company.cnpj && cnpjValidLength(company.cnpj));
      const missingPublicData = CNPJ_FILL_FIELDS.some(
        (field) => !String(company[field] || '').trim()
      );

      if (
        enrich
        && validCnpj
        && missingPublicData
        && window.cnpjService
        && (!entry.enrichmentAttempted || retry || entry.enrichmentEnabled !== enrich)
      ) {
        try {
          const lookup = await lookupCnpjForImport(company.cnpj);
          company = mergeCnpjData(company, lookup.data || {});
        } catch (error) {
          entry.lookupError = error?.message || 'Consulta indisponível';
        }
      }

      entry.enrichmentAttempted = true;
      entry.enrichmentEnabled = enrich;
      entry.company = applyImportDefaults(company, entry);
      assessImportEntry(entry);
      return entry;
    }

    async function prepareImportRows({ reset = false } = {}) {
      if (!state.importRows.length) {
        renderImportPreview();
        return;
      }

      const token = ++state.importPreparationToken;
      const enrich = importEnrichmentEnabled();
      state.importPreparing = true;

      if (reset) {
        state.importRows.forEach((entry) => {
          entry.company = normalizeCompany(entry.sourceCompany || entry.company);
          entry.enrichmentAttempted = false;
          entry.enrichmentEnabled = null;
          entry.lookupError = '';
          entry.processing = false;
          entry.defaultedPolo = false;
        });
      }

      updateImportProgress(
        0,
        state.importRows.length,
        enrich
          ? `Consultando ${state.importRows.length} CNPJ(s)…`
          : 'Complementação automática desativada. Validando a planilha…'
      );

      try {
        for (let index = 0; index < state.importRows.length; index += 1) {
          if (token !== state.importPreparationToken) return;
          const entry = state.importRows[index];
          entry.processing = true;
          renderImportPreview();

          updateImportProgress(
            index,
            state.importRows.length,
            enrich
              ? `Consultando CNPJ da linha ${entry.rowNumber} — ${index + 1} de ${state.importRows.length}…`
              : `Validando linha ${entry.rowNumber} — ${index + 1} de ${state.importRows.length}…`
          );

          await enrichImportEntry(entry);
          entry.processing = false;
          renderImportPreview();

          updateImportProgress(
            index + 1,
            state.importRows.length,
            `${index + 1} de ${state.importRows.length} linha(s) preparada(s).`
          );

          if (enrich && index < state.importRows.length - 1) await waitImportLookup(650);
        }
      } finally {
        if (token === state.importPreparationToken) {
          state.importPreparing = false;
          renderImportPreview();
        }
      }
    }

    async function handleSpreadsheetFile(file) {
      if (!ensureAdmin('importar planilhas') || state.importPreparing || state.importRunning) return;
      const fileName = $('#importFileName');
      if (fileName) fileName.textContent = file.name;
      state.importFileName = file.name;
      state.importRows = [];
      state.importErrors = [];
      state.importPreparationToken += 1;
      $('#downloadImportErrors')?.classList.add('hidden');
      if ($('#confirmImport')) $('#confirmImport').disabled = true;
      if ($('#importSummary')) $('#importSummary').innerHTML = '<div class="summary-box"><i class="fa-solid fa-spinner fa-spin"></i> Lendo a planilha…</div>';
      try {
        const rows = await readSpreadsheetRows(file);
        state.importRows = mapImportedRows(rows);
        if (!state.importRows.length) throw new Error('Nenhuma linha de dados foi identificada.');
        renderImportPreview();
        await prepareImportRows({ reset: true });
        const ready = state.importRows.filter((entry) => !entry.issues.length).length;
        const errors = state.importRows.length - ready;
        toast(
          errors ? 'warning' : 'success',
          'Planilha preparada',
          `${ready} linha(s) pronta(s) e ${errors} linha(s) que precisam de revisão.`
        );
      } catch (error) {
        console.error('[Importação] Falha na preparação:', error);
        state.importRows = [];
        state.importPreparing = false;
        renderImportPreview();
        toast('error', 'Planilha inválida', error.message || 'Não foi possível interpretar o arquivo.');
      }
    }

    async function reprocessImportRowsForEnrichment() {
      if (state.importRunning) return;
      if (!state.importRows.length) {
        renderImportPreview();
        return;
      }
      try {
        await prepareImportRows({ reset: true });
        toast(
          'info',
          importEnrichmentEnabled() ? 'Complementação ativada' : 'Complementação desativada',
          importEnrichmentEnabled()
            ? 'Os campos vazios foram consultados novamente pelo CNPJ.'
            : 'A prévia foi restaurada com os dados originais da planilha.'
        );
      } catch (error) {
        toast('error', 'Falha ao preparar a planilha', error.message || 'Não foi possível reprocessar as linhas.');
      }
    }

    const IMPORT_TEMPLATE_HEADERS = [
      'CNPJ','Razão Social','Nome Fantasia','Marca','Responsável pelo acompanhamento','Prioridade','Etiquetas',
      'Data de Abertura','Situação Cadastral','Natureza Jurídica','Público/Privado','CNAE Principal (código e descrição)','CEP','Logradouro',
      'Número','Complemento','Bairro','Estado','Cidade','E-mail','Telefone',
      'Polo (opcional)','Início da Vigência','Fim da Vigência','Data do Cadastro',
      'Situação','Forma de Contato','Observações'
    ];

    function createImportTemplateBlob() {
      const instructions = [
        ['Campo','Orientação','Obrigatório?'],
        ['CNPJ','Pode ser a única informação preenchida quando a complementação por CNPJ estiver ativada.','Sim para consulta automática'],
        ['Marca','Selecione Uniasselvi ou Unicesumar. A marca será usada automaticamente nos recados do Outlook.','Sim para os recados'],
        ['Responsável','Nome do usuário responsável pelo acompanhamento. Pode ficar vazio para entrar na fila Sem responsável.','Não'],
        ['Prioridade','Use Baixa, Média, Alta ou Urgente.','Não'],
        ['Etiquetas','Separe etiquetas por vírgula, por exemplo: Procon, Grande parceiro.','Não'],
        ['CNAE','O sistema grava o código junto da descrição quando a fonte pública disponibilizar.','Não'],
        ['Polo','Campo opcional. Pode permanecer vazio.','Não'],
        ['Datas','Use DD/MM/AAAA ou uma data válida do Excel.','Não'],
        ['Forma de Contato','Para mais de uma forma, separe por vírgula ou ponto e vírgula.','Não']
      ];
      return workbookBlob([
        {
          name: 'Importação',
          rows: [IMPORT_TEMPLATE_HEADERS],
          widths: [20,32,28,18,28,14,34,16,22,28,16,38,12,28,10,20,20,10,22,30,18,20,18,18,18,24,24,40]
        },
        {
          name: 'Instruções',
          rows: instructions,
          widths: [24,72,24]
        }
      ]);
    }

    async function downloadImportTemplate() {
      const filename = 'modelo_importacao_convenios.xlsx';
      let blob = null;
      try {
        try {
          blob = createImportTemplateBlob();
        } catch (generatorError) {
          console.warn('[Modelo] Geração local indisponível; tentando arquivo publicado.', generatorError);
          const response = await fetch('/modelo/modelo_importacao_convenios.xlsx', { cache: 'no-store' });
          if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
          blob = await response.blob();
        }
        const downloaded = await saveBlobToDevice(blob, filename, { usePicker: true });
        if (!downloaded) return;
        toast('success', 'Modelo baixado', 'A planilha foi salva no computador.');
        saveExportHistory(blob, filename, 'modelo-importacao', 0).catch((error) => {
          console.warn('[Modelo] O download foi concluído, mas o histórico não foi atualizado.', error);
        });
      } catch (error) {
        console.error('[Modelo]', error);
        toast('error', 'Falha ao baixar o modelo', error.message || 'Não foi possível gerar a planilha.');
      }
    }

    function mergeCnpjData(company, data) {
      const result = { ...company };
      CNPJ_FILL_FIELDS.forEach((field) => {
        if (!String(result[field] || '').trim() && String(data?.[field] || '').trim()) result[field] = data[field];
      });
      if (!result.nomeFantasia && result.razaoSocial) result.nomeFantasia = result.razaoSocial;
      const sources = Array.isArray(data?.fontes) ? data.fontes : (data?.fonte ? [data.fonte] : []);
      if (sources.length) result.fonteCnpj = sources.join(', ');
      if (data?.consultadoEm) result.consultadoEm = data.consultadoEm;
      return normalizeCompany(result);
    }

    function mergeDuplicate(existing, incoming, strategy) {
      const protectedFields = new Set(['id','contatos','createdAt','updatedAt','demo']);
      const result = { ...existing, contatos: existing.contatos || [], demo: existing.demo || false };
      Object.entries(incoming).forEach(([field, value]) => {
        if (protectedFields.has(field) || value === null || value === undefined || value === '') return;
        if (Array.isArray(value) && !value.length) return;
        if (strategy === 'update' || (strategy === 'update-empty' && (result[field] === null || result[field] === undefined || result[field] === '' || (Array.isArray(result[field]) && !result[field].length)))) {
          result[field] = value;
        }
      });
      result.id = existing.id;
      result.contatos = existing.contatos || [];
      return normalizeCompany(result);
    }

    function updateImportProgress(current, total, message) {
      const holder = $('#importProgress');
      holder?.classList.remove('hidden');
      const percent = total ? Math.round((current / total) * 100) : 0;
      if ($('#importProgressBar')) $('#importProgressBar').style.width = `${percent}%`;
      if ($('#importProgressText')) $('#importProgressText').textContent = message || `${current} de ${total}`;
    }

    async function confirmImport() {
      if (!ensureAdmin('importar planilhas') || state.importRunning || state.importPreparing || !state.importRows.length) return;
      const strategy = $('#duplicateStrategy').value;
      const enrich = importEnrichmentEnabled();
      const button = $('#confirmImport');
      state.importRunning = true;
      state.importErrors = [];
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let rejected = 0;
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Importando…';
      }
      try {
        const modeChanged = state.importRows.some((entry) => entry.enrichmentEnabled !== enrich);
        if (modeChanged) await prepareImportRows({ reset: true });

        for (let index = 0; index < state.importRows.length; index += 1) {
          const entry = state.importRows[index];
          let company = normalizeCompany(entry.company);
          updateImportProgress(
            index,
            state.importRows.length,
            `Importando linha ${entry.rowNumber} — ${index + 1} de ${state.importRows.length}…`
          );
          try {
            if (enrich && entry.lookupError && company.cnpj && cnpjValidLength(company.cnpj)) {
              await enrichImportEntry(entry, { retry: true });
              company = normalizeCompany(entry.company);
            } else {
              company = applyImportDefaults(company, entry);
              entry.company = company;
              assessImportEntry(entry);
            }

            renderImportPreview();
            if (entry.issues.length) throw new Error(entry.issues.join('; '));

            const existing = findDuplicateCompany(company);
            if (existing && strategy === 'ignore') {
              skipped += 1;
              continue;
            }
            if (existing) {
              const merged = mergeDuplicate(existing, company, strategy);
              const saved = normalizeCompany(await window.remoteData.updateCompany(merged));
              saved.contatos = existing.contatos || [];
              const companyIndex = state.data.concedentes.findIndex((item) => item.id === existing.id);
              state.data.concedentes[companyIndex] = saved;
              updated += 1;
            } else {
              const saved = normalizeCompany(await window.remoteData.createCompany({ ...company, demo: false }));
              state.data.concedentes.unshift(saved);
              imported += 1;
            }
          } catch (error) {
            rejected += 1;
            state.importErrors.push({
              linha: entry.rowNumber,
              cnpj: company.cnpj || '',
              nome: company.nomeFantasia || company.razaoSocial || '',
              erro: error.message || 'Falha desconhecida'
            });
          }
          updateImportProgress(
            index + 1,
            state.importRows.length,
            `${index + 1} de ${state.importRows.length} linha(s) processada(s).`
          );
        }
        renderAll();
        applyAccessRules();
        $('#downloadImportErrors')?.classList.toggle('hidden', !state.importErrors.length);
        toast(
          state.importErrors.length ? 'warning' : 'success',
          'Importação concluída',
          `${imported} novo(s), ${updated} atualizado(s), ${skipped} ignorado(s) e ${rejected} rejeitado(s).`
        );
        if (!state.importErrors.length) closeModal('importModalBackdrop');
        state.importRows = [];
      } catch (error) {
        console.error('[Importação] Falha geral:', error);
        toast('error', 'Falha na importação', error.message || 'A importação foi interrompida.');
        await loadRemoteData({ silent: true });
      } finally {
        state.importRunning = false;
        if (button) {
          button.disabled = !state.importRows.some((entry) => !entry.issues.length);
          button.innerHTML = '<i class="fa-solid fa-file-import"></i>Confirmar importação';
        }
      }
    }

    function setClearAllPasswordError(message = '') {
      const holder = $('#clearAllPasswordError');
      if (!holder) return;
      holder.textContent = message;
      holder.classList.toggle('hidden', !message);
    }

    function openClearAllPasswordModal() {
      if (!ensureAdmin('limpar os dados operacionais')) return;
      const form = $('#clearAllPasswordForm');
      form?.reset();
      setClearAllPasswordError('');
      const button = $('#clearAllConfirmBtn');
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-trash"></i>Excluir dados';
      }
      openModal('clearAllPasswordModalBackdrop');
      setTimeout(() => $('#clearAllPassword')?.focus(), 80);
    }

    async function clearAllOperationalData(password) {
      const client = window.database?.client;
      if (!client) throw new Error('Cliente do Supabase indisponível.');

      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      const accessToken = data?.session?.access_token || '';
      if (!accessToken) {
        const sessionError = new Error('Sua sessão não está ativa. Entre novamente no sistema.');
        sessionError.code = 'SESSION_REQUIRED';
        throw sessionError;
      }

      const response = await fetch('/api/admin-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Cache-Control': 'no-store'
        },
        body: JSON.stringify({
          action: 'clear_all',
          password
        }),
        cache: 'no-store'
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        const error = new Error(payload?.message || `Não foi possível excluir os dados (${response.status}).`);
        error.code = payload?.code || null;
        error.status = response.status;
        throw error;
      }

      return payload.data || {};
    }

    async function submitClearAllPassword(event) {
      event.preventDefault();
      if (!ensureAdmin('limpar os dados operacionais')) return;

      const password = $('#clearAllPassword')?.value || '';
      const acknowledged = Boolean($('#clearAllAcknowledge')?.checked);
      const button = $('#clearAllConfirmBtn');

      setClearAllPasswordError('');

      if (!password) {
        setClearAllPasswordError('Informe a senha atual da sua conta administrativa.');
        $('#clearAllPassword')?.focus();
        return;
      }

      if (!acknowledged) {
        setClearAllPasswordError('Confirme que está ciente de que a exclusão é permanente.');
        $('#clearAllAcknowledge')?.focus();
        return;
      }

      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Validando e excluindo…';
      }

      try {
        const result = await clearAllOperationalData(password);
        state.data.concedentes = [];
        state.selectedContactCompanyId = null;
        closeModal('clearAllPasswordModalBackdrop');
        renderAll();
        applyAccessRules();
        toast(
          'success',
          'Dados operacionais removidos',
          `${Number(result.concedentes_excluidas || 0)} concedente(s) e ${Number(result.contatos_excluidos || 0)} contato(s) foram excluídos.`
        );
      } catch (error) {
        const message = error?.code === 'INVALID_PASSWORD'
          ? 'Senha incorreta. Digite a senha atual da conta administrativa.'
          : error?.code === 'MFA_REQUIRED'
            ? 'Confirme o código do aplicativo autenticador e tente novamente.'
            : error?.message || 'Não foi possível excluir os dados.';
        setClearAllPasswordError(message);
        toast('error', 'Exclusão não realizada', message);
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fa-solid fa-trash"></i>Excluir dados';
        }
      }
    }

    function buildBackupPayload() {
      return {
        ...state.data,
        version: 2,
        source: 'supabase',
        exportedAt: new Date().toISOString(),
        totalConcedentes: state.data.concedentes.length,
        totalContatos: state.data.concedentes.reduce((total, company) => total + (company.contatos?.length || 0), 0)
      };
    }

    async function backupJSON() {
      if (!ensureAdmin('criar backups')) return;
      try {
        const payload = buildBackupPayload();
        const content = JSON.stringify(payload, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        const filename = `backup_convenios_${new Date().toLocaleDateString('pt-BR').replaceAll('/', '-')}.json`;
        const downloaded = await saveBlobToDevice(blob, filename, { usePicker: true });
        if (!downloaded) return;
        toast('success', 'Backup JSON criado', 'O arquivo foi salvo no computador.');
        saveExportHistory(blob, filename, 'backup-json', payload.totalConcedentes).catch((error) => {
          console.warn('[Backup] O arquivo foi baixado, mas o histórico não foi atualizado.', error);
        });
      } catch (error) {
        console.error('[Backup]', error);
        toast('error', 'Falha ao criar backup', error.message || 'Não foi possível gerar o arquivo JSON.');
      }
    }
    function restoreJSON(file){if(!ensureAdmin('restaurar backups'))return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));if(!parsed||!Array.isArray(parsed.concedentes))throw new Error('Estrutura inválida');confirmAction('Restaurar backup','Todos os dados do banco serão substituídos pelo conteúdo do arquivo. Deseja continuar?',async()=>{try{const result=await window.remoteData.replaceAll(parsed.concedentes.map(normalizeCompany));await loadRemoteData({silent:true});toast('success','Backup restaurado',`${result.inserted} concedente(s) e ${result.contactsInserted} contato(s) restaurado(s).`);}catch(error){toast('error','Falha na restauração',error.message||'Não foi possível restaurar o backup.');}});}catch(e){toast('error','Backup inválido','O arquivo JSON não possui uma estrutura compatível.');}};reader.readAsText(file);}

    function getLocalMigrationData() {
      try {
        const raw=localStorage.getItem(LOCAL_DATA_KEY);
        if(!raw)return [];
        const parsed=JSON.parse(raw);
        return Array.isArray(parsed?.concedentes)?parsed.concedentes.map(normalizeCompany):[];
      }catch(error){console.warn('Não foi possível ler os dados antigos do navegador:',error);return [];}
    }

    function updateMigrationSummary() {
      const summary=$('#localMigrationSummary');
      const button=$('#migrateLocalBtn');
      if(!summary||!button)return;
      const local=getLocalMigrationData();
      const contacts=local.reduce((total,company)=>total+(company.contatos?.length||0),0);
      summary.textContent=local.length?`${local.length} concedente(s) e ${contacts} contato(s) encontrados neste navegador.`:'Nenhum cadastro antigo foi encontrado neste navegador.';
      button.disabled=!local.length;
    }

    async function migrateLocalData() {
      if(!ensureAdmin('migrar dados locais'))return;
      const local=getLocalMigrationData();
      if(!local.length){toast('info','Nada para migrar','Nenhum cadastro antigo foi encontrado neste navegador.');return;}
      const button=$('#migrateLocalBtn');
      if(button){button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i>Migrando...';}
      try{
        const result=await window.remoteData.migrateLocal(local);
        localStorage.setItem(`${LOCAL_DATA_KEY}_migrated_at`,new Date().toISOString());
        await loadRemoteData({silent:true});
        const detail=`${result.inserted} novo(s), ${result.updated} atualizado(s), ${result.contactsInserted} contato(s) e ${result.rejected} rejeitado(s).`;
        toast(result.rejected?'warning':'success','Migração concluída',detail);
        if(result.errors?.length)console.warn('[Migração] Registros com erro:',result.errors);
      }catch(error){console.error(error);toast('error','Falha na migração',error.message||'Não foi possível migrar os dados locais.');}
      finally{if(button){button.innerHTML='<i class="fa-solid fa-cloud-arrow-up"></i>Migrar para o banco';}updateMigrationSummary();}
    }

    function bindEvents() {
      $$('.nav-item').forEach(item=>item.addEventListener('click',()=>switchPanel(item.dataset.panel)));
      $('#sidebarToggle').onclick=()=>{if(window.innerWidth<=900)$('#sidebar').classList.toggle('mobile-open');else $('#sidebar').classList.toggle('collapsed');};
      $('#themeToggle').onclick=toggleTheme; $('#settingsTheme').onclick=toggleTheme;
      $('#notificationToggle').onclick=()=>$('#notificationPopover').classList.toggle('hidden'); $('#closeNotifications').onclick=()=>$('#notificationPopover').classList.add('hidden');
      document.addEventListener('click',e=>{if(!$('#notificationPopover').contains(e.target)&&!$('#notificationToggle').contains(e.target))$('#notificationPopover').classList.add('hidden');});
      $$('[data-action="new-company"]').forEach(b=>b.onclick=()=>openCompanyForm()); $$('[data-action="export"]').forEach(b=>b.onclick=()=>{if(!ensureAdmin('exportar cadastros'))return;openModal('exportModalBackdrop');});
      $$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close)); $$('.modal-backdrop').forEach(bg=>bg.addEventListener('mousedown',e=>{if(e.target===bg)closeModal(bg.id);}));
      $('#companyForm').addEventListener('submit',e=>{e.preventDefault();const data=getCompanyFormData();if(!validateCompanyForm(data))return;if(!data.cnpj){if(!confirm('O CNPJ está vazio. Deseja salvar este cadastro mesmo assim?'))return;}saveCompany(data);});
      $('#cnpj').addEventListener('input', scheduleCnpjLookup);
      $$('.api-fill-field').forEach((field) => field.addEventListener('input', () => {
        if (state.cnpjApplying) return;
        state.cnpjTouched.add(field.id);
        field.classList.remove('api-autofilled');
        field.classList.add('api-manual-edited');
      }));
      $('#cep').addEventListener('input',e=>e.target.value=maskCEP(e.target.value));
      $('#cep').addEventListener('blur',lookupCEP);
      $('#telefone').addEventListener('input',e=>e.target.value=maskPhone(e.target.value));
      $('#estado').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2));
      $$('.vigencia-date').forEach(e=>e.addEventListener('change',updateVigenciaForm));
      $('#confirmActionBtn').onclick=()=>{const cb=state.confirmCallback;state.confirmCallback=null;closeModal('confirmModalBackdrop');if(typeof cb==='function')cb();};
      $('#tableSearch').addEventListener('input',()=>{state.page=1;renderCompanies();}); $('#globalSearch').addEventListener('input',e=>{$('#tableSearch').value=e.target.value;state.page=1;switchPanel('concedentes');});
      $$('.filter').forEach(el=>el.addEventListener('change',()=>{state.page=1;renderCompanies();})); $('#clearFilters').onclick=()=>{$$('.filter').forEach(el=>el.value='');$('#tableSearch').value='';state.page=1;renderCompanies();}; $('#toggleFilters').onclick=()=>$('#filtersCard').classList.toggle('hidden');
      $('#pageSize').onchange=e=>{state.pageSize=Number(e.target.value);state.page=1;renderCompanies();};
      $$('th[data-sort]').forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(state.sort.key===k)state.sort.dir=state.sort.dir==='asc'?'desc':'asc';else state.sort={key:k,dir:'asc'};renderCompanies();});
      $('#contactForm').addEventListener('submit',e=>{e.preventDefault();saveContact();}); $('#newContactGlobal').onclick=()=>openContactForm(); $('#addContactSelected').onclick=()=>openContactForm(state.selectedContactCompanyId); $('#contactCompanySearch').addEventListener('input',renderContactsPanel);
      $('#prepareOutlookSelected')?.addEventListener('click',()=>openOutlookMessage($('#prepareOutlookSelected').dataset.companyId||state.selectedContactCompanyId));
      $('#outlookMessageForm')?.addEventListener('submit',submitOutlookMessage);
      $('#outlookMessageRecipient')?.addEventListener('input',refreshOutlookMessagePreview);
      document.querySelectorAll('input[name="marcaConvenio"]').forEach((input)=>input.addEventListener('change',()=>{
        $('#marcaConvenioGroup')?.classList.remove('invalid');
      }));
      document.addEventListener('click',(event)=>{
        const button=event.target.closest?.('[data-edit-contact]');
        if(!button)return;
        event.preventDefault();
        event.stopPropagation();
        closeModal('viewModalBackdrop');
        openContactForm(button.dataset.companyId,button.dataset.editContact);
      });
      $$('.export-option').forEach(b=>b.onclick=()=>b.dataset.export==='contacts'?exportContacts():exportCompanies(b.dataset.export));
      $('#importBtn').onclick=()=>{
        if(!ensureAdmin('importar planilhas'))return;
        state.importRows=[];state.importErrors=[];state.importFileName='';state.importPreparing=false;state.importPreparationToken+=1;
        $('#importFileName').textContent='Nenhum arquivo selecionado.';
        $('#importSummary').innerHTML='<div class="summary-box">Selecione uma planilha para iniciar a validação.</div>';
        $('#importPreview').innerHTML='<div class="empty-state"><i class="fa-solid fa-table"></i><strong>Nenhuma prévia disponível</strong><span>Use o modelo recomendado ou selecione sua planilha atual.</span></div>';
        $('#importProgress').classList.add('hidden');$('#importProgressBar').style.width='0%';
        $('#downloadImportErrors').classList.add('hidden');$('#confirmImport').disabled=true;
        openModal('importModalBackdrop');
      };
      $('#selectImportFile').onclick=()=>$('#csvFileInput').click();
      $('#csvFileInput').onchange=e=>{if(e.target.files[0])handleSpreadsheetFile(e.target.files[0]);e.target.value='';};
      $('#downloadImportTemplate').onclick=downloadImportTemplate;
      $('#duplicateStrategy').onchange=renderImportPreview;
      $('#importEnrichCnpj')?.addEventListener('change', reprocessImportRowsForEnrichment);
      $('#downloadImportErrors').onclick=downloadImportErrors;
      $('#confirmImport').onclick=confirmImport;
      $('#exportReports').onclick=exportReportCSV; $('#printReports').onclick=()=>window.print();
      $('#backupBtn').onclick=backupJSON; $('#restoreBtn').onclick=()=>$('#jsonFileInput').click(); $('#jsonFileInput').onchange=e=>{if(e.target.files[0])restoreJSON(e.target.files[0]);e.target.value='';};
      $('#clearAllBtn').onclick=openClearAllPasswordModal;
      $('#clearAllPasswordForm')?.addEventListener('submit', submitClearAllPassword);
      $('#clearAllPasswordToggle')?.addEventListener('click', () => {
        const input = $('#clearAllPassword');
        if (!input) return;
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        $('#clearAllPasswordToggle').innerHTML = `<i class="fa-regular ${visible ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
        $('#clearAllPasswordToggle').setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
      });
      $('#migrateLocalBtn').onclick=migrateLocalData;
      $('#exportHistoryRefresh')?.addEventListener('click', () => loadExportHistory({ force: true }));
      $('#runAutomaticBackupNow')?.addEventListener('click', () => runAutomaticBackup({ force: true }));
      document.addEventListener('click', (event) => {
        const button = event.target.closest?.('[data-download-export]');
        if (!button) return;
        downloadHistoryFile(button.dataset.downloadExport);
      });
      window.addEventListener('resize',()=>{if(window.innerWidth>900)$('#sidebar').classList.remove('mobile-open');});
    }


    /* =====================================================================
       CLOUDCONVENIOS V8.6.0 — FLUXO OPERACIONAL COMPLETO
       ===================================================================== */

    const closedWorkflowStatuses = new Set(['Renovado','Não possui interesse','Contato não localizado','Convênio encerrado']);
    const priorityOrder = Object.freeze({ Urgente: 0, Alta: 1, Média: 2, Baixa: 3 });

    function fallbackEmailTemplates() {
      const definitions = [
        {
          situacao: 'Não contatado',
          titulo: 'Renovação de convênio | {{MARCA}} e {{LOCAL}}',
          corpo: [
            'Prezados, {{SAUDACAO}}, tudo bem?',
            'Verificamos que o convênio firmado entre a {{MARCA}} e {{LOCAL}} encontra-se próximo do término de sua vigência.',
            'Gostaríamos de verificar o interesse na renovação do convênio, por meio de um termo aditivo.',
            'Caso haja interesse na renovação do convênio, formalizaremos o aditivo para apreciação.',
            'Permanecemos à disposição para quaisquer esclarecimentos e aguardamos o retorno.',
            'Atenciosamente,'
          ].join('\n\n'),
          situacaoAposEnvio: 'Aguardando retorno',
          proximaAcao: 'Aguardar retorno sobre o interesse na renovação',
          diasProximoContato: 7
        },
        {
          situacao: 'Aguardando retorno',
          titulo: 'Solicitação de análise da renovação de convênio | {{MARCA}}',
          corpo: [
            'Prezados, {{SAUDACAO}}.',
            'Anteriormente, entramos em contato para verificar o interesse na renovação do convênio vigente com a {{MARCA}}, pelo período de mais 60 meses.',
            'A continuidade da parceria reforça a cooperação entre as instituições e contribui diretamente para a formação dos acadêmicos, ao possibilitar a aplicação prática dos conhecimentos adquiridos durante sua trajetória acadêmica.',
            'Para a concedente, o convênio representa uma oportunidade de aproximação com o ambiente educacional, participação no desenvolvimento de novos profissionais e contato com talentos que poderão contribuir futuramente com o mercado de trabalho.',
            'Diante disso, solicitamos a gentileza de confirmar o interesse na renovação, para iniciarmos os procedimentos necessários e assegurar a continuidade da parceria.',
            'Permanecemos à disposição para quaisquer esclarecimentos.',
            'Atenciosamente,'
          ].join('\n\n'),
          situacaoAposEnvio: 'Aguardando retorno',
          proximaAcao: 'Realizar novo acompanhamento da renovação',
          diasProximoContato: 7
        },
        {
          situacao: 'Documentação solicitada',
          titulo: 'Solicitação de análise documental da renovação de convênio | {{MARCA}}',
          corpo: [
            'Prezados, {{SAUDACAO}}, tudo bem?',
            'Anteriormente, encaminhamos o aditivo para renovação do convênio vigente com a {{MARCA}}, pelo período de mais 60 meses.',
            'Solicitamos a confirmação do recebimento e a análise documental para seguimento do processo.',
            'Em caso de recebimento e interesse, pedimos que envie o documento assinado, para atualizarmos o cadastro em nosso sistema. Ressaltamos que o representante da instituição realizará a assinatura do documento e uma cópia será encaminhada para apreciação.',
            'Agradecemos desde já pela pareceria e atenção.',
            'Atenciosamente,'
          ].join('\n\n'),
          situacaoAposEnvio: 'Documentação solicitada',
          proximaAcao: 'Acompanhar a análise documental e o recebimento do aditivo assinado',
          diasProximoContato: 7
        }
      ];
      return definitions.flatMap((item) => marcasConvenio.map((marca) => ({
        id: `fallback-${normalize(item.situacao).replace(/\s+/g,'-')}-${normalize(marca)}`,
        ...item,
        marca,
        ativo: true,
        fallback: true
      })));
    }

    function allEmailTemplates() {
      return state.emailTemplates.length ? state.emailTemplates : fallbackEmailTemplates();
    }

    function findEmailTemplate(status, brand) {
      const normalizedBrand = normalizeBrand(brand);
      return allEmailTemplates().find((item) =>
        item.ativo !== false
        && String(item.situacao || '').trim() === String(status || '').trim()
        && normalizeBrand(item.marca) === normalizedBrand
      ) || null;
    }

    function replaceMessageTokens(text, company, brand, date = new Date()) {
      const values = {
        MARCA: normalizeBrand(brand),
        LOCAL: outlookLocalName(company),
        SAUDACAO: currentOutlookGreeting(date),
        RAZAO_SOCIAL: company?.razaoSocial || '',
        NOME_FANTASIA: company?.nomeFantasia || '',
        CNPJ: company?.cnpj || '',
        CIDADE: company?.cidade || '',
        ESTADO: company?.estado || '',
        POLO: company?.polo || '',
        FIM_VIGENCIA: formatDate(company?.fimVigencia),
        USUARIO_RESPONSAVEL: window.currentUser?.nome || window.currentUser?.email || ''
      };
      return String(text || '').replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => values[key] ?? '');
    }

    buildStandardOutlookMessage = function(company, brand, date = new Date()) {
      const template = findEmailTemplate(company?.situacao, brand);
      if (!template) return null;
      return {
        subject: replaceMessageTokens(template.titulo, company, brand, date),
        body: replaceMessageTokens(template.corpo, company, brand, date),
        template
      };
    };

    function workflowDateInfo(company) {
      const normalized = normalizeCompany(company);
      const date = normalized.proximaData || '';
      const now = todayISO();
      let category = 'sem-data';
      if (date) {
        const diff = daysBetween(parseDate(now), parseDate(date));
        category = diff < 0 ? 'atrasado' : diff === 0 ? 'hoje' : diff <= 7 ? 'proximos-7' : 'futuro';
      }
      return {
        nextAction: normalized.proximaAcao || (normalized.situacao === 'Não contatado' ? 'Realizar primeiro contato' : 'Definir próxima ação'),
        nextDate: date,
        responsible: normalized.responsavelOperacional || '',
        priority: normalized.prioridade || 'Média',
        category
      };
    }

    function priorityBadge(priority) {
      const className = priority === 'Urgente' ? 'badge-danger' : priority === 'Alta' ? 'badge-orange' : priority === 'Média' ? 'badge-warning' : 'badge-muted';
      return `<span class="badge ${className}">${escapeHTML(priority || 'Média')}</span>`;
    }

    function dataQualityIssues(company) {
      const issues = [];
      const phoneDigits = onlyDigits(company.telefone);
      if (!company.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)) issues.push({ key:'email', label:'E-mail ausente ou inválido' });
      if (!phoneDigits || phoneDigits.length < 10) issues.push({ key:'telefone', label:'Telefone ausente ou inválido' });
      if (!normalizeBrand(company.marca)) issues.push({ key:'marca', label:'Marca não informada' });
      if (!company.fimVigencia) issues.push({ key:'vigencia', label:'Fim da vigência não informado' });
      if (company.cnpj && !cnpjValidLength(company.cnpj)) issues.push({ key:'cnpj', label:'CNPJ incompleto' });
      if (!(company.contatos || []).length) issues.push({ key:'contatos', label:'Nenhum contato registrado' });
      if (['BAIXADA','INAPTA','SUSPENSA','NULA'].includes(String(company.situacaoCadastral || '').toUpperCase())) issues.push({ key:'situacao-cadastral', label:`Situação cadastral: ${company.situacaoCadastral}` });
      if (!company.cep || !company.logradouro || !company.cidade || !company.estado) issues.push({ key:'endereco', label:'Endereço incompleto' });
      if (!company.responsavelOperacional) issues.push({ key:'responsavel', label:'Sem responsável pelo acompanhamento' });
      return issues;
    }

    function ensureWorkflowEnhancementsUI() {
      if (!$('#workflowEnhancementsStyle')) {
        document.head.insertAdjacentHTML('beforeend', `<style id="workflowEnhancementsStyle">
          .workflow-brand-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:16px}
          .workflow-brand-card{display:grid;gap:10px}.workflow-brand-card .brand-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
          .workflow-brand-card .brand-head strong{font-size:15px}.workflow-brand-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
          .workflow-stat{padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}.workflow-stat span{display:block;color:var(--muted);font-size:10px}.workflow-stat strong{font-size:18px}
          .workflow-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.workflow-card{padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}
          .workflow-card span{display:block;color:var(--muted);font-size:10px}.workflow-card strong{font-size:22px}.workflow-card button{margin-top:9px}
          .workflow-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:14px}.workflow-toolbar .field{min-width:170px;flex:1}
          .workflow-brand-filter{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}
          .workflow-brand-filter label{font-size:10px;color:var(--muted);white-space:nowrap}.workflow-brand-filter select{min-width:150px}
          .workflow-table td{vertical-align:top}.workflow-table small{display:block;color:var(--muted);margin-top:4px}.workflow-actions{display:flex;gap:6px;flex-wrap:wrap}
          .workflow-due-overdue{color:#b91c1c;font-weight:700}.workflow-due-today{color:#d97706;font-weight:700}.workflow-due-upcoming{color:#1d4ed8;font-weight:700}
          .quality-tags{display:flex;flex-wrap:wrap;gap:5px}.quality-tag{font-size:9px;padding:4px 7px;border-radius:999px;background:rgba(220,38,38,.08);color:#b91c1c;border:1px solid rgba(220,38,38,.16)}
          .email-history{display:grid;gap:10px;margin-top:14px}.email-history-item{padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2)}
          .email-history-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.email-history-item small{color:var(--muted)}
          .template-list{display:grid;gap:10px}.template-item{padding:12px;border:1px solid var(--border);border-radius:12px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}
          .template-item small{display:block;color:var(--muted);margin-top:3px}.backup-monitor-ok{border-color:rgba(22,163,74,.35)}.backup-monitor-warning{border-color:rgba(217,119,6,.35)}
          .send-confirm-summary{display:grid;gap:7px}.send-confirm-summary strong{font-size:12px}.send-confirm-summary span{color:var(--muted);font-size:11px;overflow-wrap:anywhere}
          @media(max-width:1000px){.workflow-brand-grid{grid-template-columns:1fr}.workflow-brand-stats,.workflow-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
          @media(max-width:640px){.workflow-brand-stats,.workflow-grid{grid-template-columns:1fr}.workflow-toolbar{display:grid}.template-item{grid-template-columns:1fr}}
        </style>`);
      }

      const contactsNav = $('.nav-item[data-panel="contatos"]');
      if (contactsNav && !$('.nav-item[data-panel="fila"]')) {
        contactsNav.insertAdjacentHTML('afterend', '<button class="nav-item" data-panel="fila"><i class="fa-solid fa-list-check"></i><span class="nav-label">Minha fila</span></button>');
      }
      const reportsNav = $('.nav-item[data-panel="relatorios"]');
      if (reportsNav && !$('.nav-item[data-panel="qualidade"]')) {
        reportsNav.insertAdjacentHTML('afterend', '<button class="nav-item" data-panel="qualidade"><i class="fa-solid fa-circle-check"></i><span class="nav-label">Qualidade dos dados</span></button>');
      }

      const panelsHost = $('#panel-dashboard')?.parentElement;
      if (panelsHost && !$('#panel-fila')) {
        panelsHost.insertAdjacentHTML('beforeend', `
          <section class="panel" id="panel-fila">
            <div class="panel-header"><div><h2>Minha fila</h2><p>Acompanhe prazos, prioridades e ações pendentes.</p></div></div>
            <div class="workflow-grid" id="queueMetrics"></div>
            <div class="card" style="margin-top:14px">
              <div class="workflow-toolbar">
                <div class="field"><label>Responsabilidade</label><select class="form-control" id="queueScope"><option value="mine">Minha fila</option><option value="all">Todos</option><option value="unassigned">Sem responsável</option></select></div>
                <div class="field"><label>Marca</label><select class="form-control" id="queueBrand"><option value="">Ambas as marcas</option><option value="Uniasselvi">Uniasselvi</option><option value="Unicesumar">Unicesumar</option></select></div>
                <div class="field"><label>Prazo</label><select class="form-control" id="queueDue"><option value="">Todos os prazos</option><option value="atrasado">Atrasados</option><option value="hoje">Para hoje</option><option value="proximos-7">Próximos 7 dias</option><option value="sem-data">Sem data definida</option></select></div>
                <div class="field"><label>Prioridade</label><select class="form-control" id="queuePriority"><option value="">Todas</option><option>Urgente</option><option>Alta</option><option>Média</option><option>Baixa</option></select></div>
                <div class="field"><label>Pesquisar</label><input class="form-control" id="queueSearch" placeholder="Empresa, cidade, ação..." /></div>
              </div>
              <div class="table-wrap"><table class="workflow-table"><thead><tr><th>Concedente</th><th>Marca</th><th>Responsável</th><th>Prioridade</th><th>Próxima ação</th><th>Prazo</th><th>Situação</th><th>Ações</th></tr></thead><tbody id="queueTableBody"></tbody></table></div>
            </div>
          </section>
          <section class="panel" id="panel-qualidade">
            <div class="panel-header"><div><h2>Qualidade dos dados</h2><p>Localize cadastros incompletos ou que precisam de revisão.</p></div></div>
            <div class="workflow-grid" id="qualityMetrics"></div>
            <div class="card" style="margin-top:14px">
              <div class="workflow-toolbar">
                <div class="field"><label>Tipo de pendência</label><select class="form-control" id="qualityIssueFilter"><option value="">Todas</option><option value="email">E-mail</option><option value="telefone">Telefone</option><option value="marca">Marca</option><option value="vigencia">Vigência</option><option value="cnpj">CNPJ</option><option value="contatos">Contatos</option><option value="situacao-cadastral">Situação cadastral</option><option value="endereco">Endereço</option><option value="responsavel">Responsável</option></select></div>
                <div class="field"><label>Marca</label><select class="form-control" id="qualityBrand"><option value="">Ambas as marcas</option><option value="Uniasselvi">Uniasselvi</option><option value="Unicesumar">Unicesumar</option></select></div>
                <div class="field"><label>Pesquisar</label><input class="form-control" id="qualitySearch" placeholder="Empresa, CNPJ ou cidade..." /></div>
              </div>
              <div class="table-wrap"><table class="workflow-table"><thead><tr><th>Concedente</th><th>Marca</th><th>Localização</th><th>Pendências</th><th>Ação</th></tr></thead><tbody id="qualityTableBody"></tbody></table></div>
            </div>
          </section>`);
      }

      const dashboardActions = $('#panel-dashboard .panel-header .panel-actions');
      if (dashboardActions && !$('#dashboardBrandFilter')) {
        dashboardActions.insertAdjacentHTML(
          'afterbegin',
          '<div class="workflow-brand-filter"><label for="dashboardBrandFilter">Marca</label><select class="form-control" id="dashboardBrandFilter"><option value="">Ambas as marcas</option><option value="Uniasselvi">Uniasselvi</option><option value="Unicesumar">Unicesumar</option></select></div>'
        );
      }
      if ($('#dashboardMetrics') && !$('#brandDashboardSummary')) {
        $('#dashboardMetrics').insertAdjacentHTML('afterend', '<div id="brandDashboardSummary" class="workflow-brand-grid"></div>');
      }
      $('#recentActivities')?.closest('.card')?.remove();
      $('#backupDashboardMonitor')?.remove();
      const qualityNavIcon = $('.nav-item[data-panel="qualidade"] i');
      if (qualityNavIcon) qualityNavIcon.className = 'fa-solid fa-circle-check';

      const companyGrid = $('#companyForm .form-grid');
      const brandField = $('#marcaConvenioGroup')?.closest('.field');
      if (companyGrid && brandField && !$('#responsavelAcompanhamento')) {
        brandField.insertAdjacentHTML('afterend', `
          <div class="field"><label>Responsável pelo acompanhamento</label><input class="form-control" id="responsavelAcompanhamento" placeholder="Nome do responsável" /></div>
          <div class="field"><label>Prioridade</label><select class="form-control" id="prioridade"><option>Baixa</option><option selected>Média</option><option>Alta</option><option>Urgente</option></select></div>`);
      }

      const filtersGrid = $('#filtersCard .filters-grid');
      const filtersActions = filtersGrid?.querySelector('.filters-actions');
      if (filtersGrid && filtersActions && !$('#filterResponsavel')) {
        filtersActions.insertAdjacentHTML('beforebegin', '<div class="field"><label>Responsável</label><select class="form-control filter" id="filterResponsavel"><option value="">Todos</option></select></div><div class="field"><label>Prioridade</label><select class="form-control filter" id="filterPrioridade"><option value="">Todas</option><option>Urgente</option><option>Alta</option><option>Média</option><option>Baixa</option></select></div>');
      }

      const tableHeaderRow = $('#companiesTableBody')?.closest('table')?.querySelector('thead tr');
      if (tableHeaderRow && !tableHeaderRow.querySelector('[data-sort="responsavelOperacional"]')) {
        const actionHeader = tableHeaderRow.lastElementChild;
        actionHeader?.insertAdjacentHTML('beforebegin', '<th data-sort="responsavelOperacional">Responsável</th><th data-sort="prioridade">Prioridade</th><th data-sort="proximaAcao">Próxima ação</th><th data-sort="proximaData">Próximo contato</th>');
      }

      const timeline = $('#contactTimeline');
      if (timeline && !$('#emailCommunicationTimeline')) {
        timeline.insertAdjacentHTML('afterend', '<div id="emailCommunicationTimeline"></div>');
      }

      const settingsGrid = $('#panel-configuracoes .settings-grid');
      if (settingsGrid && !$('#emailTemplatesSettingsCard')) {
        settingsGrid.insertAdjacentHTML('beforeend', `
          <div class="card settings-wide" id="emailTemplatesSettingsCard" data-admin-only>
            <div class="card-title"><div><h3>Modelos de e-mail</h3><span>Textos, situação posterior e prazo de acompanhamento</span></div><button class="btn btn-sm btn-secondary" id="refreshEmailTemplates" type="button"><i class="fa-solid fa-rotate"></i>Atualizar</button></div>
            <div class="template-list" id="emailTemplatesList"></div>
          </div>`);
      }

      if (!$('#emailTemplateModalBackdrop')) {
        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal-backdrop" id="emailTemplateModalBackdrop" data-admin-only aria-hidden="true">
            <div class="modal lg"><form id="emailTemplateForm">
              <div class="modal-header"><div><h3>Editar modelo de e-mail</h3><p class="modal-subtitle" id="emailTemplateSubtitle"></p></div><button class="icon-btn" type="button" data-close="emailTemplateModalBackdrop"><i class="fa-solid fa-xmark"></i></button></div>
              <div class="modal-body"><input type="hidden" id="emailTemplateId"><div class="form-grid">
                <div class="field"><label>Situação</label><input class="form-control" id="emailTemplateSituation" readonly></div>
                <div class="field"><label>Marca</label><input class="form-control" id="emailTemplateBrand" readonly></div>
                <div class="field span-3"><label>Título <span class="required">*</span></label><input class="form-control" id="emailTemplateSubject" required></div>
                <div class="field span-3"><label>Corpo <span class="required">*</span></label><textarea class="form-control" id="emailTemplateBody" rows="15" required></textarea><span class="field-hint">Variáveis: {{MARCA}}, {{LOCAL}}, {{SAUDACAO}}, {{RAZAO_SOCIAL}}, {{CNPJ}}, {{CIDADE}}, {{ESTADO}}, {{FIM_VIGENCIA}}, {{USUARIO_RESPONSAVEL}}</span></div>
                <div class="field"><label>Situação após confirmação</label><select class="form-control" id="emailTemplateNextStatus"></select></div>
                <div class="field span-2"><label>Próxima ação</label><input class="form-control" id="emailTemplateNextAction"></div>
                <div class="field"><label>Dias para próximo contato</label><input class="form-control" id="emailTemplateNextDays" type="number" min="0" max="365"></div>
                <div class="field"><label><input type="checkbox" id="emailTemplateActive"> Modelo ativo</label></div>
              </div></div>
              <div class="modal-footer"><button type="button" class="btn btn-secondary" data-close="emailTemplateModalBackdrop">Cancelar</button><button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i>Salvar modelo</button></div>
            </form></div>
          </div>`);
      }

      if (!$('#emailSendConfirmationBackdrop')) {
        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal-backdrop" id="emailSendConfirmationBackdrop" aria-hidden="true">
            <div class="modal sm"><div class="modal-header"><div><h3>Confirmar envio do e-mail</h3><p class="modal-subtitle">O Outlook foi aberto para validação e envio.</p></div></div>
              <div class="modal-body"><div class="summary-box"><i class="fa-solid fa-envelope-circle-check"></i>O e-mail foi realmente enviado no Outlook?</div><div class="send-confirm-summary" id="emailSendConfirmationSummary" style="margin-top:14px"></div></div>
              <div class="modal-footer"><button class="btn btn-secondary" id="emailNotSentBtn" type="button">Não foi enviado</button><button class="btn btn-primary" id="emailSentBtn" type="button"><i class="fa-solid fa-check"></i>Sim, registrar envio</button></div>
            </div>
          </div>`);
      }
    }

    async function loadEmailTemplates({ silent = true } = {}) {
      if (!window.remoteData?.listEmailTemplates || state.emailTemplatesLoading || !window.currentUser?.id) return;
      state.emailTemplatesLoading = true;
      try {
        const templates = await window.remoteData.listEmailTemplates();
        state.emailTemplates = Array.isArray(templates) && templates.length ? templates : fallbackEmailTemplates();
        state.workflowSchemaReady = true;
      } catch (error) {
        state.emailTemplates = fallbackEmailTemplates();
        state.workflowSchemaReady = false;
        if (!silent) toast('warning','Modelos padrão carregados',error.message || 'A tabela de modelos ainda não está disponível.');
      } finally {
        state.emailTemplatesLoading = false;
        renderEmailTemplatesSettings();
      }
    }

    const baseLoadRemoteDataV860 = loadRemoteData;
    loadRemoteData = async function(options = {}) {
      await baseLoadRemoteDataV860(options);
      await loadEmailTemplates({ silent: true });
      renderAll();
    };

    const baseResetCompanyFormV860 = resetCompanyForm;
    resetCompanyForm = function() {
      baseResetCompanyFormV860();
      if ($('#responsavelAcompanhamento')) $('#responsavelAcompanhamento').value = window.currentUser?.nome || '';
      if ($('#prioridade')) $('#prioridade').value = 'Média';
    };

    const baseOpenCompanyFormV860 = openCompanyForm;
    openCompanyForm = function(id = null, preset = null) {
      baseOpenCompanyFormV860(id, preset);
      const company = id ? state.data.concedentes.find((item) => item.id === id) : preset;
      if ($('#responsavelAcompanhamento')) $('#responsavelAcompanhamento').value = company?.responsavelAcompanhamento || window.currentUser?.nome || '';
      if ($('#prioridade')) $('#prioridade').value = company?.prioridade || 'Média';
    };

    const baseGetCompanyFormDataV860 = getCompanyFormData;
    getCompanyFormData = function() {
      const company = baseGetCompanyFormDataV860();
      company.responsavelAcompanhamento = $('#responsavelAcompanhamento')?.value.trim() || '';
      company.prioridade = $('#prioridade')?.value || 'Média';
      return normalizeCompany(company);
    };

    const baseRenderDashboardV860 = renderDashboard;
    renderDashboard = function() {
      baseRenderDashboardV860();
      renderBrandDashboard();
    };

    function renderBrandDashboard() {
      const holder = $('#brandDashboardSummary');
      if (!holder) return;
      const selectedBrand = selectedBrandFilter('#dashboardBrandFilter');
      const visibleBrands = selectedBrand ? [selectedBrand] : marcasConvenio;
      holder.innerHTML = visibleBrands.map((brand) => {
        const rows = state.data.concedentes.map(normalizeCompany).filter((item) => item.marca === brand);
        const renewed = rows.filter((item) => item.situacao === 'Renovado').length;
        const pending = rows.filter((item) => !closedWorkflowStatuses.has(item.situacao)).length;
        const expiring = rows.filter((item) => ['Próximo do vencimento','Vencimento crítico','Vencido'].includes(item.situacaoVigencia)).length;
        const rate = rows.length ? Math.round((renewed / rows.length) * 100) : 0;
        return `<article class="card workflow-brand-card"><div class="brand-head"><strong>${escapeHTML(brand)}</strong><span class="badge badge-blue">${rows.length} convênios</span></div><div class="workflow-brand-stats"><div class="workflow-stat"><span>Renovados</span><strong>${renewed}</strong></div><div class="workflow-stat"><span>Em andamento</span><strong>${pending}</strong></div><div class="workflow-stat"><span>Prazo crítico</span><strong>${expiring}</strong></div><div class="workflow-stat"><span>Taxa de renovação</span><strong>${rate}%</strong></div></div></article>`;
      }).join('');
    }

    function renderBackupDashboardMonitor() {
      const holder = $('#backupDashboardMonitor');
      if (!holder || !isAdmin()) return;
      const clock = saoPauloClock();
      const automatic = state.exportHistory.filter((item) => item.origem === 'automatica');
      const latest = automatic[0] || null;
      const todayFiles = automatic.filter((item) => String(item.arquivo_nome || '').includes(clock.dateKey));
      const todayOk = todayFiles.some((item) => String(item.tipo || '').includes('backup-json'));
      holder.className = `card ${todayOk ? 'backup-monitor-ok' : 'backup-monitor-warning'}`;
      holder.innerHTML = `<div class="card-title"><div><h3>Monitoramento do backup</h3><span>${todayOk ? 'Cópia diária concluída' : 'Cópia diária pendente'}</span></div><span class="badge ${todayOk ? 'badge-success' : 'badge-warning'}"><i class="fa-solid ${todayOk ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>${todayOk ? 'Concluído' : 'Verificar'}</span></div><div class="setting-row"><div><strong>Última execução automática</strong><small>${latest?.criado_em ? new Date(latest.criado_em).toLocaleString('pt-BR') : 'Nenhuma execução encontrada.'}</small></div><span class="badge badge-muted">${todayFiles.length} arquivo(s) hoje</span></div><div class="setting-row"><div><strong>Ação rápida</strong><small>Gere novamente o JSON e as planilhas quando necessário.</small></div><button class="btn btn-secondary" id="dashboardRunBackup" type="button"><i class="fa-solid fa-play"></i>Executar agora</button></div>`;
      if (!state.exportHistoryLoadedAt && !state.exportHistoryLoading) {
        loadExportHistory({ silent: true }).then(renderBackupDashboardMonitor);
      }
    }

    const baseRenderCompaniesV860 = renderCompanies;
    renderCompanies = function() {
      baseRenderCompaniesV860();
      const total = state.filtered.length;
      const start = (state.page - 1) * state.pageSize;
      const currentRows = state.filtered.slice(start, start + state.pageSize);
      const tableRows = $$('#companiesTableBody tr');
      tableRows.forEach((row, index) => {
        if (!currentRows[index] || row.children.length <= 1) {
          row.firstElementChild?.setAttribute('colspan','30');
          return;
        }
        if (row.querySelector('[data-workflow-cell]')) return;
        const company = normalizeCompany(currentRows[index]);
        const actionCell = row.lastElementChild;
        actionCell?.insertAdjacentHTML('beforebegin', `<td data-workflow-cell>${escapeHTML(company.responsavelOperacional || '—')}</td><td data-workflow-cell>${priorityBadge(company.prioridade)}</td><td data-workflow-cell class="td-truncate" title="${escapeHTML(company.proximaAcao || '')}">${escapeHTML(company.proximaAcao || '—')}</td><td data-workflow-cell>${formatDate(company.proximaData)}</td>`);
      });
      if ($('#resultCount')) $('#resultCount').title = `${total} cadastro(s) após os filtros operacionais`;
    };

    const baseRenderContactsPanelV860 = renderContactsPanel;
    renderContactsPanel = function() {
      baseRenderContactsPanelV860();
      const company = state.data.concedentes.find((item) => item.id === state.selectedContactCompanyId);
      const holder = $('#emailCommunicationTimeline');
      if (!holder) return;
      holder.innerHTML = company ? renderEmailCommunicationHistory(company) : '';
    };

    const baseRenderKanbanV860 = renderKanban;
    renderKanban = function() {
      baseRenderKanbanV860();
      $$('.kanban-card').forEach((card) => {
        const company = state.data.concedentes.find((item) => item.id === card.dataset.id);
        if (!company || card.querySelector('.workflow-kanban-meta')) return;
        const heading = card.querySelector('h4');
        heading?.insertAdjacentHTML('afterend', `<div class="workflow-kanban-meta" style="display:flex;gap:5px;flex-wrap:wrap;margin:6px 0">${priorityBadge(company.prioridade)}<span class="badge badge-muted"><i class="fa-solid fa-user"></i>${escapeHTML(company.responsavelOperacional || 'Sem responsável')}</span></div>`);
      });
    };

    const baseRenderSettingsV860 = renderSettings;
    renderSettings = function() {
      baseRenderSettingsV860();
      renderEmailTemplatesSettings();
    };

    const baseViewCompanyV860 = viewCompany;
    viewCompany = function(id) {
      baseViewCompanyV860(id);
      const company = state.data.concedentes.find((item) => item.id === id);
      if (!company || !$('#viewModalBody')) return;
      const workflow = workflowDateInfo(company);
      $('#viewModalBody').insertAdjacentHTML('afterbegin', `<div class="summary-box" style="margin-bottom:14px"><i class="fa-solid fa-list-check"></i><span><strong>Gestão do acompanhamento:</strong> ${escapeHTML(workflow.responsible || 'Sem responsável')} • ${escapeHTML(workflow.priority)} • ${escapeHTML(workflow.nextAction)} • ${formatDate(workflow.nextDate)}</span></div>`);
      $('#viewModalBody').insertAdjacentHTML('beforeend', renderEmailCommunicationHistory(company));
    };

    function renderEmailCommunicationHistory(company) {
      const communications = [...(company.comunicacoes || [])].sort((a,b) => String(b.preparadoEm || b.criadoEm || '').localeCompare(String(a.preparadoEm || a.criadoEm || '')));
      return `<div class="card-title" style="margin-top:22px"><h3>Comunicações por e-mail (${communications.length})</h3><span>Preparação e confirmação no Outlook</span></div>${communications.length ? `<div class="email-history">${communications.map((item) => `<article class="email-history-item"><div class="email-history-head"><div><strong>${escapeHTML(item.assunto || 'Recado por e-mail')}</strong><small>${escapeHTML(item.destinatario || 'Destinatário não informado')} • ${escapeHTML(item.marca || 'Sem marca')}</small></div><span class="badge ${item.status === 'enviado' ? 'badge-success' : item.status === 'nao_enviado' ? 'badge-danger' : 'badge-warning'}">${item.status === 'enviado' ? 'Envio confirmado' : item.status === 'nao_enviado' ? 'Não enviado' : 'Preparado'}</span></div><small>${item.preparadoEm ? new Date(item.preparadoEm).toLocaleString('pt-BR') : '—'} • ${escapeHTML(item.usuarioNome || 'Usuário')}</small></article>`).join('')}</div>` : emptyState('Nenhum recado preparado','Os recados abertos no Outlook serão registrados aqui.')}`;
    }

    function renderWorkQueue() {
      const holder = $('#queueTableBody');
      if (!holder) return;
      const currentName = String(window.currentUser?.nome || '').trim();
      const scope = $('#queueScope')?.value || 'mine';
      const brand = selectedBrandFilter('#queueBrand');
      const due = $('#queueDue')?.value || '';
      const priority = $('#queuePriority')?.value || '';
      const search = normalize($('#queueSearch')?.value || '');
      let rows = state.data.concedentes.map(normalizeCompany).filter((company) => !closedWorkflowStatuses.has(company.situacao));
      if (brand) rows = rows.filter((company) => normalizeBrand(company.marca) === brand);
      if (scope === 'mine') rows = rows.filter((company) => normalize(company.responsavelOperacional) === normalize(currentName));
      if (scope === 'unassigned') rows = rows.filter((company) => !company.responsavelOperacional);
      if (due) rows = rows.filter((company) => workflowDateInfo(company).category === due);
      if (priority) rows = rows.filter((company) => company.prioridade === priority);
      if (search) rows = rows.filter((company) => normalize([company.razaoSocial,company.nomeFantasia,company.cnpj,company.cidade,company.proximaAcao].join(' ')).includes(search));
      rows.sort((a,b) => {
        const priorityCompare = (priorityOrder[a.prioridade] ?? 9) - (priorityOrder[b.prioridade] ?? 9);
        if (priorityCompare) return priorityCompare;
        return String(a.proximaData || '9999-12-31').localeCompare(String(b.proximaData || '9999-12-31'));
      });
      const allOpen = state.data.concedentes
        .map(normalizeCompany)
        .filter((company) => !closedWorkflowStatuses.has(company.situacao))
        .filter((company) => !brand || normalizeBrand(company.marca) === brand);
      const metrics = [
        ['Atrasados',allOpen.filter((c)=>workflowDateInfo(c).category==='atrasado').length,'fa-triangle-exclamation'],
        ['Para hoje',allOpen.filter((c)=>workflowDateInfo(c).category==='hoje').length,'fa-calendar-day'],
        ['Próximos 7 dias',allOpen.filter((c)=>workflowDateInfo(c).category==='proximos-7').length,'fa-calendar-week'],
        ['Sem responsável',allOpen.filter((c)=>!c.responsavelOperacional).length,'fa-user-slash']
      ];
      $('#queueMetrics').innerHTML = metrics.map(([label,value,icon])=>`<div class="workflow-card"><span>${label}</span><strong>${value}</strong><i class="fa-solid ${icon}" style="float:right;color:var(--muted)"></i></div>`).join('');
      holder.innerHTML = rows.length ? rows.map((company) => {
        const info = workflowDateInfo(company);
        const dueClass = info.category === 'atrasado' ? 'workflow-due-overdue' : info.category === 'hoje' ? 'workflow-due-today' : info.category === 'proximos-7' ? 'workflow-due-upcoming' : '';
        return `<tr><td><strong>${escapeHTML(company.nomeFantasia || company.razaoSocial)}</strong><small>${escapeHTML(company.cnpj || 'Sem CNPJ')} • ${escapeHTML(company.cidade)}/${escapeHTML(company.estado)}</small></td><td>${escapeHTML(company.marca || '—')}</td><td>${escapeHTML(info.responsible || 'Sem responsável')}</td><td>${priorityBadge(info.priority)}</td><td>${escapeHTML(info.nextAction)}</td><td class="${dueClass}">${formatDate(info.nextDate)}</td><td>${badgeForSituacao(company.situacao)}</td><td><div class="workflow-actions">${!info.responsible && canEdit()?`<button class="btn btn-sm btn-primary" data-queue-claim="${company.id}"><i class="fa-solid fa-hand"></i>Assumir</button>`:''}<button class="btn btn-sm btn-secondary" data-queue-contact="${company.id}" title="Registrar contato"><i class="fa-solid fa-phone"></i></button>${supportsStandardOutlookMessage(company)?`<button class="btn btn-sm btn-secondary" data-queue-email="${company.id}" title="Preparar recado"><i class="fa-solid fa-envelope"></i></button>`:''}<button class="btn btn-sm btn-secondary" data-queue-edit="${company.id}" title="Editar"><i class="fa-solid fa-pen"></i></button></div></td></tr>`;
      }).join('') : `<tr><td colspan="8">${emptyState('Nenhuma ação nesta fila','Altere os filtros ou defina responsáveis e datas nos contatos.')}</td></tr>`;
    }

    function renderDataQuality() {
      const holder = $('#qualityTableBody');
      if (!holder) return;
      const issueFilter = $('#qualityIssueFilter')?.value || '';
      const brand = selectedBrandFilter('#qualityBrand');
      const search = normalize($('#qualitySearch')?.value || '');
      const records = state.data.concedentes
        .map(normalizeCompany)
        .filter((company) => !brand || normalizeBrand(company.marca) === brand)
        .map((company) => ({ company, issues: dataQualityIssues(company) }));
      const withIssues = records.filter((item) => item.issues.length);
      const filtered = withIssues.filter((item) => {
        if (issueFilter && !item.issues.some((issue) => issue.key === issueFilter)) return false;
        if (search && !normalize([item.company.razaoSocial,item.company.nomeFantasia,item.company.cnpj,item.company.cidade].join(' ')).includes(search)) return false;
        return true;
      }).sort((a,b) => b.issues.length - a.issues.length);
      const metrics = [
        ['Cadastros com pendência',withIssues.length,'fa-list-circle-check'],
        ['Sem e-mail válido',records.filter((x)=>x.issues.some((i)=>i.key==='email')).length,'fa-envelope-circle-xmark'],
        ['Sem vigência',records.filter((x)=>x.issues.some((i)=>i.key==='vigencia')).length,'fa-calendar-xmark'],
        ['Sem responsável',records.filter((x)=>x.issues.some((i)=>i.key==='responsavel')).length,'fa-user-slash']
      ];
      $('#qualityMetrics').innerHTML = metrics.map(([label,value,icon])=>`<div class="workflow-card"><span>${label}</span><strong>${value}</strong><i class="fa-solid ${icon}" style="float:right;color:var(--muted)"></i></div>`).join('');
      holder.innerHTML = filtered.length ? filtered.map(({company,issues})=>`<tr><td><strong>${escapeHTML(company.nomeFantasia || company.razaoSocial)}</strong><small>${escapeHTML(company.cnpj || 'Sem CNPJ')}</small></td><td>${escapeHTML(company.marca || '—')}</td><td>${escapeHTML(company.cidade || '—')}/${escapeHTML(company.estado || '—')}</td><td><div class="quality-tags">${issues.map((issue)=>`<span class="quality-tag">${escapeHTML(issue.label)}</span>`).join('')}</div></td><td><button class="btn btn-sm btn-primary" data-quality-edit="${company.id}"><i class="fa-solid fa-pen"></i>Corrigir cadastro</button></td></tr>`).join('') : `<tr><td colspan="5">${emptyState('Nenhuma pendência encontrada','Os cadastros correspondentes ao filtro estão completos.')}</td></tr>`;
    }

    function renderEmailTemplatesSettings() {
      const holder = $('#emailTemplatesList');
      if (!holder) return;
      const templates = allEmailTemplates().slice().sort((a,b)=>`${a.situacao}|${a.marca}`.localeCompare(`${b.situacao}|${b.marca}`,'pt-BR'));
      holder.innerHTML = templates.map((template) => `<article class="template-item"><div><strong>${escapeHTML(template.situacao)} — ${escapeHTML(template.marca)}</strong><small>${escapeHTML(template.titulo)} • Próximo contato em ${Number(template.diasProximoContato || 0)} dia(s) • ${template.ativo === false ? 'Inativo' : 'Ativo'}</small></div><button class="btn btn-sm btn-secondary" data-edit-template="${escapeHTML(template.id)}" type="button"><i class="fa-solid fa-pen"></i>Editar</button></article>`).join('');
    }

    function openEmailTemplateEditor(id) {
      if (!ensureAdmin('editar modelos de e-mail')) return;
      const template = allEmailTemplates().find((item) => String(item.id) === String(id));
      if (!template) return;
      $('#emailTemplateId').value = template.id || '';
      $('#emailTemplateSituation').value = template.situacao || '';
      $('#emailTemplateBrand').value = template.marca || '';
      $('#emailTemplateSubject').value = template.titulo || '';
      $('#emailTemplateBody').value = template.corpo || '';
      $('#emailTemplateNextStatus').innerHTML = situacoesContato.map((status)=>`<option ${status===template.situacaoAposEnvio?'selected':''}>${escapeHTML(status)}</option>`).join('');
      $('#emailTemplateNextAction').value = template.proximaAcao || '';
      $('#emailTemplateNextDays').value = Number(template.diasProximoContato || 0);
      $('#emailTemplateActive').checked = template.ativo !== false;
      $('#emailTemplateSubtitle').textContent = `${template.situacao} • ${template.marca}`;
      openModal('emailTemplateModalBackdrop');
    }

    async function saveEmailTemplateEditor(event) {
      event.preventDefault();
      if (!ensureAdmin('editar modelos de e-mail')) return;
      const payload = {
        id: $('#emailTemplateId').value,
        situacao: $('#emailTemplateSituation').value,
        marca: $('#emailTemplateBrand').value,
        titulo: $('#emailTemplateSubject').value.trim(),
        corpo: $('#emailTemplateBody').value.trim(),
        situacaoAposEnvio: $('#emailTemplateNextStatus').value,
        proximaAcao: $('#emailTemplateNextAction').value.trim(),
        diasProximoContato: Number($('#emailTemplateNextDays').value || 0),
        ativo: $('#emailTemplateActive').checked
      };
      if (!payload.titulo || !payload.corpo) {
        toast('error','Revise o modelo','Título e corpo são obrigatórios.');
        return;
      }
      const button = $('#emailTemplateForm button[type="submit"]');
      button.disabled = true;
      try {
        const saved = await window.remoteData.saveEmailTemplate(payload);
        const index = state.emailTemplates.findIndex((item) => item.id === saved.id || (item.situacao === saved.situacao && item.marca === saved.marca));
        if (index >= 0) state.emailTemplates[index] = saved; else state.emailTemplates.push(saved);
        closeModal('emailTemplateModalBackdrop');
        renderEmailTemplatesSettings();
        toast('success','Modelo atualizado','O próximo recado utilizará o novo texto e as novas regras.');
      } catch (error) {
        toast('error','Falha ao salvar modelo',error.message || 'Não foi possível atualizar o modelo.');
      } finally {
        button.disabled = false;
      }
    }

    ensureOutlookMessageUI = ((base) => function() {
      base();
      ensureWorkflowEnhancementsUI();
    })(ensureOutlookMessageUI);

    submitOutlookMessage = async function(event) {
      event.preventDefault();
      const company = state.data.concedentes.find((item) => item.id === $('#outlookMessageCompanyId')?.value);
      const brand = selectedOutlookBrand();
      const recipient = $('#outlookMessageRecipient')?.value.trim() || '';
      const draft = company && brand ? buildStandardOutlookMessage(company, brand) : null;
      if (!company || !draft || !isValidOutlookRecipient(recipient)) {
        setOutlookMessageValidation('Revise a concedente, a marca e o destinatário.', 'error');
        return;
      }
      const popup = window.open('about:blank','_blank');
      if (!popup) {
        setOutlookMessageValidation('O navegador bloqueou a nova guia. Libere pop-ups e tente novamente.', 'error');
        return;
      }
      const outlookQuery = [`to=${encodeURIComponent(recipient)}`,`subject=${encodeURIComponent(draft.subject)}`,`body=${encodeURIComponent(draft.body)}`].join('&');
      const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?${outlookQuery}`;
      let communication = null;
      try {
        communication = await window.remoteData.createEmailCommunication?.({
          companyId: company.id,
          templateId: draft.template?.fallback ? null : draft.template?.id,
          marca: brand,
          situacaoOrigem: company.situacao,
          destinatario: recipient,
          assunto: draft.subject,
          corpo: draft.body,
          status: 'preparado',
          usuarioId: window.currentUser?.id || null,
          usuarioNome: window.currentUser?.nome || '',
          usuarioEmail: window.currentUser?.email || ''
        });
        if (communication) {
          company.comunicacoes = company.comunicacoes || [];
          company.comunicacoes.unshift(communication);
        }
      } catch (error) {
        console.warn('[E-mail] Não foi possível registrar a preparação:', error);
      }
      popup.location.href = outlookUrl;
      try { popup.opener = null; } catch {}
      state.pendingEmail = { companyId: company.id, recipient, draft, communicationId: communication?.id || null };
      closeModal('outlookMessageModalBackdrop');
      $('#emailSendConfirmationSummary').innerHTML = `<strong>${escapeHTML(company.nomeFantasia || company.razaoSocial)}</strong><span>${escapeHTML(recipient)}</span><span>${escapeHTML(draft.subject)}</span>`;
      setTimeout(() => openModal('emailSendConfirmationBackdrop'), 500);
      toast('success','Recado preparado','Revise o conteúdo no Outlook e confirme o envio no sistema.');
    };

    async function confirmOutlookEmail(sent) {
      const pending = state.pendingEmail;
      state.pendingEmail = null;
      closeModal('emailSendConfirmationBackdrop');
      if (!pending) return;
      const company = state.data.concedentes.find((item) => item.id === pending.companyId);
      if (!company) return;
      try {
        if (pending.communicationId) {
          const updated = await window.remoteData.updateEmailCommunicationStatus?.(pending.communicationId, sent ? 'enviado' : 'nao_enviado');
          if (updated) {
            const index = (company.comunicacoes || []).findIndex((item) => item.id === updated.id);
            if (index >= 0) company.comunicacoes[index] = updated;
          }
        }
        if (!sent) {
          renderAll();
          toast('info','Envio não registrado','O recado permaneceu no histórico como não enviado.');
          return;
        }
        const template = pending.draft.template || {};
        const now = new Date();
        const contact = {
          id: uid(),
          data: todayISO(),
          horario: now.toTimeString().slice(0,5),
          responsavel: window.currentUser?.nome || window.currentUser?.email || 'Usuário',
          forma: 'E-mail',
          pessoa: pending.recipient,
          resultado: template.situacaoAposEnvio || company.situacao,
          proximaAcao: template.proximaAcao || 'Acompanhar retorno da concedente',
          proximaData: Number(template.diasProximoContato || 0) > 0 ? addDaysISO(Number(template.diasProximoContato)) : '',
          observacoes: `Envio confirmado pelo usuário no Outlook.\nAssunto: ${pending.draft.subject}\nMarca: ${company.marca}`
        };
        const saved = await window.remoteData.createContact(company.id, contact, company);
        company.contatos = company.contatos || [];
        company.contatos.push(saved);
        company.situacao = saved.resultado || company.situacao;
        company.formasContato = [...new Set([...(company.formasContato || []),'E-mail'])];
        if (!company.responsavelAcompanhamento && window.currentUser?.nome) {
          const updatedCompany = await window.remoteData.updateCompanyManagement?.(company.id, { responsavelAcompanhamento: window.currentUser.nome, prioridade: company.prioridade || 'Média' });
          if (updatedCompany) company.responsavelAcompanhamento = updatedCompany.responsavelAcompanhamento;
        }
        renderAll();
        toast('success','Envio registrado','O contato, a próxima ação e o prazo foram atualizados automaticamente.');
      } catch (error) {
        console.error('[Confirmação de e-mail]',error);
        await loadRemoteData({ silent: true });
        toast('error','Falha ao registrar envio',error.message || 'O e-mail foi enviado, mas o histórico não pôde ser atualizado.');
      }
    }

    async function claimQueueCompany(id) {
      if (!canEdit()) return;
      const company = state.data.concedentes.find((item) => item.id === id);
      if (!company) return;
      try {
        const saved = await window.remoteData.updateCompanyManagement(id, { responsavelAcompanhamento: window.currentUser?.nome || window.currentUser?.email || '', prioridade: company.prioridade || 'Média' });
        company.responsavelAcompanhamento = saved?.responsavelAcompanhamento || window.currentUser?.nome || '';
        renderAll();
        toast('success','Acompanhamento atribuído','A concedente foi adicionada à sua fila.');
      } catch (error) {
        toast('error','Falha ao assumir acompanhamento',error.message || 'Não foi possível atualizar o responsável.');
      }
    }

    function bindWorkflowEnhancementEvents() {
      $('#emailTemplateForm')?.addEventListener('submit', saveEmailTemplateEditor);
      $('#emailSentBtn')?.addEventListener('click', () => confirmOutlookEmail(true));
      $('#emailNotSentBtn')?.addEventListener('click', () => confirmOutlookEmail(false));
      $('#refreshEmailTemplates')?.addEventListener('click', () => loadEmailTemplates({ silent: false }));
      ['queueScope','queueBrand','queueDue','queuePriority'].forEach((id)=>$('#'+id)?.addEventListener('change',renderWorkQueue));
      $('#queueSearch')?.addEventListener('input',renderWorkQueue);
      ['qualityIssueFilter','qualityBrand'].forEach((id)=>$('#'+id)?.addEventListener('change',renderDataQuality));
      $('#qualitySearch')?.addEventListener('input',renderDataQuality);
      $('#dashboardBrandFilter')?.addEventListener('change',renderDashboard);
      document.addEventListener('click', (event) => {
        const templateButton = event.target.closest?.('[data-edit-template]');
        if (templateButton) return openEmailTemplateEditor(templateButton.dataset.editTemplate);
        const claim = event.target.closest?.('[data-queue-claim]');
        if (claim) return claimQueueCompany(claim.dataset.queueClaim);
        const contact = event.target.closest?.('[data-queue-contact]');
        if (contact) return openContactForm(contact.dataset.queueContact);
        const email = event.target.closest?.('[data-queue-email]');
        if (email) return openOutlookMessage(email.dataset.queueEmail);
        const edit = event.target.closest?.('[data-queue-edit],[data-quality-edit]');
        if (edit) return openCompanyForm(edit.dataset.queueEdit || edit.dataset.qualityEdit);
        if (event.target.closest?.('#dashboardRunBackup')) return runAutomaticBackup({ force: true });
      });
    }


    restoreJSON = function(file) {
      if (!ensureAdmin('restaurar backups')) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (!parsed || !Array.isArray(parsed.concedentes)) throw new Error('Estrutura inválida');
          confirmAction('Restaurar backup','Todos os dados operacionais serão substituídos pelo conteúdo do arquivo. Deseja continuar?',async()=>{
            try {
              const result = window.remoteData.replaceAllWorkflow
                ? await window.remoteData.replaceAllWorkflow(parsed.concedentes.map(normalizeCompany), parsed.modelosEmail || [])
                : await window.remoteData.replaceAll(parsed.concedentes.map(normalizeCompany));
              await loadRemoteData({silent:true});
              toast('success','Backup restaurado',`${result.inserted} concedente(s), ${result.contactsInserted} contato(s), ${result.communicationsInserted || 0} comunicação(ões) e ${result.templatesRestored || 0} modelo(s) restaurado(s).`);
            } catch (error) {
              toast('error','Falha na restauração',error.message || 'Não foi possível restaurar o backup.');
            }
          });
        } catch (error) {
          toast('error','Backup inválido','O arquivo JSON não possui uma estrutura compatível.');
        }
      };
      reader.readAsText(file);
    };

    const baseRenderAllV860 = renderAll;
    renderAll = function() {
      baseRenderAllV860();
      const active = $('.panel.active')?.id.replace('panel-','') || '';
      if (active === 'fila') renderWorkQueue();
      if (active === 'qualidade') renderDataQuality();
      renderEmailTemplatesSettings();
    };

    const baseBuildBackupPayloadV860 = buildBackupPayload;
    buildBackupPayload = function() {
      const payload = baseBuildBackupPayloadV860();
      payload.version = 3;
      payload.totalComunicacoesEmail = state.data.concedentes.reduce((sum, company) => sum + (company.comunicacoes?.length || 0), 0);
      payload.modelosEmail = allEmailTemplates().filter((item) => !item.fallback);
      return payload;
    };


    // =====================================================================
    // V8.7.0 — PRODUTIVIDADE, CONTROLE DE EDIÇÃO E GESTÃO
    // =====================================================================

    state.bulkSelectedIds = state.bulkSelectedIds || new Set();
    state.savedFilters = state.savedFilters || [];
    state.savedFiltersLoading = false;
    state.activeEditLock = null;
    state.editLockTimer = null;
    state.managementReportRows = [];
    state.healthLastRun = null;

    const advancedPriorityValues = Object.freeze(['Baixa','Média','Alta','Urgente']);
    const editLockTtlSeconds = 150;
    const editLockRefreshMs = 45000;

    function advancedStyles() {
      if ($('#v870Styles')) return;
      const style = document.createElement('style');
      style.id = 'v870Styles';
      style.textContent = `
        .bulk-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 13px;margin-bottom:10px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}
        .bulk-toolbar.hidden{display:none}
        .bulk-toolbar strong{font-size:12px}
        .bulk-toolbar .bulk-spacer{flex:1}
        .bulk-check-cell{width:42px;text-align:center}
        .bulk-check-cell input{width:16px;height:16px;accent-color:var(--primary)}
        .saved-filter-bar{display:flex;align-items:end;gap:8px;flex-wrap:wrap;padding:10px 12px;margin-bottom:12px;border:1px dashed var(--border);border-radius:12px;background:var(--surface-soft)}
        .saved-filter-bar .field{min-width:210px;flex:1}
        .edit-lock-banner{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;margin-bottom:12px;border-radius:12px;border:1px solid rgba(8,145,178,.24);background:rgba(8,145,178,.08)}
        .edit-lock-banner.warning{border-color:rgba(220,38,38,.28);background:rgba(220,38,38,.08)}
        .edit-lock-banner i{margin-top:2px;color:#0891b2}
        .edit-lock-banner.warning i{color:var(--danger)}
        .edit-lock-banner strong,.edit-lock-banner span{display:block}
        .edit-lock-banner span{font-size:11px;color:var(--muted);margin-top:3px}
        .management-report-grid{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:10px}
        .management-report-filters{display:grid;grid-template-columns:repeat(6,minmax(135px,1fr));gap:10px;align-items:end}
        .health-grid{display:grid;grid-template-columns:repeat(3,minmax(190px,1fr));gap:12px}
        .health-card{border:1px solid var(--border);border-radius:14px;padding:15px;background:var(--surface);display:grid;gap:8px}
        .health-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .health-card-head i{font-size:18px;color:var(--muted)}
        .health-card small{color:var(--muted);line-height:1.45}
        .health-status-ok{color:var(--success)}
        .health-status-warning{color:var(--warning)}
        .health-status-error{color:var(--danger)}
        .audit-comparison-notice{margin-bottom:14px}
        .saved-view-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
        .saved-view-chip{border:1px solid var(--border);background:var(--surface);padding:6px 9px;border-radius:999px;font-size:11px;cursor:pointer}
        .saved-view-chip:hover{border-color:var(--primary)}
        @media(max-width:1150px){
          .management-report-grid{grid-template-columns:repeat(2,minmax(160px,1fr))}
          .management-report-filters{grid-template-columns:repeat(3,minmax(150px,1fr))}
          .health-grid{grid-template-columns:repeat(2,minmax(190px,1fr))}
        }
        @media(max-width:700px){
          .management-report-grid,.management-report-filters,.health-grid{grid-template-columns:1fr}
        }
      `;
      document.head.appendChild(style);
    }

    function ensureAdvancedManagementUI() {
      advancedStyles();

      const auditNav = $('.nav-item[data-panel="auditoria"]');
      if (auditNav && !$('.nav-item[data-panel="saude"]')) {
        auditNav.insertAdjacentHTML('afterend', '<button class="nav-item" data-panel="saude" data-admin-only><i class="fa-solid fa-heart-pulse"></i><span class="nav-label">Saúde do sistema</span></button>');
      }

      const panelsHost = $('#panel-dashboard')?.parentElement;
      if (!$('#panel-saude')) {
        panelsHost.insertAdjacentHTML('beforeend', `
          <section class="panel" id="panel-saude">
            <div class="panel-header"><div><h2>Saúde do sistema</h2><p>Verifique a conexão, as integrações e o último backup.</p></div><div class="panel-actions"><button class="btn btn-primary" id="runHealthChecks" type="button"><i class="fa-solid fa-rotate"></i>Testar serviços</button></div></div>
            <div class="health-grid" id="healthGrid"></div>
            <div class="card" style="margin-top:14px">
              <div class="card-title"><div><h3>Informações técnicas</h3><span>Resumo da versão e da sessão atual</span></div></div>
              <div id="healthTechnicalInfo"></div>
            </div>
          </section>`);
      }

      const companiesTable = $('#companiesTableBody')?.closest('table');
      const tableWrap = companiesTable?.closest('.table-wrap');
      if (tableWrap && !$('#bulkActionsToolbar')) {
        tableWrap.insertAdjacentHTML('beforebegin', `
          <div class="bulk-toolbar hidden" id="bulkActionsToolbar">
            <strong><span id="bulkSelectedCount">0</span> concedente(s) selecionada(s)</strong>
            <button class="btn btn-primary btn-sm" id="bulkOpenActions" type="button"><i class="fa-solid fa-wand-magic-sparkles"></i>Aplicar ações</button>
            <button class="btn btn-secondary btn-sm" id="bulkExportSelected" type="button" data-admin-only><i class="fa-solid fa-file-excel"></i>Exportar selecionados</button>
            <span class="bulk-spacer"></span>
            <button class="btn btn-secondary btn-sm" id="bulkClearSelection" type="button"><i class="fa-solid fa-xmark"></i>Limpar seleção</button>
          </div>`);
      }

      const filterCard = $('#filtersCard');
      if (filterCard && !$('#savedCompanyFilters')) {
        const target = filterCard.querySelector('.filters-grid') || filterCard.firstElementChild;
        target?.insertAdjacentHTML('beforebegin', `
          <div class="saved-filter-bar">
            <div class="field"><label>Visualização salva</label><select class="form-control" id="savedCompanyFilters"><option value="">Selecione um filtro salvo</option></select></div>
            <button class="btn btn-secondary btn-sm" id="saveCompanyFilter" type="button"><i class="fa-solid fa-bookmark"></i>Salvar filtros atuais</button>
            <button class="btn btn-danger btn-sm" id="deleteCompanyFilter" type="button"><i class="fa-solid fa-trash"></i>Excluir</button>
          </div>`);
      }

      const queueCard = $('#queueTableBody')?.closest('.card');
      if (queueCard && !$('#savedQueueFilters')) {
        const toolbar = queueCard.querySelector('.workflow-toolbar');
        toolbar?.insertAdjacentHTML('beforebegin', `
          <div class="saved-filter-bar">
            <div class="field"><label>Atalho salvo</label><select class="form-control" id="savedQueueFilters"><option value="">Selecione uma fila salva</option></select></div>
            <button class="btn btn-secondary btn-sm" id="saveQueueFilter" type="button"><i class="fa-solid fa-bookmark"></i>Salvar fila atual</button>
            <button class="btn btn-danger btn-sm" id="deleteQueueFilter" type="button"><i class="fa-solid fa-trash"></i>Excluir</button>
          </div>`);
      }

      const reportsPanel = $('#panel-relatorios');
      if (reportsPanel && !$('#managementReportCard')) {
        reportsPanel.insertAdjacentHTML('beforeend', `
          <section class="card" id="managementReportCard" style="margin-top:16px">
            <div class="card-title"><div><h3>Relatório gerencial por período</h3><span>Desempenho por marca, responsável, localidade e situação</span></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" id="exportManagementReport" type="button" data-admin-only><i class="fa-solid fa-file-excel"></i>Exportar Excel</button><button class="btn btn-secondary btn-sm" id="printManagementReport" type="button"><i class="fa-solid fa-print"></i>Imprimir / PDF</button></div></div>
            <div class="management-report-filters">
              <div class="field"><label>Data inicial</label><input class="form-control" id="managementStartDate" type="date" /></div>
              <div class="field"><label>Data final</label><input class="form-control" id="managementEndDate" type="date" /></div>
              <div class="field"><label>Marca</label><select class="form-control" id="managementBrand"><option value="">Ambas</option><option>Uniasselvi</option><option>Unicesumar</option></select></div>
              <div class="field"><label>Responsável</label><select class="form-control" id="managementResponsible"><option value="">Todos</option></select></div>
              <div class="field"><label>Estado</label><select class="form-control" id="managementState"><option value="">Todos</option></select></div>
              <div class="field"><label>Polo</label><select class="form-control" id="managementPolo"><option value="">Todos</option></select></div>
              <div class="field"><label>Situação</label><select class="form-control" id="managementStatus"><option value="">Todas</option>${situacoesContato.map((status)=>`<option>${escapeHTML(status)}</option>`).join('')}</select></div>
              <div class="field"><button class="btn btn-primary" id="refreshManagementReport" type="button"><i class="fa-solid fa-filter"></i>Atualizar relatório</button></div>
            </div>
            <div class="management-report-grid" id="managementReportMetrics" style="margin-top:14px"></div>
            <div class="table-wrap" style="margin-top:14px"><table class="workflow-table"><thead><tr><th>Responsável</th><th>Convênios</th><th>Contatos no período</th><th>Renovações</th><th>Pendências</th><th>Taxa</th></tr></thead><tbody id="managementReportBody"></tbody></table></div>
          </section>`);
      }

      const modalHost = document.body;
      if (!$('#bulkActionModalBackdrop')) {
        modalHost.insertAdjacentHTML('beforeend', `
          <div class="modal-backdrop" id="bulkActionModalBackdrop" aria-hidden="true">
            <div class="modal" role="dialog" aria-modal="true" style="max-width:760px">
              <div class="modal-header"><div><h2>Ações em massa</h2><p id="bulkActionSubtitle">Atualize os registros selecionados.</p></div><button class="modal-close" type="button" data-close="bulkActionModalBackdrop"><i class="fa-solid fa-xmark"></i></button></div>
              <form id="bulkActionForm">
                <div class="modal-body">
                  <div class="form-grid">
                    <div class="field"><label>Responsável</label><input class="form-control" id="bulkResponsible" placeholder="Não alterar" /><span class="field-hint">Use “SEM RESPONSÁVEL” para remover a atribuição.</span></div>
                    <div class="field"><label>Prioridade</label><select class="form-control" id="bulkPriority"><option value="">Não alterar</option>${advancedPriorityValues.map((value)=>`<option>${value}</option>`).join('')}</select></div>
                    <div class="field"><label>Situação</label><select class="form-control" id="bulkStatus"><option value="">Não alterar</option>${situacoesContato.map((value)=>`<option>${escapeHTML(value)}</option>`).join('')}</select></div>
                    <div class="field"><label>Próximo contato</label><input class="form-control" id="bulkNextDate" type="date" /></div>
                    <div class="field span-2"><label>Próxima ação</label><input class="form-control" id="bulkNextAction" placeholder="Não alterar" /></div>
                  </div>
                  <div class="summary-box"><i class="fa-solid fa-circle-info"></i>Somente os campos preenchidos serão alterados. Próxima ação, data ou situação gerarão um registro no histórico de contatos.</div>
                </div>
                <div class="modal-footer"><button class="btn btn-secondary" type="button" data-close="bulkActionModalBackdrop">Cancelar</button><button class="btn btn-primary" id="bulkApplyButton" type="submit"><i class="fa-solid fa-floppy-disk"></i>Aplicar alterações</button></div>
              </form>
            </div>
          </div>`);
      }

      const companyModalBody = $('#companyModalBody') || $('.company-modal-body');
      if (companyModalBody && !$('#editLockBanner')) {
        companyModalBody.insertAdjacentHTML('afterbegin', '<div class="edit-lock-banner hidden" id="editLockBanner"></div>');
      }

      if (!$('#savedFilterNameBackdrop')) {
        modalHost.insertAdjacentHTML('beforeend', `
          <div class="modal-backdrop" id="savedFilterNameBackdrop" aria-hidden="true">
            <div class="modal" role="dialog" aria-modal="true" style="max-width:480px">
              <div class="modal-header"><div><h2>Salvar visualização</h2><p>Crie um atalho pessoal para os filtros atuais.</p></div><button class="modal-close" type="button" data-close="savedFilterNameBackdrop"><i class="fa-solid fa-xmark"></i></button></div>
              <form id="savedFilterNameForm">
                <div class="modal-body"><div class="field"><label>Nome do atalho</label><input class="form-control" id="savedFilterName" maxlength="80" required placeholder="Ex.: Uniasselvi atrasados" /></div><input type="hidden" id="savedFilterPanel" /></div>
                <div class="modal-footer"><button class="btn btn-secondary" type="button" data-close="savedFilterNameBackdrop">Cancelar</button><button class="btn btn-primary" type="submit"><i class="fa-solid fa-bookmark"></i>Salvar</button></div>
              </form>
            </div>
          </div>`);
      }

      if (!$('#managementReportPrintStyles')) {
        const style = document.createElement('style');
        style.id = 'managementReportPrintStyles';
        style.textContent = '@media print{body.management-report-print .sidebar,body.management-report-print .topbar,body.management-report-print .panel:not(#panel-relatorios),body.management-report-print #panel-relatorios>*:not(#managementReportCard){display:none!important}body.management-report-print #managementReportCard{display:block!important;border:0!important;box-shadow:none!important}body.management-report-print .management-report-filters,body.management-report-print #managementReportCard .card-title button{display:none!important}}';
        document.head.appendChild(style);
      }

      if (!$('#managementStartDate')?.value) {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        $('#managementStartDate').value = start.toISOString().slice(0,10);
        $('#managementEndDate').value = todayISO();
      }
    }

    function ensureAuditComparisonNotice() {
      const panel = $('#panel-auditoria');
      if (!panel || $('#auditComparisonNotice')) return;
      const anchor = $('#auditMetrics') || panel.firstElementChild;
      anchor?.insertAdjacentHTML('beforebegin', '<div class="summary-box audit-comparison-notice" id="auditComparisonNotice"><i class="fa-solid fa-code-compare"></i><span><strong>Comparação visual ativa:</strong> abra os detalhes de uma edição para conferir, campo a campo, o valor anterior e o novo valor.</span></div>');
    }

    function currentCompanyPageRows() {
      const start = (state.page - 1) * state.pageSize;
      return state.filtered.slice(start, start + state.pageSize);
    }

    function updateBulkToolbar() {
      const validIds = new Set(state.data.concedentes.map((company) => company.id));
      [...state.bulkSelectedIds].forEach((id) => {
        if (!validIds.has(id)) state.bulkSelectedIds.delete(id);
      });
      const count = state.bulkSelectedIds.size;
      $('#bulkActionsToolbar')?.classList.toggle('hidden', count === 0);
      if ($('#bulkSelectedCount')) $('#bulkSelectedCount').textContent = String(count);
      const rows = currentCompanyPageRows();
      const selected = rows.filter((company) => state.bulkSelectedIds.has(company.id)).length;
      const selectAll = $('#bulkSelectAllPage');
      if (selectAll) {
        selectAll.checked = rows.length > 0 && selected === rows.length;
        selectAll.indeterminate = selected > 0 && selected < rows.length;
      }
    }

    function enhanceCompanyTableSelection() {
      const table = $('#companiesTableBody')?.closest('table');
      const header = table?.querySelector('thead tr');
      if (header && !$('#bulkSelectAllPage')) {
        header.insertAdjacentHTML('afterbegin', '<th class="bulk-check-cell"><input type="checkbox" id="bulkSelectAllPage" aria-label="Selecionar página atual" /></th>');
      }
      const pageRows = currentCompanyPageRows();
      $$('#companiesTableBody tr').forEach((row, index) => {
        const company = pageRows[index];
        if (!company || row.children.length <= 1) {
          row.firstElementChild?.setAttribute('colspan','40');
          return;
        }
        if (row.querySelector('[data-bulk-company]')) return;
        row.insertAdjacentHTML('afterbegin', `<td class="bulk-check-cell"><input type="checkbox" data-bulk-company="${company.id}" ${state.bulkSelectedIds.has(company.id) ? 'checked' : ''} aria-label="Selecionar ${escapeHTML(company.nomeFantasia || company.razaoSocial)}" /></td>`);
      });
      updateBulkToolbar();
    }

    async function applyBulkActions(event) {
      event.preventDefault();
      if (!canEdit()) return;
      const ids = [...state.bulkSelectedIds];
      if (!ids.length) return;
      const responsibleRaw = String($('#bulkResponsible')?.value || '').trim();
      const payload = {
        responsavelAcompanhamento: normalize(responsibleRaw) === 'sem responsavel' ? '__CLEAR__' : responsibleRaw,
        prioridade: $('#bulkPriority')?.value || '',
        situacao: $('#bulkStatus')?.value || '',
        proximaAcao: String($('#bulkNextAction')?.value || '').trim(),
        proximaData: $('#bulkNextDate')?.value || ''
      };
      if (!Object.values(payload).some(Boolean)) {
        toast('warning','Nenhuma alteração','Preencha ao menos um campo.');
        return;
      }
      const button = $('#bulkApplyButton');
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Aplicando…';
      }
      try {
        const result = await window.remoteData.bulkUpdateCompanies(ids, payload);
        closeModal('bulkActionModalBackdrop');
        state.bulkSelectedIds.clear();
        await loadRemoteData({ silent: true });
        toast('success','Ações concluídas',`${Number(result?.updated || ids.length)} concedente(s) atualizada(s) e ${Number(result?.contactsInserted || 0)} registro(s) de acompanhamento criado(s).`);
      } catch (error) {
        toast('error','Falha nas ações em massa',error.message || 'Não foi possível atualizar os registros.');
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>Aplicar alterações';
        }
      }
    }

    async function exportBulkSelected() {
      if (!ensureAdmin('exportar cadastros selecionados')) return;
      const rows = state.data.concedentes.filter((company) => state.bulkSelectedIds.has(company.id));
      if (!rows.length) return;
      const filename = `concedentes_selecionadas_${new Date().toLocaleDateString('pt-BR').replaceAll('/','-')}.xlsx`;
      const blob = workbookBlob([{ name:'Concedentes', rows:[CSV_HEADERS,...rows.map(companyToCsvRow)], widths:[23,19,34,28,16,22,28,24,16,38,12,28,10,20,20,10,22,30,18,20,28,14,34,18,18,16,18,24,24,28,24,24,40] }]);
      await completeSpreadsheetDownload(blob, filename, 'concedentes-selecionadas', rows.length);
      toast('success','Selecionados exportados',`${rows.length} cadastro(s) incluído(s) no arquivo.`);
    }

    function savedFilterPanelItems(panel) {
      return state.savedFilters.filter((item) => item.painel === panel);
    }

    function renderSavedFilterOptions() {
      const definitions = [
        ['concedentes','#savedCompanyFilters','Selecione um filtro salvo'],
        ['fila','#savedQueueFilters','Selecione uma fila salva']
      ];
      definitions.forEach(([panel, selector, placeholder]) => {
        const select = $(selector);
        if (!select) return;
        const current = select.value;
        const rows = savedFilterPanelItems(panel);
        select.innerHTML = `<option value="">${placeholder}</option>` + rows.map((item)=>`<option value="${escapeHTML(item.id)}">${escapeHTML(item.nome)}</option>`).join('');
        if (rows.some((item)=>String(item.id)===String(current))) select.value = current;
      });
    }

    async function loadSavedFilters({ silent = true } = {}) {
      if (!window.remoteData?.listSavedFilters || !window.currentUser?.id || state.savedFiltersLoading) return;
      state.savedFiltersLoading = true;
      try {
        state.savedFilters = await window.remoteData.listSavedFilters();
        renderSavedFilterOptions();
      } catch (error) {
        if (!silent) toast('error','Falha ao carregar atalhos',error.message || 'Não foi possível carregar os filtros salvos.');
      } finally {
        state.savedFiltersLoading = false;
      }
    }

    function captureCompanyFilters() {
      const ids = ['filterVigencia','filterMarca','filterEstado','filterCidade','filterPolo','filterSituacao','filterForma','filterInicio','filterFim','filterRapido','filterResponsavel','filterPrioridade'];
      return {
        values: Object.fromEntries(ids.map((id)=>[id,$('#'+id)?.value || ''])),
        search: $('#tableSearch')?.value || '',
        sort: { ...state.sort },
        pageSize: state.pageSize
      };
    }

    function captureQueueFilters() {
      return {
        queueScope: $('#queueScope')?.value || 'mine',
        queueBrand: $('#queueBrand')?.value || '',
        queueDue: $('#queueDue')?.value || '',
        queuePriority: $('#queuePriority')?.value || '',
        queueSearch: $('#queueSearch')?.value || ''
      };
    }

    function applySavedFilter(item) {
      if (!item) return;
      const filters = item.filtros || {};
      if (item.painel === 'concedentes') {
        updateFilterOptions();
        Object.entries(filters.values || {}).forEach(([id,value]) => {
          const element = $('#'+id);
          if (element) element.value = value || '';
        });
        if ($('#tableSearch')) $('#tableSearch').value = filters.search || '';
        if (filters.sort?.key) state.sort = { key: filters.sort.key, dir: filters.sort.dir === 'asc' ? 'asc' : 'desc' };
        if (Number(filters.pageSize)) {
          state.pageSize = Number(filters.pageSize);
          if ($('#pageSize')) $('#pageSize').value = String(state.pageSize);
        }
        state.page = 1;
        renderCompanies();
      }
      if (item.painel === 'fila') {
        ['queueScope','queueBrand','queueDue','queuePriority','queueSearch'].forEach((id) => {
          const element = $('#'+id);
          if (element && filters[id] !== undefined) element.value = filters[id];
        });
        renderWorkQueue();
      }
      toast('success','Visualização aplicada',`O atalho “${item.nome}” foi carregado.`);
    }

    function openSaveFilterDialog(panel) {
      $('#savedFilterPanel').value = panel;
      $('#savedFilterName').value = '';
      openModal('savedFilterNameBackdrop');
      setTimeout(()=>$('#savedFilterName')?.focus(),60);
    }

    async function saveCurrentFilter(event) {
      event.preventDefault();
      const panel = $('#savedFilterPanel')?.value;
      const name = String($('#savedFilterName')?.value || '').trim();
      if (!name || !['concedentes','fila'].includes(panel)) return;
      const filters = panel === 'concedentes' ? captureCompanyFilters() : captureQueueFilters();
      try {
        await window.remoteData.saveSavedFilter({ nome:name, painel:panel, filtros:filters });
        closeModal('savedFilterNameBackdrop');
        await loadSavedFilters({ silent: false });
        toast('success','Atalho salvo',`“${name}” estará disponível nos seus próximos acessos.`);
      } catch (error) {
        toast('error','Falha ao salvar atalho',error.message || 'Não foi possível salvar o filtro.');
      }
    }

    async function deleteSelectedSavedFilter(panel) {
      const selector = panel === 'concedentes' ? '#savedCompanyFilters' : '#savedQueueFilters';
      const id = $(selector)?.value;
      if (!id) {
        toast('warning','Selecione um atalho','Escolha a visualização que deseja excluir.');
        return;
      }
      try {
        await window.remoteData.deleteSavedFilter(id);
        await loadSavedFilters({ silent: true });
        toast('success','Atalho excluído','A visualização salva foi removida.');
      } catch (error) {
        toast('error','Falha ao excluir atalho',error.message || 'Não foi possível excluir o filtro.');
      }
    }

    function setCompanyFormReadOnly(readOnly) {
      const form = $('#companyForm');
      if (!form) return;
      $$('input,select,textarea,button[type="submit"]', form).forEach((element) => {
        element.disabled = Boolean(readOnly);
      });
    }

    function showEditLockBanner(kind, title, detail) {
      const banner = $('#editLockBanner');
      if (!banner) return;
      banner.classList.remove('hidden','warning');
      if (kind === 'warning') banner.classList.add('warning');
      banner.innerHTML = `<i class="fa-solid ${kind === 'warning' ? 'fa-lock' : 'fa-user-shield'}"></i><div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(detail)}</span></div>`;
    }

    function hideEditLockBanner() {
      $('#editLockBanner')?.classList.add('hidden');
    }

    function stopEditLockTimer() {
      if (state.editLockTimer) clearInterval(state.editLockTimer);
      state.editLockTimer = null;
    }

    async function releaseCurrentEditLock() {
      stopEditLockTimer();
      const companyId = state.activeEditLock?.companyId;
      const owned = state.activeEditLock?.owned;
      state.activeEditLock = null;
      hideEditLockBanner();
      if (companyId && owned && window.remoteData?.releaseEditLock) {
        try { await window.remoteData.releaseEditLock(companyId); } catch {}
      }
    }

    async function beginCompanyEditLock(companyId) {
      stopEditLockTimer();
      state.activeEditLock = { companyId, owned:false, checking:true };
      setCompanyFormReadOnly(true);
      showEditLockBanner('info','Verificando edição simultânea','Aguarde enquanto o sistema reserva este cadastro para edição.');
      if (!window.remoteData?.acquireEditLock) {
        state.activeEditLock = { companyId, owned:true, compatibility:true };
        setCompanyFormReadOnly(false);
        showEditLockBanner('info','Proteção em modo compatível','A tabela de bloqueios ainda não está disponível. A edição continuará normalmente.');
        return;
      }
      try {
        const result = await window.remoteData.acquireEditLock(companyId, editLockTtlSeconds);
        if (result?.acquired) {
          state.activeEditLock = { companyId, owned:true, expiresAt:result.expiresAt || '' };
          setCompanyFormReadOnly(false);
          showEditLockBanner('info','Edição reservada para você','Outros usuários serão avisados enquanto este formulário estiver aberto.');
          state.editLockTimer = setInterval(async()=>{
            try {
              const refreshed = await window.remoteData.acquireEditLock(companyId, editLockTtlSeconds);
              if (!refreshed?.acquired) {
                stopEditLockTimer();
                state.activeEditLock = { companyId, owned:false, lock:refreshed };
                setCompanyFormReadOnly(true);
                showEditLockBanner('warning','A reserva de edição foi perdida',`O cadastro está reservado por ${refreshed?.usuarioNome || refreshed?.usuarioEmail || 'outro usuário'}.`);
                toast('warning','Edição bloqueada','Outro usuário assumiu este cadastro.');
              }
            } catch {}
          }, editLockRefreshMs);
        } else {
          state.activeEditLock = { companyId, owned:false, lock:result };
          setCompanyFormReadOnly(true);
          const expiry = result?.expiresAt ? new Date(result.expiresAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
          showEditLockBanner('warning','Cadastro em edição',`${result?.usuarioNome || result?.usuarioEmail || 'Outro usuário'} está editando este cadastro${expiry ? ` até aproximadamente ${expiry}` : ''}. O formulário foi aberto somente para consulta.`);
        }
      } catch (error) {
        state.activeEditLock = { companyId, owned:true, compatibility:true };
        setCompanyFormReadOnly(false);
        showEditLockBanner('info','Proteção temporariamente indisponível','A edição foi liberada, mas não foi possível consultar o bloqueio simultâneo.');
      }
    }

    function managementFilteredCompanies() {
      const brand = $('#managementBrand')?.value || '';
      const responsible = $('#managementResponsible')?.value || '';
      const stateCode = $('#managementState')?.value || '';
      const polo = $('#managementPolo')?.value || '';
      const status = $('#managementStatus')?.value || '';
      return state.data.concedentes.map(normalizeCompany).filter((company) => {
        if (brand && company.marca !== brand) return false;
        if (responsible && company.responsavelOperacional !== responsible) return false;
        if (stateCode && company.estado !== stateCode) return false;
        if (polo && company.polo !== polo) return false;
        if (status && company.situacao !== status) return false;
        return true;
      });
    }

    function dateInsidePeriod(value, start, end) {
      if (!value) return false;
      const date = String(value).slice(0,10);
      return (!start || date >= start) && (!end || date <= end);
    }

    function renderManagementReport() {
      if (!$('#managementReportCard')) return;
      const companies = state.data.concedentes.map(normalizeCompany);
      setSelectOptions('#managementResponsible', companies.map((company)=>company.responsavelOperacional), $('#managementResponsible')?.value || '');
      setSelectOptions('#managementState', companies.map((company)=>company.estado), $('#managementState')?.value || '');
      setSelectOptions('#managementPolo', companies.map((company)=>company.polo), $('#managementPolo')?.value || '');
      const start = $('#managementStartDate')?.value || '';
      const end = $('#managementEndDate')?.value || '';
      const rows = managementFilteredCompanies();
      const contacts = rows.flatMap((company) => (company.contatos || []).filter((contact)=>dateInsidePeriod(contact.data,start,end)).map((contact)=>({company,contact})));
      const renewals = contacts.filter(({contact})=>contact.resultado === 'Renovado');
      const open = rows.filter((company)=>!closedWorkflowStatuses.has(company.situacao));
      const noResponse = rows.filter((company)=>{
        if (company.situacao !== 'Aguardando retorno') return false;
        const last = latestContact(company);
        if (!last?.data) return true;
        return daysBetween(parseDate(last.data), parseDate(todayISO())) > 10;
      });
      const completionDays = renewals.map(({company,contact})=>{
        if (!company.dataCadastro || !contact.data) return null;
        return Math.max(0,daysBetween(parseDate(company.dataCadastro),parseDate(contact.data)));
      }).filter((value)=>value!==null);
      const averageDays = completionDays.length ? Math.round(completionDays.reduce((sum,value)=>sum+value,0)/completionDays.length) : 0;
      const rate = rows.length ? Math.round((rows.filter((company)=>company.situacao==='Renovado').length/rows.length)*100) : 0;
      const metrics = [
        ['Convênios no filtro',rows.length,'fa-building'],
        ['Contatos no período',contacts.length,'fa-comments'],
        ['Renovações registradas',renewals.length,'fa-circle-check'],
        ['Pendências atuais',open.length,'fa-hourglass-half'],
        ['Sem retorno há 10+ dias',noResponse.length,'fa-envelope-open-text'],
        ['Taxa atual de renovação',`${rate}%`,'fa-chart-line'],
        ['Tempo médio até renovação',`${averageDays} dia(s)`,'fa-stopwatch']
      ];
      $('#managementReportMetrics').innerHTML = metrics.map(([label,value,icon])=>`<div class="workflow-card"><span>${label}</span><strong>${value}</strong><i class="fa-solid ${icon}" style="float:right;color:var(--muted)"></i></div>`).join('');
      const byResponsible = new Map();
      rows.forEach((company)=>{
        const key = company.responsavelOperacional || 'Sem responsável';
        const item = byResponsible.get(key) || { name:key, companies:[], contacts:0, renewals:0, pending:0 };
        item.companies.push(company);
        item.contacts += (company.contatos || []).filter((contact)=>dateInsidePeriod(contact.data,start,end)).length;
        item.renewals += (company.contatos || []).filter((contact)=>dateInsidePeriod(contact.data,start,end)&&contact.resultado==='Renovado').length;
        if (!closedWorkflowStatuses.has(company.situacao)) item.pending += 1;
        byResponsible.set(key,item);
      });
      state.managementReportRows = [...byResponsible.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      $('#managementReportBody').innerHTML = state.managementReportRows.length ? state.managementReportRows.map((item)=>{
        const itemRate = item.companies.length ? Math.round((item.companies.filter((company)=>company.situacao==='Renovado').length/item.companies.length)*100) : 0;
        return `<tr><td><strong>${escapeHTML(item.name)}</strong></td><td>${item.companies.length}</td><td>${item.contacts}</td><td>${item.renewals}</td><td>${item.pending}</td><td>${itemRate}%</td></tr>`;
      }).join('') : `<tr><td colspan="6">${emptyState('Nenhum dado no período','Altere os filtros do relatório gerencial.')}</td></tr>`;
    }

    async function exportManagementReport() {
      if (!ensureAdmin('exportar o relatório gerencial')) return;
      renderManagementReport();
      const rows = state.managementReportRows || [];
      if (!rows.length) return toast('warning','Nada para exportar','Nenhum dado corresponde aos filtros.');
      const headers = ['Responsável','Convênios','Contatos no período','Renovações','Pendências','Taxa atual'];
      const data = rows.map((item)=>{
        const rate = item.companies.length ? Math.round((item.companies.filter((company)=>company.situacao==='Renovado').length/item.companies.length)*100) : 0;
        return [item.name,item.companies.length,item.contacts,item.renewals,item.pending,`${rate}%`];
      });
      const details = managementFilteredCompanies().map((company)=>[
        company.nomeFantasia || company.razaoSocial,company.cnpj,company.marca,company.responsavelOperacional,
        company.prioridade,company.situacao,company.estado,company.cidade,company.polo,
        company.proximaAcao,formatDate(company.proximaData)
      ]);
      const blob = workbookBlob([
        { name:'Resumo por responsável', rows:[headers,...data], widths:[28,15,20,15,15,15] },
        { name:'Convênios do filtro', rows:[['Concedente','CNPJ','Marca','Responsável','Prioridade','Situação','Estado','Cidade','Polo','Próxima ação','Próximo contato'],...details], widths:[34,20,16,28,14,25,10,22,24,36,18] }
      ]);
      const filename = `relatorio_gerencial_${new Date().toLocaleDateString('pt-BR').replaceAll('/','-')}.xlsx`;
      await completeSpreadsheetDownload(blob,filename,'relatorio-gerencial',details.length);
      toast('success','Relatório gerencial exportado',`${details.length} convênio(s) incluído(s).`);
    }

    function healthStatusCard(id, title, icon) {
      return `<article class="health-card" id="health-${id}"><div class="health-card-head"><strong>${escapeHTML(title)}</strong><i class="fa-solid ${icon}"></i></div><span class="badge badge-muted" data-health-status>Não testado</span><small data-health-detail>Clique em Testar serviços.</small></article>`;
    }

    function setHealthResult(id, status, detail) {
      const card = $('#health-'+id);
      if (!card) return;
      const badge = $('[data-health-status]',card);
      const text = $('[data-health-detail]',card);
      const meta = {
        ok:['Operacional','badge-success'],
        warning:['Atenção','badge-warning'],
        error:['Indisponível','badge-danger'],
        loading:['Testando…','badge-muted']
      }[status] || ['Não testado','badge-muted'];
      badge.className = `badge ${meta[1]}`;
      badge.textContent = meta[0];
      text.textContent = detail || '';
    }

    function renderSystemHealth() {
      if (!isAdmin()) return;
      const grid = $('#healthGrid');
      if (!grid) return;
      if (!grid.children.length) {
        grid.innerHTML = [
          healthStatusCard('supabase','Supabase','fa-database'),
          healthStatusCard('cnpj','Consulta de CNPJ','fa-building-circle-check'),
          healthStatusCard('cep','ViaCEP','fa-location-dot'),
          healthStatusCard('backup','Backup e armazenamento','fa-cloud-arrow-up'),
          healthStatusCard('session','Autenticação','fa-user-shield'),
          healthStatusCard('version','Versão publicada','fa-code-branch')
        ].join('');
      }
      const version = document.querySelector('meta[name="app-version"]')?.content || '—';
      const build = window.__CONVENIOS_BUILD__ || '—';
      $('#healthTechnicalInfo').innerHTML = `<div class="detail-grid"><div><span>Versão</span><strong>${escapeHTML(version)}</strong></div><div><span>Build</span><strong>${escapeHTML(build)}</strong></div><div><span>Usuário</span><strong>${escapeHTML(window.currentUser?.email || '—')}</strong></div><div><span>Último teste</span><strong>${state.healthLastRun ? state.healthLastRun.toLocaleString('pt-BR') : 'Ainda não executado'}</strong></div></div>`;
      setHealthResult('version','ok',`V${version} — ${build}`);
      setHealthResult('session',window.currentUser?.id?'ok':'error',window.currentUser?.id ? `Sessão ativa para ${window.currentUser.email || window.currentUser.nome}` : 'Nenhum usuário autenticado.');
    }

    async function runSystemHealthChecks() {
      renderSystemHealth();
      ['supabase','cnpj','cep','backup'].forEach((id)=>setHealthResult(id,'loading','Aguardando resposta do serviço.'));
      const supabaseTest = (async()=>{
        const result = await window.remoteData.healthCheck();
        setHealthResult('supabase','ok',`${Number(result?.companies || 0)} concedente(s) acessível(is).`);
      })();
      const cepTest = (async()=>{
        const response = await fetch('https://viacep.com.br/ws/01001000/json/',{cache:'no-store'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data?.localidade) throw new Error('Resposta incompleta.');
        setHealthResult('cep','ok',`Serviço respondeu: ${data.localidade}/${data.uf}.`);
      })();
      const cnpjTest = (async()=>{
        const sample = state.data.concedentes.find((company)=>cnpjValidLength(company.cnpj));
        const cnpj = cnpjKey(sample?.cnpj || '00000000000000');
        const token = await getAuthenticatedToken();
        const response = await fetch(`/api/cnpj-lookup?cnpj=${encodeURIComponent(cnpj)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
        if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
        const body = await response.json().catch(()=>null);
        setHealthResult('cnpj',response.ok?'ok':'warning',response.ok ? `Rota operacional${body?.data?.razao_social ? ` — ${body.data.razao_social}` : ''}.` : `A rota respondeu HTTP ${response.status}; verifique o CNPJ de teste.`);
      })();
      const backupTest = (async()=>{
        if (!isAdmin()) {
          setHealthResult('backup','warning','A verificação detalhada é exclusiva do administrador.');
          return;
        }
        const response = await exportApi('');
        const payload = await response.json().catch(()=>null);
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        const automatic = (payload?.data?.items || []).filter((item)=>item.origem==='automatica');
        const latest = automatic[0];
        setHealthResult('backup',latest?'ok':'warning',latest ? `Última cópia: ${new Date(latest.criado_em).toLocaleString('pt-BR')}.` : 'Nenhum backup automático encontrado.');
      })();
      const results = await Promise.allSettled([supabaseTest,cepTest,cnpjTest,backupTest]);
      const ids = ['supabase','cep','cnpj','backup'];
      results.forEach((result,index)=>{
        if (result.status === 'rejected') setHealthResult(ids[index],'error',result.reason?.message || 'Falha na verificação.');
      });
      state.healthLastRun = new Date();
      renderSystemHealth();
    }

    function bindAdvancedManagementEvents() {
      $('#bulkActionForm')?.addEventListener('submit',applyBulkActions);
      $('#bulkOpenActions')?.addEventListener('click',()=>{
        const count = state.bulkSelectedIds.size;
        if (!count) return;
        $('#bulkActionForm').reset();
        $('#bulkActionSubtitle').textContent = `${count} concedente(s) serão atualizada(s).`;
        openModal('bulkActionModalBackdrop');
      });
      $('#bulkExportSelected')?.addEventListener('click',exportBulkSelected);
      $('#bulkClearSelection')?.addEventListener('click',()=>{state.bulkSelectedIds.clear();renderCompanies();});
      $('#saveCompanyFilter')?.addEventListener('click',()=>openSaveFilterDialog('concedentes'));
      $('#saveQueueFilter')?.addEventListener('click',()=>openSaveFilterDialog('fila'));
      $('#deleteCompanyFilter')?.addEventListener('click',()=>deleteSelectedSavedFilter('concedentes'));
      $('#deleteQueueFilter')?.addEventListener('click',()=>deleteSelectedSavedFilter('fila'));
      $('#savedFilterNameForm')?.addEventListener('submit',saveCurrentFilter);
      $('#savedCompanyFilters')?.addEventListener('change',(event)=>applySavedFilter(state.savedFilters.find((item)=>String(item.id)===String(event.target.value))));
      $('#savedQueueFilters')?.addEventListener('change',(event)=>applySavedFilter(state.savedFilters.find((item)=>String(item.id)===String(event.target.value))));
      ['managementStartDate','managementEndDate','managementBrand','managementResponsible','managementState','managementPolo','managementStatus'].forEach((id)=>$('#'+id)?.addEventListener('change',renderManagementReport));
      $('#refreshManagementReport')?.addEventListener('click',renderManagementReport);
      $('#exportManagementReport')?.addEventListener('click',exportManagementReport);
      $('#printManagementReport')?.addEventListener('click',()=>{
        document.body.classList.add('management-report-print');
        window.print();
        setTimeout(()=>document.body.classList.remove('management-report-print'),500);
      });
      $('#runHealthChecks')?.addEventListener('click',runSystemHealthChecks);
      document.addEventListener('change',(event)=>{
        const checkbox = event.target.closest?.('[data-bulk-company]');
        if (checkbox) {
          if (checkbox.checked) state.bulkSelectedIds.add(checkbox.dataset.bulkCompany);
          else state.bulkSelectedIds.delete(checkbox.dataset.bulkCompany);
          updateBulkToolbar();
        }
        if (event.target.id === 'bulkSelectAllPage') {
          currentCompanyPageRows().forEach((company)=>{
            if (event.target.checked) state.bulkSelectedIds.add(company.id);
            else state.bulkSelectedIds.delete(company.id);
          });
          renderCompanies();
        }
      });
      document.addEventListener('auth:ready',()=>{
        loadSavedFilters({silent:true});
        if ($('#panel-saude')?.classList.contains('active')) runSystemHealthChecks();
      });
      document.addEventListener('auth:signed-out',()=>{
        state.savedFilters = [];
        state.bulkSelectedIds.clear();
        releaseCurrentEditLock();
        renderSavedFilterOptions();
      });
      window.addEventListener('beforeunload',()=>{ if (state.activeEditLock?.owned) window.remoteData?.releaseEditLock?.(state.activeEditLock.companyId); });
    }

    const baseRenderCompaniesV870 = renderCompanies;
    renderCompanies = function() {
      baseRenderCompaniesV870();
      enhanceCompanyTableSelection();
    };

    const baseOpenCompanyFormV870 = openCompanyForm;
    openCompanyForm = function(id = null, preset = null) {
      const releasePromise = releaseCurrentEditLock();
      baseOpenCompanyFormV870(id,preset);
      if (id) {
        setCompanyFormReadOnly(true);
        Promise.resolve(releasePromise).finally(() => beginCompanyEditLock(id));
      } else {
        state.activeEditLock = null;
        setCompanyFormReadOnly(false);
        hideEditLockBanner();
      }
    };

    const baseCloseModalV870 = closeModal;
    closeModal = function(id) {
      if (id === 'companyModalBackdrop') releaseCurrentEditLock();
      return baseCloseModalV870(id);
    };

    const baseSaveCompanyV870 = saveCompany;
    saveCompany = async function(data) {
      const editingExisting = state.data.concedentes.some((company)=>company.id===data.id);
      if (editingExisting && state.activeEditLock && !state.activeEditLock.owned) {
        toast('error','Cadastro bloqueado','Outro usuário está editando este cadastro. Aguarde a liberação.');
        return;
      }
      return baseSaveCompanyV870(data);
    };

    const baseRenderReportsV870 = renderReports;
    renderReports = function() {
      baseRenderReportsV870();
      renderManagementReport();
    };

    const baseRenderAllV870 = renderAll;
    renderAll = function() {
      baseRenderAllV870();
      const active = $('.panel.active')?.id.replace('panel-','') || '';
      if (active === 'relatorios') renderManagementReport();
      if (active === 'saude') renderSystemHealth();
      renderSavedFilterOptions();
      updateBulkToolbar();
    };


    // =====================================================================
    // V8.8.1 — ESTABILIDADE, RECUPERAÇÃO E CLASSIFICAÇÃO JURÍDICA
    // =====================================================================

    state.flowRules = state.flowRules || [];
    state.flowRulesLoading = false;
    state.operators = state.operators || [];
    state.commentCache = state.commentCache || new Map();
    state.myMentions = state.myMentions || [];
    state.goals = state.goals || [];
    state.maintenance = state.maintenance || { ativo:false, mensagem:'', inicioEm:'', fimEm:'' };
    state.undoOperations = state.undoOperations || [];
    state.pendingBulkPreview = null;
    state.pendingDistribution = null;
    state.calendarCursor = state.calendarCursor || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    state.activeLocks = state.activeLocks || [];
    state.globalSearchTimer = null;
    state.supplementalLoadedAt = 0;

    const priorityRankV880 = Object.freeze({ Baixa:1, 'Média':2, Alta:3, Urgente:4 });

    function normalizeTags(value) {
      const source = Array.isArray(value) ? value : String(value || '').split(/[,;|]/);
      return [...new Set(source.map((item)=>String(item || '').trim()).filter(Boolean))]
        .slice(0, 20);
    }

    function addBusinessDaysISO(days = 0, from = new Date()) {
      const date = new Date(from);
      date.setHours(12,0,0,0);
      let remaining = Math.max(0, Number(days || 0));
      while (remaining > 0) {
        date.setDate(date.getDate() + 1);
        if (![0,6].includes(date.getDay())) remaining -= 1;
      }
      return date.toISOString().slice(0,10);
    }

    function latestInteractionDate(company) {
      const values = [];
      (company?.contatos || []).forEach((contact)=>{
        if (contact.data) values.push(new Date(`${contact.data}T${contact.horario || '12:00'}:00`));
      });
      (company?.comunicacoes || []).forEach((communication)=>{
        const raw = communication.confirmadoEm || communication.preparadoEm || communication.criadoEm;
        if (raw) values.push(new Date(raw));
      });
      const valid = values.filter((date)=>!Number.isNaN(date.getTime())).sort((a,b)=>b-a);
      return valid[0] || null;
    }

    function inactivityInfo(company) {
      const last = latestInteractionDate(company);
      if (!last) return { days:null, label:'Nunca contatada', tone:'danger' };
      const now = new Date();
      now.setHours(12,0,0,0);
      const day = new Date(last); day.setHours(12,0,0,0);
      const days = Math.max(0, Math.floor((now - day) / 86400000));
      return {
        days,
        label: days === 0 ? 'Contato hoje' : `Há ${days} dia${days === 1 ? '' : 's'}`,
        tone: days <= 5 ? 'success' : days <= 10 ? 'warning' : 'danger'
      };
    }

    function inactivityBadge(company) {
      const info = inactivityInfo(company);
      const cls = info.tone === 'success' ? 'badge-success' : info.tone === 'warning' ? 'badge-warning' : 'badge-danger';
      return `<span class="badge ${cls}" title="Última interação registrada">${escapeHTML(info.label)}</span>`;
    }

    function maintenanceBlocksWrites() {
      if (!state.maintenance?.ativo || isAdmin()) return false;
      if (state.maintenance.fimEm && new Date(state.maintenance.fimEm) <= new Date()) return false;
      return true;
    }

    function ensureOperationalWrite(action = 'realizar esta alteração') {
      if (!maintenanceBlocksWrites()) return true;
      toast('warning','Sistema em manutenção',state.maintenance.mensagem || `Não é possível ${action} durante a manutenção.`);
      return false;
    }

    function tagBadges(tags = []) {
      const normalized = normalizeTags(tags);
      if (!normalized.length) return '<span class="muted">—</span>';
      return `<div class="tag-cloud">${normalized.map((tag)=>`<span class="workflow-tag">${escapeHTML(tag)}</span>`).join('')}</div>`;
    }

    const baseNormalizeCompanyV880 = normalizeCompany;
    normalizeCompany = function(company) {
      const normalized = baseNormalizeCompanyV880(company);
      return runOptionalFeature('normalização de etiquetas e inatividade', () => {
        normalized.etiquetas = normalizeTags(company?.etiquetas || normalized.etiquetas || []);
        normalized.inatividade = inactivityInfo(normalized);
        return normalized;
      }, normalized);
    };

    function ensureAutomationSuiteUI() {
      if ($('#automationSuiteV880')) return;
      const marker = document.createElement('div');
      marker.id = 'automationSuiteV880';
      marker.hidden = true;
      document.body.appendChild(marker);

      const themeButton = $('#themeToggle');
      if (themeButton && !$('#globalSearchButton')) {
        themeButton.insertAdjacentHTML('beforebegin', '<button class="icon-btn" id="globalSearchButton" type="button" title="Pesquisa global (Ctrl+K)"><i class="fa-solid fa-magnifying-glass"></i></button>');
      }

      const queueNav = $('.nav-item[data-panel="fila"]');
      if (queueNav && !$('.nav-item[data-panel="calendario"]')) {
        queueNav.insertAdjacentHTML('afterend','<button class="nav-item" data-panel="calendario"><i class="fa-solid fa-calendar-days"></i><span class="nav-label">Calendário</span></button>');
      }
      const qualityNav = $('.nav-item[data-panel="qualidade"]');
      if (qualityNav && !$('.nav-item[data-panel="excecoes"]')) {
        qualityNav.insertAdjacentHTML('afterend','<button class="nav-item" data-panel="excecoes"><i class="fa-solid fa-triangle-exclamation"></i><span class="nav-label">Exceções</span></button>');
      }
      const reportsNav = $('.nav-item[data-panel="relatorios"]');
      if (reportsNav && !$('.nav-item[data-panel="metas"]')) {
        reportsNav.insertAdjacentHTML('afterend','<button class="nav-item" data-panel="metas"><i class="fa-solid fa-bullseye"></i><span class="nav-label">Metas</span></button>');
      }

      const panelsHost = $('#panel-dashboard')?.parentElement;
      if (panelsHost && !$('#panel-calendario')) {
        panelsHost.insertAdjacentHTML('beforeend', `
          <section class="panel" id="panel-calendario">
            <div class="panel-header"><div><h2>Calendário de acompanhamentos</h2><p>Próximos contatos, vencimentos e prazos operacionais.</p></div><div class="panel-actions"><button class="btn btn-secondary" id="calendarToday" type="button">Hoje</button><button class="btn btn-secondary btn-icon" id="calendarPrevious" type="button"><i class="fa-solid fa-chevron-left"></i></button><button class="btn btn-secondary btn-icon" id="calendarNext" type="button"><i class="fa-solid fa-chevron-right"></i></button></div></div>
            <div class="card"><div class="workflow-toolbar"><div class="field"><label>Marca</label><select class="form-control" id="calendarBrand"><option value="">Ambas</option><option>Uniasselvi</option><option>Unicesumar</option></select></div><div class="field"><label>Responsável</label><select class="form-control" id="calendarResponsible"><option value="">Todos</option></select></div><div class="field"><label>Pesquisar</label><input class="form-control" id="calendarSearch" placeholder="Concedente, cidade ou ação..." /></div></div><div class="calendar-title" id="calendarTitle"></div><div class="calendar-grid" id="calendarGrid"></div></div>
          </section>
          <section class="panel" id="panel-excecoes">
            <div class="panel-header"><div><h2>Central de exceções</h2><p>Ocorrências cadastrais, operacionais e técnicas que precisam de atenção.</p></div><div class="panel-actions"><button class="btn btn-secondary" id="refreshExceptions" type="button"><i class="fa-solid fa-rotate"></i>Atualizar</button></div></div>
            <div class="workflow-grid" id="exceptionMetrics"></div>
            <div class="card"><div class="workflow-toolbar"><div class="field"><label>Tipo</label><select class="form-control" id="exceptionType"><option value="">Todos</option><option value="prazo">Prazo vencido</option><option value="inatividade">Sem interação</option><option value="cadastro">Cadastro</option><option value="situacao">Situação cadastral</option><option value="edicao">Edição bloqueada</option><option value="backup">Backup</option></select></div><div class="field"><label>Marca</label><select class="form-control" id="exceptionBrand"><option value="">Ambas</option><option>Uniasselvi</option><option>Unicesumar</option></select></div><div class="field"><label>Pesquisar</label><input class="form-control" id="exceptionSearch" placeholder="Empresa, CNPJ ou responsável..." /></div></div><div class="table-wrap"><table class="workflow-table"><thead><tr><th>Severidade</th><th>Concedente</th><th>Marca</th><th>Ocorrência</th><th>Ação</th></tr></thead><tbody id="exceptionTableBody"></tbody></table></div></div>
          </section>
          <section class="panel" id="panel-metas">
            <div class="panel-header"><div><h2>Metas operacionais</h2><p>Acompanhe contatos, renovações e pendências tratadas no mês.</p></div><div class="panel-actions"><input class="form-control" id="goalMonth" type="month" style="max-width:180px"/><button class="btn btn-primary" id="newGoalButton" type="button" data-admin-only><i class="fa-solid fa-plus"></i>Definir meta</button></div></div>
            <div class="workflow-grid" id="goalSummary"></div>
            <div class="card"><div class="table-wrap"><table class="workflow-table"><thead><tr><th>Responsável</th><th>Contatos</th><th>Renovações</th><th>Pendências tratadas</th><th>Progresso geral</th><th data-admin-only>Ação</th></tr></thead><tbody id="goalTableBody"></tbody></table></div></div>
          </section>`);
      }

      const companyGrid = $('#companyForm .form-grid');
      const priorityField = $('#prioridade')?.closest('.field');
      if (companyGrid && priorityField && !$('#etiquetas')) {
        priorityField.insertAdjacentHTML('afterend','<div class="field span-2"><label>Etiquetas</label><input class="form-control" id="etiquetas" placeholder="Ex.: Procon, Urgência jurídica, Grande parceiro"/><span class="field-hint">Separe as etiquetas por vírgula.</span></div>');
      }

      const filtersGrid = $('#filtersCard .filters-grid');
      const filtersActions = filtersGrid?.querySelector('.filters-actions');
      if (filtersGrid && filtersActions && !$('#filterEtiqueta')) {
        filtersActions.insertAdjacentHTML('beforebegin','<div class="field"><label>Etiqueta</label><select class="form-control filter" id="filterEtiqueta"><option value="">Todas</option></select></div><div class="field"><label>Inatividade</label><select class="form-control filter" id="filterInatividade"><option value="">Todas</option><option value="never">Nunca contatada</option><option value="6">6 dias ou mais</option><option value="11">Mais de 10 dias</option></select></div>');
      }

      const bulkToolbar = $('#bulkActionsToolbar');
      if (bulkToolbar && !$('#bulkDistribute')) {
        $('#bulkExportSelected')?.insertAdjacentHTML('afterend','<button class="btn btn-secondary btn-sm" id="bulkDistribute" type="button" data-admin-only><i class="fa-solid fa-people-arrows"></i>Distribuir</button>');
      }

      const settingsGrid = $('#panel-configuracoes .settings-grid');
      if (settingsGrid && !$('#flowRulesSettingsCard')) {
        settingsGrid.insertAdjacentHTML('beforeend', `
          <div class="card settings-wide" id="flowRulesSettingsCard" data-admin-only><div class="card-title"><div><h3>Regras automáticas de fluxo</h3><span>Situação, próxima ação, prazo em dias úteis e escalonamento</span></div><button class="btn btn-primary btn-sm" id="newFlowRule" type="button"><i class="fa-solid fa-plus"></i>Nova regra</button></div><div id="flowRulesList"></div></div>
          <div class="card settings-wide" id="maintenanceSettingsCard" data-admin-only><div class="card-title"><div><h3>Modo de manutenção</h3><span>Bloqueie temporariamente novas alterações durante atualizações</span></div></div><div class="form-grid"><div class="field"><label><input type="checkbox" id="maintenanceActive"/> Ativar modo de manutenção</label></div><div class="field span-2"><label>Mensagem aos operadores</label><input class="form-control" id="maintenanceMessage" placeholder="Sistema em manutenção. Tente novamente em alguns minutos."/></div><div class="field"><label>Encerrar automaticamente em</label><input class="form-control" id="maintenanceEnd" type="datetime-local"/></div></div><div style="margin-top:12px"><button class="btn btn-primary" id="saveMaintenance" type="button"><i class="fa-solid fa-floppy-disk"></i>Salvar configuração</button></div></div>`);
      }

      const notificationsPanel = $('#panel-notificacoes');
      if (notificationsPanel && !$('#internalMentionsCard')) {
        notificationsPanel.insertAdjacentHTML('afterbegin','<div class="card" id="internalMentionsCard" style="margin-bottom:16px"><div class="card-title"><div><h3>Menções internas</h3><span>Comentários nos quais você foi mencionado</span></div><button class="btn btn-secondary btn-sm" id="refreshMentions" type="button"><i class="fa-solid fa-rotate"></i>Atualizar</button></div><div id="internalMentionsList"></div></div>');
      }

      if (!$('#maintenanceBanner')) {
        document.body.insertAdjacentHTML('afterbegin','<div class="maintenance-banner hidden" id="maintenanceBanner"><i class="fa-solid fa-screwdriver-wrench"></i><strong>Modo de manutenção ativo</strong><span id="maintenanceBannerText"></span></div>');
      }
      if (!$('#undoOperationBar')) {
        document.body.insertAdjacentHTML('beforeend','<div class="undo-operation-bar hidden" id="undoOperationBar"><div><strong id="undoOperationTitle">Alteração realizada</strong><span id="undoOperationTime"></span></div><button class="btn btn-secondary btn-sm" id="undoOperationButton" type="button"><i class="fa-solid fa-rotate-left"></i>Desfazer</button><button class="icon-btn" id="dismissUndoOperation" type="button"><i class="fa-solid fa-xmark"></i></button></div>');
      }

      if (!$('#globalSearchBackdrop')) {
        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal-backdrop" id="globalSearchBackdrop" aria-hidden="true"><div class="modal lg"><div class="modal-header"><div><h2>Pesquisa global</h2><p>Concedentes, CNPJ, contatos, observações, etiquetas e comentários.</p></div><button class="modal-close" type="button" data-close="globalSearchBackdrop"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="field"><label>Pesquisar</label><input class="form-control global-search-input" id="globalSearchInput" placeholder="Digite ao menos 2 caracteres..." autocomplete="off"/></div><div id="globalSearchResults" style="margin-top:14px"></div></div></div></div>
          <div class="modal-backdrop" id="flowRuleModalBackdrop" data-admin-only aria-hidden="true"><div class="modal lg"><form id="flowRuleForm"><div class="modal-header"><div><h2>Regra automática</h2><p>Configure a ação que será aplicada ao fluxo.</p></div><button class="modal-close" type="button" data-close="flowRuleModalBackdrop"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><input type="hidden" id="flowRuleId"/><div class="form-grid"><div class="field span-2"><label>Nome</label><input class="form-control" id="flowRuleName" required/></div><div class="field"><label>Evento</label><select class="form-control" id="flowRuleEvent"><option value="email_enviado">E-mail confirmado como enviado</option><option value="situacao_alterada">Situação alterada</option><option value="prazo_atrasado">Prazo atrasado</option></select></div><div class="field"><label>Marca</label><select class="form-control" id="flowRuleBrand"><option value="">Ambas</option><option>Uniasselvi</option><option>Unicesumar</option></select></div><div class="field"><label>Situação de origem</label><select class="form-control" id="flowRuleOrigin"><option value="">Qualquer situação</option>${situacoesContato.map((item)=>`<option>${escapeHTML(item)}</option>`).join('')}</select></div><div class="field"><label>Situação de destino</label><select class="form-control" id="flowRuleDestination"><option value="">Não alterar</option>${situacoesContato.map((item)=>`<option>${escapeHTML(item)}</option>`).join('')}</select></div><div class="field span-2"><label>Próxima ação</label><input class="form-control" id="flowRuleNextAction"/></div><div class="field"><label>Dias úteis para o próximo contato</label><input class="form-control" id="flowRuleBusinessDays" type="number" min="0" max="365" value="0"/></div><div class="field"><label>Aplicar após quantos dias de atraso</label><input class="form-control" id="flowRuleOverdueDays" type="number" min="0" max="365" value="0"/></div><div class="field"><label>Prioridade de destino</label><select class="form-control" id="flowRulePriority"><option value="">Não alterar</option><option>Baixa</option><option>Média</option><option>Alta</option><option>Urgente</option></select></div><div class="field"><label><input type="checkbox" id="flowRuleActive" checked/> Regra ativa</label></div></div></div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-close="flowRuleModalBackdrop">Cancelar</button><button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i>Salvar regra</button></div></form></div></div>
          <div class="modal-backdrop" id="bulkPreviewBackdrop" aria-hidden="true"><div class="modal lg"><div class="modal-header"><div><h2>Revisar alterações</h2><p>Confira o impacto antes de confirmar.</p></div><button class="modal-close" type="button" data-close="bulkPreviewBackdrop"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body" id="bulkPreviewBody"></div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-close="bulkPreviewBackdrop">Voltar</button><button class="btn btn-primary" id="confirmBulkPreview" type="button"><i class="fa-solid fa-check"></i>Confirmar alterações</button></div></div></div>
          <div class="modal-backdrop" id="distributionBackdrop" data-admin-only aria-hidden="true"><div class="modal lg"><form id="distributionForm"><div class="modal-header"><div><h2>Distribuir trabalho</h2><p>Distribuição equilibrada conforme a carga atual.</p></div><button class="modal-close" type="button" data-close="distributionBackdrop"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="summary-box" id="distributionSummary"></div><div class="field" style="margin-top:14px"><label>Responsáveis participantes</label><div class="checkbox-grid" id="distributionUsers"></div></div><div id="distributionPreview" style="margin-top:14px"></div></div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-close="distributionBackdrop">Cancelar</button><button class="btn btn-primary" type="submit"><i class="fa-solid fa-people-arrows"></i>Distribuir</button></div></form></div></div>
          <div class="modal-backdrop" id="goalModalBackdrop" data-admin-only aria-hidden="true"><div class="modal"><form id="goalForm"><div class="modal-header"><div><h2>Definir meta operacional</h2><p>Metas mensais por usuário ou equipe.</p></div><button class="modal-close" type="button" data-close="goalModalBackdrop"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="form-grid"><div class="field"><label>Competência</label><input class="form-control" id="goalCompetence" type="month" required/></div><div class="field"><label>Escopo</label><select class="form-control" id="goalScope"><option value="usuario">Usuário</option><option value="equipe">Equipe</option></select></div><div class="field span-2"><label>Usuário</label><select class="form-control" id="goalUser"></select></div><div class="field"><label>Meta de contatos</label><input class="form-control" id="goalContacts" type="number" min="0" value="0"/></div><div class="field"><label>Meta de renovações</label><input class="form-control" id="goalRenewals" type="number" min="0" value="0"/></div><div class="field"><label>Meta de pendências tratadas</label><input class="form-control" id="goalResolved" type="number" min="0" value="0"/></div></div></div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-close="goalModalBackdrop">Cancelar</button><button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i>Salvar meta</button></div></form></div></div>`);
      }

      const style = document.createElement('style');
      style.id = 'automationSuiteStylesV880';
      style.textContent = `
        .tag-cloud{display:flex;gap:5px;flex-wrap:wrap}.workflow-tag{display:inline-flex;padding:3px 8px;border-radius:999px;background:rgba(29,25,52,.09);font-size:11px;font-weight:700}.maintenance-banner{position:fixed;top:0;left:0;right:0;z-index:9999;background:#7c2d12;color:#fff;padding:8px 18px;display:flex;gap:10px;align-items:center;justify-content:center}.maintenance-banner.hidden{display:none}.maintenance-banner:not(.hidden)~* .topbar{margin-top:36px}.undo-operation-bar{position:fixed;right:20px;bottom:20px;z-index:9999;background:var(--surface);border:1px solid var(--border);box-shadow:0 15px 40px rgba(15,23,42,.22);padding:12px 14px;border-radius:14px;display:flex;align-items:center;gap:12px;max-width:520px}.undo-operation-bar.hidden{display:none}.undo-operation-bar>div{display:grid;gap:2px}.undo-operation-bar span{font-size:12px;color:var(--muted)}.global-result{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;padding:10px;border-bottom:1px solid var(--border)}.global-result:last-child{border-bottom:0}.global-result-icon{width:32px;height:32px;border-radius:10px;background:rgba(29,25,52,.08);display:grid;place-items:center}.comment-card{padding:12px;border:1px solid var(--border);border-radius:12px;margin-top:8px}.comment-meta{display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:11px}.comment-body{white-space:pre-wrap;margin-top:7px}.mention-options{display:flex;gap:8px;flex-wrap:wrap;max-height:110px;overflow:auto}.mention-option{font-size:12px;border:1px solid var(--border);padding:6px 8px;border-radius:9px}.calendar-title{text-align:center;font-weight:800;font-size:18px;margin:15px 0}.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(120px,1fr));border:1px solid var(--border);border-radius:12px;overflow:auto}.calendar-weekday{padding:8px;text-align:center;background:rgba(29,25,52,.06);font-size:12px;font-weight:800}.calendar-day{min-height:115px;padding:7px;border-top:1px solid var(--border);border-right:1px solid var(--border)}.calendar-day.outside{opacity:.45}.calendar-day-number{font-size:12px;font-weight:800}.calendar-event{display:block;width:100%;border:0;text-align:left;padding:4px 6px;margin-top:5px;border-radius:7px;font-size:10px;cursor:pointer;background:rgba(29,25,52,.1);color:var(--text)}.calendar-event.deadline{background:rgba(255,198,41,.28)}.progress-track{height:7px;background:rgba(148,163,184,.22);border-radius:999px;overflow:hidden}.progress-track>span{display:block;height:100%;background:currentColor;border-radius:999px}.exception-high{color:#b91c1c;font-weight:800}.exception-medium{color:#b45309;font-weight:800}.exception-low{color:#0369a1;font-weight:800}.read-only-maintenance{opacity:.65;pointer-events:none}.workflow-rule-row{display:grid;grid-template-columns:1.3fr .9fr 1fr 1fr auto;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)}@media(max-width:900px){.calendar-grid{grid-template-columns:repeat(7,minmax(105px,1fr))}.workflow-rule-row{grid-template-columns:1fr}}`;
      document.head.appendChild(style);
    }

    function renderMaintenanceMode() {
      const active = Boolean(state.maintenance?.ativo && (!state.maintenance.fimEm || new Date(state.maintenance.fimEm) > new Date()));
      const banner = $('#maintenanceBanner');
      banner?.classList.toggle('hidden', !active);
      if ($('#maintenanceBannerText')) $('#maintenanceBannerText').textContent = state.maintenance.mensagem || 'Alterações temporariamente bloqueadas para operadores.';
      if ($('#maintenanceActive')) $('#maintenanceActive').checked = active;
      if ($('#maintenanceMessage')) $('#maintenanceMessage').value = state.maintenance.mensagem || '';
      if ($('#maintenanceEnd')) $('#maintenanceEnd').value = state.maintenance.fimEm ? new Date(state.maintenance.fimEm).toISOString().slice(0,16) : '';
      document.body.dataset.maintenance = active ? 'true' : 'false';
      const maintenanceControls = $$('button[type="submit"],.action-edit,.action-delete,.action-contact,.action-renew,[data-queue-contact],[data-queue-email],[data-bulk-company],#bulkOpenActions,#bulkDistribute,#newCompanyBtn');
      if (active && !isAdmin()) {
        maintenanceControls.forEach((element)=>{
          if (!element.disabled) element.dataset.maintenanceDisabled = 'true';
          element.disabled = true;
          element.title = 'Indisponível durante o modo de manutenção';
        });
      } else {
        maintenanceControls.forEach((element)=>{
          if (element.dataset.maintenanceDisabled === 'true') {
            element.disabled = false;
            delete element.dataset.maintenanceDisabled;
            if (element.title === 'Indisponível durante o modo de manutenção') element.removeAttribute('title');
          }
        });
      }
    }

    async function loadMaintenanceConfiguration() {
      if (!window.currentUser?.id || !window.remoteData?.getSystemConfiguration) return;
      try {
        const config = await window.remoteData.getSystemConfiguration('manutencao');
        const value = config?.valor || {};
        state.maintenance = {
          ativo: Boolean(value.ativo),
          mensagem: value.mensagem || '',
          inicioEm: value.inicioEm || '',
          fimEm: value.fimEm || ''
        };
      } catch (error) {
        console.warn('[Manutenção]',error);
      }
      renderMaintenanceMode();
    }

    async function saveMaintenanceConfiguration() {
      if (!ensureAdmin('alterar o modo de manutenção')) return;
      const active = Boolean($('#maintenanceActive')?.checked);
      const value = {
        ativo: active,
        mensagem: String($('#maintenanceMessage')?.value || '').trim(),
        inicioEm: active ? new Date().toISOString() : '',
        fimEm: $('#maintenanceEnd')?.value ? new Date($('#maintenanceEnd').value).toISOString() : ''
      };
      confirmAction(active ? 'Ativar modo de manutenção' : 'Desativar modo de manutenção',active ? 'Operadores poderão consultar os dados, mas novos salvamentos serão bloqueados. Confirmar?' : 'Deseja liberar novamente as alterações para os operadores?',async()=>{
        try {
          await window.remoteData.setSystemConfiguration('manutencao', value);
          state.maintenance = value;
          renderMaintenanceMode();
          toast('success','Configuração salva',active ? 'Modo de manutenção ativado.' : 'Modo de manutenção desativado.');
        } catch (error) {
          toast('error','Falha ao salvar',error.message || 'Não foi possível alterar o modo de manutenção.');
        }
      }, active);
    }

    async function loadFlowRules({ silent = true } = {}) {
      if (!window.currentUser?.id || !window.remoteData?.listFlowRules || state.flowRulesLoading) return;
      state.flowRulesLoading = true;
      try { state.flowRules = await window.remoteData.listFlowRules(); }
      catch (error) { if (!silent) toast('warning','Regras indisponíveis',error.message); }
      finally { state.flowRulesLoading = false; renderFlowRulesSettings(); }
    }

    function renderFlowRulesSettings() {
      const host = $('#flowRulesList');
      if (!host) return;
      host.innerHTML = state.flowRules.length ? state.flowRules.map((rule)=>`<div class="workflow-rule-row"><div><strong>${escapeHTML(rule.nome)}</strong><small style="display:block;color:var(--muted)">${escapeHTML(rule.marca || 'Ambas as marcas')}</small></div><span>${escapeHTML(rule.evento.replaceAll('_',' '))}</span><span>${escapeHTML(rule.situacaoOrigem || 'Qualquer situação')} → ${escapeHTML(rule.situacaoDestino || 'Sem alteração')}</span><span>${rule.evento === 'prazo_atrasado' ? `${rule.diasAtraso} dia(s) de atraso` : `${rule.diasUteis} dia(s) útil(eis)`}${rule.prioridadeDestino ? ` • ${escapeHTML(rule.prioridadeDestino)}` : ''}</span><div class="actions-cell"><button class="btn btn-secondary btn-icon" data-edit-flow-rule="${rule.id}" title="Editar"><i class="fa-solid fa-pen"></i></button><button class="btn btn-danger btn-icon" data-delete-flow-rule="${rule.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button></div></div>`).join('') : emptyState('Nenhuma regra cadastrada','Crie regras para automatizar situação, ação, prazo e prioridade.');
    }

    function openFlowRuleEditor(id = '') {
      const rule = state.flowRules.find((item)=>item.id === id) || {};
      $('#flowRuleForm')?.reset();
      $('#flowRuleId').value = rule.id || '';
      $('#flowRuleName').value = rule.nome || '';
      $('#flowRuleEvent').value = rule.evento || 'email_enviado';
      $('#flowRuleBrand').value = rule.marca || '';
      $('#flowRuleOrigin').value = rule.situacaoOrigem || '';
      $('#flowRuleDestination').value = rule.situacaoDestino || '';
      $('#flowRuleNextAction').value = rule.proximaAcao || '';
      $('#flowRuleBusinessDays').value = Number(rule.diasUteis || 0);
      $('#flowRuleOverdueDays').value = Number(rule.diasAtraso || 0);
      $('#flowRulePriority').value = rule.prioridadeDestino || '';
      $('#flowRuleActive').checked = rule.ativo !== false;
      openModal('flowRuleModalBackdrop');
    }

    async function saveFlowRuleEditor(event) {
      event.preventDefault();
      if (!ensureAdmin('salvar regras automáticas')) return;
      try {
        const saved = await window.remoteData.saveFlowRule({
          id: $('#flowRuleId').value,
          nome: $('#flowRuleName').value,
          evento: $('#flowRuleEvent').value,
          marca: $('#flowRuleBrand').value,
          situacaoOrigem: $('#flowRuleOrigin').value,
          situacaoDestino: $('#flowRuleDestination').value,
          proximaAcao: $('#flowRuleNextAction').value,
          diasUteis: $('#flowRuleBusinessDays').value,
          diasAtraso: $('#flowRuleOverdueDays').value,
          prioridadeDestino: $('#flowRulePriority').value,
          ativo: $('#flowRuleActive').checked
        });
        const index = state.flowRules.findIndex((item)=>item.id === saved.id);
        if (index >= 0) state.flowRules[index] = saved; else state.flowRules.push(saved);
        closeModal('flowRuleModalBackdrop');
        renderFlowRulesSettings();
        toast('success','Regra salva','A automação foi atualizada.');
      } catch (error) { toast('error','Falha ao salvar regra',error.message); }
    }

    function matchingFlowRule(eventName, company, originStatus = '') {
      const brand = normalizeBrand(company?.marca);
      const candidates = state.flowRules.filter((rule)=>rule.ativo && rule.evento === eventName && (!rule.marca || rule.marca === brand) && (!rule.situacaoOrigem || rule.situacaoOrigem === originStatus));
      return candidates.sort((a,b)=>(b.diasAtraso || 0) - (a.diasAtraso || 0))[0] || null;
    }

    async function applyAutomaticFlowRule(company, eventName, originStatus = '') {
      const rule = matchingFlowRule(eventName, company, originStatus);
      if (!rule || !company) return false;
      const latest = latestContact(company);
      const nextDate = Number(rule.diasUteis || 0) > 0 ? addBusinessDaysISO(rule.diasUteis) : latest?.proximaData || '';
      if (latest && (rule.situacaoDestino || rule.proximaAcao || nextDate)) {
        const changed = {
          ...latest,
          resultado: rule.situacaoDestino || latest.resultado || company.situacao,
          proximaAcao: rule.proximaAcao || latest.proximaAcao || '',
          proximaData: nextDate
        };
        const saved = await window.remoteData.updateContact(company.id, changed, company);
        const index = company.contatos.findIndex((item)=>item.id === saved.id);
        if (index >= 0) company.contatos[index] = saved;
        company.situacao = saved.resultado || company.situacao;
      } else if (rule.situacaoDestino) {
        await window.remoteData.updateCompanyManagement(company.id,{ situacao:rule.situacaoDestino });
        company.situacao = rule.situacaoDestino;
      }
      if (rule.prioridadeDestino && priorityRankV880[rule.prioridadeDestino] > priorityRankV880[company.prioridade || 'Média']) {
        await window.remoteData.updateCompanyManagement(company.id,{ prioridade:rule.prioridadeDestino });
        company.prioridade = rule.prioridadeDestino;
      }
      return true;
    }

    async function evaluateEscalationRules() {
      if (!isAdmin() || !state.flowRules.length || !window.currentUser?.id) return;
      const stamp = todayISO();
      if (localStorage.getItem('cloudconvenios_escalation_check') === stamp) return;
      const overdueRules = state.flowRules.filter((rule)=>rule.ativo && rule.evento === 'prazo_atrasado').sort((a,b)=>b.diasAtraso-a.diasAtraso);
      if (!overdueRules.length) return;
      let updated = 0;
      for (const company of state.data.concedentes.map(normalizeCompany)) {
        if (!company.proximaData || company.proximaData >= stamp) continue;
        const overdue = Math.max(1, daysBetween(parseDate(company.proximaData), parseDate(stamp)));
        const rule = overdueRules.find((item)=>overdue >= Number(item.diasAtraso || 0) && (!item.marca || item.marca === company.marca));
        if (!rule?.prioridadeDestino || priorityRankV880[rule.prioridadeDestino] <= priorityRankV880[company.prioridade || 'Média']) continue;
        try {
          await window.remoteData.updateCompanyManagement(company.id,{ prioridade:rule.prioridadeDestino });
          company.prioridade = rule.prioridadeDestino;
          updated += 1;
        } catch (error) { console.warn('[Escalonamento]',company.id,error); }
      }
      localStorage.setItem('cloudconvenios_escalation_check',stamp);
      if (updated) await loadRemoteData({silent:true});
    }

    async function loadOperators() {
      if (!window.currentUser?.id || !window.remoteData?.listActiveOperators) return;
      try { state.operators = await window.remoteData.listActiveOperators(); }
      catch (error) { console.warn('[Operadores]',error); }
      renderOperatorOptions();
    }

    function renderOperatorOptions() {
      const options = state.operators.map((user)=>`<option value="${escapeHTML(user.id)}">${escapeHTML(user.nome)}${user.email ? ` — ${escapeHTML(user.email)}` : ''}</option>`).join('');
      if ($('#goalUser')) $('#goalUser').innerHTML = options;
      const mentionHost = $('#commentMentionOptions');
      if (mentionHost) mentionHost.innerHTML = state.operators.filter((user)=>user.email && user.id !== window.currentUser?.id).map((user)=>`<label class="mention-option"><input type="checkbox" name="commentMention" value="${escapeHTML(user.email.toLowerCase())}"/> @${escapeHTML(user.nome || user.email)}</label>`).join('') || '<span class="muted">Nenhum outro usuário disponível.</span>';
      const responsibleValues = [...new Set(state.operators.map((user)=>user.nome).filter(Boolean))];
      const select = $('#calendarResponsible');
      if (select) select.innerHTML = '<option value="">Todos</option>' + responsibleValues.map((name)=>`<option>${escapeHTML(name)}</option>`).join('');
    }

    async function renderCompanyComments(companyId) {
      const host = $('#companyInternalComments');
      if (!host) return;
      host.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><strong>Carregando comentários...</strong></div>';
      try {
        const comments = await window.remoteData.listCompanyComments(companyId);
        state.commentCache.set(companyId, comments);
        host.innerHTML = comments.length ? comments.map((comment)=>`<div class="comment-card"><div class="comment-meta"><span><strong>${escapeHTML(comment.usuarioNome || comment.usuarioEmail || 'Usuário')}</strong>${comment.mencoes.length ? ` • menciona ${comment.mencoes.map((item)=>escapeHTML(item)).join(', ')}` : ''}</span><span>${new Date(comment.createdAt).toLocaleString('pt-BR')}</span></div><div class="comment-body">${escapeHTML(comment.texto)}</div>${comment.usuarioId === window.currentUser?.id || isAdmin() ? `<div style="margin-top:7px;text-align:right"><button class="btn btn-danger btn-sm" data-delete-comment="${comment.id}" data-company-id="${companyId}"><i class="fa-solid fa-trash"></i>Excluir</button></div>` : ''}</div>`).join('') : emptyState('Nenhum comentário interno','Registre uma orientação ou mencione outro usuário.');
      } catch (error) { host.innerHTML = `<div class="summary-box">${escapeHTML(error.message || 'Não foi possível carregar os comentários.')}</div>`; }
    }

    async function saveInternalComment(event) {
      event.preventDefault();
      if (!ensureOperationalWrite('registrar comentários')) return;
      const companyId = $('#internalCommentCompanyId')?.value;
      const text = String($('#internalCommentText')?.value || '').trim();
      const mentions = $$('input[name="commentMention"]:checked').map((input)=>input.value);
      try {
        await window.remoteData.createInternalComment(companyId,{ texto:text, mencoes:mentions });
        $('#internalCommentText').value = '';
        $$('input[name="commentMention"]:checked').forEach((input)=>{input.checked=false;});
        await renderCompanyComments(companyId);
        toast('success','Comentário registrado',mentions.length ? 'Os usuários mencionados verão o recado nas notificações.' : 'O comentário foi adicionado ao histórico interno.');
      } catch (error) { toast('error','Falha ao comentar',error.message); }
    }

    async function loadMyMentions() {
      if (!window.currentUser?.id || !window.remoteData?.listMyMentions) return;
      try { state.myMentions = await window.remoteData.listMyMentions(); }
      catch (error) { console.warn('[Menções]',error); state.myMentions = []; }
      renderMyMentions();
    }

    function renderMyMentions() {
      const host = $('#internalMentionsList');
      if (!host) return;
      host.innerHTML = state.myMentions.length ? state.myMentions.map((mention)=>`<div class="list-row"><span class="list-dot" style="background:${mention.lida ? '#94a3b8' : '#f59e0b'}"></span><div class="list-main"><strong>${escapeHTML(mention.company?.nomeFantasia || mention.company?.razaoSocial || 'Concedente')}</strong><small>${escapeHTML(mention.usuarioNome || 'Usuário')} • ${new Date(mention.createdAt).toLocaleString('pt-BR')}</small><span>${escapeHTML(mention.texto)}</span></div><div class="actions-cell"><button class="btn btn-secondary btn-sm" data-open-mention-company="${mention.companyId}">Abrir</button>${mention.lida ? '' : `<button class="btn btn-primary btn-sm" data-read-mention="${mention.id}">Marcar lida</button>`}</div></div>`).join('') : emptyState('Nenhuma menção','Você não possui comentários internos pendentes.');
    }

    async function runGlobalSearch() {
      const term = String($('#globalSearchInput')?.value || '').trim();
      const host = $('#globalSearchResults');
      if (!host) return;
      if (term.length < 2) { host.innerHTML = emptyState('Digite ao menos 2 caracteres','A busca consulta cadastros, contatos, etiquetas e comentários.'); return; }
      const q = normalize(term);
      const results = [];
      state.data.concedentes.map(normalizeCompany).forEach((company)=>{
        const companyHay = normalize([company.cnpj,company.razaoSocial,company.nomeFantasia,company.marca,company.estado,company.cidade,company.polo,company.email,company.telefone,company.responsavelAcompanhamento,company.observacoes,(company.etiquetas||[]).join(' ')].join(' '));
        if (companyHay.includes(q)) results.push({type:'Concedente',icon:'fa-building',companyId:company.id,title:company.nomeFantasia||company.razaoSocial,subtitle:`${company.cnpj || 'Sem CNPJ'} • ${company.marca || 'Sem marca'}`});
        (company.contatos || []).forEach((contact)=>{
          const hay = normalize([contact.responsavel,contact.forma,contact.pessoa,contact.resultado,contact.proximaAcao,contact.observacoes].join(' '));
          if (hay.includes(q)) results.push({type:'Contato',icon:'fa-phone',companyId:company.id,title:company.nomeFantasia||company.razaoSocial,subtitle:`${formatDate(contact.data)} • ${contact.resultado || contact.forma}`});
        });
      });
      try {
        const comments = await window.remoteData.searchInternalComments(term);
        comments.forEach((comment)=>results.push({type:'Comentário',icon:'fa-comments',companyId:comment.companyId,title:comment.company?.nomeFantasia||comment.company?.razaoSocial||'Concedente',subtitle:`${comment.usuarioNome || 'Usuário'} • ${String(comment.texto).slice(0,120)}`}));
      } catch (error) { console.warn('[Pesquisa de comentários]',error); }
      const unique = results.filter((item,index,array)=>array.findIndex((other)=>other.type===item.type&&other.companyId===item.companyId&&other.subtitle===item.subtitle)===index).slice(0,60);
      host.innerHTML = unique.length ? `<div class="card">${unique.map((item)=>`<button class="global-result" data-global-company="${item.companyId}" type="button"><span class="global-result-icon"><i class="fa-solid ${item.icon}"></i></span><span style="text-align:left"><strong>${escapeHTML(item.title)}</strong><small style="display:block;color:var(--muted)">${escapeHTML(item.type)} • ${escapeHTML(item.subtitle)}</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join('')}</div>` : emptyState('Nenhum resultado','Tente outro CNPJ, nome, etiqueta, contato ou comentário.');
    }

    function updateTagFilterOptions() {
      const select = $('#filterEtiqueta');
      if (!select) return;
      const current = select.value;
      const tags = [...new Set(state.data.concedentes.flatMap((company)=>normalizeTags(company.etiquetas)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
      select.innerHTML = '<option value="">Todas</option>' + tags.map((tag)=>`<option ${tag===current?'selected':''}>${escapeHTML(tag)}</option>`).join('');
    }

    const baseResetCompanyFormV880 = resetCompanyForm;
    resetCompanyForm = function() {
      baseResetCompanyFormV880();
      if ($('#etiquetas')) $('#etiquetas').value = '';
      if ($('#tipoNatureza')) $('#tipoNatureza').value = 'Não identificado';
    };

    const baseOpenCompanyFormV880 = openCompanyForm;
    openCompanyForm = function(id = null, preset = null) {
      baseOpenCompanyFormV880(id,preset);
      const company = id ? state.data.concedentes.find((item)=>item.id===id) : preset;
      if ($('#etiquetas')) $('#etiquetas').value = normalizeTags(company?.etiquetas).join(', ');
      if ($('#tipoNatureza')) $('#tipoNatureza').value = legalNatureType(company?.tipoNatureza || company?.tipo_natureza || '', company?.naturezaJuridica || '');
    };

    const baseGetCompanyFormDataV880 = getCompanyFormData;
    getCompanyFormData = function() {
      const data = baseGetCompanyFormDataV880();
      data.etiquetas = normalizeTags($('#etiquetas')?.value || '');
      data.tipoNatureza = legalNatureType($('#tipoNatureza')?.value || '', data.naturezaJuridica || '');
      return normalizeCompany(data);
    };

    const baseUpdateFilterOptionsV880 = updateFilterOptions;
    updateFilterOptions = function() {
      baseUpdateFilterOptionsV880();
      runOptionalFeature('filtro de etiquetas', updateTagFilterOptions);
    };

    const baseGetFilteredCompaniesV880 = getFilteredCompanies;
    getFilteredCompanies = function() {
      const baseRows = baseGetFilteredCompaniesV880();
      return runOptionalFeature('filtros de etiqueta e inatividade', () => {
        let rows = baseRows;
        const tag = $('#filterEtiqueta')?.value || '';
        const inactivity = $('#filterInatividade')?.value || '';
        if (tag) rows = rows.filter((company)=>normalizeTags(company.etiquetas).includes(tag));
        if (inactivity === 'never') rows = rows.filter((company)=>inactivityInfo(company).days === null);
        if (inactivity === '6') rows = rows.filter((company)=>inactivityInfo(company).days !== null && inactivityInfo(company).days >= 6);
        if (inactivity === '11') rows = rows.filter((company)=>inactivityInfo(company).days !== null && inactivityInfo(company).days > 10);
        return rows;
      }, baseRows);
    };

    function enhanceCompanyTableV880() {
      const table = $('#companiesTableBody')?.closest('table');
      const header = table?.querySelector('thead tr');
      if (!header) return;
      const actionHeader = header.lastElementChild;
      if (!header.querySelector('[data-v880="tags"]')) actionHeader?.insertAdjacentHTML('beforebegin','<th data-v880="tags">Etiquetas</th><th data-v880="inactivity">Inatividade</th>');
      const rows = currentCompanyPageRows();
      $$('#companiesTableBody tr').forEach((row,index)=>{
        const company = rows[index];
        if (!company || row.children.length <= 1 || row.querySelector('[data-v880-cell="tags"]')) return;
        const action = row.lastElementChild;
        action?.insertAdjacentHTML('beforebegin',`<td data-v880-cell="tags">${tagBadges(company.etiquetas)}</td><td data-v880-cell="inactivity">${inactivityBadge(company)}</td>`);
      });
    }

    const baseRenderCompaniesV880 = renderCompanies;
    renderCompanies = function() {
      baseRenderCompaniesV880();
      runOptionalFeature('etiquetas e inatividade na tabela', enhanceCompanyTableV880);
    };

    const baseViewCompanyV880 = viewCompany;
    viewCompany = function(id) {
      baseViewCompanyV880(id);
      runOptionalFeature('comentários, etiquetas e inatividade', () => {
        const company = state.data.concedentes.find((item)=>item.id===id);
        if (!company) return;
        const host = $('#viewModalBody');
        if (!host) return;
        host.insertAdjacentHTML('beforeend',`<div class="card" style="margin-top:18px"><div class="card-title"><div><h3>Etiquetas e inatividade</h3><span>Classificação e tempo desde a última interação</span></div></div><div class="detail-grid"><div class="detail-item"><span>Etiquetas</span><strong>${tagBadges(company.etiquetas)}</strong></div><div class="detail-item"><span>Última interação</span><strong>${inactivityBadge(company)}</strong></div></div></div><div class="card" style="margin-top:18px"><div class="card-title"><div><h3>Comentários internos</h3><span>Orientações e menções entre os usuários</span></div></div>${canEdit() && !maintenanceBlocksWrites() ? `<form id="internalCommentForm"><input type="hidden" id="internalCommentCompanyId" value="${company.id}"/><div class="field"><label>Comentário</label><textarea class="form-control" id="internalCommentText" rows="3" required placeholder="Registre uma orientação interna..."></textarea></div><div class="field" style="margin-top:8px"><label>Mencionar usuários</label><div class="mention-options" id="commentMentionOptions"></div></div><div style="margin-top:8px;text-align:right"><button class="btn btn-primary btn-sm" type="submit"><i class="fa-solid fa-comment"></i>Registrar comentário</button></div></form>` : ''}<div id="companyInternalComments" style="margin-top:12px"></div></div>`);
        renderOperatorOptions();
        renderCompanyComments(id);
      });
    };

    function buildBulkPreview(ids,payload) {
      const companies = state.data.concedentes.filter((company)=>ids.includes(company.id));
      const changes = [];
      if (payload.responsavelAcompanhamento) changes.push(['Responsável',payload.responsavelAcompanhamento === '__CLEAR__' ? 'Sem responsável' : payload.responsavelAcompanhamento]);
      if (payload.prioridade) changes.push(['Prioridade',payload.prioridade]);
      if (payload.situacao) changes.push(['Situação',payload.situacao]);
      if (payload.proximaAcao) changes.push(['Próxima ação',payload.proximaAcao]);
      if (payload.proximaData) changes.push(['Próximo contato',formatDate(payload.proximaData)]);
      return `<div class="workflow-grid"><div class="workflow-card"><span>Concedentes afetadas</span><strong>${companies.length}</strong></div><div class="workflow-card"><span>Campos alterados</span><strong>${changes.length}</strong></div></div><div class="summary-box" style="margin-top:12px"><i class="fa-solid fa-circle-info"></i>${changes.map(([label,value])=>`<strong>${escapeHTML(label)}:</strong> ${escapeHTML(value)}`).join(' • ')}</div><div class="table-wrap" style="margin-top:12px"><table class="workflow-table"><thead><tr><th>Concedente</th><th>Marca</th><th>Responsável atual</th><th>Prioridade atual</th><th>Situação atual</th></tr></thead><tbody>${companies.slice(0,50).map((company)=>`<tr><td>${escapeHTML(company.nomeFantasia||company.razaoSocial)}</td><td>${escapeHTML(company.marca||'—')}</td><td>${escapeHTML(company.responsavelAcompanhamento||'Sem responsável')}</td><td>${escapeHTML(company.prioridade||'Média')}</td><td>${escapeHTML(company.situacao||'—')}</td></tr>`).join('')}</tbody></table></div>${companies.length>50?`<div class="summary-box">Prévia limitada aos primeiros 50 registros de ${companies.length}.</div>`:''}`;
    }

    async function performBulkActionsV880(ids,payload) {
      const button = $('#confirmBulkPreview');
      if (button) { button.disabled=true; button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i>Aplicando…'; }
      let operationId = null;
      try {
        operationId = await window.remoteData.registerUndoOperation('acao_em_massa',`Ações em massa em ${ids.length} concedente(s)`,ids,10);
        const result = await window.remoteData.bulkUpdateCompanies(ids,payload);
        closeModal('bulkPreviewBackdrop'); closeModal('bulkActionModalBackdrop');
        state.bulkSelectedIds.clear();
        await loadRemoteData({silent:true});
        await loadUndoOperations(operationId);
        toast('success','Ações concluídas',`${Number(result?.updated || ids.length)} concedente(s) atualizada(s).`);
      } catch (error) {
        if (operationId) window.remoteData.deleteUndoOperation(operationId).catch(()=>{});
        toast('error','Falha nas ações em massa',error.message || 'Não foi possível atualizar os registros.');
      } finally { if (button) { button.disabled=false; button.innerHTML='<i class="fa-solid fa-check"></i>Confirmar alterações'; } }
    }

    applyBulkActions = async function(event) {
      event.preventDefault();
      if (!ensureOperationalWrite('aplicar ações em massa') || !canEdit()) return;
      const ids = [...state.bulkSelectedIds];
      if (!ids.length) return;
      const responsibleRaw = String($('#bulkResponsible')?.value || '').trim();
      const payload = {
        responsavelAcompanhamento: normalize(responsibleRaw) === 'sem responsavel' ? '__CLEAR__' : responsibleRaw,
        prioridade: $('#bulkPriority')?.value || '',
        situacao: $('#bulkStatus')?.value || '',
        proximaAcao: String($('#bulkNextAction')?.value || '').trim(),
        proximaData: $('#bulkNextDate')?.value || ''
      };
      if (!Object.values(payload).some(Boolean)) { toast('warning','Nenhuma alteração','Preencha ao menos um campo.'); return; }
      state.pendingBulkPreview = { ids,payload };
      $('#bulkPreviewBody').innerHTML = buildBulkPreview(ids,payload);
      openModal('bulkPreviewBackdrop');
    };

    async function openDistribution() {
      if (!ensureAdmin('distribuir concedentes') || !ensureOperationalWrite('distribuir concedentes')) return;
      const ids = [...state.bulkSelectedIds];
      if (!ids.length) { toast('warning','Nenhuma seleção','Selecione as concedentes que serão distribuídas.'); return; }
      await loadOperators();
      const host = $('#distributionUsers');
      host.innerHTML = state.operators.map((user)=>`<label class="check-option"><input type="checkbox" name="distributionUser" value="${user.id}" checked/> ${escapeHTML(user.nome)}</label>`).join('') || '<span>Nenhum usuário ativo.</span>';
      $('#distributionSummary').innerHTML = `<i class="fa-solid fa-people-arrows"></i><strong>${ids.length}</strong> concedente(s) selecionada(s). A distribuição considerará a carga atual de cada responsável.`;
      $('#distributionPreview').innerHTML = '';
      openModal('distributionBackdrop');
    }

    function calculateBalancedDistribution(ids,userIds) {
      const users = state.operators.filter((user)=>userIds.includes(user.id));
      const workload = new Map(users.map((user)=>[user.id,state.data.concedentes.filter((company)=>normalize(company.responsavelAcompanhamento)===normalize(user.nome)).length]));
      const assignment = new Map(users.map((user)=>[user.id,[]]));
      const companies = state.data.concedentes.filter((company)=>ids.includes(company.id)).sort((a,b)=>(priorityRankV880[b.prioridade]||2)-(priorityRankV880[a.prioridade]||2));
      companies.forEach((company)=>{
        const user = [...users].sort((a,b)=>(workload.get(a.id)||0)-(workload.get(b.id)||0))[0];
        if (!user) return;
        assignment.get(user.id).push(company.id);
        workload.set(user.id,(workload.get(user.id)||0)+1);
      });
      return { users,assignment,workload };
    }

    async function submitDistribution(event) {
      event.preventDefault();
      const ids = [...state.bulkSelectedIds];
      const userIds = $$('input[name="distributionUser"]:checked').map((input)=>input.value);
      if (!ids.length || !userIds.length) { toast('warning','Distribuição incompleta','Selecione ao menos um responsável.'); return; }
      const plan = calculateBalancedDistribution(ids,userIds);
      const preview = [...plan.assignment.entries()].map(([id,list])=>`${state.operators.find((user)=>user.id===id)?.nome}: ${list.length}`).join(' • ');
      confirmAction('Confirmar distribuição',`${preview}. Deseja aplicar a distribuição equilibrada?`,async()=>{
        let operationId = null;
        try {
          operationId = await window.remoteData.registerUndoOperation('distribuicao',`Distribuição de ${ids.length} concedente(s)`,ids,10);
          for (const [userId,list] of plan.assignment.entries()) {
            if (!list.length) continue;
            const user = state.operators.find((item)=>item.id===userId);
            await window.remoteData.bulkUpdateCompanies(list,{responsavelAcompanhamento:user.nome});
          }
          closeModal('distributionBackdrop'); state.bulkSelectedIds.clear();
          await loadRemoteData({silent:true}); await loadUndoOperations(operationId);
          toast('success','Distribuição concluída',preview);
        } catch (error) {
          if (operationId) window.remoteData.deleteUndoOperation(operationId).catch(()=>{});
          toast('error','Falha na distribuição',error.message);
        }
      },false);
    }

    async function loadUndoOperations(preferredId = '') {
      if (!window.currentUser?.id || !window.remoteData?.listUndoOperations) return;
      try { state.undoOperations = await window.remoteData.listUndoOperations(); }
      catch (error) { state.undoOperations = []; }
      const operation = state.undoOperations.find((item)=>item.id===preferredId) || state.undoOperations[0];
      const bar = $('#undoOperationBar');
      bar?.classList.toggle('hidden',!operation);
      if (operation) {
        bar.dataset.operationId = operation.id;
        $('#undoOperationTitle').textContent = operation.descricao || 'Alteração realizada';
        const minutes = Math.max(0,Math.ceil((new Date(operation.expiresAt)-new Date())/60000));
        $('#undoOperationTime').textContent = `Disponível por aproximadamente ${minutes} minuto(s).`;
      }
    }

    async function undoLatestOperation() {
      const id = $('#undoOperationBar')?.dataset.operationId;
      if (!id) return;
      confirmAction('Desfazer alteração','Os valores anteriores das concedentes serão restaurados. Deseja continuar?',async()=>{
        try {
          const result = await window.remoteData.undoOperation(id);
          await loadRemoteData({silent:true});
          await loadUndoOperations();
          toast('success','Alteração desfeita',`${Number(result?.restored || 0)} cadastro(s) restaurado(s).`);
        } catch (error) { toast('error','Não foi possível desfazer',error.message); }
      },false);
    }

    const baseSaveCompanyV880 = saveCompany;
    saveCompany = async function(data) {
      if (!ensureOperationalWrite('salvar concedentes')) return;
      const previous = state.data.concedentes.find((company)=>company.id===data.id);
      let operationId = null;
      const before = previous ? JSON.stringify(normalizeCompany(previous)) : '';
      if (previous) {
        try { operationId = await window.remoteData.registerUndoOperation('edicao_individual',`Edição de ${previous.nomeFantasia || previous.razaoSocial}`,[previous.id],10); }
        catch (error) { console.warn('[Desfazer]',error); }
      }
      await baseSaveCompanyV880(data);
      const after = state.data.concedentes.find((company)=>company.id===data.id);
      if (operationId && after && JSON.stringify(normalizeCompany(after)) !== before) await loadUndoOperations(operationId);
      else if (operationId) window.remoteData.deleteUndoOperation(operationId).catch(()=>{});
    };

    const baseSaveContactV880 = saveContact;
    saveContact = async function() {
      if (!ensureOperationalWrite('registrar contatos')) return;
      const companyId = $('#contactCompanySelect')?.value;
      const company = state.data.concedentes.find((item)=>item.id===companyId);
      const origin = company?.situacao || '';
      await baseSaveContactV880();
      if (company && company.situacao !== origin) {
        try { await applyAutomaticFlowRule(company,'situacao_alterada',origin); renderAll(); }
        catch (error) { console.warn('[Regra automática]',error); }
      }
    };

    const baseConfirmOutlookEmailV880 = confirmOutlookEmail;
    confirmOutlookEmail = async function(sent) {
      if (sent && !ensureOperationalWrite('registrar o envio de e-mail')) return;
      const pending = state.pendingEmail ? {...state.pendingEmail} : null;
      const company = pending ? state.data.concedentes.find((item)=>item.id===pending.companyId) : null;
      const origin = company?.situacao || '';
      await baseConfirmOutlookEmailV880(sent);
      if (sent && company) {
        try {
          const applied = await applyAutomaticFlowRule(company,'email_enviado',origin);
          if (applied) { await loadRemoteData({silent:true}); toast('info','Fluxo automático aplicado','Situação, próxima ação e prazo foram ajustados pela regra configurada.'); }
        } catch (error) { toast('warning','Envio registrado',`A regra automática não pôde ser aplicada: ${error.message}`); }
      }
    };

    const baseSubmitOutlookMessageV880 = submitOutlookMessage;
    submitOutlookMessage = function(event) {
      if (!ensureOperationalWrite('preparar novos e-mails')) { event?.preventDefault?.(); return; }
      return baseSubmitOutlookMessageV880(event);
    };

    function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
    function monthDateValue(value) { return value ? `${value}-01` : `${monthKey()}-01`; }

    async function loadGoals() {
      if (!window.currentUser?.id || !window.remoteData?.listOperationalGoals) return;
      const competence = monthDateValue($('#goalMonth')?.value || monthKey());
      try { state.goals = await window.remoteData.listOperationalGoals(competence); }
      catch (error) { state.goals = []; console.warn('[Metas]',error); }
      renderGoals();
    }

    function actualGoalMetrics(userName, competence) {
      const start = competence;
      const endDate = new Date(`${competence}T12:00:00`); endDate.setMonth(endDate.getMonth()+1); endDate.setDate(0);
      const end = endDate.toISOString().slice(0,10);
      const companies = state.data.concedentes.map(normalizeCompany);
      const matchesUser = (contact)=>!userName || userName==='Equipe' || normalize(contact.responsavel)===normalize(userName);
      const contacts = companies.flatMap((company)=>(company.contatos||[]).map((contact)=>({company,contact}))).filter(({contact})=>contact.data>=start&&contact.data<=end&&matchesUser(contact));
      return {
        contacts: contacts.length,
        renewals: contacts.filter(({contact})=>contact.resultado==='Renovado').length,
        resolved: contacts.filter(({contact})=>['Documentação recebida','Em análise','Renovação em andamento','Renovado'].includes(contact.resultado)).length
      };
    }

    function progressPercent(actual,target) { return target > 0 ? Math.min(100,Math.round((actual/target)*100)) : 0; }
    function progressBar(actual,target) { const pct=progressPercent(actual,target); return `<div><strong>${actual}/${target}</strong><div class="progress-track"><span style="width:${pct}%"></span></div><small>${pct}%</small></div>`; }

    function renderGoals() {
      if (!$('#goalTableBody')) return;
      const competence = monthDateValue($('#goalMonth')?.value || monthKey());
      const rows = state.goals.map((goal)=>({goal,actual:actualGoalMetrics(goal.escopo==='equipe'?'Equipe':goal.usuarioNome,competence)}));
      const totals = rows.reduce((acc,row)=>({contacts:acc.contacts+row.actual.contacts,targetContacts:acc.targetContacts+row.goal.metaContatos,renewals:acc.renewals+row.actual.renewals,targetRenewals:acc.targetRenewals+row.goal.metaRenovacoes}),{contacts:0,targetContacts:0,renewals:0,targetRenewals:0});
      $('#goalSummary').innerHTML = [['Contatos',`${totals.contacts}/${totals.targetContacts}`,'fa-phone'],['Renovações',`${totals.renewals}/${totals.targetRenewals}`,'fa-circle-check'],['Metas cadastradas',rows.length,'fa-bullseye']].map(([label,value,icon])=>`<div class="workflow-card"><span>${label}</span><strong>${value}</strong><i class="fa-solid ${icon}"></i></div>`).join('');
      $('#goalTableBody').innerHTML = rows.length ? rows.map(({goal,actual})=>{const overallTarget=goal.metaContatos+goal.metaRenovacoes+goal.metaPendencias;const overallActual=actual.contacts+actual.renewals+actual.resolved;return `<tr><td><strong>${escapeHTML(goal.escopo==='equipe'?'Equipe':goal.usuarioNome)}</strong><small style="display:block;color:var(--muted)">${escapeHTML(goal.usuarioEmail||goal.escopo)}</small></td><td>${progressBar(actual.contacts,goal.metaContatos)}</td><td>${progressBar(actual.renewals,goal.metaRenovacoes)}</td><td>${progressBar(actual.resolved,goal.metaPendencias)}</td><td>${progressBar(overallActual,overallTarget)}</td><td data-admin-only><button class="btn btn-secondary btn-icon" data-edit-goal="${goal.id}"><i class="fa-solid fa-pen"></i></button></td></tr>`;}).join('') : `<tr><td colspan="6">${emptyState('Nenhuma meta cadastrada','O administrador pode definir metas mensais para usuários ou para a equipe.')}</td></tr>`;
      applyAccessRules();
    }

    function openGoalEditor(id='') {
      const goal = state.goals.find((item)=>item.id===id) || {};
      $('#goalForm').reset();
      $('#goalCompetence').value = String(goal.competencia || monthDateValue($('#goalMonth')?.value || monthKey())).slice(0,7);
      $('#goalScope').value = goal.escopo || 'usuario';
      $('#goalUser').value = goal.usuarioId || state.operators[0]?.id || '';
      $('#goalContacts').value = Number(goal.metaContatos || 0);
      $('#goalRenewals').value = Number(goal.metaRenovacoes || 0);
      $('#goalResolved').value = Number(goal.metaPendencias || 0);
      $('#goalUser').disabled = $('#goalScope').value === 'equipe';
      openModal('goalModalBackdrop');
    }

    async function saveGoal(event) {
      event.preventDefault();
      if (!ensureAdmin('salvar metas')) return;
      const scope = $('#goalScope').value;
      const user = state.operators.find((item)=>item.id===$('#goalUser').value);
      try {
        await window.remoteData.saveOperationalGoal({
          competencia: `${$('#goalCompetence').value}-01`,
          escopo: scope,
          usuarioId: scope==='equipe'?null:user?.id,
          usuarioNome: scope==='equipe'?'Equipe':user?.nome,
          usuarioEmail: scope==='equipe'?'':user?.email,
          metaContatos: $('#goalContacts').value,
          metaRenovacoes: $('#goalRenewals').value,
          metaPendencias: $('#goalResolved').value
        });
        closeModal('goalModalBackdrop'); await loadGoals(); toast('success','Meta salva','A meta operacional foi atualizada.');
      } catch (error) { toast('error','Falha ao salvar meta',error.message); }
    }

    function calendarEvents() {
      const brand = $('#calendarBrand')?.value || '';
      const responsible = $('#calendarResponsible')?.value || '';
      const q = normalize($('#calendarSearch')?.value || '');
      return state.data.concedentes.map(normalizeCompany).filter((company)=>!brand||company.marca===brand).filter((company)=>!responsible||company.responsavelOperacional===responsible).filter((company)=>!q||normalize([company.nomeFantasia,company.razaoSocial,company.cnpj,company.cidade,company.proximaAcao].join(' ')).includes(q)).flatMap((company)=>{
        const events=[];
        if (company.proximaData) events.push({date:company.proximaData,type:'contact',company,title:company.proximaAcao||'Próximo contato'});
        if (company.fimVigencia) events.push({date:company.fimVigencia,type:'deadline',company,title:'Fim da vigência'});
        return events;
      });
    }

    function renderCalendar() {
      const grid = $('#calendarGrid'); if (!grid) return;
      const cursor = new Date(state.calendarCursor.getFullYear(),state.calendarCursor.getMonth(),1);
      $('#calendarTitle').textContent = cursor.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,(char)=>char.toUpperCase());
      const firstWeekday = (cursor.getDay()+6)%7;
      const start = new Date(cursor); start.setDate(1-firstWeekday);
      const events = calendarEvents();
      const headers = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((day)=>`<div class="calendar-weekday">${day}</div>`).join('');
      const days = [];
      for (let index=0;index<42;index+=1) {
        const date = new Date(start); date.setDate(start.getDate()+index);
        const iso = date.toISOString().slice(0,10);
        const dayEvents = events.filter((event)=>event.date===iso);
        days.push(`<div class="calendar-day ${date.getMonth()===cursor.getMonth()?'':'outside'}"><div class="calendar-day-number">${date.getDate()}</div>${dayEvents.slice(0,5).map((event)=>`<button class="calendar-event ${event.type==='deadline'?'deadline':''}" data-calendar-company="${event.company.id}" title="${escapeHTML(event.title)}">${event.type==='deadline'?'Vigência':'Contato'} • ${escapeHTML(event.company.nomeFantasia||event.company.razaoSocial)}</button>`).join('')}${dayEvents.length>5?`<small>+${dayEvents.length-5} evento(s)</small>`:''}</div>`);
      }
      grid.innerHTML = headers + days.join('');
    }

    function collectExceptions() {
      const rows=[];
      const today=todayISO();
      state.data.concedentes.map(normalizeCompany).forEach((company)=>{
        const name=company.nomeFantasia||company.razaoSocial;
        if (company.proximaData && company.proximaData < today) rows.push({type:'prazo',severity:'high',company,message:`Próximo contato atrasado desde ${formatDate(company.proximaData)}.`});
        const idle=inactivityInfo(company); if (idle.days===null||idle.days>10) rows.push({type:'inatividade',severity:idle.days===null?'medium':'high',company,message:idle.label});
        if (!company.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)) rows.push({type:'cadastro',severity:'medium',company,message:'E-mail ausente ou inválido.'});
        if (!company.telefone || onlyDigits(company.telefone).length<10) rows.push({type:'cadastro',severity:'low',company,message:'Telefone ausente ou incompleto.'});
        if (!company.responsavelAcompanhamento) rows.push({type:'cadastro',severity:'medium',company,message:'Acompanhamento sem responsável.'});
        if (['inapta','baixada','suspensa','nula'].some((key)=>normalize(company.situacaoCadastral).includes(key))) rows.push({type:'situacao',severity:'high',company,message:`Situação cadastral: ${company.situacaoCadastral}.`});
      });
      (state.activeLocks||[]).forEach((lock)=>{const company=state.data.concedentes.find((item)=>item.id===lock.companyId);if(company)rows.push({type:'edicao',severity:'low',company,message:`Em edição por ${lock.usuarioNome||lock.usuarioEmail||'outro usuário'} até ${new Date(lock.expiresAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}.`});});
      const automatic=(state.exportHistory||[]).filter((item)=>item.origem==='automatica');
      if (isAdmin() && !automatic.length) rows.push({type:'backup',severity:'high',company:null,message:'Nenhum backup automático foi localizado no histórico.'});
      return rows;
    }

    async function refreshExceptionsData() {
      try { state.activeLocks = await window.remoteData.listActiveEditLocks(); } catch (error) { state.activeLocks=[]; }
      if (isAdmin()) { try { await loadExportHistory(); } catch {} }
      renderExceptions();
    }

    function renderExceptions() {
      if (!$('#exceptionTableBody')) return;
      const type=$('#exceptionType')?.value||''; const brand=$('#exceptionBrand')?.value||''; const q=normalize($('#exceptionSearch')?.value||'');
      const all=collectExceptions();
      const rows=all.filter((item)=>!type||item.type===type).filter((item)=>!brand||item.company?.marca===brand).filter((item)=>!q||normalize([item.company?.nomeFantasia,item.company?.razaoSocial,item.company?.cnpj,item.company?.responsavelAcompanhamento,item.message].join(' ')).includes(q));
      const metrics=[['Total',all.length,'fa-triangle-exclamation'],['Críticas',all.filter((item)=>item.severity==='high').length,'fa-circle-exclamation'],['Prazos',all.filter((item)=>item.type==='prazo').length,'fa-clock'],['Cadastros',all.filter((item)=>item.type==='cadastro').length,'fa-clipboard-check']];
      $('#exceptionMetrics').innerHTML=metrics.map(([label,value,icon])=>`<div class="workflow-card"><span>${label}</span><strong>${value}</strong><i class="fa-solid ${icon}"></i></div>`).join('');
      $('#exceptionTableBody').innerHTML=rows.length?rows.map((item)=>`<tr><td class="exception-${item.severity}">${item.severity==='high'?'Crítica':item.severity==='medium'?'Atenção':'Informativa'}</td><td>${item.company?`<strong>${escapeHTML(item.company.nomeFantasia||item.company.razaoSocial)}</strong><small style="display:block;color:var(--muted)">${escapeHTML(item.company.cnpj||'')}</small>`:'Sistema'}</td><td>${escapeHTML(item.company?.marca||'—')}</td><td>${escapeHTML(item.message)}</td><td>${item.company?`<button class="btn btn-secondary btn-sm" data-exception-company="${item.company.id}">Abrir</button>`:isAdmin()?'<button class="btn btn-secondary btn-sm" data-panel-target="configuracoes">Configurações</button>':'—'}</td></tr>`).join(''):`<tr><td colspan="5">${emptyState('Nenhuma exceção encontrada','Os filtros atuais não possuem ocorrências pendentes.')}</td></tr>`;
    }

    async function renderMentionsWhenVisible() { if ($('#panel-notificacoes')?.classList.contains('active')) await loadMyMentions(); }

    async function loadAutomationSuiteData({silent=true}={}) {
      if (!window.currentUser?.id) return;
      await Promise.allSettled([loadFlowRules({silent}),loadOperators(),loadMaintenanceConfiguration(),loadUndoOperations(),loadMyMentions()]);
      if ($('#goalMonth') && !$('#goalMonth').value) $('#goalMonth').value=monthKey();
      if ($('#panel-metas')?.classList.contains('active')) await loadGoals();
      renderMaintenanceMode();
      evaluateEscalationRules().catch((error)=>console.warn('[Escalonamento]',error));
      state.supplementalLoadedAt=Date.now();
    }

    const baseSwitchPanelV880 = switchPanel;
    switchPanel = function(name) {
      const custom={calendario:['Calendário','Acompanhamentos e vencimentos organizados por data.'],excecoes:['Exceções','Ocorrências que precisam de atenção.'],metas:['Metas','Progresso mensal por usuário e equipe.']};
      if (!custom[name]) {
        baseSwitchPanelV880(name);
        if (name==='notificacoes') renderMentionsWhenVisible();
        return;
      }
      $$('.panel').forEach((panel)=>panel.classList.remove('active'));
      $$('.nav-item').forEach((item)=>item.classList.toggle('active',item.dataset.panel===name));
      $('#panel-'+name)?.classList.add('active');
      $('#pageTitle').textContent=custom[name][0]; $('#pageSubtitle').textContent=custom[name][1];
      if(window.innerWidth<=900)$('#sidebar').classList.remove('mobile-open');
      if(name==='calendario')renderCalendar();
      if(name==='excecoes')refreshExceptionsData();
      if(name==='metas'){if(!$('#goalMonth').value)$('#goalMonth').value=monthKey();loadGoals();}
    };

    const baseApplyAccessRulesV880 = applyAccessRules;
    applyAccessRules = function() {
      baseApplyAccessRulesV880();
      runOptionalFeature('modo de manutenção', renderMaintenanceMode);
    };

    const baseRenderAllV880 = renderAll;
    renderAll = function() {
      baseRenderAllV880();
      runOptionalFeature('recursos complementares da V8.8', () => {
        renderMaintenanceMode();
        const active=$('.panel.active')?.id.replace('panel-','')||'';
        if(active==='calendario')renderCalendar();
        if(active==='excecoes')renderExceptions();
        if(active==='metas')renderGoals();
        if(active==='notificacoes')renderMyMentions();
        renderFlowRulesSettings();
        updateTagFilterOptions();
      });
    };

    const baseMarkRenewedV880 = markRenewed;
    markRenewed = function(id) { if (!ensureOperationalWrite('alterar a situação')) return; return baseMarkRenewedV880(id); };
    const baseClaimQueueCompanyV880 = claimQueueCompany;
    claimQueueCompany = async function(id) { if (!ensureOperationalWrite('atribuir responsáveis')) return; return baseClaimQueueCompanyV880(id); };

    const baseBuildBackupPayloadV880 = buildBackupPayload;
    buildBackupPayload = function() {
      const payload=baseBuildBackupPayloadV880();
      payload.version=5;
      payload.regrasFluxo=state.flowRules;
      payload.metasOperacionais=state.goals;
      payload.manutencao=state.maintenance;
      payload.etiquetas=true;
      return payload;
    };

    backupJSON = async function() {
      if(!ensureAdmin('criar backups'))return;
      try {
        const payload=buildBackupPayload();
        if(window.remoteData?.exportSupplementalData){Object.assign(payload,await window.remoteData.exportSupplementalData());}
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
        const filename=`backup_convenios_${new Date().toLocaleDateString('pt-BR').replaceAll('/','-')}.json`;
        const downloaded=await saveBlobToDevice(blob,filename,{usePicker:true});
        if(!downloaded)return;
        toast('success','Backup JSON criado','Cadastros, comentários, regras, metas e configurações foram incluídos.');
        saveExportHistory(blob,filename,'backup-json',payload.totalConcedentes).catch(()=>{});
      } catch(error){toast('error','Falha ao criar backup',error.message||'Não foi possível gerar o arquivo.');}
    };

    const baseRestoreJSONV880 = restoreJSON;
    restoreJSON = function(file) {
      if(!ensureAdmin('restaurar backups'))return;
      const reader=new FileReader();
      reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));if(!parsed||!Array.isArray(parsed.concedentes))throw new Error('Estrutura inválida');confirmAction('Restaurar backup','Os dados operacionais serão substituídos pelo conteúdo do arquivo. Deseja continuar?',async()=>{try{const result=window.remoteData.replaceAllWorkflow?await window.remoteData.replaceAllWorkflow(parsed.concedentes.map(normalizeCompany),parsed.modelosEmail||[]):await window.remoteData.replaceAll(parsed.concedentes.map(normalizeCompany));let supplementalOk=true;if(window.remoteData.restoreSupplementalData){try{await window.remoteData.restoreSupplementalData(parsed);}catch(extraError){supplementalOk=false;console.warn('[Restauração complementar]',extraError);}}await loadRemoteData({silent:true});await loadAutomationSuiteData({silent:true});toast(supplementalOk?'success':'warning','Backup restaurado',supplementalOk?`${result.inserted} concedente(s) e recursos complementares restaurados.`:`${result.inserted} concedente(s) restaurada(s). Alguns recursos complementares não puderam ser importados.`);}catch(error){toast('error','Falha na restauração',error.message);}});}catch(error){toast('error','Backup inválido','O arquivo não possui uma estrutura compatível.');}};reader.readAsText(file);
    };

    function bindAutomationSuiteEvents() {
      $('#globalSearchButton')?.addEventListener('click',()=>{openModal('globalSearchBackdrop');setTimeout(()=>$('#globalSearchInput')?.focus(),80);});
      $('#globalSearchInput')?.addEventListener('input',()=>{clearTimeout(state.globalSearchTimer);state.globalSearchTimer=setTimeout(runGlobalSearch,280);});
      $('#flowRuleForm')?.addEventListener('submit',saveFlowRuleEditor);
      $('#newFlowRule')?.addEventListener('click',()=>openFlowRuleEditor());
      $('#saveMaintenance')?.addEventListener('click',saveMaintenanceConfiguration);
      $('#internalCommentForm')?.addEventListener('submit',saveInternalComment);
      $('#confirmBulkPreview')?.addEventListener('click',()=>{const pending=state.pendingBulkPreview;if(pending)performBulkActionsV880(pending.ids,pending.payload);});
      $('#bulkDistribute')?.addEventListener('click',openDistribution);
      $('#distributionForm')?.addEventListener('submit',submitDistribution);
      $('#undoOperationButton')?.addEventListener('click',undoLatestOperation);
      $('#dismissUndoOperation')?.addEventListener('click',()=>$('#undoOperationBar')?.classList.add('hidden'));
      $('#newGoalButton')?.addEventListener('click',()=>openGoalEditor());
      $('#goalForm')?.addEventListener('submit',saveGoal);
      $('#goalScope')?.addEventListener('change',()=>{$('#goalUser').disabled=$('#goalScope').value==='equipe';});
      $('#goalMonth')?.addEventListener('change',loadGoals);
      $('#calendarToday')?.addEventListener('click',()=>{state.calendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendar();});
      $('#calendarPrevious')?.addEventListener('click',()=>{state.calendarCursor=new Date(state.calendarCursor.getFullYear(),state.calendarCursor.getMonth()-1,1);renderCalendar();});
      $('#calendarNext')?.addEventListener('click',()=>{state.calendarCursor=new Date(state.calendarCursor.getFullYear(),state.calendarCursor.getMonth()+1,1);renderCalendar();});
      ['calendarBrand','calendarResponsible'].forEach((id)=>$('#'+id)?.addEventListener('change',renderCalendar));
      $('#calendarSearch')?.addEventListener('input',renderCalendar);
      ['exceptionType','exceptionBrand'].forEach((id)=>$('#'+id)?.addEventListener('change',renderExceptions));
      $('#exceptionSearch')?.addEventListener('input',renderExceptions);
      $('#refreshExceptions')?.addEventListener('click',refreshExceptionsData);
      $('#refreshMentions')?.addEventListener('click',loadMyMentions);
      ['filterEtiqueta','filterInatividade'].forEach((id)=>$('#'+id)?.addEventListener('change',()=>{state.page=1;renderCompanies();}));
      document.addEventListener('keydown',(event)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openModal('globalSearchBackdrop');setTimeout(()=>$('#globalSearchInput')?.focus(),80);}});
      document.addEventListener('submit',(event)=>{if(event.target.id==='internalCommentForm')saveInternalComment(event);});
      document.addEventListener('click',(event)=>{
        const global=event.target.closest?.('[data-global-company]');if(global){closeModal('globalSearchBackdrop');viewCompany(global.dataset.globalCompany);return;}
        const editRule=event.target.closest?.('[data-edit-flow-rule]');if(editRule){openFlowRuleEditor(editRule.dataset.editFlowRule);return;}
        const deleteRule=event.target.closest?.('[data-delete-flow-rule]');if(deleteRule){const rule=state.flowRules.find((item)=>item.id===deleteRule.dataset.deleteFlowRule);confirmAction('Excluir regra',`Deseja excluir “${rule?.nome||'esta regra'}”?`,async()=>{try{await window.remoteData.deleteFlowRule(deleteRule.dataset.deleteFlowRule);state.flowRules=state.flowRules.filter((item)=>item.id!==deleteRule.dataset.deleteFlowRule);renderFlowRulesSettings();}catch(error){toast('error','Falha ao excluir',error.message);}});return;}
        const deleteComment=event.target.closest?.('[data-delete-comment]');if(deleteComment){confirmAction('Excluir comentário','Deseja remover este comentário interno?',async()=>{try{await window.remoteData.deleteInternalComment(deleteComment.dataset.deleteComment);await renderCompanyComments(deleteComment.dataset.companyId);}catch(error){toast('error','Falha ao excluir',error.message);}});return;}
        const read=event.target.closest?.('[data-read-mention]');if(read){window.remoteData.markInternalCommentRead(read.dataset.readMention).then(loadMyMentions);return;}
        const mentionCompany=event.target.closest?.('[data-open-mention-company]');if(mentionCompany){viewCompany(mentionCompany.dataset.openMentionCompany);return;}
        const calendar=event.target.closest?.('[data-calendar-company]');if(calendar){viewCompany(calendar.dataset.calendarCompany);return;}
        const exception=event.target.closest?.('[data-exception-company]');if(exception){viewCompany(exception.dataset.exceptionCompany);return;}
        const panelTarget=event.target.closest?.('[data-panel-target]');if(panelTarget){switchPanel(panelTarget.dataset.panelTarget);return;}
        const editGoal=event.target.closest?.('[data-edit-goal]');if(editGoal){openGoalEditor(editGoal.dataset.editGoal);return;}
      });
      document.addEventListener('click',(event)=>{
        if(!maintenanceBlocksWrites())return;
        const writeTarget=event.target.closest?.('.action-edit,.action-delete,.action-contact,.action-renew,[data-queue-contact],[data-queue-email],#bulkOpenActions,#bulkDistribute,#newCompanyBtn,#openCompanyModal,#newContactBtn');
        if(writeTarget){event.preventDefault();event.stopImmediatePropagation();ensureOperationalWrite('realizar alterações');}
      },true);
      document.addEventListener('auth:ready',()=>loadAutomationSuiteData({silent:true}).catch((error)=>console.warn('[Automação complementar]',error)));
      document.addEventListener('auth:signed-out',()=>{state.flowRules=[];state.operators=[];state.myMentions=[];state.goals=[];state.undoOperations=[];state.maintenance={ativo:false,mensagem:'',inicioEm:'',fimEm:''};renderMaintenanceMode();});
    }

    window.conveniosApp = Object.freeze({
      getCompanies: () => state.data.concedentes.map(normalizeCompany),
      switchPanel,
      refreshData: () => loadRemoteData({ silent: true }),
      openCompany: (companyId) => {
        switchPanel('concedentes');
        setTimeout(() => viewCompany(companyId), 0);
      },
      openContacts: (companyId) => {
        state.selectedContactCompanyId = companyId;
        switchPanel('contatos');
      }
    });

    function init() {
      loadData();
      setupStaticOptions();
      ensureWorkflowEnhancementsUI();
      ensureOutlookMessageUI();
      ensureAdvancedManagementUI();
      ensureLegalNatureClassificationUI();
      runOptionalFeature('interface de automação e colaboração', ensureAutomationSuiteUI);
      bindEvents();
      bindWorkflowEnhancementEvents();
      bindAdvancedManagementEvents();
      runOptionalFeature('eventos de automação e colaboração', bindAutomationSuiteEvents);
      $('#naturezaJuridica')?.addEventListener('input', updateLegalNatureClassification);
      $('#naturezaJuridica')?.addEventListener('change', updateLegalNatureClassification);
      applyTheme();
      renderAll();
      updateMigrationSummary();
      applyAccessRules();

      document.addEventListener('click',(event)=>{
        const restricted=event.target.closest?.('[data-admin-only], .action-delete');
        if(restricted&&!isAdmin()){
          event.preventDefault();
          event.stopImmediatePropagation();
          toast('error','Acesso restrito','Esta função é exclusiva do administrador.');
        }
      },true);

      document.addEventListener('auth:ready',()=>{
        applyAccessRules();
        loadRemoteData();
        if(window.__databaseSyncTimer)clearInterval(window.__databaseSyncTimer);
        window.__databaseSyncTimer=setInterval(()=>loadRemoteData({silent:true}),60000);
        startAutomaticBackupScheduler();
      });
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&window.currentUser?.id){loadRemoteData({silent:true});checkAutomaticBackupSchedule();}});
      if(window.currentUser?.id){loadRemoteData();loadAutomationSuiteData({silent:true});startAutomaticBackupScheduler();}
    }
    init();
  })();
