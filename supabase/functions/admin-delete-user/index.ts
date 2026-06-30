import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const adminId = await verifyAdmin(req)
    if (!adminId) {
      return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { email } = await req.json()
    if (!email) return new Response(JSON.stringify({ error: 'email is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // User per Email in profiles suchen (skaliert besser als listUsers)
    const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).single()
    if (!profile) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const userId = profile.id

    // Verknuepfungen aufloesen
    const { error: e1 } = await supabase.from('coupons').update({ partner_user_id: null }).eq('partner_user_id', userId)
    if (e1) console.error('Coupons unlink error:', e1)
    const { error: e2 } = await supabase.from('listings').update({ partner_user_id: null }).eq('partner_user_id', userId)
    if (e2) console.error('Listings unlink error:', e2)
    await supabase.from('coupon_redemptions').delete().eq('user_id', userId)
    await supabase.from('notifications').delete().eq('user_id', userId)
    await supabase.from('messages').delete().eq('sender_id', userId)

    // Auth-User loeschen (Cascade loescht auch profiles)
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) {
      // Fallback: Profil manuell loeschen
      await supabase.from('profiles').delete().eq('id', userId)
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true, deleted: email }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('admin-delete-user error:', err)
    return new Response(JSON.stringify({ error: 'Interner Fehler.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
