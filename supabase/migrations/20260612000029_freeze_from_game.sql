-- Streak-Retter gewinnt man im SPIEL: alle 3 Daily-Quests an einem Tag erledigt
-- -> 1 Streak-Retter (max 2 auf Vorrat, 1x/Tag). Server-validiert (dq_-Transaktionen).
-- (Kauf-RPC buy_streak_freeze bleibt bestehen, wird aber im UI nicht mehr angeboten.)

create or replace function public.claim_daily_quest(p_quest text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bonus int := 25; v_already int; v_coins int; v_reason text;
  v_done int; v_freezes int; v_freeze_won boolean := false; v_fwin_today int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  if p_quest is null or length(trim(p_quest))=0 or length(p_quest)>40 then
    return jsonb_build_object('ok',false,'error','BAD_QUEST'); end if;
  v_reason := 'dq_' || regexp_replace(lower(p_quest), '[^a-z0-9_]', '', 'g');
  select count(*) into v_already from public.coin_transactions
    where user_id=v_uid and reason=v_reason and created_at::date=current_date;
  if v_already > 0 then
    select coins into v_coins from public.profiles where id=v_uid;
    return jsonb_build_object('ok',true,'awarded',0,'coins',coalesce(v_coins,0),'already',true,'freeze_won',false);
  end if;
  v_coins := public.add_coins(v_uid, v_bonus, v_reason, null);

  -- Alle 3 Daily-Quests heute erledigt -> 1 Streak-Retter gewinnen (max 2, 1x/Tag)
  select count(*) into v_done from public.coin_transactions
    where user_id=v_uid and reason like 'dq\_%' and created_at::date=current_date;
  if v_done >= 3 then
    select count(*) into v_fwin_today from public.coin_transactions
      where user_id=v_uid and reason='freeze_win' and created_at::date=current_date;
    if v_fwin_today = 0 then
      select coalesce(streak_freezes,0) into v_freezes from public.profiles where id=v_uid;
      if v_freezes < 2 then
        update public.profiles set streak_freezes = v_freezes + 1 where id=v_uid;
        perform public.add_coins(v_uid, 0, 'freeze_win', null);  -- Marker (delta 0, kein Ranking-Effekt)
        v_freeze_won := true;
      end if;
    end if;
  end if;

  return jsonb_build_object('ok',true,'awarded',v_bonus,'coins',v_coins,'already',false,'freeze_won',v_freeze_won);
end; $$;
grant execute on function public.claim_daily_quest(text) to authenticated;
