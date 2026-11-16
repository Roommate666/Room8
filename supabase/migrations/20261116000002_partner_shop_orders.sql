-- Online-Shop-Coupons (Shopify) der Partner: G-Coins NUR fuer bezahlte Bestellungen mit unserem Rabattcode.
-- Edge Function shop-webhook?shop=<key> nimmt Shopify-Webhooks (orders/paid, orders/cancelled) an.
-- Rein additiv. Nur service_role.

create table if not exists public.partner_shops (
  key            text primary key,            -- z. B. 'gymfactory' (URL-Parameter ?shop=)
  name           text not null,
  coupon_id      uuid references public.coupons(id) on delete set null,
  discount_code  text not null,               -- Code, der in der Bestellung stehen muss (case-insensitive)
  min_total      numeric not null default 0,  -- Mindest-Warenwert vor Rabatt
  coins          integer not null default 250,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
alter table public.partner_shops enable row level security;
revoke all on public.partner_shops from anon, authenticated;
grant all on public.partner_shops to service_role;

create table if not exists public.shop_orders (
  id                bigserial primary key,
  shop              text not null,
  shopify_order_id  text not null,
  order_name        text,
  email             text,
  subtotal          numeric,
  codes             text[],
  user_id           uuid,
  status            text not null,   -- awarded | no_code | no_user | not_verified | below_min | already_awarded | cancelled | reversed
  coins             integer not null default 0,
  redemption_id     uuid,
  raw               jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (shop, shopify_order_id)
);
alter table public.shop_orders enable row level security;
revoke all on public.shop_orders from anon, authenticated;
grant all on public.shop_orders to service_role;
grant usage, select on sequence public.shop_orders_id_seq to service_role;

-- Nutzer zu einer Bestell-E-Mail finden (Login-Mail oder bestaetigte Uni-Mail). Nur service_role.
create or replace function public.shop_match_user(p_email text)
returns table (user_id uuid, verified boolean)
language sql stable security definer set search_path = public, auth
as $$
  select p.id, coalesce(p.is_verified, false) or coalesce(p.is_student_verified, false)
  from public.profiles p
  left join auth.users u on u.id = p.id
  where lower(u.email) = lower(trim(p_email)) or lower(p.uni_email) = lower(trim(p_email))
  order by (coalesce(p.is_verified, false) or coalesce(p.is_student_verified, false)) desc
  limit 1
$$;
revoke all on function public.shop_match_user(text) from public, anon, authenticated;
grant execute on function public.shop_match_user(text) to service_role;
