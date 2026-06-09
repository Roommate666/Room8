// Polish-Text Edge Function — verbessert Beschreibungen via OpenAI GPT-4o-mini.
// Input: { text: string, type: 'coupon' | 'event' | 'job', context?: string }
// Output: { polished: string }
//
// Cost: ~0.02 cent pro Polish (GPT-4o-mini, billiger als Claude Haiku).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Gemeinsames Grundgesetz fuer ALLE Polish-Typen. Sorgt fuer einen
// einheitlichen Stil ueber Jobs, Coupons und Events hinweg und verhindert,
// dass die KI frei dazudichtet / den Inhalt verbiegt.
const RULES = `GRUNDREGELN (gelten IMMER, strikt einhalten):
1. Bleib INHALTLICH exakt beim Original. Du redigierst nur — Grammatik,
   Rechtschreibung, Satzbau, Struktur. Du erfindest NICHTS dazu: keine neuen
   Fakten, Zahlen, Orte, Vorteile, Eigenschaften oder Versprechen.
2. Wenn der Input kurz oder stichpunktartig ist, halte das Ergebnis ebenfalls
   kurz. NICHT aufblaehen, nicht ausschmuecken, keine Fuell-Saetze.
3. Du-Form. Echte Umlaute (ä, ö, ü, ß). Klares Deutsch.
4. Keine Werbe-Floskeln, keine Buzzwords (kein "innovativ", "Synergien",
   "spannend", "einzigartig"). Keine Emojis im Text.
5. Antwort: NUR der fertige Text, keine Einleitung, keine Anfuehrungszeichen,
   keine Erklaerung.`

const PROMPTS = {
  coupon: `${RULES}

AUFGABE: Du redigierst die Beschreibung eines Studenten-Coupons.
- Nutze den Kontext (Geschaeft, Kategorie, Rabatt) nur zur Einordnung.
- 1-3 knappe Saetze. Der Vorteil (Rabatt/Gratis-Item) steht vorne.`,
  event: `${RULES}

AUFGABE: Du redigierst die Beschreibung eines Studenten-Events.
- Nutze den Kontext (Titel, Ort, Datum) nur zur Einordnung.
- 2-4 knappe Saetze. Was passiert + fuer wen, das Wichtigste zuerst.`,
  job: `${RULES}

AUFGABE: Du redigierst die Beschreibung einer Studenten-/Werkstudenten-Stelle.
- Nutze den Kontext (Jobtitel, Firma, Job-Typ, Ort, Gehalt, Stunden) nur zur
  Einordnung — uebernimm daraus nur, was wirklich relevant ist.
- 2-4 klare Saetze: Was ist die Aufgabe, was bringt der Student mit.`,
  job_requirements: `${RULES}

AUSNAHME zu Regel 5: Gib eine Stichpunkt-Liste aus (eine Anforderung pro
Zeile), KEIN Spiegelstrich/Aufzaehlungszeichen davor.
AUFGABE: Du redigierst die Anforderungen ("Das bringst du mit").
- Nimm NUR die Punkte aus dem Input. Du darfst sie sprachlich glaetten und
  klar formulieren, aber KEINE neuen Anforderungen erfinden.
- Erfinde keine harten Zwaenge (keine Jahre Berufserfahrung fuer Werkstudenten).
- Eine Anforderung pro Zeile, kurz (max ~10 Woerter), Du-Form.`,
  job_benefits: `${RULES}

AUSNAHME zu Regel 5: Gib eine Stichpunkt-Liste aus (ein Benefit pro Zeile),
KEIN Spiegelstrich/Aufzaehlungszeichen davor.
AUFGABE: Du redigierst die Benefits ("Das bieten wir dir").
- Nimm NUR die Punkte aus dem Input. Sprachlich glaetten ja, aber KEINE
  Benefits erfinden, die nicht dastehen.
- Ein Benefit pro Zeile, kurz (max ~10 Woerter).`,
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Auth-Wand: nur eingeloggte, verifizierte Partner duerfen polishen ---
    // Vorher war die Function komplett offen -> jeder mit dem oeffentlichen
    // Anon-Key konnte beliebig viele GPT-Calls auf unseren OpenAI-Key feuern.
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // getUser(token) schlaegt bei Anon-Key fehl (kein echter User) -> 401
    const { data: userData, error: authErr } = await authedClient.auth.getUser(token)
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    // Jeder eingeloggte User darf polishen (konsistent mit generate-listing).
    // Login-Wand oben schuetzt bereits gegen anonymen Massen-Missbrauch des
    // OpenAI-Keys; ein is_partner-Zwang wuerde Akquise-Einreicher aussperren,
    // die ueber dieselben Partner-Formulare einreichen.

    const { text, type, context } = await req.json()
    if (!text || typeof text !== 'string' || text.length < 5) {
      return new Response(JSON.stringify({ error: 'text too short' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (text.length > 2000) {
      return new Response(JSON.stringify({ error: 'text too long (max 2000 chars)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const sysPrompt = PROMPTS[type as keyof typeof PROMPTS] || PROMPTS.coupon

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userMsg = context ? `Kontext: ${context}\n\nText: ${text}` : text

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 350,
        temperature: 0.35,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userMsg },
        ],
      }),
    })

    if (!r.ok) {
      const errText = await r.text()
      return new Response(JSON.stringify({ error: 'openai_api_error', detail: errText.substring(0, 500) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const j = await r.json()
    const polished = j.choices?.[0]?.message?.content?.trim() || ''
    if (!polished) {
      return new Response(JSON.stringify({ error: 'empty_response' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ polished, model: j.model }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'exception', message: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
