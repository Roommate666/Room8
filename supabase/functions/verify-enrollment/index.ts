// Supabase Edge Function: verify-enrollment (UniGoat KI-Immatrikulations-Scan)
//
// Nimmt ein Foto der Immatrikulationsbescheinigung (base64) vom EINGELOGGTEN Nutzer,
// laesst es von Claude Vision lesen und extrahiert Hochschule / Name / Semester /
// Gueltigkeit (Enddatum). Ist das Enddatum in der Zukunft, wird der Nutzer als
// verifizierter Studierender markiert.
//
// Deploy MIT JWT-Pruefung (NICHT --no-verify-jwt): nur eingeloggte Nutzer duerfen aufrufen.
//   npx supabase functions deploy verify-enrollment
//
// Secrets (in Supabase gesetzt):
//   ANTHROPIC_API_KEY          -> Claude API Key
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (automatisch vorhanden)
//
// DSGVO / DATENSCHUTZ (WICHTIG):
//   Das hochgeladene Bild wird NUR fluechtig im RAM dieser Funktion verarbeitet und
//   an die Anthropic-API zur reinen Text-Extraktion geschickt. Es wird NICHT in der
//   Datenbank, NICHT im Storage und NICHT im Log gespeichert. Nach dem Request ist es
//   weg. Persistiert werden ausschliesslich die Ergebnis-Metadaten (Hochschule, Ablauf-
//   datum, Zeitstempel) am eigenen Profil des Nutzers. Der Klartext-Name wird bewusst
//   NICHT gespeichert (Datensparsamkeit) und nur zur Rueckmeldung zurueckgegeben.
//   CORS/JWT/Service-Role-Muster analog submit-goat-score/index.ts.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Groessen-/Format-Limits fuer das Bild (DoS-Schutz + API-Limits)
const MAX_IMAGE_BYTES = 6 * 1024 * 1024   // ~6 MB Rohbild (Claude erlaubt bis ~5 MB dekodiert)
const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

// Data-URL-Prefix ("data:image/png;base64,....") abtrennen und Media-Type ableiten.
function parseImage(raw: string): { media: string; data: string } | null {
  if (typeof raw !== 'string' || !raw) return null
  let media = 'image/jpeg'
  let data = raw.trim()
  const m = data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/)
  if (m) {
    media = m[1].toLowerCase()
    data = m[2]
  }
  // Whitespace/Zeilenumbrueche aus dem base64 entfernen
  data = data.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) return null
  if (!ALLOWED_MEDIA.includes(media)) media = 'image/jpeg'
  return { media, data }
}

// Grobe Byte-Groesse aus base64-Laenge (3/4-Regel).
function base64Bytes(b64: string): number {
  const len = b64.length
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((len * 3) / 4) - pad
}

// Extrahiert das erste JSON-Objekt aus dem Modell-Text (falls es doch mal Text drumherum liefert).
function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch { /* weiter versuchen */ }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { /* nope */ }
  }
  return null
}

// Datum aus dem Modell (erwartet ISO YYYY-MM-DD) sicher parsen -> Date | null.
function parseValidUntil(v: unknown): Date | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  // UTC-Mitternacht des Ablauftags; guelt bis Ende des Tages.
  const dt = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59))
  return isNaN(dt.getTime()) ? null : dt
}

const EXTRACT_PROMPT =
  'Du bist ein praeziser Dokument-Parser fuer deutsche und internationale ' +
  'Immatrikulationsbescheinigungen (Studienbescheinigungen). Lies ausschliesslich, was ' +
  'auf dem Bild steht. Erfinde nichts. Antworte NUR mit einem einzigen JSON-Objekt, ' +
  'ohne Markdown, ohne Erklaerung, exakt in diesem Schema:\n' +
  '{\n' +
  '  "is_enrollment_document": boolean,   // true nur wenn es klar eine Immatrikulations-/Studienbescheinigung ist\n' +
  '  "name": string|null,                 // vollstaendiger Name der Person\n' +
  '  "university": string|null,           // Name der Hochschule/Universitaet\n' +
  '  "semester": string|null,             // z.B. "Sommersemester 2026" oder "WS 2025/26"\n' +
  '  "valid_until": string|null,          // Enddatum der Gueltigkeit im Format YYYY-MM-DD (Semester-Enddatum). Wenn nur ein Semester genannt ist, leite das uebliche Enddatum ab (Sommersemester -> 30.09. des Jahres, Wintersemester -> 31.03. des Folgejahres).\n' +
  '  "confidence": number                 // 0..1 wie sicher die Extraktion ist\n' +
  '}'

