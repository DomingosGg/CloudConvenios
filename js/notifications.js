(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const client = window.database?.client || null;
  const NATIVE_PREF_KEY = 'gestao_convenios_native_notifications';
  const CLOSED_STATUSES = new Set(['Renovado', 'Convênio encerrado', 'Não possui interesse']);
  const PRIORITY_ORDER = { critica: 0, alta: 1, media: 2, baixa: 3 };

  const state = {
    alerts: [],
    userStates: new Map(),
    initialized: false,
    loading: false,
    persistenceAvailable: true,
    filter: { search: '', priority: '', category: '', status: 'active' },
    nativeSeen: new Set(),
    refreshTimer: null
  };

  const todayISO = () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  };

  const parseDate = (value) => value ? new Date(`${value}T12:00:00`) : null;
  const daysBetween = (a, b) => Math.ceil((b - a) / 86400000);
  const formatDate = (value) => value ? parseDate(value).toLocaleDateString('pt-BR') : '—';
  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
  const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nowISO = () => new Date().toISOString();

  function addDaysISO(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function toast(type, title, message) {
    const container = $('#toastContainer');
    if (!container) return;
    const icons = {
      success: 'fa-circle-check', error: 'fa-circle-xmark',
      warning: 'fa-triangle-exclamation', info: 'fa-circle-info'
    };
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span></div>`;
    container.appendChild(element);
    setTimeout(() => {
      element.style.opacity = '0';
      element.style.transform = 'translateX(20px)';
      setTimeout(() => element.remove(), 250);
    }, 4600);
  }

  function currentUserId() {
    return window.currentUser?.id || null;
  }

  function companyName(company) {
    return company.nomeFantasia || company.razaoSocial || 'Concedente sem nome';
  }

  function latestContact(company) {
    return [...(company.contatos || [])]
      .sort((a, b) => `${b.data || ''} ${b.horario || ''}`.localeCompare(`${a.data || ''} ${a.horario || ''}`))[0] || null;
  }

  function createAlert(company, definition) {
    const marker = definition.marker || definition.dueDate || 'atual';
    return {
      id: `${definition.category}:${company.id}:${marker}`,
      companyId: company.id,
      companyName: companyName(company),
      city: company.cidade || '',
      state: company.estado || '',
      polo: company.polo || '',
      ...definition
    };
  }

  function buildAlerts(companies) {
    const today = todayISO();
    const todayDate = parseDate(today);
    const generated = [];

    (companies || []).forEach((company) => {
      const closed = CLOSED_STATUSES.has(company.situacao);
      const name = companyName(company);

      if (!closed) {
        if (company.fimVigencia) {
          const remaining = daysBetween(todayDate, parseDate(company.fimVigencia));
          if (remaining < 0) {
            generated.push(createAlert(company, {
              category: 'vigencia', priority: 'critica', icon: 'fa-calendar-xmark',
              title: `Convênio vencido — ${name}`,
              detail: `A vigência terminou em ${formatDate(company.fimVigencia)}, há ${Math.abs(remaining)} dia(s).`,
              dueDate: company.fimVigencia, marker: `vencido-${company.fimVigencia}`, action: 'company'
            }));
          } else if (remaining <= 30) {
            generated.push(createAlert(company, {
              category: 'vigencia', priority: 'critica', icon: 'fa-triangle-exclamation',
              title: `Vencimento crítico — ${name}`,
              detail: remaining === 0
                ? `A vigência termina hoje, ${formatDate(company.fimVigencia)}.`
                : `Faltam ${remaining} dia(s) para o término da vigência, em ${formatDate(company.fimVigencia)}.`,
              dueDate: company.fimVigencia, marker: `30-${company.fimVigencia}`, action: 'company'
            }));
          } else if (remaining <= 60) {
            generated.push(createAlert(company, {
              category: 'vigencia', priority: 'alta', icon: 'fa-clock',
              title: `Vencimento em até 60 dias — ${name}`,
              detail: `Faltam ${remaining} dia(s) para o término da vigência.`,
              dueDate: company.fimVigencia, marker: `60-${company.fimVigencia}`, action: 'company'
            }));
          } else if (remaining <= 90) {
            generated.push(createAlert(company, {
              category: 'vigencia', priority: 'media', icon: 'fa-calendar-days',
              title: `Vencimento em até 90 dias — ${name}`,
              detail: `Faltam ${remaining} dia(s) para o término da vigência.`,
              dueDate: company.fimVigencia, marker: `90-${company.fimVigencia}`, action: 'company'
            }));
          }
        } else {
          generated.push(createAlert(company, {
            category: 'cadastro', priority: 'baixa', icon: 'fa-calendar-minus',
            title: `Vigência não informada — ${name}`,
            detail: 'Cadastre a data final para que o sistema acompanhe o vencimento.',
            marker: 'sem-vigencia', action: 'company'
          }));
        }

        const contacts = company.contatos || [];
        if (!contacts.length) {
          generated.push(createAlert(company, {
            category: 'contato', priority: company.situacao === 'Não contatado' ? 'alta' : 'media',
            icon: 'fa-phone-slash', title: `Nenhum contato registrado — ${name}`,
            detail: 'A concedente ainda não possui histórico de contato.',
            marker: 'sem-contato', action: 'contacts'
          }));
        } else {
          const latest = latestContact(company);
          const followUpDate = latest?.proximaData || '';
          if (followUpDate) {
            const remaining = daysBetween(todayDate, parseDate(followUpDate));
            if (remaining < 0) {
              generated.push(createAlert(company, {
                category: 'acompanhamento', priority: 'critica', icon: 'fa-user-clock',
                title: `Acompanhamento atrasado — ${name}`,
                detail: `O próximo contato estava previsto para ${formatDate(followUpDate)}, há ${Math.abs(remaining)} dia(s).`,
                dueDate: followUpDate, marker: `atrasado-${followUpDate}`, action: 'contacts'
              }));
            } else if (remaining === 0) {
              generated.push(createAlert(company, {
                category: 'acompanhamento', priority: 'alta', icon: 'fa-phone-volume',
                title: `Contato previsto para hoje — ${name}`,
                detail: latest.proximaAcao || 'Existe uma ação de acompanhamento prevista para hoje.',
                dueDate: followUpDate, marker: `hoje-${followUpDate}`, action: 'contacts'
              }));
            } else if (remaining <= 7) {
              generated.push(createAlert(company, {
                category: 'acompanhamento', priority: 'media', icon: 'fa-calendar-check',
                title: `Contato nos próximos 7 dias — ${name}`,
                detail: `Próximo acompanhamento em ${formatDate(followUpDate)}. ${latest.proximaAcao || ''}`.trim(),
                dueDate: followUpDate, marker: `semana-${followUpDate}`, action: 'contacts'
              }));
            }
          } else if (company.situacao === 'Aguardando retorno') {
            generated.push(createAlert(company, {
              category: 'acompanhamento', priority: 'media', icon: 'fa-hourglass-half',
              title: `Aguardando retorno sem nova data — ${name}`,
              detail: 'Defina uma data para o próximo contato e evite perder o acompanhamento.',
              marker: 'aguardando-sem-data', action: 'contacts'
            }));
          }
        }
      }
    });

    return generated.map((alert) => {
      const saved = state.userStates.get(alert.id) || {};
      const snoozed = Boolean(saved.adiada_ate && saved.adiada_ate >= today);
      const dismissed = Boolean(saved.dispensada_em);
      return {
        ...alert,
        read: Boolean(saved.lida_em),
        readAt: saved.lida_em || null,
        dismissed,
        dismissedAt: saved.dispensada_em || null,
        snoozed,
        snoozedUntil: saved.adiada_ate || null,
        active: !dismissed && !snoozed
      };
    }).sort((a, b) => {
      const priority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priority !== 0) return priority;
      return String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31'));
    });
  }

  async function loadUserStates() {
    if (!client || !currentUserId()) return;
    const { data, error } = await client
      .from('notificacoes_usuario')
      .select('alerta_id,lida_em,dispensada_em,adiada_ate')
      .eq('usuario_id', currentUserId());

    if (error) {
      state.persistenceAvailable = false;
      console.warn('[Notificações] Não foi possível carregar o estado individual:', error);
      return;
    }

    state.persistenceAvailable = true;
    state.userStates = new Map((data || []).map((row) => [row.alerta_id, row]));
  }

  async function saveState(alertId, changes) {
    if (!client || !currentUserId()) return;
    const current = state.userStates.get(alertId) || {};
    const payload = {
      usuario_id: currentUserId(),
      alerta_id: alertId,
      lida_em: current.lida_em || null,
      dispensada_em: current.dispensada_em || null,
      adiada_ate: current.adiada_ate || null,
      ...changes
    };

    const { data, error } = await client
      .from('notificacoes_usuario')
      .upsert(payload, { onConflict: 'usuario_id,alerta_id' })
      .select('alerta_id,lida_em,dispensada_em,adiada_ate')
      .single();

    if (error) throw error;
    state.userStates.set(alertId, data);
  }

  async function markRead(alertId, read = true, { silent = false } = {}) {
    try {
      await saveState(alertId, { lida_em: read ? nowISO() : null });
      refreshFromData({ native: false });
    } catch (error) {
      console.error(error);
      if (!silent) toast('error', 'Não foi possível atualizar', 'O estado da notificação não foi salvo.');
    }
  }

  async function markAllRead() {
    const unread = state.alerts.filter((alert) => alert.active && !alert.read);
    if (!unread.length) {
      toast('info', 'Tudo em dia', 'Não existem notificações não lidas.');
      return;
    }

    try {
      const timestamp = nowISO();
      const rows = unread.map((alert) => {
        const current = state.userStates.get(alert.id) || {};
        return {
          usuario_id: currentUserId(), alerta_id: alert.id,
          lida_em: timestamp,
          dispensada_em: current.dispensada_em || null,
          adiada_ate: current.adiada_ate || null
        };
      });
      const { data, error } = await client
        .from('notificacoes_usuario')
        .upsert(rows, { onConflict: 'usuario_id,alerta_id' })
        .select('alerta_id,lida_em,dispensada_em,adiada_ate');
      if (error) throw error;
      (data || []).forEach((row) => state.userStates.set(row.alerta_id, row));
      refreshFromData({ native: false });
      toast('success', 'Notificações atualizadas', `${unread.length} notificação(ões) marcada(s) como lida(s).`);
    } catch (error) {
      console.error(error);
      toast('error', 'Falha ao atualizar', 'Não foi possível marcar todas as notificações como lidas.');
    }
  }

  async function snooze(alertId, days) {
    try {
      await saveState(alertId, { lida_em: nowISO(), adiada_ate: addDaysISO(days), dispensada_em: null });
      refreshFromData({ native: false });
      toast('success', 'Lembrete adiado', `A notificação voltará em ${days} dia(s).`);
    } catch (error) {
      console.error(error);
      toast('error', 'Não foi possível adiar', 'Tente novamente em alguns instantes.');
    }
  }

  async function dismiss(alertId) {
    try {
      await saveState(alertId, { lida_em: nowISO(), dispensada_em: nowISO(), adiada_ate: null });
      refreshFromData({ native: false });
      toast('success', 'Notificação dispensada', 'Este alerta ficará oculto enquanto a condição não mudar.');
    } catch (error) {
      console.error(error);
      toast('error', 'Não foi possível dispensar', 'Tente novamente em alguns instantes.');
    }
  }

  async function restore(alertId) {
    try {
      await saveState(alertId, { dispensada_em: null, adiada_ate: null });
      refreshFromData({ native: false });
      toast('success', 'Notificação restaurada', 'O alerta voltou para a lista de pendências.');
    } catch (error) {
      console.error(error);
      toast('error', 'Não foi possível restaurar', 'Tente novamente em alguns instantes.');
    }
  }

  function priorityMeta(priority) {
    return {
      critica: { label: 'Crítica', icon: 'fa-circle-exclamation' },
      alta: { label: 'Alta', icon: 'fa-triangle-exclamation' },
      media: { label: 'Média', icon: 'fa-circle-info' },
      baixa: { label: 'Baixa', icon: 'fa-circle' }
    }[priority] || { label: priority, icon: 'fa-circle-info' };
  }

  function categoryLabel(category) {
    return ({
      vigencia: 'Vigência', contato: 'Sem contato', acompanhamento: 'Acompanhamento', cadastro: 'Cadastro'
    })[category] || category;
  }

  function renderBadgeAndPopover() {
    const active = state.alerts.filter((alert) => alert.active);
    const unread = active.filter((alert) => !alert.read);
    const badge = $('#alertCount');
    if (badge) {
      badge.textContent = unread.length > 99 ? '99+' : String(unread.length);
      badge.classList.toggle('hidden', unread.length === 0);
    }

    const summary = $('#notificationUnreadSummary');
    if (summary) summary.textContent = unread.length ? `${unread.length} não lida(s)` : 'Nenhuma não lida';

    const list = $('#alertList');
    if (!list) return;
    const items = unread.slice(0, 7);
    list.innerHTML = items.length ? items.map((alert) => {
      const meta = priorityMeta(alert.priority);
      return `
        <article class="notification-mini-item is-unread priority-${alert.priority}">
          <span class="notification-mini-icon"><i class="fa-solid ${escapeHTML(alert.icon || meta.icon)}"></i></span>
          <button class="notification-mini-open" type="button" data-notification-open="${escapeHTML(alert.id)}" title="Abrir concedente">
            <span class="notification-mini-content">
              <strong>${escapeHTML(alert.title)}</strong>
              <small>${escapeHTML(alert.detail)}</small>
              <span>${escapeHTML(meta.label)} · ${escapeHTML(categoryLabel(alert.category))}${alert.dueDate ? ` · ${escapeHTML(formatDate(alert.dueDate))}` : ''}</span>
            </span>
          </button>
          <button class="notification-mini-read" type="button" data-notification-read-one="${escapeHTML(alert.id)}" title="Marcar apenas esta notificação como lida" aria-label="Marcar como lida">
            <i class="fa-solid fa-eye"></i>
          </button>
        </article>
      `;
    }).join('') : `
      <div class="notification-empty">
        <i class="fa-solid fa-circle-check"></i>
        <strong>Nenhuma notificação não lida</strong>
        <span>As notificações marcadas como lidas continuam disponíveis no painel completo.</span>
      </div>`;

    if (unread.length > items.length) {
      list.insertAdjacentHTML('beforeend', `<div class="notification-more">Mais ${unread.length - items.length} notificação(ões) não lida(s) no painel completo.</div>`);
    }
  }

  function filteredAlerts() {
    const { search, priority, category, status } = state.filter;
    return state.alerts.filter((alert) => {
      if (priority && alert.priority !== priority) return false;
      if (category && alert.category !== category) return false;
      if (status === 'active' && !alert.active) return false;
      if (status === 'unread' && (!alert.active || alert.read)) return false;
      if (status === 'read' && (!alert.active || !alert.read)) return false;
      if (status === 'snoozed' && !alert.snoozed) return false;
      if (status === 'dismissed' && !alert.dismissed) return false;
      if (search) {
        const haystack = normalize(`${alert.title} ${alert.detail} ${alert.companyName} ${alert.city} ${alert.state} ${alert.polo}`);
        if (!haystack.includes(normalize(search))) return false;
      }
      return true;
    });
  }

  function renderMetrics() {
    const active = state.alerts.filter((alert) => alert.active);
    const values = [
      ['Pendências ativas', active.length, 'fa-bell', 'primary'],
      ['Não lidas', active.filter((alert) => !alert.read).length, 'fa-envelope-open-text', 'blue'],
      ['Críticas', active.filter((alert) => alert.priority === 'critica').length, 'fa-circle-exclamation', 'danger'],
      ['Acompanhamentos atrasados', active.filter((alert) => alert.category === 'acompanhamento' && alert.priority === 'critica').length, 'fa-user-clock', 'warning'],
      ['Vigências urgentes', active.filter((alert) => alert.category === 'vigencia' && ['critica', 'alta'].includes(alert.priority)).length, 'fa-calendar-xmark', 'orange']
    ];

    const container = $('#notificationMetrics');
    if (!container) return;
    container.innerHTML = values.map(([label, value, icon, tone]) => `
      <article class="card notification-metric metric-${tone}">
        <span class="notification-metric-icon"><i class="fa-solid ${icon}"></i></span>
        <div><strong>${value}</strong><span>${escapeHTML(label)}</span></div>
      </article>
    `).join('');
  }

  function renderPanel() {
    renderMetrics();
    const rows = filteredAlerts();
    const count = $('#notificationResultCount');
    if (count) count.textContent = `${rows.length} notificação(ões)`;

    const list = $('#notificationCenterList');
    if (!list) return;
    list.innerHTML = rows.length ? rows.map((alert) => {
      const meta = priorityMeta(alert.priority);
      const status = alert.dismissed ? 'Dispensada' : alert.snoozed ? `Adiada até ${formatDate(alert.snoozedUntil)}` : alert.read ? 'Lida' : 'Não lida';
      return `
        <article class="notification-card priority-${alert.priority} ${alert.read ? 'is-read' : 'is-unread'} ${alert.active ? '' : 'is-inactive'}" data-notification-id="${escapeHTML(alert.id)}">
          <div class="notification-card-icon"><i class="fa-solid ${escapeHTML(alert.icon || meta.icon)}"></i></div>
          <div class="notification-card-main">
            <div class="notification-card-heading">
              <div>
                <div class="notification-card-tags">
                  <span class="notification-priority priority-${alert.priority}">${escapeHTML(meta.label)}</span>
                  <span class="badge badge-muted">${escapeHTML(categoryLabel(alert.category))}</span>
                  <span class="notification-read-status">${escapeHTML(status)}</span>
                </div>
                <h3>${escapeHTML(alert.title)}</h3>
              </div>
              ${alert.read ? '' : '<span class="notification-unread-dot" aria-label="Não lida"></span>'}
            </div>
            <p>${escapeHTML(alert.detail)}</p>
            <div class="notification-card-meta">
              <span><i class="fa-solid fa-building"></i>${escapeHTML(alert.companyName)}</span>
              <span><i class="fa-solid fa-location-dot"></i>${escapeHTML([alert.city, alert.state].filter(Boolean).join('/') || 'Local não informado')}</span>
              ${alert.polo ? `<span><i class="fa-solid fa-map-pin"></i>${escapeHTML(alert.polo)}</span>` : ''}
              ${alert.dueDate ? `<span><i class="fa-regular fa-calendar"></i>${escapeHTML(formatDate(alert.dueDate))}</span>` : ''}
            </div>
            <div class="notification-card-actions">
              <button class="btn btn-sm btn-primary" type="button" data-notification-open="${escapeHTML(alert.id)}"><i class="fa-solid fa-arrow-up-right-from-square"></i>Abrir</button>
              ${alert.active ? `<button class="btn btn-sm btn-secondary" type="button" data-notification-read="${escapeHTML(alert.id)}"><i class="fa-solid ${alert.read ? 'fa-envelope' : 'fa-envelope-open'}"></i>${alert.read ? 'Marcar não lida' : 'Marcar lida'}</button>` : ''}
              ${alert.active ? `<button class="btn btn-sm btn-secondary" type="button" data-notification-snooze="${escapeHTML(alert.id)}" data-days="1"><i class="fa-regular fa-clock"></i>Adiar 1 dia</button>` : ''}
              ${alert.active ? `<button class="btn btn-sm btn-secondary" type="button" data-notification-snooze="${escapeHTML(alert.id)}" data-days="7"><i class="fa-regular fa-calendar"></i>Adiar 7 dias</button>` : ''}
              ${alert.active ? `<button class="btn btn-sm btn-ghost-danger" type="button" data-notification-dismiss="${escapeHTML(alert.id)}"><i class="fa-solid fa-eye-slash"></i>Dispensar</button>` : `<button class="btn btn-sm btn-secondary" type="button" data-notification-restore="${escapeHTML(alert.id)}"><i class="fa-solid fa-rotate-left"></i>Restaurar</button>`}
            </div>
          </div>
        </article>
      `;
    }).join('') : `
      <div class="notification-empty notification-empty-panel">
        <i class="fa-solid fa-bell-slash"></i>
        <strong>Nenhuma notificação encontrada</strong>
        <span>Ajuste os filtros ou aguarde novas pendências de vigência e acompanhamento.</span>
      </div>`;
  }

  function maybeShowNativeNotifications() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (localStorage.getItem(NATIVE_PREF_KEY) !== 'enabled') return;

    const candidates = state.alerts.filter((alert) => alert.active && !alert.read && ['critica', 'alta'].includes(alert.priority));
    if (!state.initialized) {
      candidates.forEach((alert) => state.nativeSeen.add(alert.id));
      return;
    }

    candidates.filter((alert) => !state.nativeSeen.has(alert.id)).slice(0, 3).forEach((alert) => {
      state.nativeSeen.add(alert.id);
      try {
        const notification = new Notification(alert.title, {
          body: alert.detail,
          tag: alert.id,
          icon: '/favicon.ico'
        });
        notification.onclick = () => {
          window.focus();
          openAlert(alert.id);
          notification.close();
        };
      } catch (error) {
        console.warn('[Notificações] Aviso nativo não pôde ser exibido:', error);
      }
    });
  }

  async function enableNativeNotifications() {
    if (!('Notification' in window)) {
      toast('warning', 'Recurso indisponível', 'Este navegador não oferece notificações nativas.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        localStorage.setItem(NATIVE_PREF_KEY, 'enabled');
        state.alerts.filter((alert) => alert.active).forEach((alert) => state.nativeSeen.add(alert.id));
        updateNativeButton();
        toast('success', 'Notificações ativadas', 'Novos alertas urgentes poderão aparecer enquanto o sistema estiver aberto.');
      } else {
        localStorage.removeItem(NATIVE_PREF_KEY);
        updateNativeButton();
        toast('warning', 'Permissão não concedida', 'As notificações continuarão disponíveis dentro do sistema.');
      }
    } catch (error) {
      console.error(error);
      toast('error', 'Falha ao ativar', 'Não foi possível solicitar a permissão do navegador.');
    }
  }

  function updateNativeButton() {
    const button = $('#enableBrowserNotifications');
    if (!button) return;
    if (!('Notification' in window)) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-ban"></i>Indisponível neste navegador';
      return;
    }
    const enabled = Notification.permission === 'granted' && localStorage.getItem(NATIVE_PREF_KEY) === 'enabled';
    button.disabled = false;
    button.innerHTML = enabled
      ? '<i class="fa-solid fa-bell"></i>Notificações do navegador ativas'
      : '<i class="fa-regular fa-bell"></i>Ativar notificações do navegador';
  }

  async function openAlert(alertId) {
    const alert = state.alerts.find((item) => item.id === alertId);
    if (!alert) return;
    if (!alert.read) await markRead(alertId, true, { silent: true });
    $('#notificationPopover')?.classList.add('hidden');
    if (alert.action === 'contacts') window.conveniosApp?.openContacts?.(alert.companyId);
    else window.conveniosApp?.openCompany?.(alert.companyId);
  }

  function bindDynamicActions(root = document) {
    $$('[data-notification-open]', root).forEach((button) => {
      button.onclick = () => openAlert(button.dataset.notificationOpen);
    });
    $$('[data-notification-read]', root).forEach((button) => {
      button.onclick = () => {
        const alert = state.alerts.find((item) => item.id === button.dataset.notificationRead);
        if (alert) markRead(alert.id, !alert.read);
      };
    });
    $$('[data-notification-read-one]', root).forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        markRead(button.dataset.notificationReadOne, true);
      };
    });
    $$('[data-notification-snooze]', root).forEach((button) => {
      button.onclick = () => snooze(button.dataset.notificationSnooze, Number(button.dataset.days || 1));
    });
    $$('[data-notification-dismiss]', root).forEach((button) => {
      button.onclick = () => dismiss(button.dataset.notificationDismiss);
    });
    $$('[data-notification-restore]', root).forEach((button) => {
      button.onclick = () => restore(button.dataset.notificationRestore);
    });
  }

  function render() {
    renderBadgeAndPopover();
    renderPanel();
    bindDynamicActions($('#notificationPopover') || document);
    bindDynamicActions($('#panel-notificacoes') || document);
    updateNativeButton();
  }

  function refreshFromData({ native = true } = {}) {
    if (!window.currentUser?.id) return;
    const companies = window.conveniosApp?.getCompanies?.() || [];
    state.alerts = buildAlerts(companies);
    render();
    if (native) maybeShowNativeNotifications();
    state.initialized = true;
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => refreshFromData(), 80);
  }

  async function initialize() {
    if (state.loading || !window.currentUser?.id) return;
    state.loading = true;
    try {
      await loadUserStates();
      refreshFromData({ native: false });
      state.alerts.filter((alert) => alert.active).forEach((alert) => state.nativeSeen.add(alert.id));
      state.initialized = true;
      if (!state.persistenceAvailable) {
        toast('warning', 'Notificações parcialmente disponíveis', 'Execute o SQL da Etapa 5 para salvar leituras, adiamentos e dispensas.');
      }
    } finally {
      state.loading = false;
    }
  }

  function resetFilters() {
    state.filter = { search: '', priority: '', category: '', status: 'active' };
    if ($('#notificationSearch')) $('#notificationSearch').value = '';
    if ($('#notificationPriorityFilter')) $('#notificationPriorityFilter').value = '';
    if ($('#notificationCategoryFilter')) $('#notificationCategoryFilter').value = '';
    if ($('#notificationStatusFilter')) $('#notificationStatusFilter').value = 'active';
    renderPanel();
    bindDynamicActions($('#panel-notificacoes') || document);
  }

  function bindStaticEvents() {
    $('#notificationSearch')?.addEventListener('input', (event) => {
      state.filter.search = event.target.value;
      renderPanel(); bindDynamicActions($('#panel-notificacoes') || document);
    });
    $('#notificationPriorityFilter')?.addEventListener('change', (event) => {
      state.filter.priority = event.target.value;
      renderPanel(); bindDynamicActions($('#panel-notificacoes') || document);
    });
    $('#notificationCategoryFilter')?.addEventListener('change', (event) => {
      state.filter.category = event.target.value;
      renderPanel(); bindDynamicActions($('#panel-notificacoes') || document);
    });
    $('#notificationStatusFilter')?.addEventListener('change', (event) => {
      state.filter.status = event.target.value;
      renderPanel(); bindDynamicActions($('#panel-notificacoes') || document);
    });
    $('#clearNotificationFilters')?.addEventListener('click', resetFilters);
    $('#markAllNotificationsRead')?.addEventListener('click', markAllRead);
    $('#notificationMarkAll')?.addEventListener('click', markAllRead);
    $('#refreshNotifications')?.addEventListener('click', async () => {
      await window.conveniosApp?.refreshData?.();
      await loadUserStates();
      refreshFromData({ native: false });
      toast('success', 'Alertas atualizados', 'As pendências foram recalculadas com os dados mais recentes.');
    });
    $('#enableBrowserNotifications')?.addEventListener('click', enableNativeNotifications);
    $('#openNotificationsPanel')?.addEventListener('click', () => {
      $('#notificationPopover')?.classList.add('hidden');
      window.conveniosApp?.switchPanel?.('notificacoes');
    });
  }

  function open() {
    render();
  }

  document.addEventListener('DOMContentLoaded', bindStaticEvents);
  document.addEventListener('auth:ready', initialize);
  document.addEventListener('auth:signed-out', () => {
    state.alerts = [];
    state.userStates.clear();
    state.initialized = false;
    render();
  });
  document.addEventListener('app:data-updated', scheduleRefresh);

  window.notificationsPanel = Object.freeze({
    open,
    refresh: initialize,
    refreshFromData,
    get alerts() { return [...state.alerts]; }
  });
})();
