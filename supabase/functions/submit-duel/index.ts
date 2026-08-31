// Supabase Edge Function: submit-duel
// Anti-Cheat-Auswertung fuer PvP-Duelle (Goat-Blast). Beide Spieler schicken ihre
// Zug-Liste (moves), der Server rechnet die Runde aus seed + moves mit GENAU DEMSELBEN
// Core wie der Browser nach (supabase/functions/_shared/goat-core.js == www/game/core.js,
// byte-identisch, per Test abgesichert) und ermittelt den verifizierten Score (vscore).
// Erst wenn BEIDE vscore vorliegen wird der Gewinner bestimmt, ausgezahlt (Escrow) und
// das Match auf 'finished' gesetzt. Client-Scores werden NIE vertraut.
//
// Deploy MIT JWT-Pruefung (NICHT --no-verify-jwt): nur eingeloggte Nutzer duerfen aufrufen.
//   npx supabase functions deploy submit-duel
//
// Auth-Methode 1:1 wie submit-goat-score: Bearer-JWT -> anon-Client mit Authorization-Header
// -> auth.getUser(). Schreibzugriff ausschliesslich ueber Service-Role-Client (umgeht RLS,
// einzige erlaubte Schreibstelle auf public.match neben den SECURITY-DEFINER-RPCs).

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

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  try {
    // 1. User aus dem Bearer-JWT holen (identisch zu submit-goat-score)
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: 'unauthorized' }, 401)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) return json({ ok: false, error: 'unauthorized' }, 401)
    const userId = userData.user.id

    // 2. Eingabe pruefen
    const payload = await req.json().catch(() => ({}))
    const matchId = (typeof payload?.match_id === 'string' && payload.match_id) ? payload.match_id : null
    const moves = Array.isArray(payload?.moves) ? payload.moves : null
    if (!matchId) return json({ ok: false, error: 'invalid match_id' }, 400)
    if (!moves) return json({ ok: false, error: 'missing moves' }, 400)
    if (moves.length > MAX_MOVES) return json({ ok: false, error: 'too many moves' }, 400)
    for (const mv of moves) {
      if (!mv || !Number.isFinite(+mv.idx) || !Number.isFinite(+mv.r) || !Number.isFinite(+mv.c))
        return json({ ok: false, error: 'malformed moves' }, 400)
    }

    if (!GoatCore || typeof GoatCore.replay !== 'function')
      return json({ ok: false, error: 'core unavailable (server)' }, 500)

    // 3. Service-Role-Client (umgeht RLS; einzige erlaubte Schreibstelle auf match)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 4. Match laden + Spieler-Zugehoerigkeit pruefen
    const { data: m, error: mErr } = await admin
      .from('match')
      .select('id, seed, mode, status, host_id, guest_id, wager, host_moves, guest_moves, host_vscore, guest_vscore, paid, winner_id')
      .eq('id', matchId)
      .maybeSingle()
    if (mErr) return json({ ok: false, error: mErr.message }, 500)
    if (!m) return json({ ok: false, error: 'MATCH_NOT_FOUND' }, 404)

    const isHost = m.host_id === userId
    const isGuest = m.guest_id === userId
    if (!isHost && !isGuest) return json({ ok: false, error: 'NOT_A_PLAYER' }, 403)

    const seed = Number(m.seed)
    const mode = m.mode
    if (mode !== 'high' && mode !== 'daily') return json({ ok: false, error: 'invalid mode' }, 400)
    if (!Number.isFinite(seed)) return json({ ok: false, error: 'invalid seed' }, 500)

    // 5. Replay-Validierung (Anti-Cheat): Runde aus seed + moves nachrechnen.
    const rep = GoatCore.replay(Math.trunc(seed), mode, moves)
    if (!rep.valid) return json({ ok: false, error: 'replay invalid (illegal move)' }, 400)
    if (rep.score > MAX_SCORE) return json({ ok: false, error: 'score out of range' }, 400)
    const myVscore = Math.round(rep.score)

    // 6. Eigenen vscore + moves speichern (idempotent: wer schon submitted hat, ueberschreibt
    //    seinen eigenen Wert nicht erneut, falls das Match bereits ausgezahlt ist).
    if (m.paid === true) {
      // Bereits abgeschlossen -> nur bestehendes Ergebnis zurueckgeben (idempotent).
      const myV = isHost ? m.host_vscore : m.guest_vscore
      const oppV = isHost ? m.guest_vscore : m.host_vscore
      return json({
        ok: true, status: m.status, my_vscore: myV, opp_vscore: oppV,
        winner_id: m.winner_id, wager: m.wager ?? 0,
      })
    }

    const patch: Record<string, unknown> = isHost
      ? { host_vscore: myVscore, host_moves: moves }
      : { guest_vscore: myVscore, guest_moves: moves }
    // status auf 'active' heben falls noch 'ready' (Spiel laeuft/lief)
    if (m.status === 'ready') patch.status = 'active'
    const { error: updErr } = await admin.from('match').update(patch).eq('id', matchId)
    if (updErr) return json({ ok: false, error: updErr.message }, 500)

    // 7. Gegner-vscore ermitteln (frisch lesen, um Race mit Gegner-Submit abzudecken)
    const { data: fresh, error: freshErr } = await admin
      .from('match')
      .select('host_vscore, guest_vscore, host_id, guest_id, wager, paid, status, winner_id')
      .eq('id', matchId)
      .maybeSingle()
    if (freshErr || !fresh) return json({ ok: false, error: freshErr?.message || 'reload failed' }, 500)

    const hostV = fresh.host_vscore != null ? Number(fresh.host_vscore) : null
    const guestV = fresh.guest_vscore != null ? Number(fresh.guest_vscore) : null
    const wager = Number(fresh.wager ?? 0)
    const myV = isHost ? hostV : guestV
    const oppV = isHost ? guestV : hostV

    // 8. Wenn BEIDE vscore vorliegen UND noch nicht ausgezahlt -> Gewinner + Escrow-Auszahlung.
    //    Atomarer Guard gegen Doppelauszahlung: bedingtes UPDATE ... where paid=false, das
    //    NUR EIN gleichzeitiger Aufruf gewinnt (returning-Zeile). Der Verlierer des Races
    //    bekommt 0 Zeilen zurueck und ueberspringt die Auszahlung.
    if (hostV != null && guestV != null && fresh.paid === false) {
      let winnerId: string | null = null
      if (hostV > guestV) winnerId = fresh.host_id as string
      else if (guestV > hostV) winnerId = fresh.guest_id as string
      else winnerId = null // Unentschieden

      // Escrow-Zustand atomar beanspruchen: nur der erste Aufruf setzt paid=true.
      const { data: claimed, error: claimErr } = await admin
        .from('match')
        .update({ status: 'finished', finished_at: new Date().toISOString(), winner_id: winnerId, paid: true })
        .eq('id', matchId)
        .eq('paid', false)
        .select('id')
        .maybeSingle()
      if (claimErr) return json({ ok: false, error: claimErr.message }, 500)

      if (claimed) {
        // Nur der Gewinner dieses Guards zahlt aus (verhindert Doppel-Auszahlung).
        if (wager > 0) {
          if (winnerId) {
            // Gewinner erhaelt beide Einsaetze (2 * wager).
            const { error: payErr } = await admin.rpc('add_coins', {
              p_user: winnerId, p_delta: 2 * wager, p_reason: 'duel_win', p_ref: matchId,
            })
            if (payErr) {
              // Auszahlung fehlgeschlagen: match bleibt finished+paid; wir melden Fehler, damit
              // es sichtbar wird (kein stiller Coin-Verlust). Manuelles Nacharbeiten moeglich.
              return json({ ok: false, error: 'payout failed: ' + payErr.message, status: 'finished' }, 500)
            }
          } else {
            // Unentschieden -> beide bekommen ihren Einsatz zurueck.
            const { error: r1 } = await admin.rpc('add_coins', {
              p_user: fresh.host_id, p_delta: wager, p_reason: 'duel_refund', p_ref: matchId,
            })
            const { error: r2 } = await admin.rpc('add_coins', {
              p_user: fresh.guest_id, p_delta: wager, p_reason: 'duel_refund', p_ref: matchId,
            })
            if (r1 || r2) {
              return json({ ok: false, error: 'refund failed: ' + (r1?.message || r2?.message), status: 'finished' }, 500)
            }
          }
        }
      }

      return json({
        ok: true, status: 'finished', my_vscore: myV, opp_vscore: oppV,
        winner_id: winnerId, wager,
      })
    }

    // 9. Erst ein Spieler hat submitted -> auf Gegner warten.
    return json({
      ok: true, status: fresh.status, my_vscore: myV, opp_vscore: oppV,
      winner_id: fresh.winner_id ?? null, wager,
    })
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500)
  }
})
