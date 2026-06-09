import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.14"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Liefert eine kurzlebige signierte URL zum Lebenslauf einer Bewerbung.
// Zugriff nur fuer: (a) den Job-Owner der zugehoerigen listing, oder (b) Admin.
// Aufruf: POST { application_id }
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nicht autorisiert' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Nicht autorisiert' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { application_id } = await req.json()
    if (!application_id) {
      return new Response(JSON.stringify({ error: 'application_id erforderlich' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey)

    // Bewerbung + zugehoerige listing laden
    const { data: app, error: appErr } = await admin
      .from('job_applications')
      .select('resume_path, listing_id')
      .eq('id', application_id)
      .maybeSingle()
    if (appErr || !app || !app.resume_path) {
      return new Response(JSON.stringify({ error: 'Bewerbung oder Lebenslauf nicht gefunden' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Autorisierung: Job-Owner ODER Admin
    const { data: listing } = await admin
      .from('listings').select('owner_id').eq('id', app.listing_id).maybeSingle()
    const { data: profile } = await admin
      .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
    const isOwner = listing && listing.owner_id === user.id
    const isAdmin = profile && profile.is_admin === true
    if (!isOwner && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Zugriff verweigert' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await admin.storage
      .from('resumes')
      .createSignedUrl(app.resume_path, 600) // 10 Minuten
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ signedUrl: data.signedUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
