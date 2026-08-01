(() => {
  'use strict';

  const client = window.database?.client || null;
  const roleLabels = {
    administrador: 'Administrador',
    gestor: 'Gestor',
    operador: 'Operador',
    consulta: 'Consulta'
  };

  let currentProfile = null;
  let activationId = 0;
  let recoveryMode = /(?:[?#&])type=recovery(?:[&#]|$)/i.test(window.location.href);
  let nextSignedOutNotice = null;

  const $ = (selector) => document.querySelector(selector);

  function setView(viewId) {
    ['authLoadingView', 'loginForm', 'forgotPasswordForm', 'newPasswordForm'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.classList.toggle('hidden', id !== viewId);
    });
  }

  function setMessage(elementId, message = '', type = 'error') {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = message;
    element.className = `auth-message ${message ? '' : 'hidden'} auth-message-${type}`.trim();
  }

  function setButtonLoading(button, loading, loadingText, defaultHtml) {
    if (!button) return;
    button.disabled = loading;
    button.innerHTML = loading
      ? `<i class="fa-solid fa-circle-notch fa-spin"></i>${loadingText}`
      : defaultHtml;
  }

  function authErrorMessage(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (message.includes('email not confirmed')) return 'O e-mail ainda não foi confirmado.';
    if (message.includes('user not found')) return 'Usuário não encontrado.';
    if (message.includes('too many requests') || message.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (message.includes('network') || message.includes('fetch')) return 'Não foi possível conectar ao serviço de autenticação.';
    if (message.includes('password should be')) return 'A senha deve possuir pelo menos 8 caracteres.';
    return error?.message || 'Não foi possível concluir a operação.';
  }

  function initials(name, email) {
    const source = String(name || '').trim();
    if (source) {
      const parts = source.split(/\s+/).filter(Boolean);
      return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
    }
    return String(email || 'U').slice(0, 1).toUpperCase();
  }

  function showGuest(message = '', messageType = 'error') {
    activationId += 1;
    currentProfile = null;
    window.currentUser = null;
    delete document.body.dataset.userRole;
    document.body.classList.remove('auth-pending', 'authenticated');
    document.body.classList.add('auth-guest');
    $('#mainApplication')?.setAttribute('aria-hidden', 'true');
    $('#authShell')?.setAttribute('aria-hidden', 'false');
    setView('loginForm');
    setMessage('loginMessage', message, messageType);
    $('#userMenuPopover')?.classList.add('hidden');
    $('#userMenuToggle')?.setAttribute('aria-expanded', 'false');
    setTimeout(() => $('#loginEmail')?.focus(), 50);
  }

  function fillUserUI(profile, authUser) {
    const name = profile.nome?.trim() || authUser.email || 'Usuário';
    const email = profile.email || authUser.email || '—';
    const role = roleLabels[profile.perfil_id] || profile.perfil_id || 'Usuário';
    const avatar = initials(name, email);

    const values = {
      authUserName: name,
      authUserRole: role,
      authProfileName: name,
      authProfileEmail: email,
      authProfileRole: role,
      authUserAvatar: avatar,
      authUserAvatarLarge: avatar
    };

    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  async function loadProfile(userId) {
    const { data, error } = await client
      .from('usuarios')
      .select('id,nome,email,perfil_id,polo,ativo,ultimo_acesso')
      .eq('id', userId)
      .single();

    if (error) throw error;
    if (!data) throw new Error('Perfil de usuário não encontrado.');
    if (!data.ativo) throw new Error('Este usuário está bloqueado. Procure um administrador.');
    return data;
  }

  async function registerLastAccess() {
    try {
      await client.rpc('registrar_ultimo_acesso');
    } catch (error) {
      console.warn('[Auth] Não foi possível registrar o último acesso:', error);
    }
  }

  async function activateSession(session) {
    const requestId = ++activationId;
    if (!session?.user) {
      showGuest();
      return;
    }

    if (recoveryMode) {
      document.body.classList.remove('auth-pending', 'authenticated');
      document.body.classList.add('auth-guest');
      setView('newPasswordForm');
      $('#newPassword')?.focus();
      return;
    }

    setView('authLoadingView');
    document.body.classList.add('auth-pending');

    try {
      const profile = await loadProfile(session.user.id);
      if (requestId !== activationId) return;

      currentProfile = profile;
      window.currentUser = Object.freeze({
        id: session.user.id,
        email: session.user.email,
        nome: profile.nome,
        perfil: profile.perfil_id,
        polo: profile.polo,
        ativo: profile.ativo
      });

      document.body.dataset.userRole = String(profile.perfil_id || '').trim().toLowerCase();
      fillUserUI(profile, session.user);
      document.body.classList.remove('auth-pending', 'auth-guest');
      document.body.classList.add('authenticated');
      $('#mainApplication')?.setAttribute('aria-hidden', 'false');
      $('#authShell')?.setAttribute('aria-hidden', 'true');
      setMessage('loginMessage');
      registerLastAccess();
      document.dispatchEvent(new CustomEvent('auth:ready', { detail: window.currentUser }));
    } catch (error) {
      if (requestId !== activationId) return;
      nextSignedOutNotice = { message: authErrorMessage(error), type: 'error' };
      await client.auth.signOut();
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setMessage('loginMessage');

    const email = $('#loginEmail')?.value.trim() || '';
    const password = $('#loginPassword')?.value || '';
    if (!email || !password) {
      setMessage('loginMessage', 'Preencha o e-mail e a senha.');
      return;
    }

    const button = $('#loginSubmit');
    setButtonLoading(button, true, 'Entrando...', '<i class="fa-solid fa-right-to-bracket"></i>Entrar');

    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await activateSession(data.session);
    } catch (error) {
      setMessage('loginMessage', authErrorMessage(error));
    } finally {
      setButtonLoading(button, false, '', '<i class="fa-solid fa-right-to-bracket"></i>Entrar');
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setMessage('forgotMessage');
    const email = $('#resetEmail')?.value.trim() || '';
    if (!email) {
      setMessage('forgotMessage', 'Informe seu e-mail.');
      return;
    }

    const button = $('#forgotSubmit');
    setButtonLoading(button, true, 'Enviando...', '<i class="fa-solid fa-paper-plane"></i>Enviar link de recuperação');

    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setMessage('forgotMessage', 'Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.', 'success');
    } catch (error) {
      setMessage('forgotMessage', authErrorMessage(error));
    } finally {
      setButtonLoading(button, false, '', '<i class="fa-solid fa-paper-plane"></i>Enviar link de recuperação');
    }
  }

  async function handleNewPassword(event) {
    event.preventDefault();
    setMessage('newPasswordMessage');
    const password = $('#newPassword')?.value || '';
    const confirmation = $('#confirmNewPassword')?.value || '';

    if (password.length < 8) {
      setMessage('newPasswordMessage', 'A nova senha deve possuir pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setMessage('newPasswordMessage', 'As senhas informadas não são iguais.');
      return;
    }

    const button = $('#newPasswordSubmit');
    setButtonLoading(button, true, 'Salvando...', '<i class="fa-solid fa-key"></i>Salvar nova senha');

    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      recoveryMode = false;
      nextSignedOutNotice = { message: 'Senha alterada com sucesso. Entre com a nova senha.', type: 'success' };
      await client.auth.signOut();
      history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      setMessage('newPasswordMessage', authErrorMessage(error));
    } finally {
      setButtonLoading(button, false, '', '<i class="fa-solid fa-key"></i>Salvar nova senha');
    }
  }

  async function handleLogout() {
    const button = $('#logoutBtn');
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>Saindo...';
    }
    try {
      nextSignedOutNotice = { message: 'Sessão encerrada com segurança.', type: 'success' };
      await client.auth.signOut();
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket"></i>Sair do sistema';
      }
    }
  }

  function togglePassword() {
    const input = $('#loginPassword');
    const button = $('#toggleLoginPassword');
    if (!input || !button) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.innerHTML = `<i class="fa-regular fa-eye${show ? '-slash' : ''}"></i>`;
    button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    button.title = show ? 'Ocultar senha' : 'Mostrar senha';
  }

  function bindEvents() {
    $('#loginForm')?.addEventListener('submit', handleLogin);
    $('#forgotPasswordForm')?.addEventListener('submit', handleForgotPassword);
    $('#newPasswordForm')?.addEventListener('submit', handleNewPassword);
    $('#toggleLoginPassword')?.addEventListener('click', togglePassword);
    $('#openForgotPassword')?.addEventListener('click', () => {
      setMessage('forgotMessage');
      const loginEmail = $('#loginEmail')?.value.trim();
      if (loginEmail && $('#resetEmail')) $('#resetEmail').value = loginEmail;
      setView('forgotPasswordForm');
      $('#resetEmail')?.focus();
    });
    $('#backToLoginFromForgot')?.addEventListener('click', () => showGuest());
    $('#logoutBtn')?.addEventListener('click', handleLogout);

    $('#userMenuToggle')?.addEventListener('click', () => {
      const popover = $('#userMenuPopover');
      const toggle = $('#userMenuToggle');
      if (!popover || !toggle) return;
      const willOpen = popover.classList.contains('hidden');
      popover.classList.toggle('hidden', !willOpen);
      toggle.setAttribute('aria-expanded', String(willOpen));
    });

    document.addEventListener('click', (event) => {
      const menu = $('#userMenu');
      if (menu && !menu.contains(event.target)) {
        $('#userMenuPopover')?.classList.add('hidden');
        $('#userMenuToggle')?.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        $('#userMenuPopover')?.classList.add('hidden');
        $('#userMenuToggle')?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  async function boot() {
    bindEvents();

    if (!client) {
      showGuest('A conexão com o Supabase não está configurada. Verifique o arquivo js/supabase-config.js.');
      return;
    }

    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode = true;
        setTimeout(() => activateSession(session), 0);
        return;
      }
      if (event === 'SIGNED_OUT') {
        const notice = nextSignedOutNotice;
        nextSignedOutNotice = null;
        document.dispatchEvent(new CustomEvent('auth:signed-out'));
        setTimeout(() => showGuest(notice?.message || '', notice?.type || 'error'), 0);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => activateSession(session), 0);
      }
    });

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      await activateSession(data.session);
    } catch (error) {
      showGuest(authErrorMessage(error));
    }
  }

  window.authManager = Object.freeze({
    get profile() { return currentProfile; },
    signOut: handleLogout
  });

  function startBoot() {
    if (window.__conveniosAuthBootStarted) return;
    window.__conveniosAuthBootStarted = true;

    // Evita que a interface permaneça indefinidamente em “Verificando acesso”.
    window.setTimeout(() => {
      if (document.body?.classList.contains('auth-pending')) {
        console.warn('[Auth] Tempo limite da validação inicial atingido. Exibindo o login.');
        showGuest('A validação automática demorou mais que o esperado. Informe seu e-mail e senha para entrar.', 'warning');
      }
    }, 7000);

    Promise.resolve(boot()).catch((error) => {
      console.error('[Auth] Falha durante a inicialização:', error);
      showGuest(authErrorMessage(error));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startBoot, { once: true });
  } else {
    startBoot();
  }
})();
