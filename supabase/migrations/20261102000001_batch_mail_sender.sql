-- Massen-Mail ueber die Resend Batch-API statt N Einzel-Calls.
--
-- PROBLEM: send_weekly_digest / send_weekly_spotlight / notify_competition_* /
-- notify_rank_changes / notify_streak_risk / send_verify_reminders loopen ueber
-- bis zu 1000 Nutzer und feuern pro Nutzer EIN net.http_post an send-email.
-- pg_net schickt die im Burst raus -> Resends 10-req/s-Limit platzt -> 429 ->
-- Mails FINAL verloren (2320 seit Mai laut notification_logs).
--
-- FIX: Neuer Sammel-Sender notify_users_email_batch(jsonb). Er macht EXAKT die
-- gleiche Pro-Nutzer-Gating-Logik wie notify_user_email (Email-Aufloesung,
-- email_marketing-Opt-out, Test-Filter, Dedup via engagement_emails_sent,
-- Event-Throttle, Pflicht-Abmeldelink), sammelt aber die durchgelassenen Mails
-- und postet sie in 100er-Bloecken an die NEUE Edge Function send-email-batch
-- (Resend /emails/batch = EIN Request pro 100 Mails). Die bestehende
-- notify_user_email + send-email bleiben unveraendert fuer Einzel-Mails.
--
-- Nutzer-Selektion / Verifizierungs-Filter der Versender bleiben unangetastet -
-- nur der Versand-Mechanismus (sammeln + 1 Call) aendert sich.

