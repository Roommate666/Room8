import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"
import { captureException } from "../_shared/sentry.ts"
import { verifyInternalSecret } from "../_shared/auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

// Best-effort Logging in notification_logs.
// Schluckt Fehler — Logging darf NIE den eigentlichen Send-Pfad blockieren.
//
// PFLICHT-FELDER fuer Rate-Limit + Dedup (siehe specs/push-and-email.md):
//   metadata.channel_key  → is_rate_limited() filtert pro Channel
//   row.ref_id            → is_duplicate_push() dedupliziert pro Item
async function logNotification(
  supabase: SupabaseClient,
  row: {
    user_id?: string | null,
    status: string,
    error_code?: string | null,
    error_msg?: string | null,
    provider_id?: string | null,
    title?: string | null,
    ref_id?: string | null,
    metadata?: Record<string, unknown> | null,
  }
): Promise<void> {
  try {
    await supabase.from('notification_logs').insert({
      channel: 'push',
      user_id: row.user_id ?? null,
      status: row.status,
      error_code: row.error_code ?? null,
      error_msg: row.error_msg ? String(row.error_msg).slice(0, 500) : null,
      provider_id: row.provider_id ?? null,
      title: row.title ? String(row.title).slice(0, 200) : null,
      ref_id: row.ref_id ?? null,
      metadata: row.metadata ?? null,
    })
  } catch (e) {
    console.error('notification_logs insert failed (non-fatal):', e)
  }
}

// Aus dem data-Payload Top-Level-Felder extrahieren die wir fuer Rate-Limit /
// Dedup brauchen. Migration 20260428000015 schreibt sie via notify_user_push.
function extractMeta(dataPayload: Record<string, unknown> | null): {
  channel_key: string | null,
  ref_id: string | null,
} {
  if (!dataPayload || typeof dataPayload !== 'object') {
    return { channel_key: null, ref_id: null }
  }
  return {
    channel_key: typeof dataPayload.channel_key === 'string' ? dataPayload.channel_key : null,
    ref_id:      typeof dataPayload.ref_id === 'string'      ? dataPayload.ref_id      : null,
  }
}

