// Edge Function: send-email
// Wrapper um Resend API. Wird von DB-Triggern via pg_net aufgerufen.
//
// Body: { to, subject, html, text?, replyTo?, userId? }
// Returns: { success: bool, id?: string, error?: string }
//
// Voraussetzung: RESEND_API_KEY in Supabase-Secrets
// Domain: room8.club (muss in Resend als verified domain hinterlegt sein)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"
import { captureException } from "../_shared/sentry.ts"
import { verifyInternalSecret } from "../_shared/auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

const FROM_ADDRESS = 'Room8 <noreply@room8.club>'

// Best-effort Logging in notification_logs.
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
      channel: 'email',
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
  let to: string | null = null
  let subject: string | null = null

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      await logNotification(supabase, {
        status: 'exception',
        error_code: 'config_missing',
        error_msg: 'RESEND_API_KEY not configured',
      })
      return new Response(
        JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const parsed = await req.json()
    to = parsed.to ?? null
    subject = parsed.subject ?? null
    const html = parsed.html
    const text = parsed.text
    const replyTo = parsed.replyTo
    userId = parsed.userId ?? null
    // Optional Custom-Tagging fuer Admin-Alerts Rate-Limit
    const dataPayload = parsed.data ?? null
    const adminAlertType = (dataPayload && typeof dataPayload === 'object' && typeof dataPayload.admin_alert_type === 'string')
      ? dataPayload.admin_alert_type
      : null

    if (!to || !subject || (!html && !text)) {
      await logNotification(supabase, {
        user_id: userId,
        status: 'exception',
        error_code: 'missing_fields',
        error_msg: `to=${!!to} subject=${!!subject} body=${!!(html || text)}`,
        title: subject,
        metadata: { to },
      })
      return new Response(
        JSON.stringify({ success: false, error: 'missing_fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    // E-Mail-Format Sanity-Check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      await logNotification(supabase, {
        user_id: userId,
        status: 'invalid_email',
        error_code: 'invalid_email',
        error_msg: `Recipient '${to}' failed regex validation`,
        title: subject,
        metadata: { to },
      })
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_email' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const payload: Record<string, unknown> = {
      from: FROM_ADDRESS,
      to: [to],
      subject: subject,
    }
    if (html) payload.html = html
    if (text) payload.text = text
    if (replyTo) payload.reply_to = replyTo

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      console.error('Resend error:', resendData)
      await logNotification(supabase, {
        user_id: userId,
        status: 'resend_failed',
        error_code: resendData.name || String(resendRes.status),
        error_msg: resendData.message || JSON.stringify(resendData).slice(0, 500),
        title: subject,
        metadata: { to, http_status: resendRes.status },
      })
      captureException(resendData.message || 'Resend non-2xx', {
        function: 'send-email',
        user_id: userId,
        tags: {
          channel: 'email',
          status: 'resend_failed',
          error_code: resendData.name || String(resendRes.status),
        },
        extra: { http_status: resendRes.status, resend_response: resendData },
      }).catch(() => {})
      return new Response(
        JSON.stringify({ success: false, error: resendData.message || 'resend_failed', details: resendData }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    await logNotification(supabase, {
      user_id: userId,
      status: 'success',
      provider_id: resendData.id ?? null,
      title: subject,
      metadata: {
        to,
        ...(adminAlertType ? { admin_alert_type: adminAlertType } : {}),
      },
    })

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  } catch (error) {
    console.error('send-email error:', error)
    await logNotification(supabase, {
      user_id: userId,
      status: 'exception',
      error_msg: (error as Error).message || 'unknown',
      title: subject,
      metadata: { to },
    })
    captureException(error as Error, {
      function: 'send-email',
      user_id: userId,
      tags: { channel: 'email', status: 'exception' },
    }).catch(() => {})
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }
})
