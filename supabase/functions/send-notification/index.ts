// Supabase Edge Function: send-notification
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

// Typen die Mails an FREMDE User schicken -> nur Admins duerfen sie ausloesen.
const ADMIN_TYPES = ['account_verified', 'verification_approved', 'verification_rejected', 'admin_verification_request']

// HTML-Escape gegen Injection in Mail-Templates (User-kontrollierte Felder wie Name).
function escHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Plain-Text-Fallback aus HTML. HTML-only Mails scoren schlechter im Spam-Filter.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&copy;/g, '(c)').replace(/&amp;/g, '&').replace(/&#\d+;/g, '')
    .replace(/[ \t]+/g, ' ').replace(/(\s*\n\s*){2,}/g, '\n\n').trim()
}

// UniGoat v2-Mail-Rahmen (Editorial: Archivo, eckig, 2px-Tinte, Mint-Akzent) —
// identisch zum Wrapper in send-email, damit alle Mails gleich aussehen.
function v2Mail(headline: string, bodyHtml: string, cta?: { text: string, url: string }): string {
  const ctaHtml = cta
    ? `<div style="margin:30px 0;"><a href="${cta.url}" style="display:inline-block;padding:14px 28px;background:#12B489;color:#201e1d;text-decoration:none;font-weight:800;font-size:15px;font-family:'Archivo',sans-serif;border-radius:0;">${cta.text}</a></div>`
    : ''
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#f3f2f2;font-family:'Archivo',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#201e1d;">
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
      <h1 style="font-size:22px;color:#201e1d;margin:0 0 14px;font-weight:800;letter-spacing:-0.4px;line-height:1.1;">${headline}</h1>
      ${bodyHtml}
      ${ctaHtml}
    </td></tr>
    <tr><td style="padding:18px 24px 26px;">
      <div style="border-top:2px solid #201e1d;padding-top:16px;">
        <div style="font-size:13px;color:#6f6a67;line-height:1.5;">UniGoat — Studentenrabatte, Coupons und der monatliche Goat-Wettkampf.</div>
        <div style="font-size:12px;color:#8a8785;margin-top:12px;">Fragen? <a href="mailto:info@unigoat.de" style="color:#0B6B52;text-decoration:none;font-weight:800;">info@unigoat.de</a></div>
      </div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`
}

// v2-Hinweisbox (Mint-Kante, eckig) fuer Feature-Listen o. Ae.
function v2Note(title: string, items: string[]): string {
  const lis = items.map((t) => `<li style="margin:7px 0;color:#201e1d;">${t}</li>`).join('')
  return `<div style="border-left:4px solid #12B489;background:#E4FBF3;padding:16px 18px;margin:22px 0;">`
    + `<div style="font-weight:800;font-size:14px;color:#201e1d;margin-bottom:6px;">${title}</div>`
    + `<ul style="margin:6px 0 0;padding-left:18px;font-size:15px;line-height:1.5;">${lis}</ul></div>`
}

// CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Auth-Wand: nur eingeloggte User. Vorher war die Function offen ->
    // jeder konnte ueber unsere verifizierte Domain beliebige Mails verschicken. ---
    const authHeader = req.headers.get('Authorization') || ''
    const userToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!userToken || !supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ success: false, error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: authErr } = await authedClient.auth.getUser(userToken)
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { to, type, data } = await req.json()

    // Admin-Typen (Mail an fremde User) nur fuer Admins.
    if (ADMIN_TYPES.includes(type)) {
      const { data: prof } = await authedClient.from('profiles').select('is_admin').eq('id', userData.user.id).single()
      if (!prof || prof.is_admin !== true) {
        return new Response(JSON.stringify({ success: false, error: 'admin_only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Link-Injection-Schutz: nur room8.club-Links erlaubt (kein Phishing ueber unsere Domain).
    if (data && data.verificationLink && !/^https:\/\/(www\.)?(unigoat\.de|room8\.club)\//.test(String(data.verificationLink))) {
      return new Response(JSON.stringify({ success: false, error: 'invalid_link' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // E-Mail Templates (alle im UniGoat-v2-Look ueber v2Mail())
    const templates = {
      'uni_email_verification': {
        from: 'UniGoat Team <noreply@unigoat.de>',
        subject: 'Bestätige deine Uni-E-Mail für UniGoat',
        html: v2Mail(
          'Bestätige deine Uni-Mail',
          `<p style="margin:0 0 12px;">Fast geschafft. Bestätige jetzt deine Uni-E-Mail-Adresse, um deine UniGoat-Verifizierung abzuschließen.</p>`
          + `<p style="margin:16px 0 0;font-size:14px;color:#6f6a67;">Falls du diese Verifizierung nicht angefordert hast, kannst du diese E-Mail einfach ignorieren.</p>`,
          { text: 'E-Mail bestätigen', url: data.verificationLink }
        )
      },

      'account_verified': {
        from: 'UniGoat Team <noreply@unigoat.de>',
        subject: 'Du bist verifiziert — willkommen bei UniGoat!',
        html: v2Mail(
          'Du bist verifiziert!',
          `<p style="margin:0 0 12px;">Hi ${escHtml(data.userName)}, dein Studenten-Status ist bestätigt.</p>`
          + v2Note('Ab jetzt freigeschaltet:', [
              'Alle Coupons &amp; Studenten-Deals einlösen',
              'Am monatlichen Goat-Wettkampf um echte Preise teilnehmen',
              'Freunde einladen und zum Duell herausfordern',
            ])
          + `<p style="margin:18px 0 0;">Willkommen bei UniGoat!<br><strong>Dein UniGoat Team</strong></p>`,
          { text: 'Zu den Deals', url: 'https://unigoat.de/coupons.html' }
        )
      },

      'verification_approved': {
        from: 'UniGoat Team <noreply@unigoat.de>',
        subject: 'Deine Verifizierung wurde bestätigt!',
        html: v2Mail(
          'Verifizierung bestätigt!',
          `<p style="margin:0 0 12px;">Dein Studenten-Status wurde bestätigt. Du hast jetzt vollen Zugriff auf UniGoat.</p>`
          + v2Note('Ab jetzt freigeschaltet:', [
              'Alle Coupons &amp; Studenten-Deals einlösen',
              'Am monatlichen Goat-Wettkampf teilnehmen',
              'Freunde einladen und herausfordern',
            ])
          + `<p style="margin:18px 0 0;">Willkommen bei UniGoat!<br><strong>Dein UniGoat Team</strong></p>`,
          { text: 'Zu den Deals', url: 'https://unigoat.de/coupons.html' }
        )
      },

      'verification_rejected': {
        from: 'UniGoat Team <noreply@unigoat.de>',
        subject: 'Deine Verifizierung wurde abgelehnt',
        html: v2Mail(
          'Verifizierung abgelehnt',
          `<p style="margin:0 0 12px;">Deine Verifizierung konnte leider nicht bestätigt werden. Bitte versuche es erneut mit deiner offiziellen Uni-E-Mail-Adresse.</p>`
          + `<p style="margin:16px 0 0;font-size:14px;color:#6f6a67;">Fragen? Schreib uns an <a href="mailto:info@unigoat.de" style="color:#0B6B52;text-decoration:none;font-weight:800;">info@unigoat.de</a>.</p>`,
          { text: 'Erneut verifizieren', url: 'https://unigoat.de/verify-options.html' }
        )
      },

      'admin_verification_request': {
        from: 'UniGoat <noreply@unigoat.de>',
        subject: 'Neue Verifizierungsanfrage',
        html: v2Mail(
          'Neue Verifizierungsanfrage',
          v2Note('Details', [
              `<strong>User:</strong> ${escHtml(data.userName)}`,
              `<strong>E-Mail:</strong> ${escHtml(data.userEmail)}`,
              `<strong>Uni-Domain:</strong> ${escHtml(data.emailDomain)}`,
              `<strong>Registriert:</strong> ${escHtml(data.registeredAt)}`,
            ])
          + `<p style="margin:8px 0 0;">${data.documentUploaded ? 'Immatrikulationsbescheinigung wurde hochgeladen.' : 'E-Mail-Verifizierung wird genutzt.'}</p>`,
          { text: 'Im Admin-Panel öffnen', url: 'https://unigoat.de/admin.html' }
        )
      }
    }
    
    const template = (templates as Record<string, { from: string; subject: string; html: string }>)[type]

    if (!template) {
      throw new Error(`Unknown notification type: ${type}`)
    }
    
    // Send email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: template.from,
        to: [to],
        subject: template.subject,
        html: template.html,
        text: htmlToText(template.html),
        headers: {
          'List-Unsubscribe': '<mailto:info@unigoat.de?subject=unsubscribe>'
        }
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Resend API error: ${error}`)
    }
    
    const result = await response.json()
    
    return new Response(
      JSON.stringify({ success: true, emailId: result.id }),
      { 
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        } 
      }
    )
    
  } catch (error) {
    console.error('Error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: (error as Error).message
      }),
      { 
        status: 400, 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        } 
      }
    )
  }
})