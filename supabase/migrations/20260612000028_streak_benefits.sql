-- Streak-Benefits: Streak-Freeze (Retter), feinere Meilenstein-Kurve, streak_best (fuer Flammen-Badge/Kostuem).
-- touch_streak() wird bei App-Oeffnen aufgerufen.

alter table public.profiles add column if not exists streak_freezes int not null default 0;
alter table public.profiles add column if not exists last_freeze_grant date;
alter table public.profiles add column if not exists streak_best int not null default 0;

-- my_profile-View neu bauen (select-*-Einfrier-Falle, vgl. 0010/0014/0017/0020/0022)
drop view if exists public.my_profile;
create view public.my_profile as select * from public.profiles where id = auth.uid();
grant select on public.my_profile to authenticated;

-- Streak mit Freeze + feiner Kurve
create or replace function public.touch_streak()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_last date; v_streak int; v_today date := current_date; v_award int := 0;
  v_freezes int; v_grant date; v_best int; v_freeze_used boolean := false; v_gap int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  select last_active_date, coalesce(streak_days,0), coalesce(streak_freezes,0), last_freeze_grant, coalesce(streak_best,0)
    into v_last, v_streak, v_freezes, v_grant, v_best from public.profiles where id = v_uid;

  -- Woechentlicher Gratis-Freeze (1/Woche, max 2 auf Vorrat)
  if v_grant is null or date_trunc('week', v_grant) < date_trunc('week', v_today) then
    v_freezes := least(2, v_freezes + 1); v_grant := v_today;
  end if;

  if v_last = v_today then
    update public.profiles set streak_freezes=v_freezes, last_freeze_grant=v_grant where id=v_uid;
    return jsonb_build_object('ok',true,'streak',v_streak,'already',true,'awarded',0,'freezes',v_freezes,'best',v_best);
  end if;

  v_gap := case when v_last is null then 999 else (v_today - v_last) end;
  if v_gap = 1 then
    v_streak := v_streak + 1;
  elsif v_gap = 2 and v_freezes >= 1 then
    v_freezes := v_freezes - 1; v_freeze_used := true; v_streak := v_streak + 1;  -- Freeze deckt EINEN verpassten Tag
  else
    v_streak := 1;
  end if;

  v_best := greatest(v_best, v_streak);
  update public.profiles set streak_days=v_streak, last_active_date=v_today,
    streak_freezes=v_freezes, last_freeze_grant=v_grant, streak_best=v_best where id=v_uid;

  -- Meilenstein-Kurve: 3/7/14/30/60/100 + danach alle 30
  if    v_streak=3   then v_award:=10;  perform public.add_coins(v_uid,10,'streak_3',null);
  elsif v_streak=7   then v_award:=25;  perform public.add_coins(v_uid,25,'streak_7',null);
  elsif v_streak=14  then v_award:=50;  perform public.add_coins(v_uid,50,'streak_14',null);
  elsif v_streak=30  then v_award:=150; perform public.add_coins(v_uid,150,'streak_30',null);
  elsif v_streak=60  then v_award:=300; perform public.add_coins(v_uid,300,'streak_60',null);
  elsif v_streak=100 then v_award:=500; perform public.add_coins(v_uid,500,'streak_100',null);
  elsif v_streak>100 and v_streak%30=0 then v_award:=150; perform public.add_coins(v_uid,150,'streak_30plus',null);
  end if;

  return jsonb_build_object('ok',true,'streak',v_streak,'already',false,'awarded',v_award,
    'freeze_used',v_freeze_used,'freezes',v_freezes,'best',v_best);
end; $$;
grant execute on function public.touch_streak() to authenticated;

-- Streak-Freeze kaufen (50 G-Coins, max 2)
create or replace function public.buy_streak_freeze()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_coins int; v_freezes int; c_cost int := 50;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  select coalesce(coins,0), coalesce(streak_freezes,0) into v_coins, v_freezes from public.profiles where id=v_uid;
  if v_freezes >= 2 then return jsonb_build_object('ok',false,'error','MAX_FREEZES'); end if;
  if v_coins < c_cost then return jsonb_build_object('ok',false,'error','NOT_ENOUGH_COINS','coins',v_coins); end if;
  perform public.add_coins(v_uid, -c_cost, 'freeze_buy', null);
  update public.profiles set streak_freezes = v_freezes + 1 where id=v_uid;
  return jsonb_build_object('ok',true,'freezes',v_freezes+1,'coins',v_coins-c_cost);
end; $$;
grant execute on function public.buy_streak_freeze() to authenticated;
