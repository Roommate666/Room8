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

// Jugendliches, buntes Room8-Mail-Template. Bettet den uebergebenen HTML-Body
// in einen Brand-Wrapper (bunter Gradient-Header, weisse Card, freundlicher Footer).
// Aufrufer koennen mit skipWrap:true das rohe HTML behalten.
function wrapEmail(innerHtml: string, preheader?: string): string {
  const pre = preheader ? String(preheader).slice(0, 120) : 'Deine Studenten-App für Rabatte, Jobs & Events.'
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${pre}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:24px 12px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(30,41,59,0.08);">
    <tr><td style="background:linear-gradient(120deg,#3B82F6 0%,#10B981 38%,#F59E0B 70%,#EC4899 100%);padding:30px 28px;text-align:center;">
      <div style="font-size:30px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">Room<span style="color:#FFE08A;">8</span></div>
      <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.92);margin-top:4px;">Die App von Studenten, für Studenten 🎓</div>
    </td></tr>
    <tr><td style="padding:32px 28px 8px;color:#1F2937;font-size:16px;line-height:1.6;">
      ${innerHtml}
    </td></tr>
    <tr><td style="padding:20px 28px 28px;">
      <div style="border-top:1px solid #EEF0F3;padding-top:18px;text-align:center;">
        <div style="font-size:13px;color:#6B7280;line-height:1.5;">Studentenrabatte ☕ · Nebenjobs 💼 · Events 🎉<br>Alles für deine Unistadt — kostenlos &amp; nur für verifizierte Studenten.</div>
        <div style="font-size:12px;color:#9CA3AF;margin-top:14px;">Room8 · <a href="https://www.room8.club" style="color:#3B82F6;text-decoration:none;">room8.club</a></div>
      </div>
    </td></tr>
  </table>
  <div style="font-size:11px;color:#B6BCC6;margin-top:16px;">Du bekommst diese Mail, weil du bei Room8 dabei bist.</div>
</td></tr></table>
</body></html>`
}

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
    // HTML in das bunte Room8-Brand-Template einbetten (ausser skipWrap:true)
    const html = parsed.html
      ? (parsed.skipWrap === true ? parsed.html : wrapEmail(parsed.html, parsed.subject))
      : parsed.html
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
