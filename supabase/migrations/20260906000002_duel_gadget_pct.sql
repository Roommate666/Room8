-- ============================================================================
-- 20260906000002_duel_gadget_pct.sql
-- Gadget-Kosten (Nebel/Zeitdruck) = PROZENT vom Einsatz statt fix 15/20.
-- Ersetzt spend_match_gadget() aus 20260830000022_duel_hardening.sql.
--   fog  (Nebel)     = 30% des Einsatzes, mindestens 10
--   rush (Zeitdruck) = 40% des Einsatzes, mindestens 15
-- Bei Spass-Duell (wager=0) greift das Minimum -> kein Gratis-Spam.
-- Client (www/game/duel.html: computeGadgetCosts) nutzt DIESELBE Formel.
--
-- Aenderung ggü. Vorgaenger:
--   * v_cost wird JETZT NACH dem Match-Load aus v_m.wager berechnet (vorher fix vor dem Load).
--   * Cap-Zaehlung ueber reason 'duel_gadget_<kind>' statt ueber den delta-Betrag
--     (der Betrag ist nun variabel und taugt nicht mehr zur Art-Erkennung).
--   * add_coins-reason ist jetzt 'duel_gadget_fog' / 'duel_gadget_rush'.
-- (reason 'duel_gadget' wird nirgends sonst ausgewertet -> Umbenennung unkritisch.)
-- ============================================================================
create or replace function public.spend_match_gadget(p_match_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_m      public.match%rowtype;
  v_cost   int;
  v_coins  int;
  v_used   int;
  v_new    int;
  v_reason text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  if p_kind not in ('fog','rush') then
    return jsonb_build_object('ok', false, 'error', 'BAD_KIND');
  end if;

  -- Atomar pro (User + Match): verhindert Doppel-Abbuchung bei parallelen Klicks.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_match_id::text, 77));

  select * into v_m from public.match where id = p_match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND');
  end if;

  if v_uid <> v_m.host_id
     and v_uid <> coalesce(v_m.guest_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    return jsonb_build_object('ok', false, 'error', 'NOT_A_PLAYER');
  end if;

  -- Status: 'ready' waehrend des laufenden Spiels erlaubt (siehe Vorgaenger-Migration:
  -- submit-duel hebt erst beim ersten Score-Submit von 'ready' auf 'active').
  if v_m.status not in ('active','ready') then
    return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_ACTIVE');
  end if;

  -- Kosten = Prozent vom Einsatz (gleiche Formel wie der Client). wager ist NON-NEG (Constraint).
  if p_kind = 'fog' then
    v_cost := greatest(10, round(0.30 * v_m.wager)::int);
  else
    v_cost := greatest(15, round(0.40 * v_m.wager)::int);
  end if;
  v_reason := 'duel_gadget_' || p_kind;

  -- Cap 5 pro Art pro Spieler pro Match (ueber reason, da der Betrag jetzt variabel ist).
  select count(*) into v_used
  from public.coin_transactions
  where user_id = v_uid
    and reason  = v_reason
    and ref_id  = p_match_id;
  if coalesce(v_used, 0) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'GADGET_CAP_REACHED', 'cost', v_cost);
  end if;

  -- Balance pruefen VOR add_coins (add_coins clamped ohne Fehler auf 0).
  select coins into v_coins from public.profiles where id = v_uid;
  if coalesce(v_coins, 0) < v_cost then
    return jsonb_build_object('ok', false, 'error', 'NOT_ENOUGH_COINS',
      'cost', v_cost, 'coins', coalesce(v_coins, 0));
  end if;

  v_new := public.add_coins(v_uid, -v_cost, v_reason, p_match_id);

  return jsonb_build_object('ok', true, 'coins', v_new, 'cost', v_cost, 'kind', p_kind);
end $$;
grant execute on function public.spend_match_gadget(uuid, text) to authenticated;
