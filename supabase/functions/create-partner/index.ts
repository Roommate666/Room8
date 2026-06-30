// Supabase Edge Function: create-partner
// Erstellt Partner-Account oder verknuepft bestehenden Account
// NUR von Admins aufrufbar
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { email, password, business_name, coupon_id, listing_id } = await req.json()

    if (!email) {
      throw new Error('email is required')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Pruefen ob User schon existiert (per profiles statt listUsers - skaliert)
    const { data: existingProfile } = await supabase
      .from('profiles').select('id').eq('email', email).maybeSingle()

    let userId: string
    let isNewAccount = false

    if (existingProfile) {
      // User existiert schon - als Partner markieren und verknuepfen
      userId = existingProfile.id
      const { error: updateErr } = await supabase.from('profiles').update({
        is_partner: true,
        partner_business_name: business_name || undefined
      }).eq('id', userId)
      if (updateErr) console.error('Profile update error:', updateErr)
    } else {
      // Neuen User erstellen
      if (!password) throw new Error('password is required for new accounts')
      if (password.length < 6) throw new Error('password must be at least 6 characters')

      const { data: userData, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { is_partner: true, business_name: business_name }
      })

      if (createError) throw createError
      if (!userData?.user) throw new Error('User konnte nicht erstellt werden')

      userId = userData.user.id
      isNewAccount = true

      // Kurz warten damit der DB-Trigger das Profil erstellt
      await new Promise(resolve => setTimeout(resolve, 500))

      const { error: profileErr } = await supabase.from('profiles').update({
        is_partner: true,
        partner_business_name: business_name || null
      }).eq('id', userId)
      if (profileErr) console.error('Profile update error after creation:', profileErr)
    }

    // Coupon verknuepfen
    if (coupon_id) {
      console.log('Linking coupon', coupon_id, 'to user', userId)
      const { error: couponErr } = await supabase.from('coupons').update({
        partner_user_id: userId
      }).eq('id', coupon_id)
      if (couponErr) console.error('Coupon link error:', couponErr)
    }

    // Job/Listing verknuepfen
    if (listing_id) {
      console.log('Linking listing', listing_id, 'to user', userId)
      const { error: listingErr } = await supabase.from('listings').update({
        partner_user_id: userId
      }).eq('id', listing_id)
      if (listingErr) console.error('Listing link error:', listingErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        is_new_account: isNewAccount,
        message: isNewAccount
          ? 'Partner-Account erstellt'
          : 'Bestehendes Konto als Partner verknuepft'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Create partner error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
