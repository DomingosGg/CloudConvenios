const RELEASE = Object.freeze({
  version: '8.9.2',
  name: 'CloudConvenios',
  platform: 'cloudflare-pages',
  features: {
    usuarios_jwt_es256_jwks: true,
    usuarios_postgrest_jwt_fallback: true,
    sessao_estavel: true,
    mfa_authenticator_totp: true,
    edicao_contatos: true,
    kanban_rolagem_mouse: true,
    kanban_scroll_container_fix: true,
    dias_restantes_concedentes: true,
    historico_downloads: true,
    modelo_importacao_v8: true,
    exportacao_automatica_18h: true
  }
});

export async function onRequestGet() {
  return new Response(JSON.stringify({
    ok: true,
    ...RELEASE,
    checked_at: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
