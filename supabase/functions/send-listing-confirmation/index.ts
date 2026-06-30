// Supabase Edge Function: send-listing-confirmation
// Sendet Bestaetigungs-Emails an Job-Ersteller und Coupon-Partner
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function esc(s: string): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function row(label: string, value: string) {
  return `<tr><td style="padding:8px 12px;font-weight:600;color:#374151;font-size:0.9rem;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:8px 12px;color:#4B5563;font-size:0.9rem;">${value}</td></tr>`
}

function footerHtml() {
  return `
    <div style="background:#1F2937;padding:24px 30px;text-align:center;">
      <p style="margin:0 0 4px;color:white;font-weight:700;font-size:0.95rem;">Room8</p>
      <p style="margin:0;color:rgba(255,255,255,0.5);font-size:0.75rem;">Die Studenten-Plattform</p>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.4);font-size:0.7rem;">Bei Fragen antworten Sie einfach auf diese E-Mail.</p>
    </div>`
}

function btn(href: string, text: string, color: string) {
  return `<a href="${href}" style="display:block;text-align:center;background:${color};color:white;padding:14px;border-radius:999px;text-decoration:none;font-weight:700;font-size:1rem;margin-bottom:10px;">${text}</a>`
}

function btnOutline(href: string, text: string, color: string) {
  return `<a href="${href}" style="display:block;text-align:center;border:2px solid ${color};color:${color};padding:12px;border-radius:999px;text-decoration:none;font-weight:700;font-size:0.9rem;">${text}</a>`
}