// Create JWT and exchange for Google OAuth2 access token
async function getFCMAccessToken(): Promise<string> {
  const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!)

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  }

  // Base64url encode
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const headerB64 = b64url(header)
  const payloadB64 = b64url(payload)
  const unsignedToken = `${headerB64}.${payloadB64}`

  // Import RSA private key
  const pemBody = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')

  const binaryKey = Uint8Array.from(atob(pemBody), (c: string) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  // Sign the JWT
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const jwt = `${unsignedToken}.${sigB64}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error('Failed to get access token: ' + JSON.stringify(tokenData))
  }
  return tokenData.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Server-to-Server-Auth: nur DB-Trigger / interne Aufrufer mit Secret duerfen senden.
  const authCheck = verifyInternalSecret(req)
  if (!authCheck.ok) {
    return new Response(
      JSON.stringify(authCheck.body),
      { status: authCheck.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let userId: string | null = null
  let title: string | null = null
  let bodyText: string | null = null
  let dataPayload: Record<string, unknown> | null = null

  try {
    const parsed = await req.json()
    userId = parsed.userId ?? null
    title = parsed.title ?? null
    bodyText = parsed.body ?? null
    dataPayload = parsed.data ?? null

    if (!userId || !title) {
      throw new Error('userId and title are required')
    }

    // Multi-Device: Hol ALLE aktiven Tokens (≤ 60 Tage alt) ueber die
    // get_user_fcm_tokens RPC. Fallback auf profiles.fcm_token fuer den
    // Uebergangszeitraum bis alle Clients neue App-Version haben.
    const { data: tokenRows, error: tokensError } = await supabase
      .rpc('get_user_fcm_tokens', { p_user_id: userId })

    const meta = extractMeta(dataPayload)

    let tokens: { token: string, platform: string }[] = []
    if (!tokensError && tokenRows && tokenRows.length > 0) {
      tokens = tokenRows
    } else {
      // Legacy-Fallback: alte profiles.fcm_token Spalte
      const { data: profile } = await supabase
        .from('profiles').select('fcm_token').eq('id', userId).single()
      if (profile?.fcm_token) {
        tokens = [{ token: profile.fcm_token, platform: 'unknown' }]
      }
    }

    if (tokens.length === 0) {
      await logNotification(supabase, {
        user_id: userId,
        status: 'no_token',
        error_msg: tokensError?.message ?? 'no fcm_tokens for user',
        title,
        ref_id: meta.ref_id,
        metadata: meta.channel_key ? { channel_key: meta.channel_key } : null,
      })
      return new Response(
        JSON.stringify({ success: false, reason: 'no_token' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    // Ungelesene Notifications zaehlen fuer App Badge
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    const badgeCount = String(unreadCount || 0)

    // Get FCM access token (1× pro Push, dann fan-out an alle Tokens)
    const accessToken = await getFCMAccessToken()
    const projectId = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!).project_id

    let successCount = 0
    let lastErrorCode: string | null = null
    let lastErrorMsg: string | null = null
    const messageIds: string[] = []

    for (const tokenRow of tokens) {
      const fcmRes = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: {
              token: tokenRow.token,
              // Data payload fuer Room8MessagingService (Vordergrund)
              // FCM v1: ALLE Werte in data MUESSEN strings sein
              data: Object.fromEntries(
                Object.entries({
                  title: title,
                  body: bodyText || '',
                  url: dataPayload?.url || 'notifications.html',
                  badgeCount: badgeCount,
                  ...(dataPayload || {})
                }).map(([k, v]) => [k, v == null ? '' : String(v)])
              ),
              notification: {
                title: title,
                body: bodyText || ''
              },
              android: {
                priority: 'high',
                notification: {
                  channel_id: 'room8_v2',
                  notification_count: parseInt(badgeCount) || 0
                  // click_action entfernt: AndroidManifest hat keine matching Activity
                  // → Tap matchte nichts und oeffnete App nicht. Default-Launcher
                  // oeffnet jetzt MainActivity, die liest url aus Intent-Extra.
                }
              }
            }
          })
        }
      )

      const fcmResult = await fcmRes.json()

      if (!fcmRes.ok) {
        const errCode = fcmResult.error?.status || fcmResult.error?.code || 'fcm_unknown'
        const errMsg = fcmResult.error?.message || ''
        lastErrorCode = String(errCode)
        lastErrorMsg = errMsg

        const isDeadToken =
          errCode === 'UNREGISTERED' ||
          errCode === 'NOT_FOUND' ||
          (errCode === 'INVALID_ARGUMENT' && /registration|token/i.test(errMsg))

        if (isDeadToken) {
          // Nur DIESEN Token loeschen, nicht alle des Users
          try {
            await supabase.from('fcm_tokens').delete().eq('token', tokenRow.token)
            // Legacy-Compat: profiles.fcm_token nullen wenn match
            await supabase.from('profiles').update({ fcm_token: null })
              .eq('id', userId).eq('fcm_token', tokenRow.token)
          } catch (e) {
            console.error('Failed to delete dead token:', e)
          }
          await logNotification(supabase, {
            user_id: userId,
            status: 'token_cleaned',
            error_code: String(errCode),
            error_msg: errMsg.slice(0, 500),
            title,
            ref_id: meta.ref_id,
            metadata: {
              platform: tokenRow.platform,
              http_status: fcmRes.status,
              ...(meta.channel_key ? { channel_key: meta.channel_key } : {}),
            },
          })
          continue
        }

        // Andere FCM-Errors loggen aber nicht abbrechen — naechster Token kriegt Chance
        await logNotification(supabase, {
          user_id: userId,
          status: 'fcm_error',
          error_code: String(errCode),
          error_msg: errMsg.slice(0, 500) || JSON.stringify(fcmResult).slice(0, 500),
          title,
          ref_id: meta.ref_id,
          metadata: {
            platform: tokenRow.platform,
            http_status: fcmRes.status,
            ...(meta.channel_key ? { channel_key: meta.channel_key } : {}),
          },
        })
        captureException(errMsg || 'FCM non-2xx', {
          function: 'send-push',
          user_id: userId,
          tags: { channel: 'push', status: 'fcm_error', error_code: String(errCode) },
          extra: { http_status: fcmRes.status, fcm_response: fcmResult, platform: tokenRow.platform },
        }).catch(() => {})
        continue
      }

      // Erfolg fuer diesen Token
      successCount++
      if (fcmResult.name) messageIds.push(fcmResult.name)

      // last_seen_at fuer diesen Token aktualisieren (bestaetigt Aktivitaet)
      try {
        await supabase.from('fcm_tokens').update({ last_seen_at: new Date().toISOString() })
          .eq('token', tokenRow.token)
      } catch (_) { /* non-fatal */ }

      await logNotification(supabase, {
        user_id: userId,
        status: 'success',
        provider_id: fcmResult.name ?? null,
        title,
        ref_id: meta.ref_id,
        metadata: {
          platform: tokenRow.platform,
          ...(meta.channel_key ? { channel_key: meta.channel_key } : {}),
          ...(dataPayload ? { data: dataPayload } : {}),
        },
      })
    }

    if (successCount === 0) {
      return new Response(
        JSON.stringify({ success: false, reason: 'all_tokens_failed', error_code: lastErrorCode, error: lastErrorMsg }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, sentCount: successCount, totalTokens: tokens.length, messageIds }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )

  } catch (error) {
    console.error('Error:', error)
    const meta = extractMeta(dataPayload)
    await logNotification(supabase, {
      user_id: userId,
      status: 'exception',
      error_msg: (error as Error).message,
      title,
      ref_id: meta.ref_id,
      metadata: meta.channel_key ? { channel_key: meta.channel_key } : null,
    })
    captureException(error as Error, {
      function: 'send-push',
      user_id: userId,
      tags: { channel: 'push', status: 'exception' },
    }).catch(() => {})
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }
})
