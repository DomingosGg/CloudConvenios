const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

export async function onRequest({ env }) {
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const secretConfigured = Boolean(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
  let supabaseReachable = false;
  let schemaVersion = null;

  if (supabaseUrl) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/healthcheck`, {
        method: 'POST',
        headers: {
          apikey: String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''),
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      const data = response.ok ? await response.json() : null;
      supabaseReachable = response.ok;
      schemaVersion = data?.schema_version || data?.versao || null;
    } catch {
      supabaseReachable = false;
    }
  }

  return new Response(JSON.stringify({
    ok: Boolean(supabaseUrl && secretConfigured && supabaseReachable),
    platform: 'cloudflare-pages',
    supabase_url_configured: Boolean(supabaseUrl),
    supabase_secret_configured: secretConfigured,
    supabase_reachable: supabaseReachable,
    schema_version: schemaVersion,
    checked_at: new Date().toISOString()
  }), { status: 200, headers: HEADERS });
}
