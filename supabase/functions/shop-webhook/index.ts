// shop-webhook: Shopify-Bestellungen von Partner-Shops -> G-Coins NUR bei echtem Kauf mit unserem Code.
//
// URL je Shop: /functions/v1/shop-webhook?shop=<key>   (key aus public.partner_shops)
// Shopify-Webhooks (vom Shop-Betreiber angelegt, Format JSON):
//   - "Bestellungszahlung" (orders/paid)        -> Coins gutschreiben
//   - "Bestellungsstornierung" (orders/cancelled) -> Coins wieder abziehen
// Signatur: Header X-Shopify-Hmac-Sha256 (Base64 HMAC-SHA256 des Rohtexts) mit Secret SHOP_SECRET_<KEY>.
// Ohne Secret wird NICHTS gutgeschrieben (fail-closed).
//
// Regeln fuer die Gutschrift:
//   1. Bestellung bezahlt und Rabattcode des Shops benutzt
//   2. Warenwert >= min_total
//   3. Bestell-E-Mail gehoert zu einem UniGoat-Konto (Login- oder Uni-Mail), das verifiziert ist
//      (Shops mit uses_code_pool: stattdessen persoenlicher Einmal-Code aus coupon_code_pool -> Student)
//   4. pro Bestellung einmal; pro Nutzer und Coupon nur so oft wie usage_limit_per_user erlaubt
//
// Deploy: supabase functions deploy shop-webhook --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const TG_CHAT = Deno.env.get('TELEGRAM_CHAT_ID') ?? ''

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

async function hmacBase64(raw: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

async function telegram(text: string) {
  if (!TG_TOKEN || !TG_CHAT) return
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: text.slice(0, 3900) }),
    })
  } catch (_) { /* egal */ }
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
function orderCodes(o: any): string[] {
  const a = (o.discount_codes ?? []).map((d: { code?: string }) => String(d.code || ''))
  const b = (o.discount_applications ?? []).map((d: { code?: string }) => String(d.code || ''))
  return [...new Set([...a, ...b].filter(Boolean).map((c) => c.toUpperCase()))]
}

// deno-lint-ignore no-explicit-any
async function onPaid(shop: any, o: any) {
  const orderId = String(o.id)
  const email = String(o.email || o.contact_email || o.customer?.email || '').trim()
  const codes = orderCodes(o)
  const subtotal = Number(o.total_line_items_price ?? o.current_subtotal_price ?? o.subtotal_price ?? 0)
  // Datensparsam: keine Adressen/Artikel speichern, nur was fuer die Gutschrift noetig ist
  const raw = { id: o.id, name: o.name ?? null, financial_status: o.financial_status ?? null, created_at: o.created_at ?? null }
  const base = { shop: shop.key, shopify_order_id: orderId, order_name: o.name ?? null, email, subtotal, codes, raw, updated_at: new Date().toISOString() }

  const { data: existing } = await sb.from('shop_orders').select('status').eq('shop', shop.key).eq('shopify_order_id', orderId).maybeSingle()
  if (existing && (existing.status === 'awarded' || existing.status === 'reversed')) return { status: 'duplicate' }

  const save = (status: string, extra: Record<string, unknown> = {}) =>
    sb.from('shop_orders').upsert({ ...base, status, ...extra }, { onConflict: 'shop,shopify_order_id' })

  // Code-Pool-Shops (z.B. Padel Up): persoenlicher Einmal-Code -> Student direkt ueber den Code.
  // deno-lint-ignore no-explicit-any
  let poolRow: any = null
  if (shop.uses_code_pool) {
    if (shop.coupon_id && codes.length) {
      const { data: rows } = await sb.from('coupon_code_pool').select('code,user_id,redemption_id')
        .eq('coupon_id', shop.coupon_id).not('user_id', 'is', null).in('code', codes).limit(1)
      poolRow = rows?.[0] ?? null
    }
    if (!poolRow) { await save('no_code'); return { status: 'no_code' } }
  } else if (!codes.includes(String(shop.discount_code).toUpperCase())) { await save('no_code'); return { status: 'no_code' } }
  if (subtotal < Number(shop.min_total || 0)) { await save('below_min'); return { status: 'below_min' } }

  // deno-lint-ignore no-explicit-any
  let match: any = null
  if (poolRow) {
    const { data: p } = await sb.from('profiles').select('id,is_verified,is_student_verified').eq('id', poolRow.user_id).maybeSingle()
    if (p) match = { user_id: p.id, verified: p.is_verified === true || p.is_student_verified === true }
  } else {
    const { data: m } = await sb.rpc('shop_match_user', { p_email: email })
    match = Array.isArray(m) ? m[0] : null
  }
  if (!match) {
    await save('no_user')
    await telegram(`${shop.name}-Shop: Bestellung ${o.name ?? orderId} mit ${shop.discount_code}, aber ${email || '(keine Mail)'} ist kein UniGoat-Konto. Keine Coins.`)
    return { status: 'no_user' }
  }
  if (!match.verified) { await save('not_verified', { user_id: match.user_id }); return { status: 'not_verified' } }

  // Limit je Nutzer (usage_limit_per_user des Coupons)
  if (shop.coupon_id) {
    const { data: c } = await sb.from('coupons').select('usage_limit_per_user').eq('id', shop.coupon_id).maybeSingle()
    const limit = c?.usage_limit_per_user
    if (limit) {
      const { count } = await sb.from('shop_orders').select('id', { count: 'exact', head: true })
        .eq('shop', shop.key).eq('user_id', match.user_id).eq('status', 'awarded')
      if ((count ?? 0) >= limit) { await save('already_awarded', { user_id: match.user_id }); return { status: 'already_awarded' } }
    }
  }

  // Einloesung buchen (damit der Partner sie sieht) + Coins
  // Pool-Shops: die Einloesung wurde schon beim Abholen des Codes gebucht.
  let redemptionId: string | null = poolRow?.redemption_id ?? null
  if (shop.coupon_id && !poolRow) {
    const { data: r } = await sb.from('coupon_redemptions').insert({
      coupon_id: shop.coupon_id, user_id: match.user_id, verification_code: ('SHOP' + String(o.order_number ?? orderId)).slice(0, 20),
      redeemed_at: new Date().toISOString(), geo_verified: false,
    }).select('id').single()
    redemptionId = r?.id ?? null
  }
  const coins = Number(shop.coins || 0)
  if (coins > 0) await sb.rpc('add_coins', { p_user: match.user_id, p_delta: coins, p_reason: 'shop_purchase', p_ref: redemptionId })
  await save('awarded', { user_id: match.user_id, coins, redemption_id: redemptionId })
  return { status: 'awarded', coins }
}

