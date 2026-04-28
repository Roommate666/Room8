import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Best-effort Logging in notification_logs.
// Schluckt Fehler — Logging darf NIE den eigentlichen Send-Pfad blockieren.
async function logNotification(
  supabase: SupabaseClient,
  row: {
    user_id?: string | null,
    status: string,
    error_code?: string | null,
    error_msg?: string | null,
    provider_id?: string | null,
    title?: string | null,
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
      metadata: row.metadata ?? null,
    })
  } catch (e) {
    console.error('notification_logs insert failed (non-fatal):', e)
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

    // Get user's FCM token from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('fcm_token')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.fcm_token) {
      await logNotification(supabase, {
        user_id: userId,
        status: 'no_token',
        error_msg: profileError?.message ?? 'profile or fcm_token missing',
        title,
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

    // Get FCM access token
    const accessToken = await getFCMAccessToken()
    const projectId = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!).project_id

    // Send FCM v1 push notification
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
            token: profile.fcm_token,
            // Data payload fuer unseren Room8MessagingService (Vordergrund)
            data: {
              title: title,
              body: bodyText || '',
              url: dataPayload?.url || 'notifications.html',
              badgeCount: badgeCount,
              ...(dataPayload || {})
            },
            // Notification payload fuer System-Anzeige (Hintergrund) + MIUI Badge
            notification: {
              title: title,
              body: bodyText || ''
            },
            android: {
              priority: 'high',
              notification: {
                channel_id: 'room8_default',
                notification_count: parseInt(badgeCount) || 0,
                click_action: 'OPEN_APP'
              }
            }
          }
        })
      }
    )

    const fcmResult = await fcmRes.json()

    if (!fcmRes.ok) {
      console.error('FCM error:', fcmResult)
      const errCode = fcmResult.error?.status || fcmResult.error?.code || 'fcm_unknown'
      await logNotification(supabase, {
        user_id: userId,
        status: 'fcm_error',
        error_code: String(errCode),
        error_msg: fcmResult.error?.message || JSON.stringify(fcmResult).slice(0, 500),
        title,
        metadata: { http_status: fcmRes.status, data: dataPayload },
      })
      return new Response(
        JSON.stringify({ success: false, error: fcmResult.error?.message || 'FCM error' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    await logNotification(supabase, {
      user_id: userId,
      status: 'success',
      provider_id: fcmResult.name ?? null,
      title,
      metadata: dataPayload ? { data: dataPayload } : null,
    })

    return new Response(
      JSON.stringify({ success: true, messageId: fcmResult.name }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )

  } catch (error) {
    console.error('Error:', error)
    await logNotification(supabase, {
      user_id: userId,
      status: 'exception',
      error_msg: (error as Error).message,
      title,
    })
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }
})
