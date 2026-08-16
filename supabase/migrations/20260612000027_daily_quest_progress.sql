-- DB-basierter Daily-Quest-Fortschritt: abgeschlossene Quests stehen als
-- coin_transactions (reason 'dq_%') -> daraus done/remaining ableiten.
-- (Teil-Fortschritt wie "5/8 Reihen" bleibt clientseitig; die DB kennt nur
--  abgeschlossene Quests = Basis fuer exakten Push + geraetuebergreifenden Hub.)

-- Eigener Tagesstand (fuer den Hub-Hinweis, geraetuebergreifend)
create or replace function public.get_daily_quest_status()
returns jsonb language sql security definer set search_path = public as $$
  with d as (
    select least(3, count(*))::int as done
    from public.coin_transactions
    where user_id = auth.uid() and reason like 'dq\_%' and created_at::date = current_date
  )
  select jsonb_build_object('total', 3, 'done', d.done, 'remaining', greatest(0, 3 - d.done)) from d;
$$;
grant execute on function public.get_daily_quest_status() to authenticated;

-- Abend-Push mit EXAKTER Rest-Zahl
create or replace function public.notify_daily_quest_reminder()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_done int; v_rem int; v_coins int;
begin
  for r in (select distinct t.user_id from public.fcm_tokens t) loop
    begin
      v_done := least(3, (select count(*) from public.coin_transactions ct
                          where ct.user_id = r.user_id and ct.reason like 'dq\_%'
                            and ct.created_at::date = current_date));
      v_rem := 3 - v_done;
      if v_rem <= 0 then continue; end if;   -- alle erledigt -> kein Push
      v_coins := v_rem * 25;
      perform public.notify_user_push(r.user_id, 'daily_quest',
        'Noch ' || v_rem || ' Daily-Quest' || (case when v_rem=1 then '' else 's' end) || ' offen 🎯',
        'Schaff sie heute und hol dir +' || v_coins || ' G-Coins — und schnapp dir Platz 1 im Wettkampf!',
        jsonb_build_object('url','/game/index.html'),
        'dq_reminder_' || current_date::text);
    exception when others then raise warning 'dq reminder fail %: %', r.user_id, sqlerrm; end;
  end loop;
end; $$;
grant execute on function public.notify_daily_quest_reminder() to service_role;
