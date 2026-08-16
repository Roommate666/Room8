-- Champion-System: Der Monats-Gewinner (Rang 1) wird permanent Champion und
-- schaltet damit das EXKLUSIVE Koenig-Kostuem frei (nicht kaufbar, nur gewinnbar).
-- is_champion bleibt fuer immer true (Prestige-Badge).

alter table public.profiles add column if not exists is_champion boolean default false;

-- my_profile-View neu bauen (select-*-Einfrier-Falle, vgl. 0010/0014/0017/0020)
drop view if exists public.my_profile;
create view public.my_profile as
  select * from public.profiles where id = auth.uid();
grant select on public.my_profile to authenticated;

-- Gewinner-Benachrichtigung + Champion-Vergabe (Rang 1)
create or replace function public.notify_competition_winners()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_html text; v_title text; v_body text;
begin
  for r in (
    with mc as (select user_id, sum(delta) c from public.coin_transactions
               where created_at >= date_trunc('month', now()) - interval '1 month'
                 and created_at < date_trunc('month', now())
               group by user_id having sum(delta)>0)
    select user_id, rank() over (order by c desc) rk from mc
  ) loop
    if r.rk <= 3 then
      begin
        -- Rang 1 = Champion: permanenter Status + exklusives Koenig-Kostuem
        if r.rk = 1 then
          update public.profiles set is_champion = true where id = r.user_id;
          v_title := 'Du bist Champion! 👑';
          v_body  := 'Platz 1 im letzten Wettkampf! Dein exklusives Champion-Kostuem (nur fuer Gewinner) ist freigeschaltet.';
        else
          v_title := 'Du hast gewonnen! 🏆';
          v_body  := 'Platz ' || r.rk || ' im letzten Wettkampf — dein Preis wartet in der App.';
        end if;
        perform public.notify_user_push(r.user_id, 'competition', v_title, v_body,
          jsonb_build_object('url','/challenge.html'), 'comp_win_' || to_char(now()-interval '1 day','YYYY-MM'));
        v_html := '<h2 style="margin:0 0 12px;font-size:22px;">' || v_title || '</h2>'
          || '<p style="margin:0 0 16px;">' || v_body || '</p>'
          || case when r.rk=1 then '<p style="margin:0 0 16px;">Zieh dein Champion-Kostuem im Goat-Shop an — das kann sonst niemand tragen. 👑</p>' else '' end
          || public.ug_email_btn(case when r.rk=1 then 'Champion-Kostuem anziehen' else 'Preis ansehen' end,
               case when r.rk=1 then 'avatar-edit.html' else 'challenge.html' end);
        perform public.notify_user_email(r.user_id,
          case when r.rk=1 then 'Du bist UniGoat-Champion 👑' else 'Du bist unter den Top 3 — UniGoat 🏆' end,
          v_html, 'comp_win_' || to_char(now()-interval '1 day','YYYY-MM'));
      exception when others then raise warning 'winner fail %: %', r.user_id, sqlerrm; end;
    end if;
  end loop;
end; $$;
grant execute on function public.notify_competition_winners() to service_role;

-- Admin-Helfer: Champion manuell vergeben/entziehen (zum Testen / Sonderfall)
create or replace function public.set_champion(p_user uuid, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and is_admin) then return false; end if;
  update public.profiles set is_champion = coalesce(p_on,true) where id = p_user;
  return true;
end; $$;
grant execute on function public.set_champion(uuid, boolean) to authenticated;
