// Supabase Edge Function: send-notification
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

// Typen die Mails an FREMDE User schicken -> nur Admins duerfen sie ausloesen.
const ADMIN_TYPES = ['account_verified', 'verification_approved', 'verification_rejected', 'admin_verification_request']

// HTML-Escape gegen Injection in Mail-Templates (User-kontrollierte Felder wie Name).
function escHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Plain-Text-Fallback aus HTML. HTML-only Mails scoren schlechter im Spam-Filter.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&copy;/g, '(c)').replace(/&amp;/g, '&').replace(/&#\d+;/g, '')
    .replace(/[ \t]+/g, ' ').replace(/(\s*\n\s*){2,}/g, '\n\n').trim()
}

// CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Auth-Wand: nur eingeloggte User. Vorher war die Function offen ->
    // jeder konnte ueber unsere verifizierte Domain beliebige Mails verschicken. ---
    const authHeader = req.headers.get('Authorization') || ''
    const userToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!userToken || !supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ success: false, error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: authErr } = await authedClient.auth.getUser(userToken)
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { to, type, data } = await req.json()

    // Admin-Typen (Mail an fremde User) nur fuer Admins.
    if (ADMIN_TYPES.includes(type)) {
      const { data: prof } = await authedClient.from('profiles').select('is_admin').eq('id', userData.user.id).single()
      if (!prof || prof.is_admin !== true) {
        return new Response(JSON.stringify({ success: false, error: 'admin_only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Link-Injection-Schutz: nur room8.club-Links erlaubt (kein Phishing ueber unsere Domain).
    if (data && data.verificationLink && !/^https:\/\/(www\.)?room8\.club\//.test(String(data.verificationLink))) {
      return new Response(JSON.stringify({ success: false, error: 'invalid_link' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // E-Mail Templates
    const templates = {
      'uni_email_verification': {
        from: 'Room8 Team <help@room8.club>',
        subject: 'Bestaetige deine Uni-E-Mail fuer Room8',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; background: #f3f4f6;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); padding: 40px; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 15px;">&#127891;</div>
                <h1 style="color: white; margin: 0; font-size: 2rem;">Uni-E-Mail bestaetigen</h1>
              </div>
              <div style="padding: 40px 30px;">
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">Hi,</p>
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">Fast geschafft! Bestaetige jetzt deine Uni-E-Mail-Adresse, um deine Room8-Verifizierung abzuschliessen.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.verificationLink}" style="display: inline-block; background: #3b82f6; color: white !important; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                    &#9989; E-Mail bestaetigen
                  </a>
                </div>
                <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                  Falls du diese Verifizierung nicht angefordert hast, kannst du diese E-Mail ignorieren.
                </p>
              </div>
              <div style="background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; font-size: 14px;">
                <p style="margin: 0 0 10px 0;">&copy; 2025 Room8</p>
                <p style="margin: 0;">Fragen? <a href="mailto:help@room8.club" style="color: #60a5fa; text-decoration: none;">help@room8.club</a></p>
              </div>
            </div>
          </body>
          </html>
        `
      },
      
      'account_verified': {
        from: 'Room8 Team <help@room8.club>',
        subject: 'Dein Konto wurde verifiziert!',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; background: #f3f4f6;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 50px 30px; text-align: center;">
                <div style="font-size: 4rem; margin-bottom: 15px;">&#127881;</div>
                <h1 style="color: white; margin: 0; font-size: 2.5rem;">Herzlichen Glueckwunsch!</h1>
              </div>
              <div style="padding: 40px 30px;">
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">Hi ${escHtml(data.userName)},</p>
                <p style="color: #374151; line-height: 1.6; font-size: 16px;"><strong>Dein Studenten-Status wurde verifiziert.</strong></p>
                <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 25px 0; border-radius: 8px;">
                  <h3 style="margin: 0 0 15px 0; color: #065f46;">Du hast jetzt vollen Zugriff auf:</h3>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                    <li style="margin: 8px 0; color: #065f46;">Alle Inserate mit vollstaendigen Details</li>
                    <li style="margin: 8px 0; color: #065f46;">Nachrichten an andere Nutzer senden</li>
                    <li style="margin: 8px 0; color: #065f46;">Eigene Inserate erstellen</li>
                  </ul>
                </div>
                <div style="text-align: center;">
                  <a href="https://room8.club/wohnungen.html" style="display: inline-block; background: #10b981; color: white !important; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Jetzt losschauen
                  </a>
                </div>
                <p style="margin-top: 30px; color: #374151;">
                  Willkommen in der Room8 Community!<br>
                  <strong>Dein Room8 Team</strong>
                </p>
              </div>
              <div style="background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; font-size: 14px;">
                <p style="margin: 0;">&copy; 2025 Room8</p>
              </div>
            </div>
          </body>
          </html>
        `
      },

      'verification_approved': {
        from: 'Room8 Team <help@room8.club>',
        subject: 'Deine Verifizierung wurde bestaetigt!',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; background: #f3f4f6;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 15px;">&#9989;</div>
                <h1 style="color: white; margin: 0; font-size: 2rem;">Verifizierung bestaetigt!</h1>
              </div>
              <div style="padding: 40px 30px;">
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">Hi,</p>
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">Dein Studenten-Status wurde erfolgreich verifiziert. Du hast jetzt vollen Zugriff auf alle Funktionen von Room8!</p>
                <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 25px 0; border-radius: 8px;">
                  <h3 style="margin: 0 0 15px 0; color: #065f46;">Du kannst jetzt:</h3>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                    <li style="margin: 8px 0; color: #065f46;">Alle Inserate mit Details ansehen</li>
                    <li style="margin: 8px 0; color: #065f46;">Nachrichten an andere Nutzer senden</li>
                    <li style="margin: 8px 0; color: #065f46;">Eigene Inserate erstellen</li>
                  </ul>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://room8.club/wohnungen.html" style="display: inline-block; background: #10b981; color: white !important; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                    Jetzt losschauen
                  </a>
                </div>
                <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                  Willkommen in der Room8 Community!<br>
                  <strong>Dein Room8 Team</strong>
                </p>
              </div>
              <div style="background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; font-size: 14px;">
                <p style="margin: 0 0 10px 0;">&copy; 2025 Room8</p>
                <p style="margin: 0;">Fragen? <a href="mailto:help@room8.club" style="color: #60a5fa; text-decoration: none;">help@room8.club</a></p>
              </div>
            </div>
          </body>
          </html>
        `
      },

      'verification_rejected': {
        from: 'Room8 Team <help@room8.club>',
        subject: 'Deine Verifizierung wurde abgelehnt',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; background: #f3f4f6;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 40px; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 15px;">&#10060;</div>
                <h1 style="color: white; margin: 0; font-size: 2rem;">Verifizierung abgelehnt</h1>
              </div>
              <div style="padding: 40px 30px;">
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">Hi,</p>
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">Deine Verifizierung wurde leider abgelehnt. Bitte versuche es erneut mit einem gueltigen Dokument oder deiner Uni-E-Mail-Adresse.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://room8.club/verify-options.html" style="display: inline-block; background: #3b82f6; color: white !important; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                    Erneut verifizieren
                  </a>
                </div>
                <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                  Falls du Fragen hast, kontaktiere uns unter <a href="mailto:help@room8.club" style="color: #3b82f6; text-decoration: none;">help@room8.club</a>.
                </p>
              </div>
              <div style="background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; font-size: 14px;">
                <p style="margin: 0 0 10px 0;">&copy; 2025 Room8</p>
                <p style="margin: 0;">Fragen? <a href="mailto:help@room8.club" style="color: #60a5fa; text-decoration: none;">help@room8.club</a></p>
              </div>
            </div>
          </body>
          </html>
        `
      },

      'admin_verification_request': {
        from: 'Room8 Admin <admin@room8.club>',
        subject: '🔔 Neue Verifizierungsanfrage',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: monospace; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto;">
              <h2>🔔 Neue Verifizierungsanfrage</h2>
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <strong>User:</strong> ${escHtml(data.userName)}<br>
                <strong>E-Mail:</strong> ${escHtml(data.userEmail)}<br>
                <strong>Uni-Domain:</strong> ${escHtml(data.emailDomain)}<br>
                <strong>Registriert:</strong> ${escHtml(data.registeredAt)}
              </div>
              ${data.documentUploaded ? '<p>📄 Immatrikulationsbescheinigung wurde hochgeladen.</p>' : '<p>✉️ E-Mail-Verifizierung wird genutzt.</p>'}
              <a href="https://room8.club/admin.html" style="display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 15px;">
                Im Admin-Panel öffnen
              </a>
            </div>
          </body>
          </html>
        `
      }
    }
    
    const template = templates[type]
    
    if (!template) {
      throw new Error(`Unknown notification type: ${type}`)
    }
    
    // Send email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: template.from,
        to: [to],
        subject: template.subject,
        html: template.html,
        text: htmlToText(template.html),
        headers: {
          'List-Unsubscribe': '<mailto:help@room8.club?subject=unsubscribe>'
        }
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Resend API error: ${error}`)
    }
    
    const result = await response.json()
    
    return new Response(
      JSON.stringify({ success: true, emailId: result.id }),
      { 
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        } 
      }
    )
    
  } catch (error) {
    console.error('Error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 400, 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        } 
      }
    )
  }
})