// Supabase Edge Function: notify-broadcast
// Admin-Broadcast von Push-Notifications an alle Nutzer mit FCM-Token.
// Ruft pro Nutzer die bestehende send-push Function auf -> deren Safeguards
// (Toggle / Quiet-Hours / Rate-Limit / Dedup) greifen automatisch.
//
// Auth: nur eingeloggte Admins (profiles.is_admin). Deploy MIT JWT-Pruefung.
//   npx supabase functions deploy notify-broadcast
//
// Body: { title: string, body?: string, url?: string, max?: number, inApp?: boolean, pushOnly?: boolean }
//   inApp (default true): schreibt zusaetzlich in JEDES User-Postfach (Tabelle notifications,
//     type 'admin_message') -> erscheint in notifications.html + Glocken-Badge, auch ohne Push-Token.
//   pushOnly: true -> nur Push, kein Postfach-Eintrag.
// E-Mail-Broadcast bewusst NICHT hier: Marketing-Mail an alle braucht sauberes
// Opt-in/Abmeldung (DSGVO/UWG). Push ist bereits Opt-in (App-Erlaubnis).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(b: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ success: false, error: 'method not allowed' }, 405)

  try {
    // 1. Admin-Check
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ success: false, error: 'unauthorized' }, 401)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: ud, error: ue } = await userClient.auth.getUser()
    if (ue || !ud?.user) return json({ success: false, error: 'unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', ud.user.id).single()
    if (!prof?.is_admin) return json({ success: false, error: 'forbidden (admin only)' }, 403)

    if (!INTERNAL_SECRET) return json({ success: false, error: 'INTERNAL_FUNCTION_SECRET not configured' }, 500)

    // 2. Eingabe
    const payload = await req.json().catch(() => ({}))
    const title = (payload?.title ? String(payload.title) : '').slice(0, 120).trim()
    const bodyText = (payload?.body ? String(payload.body) : '').slice(0, 240)
    const url = payload?.url ? String(payload.url) : null
    const max = Number.isFinite(+payload?.max) ? Math.min(+payload.max, 20000) : 20000
    const pushOnly = payload?.pushOnly === true
    const doInApp = !pushOnly && payload?.inApp !== false
    if (!title) return json({ success: false, error: 'title required' }, 400)

    // 2b. In-App-Postfach: eine Notification pro Nutzer (alle Profile, nicht nur Push-faehige).
    //     Service-Role umgeht RLS. Erscheint in notifications.html + Glocken-Badge.
    let inAppInserted = 0
    if (doInApp) {
      const { data: profRows, error: profErr } = await admin
        .from('profiles').select('id').limit(50000)
      if (profErr) return json({ success: false, error: 'inapp: ' + profErr.message }, 500)
      const ids = (profRows || []).map((r: { id: string }) => r.id)
      const CHUNK = 500
      for (let i = 0; i < ids.length; i += CHUNK) {
        const rows = ids.slice(i, i + CHUNK).map((uid: string) => ({
          user_id: uid, type: 'admin_message', title, message: bodyText, link: url, is_read: false,
        }))
        const { error: insErr } = await admin.from('notifications').insert(rows)
        if (insErr) return json({ success: false, error: 'inapp insert: ' + insErr.message }, 500)
        inAppInserted += rows.length
      }
    }

    // 3. Zielgruppe Push: eindeutige user_ids mit FCM-Token
    const { data: tokRows, error: tokErr } = await admin.from('fcm_tokens').select('user_id').limit(50000)
    if (tokErr) return json({ success: false, error: tokErr.message }, 500)
    const userIds = Array.from(new Set((tokRows || []).map((r: { user_id: string }) => r.user_id))).slice(0, max)

    // 4. Pro Nutzer send-push aufrufen (Safeguards dort). In Batches, damit es nicht blockiert.
    let sent = 0, failed = 0
    const BATCH = 25
    for (let i = 0; i < userIds.length; i += BATCH) {
      const slice = userIds.slice(i, i + BATCH)
      const results = await Promise.all(slice.map(async (uid) => {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
            body: JSON.stringify({ userId: uid, title, body: bodyText, data: url ? { url } : undefined }),
          })
          return r.ok
        } catch (_e) { return false }
      }))
      results.forEach((ok) => ok ? sent++ : failed++)
    }

    return json({ success: true, candidates: userIds.length, sent, failed, inApp: inAppInserted })
  } catch (e) {
    return json({ success: false, error: String((e as Error)?.message || e) }, 500)
  }
})
