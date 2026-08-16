-- Spiel-Bestenliste (Goat Blast, Daily-Mode): Tages-Top-3 bekommen G-Coins.
-- Nur replay-validierte Scores zaehlen (Anti-Cheat). Bester Score je Nutzer/Tag.
-- Belohnung: 1. +100, 2. +50, 3. +25. Laeuft nachts fuer den abgelaufenen Tag.
create or replace function public.award_daily_game_winners()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_reward int; v_day date := current_date - 1;
begin
  for r in (
    with best as (
      select user_id, max(score) as sc
      from public.goat_scores
      where mode='daily' and coalesce(replay_validated,false)=true and created_at::date = v_day
      group by user_id
    ), ranked as (
      select user_id, sc, rank() over (order by sc desc) as rk from best
    )
    select user_id, rk, sc from ranked where rk <= 3
  ) loop
    -- Schon vergeben? (falls Cron doppelt laeuft)
    if exists (select 1 from public.coin_transactions
               where user_id=r.user_id and reason like 'game_daily_%' and created_at::date=current_date) then
      continue;
    end if;
    v_reward := case r.rk when 1 then 100 when 2 then 50 else 25 end;
    begin
      perform public.add_coins(r.user_id, v_reward, 'game_daily_'||r.rk, null);
      perform public.notify_user_push(r.user_id, 'game_win',
        'Platz ' || r.rk || ' im Spiel! 🎮',
        'Du warst gestern auf Platz ' || r.rk || ' der Tages-Bestenliste — +' || v_reward || ' G-Coins!',
        jsonb_build_object('url','/game/'), 'game_daily_'||v_day::text||'_'||r.user_id::text);
    exception when others then raise warning 'game winner fail %: %', r.user_id, sqlerrm; end;
  end loop;
end; $$;
grant execute on function public.award_daily_game_winners() to service_role;

-- Cron: taeglich 00:20 UTC (kurz nach Tageswechsel, wertet den abgelaufenen Tag aus)
do $$
begin
  perform cron.unschedule('daily-game-winners') where exists (select 1 from cron.job where jobname='daily-game-winners');
  perform cron.schedule('daily-game-winners','20 0 * * *', $c$ select public.award_daily_game_winners(); $c$);
exception when others then raise warning 'game winners cron failed (pg_cron?): %', sqlerrm;
end $$;
