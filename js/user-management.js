(() => {
  'use strict';

  const getClient = () => window.database?.client || null;
  const endpoint = '/api/users-admin';
  const state = { users: [], filtered: [], loading: false, loadedAt: 0 };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isAdmin = () => String(window.currentUser?.perfil || document.body.dataset.userRole || '').toLowerCase() === 'administrador';

  function toast(type, title, message) {
    const container = $('#toastContainer');
    if (!container) return;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span></div>`;
    container.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateX(20px)';
      setTimeout(() => node.remove(), 250);
    }, 4500);
  }

  function setMessage(id, message = '', type = 'error') {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.className = `auth-message ${message ? '' : 'hidden'} auth-message-${type}`.trim();
  }

  function formatDateTime(value) {
    if (!value) return 'Nunca';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function initials(name, email) {
    const source = String(name || '').trim();
    if (source) {
      const parts = source.split(/\s+/).filter(Boolean);
      return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
    }
    return String(email || 'U').slice(0, 1).toUpperCase();
  }

  function roleLabel(role) {
    return role === 'administrador' ? 'Administrador' : 'Operador';
  }

  function openModal(id) {
    const element = document.getElementById(id);
    if (!element) return;
    element.classList.add('open');
    element.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const element = document.getElementById(id);
    if (!element) return;
    element.classList.remove('open');
    element.setAttribute('aria-hidden', 'true');
  }

  function setBackendStatus(type = 'loading', message = 'Verificando a função segura de usuários…') {
    const box = $('#usersBackendStatus');
    const text = $('#usersBackendStatusText');
    const icon = box?.querySelector('i');
    if (!box || !text) return;
    box.classList.remove('user-backend-ok', 'user-backend-error', 'user-backend-warning', 'user-backend-loading');
    box.classList.add(`user-backend-${type}`);
    text.textContent = message;
    if (icon) {
      icon.className = type === 'ok' ? 'fa-solid fa-circle-check' : type === 'error' ? 'fa-solid fa-circle-xmark' : type === 'warning' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-notch fa-spin';
    }
  }

  async function healthCheck() {
    setBackendStatus();
    let response;
    try {
      response = await fetch(endpoint, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
    } catch (error) {
      setBackendStatus('error', 'A função users-admin não pôde ser acessada. Confirme o deploy das Cloudflare Pages Functions.');
      throw new Error('A função users-admin não está acessível no Cloudflare Pages.');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      const message = response.status === 404
        ? 'A função users-admin não foi publicada. Confirme a pasta functions/api no GitHub e faça um novo deploy.'
        : (result?.message || `Falha ao verificar a função (${response.status}).`);
      setBackendStatus('error', message);
      throw new Error(message);
    }
    const health = result.data || {};
    if (!health.ready) {
      let message = 'A função foi publicada, mas as variáveis do Supabase não estão completas.';
      if (!health.supabaseUrlConfigured) message = 'Configure SUPABASE_URL em Settings → Variables and Secrets no Cloudflare Pages.';
      else if (!health.serverKeyConfigured) message = 'Configure SUPABASE_SECRET_KEY como segredo no Cloudflare Pages e faça um novo deploy.';
      else if (health.serverKeyType === 'publishable_incorreta') message = 'SUPABASE_SECRET_KEY está usando uma chave pública. Troque por uma chave sb_secret_.';
      setBackendStatus('error', message);
      throw new Error(message);
    }
    setBackendStatus('ok', `Função de usuários conectada — versão ${health.version || 'atual'}.`);
    return health;
  }

  async function api(action, payload = {}) {
    const client = getClient();
    if (!client) throw new Error('Cliente do Supabase indisponível. Recarregue a página.');
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, payload }),
      cache: 'no-store'
    });
    let result = null;
    try { result = await response.json(); } catch {}
    if (!response.ok || !result?.ok) {
      const message = response.status === 404
        ? 'A função users-admin não foi encontrada no Cloudflare Pages.'
        : (result?.message || `Falha na gestão de usuários (${response.status}).`);
      setBackendStatus('error', message);
      throw new Error(message);
    }
    setBackendStatus('ok', `Função de usuários conectada — versão ${result.version || 'atual'}.`);
    return result.data;
  }

  function setLoading(loading) {
    state.loading = loading;
    $('#usersLoading')?.classList.toggle('hidden', !loading);
    ['usersRefreshBtn', 'newUserBtn'].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.disabled = loading;
    });
  }

  function renderMetrics() {
    const total = state.users.length;
    const active = state.users.filter((user) => user.ativo && !user.is_currently_banned).length;
    const operators = state.users.filter((user) => user.perfil_id === 'operador').length;
    const admins = state.users.filter((user) => user.perfil_id === 'administrador').length;
    const metrics = [
      ['Usuários cadastrados', total, 'fa-users', 'primary'],
      ['Acessos ativos', active, 'fa-user-check', 'success'],
      ['Operadores', operators, 'fa-user-pen', 'warning'],
      ['Administradores', admins, 'fa-user-shield', 'blue']
    ];
    const container = $('#userMetrics');
    if (!container) return;
    container.innerHTML = metrics.map(([label, value, icon, tone]) => `
      <article class="card metric-card user-metric-card metric-${tone}">
        <div class="metric-icon"><i class="fa-solid ${icon}"></i></div>
        <div><strong>${value}</strong><span>${escapeHTML(label)}</span></div>
      </article>
    `).join('');
  }

  function applyFilters() {
    const search = normalize($('#userSearch')?.value || '');
    const role = $('#userRoleFilter')?.value || '';
    const status = $('#userStatusFilter')?.value || '';
    state.filtered = state.users.filter((user) => {
      if (role && user.perfil_id !== role) return false;
      const active = user.ativo && !user.is_currently_banned;
      if (status === 'ativo' && !active) return false;
      if (status === 'bloqueado' && active) return false;
      if (search) {
        const haystack = normalize([user.nome, user.email, user.perfil_id, user.polo].filter(Boolean).join(' '));
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    renderRows();
  }

  function renderRows() {
    const body = $('#usersTableBody');
    if (!body) return;
    $('#usersResultCount').textContent = `${state.filtered.length} usuário${state.filtered.length === 1 ? '' : 's'}`;

    if (!state.filtered.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-users"></i><strong>Nenhum usuário encontrado</strong><span>Ajuste os filtros ou cadastre um novo acesso.</span></div></td></tr>';
      return;
    }

    body.innerHTML = state.filtered.map((user) => {
      const current = user.id === window.currentUser?.id;
      const active = user.ativo && !user.is_currently_banned;
      return `
        <tr>
          <td><div class="user-cell"><span class="user-avatar user-table-avatar">${escapeHTML(initials(user.nome, user.email))}</span><div><strong>${escapeHTML(user.nome || 'Sem nome')}${current ? ' <small class="you-label">Você</small>' : ''}</strong><small>${escapeHTML(user.email || '—')}</small></div></div></td>
          <td><span class="badge ${user.perfil_id === 'administrador' ? 'badge-primary' : 'badge-warning'}"><i class="fa-solid ${user.perfil_id === 'administrador' ? 'fa-user-shield' : 'fa-user-pen'}"></i>${escapeHTML(roleLabel(user.perfil_id))}</span></td>
          <td>${escapeHTML(user.polo || 'Todos')}</td>
          <td><span class="badge ${active ? 'badge-success' : 'badge-danger'}"><i class="fa-solid ${active ? 'fa-circle-check' : 'fa-ban'}"></i>${active ? 'Ativo' : 'Bloqueado'}</span></td>
          <td>${escapeHTML(formatDateTime(user.last_sign_in_at || user.ultimo_acesso))}</td>
          <td>${escapeHTML(formatDateTime(user.auth_created_at || user.criado_em))}</td>
          <td><div class="table-actions user-actions">
            <button class="action-btn" type="button" data-user-action="edit" data-id="${user.id}" title="Editar usuário"><i class="fa-solid fa-pen"></i></button>
            <button class="action-btn" type="button" data-user-action="reset-email" data-id="${user.id}" title="Enviar redefinição por e-mail"><i class="fa-solid fa-envelope-circle-check"></i></button>
            <button class="action-btn" type="button" data-user-action="password" data-id="${user.id}" title="Definir senha provisória"><i class="fa-solid fa-key"></i></button>
            <button class="action-btn ${active ? 'warning' : 'success'}" type="button" data-user-action="status" data-id="${user.id}" title="${active ? 'Bloquear' : 'Reativar'} usuário" ${current ? 'disabled' : ''}><i class="fa-solid ${active ? 'fa-user-lock' : 'fa-user-check'}"></i></button>
            <button class="action-btn danger" type="button" data-user-action="delete" data-id="${user.id}" title="Excluir usuário" ${current ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>
      `;
    }).join('');
  }

  function render() {
    renderMetrics();
    applyFilters();
    const updated = $('#usersLastUpdate');
    if (updated && state.loadedAt) updated.textContent = `Atualizado em ${formatDateTime(state.loadedAt)}`;
  }

  async function loadUsers({ silent = false } = {}) {
    if (!isAdmin() || state.loading) return;
    setLoading(true);
    try {
      await healthCheck();
      const users = await api('list');
      state.users = Array.isArray(users) ? users : [];
      state.loadedAt = new Date().toISOString();
      render();
      if (!silent) toast('success', 'Usuários atualizados', `${state.users.length} acesso(s) carregado(s).`);
    } catch (error) {
      console.error(error);
      toast('error', 'Falha ao carregar usuários', error.message);
      const body = $('#usersTableBody');
      if (body) body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><strong>Não foi possível carregar os usuários</strong><span>${escapeHTML(error.message)}</span></div></td></tr>`;
    } finally {
      setLoading(false);
    }
  }

  function findUser(id) {
    return state.users.find((user) => user.id === id) || null;
  }

  function togglePassword(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (!input || !button) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.innerHTML = `<i class="fa-regular fa-eye${show ? '-slash' : ''}"></i>`;
  }

  function openCreateUser() {
    $('#userForm')?.reset();
    $('#userId').value = '';
    $('#userRole').value = 'operador';
    $('#userActive').checked = true;
    $('#temporaryPasswordField').classList.remove('hidden');
    $('#userTemporaryPassword').required = true;
    $('#userModalTitle').textContent = 'Cadastrar usuário';
    $('#userModalSubtitle').textContent = 'Crie um acesso com senha provisória.';
    $('#saveUserBtn').innerHTML = '<i class="fa-solid fa-user-plus"></i>Cadastrar usuário';
    setMessage('userFormMessage');
    openModal('userModalBackdrop');
    setTimeout(() => $('#userName')?.focus(), 50);
  }

  function openEditUser(user) {
    if (!user) return;
    $('#userForm')?.reset();
    $('#userId').value = user.id;
    $('#userName').value = user.nome || '';
    $('#userEmail').value = user.email || '';
    $('#userRole').value = user.perfil_id || 'operador';
    $('#userPolo').value = user.polo || '';
    $('#userActive').checked = user.ativo && !user.is_currently_banned;
    $('#temporaryPasswordField').classList.add('hidden');
    $('#userTemporaryPassword').required = false;
    $('#userTemporaryPassword').value = '';
    $('#userModalTitle').textContent = 'Editar usuário';
    $('#userModalSubtitle').textContent = 'Atualize nome, e-mail, perfil, polo e status.';
    $('#saveUserBtn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i>Salvar alterações';
    setMessage('userFormMessage');
    openModal('userModalBackdrop');
    setTimeout(() => $('#userName')?.focus(), 50);
  }

  async function handleUserSubmit(event) {
    event.preventDefault();
    setMessage('userFormMessage');
    const id = $('#userId').value.trim();
    const payload = {
      id,
      nome: $('#userName').value.trim(),
      email: $('#userEmail').value.trim(),
      perfil_id: $('#userRole').value,
      polo: $('#userPolo').value.trim(),
      ativo: $('#userActive').checked,
      password: $('#userTemporaryPassword').value
    };
    if (!payload.nome || !payload.email) {
      setMessage('userFormMessage', 'Preencha o nome e o e-mail.');
      return;
    }
    if (!id && payload.password.length < 8) {
      setMessage('userFormMessage', 'A senha provisória deve possuir pelo menos 8 caracteres.');
      return;
    }

    const button = $('#saveUserBtn');
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>Salvando...';
    try {
      await api(id ? 'update' : 'create', payload);
      closeModal('userModalBackdrop');
      toast('success', id ? 'Usuário atualizado' : 'Usuário criado', id ? 'As alterações foram aplicadas.' : 'O novo acesso já pode ser utilizado.');
      await loadUsers({ silent: true });
      window.auditPanel?.refresh?.();
    } catch (error) {
      setMessage('userFormMessage', error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = id ? '<i class="fa-solid fa-floppy-disk"></i>Salvar alterações' : '<i class="fa-solid fa-user-plus"></i>Cadastrar usuário';
    }
  }

  function openPasswordModal(user) {
    if (!user) return;
    $('#userPasswordForm')?.reset();
    $('#passwordUserId').value = user.id;
    $('#userPasswordSubtitle').textContent = `Defina uma nova senha provisória para ${user.nome || user.email}.`;
    setMessage('userPasswordMessage');
    openModal('userPasswordModalBackdrop');
    setTimeout(() => $('#newTemporaryPassword')?.focus(), 50);
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setMessage('userPasswordMessage');
    const id = $('#passwordUserId').value;
    const password = $('#newTemporaryPassword').value;
    if (password.length < 8) {
      setMessage('userPasswordMessage', 'A senha provisória deve possuir pelo menos 8 caracteres.');
      return;
    }
    const button = $('#saveUserPasswordBtn');
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>Atualizando...';
    try {
      await api('set-password', { id, password });
      closeModal('userPasswordModalBackdrop');
      toast('success', 'Senha atualizada', 'A nova senha provisória já está ativa.');
      window.auditPanel?.refresh?.();
    } catch (error) {
      setMessage('userPasswordMessage', error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-key"></i>Atualizar senha';
    }
  }

  async function sendResetEmail(user) {
    if (!user?.email) return;
    if (!confirm(`Enviar um link de redefinição de senha para ${user.email}?`)) return;
    try {
      const client = getClient();
      if (!client) throw new Error('Cliente do Supabase indisponível.');
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await client.auth.resetPasswordForEmail(user.email, { redirectTo });
      if (error) throw error;
      toast('success', 'E-mail enviado', 'O usuário receberá um link para criar uma nova senha.');
    } catch (error) {
      toast('error', 'Falha no envio', error.message || 'Não foi possível enviar o e-mail.');
    }
  }

  async function toggleStatus(user) {
    if (!user || user.id === window.currentUser?.id) return;
    const active = user.ativo && !user.is_currently_banned;
    const next = !active;
    if (!confirm(`${next ? 'Reativar' : 'Bloquear'} o acesso de ${user.nome || user.email}?`)) return;
    try {
      await api('set-status', { id: user.id, ativo: next });
      toast('success', next ? 'Usuário reativado' : 'Usuário bloqueado', next ? 'O acesso foi liberado.' : 'Novos acessos foram bloqueados imediatamente.');
      await loadUsers({ silent: true });
      window.auditPanel?.refresh?.();
    } catch (error) {
      toast('error', 'Ação não concluída', error.message);
    }
  }

  async function deleteUser(user) {
    if (!user || user.id === window.currentUser?.id) return;
    if (!confirm(`Excluir permanentemente o usuário ${user.nome || user.email}?\n\nO histórico de auditoria será preservado, mas esse acesso não poderá mais entrar no sistema.`)) return;
    try {
      await api('delete', { id: user.id });
      toast('success', 'Usuário excluído', 'O acesso foi removido permanentemente.');
      await loadUsers({ silent: true });
      window.auditPanel?.refresh?.();
    } catch (error) {
      toast('error', 'Exclusão não concluída', error.message);
    }
  }

  function bindEvents() {
    $('#newUserBtn')?.addEventListener('click', openCreateUser);
    $('#usersRefreshBtn')?.addEventListener('click', () => loadUsers());
    $('#userForm')?.addEventListener('submit', handleUserSubmit);
    $('#userPasswordForm')?.addEventListener('submit', handlePasswordSubmit);
    $('#toggleTemporaryPassword')?.addEventListener('click', () => togglePassword('userTemporaryPassword', 'toggleTemporaryPassword'));
    $('#toggleNewTemporaryPassword')?.addEventListener('click', () => togglePassword('newTemporaryPassword', 'toggleNewTemporaryPassword'));
    $('#userSearch')?.addEventListener('input', applyFilters);
    $('#userRoleFilter')?.addEventListener('change', applyFilters);
    $('#userStatusFilter')?.addEventListener('change', applyFilters);
    $('#usersClearFilters')?.addEventListener('click', () => {
      $('#userSearch').value = '';
      $('#userRoleFilter').value = '';
      $('#userStatusFilter').value = '';
      applyFilters();
    });

    $$('[data-user-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.userClose)));
    ['userModalBackdrop', 'userPasswordModalBackdrop'].forEach((id) => {
      document.getElementById(id)?.addEventListener('mousedown', (event) => {
        if (event.target.id === id) closeModal(id);
      });
    });

    $('#usersTableBody')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-user-action]');
      if (!button || button.disabled) return;
      const user = findUser(button.dataset.id);
      if (!user) return;
      const action = button.dataset.userAction;
      if (action === 'edit') openEditUser(user);
      else if (action === 'reset-email') sendResetEmail(user);
      else if (action === 'password') openPasswordModal(user);
      else if (action === 'status') toggleStatus(user);
      else if (action === 'delete') deleteUser(user);
    });
  }

  function open() {
    if (!isAdmin()) return;
    if (!state.loadedAt || Date.now() - new Date(state.loadedAt).getTime() > 30000) loadUsers({ silent: true });
    else {
      render();
      healthCheck().catch(() => {});
    }
  }

  document.addEventListener('auth:ready', () => {
    if (isAdmin() && $('#panel-usuarios')?.classList.contains('active')) loadUsers({ silent: true });
  });
  document.addEventListener('auth:signed-out', () => {
    state.users = [];
    state.filtered = [];
    state.loadedAt = 0;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEvents, { once: true });
  else bindEvents();

  window.userManagement = Object.freeze({ open, refresh: () => loadUsers({ silent: true }) });
})();
