(() => {
  'use strict';

  const client = window.database?.client || null;
  const MAX_RECORDS = 2500;
  const state = {
    records: [], filtered: [], page: 1, pageSize: 15, loadedAt: 0, loading: false,
    selected: null, selectedIds: new Set(), pendingDeleteIds: []
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const role = () => String(window.currentUser?.perfil || document.body.dataset.userRole || '').trim().toLowerCase();
  const isAdmin = () => role() === 'administrador';
  const isProtected = (record) => String(record?.tabela || '').toLowerCase() === 'auditoria';

  const fieldLabels = Object.freeze({
    cnpj: 'CNPJ', razao_social: 'Razão Social', nome_fantasia: 'Nome Fantasia', data_abertura: 'Data de abertura',
    situacao_cadastral: 'Situação cadastral', natureza_juridica: 'Natureza jurídica', cnae_principal: 'CNAE principal',
    logradouro: 'Logradouro', numero: 'Número', complemento: 'Complemento', bairro: 'Bairro', fonte_cnpj: 'Fonte do CNPJ',
    consultado_em: 'Data da consulta do CNPJ', inicio_vigencia: 'Início da Vigência', fim_vigencia: 'Fim da Vigência',
    data_cadastro: 'Data do Cadastro', estado: 'Estado', cidade: 'Cidade', cep: 'CEP', email: 'E-mail', telefone: 'Telefone',
    polo: 'Polo', marca: 'Marca do convênio', responsavel_acompanhamento: 'Responsável pelo acompanhamento', prioridade: 'Prioridade', situacao: 'Situação', formas_contato: 'Formas de Contato', observacoes: 'Observações',
    demonstracao: 'Registro de demonstração', concedente_id: 'Concedente', data_contato: 'Data do Contato', horario: 'Horário',
    responsavel: 'Responsável', forma_contato: 'Forma de Contato', pessoa_contatada: 'Pessoa Contatada',
    resultado_contato: 'Resultado do Contato', proxima_acao: 'Próxima Ação', proximo_contato: 'Próximo Contato',
    nome: 'Nome', perfil_id: 'Perfil de acesso', ativo: 'Usuário ativo', ultimo_acesso: 'Último acesso', senha: 'Senha',
    registros_excluidos: 'Registros excluídos', motivo: 'Motivo da exclusão', ids_excluidos: 'Identificadores excluídos'
  });
  const ignoredFields = new Set(['id', 'criado_por', 'atualizado_por', 'criado_em', 'atualizado_em']);

  function toast(type, title, message) {
    const container = $('#toastContainer');
    if (!container) return;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span></div>`;
    container.appendChild(element);
    setTimeout(() => {
      element.style.opacity = '0'; element.style.transform = 'translateX(20px)';
      setTimeout(() => element.remove(), 250);
    }, 4800);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function formatDate(value) {
    if (!value) return '—';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
  }
  function formatValue(value, field = '') {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (/^(inicio_vigencia|fim_vigencia|data_cadastro|data_contato|proximo_contato|data_abertura)$/.test(field)) return formatDate(value);
    if (field === 'horario') return String(value).slice(0, 5);
    return String(value);
  }

  function actionMeta(record) {
    const changed = Array.isArray(record.campos_alterados) ? record.campos_alterados : [];
    if (isProtected(record)) return { label: 'Limpeza da auditoria', className: 'audit-action-delete', icon: 'fa-shield-halved' };
    if (record.acao === 'INSERT') return { label: 'Cadastro', className: 'audit-action-create', icon: 'fa-plus' };
    if (record.acao === 'DELETE') return { label: 'Exclusão', className: 'audit-action-delete', icon: 'fa-trash' };
    if (record.acao === 'UPDATE' && changed.includes('situacao')) return { label: 'Situação', className: 'audit-action-status', icon: 'fa-arrows-rotate' };
    return { label: 'Edição', className: 'audit-action-update', icon: 'fa-pen' };
  }
  function entityLabel(table) {
    return ({ concedentes: 'Concedente', contatos: 'Contato', usuarios: 'Usuário', modelos_email: 'Modelo de e-mail', comunicacoes_email: 'Comunicação por e-mail', filtros_salvos: 'Filtro salvo', bloqueios_edicao: 'Bloqueio de edição', auditoria: 'Comprovante técnico' })[table] || table || 'Registro';
  }
  function userLabel(record) { return record.usuario_nome || record.usuario_email || 'Sistema'; }
  function getChangedFields(record) {
    const before = record.dados_anteriores || {};
    const after = record.dados_novos || {};
    const preferred = Array.isArray(record.campos_alterados) ? record.campos_alterados : [];
    const fields = preferred.length ? preferred : [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => !ignoredFields.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    return fields.filter((key) => !ignoredFields.has(key));
  }

  function currentPageRows() {
    const start = (state.page - 1) * state.pageSize;
    return state.filtered.slice(start, start + state.pageSize);
  }

  function updateSelectionUI() {
    const count = state.selectedIds.size;
    const button = $('#auditDeleteSelectedBtn');
    button?.classList.toggle('hidden', count === 0);
    if ($('#auditSelectedCount')) $('#auditSelectedCount').textContent = String(count);
    const summary = $('#auditSelectionSummary');
    if (summary) {
      summary.textContent = `${count} selecionado(s)`;
      summary.classList.toggle('hidden', count === 0);
    }
    const selectable = currentPageRows().filter((record) => !isProtected(record));
    const selectedOnPage = selectable.filter((record) => state.selectedIds.has(Number(record.id))).length;
    const selectPage = $('#auditSelectPage');
    if (selectPage) {
      selectPage.disabled = selectable.length === 0;
      selectPage.checked = selectable.length > 0 && selectedOnPage === selectable.length;
      selectPage.indeterminate = selectedOnPage > 0 && selectedOnPage < selectable.length;
    }
  }

  function applyFilters() {
    const search = normalize($('#auditSearch')?.value || '');
    const action = $('#auditActionFilter')?.value || '';
    const table = $('#auditEntityFilter')?.value || '';
    const user = $('#auditUserFilter')?.value || '';
    const start = $('#auditStartDate')?.value || '';
    const end = $('#auditEndDate')?.value || '';
    state.filtered = state.records.filter((record) => {
      if (action && record.acao !== action) return false;
      if (table && record.tabela !== table) return false;
      if (user && (record.usuario_email || record.usuario_nome || 'Sistema') !== user) return false;
      const recordDate = record.criado_em ? new Date(record.criado_em) : null;
      if (start && recordDate && recordDate < new Date(`${start}T00:00:00`)) return false;
      if (end && recordDate && recordDate > new Date(`${end}T23:59:59.999`)) return false;
      if (search) {
        const haystack = normalize([record.usuario_nome, record.usuario_email, record.registro_nome, record.resumo, record.tabela, record.acao, ...(record.campos_alterados || [])].filter(Boolean).join(' '));
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if (state.page > pages) state.page = pages;
    render();
  }

  function populateUserFilter() {
    const select = $('#auditUserFilter');
    if (!select) return;
    const selected = select.value;
    const users = [...new Set(state.records.map((record) => record.usuario_email || record.usuario_nome || 'Sistema'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select.innerHTML = '<option value="">Todos os usuários</option>' + users.map((value) => {
      const sample = state.records.find((record) => (record.usuario_email || record.usuario_nome || 'Sistema') === value);
      const label = sample?.usuario_nome && sample?.usuario_email ? `${sample.usuario_nome} — ${sample.usuario_email}` : value;
      return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
    }).join('');
    if (users.includes(selected)) select.value = selected;
  }

  function renderMetrics() {
    const now = new Date();
    const total = state.records.length;
    const today = state.records.filter((record) => new Date(record.criado_em).toDateString() === now.toDateString()).length;
    const updates = state.records.filter((record) => record.acao === 'UPDATE').length;
    const deletions = state.records.filter((record) => record.acao === 'DELETE').length;
    const users = new Set(state.records.map((record) => record.usuario_id || record.usuario_email || record.usuario_nome).filter(Boolean)).size;
    const metrics = [
      ['Registros de auditoria', total, 'fa-list-check', 'primary'], ['Ações realizadas hoje', today, 'fa-calendar-day', 'success'],
      ['Alterações registradas', updates, 'fa-pen-to-square', 'warning'], ['Exclusões registradas', deletions, 'fa-trash-can', 'danger'],
      ['Usuários identificados', users, 'fa-users', 'blue']
    ];
    const container = $('#auditMetrics');
    if (!container) return;
    container.innerHTML = metrics.map(([label, value, icon, tone]) => `<article class="card metric-card audit-metric-card metric-${tone}"><div class="metric-icon"><i class="fa-solid ${icon}"></i></div><div><strong>${value}</strong><span>${escapeHTML(label)}</span></div></article>`).join('');
  }

  function renderRows() {
    const body = $('#auditTableBody');
    if (!body) return;
    const rows = currentPageRows();
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-shield-halved"></i><strong>Nenhum registro encontrado</strong><span>Ajuste os filtros ou realize uma nova operação no sistema.</span></div></td></tr>';
      updateSelectionUI();
      return;
    }
    body.innerHTML = rows.map((record) => {
      const meta = actionMeta(record);
      const changed = getChangedFields(record);
      const protectedRecord = isProtected(record);
      const fieldSummary = changed.length ? changed.slice(0, 3).map((field) => fieldLabels[field] || field).join(', ') + (changed.length > 3 ? ` +${changed.length - 3}` : '') : '—';
      return `<tr>
        <td class="audit-select-cell">${protectedRecord ? '<i class="fa-solid fa-lock audit-protected" title="Comprovante permanente"></i>' : `<input class="audit-row-select" type="checkbox" data-audit-select="${record.id}" ${state.selectedIds.has(Number(record.id)) ? 'checked' : ''} aria-label="Selecionar registro ${record.id}" />`}</td>
        <td class="audit-date-cell"><strong>${escapeHTML(formatDateTime(record.criado_em))}</strong><small>#${record.id}</small></td>
        <td><div class="audit-user"><span class="audit-user-avatar">${escapeHTML((userLabel(record).trim()[0] || 'S').toUpperCase())}</span><div><strong>${escapeHTML(userLabel(record))}</strong><small>${escapeHTML(record.usuario_email || 'Ação de sistema')}</small></div></div></td>
        <td><span class="audit-action ${meta.className}"><i class="fa-solid ${meta.icon}"></i>${meta.label}</span></td>
        <td><strong>${escapeHTML(record.registro_nome || entityLabel(record.tabela))}</strong><small>${escapeHTML(entityLabel(record.tabela))}</small></td>
        <td><span class="audit-summary">${escapeHTML(record.resumo || 'Operação registrada.')}</span><small>${escapeHTML(fieldSummary)}</small></td>
        <td><div class="audit-row-actions"><button class="btn btn-sm btn-secondary audit-detail-btn" type="button" data-audit-id="${record.id}" title="Detalhes"><i class="fa-solid fa-eye"></i></button>${protectedRecord ? '<span class="audit-protected" title="Este comprovante não pode ser excluído">Permanente</span>' : `<button class="btn btn-sm btn-danger audit-delete-one" type="button" data-audit-delete="${record.id}" title="Excluir registro"><i class="fa-solid fa-trash"></i></button>`}</div></td>
      </tr>`;
    }).join('');
    $$('.audit-detail-btn', body).forEach((button) => button.addEventListener('click', () => openDetails(Number(button.dataset.auditId))));
    $$('.audit-row-select', body).forEach((checkbox) => checkbox.addEventListener('change', () => {
      const id = Number(checkbox.dataset.auditSelect);
      if (checkbox.checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
      updateSelectionUI();
    }));
    $$('.audit-delete-one', body).forEach((button) => button.addEventListener('click', () => openDeleteDialog([Number(button.dataset.auditDelete)])));
    updateSelectionUI();
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    const container = $('#auditPagination');
    const count = $('#auditResultCount');
    if (count) {
      const start = state.filtered.length ? (state.page - 1) * state.pageSize + 1 : 0;
      const end = Math.min(state.page * state.pageSize, state.filtered.length);
      count.textContent = `${state.filtered.length} registro(s) — exibindo ${start} a ${end}`;
    }
    if (!container) return;
    const pages = [];
    for (let page = Math.max(1, state.page - 2); page <= Math.min(totalPages, state.page + 2); page += 1) pages.push(page);
    container.innerHTML = `<button class="pagination-btn" type="button" data-audit-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>${pages.map((page) => `<button class="pagination-btn ${page === state.page ? 'active' : ''}" type="button" data-audit-page="${page}">${page}</button>`).join('')}<button class="pagination-btn" type="button" data-audit-page="${state.page + 1}" ${state.page >= totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>`;
    $$('[data-audit-page]', container).forEach((button) => button.addEventListener('click', () => {
      const page = Number(button.dataset.auditPage);
      if (page >= 1 && page <= totalPages) { state.page = page; renderRows(); renderPagination(); $('#auditTableCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }));
  }

  function render() {
    renderMetrics(); renderRows(); renderPagination();
    $('#auditLimitNote')?.classList.toggle('hidden', state.records.length < MAX_RECORDS);
  }

  function openDetails(id) {
    const record = state.records.find((item) => Number(item.id) === Number(id));
    if (!record) return;
    state.selected = record;
    const meta = actionMeta(record);
    const before = record.dados_anteriores || {};
    const after = record.dados_novos || {};
    const fields = getChangedFields(record);
    const values = fields.length ? fields : Object.keys(record.acao === 'DELETE' ? before : after).filter((field) => !ignoredFields.has(field));
    $('#auditDetailTitle').textContent = `${meta.label} — ${record.registro_nome || entityLabel(record.tabela)}`;
    $('#auditDetailMeta').innerHTML = `<div><span>Data e horário</span><strong>${escapeHTML(formatDateTime(record.criado_em))}</strong></div><div><span>Usuário</span><strong>${escapeHTML(userLabel(record))}</strong><small>${escapeHTML(record.usuario_email || 'Ação de sistema')}</small></div><div><span>Tipo de registro</span><strong>${escapeHTML(entityLabel(record.tabela))}</strong><small>${escapeHTML(record.registro_id || '—')}</small></div><div><span>Ação</span><strong><span class="audit-action ${meta.className}"><i class="fa-solid ${meta.icon}"></i>${meta.label}</span></strong></div>`;
    $('#auditDetailSummary').textContent = record.resumo || 'Operação registrada pelo sistema.';
    $('#auditChangesBody').innerHTML = values.length ? values.map((field) => `<tr><td><strong>${escapeHTML(fieldLabels[field] || field)}</strong></td><td><div class="audit-value audit-value-before">${escapeHTML(formatValue(before[field], field))}</div></td><td><div class="audit-value audit-value-after">${escapeHTML(formatValue(after[field], field))}</div></td></tr>`).join('') : '<tr><td colspan="3">Nenhuma diferença de campos foi identificada.</td></tr>';
    $('#auditRawBefore').textContent = JSON.stringify(before, null, 2);
    $('#auditRawAfter').textContent = JSON.stringify(after, null, 2);
    $('#auditDetailModalBackdrop')?.classList.add('open');
    $('#auditDetailModalBackdrop')?.setAttribute('aria-hidden', 'false');
  }
  function closeDetails() {
    $('#auditDetailModalBackdrop')?.classList.remove('open');
    $('#auditDetailModalBackdrop')?.setAttribute('aria-hidden', 'true');
    state.selected = null;
  }

  function openDeleteDialog(ids) {
    if (!isAdmin()) return;
    const allowed = [...new Set((ids || []).map(Number))].filter((id) => {
      const record = state.records.find((item) => Number(item.id) === id);
      return record && !isProtected(record);
    });
    if (!allowed.length) { toast('warning', 'Nada para excluir', 'Comprovantes técnicos permanentes não podem ser removidos.'); return; }
    state.pendingDeleteIds = allowed;
    $('#auditDeleteReason').value = '';
    $('#auditDeleteError')?.classList.add('hidden');
    $('#auditDeleteMessage').textContent = allowed.length === 1 ? 'Um registro será removido da visualização da auditoria.' : `${allowed.length} registros serão removidos da visualização da auditoria.`;
    $('#auditDeleteModalBackdrop')?.classList.add('open');
    $('#auditDeleteModalBackdrop')?.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#auditDeleteReason')?.focus(), 80);
  }
  function closeDeleteDialog() {
    $('#auditDeleteModalBackdrop')?.classList.remove('open');
    $('#auditDeleteModalBackdrop')?.setAttribute('aria-hidden', 'true');
    state.pendingDeleteIds = [];
  }
  async function confirmDelete() {
    if (!isAdmin() || !client || !state.pendingDeleteIds.length) return;
    const reason = String($('#auditDeleteReason')?.value || '').trim();
    const errorBox = $('#auditDeleteError');
    if (reason.length < 3) {
      if (errorBox) { errorBox.textContent = 'Informe um motivo com pelo menos 3 caracteres.'; errorBox.classList.remove('hidden'); }
      $('#auditDeleteReason')?.focus();
      return;
    }
    errorBox?.classList.add('hidden');
    const button = $('#auditConfirmDeleteBtn');
    if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Excluindo…'; }
    try {
      const { data, error } = await client.rpc('excluir_registros_auditoria', { p_ids: state.pendingDeleteIds, p_motivo: reason });
      if (error) throw error;
      const deleted = Number(data?.excluidos ?? data?.deleted ?? state.pendingDeleteIds.length);
      state.pendingDeleteIds.forEach((id) => state.selectedIds.delete(Number(id)));
      closeDeleteDialog();
      toast('success', 'Registros excluídos', `${deleted} registro(s) removido(s). O comprovante técnico foi preservado.`);
      await load({ force: true });
    } catch (error) {
      console.error('[Auditoria] Falha ao excluir:', error);
      if (errorBox) { errorBox.textContent = error.message || 'Não foi possível excluir os registros.'; errorBox.classList.remove('hidden'); }
    } finally {
      if (button) { button.disabled = false; button.innerHTML = '<i class="fa-solid fa-trash"></i>Excluir registros'; }
    }
  }

  async function load({ force = false } = {}) {
    if (!isAdmin() || !client || state.loading) return;
    if (!force && state.records.length && Date.now() - state.loadedAt < 30000) { applyFilters(); return; }
    state.loading = true;
    $('#auditLoading')?.classList.remove('hidden');
    $('#auditTableCard')?.classList.add('audit-is-loading');
    try {
      const { data, error } = await client.from('auditoria').select('id,usuario_id,usuario_nome,usuario_email,acao,tabela,registro_id,registro_nome,resumo,campos_alterados,dados_anteriores,dados_novos,criado_em').order('criado_em', { ascending: false }).limit(MAX_RECORDS);
      if (error) throw error;
      state.records = Array.isArray(data) ? data : [];
      state.selectedIds.clear();
      state.loadedAt = Date.now();
      populateUserFilter();
      state.page = 1;
      applyFilters();
    } catch (error) {
      console.error('[Auditoria] Falha ao carregar:', error);
      state.records = []; state.filtered = []; render();
      const message = String(error?.message || '').toLowerCase().includes('permission') ? 'Seu perfil não possui permissão para visualizar a auditoria.' : (error?.message || 'Não foi possível consultar o histórico de auditoria.');
      toast('error', 'Falha ao carregar auditoria', message);
    } finally {
      state.loading = false;
      $('#auditLoading')?.classList.add('hidden');
      $('#auditTableCard')?.classList.remove('audit-is-loading');
    }
  }

  function csvEscape(value) {
    const text = String(value ?? '').replace(/"/g, '""');
    return /[;"\n\r]/.test(text) ? `"${text}"` : text;
  }
  function exportCSV() {
    if (!isAdmin()) return;
    if (!state.filtered.length) { toast('warning', 'Nada para exportar', 'Nenhum registro corresponde aos filtros atuais.'); return; }
    const headers = ['Data e hora','Usuário','E-mail','Ação','Tipo de registro','Registro','Resumo','Campos alterados','ID do registro'];
    const rows = state.filtered.map((record) => [formatDateTime(record.criado_em), userLabel(record), record.usuario_email || '', actionMeta(record).label, entityLabel(record.tabela), record.registro_nome || '', record.resumo || '', (record.campos_alterados || []).map((field) => fieldLabels[field] || field).join(', '), record.registro_id || '']);
    const content = '\uFEFF' + [headers, ...rows].map((row) => row.map(csvEscape).join(';')).join('\r\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `auditoria_convenios_${new Date().toLocaleDateString('pt-BR').replaceAll('/', '-')}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    toast('success', 'Auditoria exportada', `${rows.length} registro(s) incluído(s) no CSV.`);
  }
  function clearFilters() {
    ['auditSearch','auditActionFilter','auditEntityFilter','auditUserFilter','auditStartDate','auditEndDate'].forEach((id) => { const element = document.getElementById(id); if (element) element.value = ''; });
    state.page = 1; applyFilters();
  }

  function bindEvents() {
    $('#auditSearch')?.addEventListener('input', () => { state.page = 1; applyFilters(); });
    ['auditActionFilter','auditEntityFilter','auditUserFilter','auditStartDate','auditEndDate'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => { state.page = 1; applyFilters(); }));
    $('#auditPageSize')?.addEventListener('change', (event) => { state.pageSize = Number(event.target.value) || 15; state.page = 1; render(); });
    $('#auditRefreshBtn')?.addEventListener('click', () => load({ force: true }));
    $('#auditClearFilters')?.addEventListener('click', clearFilters);
    $('#auditExportBtn')?.addEventListener('click', exportCSV);
    $('#auditSelectPage')?.addEventListener('change', (event) => {
      currentPageRows().filter((record) => !isProtected(record)).forEach((record) => {
        if (event.target.checked) state.selectedIds.add(Number(record.id)); else state.selectedIds.delete(Number(record.id));
      });
      renderRows();
    });
    $('#auditDeleteSelectedBtn')?.addEventListener('click', () => openDeleteDialog([...state.selectedIds]));
    $('#auditConfirmDeleteBtn')?.addEventListener('click', confirmDelete);
    $$('[data-audit-delete-close]').forEach((button) => button.addEventListener('click', closeDeleteDialog));
    $('#auditDeleteModalBackdrop')?.addEventListener('mousedown', (event) => { if (event.target.id === 'auditDeleteModalBackdrop') closeDeleteDialog(); });
    $$('[data-close="auditDetailModalBackdrop"]').forEach((button) => button.addEventListener('click', closeDetails));
    $('#auditDetailModalBackdrop')?.addEventListener('mousedown', (event) => { if (event.target.id === 'auditDetailModalBackdrop') closeDetails(); });
  }

  function resetForLogout() {
    state.records = []; state.filtered = []; state.page = 1; state.loadedAt = 0; state.selectedIds.clear(); state.pendingDeleteIds = [];
    closeDeleteDialog(); render();
  }

  bindEvents();
  document.addEventListener('auth:ready', () => { if (isAdmin() && $('#panel-auditoria')?.classList.contains('active')) load({ force: true }); });
  document.addEventListener('auth:signed-out', resetForLogout);
  window.auditPanel = Object.freeze({ open: () => load({ force: true }), refresh: () => load({ force: true }) });
})();
