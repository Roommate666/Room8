// Supabase Edge Function: submit-score (generisch, Multi-Game)
// Nimmt Scores der neuen Spiele (jumprun, doodle) entgegen und rechnet sie mit dem
// jeweiligen byte-identischen Shared-Core per replay(seed, input_log) nach.
// Goat Blast laeuft weiter ueber submit-goat-score (eigener Core). Deploy MIT JWT-Pruefung.
//
// Body: { game_key, seed, input_log, score, mode, event_id }
// replay_validated=true nur bei Score-Match (Server-Score ist massgeblich).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"
import "../_shared/jumprun-core.js"
import "../_shared/doodle-core.js"
// deno-lint-ignore no-explicit-any
const G: any = globalThis as any

const CORES: Record<string, string> = { jumprun: 'JumpRunCore', doodle: 'DoodleCore' }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const MAX_SCORE = 5000000
const MAX_FRAMES = 200000 // ~55 min bei 60 Hz -> DoS-Schutz
function json(b: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ success: false, error: 'method not allowed' }, 405)
  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ success: false, error: 'unauthorized' }, 401)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: ud, error: ue } = await userClient.auth.getUser()
    if (ue || !ud?.user) return json({ success: false, error: 'unauthorized' }, 401)
    const userId = ud.user.id

    const p = await req.json().catch(() => ({}))
    const gameKey = String(p?.game_key || '')
    const coreName = CORES[gameKey]
    if (!coreName) return json({ success: false, error: 'invalid game_key' }, 400)
    const core = G[coreName]
    if (!core || typeof core.replay !== 'function') return json({ success: false, error: 'core unavailable' }, 500)

    const mode = (p?.mode === 'daily') ? 'daily' : 'high'
    const seed = Number(p?.seed)
    const clientScore = Number(p?.score)
    const inputLog = Array.isArray(p?.input_log) ? p.input_log : null
    const eventId = (typeof p?.event_id === 'string' && p.event_id) ? p.event_id : null
    if (!Number.isFinite(seed)) return json({ success: false, error: 'invalid seed' }, 400)
    if (!inputLog) return json({ success: false, error: 'missing input_log' }, 400)
    if (inputLog.length > MAX_FRAMES) return json({ success: false, error: 'too many frames' }, 400)
    if (!Number.isFinite(clientScore) || clientScore < 0 || clientScore > MAX_SCORE) return json({ success: false, error: 'invalid score' }, 400)

    const rep = core.replay(Math.trunc(seed), inputLog)
    if (!rep || rep.valid !== true) return json({ success: false, error: 'replay invalid' }, 400)
    if (rep.score > MAX_SCORE) return json({ success: false, error: 'score out of range' }, 400)
    const finalScore = Math.round(rep.score)
    const replayValidated = (finalScore === Math.round(clientScore))

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { error: insErr } = await admin.from('goat_scores').insert({
      user_id: userId, game_key: gameKey, mode, score: finalScore,
      seed: Math.trunc(seed), event_id: eventId,
      verified: true, replay_validated: replayValidated,
    })
    if (insErr) return json({ success: false, error: insErr.message }, 500)

    const { count } = await admin.from('goat_scores')
      .select('id', { count: 'exact', head: true })
      .eq('game_key', gameKey).eq('mode', mode).eq('verified', true).gt('score', finalScore)
    return json({ success: true, score: finalScore, replay_validated: replayValidated, rank: (count ?? 0) + 1 })
  } catch (e) {
    return json({ success: false, error: String((e as Error)?.message || e) }, 500)
  }
})
