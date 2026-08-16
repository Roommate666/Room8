-- E-Mail-Praeferenzen: Opt-out fuer Marketing/Engagement-Mails (UWG-Pflicht).
--  - profiles.email_marketing (default true): Empfaengt Engagement/Wochen-Mails.
--    Transaktions-Mails (Verify, Passwort-Reset) laufen NICHT ueber notify_user_email
--    und sind davon unberuehrt.
--  - profiles.unsubscribe_token: unguessbarer Token fuer 1-Klick-Abmeldung ohne Login.
--  - notify_user_email prueft email_marketing + haengt Abmelde-Link automatisch an.
--  - set_email_marketing(): Toggle aus den Einstellungen (eingeloggt).
--  - unsubscribe_by_token(): 1-Klick-Abmeldung von der Abmelde-Seite (anon).

alter table public.profiles add column if not exists email_marketing boolean default true;
alter table public.profiles add column if not exists unsubscribe_token uuid default gen_random_uuid();
update public.profiles set unsubscribe_token = gen_random_uuid() where unsubscribe_token is null;
create unique index if not exists profiles_unsubscribe_token_idx on public.profiles(unsubscribe_token);

-- my_profile-View neu bauen (select-*-Einfrier-Falle, vgl. 0010/0014/0017)
drop view if exists public.my_profile;
create view public.my_profile as
  select * from public.profiles where id = auth.uid();
grant select on public.my_profile to authenticated;

-- Toggle aus den Einstellungen
create or replace function public.set_email_marketing(p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  update public.profiles set email_marketing = coalesce(p_on,true) where id = auth.uid();
  return coalesce(p_on,true);
end; $$;
grant execute on function public.set_email_marketing(boolean) to authenticated;

-- 1-Klick-Abmeldung ueber Token (ohne Login)
create or replace function public.unsubscribe_by_token(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.profiles set email_marketing = false where unsubscribe_token = p_token returning id into v_id;
  return v_id is not null;
end; $$;
grant execute on function public.unsubscribe_by_token(uuid) to anon, authenticated;

-- notify_user_email NEU: respektiert email_marketing + haengt Abmelde-Link an
create or replace function public.notify_user_email(
  p_user_id uuid, p_subject text, p_html text, p_dedup_key text,
  p_kind text default 'event', p_throttle_hours int default 48)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text; v_tok uuid; v_url text; v_html text;
begin
  select coalesce(p.email, u.email), p.unsubscribe_token into v_email, v_tok
  from public.profiles p join auth.users u on u.id=p.id
  where p.id=p_user_id
    and coalesce(p.is_test,false)=false
    and coalesce(p.email_marketing,true)=true          -- Opt-out respektieren
    and coalesce(p.email,u.email) is not null
    and coalesce(p.email,u.email) not like '%@room8.partner';
  if v_email is null then return false; end if;
  if exists (select 1 from public.engagement_emails_sent where user_id=p_user_id and dedup_key=p_dedup_key) then
    return false;
  end if;
  if p_kind='event' and exists (
    select 1 from public.engagement_emails_sent
    where user_id=p_user_id and kind='event' and sent_at > now() - make_interval(hours => p_throttle_hours)
  ) then
    return false;
  end if;
  -- Abmelde-Link automatisch anhaengen (UWG)
  v_html := p_html
    || '<div style="font-size:11px;color:#B6BCC6;margin-top:20px;border-top:1px solid #EEE;padding-top:12px;">'
    || 'Keine solchen Mails mehr? <a href="https://www.room8.club/abmelden.html?t=' || coalesce(v_tok::text,'')
    || '" style="color:#B6BCC6;text-decoration:underline;">Hier abmelden</a></div>';
  v_url := coalesce(current_setting('app.supabase_url', true),'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
  begin
    perform net.http_post(url := v_url, headers := public.app_internal_headers(),
      body := jsonb_build_object('to', v_email, 'subject', p_subject, 'html', v_html, 'userId', p_user_id));
    insert into public.engagement_emails_sent (user_id, dedup_key, kind) values (p_user_id, p_dedup_key, p_kind)
      on conflict (user_id, dedup_key) do nothing;
    return true;
  exception when others then
    raise warning 'notify_user_email fail %: %', p_user_id, sqlerrm; return false;
  end;
end; $$;
grant execute on function public.notify_user_email(uuid,text,text,text,text,int) to service_role;