-- ===========================================================================
-- 1. Sammel-Sender: nimmt Array von {user_id, subject, html, dedup_key, kind,
--    throttle_hours}, gated jede Zeile wie notify_user_email und postet die
--    durchgelassenen in 100er-Bloecken an send-email-batch.
--    Rueckgabe: Anzahl tatsaechlich in die Batch-Queue gegebener Mails.
-- ===========================================================================
create or replace function public.notify_users_email_batch(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item        jsonb;
  v_user_id     uuid;
  v_subject     text;
  v_html        text;
  v_dedup_key   text;
  v_kind        text;
  v_throttle    int;
  v_email       text;
  v_tok         uuid;
  v_final_html  text;
  v_url         text;
  v_queued      int := 0;
  v_batch       jsonb := '[]'::jsonb;
  v_batch_n     int := 0;
  v_pending     jsonb := '[]'::jsonb;   -- engagement_emails_sent-Zeilen zum Nachtragen
  k             jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;

  v_url := coalesce(current_setting('app.supabase_url', true),
                    'https://tvnvmogaqmduzcycmvby.supabase.co')
           || '/functions/v1/send-email-batch';

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_user_id   := nullif(v_item->>'user_id','')::uuid;
    v_subject   := v_item->>'subject';
    v_html      := v_item->>'html';
    v_dedup_key := v_item->>'dedup_key';
    v_kind      := coalesce(nullif(v_item->>'kind',''), 'event');
    v_throttle  := coalesce(nullif(v_item->>'throttle_hours','')::int, 48);

    if v_user_id is null or v_subject is null or v_html is null or v_dedup_key is null then
      continue;
    end if;

    -- --- Gating identisch zu notify_user_email ---
    select coalesce(p.email, u.email), p.unsubscribe_token
      into v_email, v_tok
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = v_user_id
      and coalesce(p.is_test, false) = false
      and coalesce(p.email_marketing, true) = true
      and coalesce(p.email, u.email) is not null
      and coalesce(p.email, u.email) not like '%@room8.partner';
    if v_email is null then continue; end if;

    -- Dedup: schon mal mit diesem Key geschickt?
    if exists (select 1 from public.engagement_emails_sent
                where user_id = v_user_id and dedup_key = v_dedup_key) then
      continue;
    end if;
    -- Event-Throttle: nicht zu viele 'event'-Mails in throttle_hours
    if v_kind = 'event' and exists (
      select 1 from public.engagement_emails_sent
      where user_id = v_user_id and kind = 'event'
        and sent_at > now() - make_interval(hours => v_throttle)
    ) then
      continue;
    end if;
    -- Doppel-Vormerkung im selben Batch verhindern (gleicher User+Key 2x im Array)
    if exists (
      select 1 from jsonb_array_elements(v_pending) e
      where (e->>'user_id') = v_user_id::text and (e->>'dedup_key') = v_dedup_key
    ) then
      continue;
    end if;

    -- Pflicht-Abmeldelink anhaengen (gleicher Standard wie notify_user_email)
    v_final_html := v_html
      || '<div style="font-size:11px;color:#B6BCC6;margin-top:20px;border-top:1px solid #EEE;padding-top:12px;">'
      || 'Keine solchen Mails mehr? <a href="https://www.unigoat.de/abmelden.html?t='
      || coalesce(v_tok::text, '')
      || '" style="color:#B6BCC6;text-decoration:underline;">Hier abmelden</a></div>';

    -- In den aktuellen Batch aufnehmen
    v_batch := v_batch || jsonb_build_object(
      'to', v_email, 'subject', v_subject, 'html', v_final_html, 'userId', v_user_id
    );
    v_pending := v_pending || jsonb_build_object(
      'user_id', v_user_id, 'dedup_key', v_dedup_key, 'kind', v_kind
    );
    v_batch_n := v_batch_n + 1;

    -- Block voll (100) -> abschicken + engagement_emails_sent nachtragen
    if v_batch_n >= 100 then
      begin
        perform net.http_post(url := v_url, headers := public.app_internal_headers(),
          body := jsonb_build_object('emails', v_batch));
        for k in select * from jsonb_array_elements(v_pending) loop
          insert into public.engagement_emails_sent (user_id, dedup_key, kind)
          values ((k->>'user_id')::uuid, k->>'dedup_key', k->>'kind')
          on conflict (user_id, dedup_key) do nothing;
        end loop;
        v_queued := v_queued + v_batch_n;
      exception when others then
        raise warning 'notify_users_email_batch block fail: %', sqlerrm;
      end;
      v_batch := '[]'::jsonb; v_pending := '[]'::jsonb; v_batch_n := 0;
    end if;
  end loop;

  -- Rest-Block
  if v_batch_n > 0 then
    begin
      perform net.http_post(url := v_url, headers := public.app_internal_headers(),
        body := jsonb_build_object('emails', v_batch));
      for k in select * from jsonb_array_elements(v_pending) loop
        insert into public.engagement_emails_sent (user_id, dedup_key, kind)
        values ((k->>'user_id')::uuid, k->>'dedup_key', k->>'kind')
        on conflict (user_id, dedup_key) do nothing;
      end loop;
      v_queued := v_queued + v_batch_n;
    exception when others then
      raise warning 'notify_users_email_batch tail fail: %', sqlerrm;
    end;
  end if;

  return v_queued;
end;
$function$;

revoke all on function public.notify_users_email_batch(jsonb) from public, anon, authenticated;

-- ===========================================================================
-- 2. Massen-Versender auf den Batch-Sender umstellen.
--    Nutzer-Selektion + Verifizierungs-Filter 1:1 wie vorher, nur statt
--    N x notify_user_email -> Array sammeln + 1 Aufruf notify_users_email_batch.
-- ===========================================================================

-- 2a. Wochenueberblick (Digest)
create or replace function public.send_weekly_digest()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_cpn record; v_html text; v_key text; v_items jsonb := '[]'::jsonb;
begin
  v_key := 'digest_' || to_char(now(),'IYYY-IW');
  for r in (
    with mc as (select user_id, sum(delta) c from public.coin_transactions
               where created_at >= date_trunc('month', now()) group by user_id),
    ranked as (select user_id, c, rank() over (order by c desc) rk from mc)
    select p.id, split_part(coalesce(p.full_name,''),' ',1) fn, p.city,
           coalesce(p.streak_days,0) streak, coalesce(ranked.c,0) coins, ranked.rk
    from public.profiles p join auth.users u on u.id=p.id
    left join ranked on ranked.user_id=p.id
    where coalesce(p.is_partner,false)=false and coalesce(p.is_test,false)=false
      and coalesce(p.email,u.email) is not null
      and coalesce(p.email,u.email) not like '%@room8.partner'
    limit 1000
  ) loop
    begin
      select title, business_name into v_cpn from public.coupons
        where status='active' and (r.city is null or city is null or lower(city)=lower(r.city))
        order by created_at desc limit 1;
      v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Dein UniGoat-Wochen&uuml;berblick &#128016;</h2>'
        || '<p style="margin:0 0 8px;">Hey' || coalesce(' ' || nullif(r.fn,''),'') || '! So stehst du gerade:</p>'
        || '<ul style="margin:0 0 16px;padding-left:18px;line-height:1.8;">'
        || '<li><strong>' || r.coins || '</strong> G-Coins diesen Monat' || coalesce(' &mdash; Platz <strong>' || r.rk || '</strong>', '') || '</li>'
        || '<li>Streak: <strong>' || r.streak || ' Tage</strong></li>'
        || case when v_cpn.title is not null then '<li>Neu f&uuml;r dich: <strong>' || v_cpn.title || '</strong>' || coalesce(' bei ' || v_cpn.business_name,'') || '</li>' else '' end
        || '</ul>'
        || '<p style="margin:0 0 16px;">Schnapp dir ein paar Coupons und kletter im Wettkampf nach oben.</p>'
        || public.ug_email_btn('Coupons ansehen', 'coupons.html');
      v_items := v_items || jsonb_build_object(
        'user_id', r.id,
        'subject', 'Dein UniGoat-Wochen' || chr(252) || 'berblick ' || chr(55357) || chr(56336),
        'html', v_html, 'dedup_key', v_key, 'kind', 'weekly');
    exception when others then raise warning 'digest build fail %: %', r.id, sqlerrm; end;
  end loop;
  perform public.notify_users_email_batch(v_items);
end; $function$;

-- 2b. Coupon-Spotlight / Announce ("Lust auf ...")
create or replace function public.send_weekly_spotlight()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_cpn record; v_html text; v_key text; v_subj text; v_items jsonb := '[]'::jsonb;
begin
  v_key := 'spot_' || to_char(now(),'IYYY-IW');
  for r in (
    select p.id, p.city from public.profiles p join auth.users u on u.id=p.id
    where coalesce(p.is_partner,false)=false and coalesce(p.is_test,false)=false
      and coalesce(p.email,u.email) is not null
      and coalesce(p.email,u.email) not like '%@room8.partner'
    limit 1000
  ) loop
    begin
      select id, title, business_name into v_cpn from public.coupons
        where status='active' and (r.city is null or city is null or lower(city)=lower(r.city))
        order by created_at desc limit 1;
      if v_cpn.id is null then continue; end if;
      v_subj := 'Lust auf ' || v_cpn.title || '? ' || chr(55357) || chr(56843);
      v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Lust auf ' || v_cpn.title || '? &#128523;</h2>'
        || '<p style="margin:0 0 16px;">Bei <strong>' || coalesce(v_cpn.business_name,'einem Laden in deiner N&auml;he') || '</strong> wartet gerade ein Rabatt auf dich. Einl&ouml;sen bringt dir au&szlig;erdem G-Coins f&uuml;r den Wettkampf.</p>'
        || public.ug_email_btn('Coupon schnappen', 'coupon-detail.html?id=' || v_cpn.id);
      v_items := v_items || jsonb_build_object(
        'user_id', r.id, 'subject', v_subj, 'html', v_html, 'dedup_key', v_key, 'kind', 'weekly');
    exception when others then raise warning 'spotlight build fail %: %', r.id, sqlerrm; end;
  end loop;
  perform public.notify_users_email_batch(v_items);
end; $function$;

-- 2c. Wettkampf: neuer Monat
create or replace function public.notify_competition_new_month()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_html text; v_items jsonb := '[]'::jsonb;
begin
  for r in (select id from public.profiles where coalesce(is_partner,false)=false) loop
    begin
      perform public.notify_user_push(r.id, 'competition', 'Neuer Wettkampf! ' || chr(55356) || chr(57281),
        'Neuer Monat, alle bei 0 G-Coins. Hol dir Platz 1 und das Preisgeld!',
        jsonb_build_object('url','/challenge.html'), 'comp_new_' || to_char(now(),'YYYY-MM'));
      v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Neuer Wettkampf startet! &#127937;</h2>'
        || '<p style="margin:0 0 16px;">Neuer Monat, alle wieder bei 0 G-Coins. Wer am meisten sammelt (Coupons einl&ouml;sen, Freunde einladen, Streak, Spiel), gewinnt. <strong>Top 3 kassieren.</strong></p>'
        || public.ug_email_btn('Jetzt mitmachen', 'challenge.html');
      v_items := v_items || jsonb_build_object(
        'user_id', r.id,
        'subject', 'Neuer UniGoat-Wettkampf ' || chr(8212) || ' alle bei 0 ' || chr(55356) || chr(57281),
        'html', v_html, 'dedup_key', 'comp_new_' || to_char(now(),'YYYY-MM'), 'kind', 'event', 'throttle_hours', 0);
    exception when others then raise warning 'new_month build fail %: %', r.id, sqlerrm; end;
  end loop;
  perform public.notify_users_email_batch(v_items);
  update public.profiles set last_challenge_rank = null;
end; $function$;

-- 2d. Wettkampf: endet bald
create or replace function public.notify_competition_ending()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_days int; v_html text; v_items jsonb := '[]'::jsonb;
begin
  v_days := (date_trunc('month', now()) + interval '1 month')::date - current_date;
  if v_days > 3 or v_days < 1 then return; end if;
  for r in (
    with mc as (select user_id, sum(delta) c from public.coin_transactions
               where created_at >= date_trunc('month', now()) group by user_id having sum(delta)>0)
    select user_id, rank() over (order by c desc) rk from mc
  ) loop
    begin
      perform public.notify_user_push(r.user_id, 'competition',
        'Nur noch ' || v_days || ' Tag' || (case when v_days=1 then '' else 'e' end) || '! ' || chr(9203),
        'Du bist auf Platz ' || r.rk || '. Top 3 gewinnen ' || chr(8212) || ' jetzt noch Punkte sammeln!',
        jsonb_build_object('url','/challenge.html'), 'comp_end_' || current_date::text);
      v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Der Wettkampf endet in ' || v_days || ' Tag' || (case when v_days=1 then '' else 'en' end) || '! &#9203;</h2>'
        || '<p style="margin:0 0 16px;">Du stehst gerade auf <strong>Platz ' || r.rk || '</strong>. Die Top 3 gewinnen am Monatsende &mdash; jetzt ist die Zeit, nochmal G-Coins zu sammeln.</p>'
        || public.ug_email_btn('Zum Wettkampf', 'challenge.html');
      v_items := v_items || jsonb_build_object(
        'user_id', r.user_id,
        'subject', 'Nur noch ' || v_days || ' Tage im UniGoat-Wettkampf ' || chr(9203),
        'html', v_html, 'dedup_key', 'comp_end_' || current_date::text, 'kind', 'event');
    exception when others then raise warning 'ending build fail %: %', r.user_id, sqlerrm; end;
  end loop;
  perform public.notify_users_email_batch(v_items);
end; $function$;

-- 2e. Wettkampf: Gewinner (Top 3). Push + Champion-Update bleiben pro Nutzer
--     (Seiteneffekt is_champion), nur die Mail laeuft ueber den Batch.
create or replace function public.notify_competition_winners()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_html text; v_title text; v_body text; v_subj text; v_items jsonb := '[]'::jsonb;
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
        if r.rk = 1 then
          update public.profiles set is_champion = true where id = r.user_id;
          v_title := 'Du bist Champion! ' || chr(55357) || chr(56465);
          v_body := 'Platz 1 im letzten Wettkampf! Dein exklusives Champion-Kostuem (nur fuer Gewinner) ist freigeschaltet.';
          v_subj := 'Du bist UniGoat-Champion ' || chr(55357) || chr(56465);
        else
          v_title := 'Du hast gewonnen! ' || chr(55356) || chr(57286);
          v_body := 'Platz ' || r.rk || ' im letzten Wettkampf ' || chr(8212) || ' dein Preis wartet in der App.';
          v_subj := 'Du bist unter den Top 3 ' || chr(8212) || ' UniGoat ' || chr(55356) || chr(57286);
        end if;
        perform public.notify_user_push(r.user_id, 'competition', v_title, v_body, jsonb_build_object('url','/challenge.html'), 'comp_win_' || to_char(now()-interval '1 day','YYYY-MM'));
        v_html := '<h2 style="margin:0 0 12px;font-size:22px;">' || v_title || '</h2>'
          || '<p style="margin:0 0 16px;">' || v_body || '</p>'
          || case when r.rk=1 then '<p style="margin:0 0 16px;">Zieh dein Champion-Kost&uuml;m im Goat-Shop an &mdash; das kann sonst niemand tragen. &#128081;</p>' else '' end
          || public.ug_email_btn(case when r.rk=1 then 'Champion-Kost' || chr(252) || 'm anziehen' else 'Preis ansehen' end, case when r.rk=1 then 'avatar-edit.html' else 'challenge.html' end);
        v_items := v_items || jsonb_build_object(
          'user_id', r.user_id, 'subject', v_subj, 'html', v_html,
          'dedup_key', 'comp_win_' || to_char(now()-interval '1 day','YYYY-MM'), 'kind', 'event');
      exception when others then raise warning 'winner build fail %: %', r.user_id, sqlerrm;
      end;
    end if;
  end loop;
  perform public.notify_users_email_batch(v_items);
end; $function$;

-- 2f. Rank-Changes (ueberholt). Push + last_challenge_rank-Update pro Nutzer,
--     Mail ueber Batch.
create or replace function public.notify_rank_changes()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_html text; v_items jsonb := '[]'::jsonb;
begin
  for r in (
    with mc as (select user_id, sum(delta) c from public.coin_transactions
               where created_at >= date_trunc('month', now()) group by user_id having sum(delta)>0)
    select mc.user_id, rank() over (order by mc.c desc) rk, p.last_challenge_rank lr
    from mc join public.profiles p on p.id = mc.user_id
  ) loop
    begin
      if r.lr is not null and r.rk > r.lr then
        perform public.notify_user_push(r.user_id, 'competition', 'Du wurdest ' || chr(252) || 'berholt ' || chr(55358) || chr(56709),
          'Jemand hat dich ' || chr(252) || 'berholt ' || chr(8212) || ' du bist jetzt Platz ' || r.rk || '. Hol dir den Platz zur' || chr(252) || 'ck!',
          jsonb_build_object('url','/challenge.html'), 'rank_' || current_date::text);
        v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Du wurdest &uuml;berholt &#129352;</h2>'
          || '<p style="margin:0 0 16px;">Jemand hat dich im Wettkampf &uuml;berholt &mdash; du bist jetzt auf <strong>Platz ' || r.rk || '</strong>. Hol dir ein paar G-Coins und schnapp dir den Platz zur&uuml;ck.</p>'
          || public.ug_email_btn('Platz zur' || chr(252) || 'ckholen', 'challenge.html');
        v_items := v_items || jsonb_build_object(
          'user_id', r.user_id,
          'subject', 'Du wurdest im UniGoat-Wettkampf ' || chr(252) || 'berholt ' || chr(55358) || chr(56709),
          'html', v_html, 'dedup_key', 'rank_' || current_date::text, 'kind', 'event');
      end if;
      update public.profiles set last_challenge_rank = r.rk where id = r.user_id;
    exception when others then raise warning 'rank build fail %: %', r.user_id, sqlerrm; end;
  end loop;
  perform public.notify_users_email_batch(v_items);
end; $function$;

-- 2g. Streak-Risk. Push pro Nutzer, Mail ueber Batch.
create or replace function public.notify_streak_risk()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_html text; v_items jsonb := '[]'::jsonb;
begin
  for r in (
    select id, streak_days from public.profiles
    where coalesce(streak_days,0) >= 2 and last_active_date = current_date - 1
  ) loop
    begin
      perform public.notify_user_push(r.id, 'streak', 'Deine Streak rei' || chr(223) || 't gleich! ' || chr(55357) || chr(56613),
        r.streak_days || ' Tage am St' || chr(252) || 'ck ' || chr(8212) || ' kurz reinschauen und dranbleiben.',
        jsonb_build_object('url','/game/'), 'streak_' || current_date::text);
      v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Deine ' || r.streak_days || '-Tage-Streak rei&szlig;t gleich! &#128293;</h2>'
        || '<p style="margin:0 0 16px;">Du warst ' || r.streak_days || ' Tage am St&uuml;ck dabei. Wenn du heute nicht reinschaust, ist die Serie weg. Ein kurzes Spiel reicht.</p>'
        || public.ug_email_btn('Streak retten', 'game/');
      v_items := v_items || jsonb_build_object(
        'user_id', r.id,
        'subject', 'Deine ' || r.streak_days || '-Tage-Streak ist in Gefahr ' || chr(55357) || chr(56613),
        'html', v_html, 'dedup_key', 'streak_' || current_date::text, 'kind', 'event');
    exception when others then raise warning 'streak build fail %: %', r.id, sqlerrm; end;
  end loop;
  perform public.notify_users_email_batch(v_items);
end; $function$;
