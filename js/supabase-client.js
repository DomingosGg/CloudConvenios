(() => {
  'use strict';

  const config = window.APP_CONFIG || {};
  const url = String(config.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const publishableKey = String(config.SUPABASE_PUBLISHABLE_KEY || '').trim();

  const hasCredentials = Boolean(
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) &&
    publishableKey &&
    !url.includes('SEU-PROJETO')
  );

  let client = null;

  if (hasCredentials && window.supabase?.createClient) {
    client = window.supabase.createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  function findDiagnostic(value, depth = 0) {
    if (depth > 8 || value == null) return null;

    if (typeof value === 'string') {
      try {
        return findDiagnostic(JSON.parse(value), depth + 1);
      } catch (_) {
        return null;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findDiagnostic(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    if (typeof value === 'object') {
      const status = String(value.status || '').toLowerCase();
      if (status === 'ok' || value.schema_version || value.database_time) {
        return value;
      }

      for (const nested of Object.values(value)) {
        const found = findDiagnostic(nested, depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  async function rpcHealthcheck() {
    const { data, error } = await client.rpc('healthcheck');
    if (error) throw error;
    return data;
  }

  async function fetchHealthcheck() {
    const response = await fetch(`${url}/rest/v1/rpc/healthcheck`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json'
      },
      body: '{}',
      cache: 'no-store'
    });

    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      // Mantém o texto original para o diagnóstico.
    }

    if (!response.ok) {
      const message = data?.message || data?.hint || text || `Erro HTTP ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function testConnection() {
    if (!hasCredentials) {
      return {
        ok: false,
        type: 'configuration',
        message: 'Confira a URL e a chave publicável em js/supabase-config.js.'
      };
    }

    if (!client) {
      return {
        ok: false,
        type: 'library',
        message: 'A biblioteca do Supabase não foi carregada. Atualize a página com Ctrl + F5.'
      };
    }

    let rawData;
    let method = 'supabase-js';

    try {
      rawData = await rpcHealthcheck();
    } catch (rpcError) {
      try {
        rawData = await fetchHealthcheck();
        method = 'REST';
      } catch (fetchError) {
        return {
          ok: false,
          type: 'database',
          message: fetchError?.message || rpcError?.message || 'Não foi possível conectar ao Supabase.',
          error: fetchError || rpcError
        };
      }
    }

    const diagnostic = findDiagnostic(rawData);
    const schemaVersion = diagnostic?.schema_version || 'etapa-2';

    // A função healthcheck é exclusiva para diagnóstico. Se a chamada foi
    // concluída sem erro HTTP/PostgREST, a conexão com o banco está confirmada,
    // mesmo que uma versão da API entregue o JSON em outro formato.
    return {
      ok: true,
      type: 'database',
      message: diagnostic
        ? `Banco conectado — esquema ${schemaVersion}.`
        : `Banco conectado com sucesso (${method}).`,
      data: diagnostic || rawData,
      rawData,
      method
    };
  }

  function renderStatus(result) {
    const badge = document.getElementById('databaseStatus');
    const details = document.getElementById('databaseDetails');
    if (!badge || !details) return;

    badge.className = `badge ${result.ok ? 'badge-success' : 'badge-warning'}`;
    badge.innerHTML = result.ok
      ? '<i class="fa-solid fa-circle-check"></i>Conectado'
      : '<i class="fa-solid fa-circle-exclamation"></i>Pendente';
    details.textContent = result.message;
  }

  async function handleTest() {
    const button = document.getElementById('testDatabaseBtn');
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Testando...';
    }

    const result = await testConnection();
    renderStatus(result);

    // Disponibiliza o resultado para diagnóstico no console sem expor chaves.
    window.lastDatabaseDiagnostic = result;
    console.info('[Supabase] Diagnóstico da conexão:', result);

    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-plug-circle-check"></i>Testar conexão';
    }
  }

  window.database = Object.freeze({
    client,
    configured: hasCredentials,
    testConnection
  });

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('testDatabaseBtn');
    if (button) button.addEventListener('click', handleTest);

    renderStatus({
      ok: false,
      message: hasCredentials
        ? 'Credenciais preenchidas. Clique em “Testar conexão”.'
        : 'Banco ainda não configurado. O sistema segue no modo local.'
    });
  });
})();
