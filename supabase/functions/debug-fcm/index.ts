// Diagnose-Function v2: bekommt im Body einen optionalen fcm_token, sendet TEST-Push
// und gibt KOMPLETTE FCM-Response zurueck.

const sha256Hex = async (s: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const result: any = { steps: {} }
  try {
    let bodyArgs: any = {}
    try { bodyArgs = await req.json() } catch { /* GET ok */ }
    let targetToken: string | undefined = bodyArgs.fcm_token
    const userId: string | undefined = bodyArgs.userId

    // Falls userId gegeben: Token aus profiles holen
    if (userId && !targetToken) {
      const sbUrl = Deno.env.get('SUPABASE_URL')!
      const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=fcm_token`, {
        headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
      })
      const rows = await r.json()
      result.steps.profile_lookup_status = r.status
      result.steps.profile_rows = Array.isArray(rows) ? rows.length : 'not-array'
      if (Array.isArray(rows) && rows[0]?.fcm_token) {
        targetToken = rows[0].fcm_token
        result.steps.token_resolved_length = targetToken.length
        result.steps.token_resolved_prefix = targetToken.slice(0, 20)
      }
    }

    const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? ''
    result.steps.env_present = !!raw
    result.steps.env_length = raw.length
    result.steps.env_hash = (await sha256Hex(raw)).slice(0, 16)

    const sa = JSON.parse(raw)
    result.steps.project_id = sa.project_id
    result.steps.client_email = sa.client_email

    // JWT bauen + OAuth
    const now = Math.floor(Date.now() / 1000)
    const header = { alg: 'RS256', typ: 'JWT' }
    const payload = {
      iss: sa.client_email,
      sub: sa.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.messaging'
    }
    const b64url = (obj: unknown) =>
      btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const headerB64 = b64url(header)
    const payloadB64 = b64url(payload)
    const unsignedToken = `${headerB64}.${payloadB64}`

    const pemBody = sa.private_key
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\n/g, '').replace(/\\n/g, '').trim()

    const binaryKey = Uint8Array.from(atob(pemBody), (c: string) => c.charCodeAt(0))
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    )
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5', cryptoKey,
      new TextEncoder().encode(unsignedToken)
    )
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const jwt = `${unsignedToken}.${sigB64}`

    // Versuch 1: URLSearchParams (sauber)
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    })
    const tokenJson = await tokenRes.json()
    result.steps.oauth_status = tokenRes.status
    result.steps.oauth_has_access_token = !!tokenJson.access_token
    result.steps.oauth_access_token_length = (tokenJson.access_token ?? '').length
    result.steps.oauth_access_token_prefix = (tokenJson.access_token ?? '').slice(0, 20)
    result.steps.oauth_full_response = tokenJson.access_token ? '(redacted)' : tokenJson

    if (!tokenJson.access_token) {
      return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } })
    }

    if (!targetToken) {
      result.steps.skip_fcm_call = 'no fcm_token provided in body'
      return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } })
    }

    // FCM Send Test
    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenJson.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: {
            token: targetToken,
            notification: {
              title: 'Debug FCM Test',
              body: 'Direct from debug-fcm at ' + new Date().toISOString()
            },
            data: {
              channel_key: 'debug_fcm',
              ts: String(Date.now())
            }
          }
        })
      }
    )
    const fcmText = await fcmRes.text()
    result.steps.fcm_status = fcmRes.status
    result.steps.fcm_response = fcmText.slice(0, 1000)

    return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    result.fatal = (e as Error).message
    return new Response(JSON.stringify(result, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
