import "jsr:@supabase/functions-js/edge-runtime.d.ts"

async function getAccessToken() {
  const sa = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!)
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging"
  }
  const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")
  const unsigned = `${b64url(header)}.${b64url(payload)}`
  const pem = sa.private_key.replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","").replace(/\n/g,"")
  const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")
  const jwt = `${unsigned}.${sigB64}`
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })
  return { status: r.status, body: await r.json(), project_id: sa.project_id }
}

Deno.serve(async () => {
  try {
    const tok = await getAccessToken()
    let fcmStatus = null, fcmBody = null
    if (tok.body && tok.body.access_token) {
      const accessToken = tok.body.access_token
      // Try a TEST FCM call with garbage token to see if FCM accepts our auth
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${tok.project_id}/messages:send`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: "INVALID_TOKEN_FOR_AUTH_TEST", notification: { title: "x", body: "y" }}})
      })
      fcmStatus = r.status
      fcmBody = await r.json()
    }
    return new Response(JSON.stringify({
      oauth_status: tok.status,
      oauth_token_obtained: !!(tok.body && tok.body.access_token),
      access_token_preview: tok.body?.access_token ? tok.body.access_token.substring(0, 20) + "..." : null,
      oauth_error: tok.body?.error || null,
      project_id: tok.project_id,
      fcm_test_status: fcmStatus,
      fcm_test_body: fcmBody
    }, null, 2), { headers: { "content-type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), stack: (e as Error).stack }), { status: 500 })
  }
})