async function callClaudeVision(media: string, data: string): Promise<Record<string, unknown> | null> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media, data } },
          { type: 'text', text: EXTRACT_PROMPT },
        ],
      }],
    }),
  })
  if (!resp.ok) {
    // Fehlertext NICHT weiterreichen (koennte Prompt-Inhalte spiegeln); nur Status loggen.
    console.error('anthropic error status', resp.status)
    return null
  }
  const body = await resp.json().catch(() => null)
  const text: string | undefined = body?.content?.[0]?.text
  if (!text) return null
  return extractJson(text)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, verified: false, reason: 'method not allowed' }, 405)

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ ok: false, verified: false, reason: 'server misconfigured' }, 500)
    }

    // 1. User aus dem Bearer-JWT holen (nur eingeloggte Nutzer)
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ ok: false, verified: false, reason: 'unauthorized' }, 401)
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ ok: false, verified: false, reason: 'unauthorized' }, 401)
    }
    const userId = userData.user.id

    // 2. Bild aus dem Payload lesen + validieren (wird NICHT gespeichert)
    const payload = await req.json().catch(() => ({}))
    const img = parseImage(payload?.image_base64)
    if (!img) {
      return json({ ok: false, verified: false, reason: 'kein gueltiges Bild' }, 400)
    }
    if (base64Bytes(img.data) > MAX_IMAGE_BYTES) {
      return json({ ok: false, verified: false, reason: 'Bild zu gross (max 6 MB)' }, 400)
    }

    // 3. Claude Vision aufrufen -> striktes JSON
    const parsed = await callClaudeVision(img.media, img.data)
    if (!parsed) {
      return json({ ok: false, verified: false, reason: 'Dokument konnte nicht gelesen werden' }, 502)
    }

    const isDoc = parsed.is_enrollment_document === true
    const university = typeof parsed.university === 'string' ? parsed.university.trim().slice(0, 200) : null
    const name = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, 200) : null
    const validUntilDate = parseValidUntil(parsed.valid_until)
    const validUntilIso = validUntilDate ? validUntilDate.toISOString().slice(0, 10) : null

    if (!isDoc) {
      return json({ ok: true, verified: false, university, valid_until: validUntilIso,
        reason: 'Das Bild wurde nicht als Immatrikulationsbescheinigung erkannt.' })
    }
    if (!university) {
      return json({ ok: true, verified: false, university: null, valid_until: validUntilIso,
        reason: 'Hochschule konnte nicht erkannt werden.' })
    }
    if (!validUntilDate) {
      return json({ ok: true, verified: false, university, valid_until: null,
        reason: 'Gueltigkeitsdatum konnte nicht erkannt werden.' })
    }

    // 4. Gueltigkeit pruefen: Enddatum muss in der Zukunft liegen
    const now = new Date()
    if (validUntilDate.getTime() <= now.getTime()) {
      return json({ ok: true, verified: false, university, valid_until: validUntilIso,
        reason: 'Die Bescheinigung ist abgelaufen (Gueltigkeit liegt in der Vergangenheit).' })
    }

    // 5. Bei Erfolg: NUR das eigene Profil (auth.uid()) via Service Role setzen.
    //    Service-Role umgeht RLS; wir beschraenken den Write hart auf userId.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { error: updErr } = await admin.from('profiles').update({
      is_student_verified: true,
      is_student: true,
      university,
      enrollment_verified_at: now.toISOString(),
      enrollment_valid_until: validUntilIso,
    }).eq('id', userId)
    if (updErr) {
      return json({ ok: false, verified: false, reason: updErr.message }, 500)
    }

    // Name wird bewusst NICHT gespeichert (Datensparsamkeit), nur zurueckgegeben.
    return json({
      ok: true,
      verified: true,
      university,
      valid_until: validUntilIso,
      name,
      reason: 'Verifizierung erfolgreich.',
    })
  } catch (e) {
    return json({ ok: false, verified: false, reason: String((e as Error)?.message || e) }, 500)
  }
})
