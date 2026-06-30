// Supabase Edge Function: verify-uni-token
// Verifiziert einen Uni-E-Mail-Token serverseitig (umgeht RLS)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Blockierte Domains (private E-Mail-Anbieter)
const BLOCKED_DOMAINS = [
  'gmail.com','googlemail.com','yahoo.com','yahoo.de','hotmail.com','hotmail.de',
  'outlook.com','outlook.de','live.com','live.de','msn.com','icloud.com','me.com',
  'mac.com','aol.com','aol.de','gmx.de','gmx.net','gmx.at','gmx.ch','gmx.com',
  'web.de','freenet.de','mail.com','email.com','zoho.com','yandex.com','yandex.ru',
  'mail.ru','proton.me','protonmail.com','protonmail.ch','pm.me','tutanota.com',
  'tutamail.com','tuta.io','posteo.de','posteo.net','mailbox.org','t-online.de',
  'vodafone.de','o2online.de'
]

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
      throw new Error('Der Verifizierungslink ist ung\u00fcltig oder bereits abgelaufen. Bitte fordere einen neuen Link an.')
    }

    // Token-Ablauf pruefen (24 Stunden gueltig)
    if (profile.uni_email_token_created_at) {
      const tokenAge = Date.now() - new Date(profile.uni_email_token_created_at).getTime()
      const maxAge = 24 * 60 * 60 * 1000 // 24h in ms
      if (tokenAge > maxAge) {
        await supabase.from('profiles').update({ uni_email_verification_token: null }).eq('id', profile.id)
        throw new Error('Der Verifizierungslink ist abgelaufen (max. 24 Stunden g\u00fcltig). Bitte fordere einen neuen Link an.')
      }
    }

    // Server-seitige Domain-Validierung (verhindert Umgehung des Frontend-Checks)
    if (profile.uni_email) {
      const domain = profile.uni_email.split('@')[1]?.toLowerCase()
      if (!domain || BLOCKED_DOMAINS.includes(domain)) {
        await supabase.from('profiles').update({ uni_email_verification_token: null }).eq('id', profile.id)
        throw new Error('Private E-Mail-Adressen (Gmail, GMX, etc.) sind nicht erlaubt. Bitte verwende deine offizielle Uni-E-Mail.')
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
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }
})
