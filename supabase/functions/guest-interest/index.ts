// Guest-Interest Edge Function: ein eingeloggter Student zeigt Interesse an einem
// Gast-Inserat (owner = Room8-Gast-Account). Wir finden die Vermieter-Kontaktmail
// server-seitig ueber guest_listings (via created_listing_id) und schicken eine
// Benachrichtigung. Der Student sieht die Vermieter-Mail NIE (Datenschutz).
//
// Input:  { listing_id, name, contact, message }
// Auth:   nur eingeloggte User (kein anon -> kein Spam)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function esc(s: string) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'auth_required' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Nur eingeloggte User
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: authErr } = await authedClient.auth.getUser(token)
    if (authErr || !userData?.user) return json({ error: 'auth_required' }, 401)

    const body = await req.json()
    const listingId = body?.listing_id
    const name = (body?.name || '').toString().slice(0, 100)
    const contact = (body?.contact || '').toString().slice(0, 200)
    const message = (body?.message || '').toString().slice(0, 1000)
    if (!listingId || !contact) return json({ error: 'missing_fields' }, 400)

    // Service-Role: Vermieter-Kontakt aus guest_listings holen (Student darf das nicht lesen)
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const { data: gl } = await admin
      .from('guest_listings')
      .select('contact_email, title')
      .eq('created_listing_id', listingId)
      .eq('status', 'approved')
      .maybeSingle()
    if (!gl || !gl.contact_email) return json({ error: 'not_a_guest_listing' }, 404)

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return json({ error: 'mail_not_configured' }, 500)

    const html =
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">` +
      `<h2 style="color:#4F46E5;">Jemand interessiert sich für deine Wohnung!</h2>` +
      `<p>Ein Student hat über Room8 Interesse an deinem Inserat <strong>${esc(gl.title)}</strong> gezeigt.</p>` +
      `<div style="background:#F3F4F6;padding:16px;border-radius:10px;margin:16px 0;">` +
      `<p><strong>Name:</strong> ${esc(name) || '-'}</p>` +
      `<p><strong>Kontakt:</strong> ${esc(contact)}</p>` +
      (message ? `<p><strong>Nachricht:</strong><br>${esc(message)}</p>` : '') +
      `</div>` +
      `<p>Antworte einfach direkt auf den angegebenen Kontakt.</p>` +
      `<p style="color:#9CA3AF;font-size:13px;">Room8 - room8.club</p></div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Room8 <help@room8.club>',
        to: [gl.contact_email],
        subject: 'Interesse an deiner Wohnung auf Room8',
        html,
        text: `Ein Student interessiert sich fuer "${gl.title}". Name: ${name}. Kontakt: ${contact}. Nachricht: ${message}`,
        headers: { 'List-Unsubscribe': '<mailto:help@room8.club?subject=unsubscribe>' },
      }),
    })
    if (!r.ok) return json({ error: 'mail_failed', detail: (await r.text()).slice(0, 300) }, 502)
    return json({ ok: true })
  } catch (e) {
    return json({ error: 'exception', message: String(e) }, 500)
  }

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
