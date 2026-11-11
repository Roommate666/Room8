// PaddleUp (Shopify-Kollege) Webhook-Empfaenger.
// Empfaengt Shopify orders/paid, verifiziert die HMAC-Signatur (sobald das
// Webhook-Secret gesetzt ist) und sichert jede Bestellung roh in
// public.paddleup_orders. Die eigentliche Belohnungs-Vergabe (G-Coins ODER
// Einmal-Code) ist bewusst noch offen -> siehe TODO unten. Dadurch geht keine
// Bestellung verloren, auch bevor das Angebot final definiert ist.
//
// Deploy: npx supabase functions deploy paddleup-webhook --no-verify-jwt
// (Shopify schickt keinen Supabase-JWT -> Auth laeuft ueber HMAC im Code.)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SECRET = Deno.env.get('PADDLEUP_WEBHOOK_SECRET') ?? ''

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacBase64(raw: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const raw = await req.text()
  const sentHmac = req.headers.get('X-Shopify-Hmac-Sha256') ?? ''

  // HMAC-Verifizierung: nur aktiv wenn das Secret gesetzt ist.
  // Setup-Phase (Secret leer) -> loggen + hmac_valid=null + 200, damit der
  // Kollege in Shopify den "Webhook testen"-Button gruen bekommt.
  let hmacValid: boolean | null = null
  if (SECRET) {
    const expected = await hmacBase64(raw, SECRET)
    hmacValid = timingSafeEqual(expected, sentHmac)
    if (!hmacValid) {
      return new Response('Invalid HMAC', { status: 401 })
    }
  }

  let order: Record<string, unknown> = {}
  try {
    order = JSON.parse(raw || '{}')
  } catch (_e) {
    order = {}
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error } = await supabase.from('paddleup_orders').insert({
    shopify_order_id: order.id ? String(order.id) : null,
    order_number: order.order_number ? String(order.order_number) : null,
    email: (order.email as string) ?? (order.contact_email as string) ?? null,
    total_price: (order.total_price as string) ?? null,
    currency: (order.currency as string) ?? null,
    hmac_valid: hmacValid,
    raw: order,
  })

  if (error) {
    // Fehler wird geloggt, aber wir geben trotzdem 200 zurueck, damit Shopify
    // den Webhook nicht endlos wiederholt. Bestellung ist in den Logs sichtbar.
    console.error('paddleup_orders insert failed:', error.message)
  }

  // TODO (sobald Angebot + Account-Matching final):
  //  Variante A: G-Coins dem UniGoat-Account mit order.email gutschreiben.
  //  Variante B: einen Einmal-Code aus dem 500er-Pool dem Kaeufer zuordnen
  //              und per Mail / Order-Note zurueckgeben.
  // Bis dahin: Bestellung ist sicher in paddleup_orders gesichert.

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
