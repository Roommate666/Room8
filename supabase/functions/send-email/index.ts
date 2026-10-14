// Edge Function: send-email
// Wrapper um Resend API. Wird von DB-Triggern via pg_net aufgerufen.
//
// Body: { to, subject, html, text?, replyTo?, userId? }
// Returns: { success: bool, id?: string, error?: string }
//
// Voraussetzung: RESEND_API_KEY in Supabase-Secrets
// Domain: unigoat.de (muss in Resend als verified domain hinterlegt sein)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"
import { captureException } from "../_shared/sentry.ts"
import { verifyInternalSecret } from "../_shared/auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

const FROM_ADDRESS = 'UniGoat <noreply@unigoat.de>'

// UniGoat v2-Mail-Template (Editorial/Zeitungs-Look, passend zur App):
// Archivo, eckig (Radius 0), 2px-Tinte-Linien, Mint-Akzent, Masthead-Kopf.
// Bettet den uebergebenen HTML-Body in den Brand-Rahmen. Aufrufer koennen mit
// skipWrap:true (oder wenn html bereits ein volles <html>-Dokument ist) das rohe HTML behalten.
function wrapEmail(innerHtml: string, preheader?: string): string {
  const pre = preheader ? String(preheader).slice(0, 120) : 'Deine Studenten-App für Rabatte, Coupons und den Goat-Wettkampf.'
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#f3f2f2;font-family:'Archivo',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#201e1d;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${pre}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2f2;padding:24px 12px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:2px solid #201e1d;">
    <tr><td style="padding:22px 24px 12px;">
      <div style="font-size:38px;font-weight:800;letter-spacing:-1.6px;line-height:.9;color:#201e1d;">UniGoat</div>
    </td></tr>
    <tr><td style="border-top:2px solid #201e1d;border-bottom:2px solid #201e1d;padding:9px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#201e1d;">Campus-Ausgabe</td>
        <td align="right" style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0B6B52;">unigoat.de</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:26px 24px 8px;color:#201e1d;font-size:16px;line-height:1.6;">
      ${innerHtml}
    </td></tr>
    <tr><td style="padding:18px 24px 26px;">
      <div style="border-top:2px solid #201e1d;padding-top:16px;">
        <div style="font-size:13px;color:#6f6a67;line-height:1.5;">Studentenrabatte, Coupons und der monatliche Goat-Wettkampf — kostenlos und nur für verifizierte Studenten.</div>
        <div style="font-size:12px;color:#8a8785;margin-top:12px;">UniGoat · <a href="https://www.unigoat.de" style="color:#0B6B52;text-decoration:none;font-weight:800;">unigoat.de</a></div>
      </div>
    </td></tr>
  </table>
  <div style="font-size:11px;color:#9b9797;margin-top:14px;">Du bekommst diese Mail, weil du bei UniGoat dabei bist.</div>
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

// Resend-Versand mit Retry NUR bei 429 (rate_limit_exceeded, 10 req/s Konto-Limit).
// Andere Fehler (400/422 ungueltige Mail) werden NICHT wiederholt (bringt nichts).
// Wartezeit: 'Retry-After'-Header (Sekunden) bevorzugt, sonst exponentieller Backoff +
// Jitter. Max 4 Versuche, gedeckelt damit die Edge-Function nicht ins Zeitlimit laeuft.
async function sendViaResend(
  payload: Record<string, unknown>,
  apiKey: string,
): Promise<{ res: Response, data: Record<string, unknown>, attempts: number }> {
  const MAX_ATTEMPTS = 4
  let res!: Response
  let data: Record<string, unknown> = {}
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    data = await res.json().catch(() => ({}))
    if (res.status !== 429 || attempt === MAX_ATTEMPTS) return { res, data, attempts: attempt }
    const ra = parseFloat(res.headers.get('retry-after') || '')
    const waitMs = (Number.isFinite(ra) && ra > 0)
      ? Math.min(ra * 1000, 2000)
      : Math.min(200 * Math.pow(2, attempt - 1), 1500) + Math.floor(Math.random() * 120)
    await new Promise((r) => setTimeout(r, waitMs))
  }
  return { res, data, attempts: MAX_ATTEMPTS }
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
    // HTML in das UniGoat-v2-Brand-Template einbetten.
    // Nicht wrappen, wenn skipWrap:true ODER wenn der Body bereits ein volles
    // HTML-Dokument ist (z. B. email_template() aus SQL) -> verhindert Doppel-Wrap.
    const isFullDoc = typeof parsed.html === 'string' && /<html[\s>]/i.test(parsed.html)
    const html = parsed.html
      ? (parsed.skipWrap === true || isFullDoc ? parsed.html : wrapEmail(parsed.html, parsed.subject))
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

    // Versand mit Retry-on-429 (siehe sendViaResend oben).
    const { res: resendRes, data: resendData, attempts } = await sendViaResend(payload, RESEND_API_KEY)

    if (!resendRes.ok) {
      console.error('Resend error:', resendData)
      await logNotification(supabase, {
        user_id: userId,
        status: 'resend_failed',
        error_code: (resendData.name as string) || String(resendRes.status),
        error_msg: (resendData.message as string) || JSON.stringify(resendData).slice(0, 500),
        title: subject,
        metadata: { to, http_status: resendRes.status, attempts },
      })
      captureException((resendData.message as string) || 'Resend non-2xx', {
        function: 'send-email',
        user_id: userId,
        tags: {
          channel: 'email',
          status: 'resend_failed',
          error_code: (resendData.name as string) || String(resendRes.status),
        },
        extra: { http_status: resendRes.status, resend_response: resendData, attempts },
      }).catch(() => {})
      return new Response(
        JSON.stringify({ success: false, error: (resendData.message as string) || 'resend_failed', details: resendData }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    await logNotification(supabase, {
      user_id: userId,
      status: 'success',
      provider_id: (resendData.id as string) ?? null,
      title: subject,
      metadata: {
        to,
        ...(attempts > 1 ? { attempts } : {}),
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
