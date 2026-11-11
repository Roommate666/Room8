// Edge Function: send-email-batch
// Massen-Mail-Versand ueber die Resend Batch-API (POST /emails/batch).
// Nimmt EIN Array von Emails und schickt bis zu 100 pro Request raus -> umgeht
// das 10-req/s-Limit von Resend bei Bursts (Wochenueberblick / Coupon-Announce /
// Wettkampf). Pendant zu send-email (Einzel-Mails), teilt sich dessen Helfer:
// gleiche CORS, gleicher verifyInternalSecret-Auth, gleiche FROM_ADDRESS, gleicher
// Brand-Wrap, gleiches notification_logs-Logging.
//
// Body: { emails: [{ to, subject, html?, text?, replyTo?, userId?, skipWrap? }], defaultReplyTo? }
// Returns: { success, total, sent, failed, invalid, chunks }
//
// Aufruf von DB-Triggern/Crons via pg_net -> Deploy MIT --no-verify-jwt.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"
import { captureException } from "../_shared/sentry.ts"
import { verifyInternalSecret } from "../_shared/auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

const FROM_ADDRESS = 'UniGoat <noreply@unigoat.de>'
const CHUNK_SIZE = 100          // Resend Batch-API: max 100 Email-Objekte pro Call
const INTER_CHUNK_PAUSE_MS = 150 // Pause zwischen Bloecken -> sicher unter 10 Req/s

