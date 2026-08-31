-- Ablaufdatum fuer Ersti-Code + zweite Kampagne (Brennerei). Additiv, kein DROP.

-- 1) Ersti-Code laeuft aus: Ende WiSe-Ersti-Phase (30.11.2026, Europe/Berlin).
--    Verhindert dass ein online geteiltes Foto ewig 500 Coins verschenkt.
update public.promo_codes
   set expires_at = timestamptz '2026-11-30 23:59:59+01'
 where code = 'ERSTI2026';

-- 2) Brennerei-Kampagne (eigener Code = eigene ROI-Messung ueber promo_redemptions).
--    Betrag/Label bei Bedarf anpassen; Ablauf 31.12.2026.
insert into public.promo_codes (code, coins, label, expires_at)
values ('BRENNEREI2026', 500, 'Brennerei-Willkommensbonus', timestamptz '2026-12-31 23:59:59+01')
on conflict (code) do update
  set coins = excluded.coins,
      label = excluded.label,
      expires_at = excluded.expires_at,
      active = true;
