-- KORREKTUR: Mail-Links auf UniGoat-Domain (unigoat.pages.dev) statt room8.club.
-- room8/roommate ist als sichtbare Marke TABU. room8.club war ein Fehler.
-- unigoat.de haengt am netcup-Hold -> interim unigoat.pages.dev (live, UniGoat-Brand).
-- Wenn unigoat.de zurueck: hier + www + Edge-Functions auf unigoat.de.

-- Button-Baustein -> unigoat.pages.dev
create or replace function public.ug_email_btn(p_label text, p_path text)
returns text language sql immutable as $$
  select '<a href="https://unigoat.pages.dev/' || p_path || '" style="display:inline-block;background:#1B9E5F;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px;margin-top:8px;">' || p_label || '</a>';
$$;

-- Abmelde-Link in notify_user_email -> unigoat.pages.dev
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
    and coalesce(p.email_marketing,true)=true
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
  v_html := p_html
    || '<div style="font-size:11px;color:#B6BCC6;margin-top:20px;border-top:1px solid #EEE;padding-top:12px;">'
    || 'Keine solchen Mails mehr? <a href="https://unigoat.pages.dev/abmelden.html?t=' || coalesce(v_tok::text,'')
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
