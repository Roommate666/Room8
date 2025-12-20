// Supabase Edge Function: send-notification
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

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
    const { to, type, data } = await req.json()
    
    // E-Mail Templates
    const templates = {
      'uni_email_verification': {
        from: 'Room8 Team <help@room8.club>',
        subject: 'Verify your student email for Room8',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; background: #f3f4f6;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); padding: 40px; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 15px;">🎓</div>
                <h1 style="color: white; margin: 0; font-size: 2rem;">Verify Your Student Email</h1>
              </div>
              <div style="padding: 40px 30px;">
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">Hi,</p>
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">You're almost done! Just confirm your university email to complete your Room8 verification.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.verificationLink}" style="display: inline-block; background: #3b82f6; color: white !important; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                    ✓ Verify Student Email
                  </a>
                </div>
                <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                  If you didn't request this verification, you can safely ignore this email.
                </p>
              </div>
              <div style="background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; font-size: 14px;">
                <p style="margin: 0 0 10px 0;">© 2024 Room8 - Campus Marketplace for Students</p>
                <p style="margin: 0;">Questions? <a href="mailto:help@room8.club" style="color: #60a5fa; text-decoration: none;">help@room8.club</a></p>
              </div>
            </div>
          </body>
          </html>
        `
      },
      
      'account_verified': {
        from: 'Room8 Team <help@room8.club>',
        subject: '🎉 Your account has been verified!',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; background: #f3f4f6;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 50px 30px; text-align: center;">
                <div style="font-size: 4rem; margin-bottom: 15px;">🎉</div>
                <h1 style="color: white; margin: 0; font-size: 2.5rem;">Congratulations!</h1>
              </div>
              <div style="padding: 40px 30px;">
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">Hi ${data.userName},</p>
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">Great news! <strong>Your student status has been verified.</strong></p>
                <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 25px 0; border-radius: 8px;">
                  <h3 style="margin: 0 0 15px 0; color: #065f46;">You now have full access to:</h3>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                    <li style="margin: 8px 0; color: #065f46;">🏡 Browse apartments with full addresses</li>
                    <li style="margin: 8px 0; color: #065f46;">💬 Message landlords and roommates</li>
                    <li style="margin: 8px 0; color: #065f46;">📝 Create your own listings</li>
                  </ul>
                </div>
                <div style="text-align: center;">
                  <a href="https://room8.club/wohnungen.html" style="display: inline-block; background: #10b981; color: white !important; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Start Browsing Apartments
                  </a>
                </div>
                <p style="margin-top: 30px; color: #374151;">
                  Welcome to the Room8 community! 🙌<br>
                  <strong>The Room8 Team</strong>
                </p>
              </div>
              <div style="background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; font-size: 14px;">
                <p style="margin: 0;">© 2024 Room8 - Campus Marketplace for Students</p>
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
                <strong>User:</strong> ${data.userName}<br>
                <strong>E-Mail:</strong> ${data.userEmail}<br>
                <strong>Uni-Domain:</strong> ${data.emailDomain}<br>
                <strong>Registriert:</strong> ${data.registeredAt}
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
        html: template.html
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