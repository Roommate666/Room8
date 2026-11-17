// paddleup-webhook: alte URL, die Padel Up (Yunus) am 09.11. bekommen hat.
// Leitet jede Shopify-Anfrage 1:1 an shop-webhook?shop=padelup weiter (Rohtext + Header),
// dort laufen Signaturpruefung (SHOP_SECRET_PADELUP, fail-closed) und Coin-Vergabe ueber den Code-Pool.
// Deploy: supabase functions deploy paddleup-webhook --no-verify-jwt
const TARGET = `${Deno.env.get('SUPABASE_URL')}/functions/v1/shop-webhook?shop=padelup`

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const raw = await req.text()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  for (const h of ['x-shopify-hmac-sha256', 'x-shopify-topic', 'x-shopify-shop-domain', 'x-shopify-webhook-id']) {
    const v = req.headers.get(h)
    if (v) headers[h] = v
  }
  const r = await fetch(TARGET, { method: 'POST', headers, body: raw })
  return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } })
})
