// Generate-Listing Edge Function — erzeugt Titel + Beschreibung fuer ein
// Wohnungs-Inserat aus Eckdaten + Fotos (Vision) via OpenAI GPT-4o-mini.
//
// Input:  { facts: { typ, stadt, groesse_qm, kaltmiete, ... }, images?: string[] (base64 data-URLs) }
// Output: { title: string, description: string, model: string }
//
// Auth: nur eingeloggte User (KEIN partner_only — normale Studenten inserieren).
// Kosten: ~0.02-0.05 cent pro Generierung (gpt-4o-mini, Bilder mit detail:low).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PROMPT_WOHNUNG = `Du erstellst Wohnungs-Inserate fuer eine Studenten-WG-Plattform.
Du bekommst Eckdaten und optional 1-3 Fotos der Unterkunft.

Erzeuge:
- "title": kurz (max 60 Zeichen), enthaelt Typ + Groesse + Stadt. Beispiel: "Helles 18 m² WG-Zimmer in Augsburg".
- "description": 3 bis 5 fluessige Saetze in der Du-Form. Nutze die Eckdaten. Wenn Fotos da sind, beschreibe was sichtbar ist (Helligkeit, Moeblierung, Bodenart, sichtbare Ausstattung). Erwaehne die Bad- und Kueche-Situation und ob Nebenkosten inklusive sind.

Strikte Regeln:
- Erfinde NICHTS. Keine Quadratmeter, Preise, Lagen oder Ausstattung die nicht in den Eckdaten oder klar auf den Fotos zu sehen sind.
- Sprich Studenten direkt an (Du-Form), locker aber serioes.
- Keine Werbe-Floskeln, keine Buzzwords, hoechstens 1 Emoji oder keins.
- Verwende im Ausgabetext korrekte deutsche Rechtschreibung MIT echten Umlauten und scharfem S, nicht die Ersatzschreibung ae/oe/ue/ss.

Antworte ausschliesslich als JSON-Objekt: {"title": "...", "description": "..."}`

const PROMPT_GEGENSTAND = `Du erstellst Marktplatz-Inserate fuer eine Studenten-Plattform (gebrauchte Sachen verkaufen).
Du bekommst Eckdaten (Kategorie, Zustand, Preis, Stadt) und optional 1-3 Fotos des Artikels.

Erzeuge:
- "title": kurz (max 60 Zeichen), konkret was es ist. Beispiel: "IKEA Schreibtisch weiss, sehr gut".
- "description": 2 bis 4 fluessige Saetze in der Du-Form. Nutze die Eckdaten. Wenn Fotos da sind, beschreibe was sichtbar ist (Farbe, Material, Zustand, Marke wenn erkennbar). Nenne den Zustand ehrlich.

Strikte Regeln:
- Erfinde NICHTS. Keine Marke, Masse, Preise oder Eigenschaften die nicht in den Eckdaten oder klar auf den Fotos zu sehen sind.
- Sprich Studenten direkt an (Du-Form), locker aber ehrlich.
- Keine Werbe-Floskeln, hoechstens 1 Emoji oder keins.
- Verwende im Ausgabetext korrekte deutsche Rechtschreibung MIT echten Umlauten und scharfem S, nicht die Ersatzschreibung ae/oe/ue/ss.

Antworte ausschliesslich als JSON-Objekt: {"title": "...", "description": "..."}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Auth-Wand: nur eingeloggte User (kein Partner-Zwang) ---
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
    const { data: userData, error: authErr } = await authedClient.auth.getUser(token)
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    const facts = body?.facts
    const type = body?.type === 'gegenstand' ? 'gegenstand' : 'wohnung'
    const images = Array.isArray(body?.images) ? body.images.slice(0, 3) : []
    if (!facts || typeof facts !== 'object') {
      return new Response(JSON.stringify({ error: 'facts_required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Eckdaten als lesbare Liste fuer das Modell aufbereiten (nur gesetzte Werte)
    const LABELS_WOHNUNG: Record<string, string> = {
      typ: 'Art der Unterkunft', stadt: 'Stadt', stadtteil: 'Stadtteil',
      groesse_qm: 'Groesse (m2)', kaltmiete: 'Kaltmiete (EUR)', kaution: 'Kaution (EUR)',
      nebenkosten: 'Nebenkosten', bad: 'Badezimmer', kueche: 'Kueche',
      moebliert: 'Moebliert', frei_ab: 'Frei ab', wg_groesse: 'Anzahl Mitbewohner',
      wg_typ: 'WG-Typ', anmeldung: 'Wohnsitz-Anmeldung', provisionsfrei: 'Provisionsfrei',
    }
    const LABELS_GEGENSTAND: Record<string, string> = {
      kategorie: 'Kategorie', zustand: 'Zustand', preis: 'Preis (EUR)', stadt: 'Stadt',
    }
    const labels = type === 'gegenstand' ? LABELS_GEGENSTAND : LABELS_WOHNUNG
    const sysPrompt = type === 'gegenstand' ? PROMPT_GEGENSTAND : PROMPT_WOHNUNG
    const factLines: string[] = []
    for (const key of Object.keys(labels)) {
      const v = facts[key]
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        factLines.push(`- ${labels[key]}: ${v}`)
      }
    }
    if (factLines.length === 0) {
      return new Response(JSON.stringify({ error: 'no_facts' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // User-Message: Text + Fotos (Vision, detail:low spart Tokens)
    const userContent: any[] = [{ type: 'text', text: 'Eckdaten:\n' + factLines.join('\n') }]
    for (const img of images) {
      if (typeof img === 'string' && img.startsWith('data:image')) {
        userContent.push({ type: 'image_url', image_url: { url: img, detail: 'low' } })
      }
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 500,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    })

    if (!r.ok) {
      const errText = await r.text()
      return new Response(JSON.stringify({ error: 'openai_api_error', detail: errText.substring(0, 500) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const j = await r.json()
    const raw = j.choices?.[0]?.message?.content?.trim() || ''
    let parsed: any = {}
    try { parsed = JSON.parse(raw) } catch (_e) { parsed = {} }
    const title = (parsed.title || '').toString().trim()
    const description = (parsed.description || '').toString().trim()
    if (!title && !description) {
      return new Response(JSON.stringify({ error: 'empty_response' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ title, description, model: j.model }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'exception', message: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
