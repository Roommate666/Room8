-- Realtime fuer coupon_redemptions aktivieren
-- User-Side: coupon-detail.html abonniert eigene Redemptions per Realtime →
-- sieht sofort wenn der Partner gescannt hat (gruener "Eingeloest"-Screen).
-- RLS bleibt aktiv, User sieht nur eigene (Policy: user_id = auth.uid()).

-- Defensiv: drop falls schon dabei (idempotent)
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coupon_redemptions'
  ) then
    alter publication supabase_realtime drop table public.coupon_redemptions;
  end if;
end$$;

alter publication supabase_realtime add table public.coupon_redemptions;
