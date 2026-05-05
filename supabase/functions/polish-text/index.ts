// Polish-Text Edge Function — verbessert Beschreibungen via OpenAI GPT-4o-mini.
// Input: { text: string, type: 'coupon' | 'event' | 'job', context?: string }
// Output: { polished: string }
//
// Cost: ~0.02 cent pro Polish (GPT-4o-mini, billiger als Claude Haiku).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PROMPTS = {
  coupon: `Du verbesserst Coupon-Beschreibungen fuer eine Studenten-App.
Schreib den Text in 2-3 prägnanten Saetzen um:
- Lass Stichpunkte fluessig klingen
- Sprich Studenten direkt an (Du-Form)
- Hebe den Vorteil hervor (Rabatt, Gratis-Item)
- Keine Werbe-Floskeln, keine Emojis (max 1 wenn passend)
- Echte Umlaute (ä, ö, ü, ß) verwenden
Antwort: NUR der verbesserte Text, keine Einleitung.`,
  event: `Du verbesserst Event-Beschreibungen fuer eine Studenten-App.
Schreib den Text in 2-4 lebendigen Saetzen um:
- Was passiert, wer wird angesprochen, was erwartet die Gaeste
- Du-Form, locker aber nicht zu hip
- Highlights vorne (Live-Musik, Quiz, etc.)
- Keine Emojis (max 1)
- Echte Umlaute
Antwort: NUR der verbesserte Text.`,
  job: `Du verbesserst Job-Beschreibungen fuer Studenten-Werkstudent-Stellen.
Schreib den Text in 3-5 klaren Saetzen um:
- Was die Aufgabe ist (konkret)
- Was der Student lernt / mitbringt
- Wieviel Stunden, ob Remote moeglich
- Du-Form, professionell aber zugaenglich
- Keine Buzzwords, kein Bullshit
- Echte Umlaute
Antwort: NUR der verbesserte Text.`,
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
        temperature: 0.7,
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
