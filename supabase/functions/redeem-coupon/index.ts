// Supabase Edge Function: redeem-coupon
// Verifiziert und loest einen Coupon ein (fuer Geschaefte ohne Login)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

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
    const { code, action } = await req.json()

    if (!code) {
      throw new Error('Kein Einl\u00f6se-Code angegeben.')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Redemption anhand des Codes finden
    const { data: redemption, error: findError } = await supabase
      .from('coupon_redemptions')
      .select('id, user_id, coupon_id, redeemed_at, created_at')
      .eq('verification_code', code)
      .single()

    if (findError || !redemption) {
      throw new Error('Ung\u00fcltiger Einl\u00f6se-Code.')
    }

    // Coupon-Details laden (inkl. Limits)
    const { data: coupon } = await supabase
      .from('coupons')
      .select('title, business_name, discount_value, discount_code, max_redemptions, current_redemptions, is_active')
      .eq('id', redemption.coupon_id)
      .single()

    // User-Name laden
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, full_name')
      .eq('id', redemption.user_id)
      .single()

    const userName = profile?.full_name || profile?.username || 'Student'

    // Coupon-Limit erreicht?
    if (coupon && coupon.max_redemptions && coupon.current_redemptions >= coupon.max_redemptions) {
      return new Response(
        JSON.stringify({
          success: false,
          limit_reached: true,
          coupon: coupon,
          error: 'Dieser Coupon ist leider ausgesch\u00f6pft. Alle Pl\u00e4tze sind vergeben.'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    // Bereits eingeloest?
    if (redemption.redeemed_at) {
      return new Response(
        JSON.stringify({
          success: false,
          already_redeemed: true,
          redeemed_at: redemption.redeemed_at,
          coupon: coupon,
          user_name: userName,
          error: 'Dieser Coupon wurde bereits eingel\u00f6st.'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    // Action: nur pruefen oder einloesen
    if (action === 'redeem') {
      // Atomares Update: Nur wenn redeemed_at noch NULL ist (verhindert Race Condition)
      const { data: updated, error: updateError } = await supabase
        .from('coupon_redemptions')
        .update({ redeemed_at: new Date().toISOString() })
        .eq('id', redemption.id)
        .is('redeemed_at', null)
        .select('id')

      if (updateError) {
        console.error('Redeem update error:', updateError.message)
        throw new Error('Einl\u00f6sung konnte nicht gespeichert werden.')
      }

      // Kein Update passiert = bereits eingeloest (Race Condition abgefangen)
      if (!updated || updated.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            already_redeemed: true,
            error: 'Dieser Coupon wurde bereits eingel\u00f6st.'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        )
      }

      // Redemption-Counter atomar erhoehen + ggf. Coupon deaktivieren
      const { data: newCount } = await supabase.rpc('increment_coupon_redemptions', { p_coupon_id: redemption.coupon_id })

      var remaining = null
      if (coupon && coupon.max_redemptions) {
        remaining = coupon.max_redemptions - (newCount || (coupon.current_redemptions + 1))
      }

      return new Response(
        JSON.stringify({
          success: true,
          redeemed: true,
          coupon: coupon,
          user_name: userName,
          remaining: remaining
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    // Default: Nur validieren (nicht einloesen)
    return new Response(
      JSON.stringify({
        success: true,
        valid: true,
        coupon: coupon,
        user_name: userName,
        created_at: redemption.created_at
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )

  } catch (error) {
    console.error('Redeem error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }
})
