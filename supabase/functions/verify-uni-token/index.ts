// Supabase Edge Function: verify-uni-token
// Verifiziert einen Uni-E-Mail-Token serverseitig (umgeht RLS)
//
// Quelle der Wahrheit = Tabelle public.uni_domains (EINE zentrale Allowlist, geteilt mit
// der DB-Funktion request_uni_code und dem Client). is_pattern=false -> exakte Domain,
// is_pattern=true -> Postgres-POSIX-Regex. Keine hardcoded Domain-Liste mehr hier.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Blockierte Domains (private E-Mail-Anbieter). Gespiegelt aus request_uni_code (v_blocked),
// damit ein Freemailer niemals als Uni gilt, selbst wenn er irgendein Muster streifen wuerde.
const BLOCKED_DOMAINS = new Set([
  'gmail.com','googlemail.com','gmx.de','gmx.net','web.de','yahoo.com','yahoo.de',
  'hotmail.com','hotmail.de','outlook.com','outlook.de','live.de','live.com','icloud.com','me.com',
  't-online.de','freenet.de','aol.com','proton.me','protonmail.com','mail.de'
])

// Laedt die Allowlist aus uni_domains und entscheidet exakt ODER Muster.
// Gleiche Logik wie DB-Funktion request_uni_code: Freemail-Block zuerst, dann Tabelle.
// deno-lint-ignore no-explicit-any
async function isUniDomain(
  supabase: any,
  domain: string | undefined
): Promise<boolean> {
  if (!domain) return false
  const d = domain.toLowerCase()
  if (BLOCKED_DOMAINS.has(d)) return false

  const { data, error } = await supabase
    .from('uni_domains')
    .select('value, is_pattern')

  if (error || !data) {
    // Fail-closed: lieber ablehnen als eine Nicht-Uni durchlassen.
    console.error('uni_domains load error:', error?.message)
    return false
  }

  for (const row of data) {
    const value = row.value as string
    if (!row.is_pattern) {
      if (d === value.toLowerCase()) return true
    } else {
      // Postgres-POSIX-Regex. JS-RegExp ist kompatibel genug fuer diese Muster
      // (keine POSIX-Klassen verwendet). test() gegen die volle Domain, ungeankert
      // wie "v_domain ~ value" (Muster tragen eigene ^/$ Anker wo noetig).
      try {
        if (new RegExp(value).test(d)) return true
      } catch (_e) {
        console.error('invalid uni_domains pattern:', value)
      }
    }
  }
  return false
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token, action } = await req.json()

    if (!token) {
      throw new Error('Kein Verifizierungstoken in der Anfrage.')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Profil mit diesem Token finden
    const { data: profile, error: findError } = await supabase
      .from('profiles')
      .select('id, uni_email, email, username, uni_email_token_created_at')
      .eq('uni_email_verification_token', token)
      .single()

    if (findError || !profile) {
      console.error('DB lookup error:', findError?.message, findError?.code)
      throw new Error('Der Verifizierungslink ist ungültig oder bereits abgelaufen. Bitte fordere einen neuen Link an.')
    }

    // Token-Ablauf pruefen (24 Stunden gueltig)
    if (profile.uni_email_token_created_at) {
      const tokenAge = Date.now() - new Date(profile.uni_email_token_created_at).getTime()
      const maxAge = 24 * 60 * 60 * 1000 // 24h in ms
      if (tokenAge > maxAge) {
        await supabase.from('profiles').update({ uni_email_verification_token: null }).eq('id', profile.id)
        throw new Error('Der Verifizierungslink ist abgelaufen (max. 24 Stunden gültig). Bitte fordere einen neuen Link an.')
      }
    }

    // Server-seitige Uni-Domain-Validierung (Allowlist/Muster aus uni_domains). Eigene Domains kommen NICHT durch.
    if (profile.uni_email) {
      const domain = profile.uni_email.split('@')[1]?.toLowerCase()
      if (!(await isUniDomain(supabase, domain))) {
        await supabase.from('profiles').update({ uni_email_verification_token: null }).eq('id', profile.id)
        throw new Error('Diese E-Mail sieht nicht nach einer offiziellen Uni-Adresse aus. Bitte nutze deine offizielle Hochschul-Mail-Adresse (z. B. name@uni-stadt.de).')
      }
    }

    // Pruefen ob diese Uni-Email bereits von einem anderen Account verifiziert wurde
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('uni_email', profile.uni_email)
      .eq('uni_email_verified', true)
      .neq('id', profile.id)
      .limit(1)

    if (existing && existing.length > 0) {
      // Duplikat gefunden - Transfer oder Fehlermeldung?
      if (action === 'transfer') {
        // Transfer: Verifizierung vom alten Konto entfernen
        const { error: resetError } = await supabase
          .from('profiles')
          .update({
            is_verified: false,
            is_student: false,
            uni_email_verified: false,
            verification_status: 'none',
            verification_method: null,
            verified_at: null
          })
          .eq('id', existing[0].id)

        if (resetError) {
          console.error('Reset old profile error:', resetError.message)
          throw new Error('Transfer fehlgeschlagen. Bitte versuche es erneut.')
        }

        // Weiter mit Verifizierung des neuen Kontos (kein return/throw hier)
      } else {
        // Kein Transfer angefordert - spezifischen Fehler zurueckgeben
        // Token NICHT loeschen, damit Transfer noch moeglich ist
        return new Response(
          JSON.stringify({
            success: false,
            error_code: 'duplicate_uni_email',
            error: 'Diese Uni-E-Mail ist bereits mit einem anderen Konto verifiziert.',
            existing_username: existing[0].username || null
          }),
          { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        )
      }
    }

    // Profil verifizieren
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        is_verified: true,
        is_student: true,
        uni_email_verified: true,
        verification_status: 'approved',
        verified_at: new Date().toISOString(),
        uni_email_verification_token: null
      })
      .eq('id', profile.id)

    if (updateError) {
      console.error('Profile update error:', updateError.message, updateError.code)
      if (updateError.code === '23505') {
        throw new Error('Diese Uni-E-Mail-Adresse ist bereits mit einem anderen Konto verifiziert.')
      }
      throw new Error('Verifizierung konnte nicht gespeichert werden. Bitte versuche es erneut.')
    }

    return new Response(
      JSON.stringify({
        success: true,
        uni_email: profile.uni_email,
        username: profile.username,
        transferred: action === 'transfer'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )

  } catch (error) {
    console.error('Verify error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }
})
