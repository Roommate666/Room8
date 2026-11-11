-- PaddleUp (Shopify-Kollege): Empfangs-Log fuer orders/paid-Webhooks.
-- Jede eingehende Bestellung wird hier roh gesichert, damit nichts verloren
-- geht, bevor die Belohnungs-Logik (G-Coins / Code) final definiert ist.
create table if not exists public.paddleup_orders (
    id               uuid primary key default gen_random_uuid(),
    shopify_order_id text,
    order_number     text,
    email            text,
    total_price      text,
    currency         text,
    hmac_valid       boolean,          -- null = Secret noch nicht gesetzt (Setup-Phase)
    processed        boolean not null default false,  -- Belohnung vergeben?
    raw              jsonb,
    created_at       timestamptz not null default now()
);
create index if not exists paddleup_orders_email_idx on public.paddleup_orders (email);
create index if not exists paddleup_orders_order_idx  on public.paddleup_orders (shopify_order_id);

-- RLS: nur service_role (Edge Function) schreibt/liest. Kein anon/authenticated-Zugriff.
alter table public.paddleup_orders enable row level security;
