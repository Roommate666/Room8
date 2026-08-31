-- Brennerei-Code war ein Missverstaendnis -> entfernen. FK loescht Test-Redemption mit (cascade).
-- Ersti-System (ERSTI2026 + promo.html + redeem_promo) bleibt unberuehrt.
delete from public.promo_codes where code = 'BRENNEREI2026';
