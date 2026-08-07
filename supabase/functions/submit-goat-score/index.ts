// Supabase Edge Function: submit-goat-score
// Nimmt einen Goat-Blast-Score entgegen, bindet ihn an den eingeloggten Room8-User
// und schreibt ihn (nur hier, via Service Role) in public.goat_scores.
//
// Deploy MIT JWT-Pruefung (NICHT --no-verify-jwt): nur eingeloggte Nutzer duerfen aufrufen.
//   npx supabase functions deploy submit-goat-score
//
// PHASE 1 (jetzt): Basis-Plausipruefung -> verified=true (erscheint im Board),
//   replay_validated=false (NICHT preisgeld-faehig).
// PHASE 2 (vor echtem Preisgeld): Runde per Seed+Zuege serverseitig nachrechnen
//   (deterministischer Core, siehe specs/goat-leaderboard.md) -> replay_validated=true.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Grob-Grenzen fuer Phase-1-Plausipruefung (harte Faelschungen faengt erst Replay in Phase 2).
const MAX_SCORE = 5000000
const MIN_DURATION_MS = 3000 // eine echte Runde dauert laenger als 3s

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ success: false, error: 'method not allowed' }, 405)

  try {
    // 1. User aus dem Bearer-JWT holen
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ success: false, error: 'unauthorized' }, 401)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) return json({ success: false, error: 'unauthorized' }, 401)
    const userId = userData.user.id

    // 2. Eingabe pruefen
    const payload = await req.json().catch(() => ({}))
    const mode = payload?.mode
    const score = Number(payload?.score)
    const seed = payload?.seed != null ? Number(payload.seed) : null
    const linesTotal = payload?.lines_total != null ? Number(payload.lines_total) : null
    const durationMs = payload?.duration_ms != null ? Number(payload.duration_ms) : null

    if (mode !== 'high' && mode !== 'daily') return json({ success: false, error: 'invalid mode' }, 400)
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return json({ success: false, error: 'invalid score' }, 400)

    // 3. Basis-Plausipruefung (Phase 1). Kein Ersatz fuer Replay!
    let verified = true
    if (durationMs != null && Number.isFinite(durationMs) && durationMs < MIN_DURATION_MS) verified = false
    // Grobe Obergrenze: pro geloester Linie sind ~mehrere hundert Punkte moeglich,
    // aber > 20000 Punkte je Linie ist unplausibel.
    if (linesTotal != null && Number.isFinite(linesTotal) && linesTotal > 0 && score / linesTotal > 20000) verified = false

    // 4. Schreiben via Service Role (umgeht RLS; einzige erlaubte Schreibstelle)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { error: insErr } = await admin.from('goat_scores').insert({
      user_id: userId,
      mode,
      score: Math.round(score),
      seed: seed != null && Number.isFinite(seed) ? Math.trunc(seed) : null,
      lines_total: linesTotal != null && Number.isFinite(linesTotal) ? Math.trunc(linesTotal) : null,
      duration_ms: durationMs != null && Number.isFinite(durationMs) ? Math.trunc(durationMs) : null,
      verified,
      replay_validated: false, // erst Phase 2 (Server-Replay)
    })
    if (insErr) return json({ success: false, error: insErr.message }, 500)

    // 5. Rang im jeweiligen Modus (nur verifizierte, hoehere Scores zaehlen)
    const { count } = await admin
      .from('goat_scores')
      .select('id', { count: 'exact', head: true })
      .eq('mode', mode)
      .eq('verified', true)
      .gt('score', Math.round(score))
    const rank = (count ?? 0) + 1

    return json({ success: true, verified, rank })
  } catch (e) {
    return json({ success: false, error: String((e as Error)?.message || e) }, 500)
  }
})
