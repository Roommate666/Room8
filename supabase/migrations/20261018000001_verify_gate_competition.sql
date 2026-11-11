-- Verify-Gate fuer Wettkampf + Coupon-Bypass (18.10.2026)
--
-- Hintergrund: Seit die Registrierungs-Bestaetigungsmail abgeschafft wurde
-- (mailer_autoconfirm=true) kann sich JEDER ohne Mailbestaetigung einloggen.
-- Einzige Studenten-Huerde = Uni-Mail-Verifizierung (is_verified / is_student_verified).
--
-- Design (Yusuf-Entscheidung 18.10.): Spielen + Coins sammeln bleibt fuer ALLE offen
-- (Hook fuer Neue). ABER: Rangliste-Wertung, Preis-Gewinn und Coupon-Einloesen
-- nur fuer verifizierte Studenten. Sonst gewinnt ein Nicht-Student den Monatspreis.
--
-- Gate-Ausdruck ueberall: (is_verified = true OR is_student_verified = true)
-- Coupon-Einloesen (self_redeem_qr, redeem_coupon) ist bereits gegated -> nicht angefasst.
-- Spielen (claim_daily_play_bonus, claim_daily_challenge, accept_challenge) bleibt offen.

-- 1) Monats-Rangliste: nur verifizierte anzeigen.
--    get_my_challenge_rank() ruft diese Funktion auf und erbt den Filter automatisch.
CREATE OR REPLACE FUNCTION public.get_challenge_leaderboard(p_limit integer DEFAULT 50)
RETURNS TABLE(user_id uuid, username text, university text, avatar_config jsonb, city text, is_champion boolean, coins_total bigint, coins_month bigint, rank bigint)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  select ct.user_id, pp.username, pp.university, pp.avatar_config, p.city,
         coalesce(p.is_champion,false) as is_champion,
         coalesce(p.coins,0)::bigint as coins_total,
         sum(ct.delta)::bigint as coins_month,
         rank() over (order by sum(ct.delta) desc) as rank
  from public.coin_transactions ct
  join public.public_profiles pp on pp.id = ct.user_id
  join public.profiles p on p.id = ct.user_id
  where ct.created_at >= date_trunc('month', now())
    and (p.is_verified = true or p.is_student_verified = true)
  group by ct.user_id, pp.username, pp.university, pp.avatar_config, p.city, p.is_champion, p.coins
  having sum(ct.delta) > 0
  order by coins_month desc
  limit greatest(1, least(coalesce(p_limit,50), 200));
$function$;

-- 2) Taeglicher Spiel-Gewinner (Coins + Push): nur verifizierte koennen gewinnen.
CREATE OR REPLACE FUNCTION public.award_daily_game_winners()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  r record;
  v_reward int;
  v_day date := current_date - 1;
begin
  for r in (
    with best as (
      select gs.user_id, max(gs.score) as sc
      from public.goat_scores gs
      join public.profiles p on p.id = gs.user_id
      where gs.mode='daily' and coalesce(gs.replay_validated,false)=true
        and gs.created_at::date = v_day
        and (p.is_verified = true or p.is_student_verified = true)
      group by gs.user_id
    ),
    ranked as (
      select user_id, sc, rank() over (order by sc desc) as rk from best
    )
    select user_id, rk, sc from ranked where rk <= 3
  ) loop
    -- Schon vergeben? (falls Cron doppelt laeuft)
    if exists (select 1 from public.coin_transactions where user_id=r.user_id and reason like 'game_daily_%' and created_at::date=current_date) then
      continue;
    end if;
    v_reward := case r.rk when 1 then 100 when 2 then 50 else 25 end;
    begin
      perform public.add_coins(r.user_id, v_reward, 'game_daily_'||r.rk, null);
      perform public.notify_user_push(r.user_id, 'game_win', 'Platz ' || r.rk || ' im Spiel! 🎮', 'Du warst gestern auf Platz ' || r.rk || ' der Tages-Bestenliste — +' || v_reward || ' G-Coins!', jsonb_build_object('url','/game/'), 'game_daily_'||v_day::text||'_'||r.user_id::text);
    exception when others then raise warning 'game winner fail %: %', r.user_id, sqlerrm;
    end;
  end loop;
end;
$function$;

