// Shared Internal-Secret-Auth fuer Server-to-Server Edge Functions.
//
// Funktionen wie send-email und send-push werden mit `--no-verify-jwt`
// deployed (damit DB-Trigger via pg_net sie aufrufen koennen). Damit niemand
// von aussen sie als Open-Relay missbraucht, pruefen wir hier ein
// Shared-Secret aus dem `x-internal-secret` Header.
//
// Setup:
//   1. Random-Secret generieren (mind. 32 chars):
//      `openssl rand -hex 32`
//   2. In Supabase Dashboard -> Edge Functions -> Secrets als
//      `INTERNAL_FUNCTION_SECRET` hinterlegen.
//   3. Im Postgres als DB-Setting setzen:
//      `ALTER DATABASE postgres SET app.internal_secret = '<secret>';`
//   4. Trigger-Functions lesen `current_setting('app.internal_secret', true)`
//      und senden ihn als `x-internal-secret` Header bei pg_net.http_post.
//
// Verhalten:
//   - Wenn `INTERNAL_FUNCTION_SECRET` env-var nicht gesetzt: Function antwortet
//     500 (nicht offen by default).
//   - Wenn Header fehlt oder falsch: 401 Unauthorized.

export function verifyInternalSecret(req: Request): { ok: true } | { ok: false, status: number, body: Record<string, unknown> } {
  const expected = Deno.env.get('INTERNAL_FUNCTION_SECRET')
  if (!expected || expected.length < 16) {
    return {
      ok: false,
      status: 500,
      body: { success: false, error: 'INTERNAL_FUNCTION_SECRET not configured (server)' },
    }
  }
  const provided = req.headers.get('x-internal-secret') || ''
  if (provided.length === 0 || !timingSafeEqual(provided, expected)) {
    return {
      ok: false,
      status: 401,
      body: { success: false, error: 'unauthorized' },
    }
  }
  return { ok: true }
}

// Constant-time compare gegen Timing-Attacks.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}