// Identisch zu send-email: bettet rohen HTML-Body in den UniGoat-v2-Brand-Rahmen.
function wrapEmail(innerHtml: string, preheader?: string): string {
  const pre = preheader ? String(preheader).slice(0, 120) : 'Deine Studenten-App f&uuml;r Rabatte, Coupons und den Goat-Wettkampf.'
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
        <div style="font-size:13px;color:#6f6a67;line-height:1.5;">Studentenrabatte, Coupons und der monatliche Goat-Wettkampf &mdash; kostenlos und nur f&uuml;r verifizierte Studenten.</div>
        <div style="font-size:12px;color:#8a8785;margin-top:12px;">UniGoat &middot; <a href="https://www.unigoat.de" style="color:#0B6B52;text-decoration:none;font-weight:800;">unigoat.de</a></div>
      </div>
    </td></tr>
  </table>
  <div style="font-size:11px;color:#9b9797;margin-top:14px;">Du bekommst diese Mail, weil du bei UniGoat dabei bist.</div>
</td></tr></table>
</body></html>`
}

// Best-effort Logging in notification_logs (identisch zu send-email).
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

// Mehrere notification_logs-Zeilen in EINEM Insert (spart Roundtrips bei grossen Batches).
interface LogRow {
  user_id?: string | null
  status: string
  error_code?: string | null
  error_msg?: string | null
  provider_id?: string | null
  title?: string | null
  metadata?: Record<string, unknown> | null
}

async function logNotificationBulk(
  supabase: SupabaseClient,
  rows: LogRow[]
): Promise<void> {
  if (rows.length === 0) return
  try {
    await supabase.from('notification_logs').insert(
      rows.map((r) => ({
        channel: 'email',
        user_id: r.user_id ?? null,
        status: r.status,
        error_code: r.error_code ?? null,
        error_msg: r.error_msg ? String(r.error_msg).slice(0, 500) : null,
        provider_id: r.provider_id ?? null,
        title: r.title ? String(r.title).slice(0, 200) : null,
        metadata: r.metadata ?? null,
      }))
    )
  } catch (e) {
    console.error('notification_logs bulk insert failed (non-fatal):', e)
  }
}

// EIN Batch-Block (<=100 Emails) an Resend /emails/batch. Retry NUR bei 429
// (Konto-Limit), gleiche Backoff-Logik wie sendViaResend in send-email.
async function sendBatchViaResend(
  batch: Array<Record<string, unknown>>,
  apiKey: string,
): Promise<{ res: Response, data: Record<string, unknown>, attempts: number }> {
  const MAX_ATTEMPTS = 4
  let res!: Response
  let data: Record<string, unknown> = {}
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
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

interface InEmail {
  to?: unknown
  subject?: unknown
  html?: unknown
  text?: unknown
  replyTo?: unknown
  userId?: unknown
  skipWrap?: unknown
}
// Eine vorbereitete, gueltige Email (nach Validierung + Wrap).
interface PreparedEmail {
  to: string
  subject: string
  userId: string | null
  payload: Record<string, unknown>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Server-to-Server-Auth: nur interne Aufrufer mit Secret.
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

    const parsed = await req.json().catch(() => ({}))
    const emailsIn: InEmail[] = Array.isArray(parsed?.emails) ? parsed.emails : []
    const defaultReplyTo = typeof parsed?.defaultReplyTo === 'string' ? parsed.defaultReplyTo : null

    if (emailsIn.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'no_emails' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const prepared: PreparedEmail[] = []
    const invalidLogs: LogRow[] = []
    let invalid = 0

    // Pro Email validieren + wrappen. Ungueltige NICHT den Batch failen lassen,
    // sondern rausfiltern + als invalid_email / missing_fields loggen.
    for (const e of emailsIn) {
      const to = typeof e.to === 'string' ? e.to : null
      const subject = typeof e.subject === 'string' ? e.subject : null
      const userId = typeof e.userId === 'string' ? e.userId : null
      const rawHtml = typeof e.html === 'string' ? e.html : null
      const rawText = typeof e.text === 'string' ? e.text : null
      const replyTo = typeof e.replyTo === 'string' ? e.replyTo : defaultReplyTo

      if (!to || !subject || (!rawHtml && !rawText)) {
        invalid++
        invalidLogs.push({
          user_id: userId, status: 'invalid_email', error_code: 'missing_fields',
          error_msg: `to=${!!to} subject=${!!subject} body=${!!(rawHtml || rawText)}`,
          title: subject, metadata: { to },
        })
        continue
      }
      if (!emailRegex.test(to)) {
        invalid++
        invalidLogs.push({
          user_id: userId, status: 'invalid_email', error_code: 'invalid_email',
          error_msg: `Recipient '${to}' failed regex validation`,
          title: subject, metadata: { to },
        })
        continue
      }

      // Wrap-Logik identisch zu send-email: nicht wrappen wenn skipWrap oder
      // bereits volles HTML-Dokument (verhindert Doppel-Wrap).
      const isFullDoc = !!rawHtml && /<html[\s>]/i.test(rawHtml)
      const html = rawHtml
        ? (e.skipWrap === true || isFullDoc ? rawHtml : wrapEmail(rawHtml, subject))
        : null

      const payload: Record<string, unknown> = { from: FROM_ADDRESS, to: [to], subject }
      if (html) payload.html = html
      if (rawText) payload.text = rawText
      if (replyTo) payload.reply_to = replyTo

      prepared.push({ to, subject, userId, payload })
    }

    await logNotificationBulk(supabase, invalidLogs)

    // In 100er-Bloecke chunken + sequentiell senden.
    let sent = 0, failed = 0, chunks = 0
    for (let i = 0; i < prepared.length; i += CHUNK_SIZE) {
      const slice = prepared.slice(i, i + CHUNK_SIZE)
      const batchBody = slice.map((p) => p.payload)
      chunks++

      const { res, data, attempts } = await sendBatchViaResend(batchBody, RESEND_API_KEY)
      const logRows: LogRow[] = []

      if (!res.ok) {
        // Ganzer Block fehlgeschlagen -> jede Email als resend_failed loggen.
        console.error('Resend batch error:', data)
        for (const p of slice) {
          failed++
          logRows.push({
            user_id: p.userId, status: 'resend_failed',
            error_code: (data.name as string) || String(res.status),
            error_msg: (data.message as string) || JSON.stringify(data).slice(0, 500),
            title: p.subject, metadata: { to: p.to, http_status: res.status, attempts, batch: true },
          })
        }
        captureException((data.message as string) || 'Resend batch non-2xx', {
          function: 'send-email-batch',
          tags: { channel: 'email', status: 'resend_failed', error_code: (data.name as string) || String(res.status) },
          extra: { http_status: res.status, resend_response: data, attempts, chunk_size: slice.length },
        }).catch(() => {})
      } else {
        // Batch-Response: { data: [{id}, ...] } in Reihenfolge der Eingabe.
        const ids = Array.isArray((data as { data?: unknown }).data)
          ? ((data as { data: Array<{ id?: string }> }).data)
          : []
        for (let j = 0; j < slice.length; j++) {
          const p = slice[j]
          const providerId = ids[j]?.id ?? null
          sent++
          logRows.push({
            user_id: p.userId, status: 'success', provider_id: providerId,
            title: p.subject,
            metadata: { to: p.to, batch: true, ...(attempts > 1 ? { attempts } : {}) },
          })
        }
      }

      await logNotificationBulk(supabase, logRows)

      // Pause vor dem naechsten Block (sicher unter 10 Req/s).
      if (i + CHUNK_SIZE < prepared.length) {
        await new Promise((r) => setTimeout(r, INTER_CHUNK_PAUSE_MS))
      }
    }

    return new Response(
      JSON.stringify({ success: true, total: emailsIn.length, sent, failed, invalid, chunks }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  } catch (error) {
    console.error('send-email-batch error:', error)
    await logNotification(supabase, {
      status: 'exception',
      error_msg: (error as Error).message || 'unknown',
    })
    captureException(error as Error, {
      function: 'send-email-batch',
      tags: { channel: 'email', status: 'exception' },
    }).catch(() => {})
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }
})