-- 3) Monats-Gewinner (Top 3 + Champion): nur verifizierte.
CREATE OR REPLACE FUNCTION public.notify_competition_winners()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  r record;
  v_html text;
  v_title text;
  v_body text;
begin
  for r in (
    with mc as (
      select ct.user_id, sum(ct.delta) c
      from public.coin_transactions ct
      join public.profiles p on p.id = ct.user_id
      where ct.created_at >= date_trunc('month', now()) - interval '1 month'
        and ct.created_at < date_trunc('month', now())
        and (p.is_verified = true or p.is_student_verified = true)
      group by ct.user_id
      having sum(ct.delta)>0
    )
    select user_id, rank() over (order by c desc) rk from mc
  ) loop
    if r.rk <= 3 then
      begin
        -- Rang 1 = Champion: permanenter Status + exklusives Koenig-Kostuem
        if r.rk = 1 then
          update public.profiles set is_champion = true where id = r.user_id;
          v_title := 'Du bist Champion! 👑';
          v_body := 'Platz 1 im letzten Wettkampf! Dein exklusives Champion-Kostuem (nur fuer Gewinner) ist freigeschaltet.';
        else
          v_title := 'Du hast gewonnen! 🏆';
          v_body := 'Platz ' || r.rk || ' im letzten Wettkampf — dein Preis wartet in der App.';
        end if;
        perform public.notify_user_push(r.user_id, 'competition', v_title, v_body, jsonb_build_object('url','/challenge.html'), 'comp_win_' || to_char(now()-interval '1 day','YYYY-MM'));
        v_html := '<h2 style="margin:0 0 12px;font-size:22px;">' || v_title || '</h2>'
          || '<p style="margin:0 0 16px;">' || v_body || '</p>'
          || case when r.rk=1 then '<p style="margin:0 0 16px;">Zieh dein Champion-Kostuem im Goat-Shop an — das kann sonst niemand tragen. 👑</p>' else '' end
          || public.ug_email_btn(case when r.rk=1 then 'Champion-Kostuem anziehen' else 'Preis ansehen' end, case when r.rk=1 then 'avatar-edit.html' else 'challenge.html' end);
        perform public.notify_user_email(r.user_id, case when r.rk=1 then 'Du bist UniGoat-Champion 👑' else 'Du bist unter den Top 3 — UniGoat 🏆' end, v_html, 'comp_win_' || to_char(now()-interval '1 day','YYYY-MM'));
      exception when others then raise warning 'winner fail %: %', r.user_id, sqlerrm;
      end;
    end if;
  end loop;
end;
$function$;

-- 4) Verlosung: nur verifizierte ziehbar (+ Null-Guard falls kein verifizierter Teilnehmer).
CREATE OR REPLACE FUNCTION public.draw_raffle_winner()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  r record;
  v_winner uuid;
  v_cnt int;
  v_total int;
  v_new_end timestamptz;
  v_results jsonb := '[]'::jsonb;
begin
  v_new_end := date_trunc('month', now()) + interval '1 month' - interval '1 second';
  for r in select * from public.raffles where active = true and ends_at <= now() loop
    select count(*) into v_total from public.raffle_tickets where raffle_id = r.id;
    v_winner := null; v_cnt := 0;
    if v_total > 0 then
      -- gewichtete Ziehung nur unter verifizierten Studenten: jedes Los = eine Zeile
      select rt.user_id into v_winner
      from public.raffle_tickets rt
      join public.profiles p on p.id = rt.user_id
      where rt.raffle_id = r.id
        and (p.is_verified = true or p.is_student_verified = true)
      order by random() limit 1;
      if v_winner is not null then
        select count(*) into v_cnt from public.raffle_tickets where raffle_id = r.id and user_id = v_winner;
        insert into public.raffle_winners (raffle_id, user_id, prize, ticket_count)
          values (r.id, v_winner, r.prize, v_cnt);
        begin
          insert into public.notifications (user_id, type, title, message, link, is_read)
            values (v_winner, 'raffle', 'Du hast gewonnen! 🎉🐐', 'Glückwunsch! Du hast den Party-Lostopf gewonnen: '||coalesce(r.prize,'die Party-Überraschung')||'. Wir melden uns über Instagram bei dir!', '/friends.html', false);
        exception when others then null;
        end;
        begin
          perform public.notify_user_push(v_winner, 'raffle', 'Du hast gewonnen! 🎉', 'Der Party-Lostopf geht an dich — check die App! 🐐', jsonb_build_object('url','/friends.html'));
        exception when others then null;
        end;
      end if;
    end if;
    update public.raffles set active = false where id = r.id;
    insert into public.raffles (title, description, prize, ticket_cost, ends_at, active)
      values (r.title, r.description, r.prize, r.ticket_cost, v_new_end, true);
    v_results := v_results || jsonb_build_object('raffle', r.id, 'winner', v_winner, 'tickets', v_total, 'winner_tickets', v_cnt);
  end loop;
  return jsonb_build_object('ok', true, 'drawn', v_results);
