// Supabase Edge Function: send-application
// Sendet gebrandete Bewerbungs-Email an Arbeitgeber via Resend
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth-Check: Caller muss der Bewerber selbst sein
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: callingUser }, error: authError } = await userClient.auth.getUser()
    if (authError || !callingUser) {
      return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { user_id, listing_id, message, cv_path } = await req.json()

    if (!user_id || !listing_id) {
      throw new Error('user_id and listing_id are required')
    }

    // Sicherheitscheck: User darf nur als sich selbst bewerben
    if (callingUser.id !== user_id) {
      return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Bewerber-Profil laden
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username, university, study_field, semester, is_verified, is_student_verified')
      .eq('id', user_id)
      .single()

    // 2. Bewerber-Email laden
    const { data: userData } = await supabase.auth.admin.getUserById(user_id)
    const applicantEmail = userData?.user?.email || ''

    // 3. Job-Listing laden (inkl. partner_user_id fuer Fallback)
    const { data: job } = await supabase
      .from('listings')
      .select('title, company_name, application_email, city, partner_user_id, owner_id')
      .eq('id', listing_id)
      .single()

    if (!job) throw new Error('Job nicht gefunden')

    // Email-Empfaenger: Partner > application_email > Owner
    let recipientEmail = job.application_email || ''
    if (!recipientEmail && job.partner_user_id) {
      const { data: partnerAuth } = await supabase.auth.admin.getUserById(job.partner_user_id)
      recipientEmail = partnerAuth?.user?.email || ''
    }
    if (!recipientEmail && job.owner_id) {
      const { data: ownerAuth } = await supabase.auth.admin.getUserById(job.owner_id)
      recipientEmail = ownerAuth?.user?.email || ''
    }
    if (!recipientEmail) {
      throw new Error('Keine Empfaenger-Email fuer diesen Job')
    }

    const applicantName = profile?.full_name || profile?.username || 'Student'
    const uni = profile?.university || 'Nicht angegeben'
    const studyField = profile?.study_field || 'Nicht angegeben'
    const semester = profile?.semester || '-'
    const verified = (profile?.is_verified || profile?.is_student_verified) ? 'Ja' : 'Nein'
    const escapedMessage = (message || 'Keine Nachricht').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

    // 4. CV herunterladen (wenn vorhanden)
    let attachments: { filename: string; content: string }[] = []
    if (cv_path) {
      const { data: cvData } = await supabase.storage
        .from('job-applications')
        .download(cv_path)

      if (cvData) {
        const arrayBuffer = await cvData.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        attachments = [{
          filename: `Lebenslauf_${applicantName.replace(/\s+/g, '_')}.pdf`,
          content: base64,
        }]
      }
    }

    // 5. Profil-Link
    const profileUrl = `https://www.room8.club/public-profile.html?id=${user_id}`

    // 6. Gebrandete Email senden via Resend
    const emailBody = {
      from: 'Room8 Bewerbungen <help@room8.club>',
      to: [recipientEmail],
      reply_to: applicantEmail,
      subject: `Neue Bewerbung via Room8: ${job.title}`,
      html: `
        <!DOCTYPE html>
        <html lang="de">
        <head><meta charset="UTF-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; padding: 20px; background: #f3f4f6; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

            <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
              <div style="font-size: 3rem; margin-bottom: 10px;">&#128188;</div>
              <h1 style="color: white; margin: 0; font-size: 1.6rem; font-weight: 700;">Neue Bewerbung</h1>
              <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 1rem;">${job.title} bei ${job.company_name || 'Ihrem Unternehmen'}</p>
            </div>

            <div style="padding: 30px;">
              <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px 0; font-size: 1rem; color: #374151;">Bewerber-Profil</h3>
                <table style="width: 100%; font-size: 0.95rem; color: #4B5563;">
                  <tr><td style="padding: 4px 0; font-weight: 600; width: 130px;">Name</td><td>${applicantName}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: 600;">E-Mail</td><td><a href="mailto:${applicantEmail}" style="color: #8B5CF6;">${applicantEmail}</a></td></tr>
                  <tr><td style="padding: 4px 0; font-weight: 600;">Universit&auml;t</td><td>${uni}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: 600;">Studiengang</td><td>${studyField}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: 600;">Semester</td><td>${semester}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: 600;">Verifiziert</td><td>${verified === 'Ja' ? '&#10003; Verifizierter Student' : 'Nicht verifiziert'}</td></tr>
                </table>
              </div>

              <div style="margin-bottom: 24px;">
                <h3 style="margin: 0 0 8px 0; font-size: 1rem; color: #374151;">Nachricht</h3>
                <div style="background: #F9FAFB; border-radius: 12px; padding: 16px; color: #4B5563; line-height: 1.6; font-size: 0.95rem;">
                  ${escapedMessage}
                </div>
              </div>

              ${cv_path ? '<p style="color: #6B7280; font-size: 0.9rem;">&#128206; Lebenslauf als PDF im Anhang</p>' : ''}

              <a href="https://www.room8.club/partner-login.html" style="display: block; text-align: center; background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 14px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 1rem; margin-top: 20px;">
                Im Partner-Portal ansehen
              </a>

              <a href="${profileUrl}" style="display: block; text-align: center; border: 2px solid #8B5CF6; color: #8B5CF6; padding: 12px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 0.9rem; margin-top: 10px;">
                Bewerber-Profil ansehen
              </a>

              <p style="color: #9CA3AF; font-size: 0.8rem; text-align: center; margin-top: 16px;">
                Im Partner-Portal finden Sie alle Bewerbungen, Bewerber-Profile und Lebensl&auml;ufe.<br>
                Oder antworten Sie direkt auf diese E-Mail.
              </p>
            </div>

            <div style="background: #F9FAFB; padding: 20px 30px; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #9CA3AF; font-size: 0.8rem;">
                Diese Bewerbung wurde &uuml;ber <strong>Room8</strong> eingereicht &mdash; Die Studenten-Plattform.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      ...(attachments.length > 0 ? { attachments } : {}),
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailBody),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      throw new Error(`Resend error: ${errText}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
