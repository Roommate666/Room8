-- ============================================================================
-- 20260906000004_uni_code_ratelimit.sql
-- Rate-Limit fuer die Uni-Code-Anforderung: max 3 Codes pro 10 Minuten pro User.
-- Schutz gegen Mail-Bombing (fremde Uni-Adresse mit Codes zuspammen) + schont das
-- Resend-Kontingent. Fixed-Window ueber zwei additive Zaehl-Spalten auf profiles.
-- Ersetzt request_uni_code aus 20260612000033_uni_code_verify.sql (Rest identisch).
-- ============================================================================

alter table public.profiles add column if not exists uni_code_window_start timestamptz;
alter table public.profiles add column if not exists uni_code_window_count int not null default 0;

create or replace function public.request_uni_code(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_domain text; v_code text; v_url text; v_html text;
  v_win_start timestamptz; v_win_count int;
  v_blocked text[] := array['gmail.com','googlemail.com','gmx.de','gmx.net','web.de','yahoo.com','yahoo.de',
    'hotmail.com','hotmail.de','outlook.com','outlook.de','live.de','live.com','icloud.com','me.com',
    't-online.de','freenet.de','aol.com','proton.me','protonmail.com','mail.de'];
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  v_email := lower(trim(p_email));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok',false,'error','INVALID_EMAIL'); end if;
  v_domain := split_part(v_email,'@',2);
  if v_domain = any(v_blocked) then return jsonb_build_object('ok',false,'error','NOT_UNI_EMAIL'); end if;
  if exists (select 1 from public.profiles where lower(uni_email)=v_email and uni_email_verified=true and id<>v_uid) then
    return jsonb_build_object('ok',false,'error','EMAIL_IN_USE'); end if;

  -- Rate-Limit: max 3 Code-Anfragen pro 10 Minuten pro User (Anti-Mail-Bombing + Resend schonen).
  select uni_code_window_start, uni_code_window_count into v_win_start, v_win_count
    from public.profiles where id = v_uid;
  if v_win_start is null or v_win_start < now() - interval '10 minutes' then
    update public.profiles set uni_code_window_start = now(), uni_code_window_count = 1 where id = v_uid;
  elsif coalesce(v_win_count,0) >= 3 then
    return jsonb_build_object('ok',false,'error','RATE_LIMITED',
      'retry_after_sec', greatest(1, 600 - floor(extract(epoch from (now() - v_win_start)))::int));
  else
    update public.profiles set uni_code_window_count = coalesce(uni_code_window_count,0) + 1 where id = v_uid;
  end if;

  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  update public.profiles set uni_email=v_email, uni_email_verification_token=v_code, uni_email_token_created_at=now()
    where id=v_uid;

  v_url := coalesce(current_setting('app.supabase_url',true),'https://tvnvmogaqmduzcycmvby.supabase.co')||'/functions/v1/send-email';
  v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Dein UniGoat-Code</h2>'
    ||'<p style="margin:0 0 8px;">Gib diesen Code in der App ein, um deinen Studenten-Status zu bestätigen:</p>'
    ||'<div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f4f6f8;border-radius:12px;padding:16px;text-align:center;margin:12px 0;">'||v_code||'</div>'
    ||'<p style="margin:0;color:#6b7280;font-size:13px;">Der Code ist 15 Minuten gültig. Wenn du das nicht warst, ignoriere diese Mail.</p>';
  begin
    perform net.http_post(url:=v_url, headers:=public.app_internal_headers(),
      body:=jsonb_build_object('to',v_email,'subject','Dein UniGoat-Code: '||v_code,'html',v_html,'userId',v_uid));
  exception when others then raise warning 'uni code mail fail %: %',v_uid,sqlerrm; end;
  return jsonb_build_object('ok',true);
end; $$;
grant execute on function public.request_uni_code(text) to authenticated;