end
$function$;

-- 5) Legacy-Bypass schliessen: self_redeem_coupon loest Coupons OHNE Verify-Check ein
--    und ist von anon/authenticated direkt aufrufbar. Das Frontend nutzt sie nicht
--    (es ruft self_redeem_qr auf, die gegated ist). Defense-in-depth: Verify-Check IM
--    Body + EXECUTE-Recht entziehen.
CREATE OR REPLACE FUNCTION public.self_redeem_coupon(p_coupon_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_coupon public.coupons%rowtype;
  v_user_id uuid := auth.uid();
  v_redemption_id uuid;
  v_verification_code text;
  v_count_before int;
  v_count_today int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  -- Nur verifizierte Studenten duerfen einloesen.
  if not exists (select 1 from public.profiles where id = v_user_id and (is_verified = true or is_student_verified = true)) then
    return jsonb_build_object('ok', false, 'error', 'NOT_VERIFIED');
  end if;
  perform pg_advisory_xact_lock( hashtextextended(p_coupon_id::text || ':' || v_user_id::text, 0) );
  select * into v_coupon from public.coupons where id = p_coupon_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'COUPON_NOT_FOUND');
  end if;
  if coalesce(v_coupon.status, 'active') <> 'active' or v_coupon.is_active = false then
    return jsonb_build_object('ok', false, 'error', 'COUPON_INACTIVE');
  end if;
  if v_coupon.valid_until is not null and v_coupon.valid_until < current_date then
    return jsonb_build_object('ok', false, 'error', 'COUPON_EXPIRED');
  end if;
  if v_coupon.max_redemptions is not null and coalesce(v_coupon.current_redemptions, 0) >= v_coupon.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'COUPON_MAX_REACHED');
  end if;
  if v_coupon.usage_limit_per_user is not null then
    -- Harte Obergrenze pro Konto (z.B. 1x einmalig)
    select count(*) into v_count_before from public.coupon_redemptions where coupon_id = p_coupon_id and user_id = v_user_id;
    if v_count_before >= v_coupon.usage_limit_per_user then
      return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED');
    end if;
  else
    -- Mehrfach-Coupon: max. 1x pro Kalendertag (Europe/Berlin)
    select count(*) into v_count_today from public.coupon_redemptions where coupon_id = p_coupon_id and user_id = v_user_id and (coalesce(redeemed_at, created_at) at time zone 'Europe/Berlin')::date = (now() at time zone 'Europe/Berlin')::date;
    if v_count_today >= 1 then
      return jsonb_build_object('ok', false, 'error', 'ALREADY_TODAY');
    end if;
  end if;
  v_verification_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.coupon_redemptions ( coupon_id, user_id, verification_code, redeemed_by_partner_id, redeemed_at )
    values ( p_coupon_id, v_user_id, v_verification_code, null, now() )
    returning id into v_redemption_id;
  update public.coupons set current_redemptions = coalesce(current_redemptions, 0) + 1, updated_at = now() where id = p_coupon_id;
  return jsonb_build_object(
    'ok', true, 'redemption_id', v_redemption_id, 'verification_code', v_verification_code,
    'coupon_title', v_coupon.title, 'business_name', v_coupon.business_name,
    'discount_value', v_coupon.discount_value, 'redeemed_at', now()
  );
end;
$function$;

-- WICHTIG: FROM PUBLIC (nicht nur anon/authenticated) — diese Rollen erben EXECUTE
-- vom impliziten PUBLIC-Grant auf Funktionen; ein REVOKE nur von anon/authenticated
-- bleibt wirkungslos. service_role/postgres behalten ihr explizites Grant.
REVOKE EXECUTE ON FUNCTION public.self_redeem_coupon(uuid) FROM PUBLIC, anon, authenticated;