async function verifyAdmin(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return null
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: profile } = await adminClient.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return null
  return user.id
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const adminId = await verifyAdmin(req)
    if (!adminId) {
      return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { listing_id, type, partner_credentials } = await req.json()

    if (!listing_id || !type) {
      throw new Error('listing_id and type (job/coupon) are required')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const emails: Array<{ from: string; to: string[]; reply_to?: string; subject: string; html: string }> = []

    if (type === 'job') {
      const { data: job } = await supabase
        .from('listings')
        .select('title, company_name, city, salary_amount, salary_type, job_type, owner_id, partner_user_id, application_email, application_url, min_hours_per_week, max_hours_per_week, description')
        .eq('id', listing_id)
        .single()

      if (!job) throw new Error('Job nicht gefunden')

      // Email an den PARTNER schicken (nicht an den Admin der es erstellt hat)
      const recipientId = job.partner_user_id || job.owner_id
      const { data: userData } = await supabase.auth.admin.getUserById(recipientId)
      const ownerEmail = userData?.user?.email || job.application_email || ''
      if (!ownerEmail) throw new Error('Keine E-Mail-Adresse')

      // Firmenname aus Job nutzen, nicht den Profilnamen
      const name = job.company_name ? job.company_name + ' Team' : 'Team'
      const salary = job.salary_amount
        ? job.salary_amount + ' \u20AC' + (job.salary_type === 'per_hour' ? ' / Stunde' : ' / Monat')
        : 'Verhandlungsbasis'
      const typeLabels: Record<string, string> = {
        werkstudent: 'Werkstudent', minijob: 'Minijob', praktikum: 'Praktikum',
        teilzeit: 'Teilzeit', vollzeit: 'Vollzeit'
      }
      const hours = job.min_hours_per_week && job.max_hours_per_week
        ? `${job.min_hours_per_week}-${job.max_hours_per_week}h / Woche` : '-'

      const jobUrl = `https://www.room8.club/job-detail.html?id=${listing_id}`

      const applyInfo = job.application_url
        ? `Bewerber werden direkt auf <strong>${job.application_url.replace(/^https?:\/\//, '')}</strong> weitergeleitet.`
        : `Bewerbungen werden per E-Mail an <strong>${ownerEmail}</strong> weitergeleitet.`

      emails.push({
        from: 'Room8 Jobs <partner@room8.club>',
        to: [ownerEmail],
        reply_to: 'help@room8.club',
        subject: `Ihr Jobinserat "${job.title}" ist jetzt live!`,
        html: `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:20px;background:#f3f4f6;margin:0;">
          <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

            <div style="background:#1F2937;padding:40px 30px;text-align:center;">
              <div style="font-size:1.6rem;font-weight:800;color:#ffffff;margin-bottom:6px;">Room8 <span style="color:#A78BFA;">Jobs</span></div>
              <p style="color:#9CA3AF;margin:0;font-size:0.9rem;">Stellenanzeigen f&uuml;r Unternehmen</p>
              <div style="margin-top:20px;">
                <h1 style="color:#ffffff;margin:0;font-size:1.5rem;font-weight:700;">Ihr Jobinserat ist live!</h1>
              </div>
            </div>

            <div style="padding:30px;">
              <p style="color:#374151;font-size:1rem;line-height:1.6;margin:0 0 24px;">
                Hallo ${name},<br><br>
                ${partner_credentials
                  ? `willkommen als <strong>Room8 Partner</strong>! Ihr Jobinserat ist ab sofort sichtbar. &Uuml;ber Ihr Partner-Dashboard k&ouml;nnen Sie Bewerbungen einsehen.`
                  : `Ihr Jobinserat ist ab sofort auf <strong>Room8</strong> sichtbar und erreicht tausende verifizierte Studenten.`}
              </p>

              ${partner_credentials ? `
              <div style="background:#ECFDF5;border:2px solid #10B981;border-radius:16px;padding:20px;margin-bottom:24px;text-align:center;">
                <div style="font-size:1.5rem;margin-bottom:8px;">&#128274;</div>
                <h3 style="margin:0 0 8px;color:#065F46;font-size:1rem;">Ihr Partner-Zugang</h3>
                <p style="margin:0 0 4px;color:#374151;font-size:0.9rem;">E-Mail: <strong>${partner_credentials.email}</strong></p>
                <p style="margin:0 0 8px;color:#374151;font-size:0.9rem;">Passwort: <strong>${partner_credentials.password}</strong></p>
                <p style="margin:0 0 8px;color:#92400E;font-size:0.82rem;background:#FEF3C7;border-radius:8px;padding:8px 12px;">Bitte &auml;ndern Sie Ihr Passwort nach dem ersten Login.</p>
                <a href="https://www.room8.club/partner-login.html" style="display:inline-block;background:#10B981;color:white;padding:8px 20px;border-radius:999px;text-decoration:none;font-weight:700;font-size:0.85rem;margin-top:4px;">Zum Partner-Portal</a>
              </div>` : ''}

              <div style="background:#F9FAFB;border-radius:16px;overflow:hidden;margin-bottom:24px;">
                <div style="padding:16px 16px 8px;font-weight:700;font-size:0.8rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.05em;">Zusammenfassung</div>
                <table style="width:100%;border-collapse:collapse;">
                  ${row('Titel', esc(job.title))}
                  ${row('Unternehmen', esc(job.company_name) || '-')}
                  ${row('Standort', esc(job.city) || '-')}
                  ${row('Gehalt', salary)}
                  ${row('Typ', typeLabels[job.job_type] || job.job_type || '-')}
                  ${row('Stunden', hours)}
                </table>
              </div>

              ${btn(jobUrl, 'Inserat ansehen', 'linear-gradient(135deg,#8B5CF6,#7C3AED)')}

              <div style="margin-top:24px;background:#F9FAFB;border-radius:12px;padding:16px;">
                <h4 style="margin:0 0 8px;color:#374151;font-size:0.9rem;">So geht's weiter:</h4>
                <p style="margin:0;color:#6B7280;font-size:0.85rem;line-height:1.6;">
                  1. Studenten sehen Ihr Inserat in der Room8 App<br>
                  2. Interessierte bewerben sich direkt &uuml;ber Room8<br>
                  3. ${applyInfo}
                </p>
              </div>
            </div>

            ${footerHtml()}
          </div>
        </body></html>`
      })

    } else if (type === 'coupon') {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('title, business_name, discount_value, discount_code, category, city, address, opening_hours, website, instagram, phone, valid_until, max_redemptions, user_id, partner_user_id')
        .eq('id', listing_id)
        .single()

      if (!coupon) throw new Error('Coupon nicht gefunden')

      const ownerId = coupon.partner_user_id || coupon.user_id
      const { data: userData } = await supabase.auth.admin.getUserById(ownerId)
      const ownerEmail = userData?.user?.email || ''
      if (!ownerEmail) throw new Error('Keine E-Mail-Adresse')

      const { data: profile } = await supabase
        .from('profiles').select('full_name, username, partner_business_name').eq('id', ownerId).single()

      const businessName = profile?.partner_business_name || coupon.business_name || 'Partner'
      const contactName = coupon.business_name ? coupon.business_name + ' Team' : (profile?.partner_business_name || 'Team')
      const validUntil = coupon.valid_until ? new Date(coupon.valid_until).toLocaleDateString('de-DE') : 'Unbegrenzt'
      const couponUrl = `https://www.room8.club/coupon-detail.html?id=${listing_id}`
      const dashboardUrl = 'https://www.room8.club/partner-login.html'

      const credentialsBlock = partner_credentials ? `
          <div style="background:#ECFDF5;border:2px solid #10B981;border-radius:16px;padding:20px;margin-bottom:24px;text-align:center;">
            <div style="font-size:1.5rem;margin-bottom:8px;">&#128274;</div>
            <h3 style="margin:0 0 8px;color:#065F46;font-size:1rem;">Ihr Partner-Zugang</h3>
            <p style="margin:0 0 4px;color:#374151;font-size:0.9rem;">E-Mail: <strong>${partner_credentials.email}</strong></p>
            <p style="margin:0 0 8px;color:#374151;font-size:0.9rem;">Passwort: <strong>${partner_credentials.password}</strong></p>
            <p style="margin:0 0 8px;color:#92400E;font-size:0.82rem;background:#FEF3C7;border-radius:8px;padding:8px 12px;">Bitte &auml;ndern Sie Ihr Passwort nach dem ersten Login.</p>
            <a href="https://www.room8.club/partner-login.html" style="display:inline-block;background:#10B981;color:white;padding:8px 20px;border-radius:999px;text-decoration:none;font-weight:700;font-size:0.85rem;margin-top:4px;">Zum Partner-Portal</a>
          </div>` : ''

      // Zusatzinfos
      let extraRows = ''
      if (coupon.opening_hours) extraRows += row('&Ouml;ffnungszeiten', coupon.opening_hours)
      if (coupon.website) extraRows += row('Website', `<a href="${coupon.website}" style="color:#2563EB;text-decoration:none;">${coupon.website.replace(/^https?:\/\//, '')}</a>`)
      if (coupon.instagram) {
        const ig = coupon.instagram.replace(/^@/, '')
        extraRows += row('Instagram', `<a href="https://instagram.com/${ig}" style="color:#E1306C;text-decoration:none;">@${ig}</a>`)
      }
      if (coupon.phone) extraRows += row('Telefon', `<a href="tel:${coupon.phone}" style="color:#2563EB;text-decoration:none;">${coupon.phone}</a>`)

      emails.push({
        from: 'Room8 Partner <partner@room8.club>',
        to: [ownerEmail],
        reply_to: 'help@room8.club',
        subject: partner_credentials
          ? `Willkommen als Room8 Partner, ${businessName}!`
          : `Ihr Coupon "${coupon.title}" ist jetzt live!`,
        html: `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:20px;background:#f3f4f6;margin:0;">
          <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

            <div style="background:#1F2937;padding:40px 30px;text-align:center;">
              <div style="font-size:1.6rem;font-weight:800;color:#ffffff;margin-bottom:6px;">Room8 <span style="color:#34D399;">Partner</span></div>
              <p style="color:#9CA3AF;margin:0;font-size:0.9rem;">Coupon-Management f&uuml;r Unternehmen</p>
              <div style="margin-top:20px;">
                <h1 style="color:#ffffff;margin:0;font-size:1.5rem;font-weight:700;">
                  ${partner_credentials ? 'Willkommen an Bord!' : 'Ihr Coupon ist live!'}
                </h1>
              </div>
            </div>

            <div style="padding:30px;">
              <p style="color:#374151;font-size:1rem;line-height:1.6;margin:0 0 24px;">
                Hallo ${contactName},<br><br>
                ${partner_credentials
                  ? `willkommen als <strong>Room8 Partner</strong>! Ihr Coupon-Angebot f&uuml;r <strong>${businessName}</strong> ist ab sofort f&uuml;r tausende Studenten sichtbar.`
                  : `Ihr Coupon <strong>${coupon.title}</strong> f&uuml;r <strong>${businessName}</strong> ist ab sofort auf Room8 sichtbar.`
                }
              </p>

              ${credentialsBlock}

              <div style="background:#F9FAFB;border-radius:16px;overflow:hidden;margin-bottom:24px;">
                <div style="padding:16px 16px 8px;font-weight:700;font-size:0.8rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.05em;">Coupon-Details</div>
                <table style="width:100%;border-collapse:collapse;">
                  ${row('Angebot', esc(coupon.title))}
                  ${row('Rabatt', `<strong style="color:#D97706;font-size:1.05rem;">${esc(coupon.discount_value) || '-'}</strong>`)}
                  ${row('Gesch&auml;ft', esc(coupon.business_name) || '-')}
                  ${row('Standort', esc((coupon.city || '-') + (coupon.address ? ', ' + coupon.address : '')))}
                  ${row('Code', `<code style="background:#F3F4F6;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:0.05em;">${esc(coupon.discount_code) || '-'}</code>`)}
                  ${row('G&uuml;ltig bis', validUntil)}
                  ${coupon.max_redemptions ? row('Verf&uuml;gbar', coupon.max_redemptions + ' Einl&ouml;sungen') : ''}
                  ${extraRows}
                </table>
              </div>

              ${btn(couponUrl, 'Coupon-Detailansicht', 'linear-gradient(135deg,#F59E0B,#D97706)')}
              ${partner_credentials ? btn(dashboardUrl, 'Zum Partner-Dashboard', 'linear-gradient(135deg,#10B981,#059669)') : ''}

              <div style="margin-top:20px;background:#F9FAFB;border-radius:12px;padding:16px;">
                <h4 style="margin:0 0 8px;color:#374151;font-size:0.9rem;">So funktioniert's:</h4>
                <p style="margin:0;color:#6B7280;font-size:0.85rem;line-height:1.6;">
                  1. Studenten sehen Ihren Coupon in der Room8 App<br>
                  2. An der Kasse zeigen sie den QR-Code vor<br>
                  3. ${partner_credentials ? 'Sie scannen den Code im Partner-Dashboard &mdash; fertig!' : 'Der Rabatt wird gew&auml;hrt &mdash; fertig!'}
                </p>
              </div>
            </div>

            ${footerHtml()}
          </div>
        </body></html>`
      })
    }

    // Emails senden
    for (const email of emails) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(email),
      })
      if (!res.ok) {
        const errText = await res.text()
        console.error('Resend error:', errText)
        throw new Error('Email konnte nicht gesendet werden: ' + errText)
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Confirmation email error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
