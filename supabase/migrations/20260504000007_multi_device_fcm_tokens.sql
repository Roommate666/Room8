-- Migration: Multi-Device FCM-Token-Support.
--
-- Vorher: profiles.fcm_token (single column) → letztes Device gewinnt,
-- User mit iOS + Android bekommt Push nur auf einem davon.
--
-- Nachher: dedizierte fcm_tokens-Tabelle, 1:N user → token.
--
-- Verhalten:
--   - register_fcm_token(token, platform) UPSERT in fcm_tokens, dual-write
--     auch in profiles.fcm_token (Legacy-Compat fuer Edge-Function-Uebergang)
--   - send-push Edge Function iteriert ueber alle fcm_tokens fuer den User
--   - Bei UNREGISTERED nur DEN einen Token loeschen, nicht den ganzen User
--   - 60-Tage-Cleanup via Cronjob (separat)
--
-- profiles.fcm_token bleibt befuellt fuer Backwards-Compat aber ist
-- deprecated. Sobald alle Clients neue Version haben, kann Spalte gedroppt
-- werden.

-- =========================================================
-- 1. Tabelle fcm_tokens
-- =========================================================
create table if not exists public.fcm_tokens (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.profiles(id) on delete cascade,
    token        text not null unique,
    platform     text not null default 'unknown'
                 check (platform in ('android', 'ios', 'web', 'unknown')),
    device_id    text,
    last_seen_at timestamptz not null default now(),
    created_at   timestamptz not null default now()
);

create index if not exists idx_fcm_tokens_user_id on public.fcm_tokens(user_id);
create index if not exists idx_fcm_tokens_last_seen on public.fcm_tokens(last_seen_at);

alter table public.fcm_tokens enable row level security;

-- Owner darf eigene Token-Zeilen lesen (nicht aber Token-Wert anderer User).
drop policy if exists "fcm_tokens_owner_read" on public.fcm_tokens;
create policy "fcm_tokens_owner_read"
    on public.fcm_tokens
    for select
    to authenticated
    using (auth.uid() = user_id);

-- Inserts/Updates/Deletes nur via SECURITY DEFINER RPCs — KEINE direkten
-- Frontend-Calls erlauben, sonst gleiches Problem wie S9.
drop policy if exists "fcm_tokens_no_direct_write" on public.fcm_tokens;
create policy "fcm_tokens_no_direct_write"
    on public.fcm_tokens
    for all
    to authenticated
    using (false)
    with check (false);

-- =========================================================
-- 2. Backfill: existing profiles.fcm_token in fcm_tokens
-- =========================================================
insert into public.fcm_tokens (user_id, token, platform, last_seen_at, created_at)
select id, fcm_token, 'unknown', coalesce(updated_at, now()), coalesce(updated_at, now())
  from public.profiles
 where fcm_token is not null
   and fcm_token <> ''
on conflict (token) do nothing;

-- =========================================================
-- 3. register_fcm_token: 2-arg Version mit Platform
-- =========================================================
-- Alte 1-arg Variante NICHT droppen — Frontend hat zwei Stellen die rufen,
-- 2-arg ist Erweiterung mit default 'unknown'.
create or replace function public.register_fcm_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_platform text;
begin
    if v_uid is null then
        raise exception 'not authenticated';
    end if;

    if p_token is null or length(p_token) < 20 or position(':' in p_token) = 0 then
        raise exception 'invalid fcm token format';
    end if;

    -- Platform validieren, sonst 'unknown'
    v_platform := case lower(coalesce(p_platform, 'unknown'))
                      when 'android' then 'android'
                      when 'ios'     then 'ios'
                      when 'web'     then 'web'
                      else 'unknown'
                  end;

    -- Device-Reuse: vorheriger User auf diesem Device wird stillgelegt.
    -- Token ist UNIQUE → wir loeschen die alte Zeile und inserten neu mit
    -- aktuellem User. Das ist sauberer als UPDATE weil wir auch fcm_tokens-
    -- Eintraege von ABGEMELDETEN Users entfernen.
    delete from public.fcm_tokens
     where token = p_token
       and user_id <> v_uid;

    -- Aktueller User bekommt Token — UPSERT damit gleicher Token vom gleichen
    -- User nur last_seen_at aktualisiert.
    insert into public.fcm_tokens (user_id, token, platform, last_seen_at)
    values (v_uid, p_token, v_platform, now())
    on conflict (token) do update
       set platform = excluded.platform,
           last_seen_at = now();

    -- Legacy-Compat: profiles.fcm_token mit-pflegen damit alte send-push
    -- Code-Paths nicht brechen. Wird in Folge-Migration entfernt.
    update public.profiles
       set fcm_token = p_token
     where id = v_uid;
end;
$$;

revoke all on function public.register_fcm_token(text, text) from public, anon;
grant execute on function public.register_fcm_token(text, text) to authenticated;

-- 1-arg Variante delegiert auf 2-arg mit platform='unknown'
create or replace function public.register_fcm_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.register_fcm_token(p_token, 'unknown');
end;
$$;

revoke all on function public.register_fcm_token(text) from public, anon;
grant execute on function public.register_fcm_token(text) to authenticated;

-- =========================================================
-- 4. clear_own_fcm_token: Token-spezifisch loeschen
-- =========================================================
-- Erweiterung: optionaler p_token-Parameter loescht nur EINEN Token.
-- Ohne Parameter: alle Tokens des Users loeschen (Logout-Flow).
create or replace function public.clear_own_fcm_token(p_token text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'not authenticated';
    end if;

    if p_token is null then
        delete from public.fcm_tokens where user_id = v_uid;
        update public.profiles set fcm_token = null where id = v_uid;
    else
        delete from public.fcm_tokens
         where user_id = v_uid
           and token = p_token;
        -- profiles.fcm_token nullen wenn der geloeschte Token derselbe ist
        update public.profiles set fcm_token = null
         where id = v_uid
           and fcm_token = p_token;
    end if;
end;
$$;

revoke all on function public.clear_own_fcm_token(text) from public, anon;
grant execute on function public.clear_own_fcm_token(text) to authenticated;

-- =========================================================
-- 5. Helper: get_user_fcm_tokens(uuid) fuer Edge Function
-- =========================================================
-- Service-Role-only Helper damit send-push elegant fan-out machen kann.
-- Filtert auf Tokens der letzten 60 Tage — alte Tokens werden ignoriert.
create or replace function public.get_user_fcm_tokens(p_user_id uuid)
returns table(token text, platform text)
language sql
stable
security definer
set search_path = public
as $$
    select token, platform
      from public.fcm_tokens
     where user_id = p_user_id
       and last_seen_at >= now() - interval '60 days';
$$;

revoke all on function public.get_user_fcm_tokens(uuid) from public, anon, authenticated;
grant execute on function public.get_user_fcm_tokens(uuid) to service_role;