// deno-lint-ignore no-explicit-any
async function onCancelled(shop: any, o: any) {
  const orderId = String(o.id)
  const { data: row } = await sb.from('shop_orders').select('status,user_id,coins,redemption_id').eq('shop', shop.key).eq('shopify_order_id', orderId).maybeSingle()
  if (!row || row.status !== 'awarded') {
    if (row) await sb.from('shop_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('shop', shop.key).eq('shopify_order_id', orderId)
    return { status: 'nothing_to_reverse' }
  }
  if (row.coins > 0) await sb.rpc('add_coins', { p_user: row.user_id, p_delta: -row.coins, p_reason: 'shop_purchase_cancelled', p_ref: row.redemption_id })
  await sb.from('shop_orders').update({ status: 'reversed', updated_at: new Date().toISOString() }).eq('shop', shop.key).eq('shopify_order_id', orderId)
  return { status: 'reversed', coins: -row.coins }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST' }, 405)
  const key = new URL(req.url).searchParams.get('shop') ?? ''
  const { data: shop } = await sb.from('partner_shops').select('*').eq('key', key).eq('active', true).maybeSingle()
  if (!shop) return json({ error: 'unbekannter Shop' }, 404)

  const secret = Deno.env.get('SHOP_SECRET_' + key.toUpperCase()) ?? ''
  if (!secret) return json({ error: 'nicht eingerichtet' }, 503) // fail-closed
  const raw = await req.text()
  const sig = req.headers.get('x-shopify-hmac-sha256') ?? ''
  if (!timingSafeEqual(sig, await hmacBase64(raw, secret))) return json({ error: 'Signatur' }, 401)

  // deno-lint-ignore no-explicit-any
  let o: any
  try { o = JSON.parse(raw) } catch { return json({ error: 'json' }, 400) }
  const topic = (req.headers.get('x-shopify-topic') ?? '').toLowerCase()
  try {
    if (topic === 'orders/cancelled') return json(await onCancelled(shop, o))
    if (topic === 'orders/paid' || (topic === '' && o.financial_status === 'paid')) return json(await onPaid(shop, o))
    return json({ status: 'ignored', topic })
  } catch (e) {
    await telegram(`${shop.name}-Shop-Webhook Fehler: ${String(e).slice(0, 300)}`)
    return json({ error: 'intern' }, 500)
  }
})
