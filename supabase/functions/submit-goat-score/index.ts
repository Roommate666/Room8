// Supabase Edge Function: submit-goat-score
// Nimmt einen Goat-Blast-Score entgegen, bindet ihn an den eingeloggten Room8-User
// und schreibt ihn (nur hier, via Service Role) in public.goat_scores.
//
// Deploy MIT JWT-Pruefung (NICHT --no-verify-jwt): nur eingeloggte Nutzer duerfen aufrufen.
//   npx supabase functions deploy submit-goat-score
//
// ANTI-CHEAT (Phase 2, aktiv): Der Server rechnet die Runde aus seed + Zug-Liste mit
// GENAU DEMSELBEN Core wie der Browser nach (supabase/functions/_shared/goat-core.js ist
// byte-identisch zu www/game/core.js, per Test abgesichert). Nur wenn der nachgerechnete
// Score exakt passt, wird replay_validated=true gesetzt -> preisgeld-faehig.
// Der GESPEICHERTE Score ist der SERVER-Score (Client-Score wird ignoriert).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"
// Side-Effect-Import: setzt globalThis.GoatCore (core.js enthaelt kein ESM-export,
// damit dieselbe Datei auch als <script> im Browser laeuft).
import "../_shared/goat-core.js"
// deno-lint-ignore no-explicit-any
const GoatCore: any = (globalThis as any).GoatCore

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_SCORE = 5000000
const MAX_MOVES = 5000        // DoS-Schutz: eine Runde hat realistisch < einige hundert Zuege
const MIN_DURATION_MS = 3000  // eine echte Runde dauert laenger als 3s

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
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
    const clientScore = Number(payload?.score)
    const seed = payload?.seed != null ? Number(payload.seed) : null
    const moves = Array.isArray(payload?.moves) ? payload.moves : null
    const durationMs = payload?.duration_ms != null ? Number(payload.duration_ms) : null
    const eventId = (typeof payload?.event_id === 'string' && payload.event_id) ? payload.event_id : null

    if (mode !== 'high' && mode !== 'daily') return json({ success: false, error: 'invalid mode' }, 400)
    if (!Number.isFinite(clientScore) || clientScore < 0 || clientScore > MAX_SCORE)
      return json({ success: false, error: 'invalid score' }, 400)

    if (!GoatCore || typeof GoatCore.replay !== 'function')
      return json({ success: false, error: 'core unavailable (server)' }, 500)

    let finalScore = Math.round(clientScore)
    let verified = false
    let replayValidated = false
    let linesTotal: number | null = null

    // 3. Replay-Validierung (Anti-Cheat). Ohne gueltige Zug-Liste -> kein Board-Eintrag.
    if (moves && seed != null && Number.isFinite(seed)) {
      if (moves.length > MAX_MOVES) return json({ success: false, error: 'too many moves' }, 400)
      // Zug-Format grob pruefen
      for (const mv of moves) {
        if (!mv || !Number.isFinite(+mv.idx) || !Number.isFinite(+mv.r) || !Number.isFinite(+mv.c))
          return json({ success: false, error: 'malformed moves' }, 400)
      }
      const rep = GoatCore.replay(Math.trunc(seed), mode, moves)
      if (!rep.valid) return json({ success: false, error: 'replay invalid (illegal move)' }, 400)
      if (rep.score > MAX_SCORE) return json({ success: false, error: 'score out of range' }, 400)
      // Server-Score ist maßgeblich; Client-Score nur zur Info verglichen.
      finalScore = rep.score
      verified = true
      replayValidated = (rep.score === Math.round(clientScore))
      // Zusatz-Plausi: unrealistisch schnelle Runde -> nicht als validiert markieren
      if (durationMs != null && Number.isFinite(durationMs) && durationMs < MIN_DURATION_MS) {
        replayValidated = false
      }
    } else {
      // Kein Replay moeglich (Alt-Client/kein moves) -> nur Basis-verified, NICHT preisgeld-faehig
      verified = true
      replayValidated = false
    }

    // 4. Schreiben via Service Role (umgeht RLS; einzige erlaubte Schreibstelle)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: insRow, error: insErr } = await admin.from('goat_scores').insert({
      user_id: userId,
      mode,
      score: finalScore,
      seed: seed != null && Number.isFinite(seed) ? Math.trunc(seed) : null,
      lines_total: linesTotal,
      duration_ms: durationMs != null && Number.isFinite(durationMs) ? Math.trunc(durationMs) : null,
      event_id: eventId,
      verified,
      replay_validated: replayValidated,
    }).select('id').single()
    if (insErr) return json({ success: false, error: insErr.message }, 500)

    // 5. Rang im jeweiligen Modus (nur verifizierte, hoehere Scores zaehlen)
    const { count } = await admin
      .from('goat_scores')
      .select('id', { count: 'exact', head: true })
      .eq('mode', mode)
      .eq('verified', true)
      .gt('score', finalScore)
    const rank = (count ?? 0) + 1

    // 6. Wettkampf-Anreiz: wenn dieser Score ein neuer persoenlicher Bestwert ist und
    //    dabei einen Rivalen ueberholt hat -> den naechstliegenden ueberholten Spieler
    //    per Push benachrichtigen ("X hat dich ueberholt"). Best-effort, nie blockierend.
    if (mode === 'high' && verified) {
      try {
        // Vorheriger Bestwert des Users (ohne die gerade eingefuegte Zeile)
        const { data: prevRows } = await admin
          .from('goat_scores')
          .select('score')
          .eq('user_id', userId)
          .eq('mode', 'high')
          .neq('id', insRow?.id ?? '')
          .order('score', { ascending: false })
          .limit(1)
        const prevBest = prevRows && prevRows.length ? Number(prevRows[0].score) : 0

        // Nur wenn wirklich geklettert (neuer Bestwert ueber dem alten)
        if (finalScore > prevBest) {
          // Kandidaten: Bestwerte oberhalb meines ALTEN Bestwerts -> dedupe pro User -> best je User
          const { data: cand } = await admin
            .from('goat_leaderboard')
            .select('user_id, username, score')
            .eq('mode', 'high')
            .gt('score', prevBest)
            .order('score', { ascending: false })
            .limit(60)
          const bestByUser: Record<string, { username: string; score: number }> = {}
          for (const r of (cand ?? [])) {
            const uid = String((r as { user_id: string }).user_id)
            if (uid === userId) continue
            const sc = Number((r as { score: number }).score)
            if (!bestByUser[uid] || sc > bestByUser[uid].score) {
              bestByUser[uid] = { username: String((r as { username?: string }).username || 'Ein Spieler'), score: sc }
            }
          }
          // Ueberholt = Rivalen, deren Bestwert jetzt UNTER meinem neuen Score liegt.
          // Der naechstliegende (hoechster solcher Score) wird benachrichtigt.
          let victimId: string | null = null
          let victimBest = -1
          for (const uid in bestByUser) {
            const s = bestByUser[uid].score
            if (s < finalScore && s > victimBest) { victimBest = s; victimId = uid }
          }
          // Spiel-Push-Toggle des Opfers respektieren (Einstellungen -> Spiel aus)
          let victimWantsGame = true
          if (victimId) {
            const { data: vset } = await admin
              .from('notification_settings').select('game_push').eq('user_id', victimId).maybeSingle()
            if (vset && (vset as { game_push?: boolean }).game_push === false) victimWantsGame = false
          }
          if (victimId && victimWantsGame) {
            // Name des Ueberholers holen
            let myName = 'Ein Rivale'
            const { data: meRow } = await admin
              .from('public_profiles').select('username').eq('id', userId).maybeSingle()
            if (meRow && (meRow as { username?: string }).username) myName = String((meRow as { username: string }).username)
            await admin.rpc('notify_user_push', {
              p_user_id: victimId,
              p_channel: 'leaderboard_rival',
              p_title: 'Überholt! 🐐',
              p_body: myName + ' hat dich in der Rangliste überholt — hol dir deinen Platz zurück!',
              p_data: { url: '/game/index.html' },
            })
          }
        }
      } catch (_e) {
        // Push-Fehler ignorieren: Score-Submit bleibt erfolgreich.
      }
    }

    return json({ success: true, score: finalScore, verified, replay_validated: replayValidated, rank })
  } catch (e) {
    return json({ success: false, error: String((e as Error)?.message || e) }, 500)
  }
})
