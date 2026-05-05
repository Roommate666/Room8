-- Migration: Trust-Layer (Block-User + Report-Content via existing schema).
--
-- Vorher: User konnten andere User nicht blocken. reports-Tabelle existierte
-- bereits (mit Spalten reported_type, reported_id, description, status, ...)
-- aber kein User-Facing Report-RPC + kein Block-System.
--
-- Diese Migration:
--   1. Neue Tabelle user_blocks (bidirektionaler Block-Check)
--   2. RPCs: block_user / unblock_user / is_blocked_between
--   3. RPC: report_content (nutzt existing reports-Schema)
--   4. RLS auf user_blocks (eigene), reports unveraendert
--
-- Frontend-Integration (chat.html, listing-display, profile.html) kommt in
-- Folgemigration — Tabellen + RPCs sind die Grundlage.

-- =========================================================
-- 1. user_blocks
-- =========================================================
create table if not exists public.user_blocks (
    id          uuid primary key default gen_random_uuid(),
    blocker_id  uuid not null references public.profiles(id) on delete cascade,
    blocked_id  uuid not null references public.profiles(id) on delete cascade,
    reason      text,
    created_at  timestamptz not null default now(),
    constraint user_blocks_unique unique (blocker_id, blocked_id),
    constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists idx_user_blocks_blocker on public.user_blocks(blocker_id);
create index if not exists idx_user_blocks_blocked on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks_owner_read" on public.user_blocks;
create policy "user_blocks_owner_read"
    on public.user_blocks
    for select
    to authenticated
    using (auth.uid() = blocker_id);

drop policy if exists "user_blocks_no_direct_write" on public.user_blocks;
create policy "user_blocks_no_direct_write"
    on public.user_blocks
    for all
    to authenticated
    using (false)
    with check (false);

-- =========================================================
-- 2. RPCs: block_user / unblock_user / is_blocked_between
-- =========================================================
create or replace function public.block_user(p_blocked_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_id  uuid;
begin
    if v_uid is null then raise exception 'not authenticated'; end if;
    if p_blocked_id is null then raise exception 'blocked_id required'; end if;
    if v_uid = p_blocked_id then raise exception 'cannot block self'; end if;

    insert into public.user_blocks (blocker_id, blocked_id, reason)
    values (v_uid, p_blocked_id, nullif(trim(coalesce(p_reason, '')), ''))
    on conflict (blocker_id, blocked_id) do update
       set reason = excluded.reason
    returning id into v_id;

    return v_id;
end;
$$;

revoke all on function public.block_user(uuid, text) from public, anon;
grant execute on function public.block_user(uuid, text) to authenticated;

create or replace function public.unblock_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then raise exception 'not authenticated'; end if;
    delete from public.user_blocks
     where blocker_id = v_uid and blocked_id = p_blocked_id;
end;
$$;

revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- Helper: prueft ob A B blockiert hat ODER B A blockiert hat
-- (bidirektional — Block ist immer beidseitig wirksam fuer Listings/Chats)
create or replace function public.is_blocked_between(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_blocks
         where (blocker_id = p_user_a and blocked_id = p_user_b)
            or (blocker_id = p_user_b and blocked_id = p_user_a)
    );
$$;

grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, service_role;

-- =========================================================
-- 3. report_content RPC (nutzt existing reports-Tabelle)
-- =========================================================
-- Existing reports-Schema:
--   id, reporter_id, listing_id, message_id, reason, created_at, status,
--   admin_notes, reviewed_at, reviewed_by, description, reported_type, reported_id
--
-- Existing Trigger `alert_admin_new_report` feuert bei jedem INSERT und
-- schickt Mail an Admin via send_admin_alert — wir muessen nichts extra tun.
create or replace function public.report_content(
    p_target_type text,
    p_target_id   text,
    p_reason      text,
    p_message     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_id  uuid;
    v_recent_count int;
    v_listing_id uuid;
    v_message_id uuid;
begin
    if v_uid is null then raise exception 'not authenticated'; end if;
    if p_target_type is null or p_target_id is null or p_reason is null then
        raise exception 'target_type, target_id, reason required';
    end if;

    -- Rate-Limit: max 5/h, 30/d (Anti-Trolling)
    select count(*) into v_recent_count
      from public.reports
     where reporter_id = v_uid
       and created_at >= now() - interval '1 hour';
    if v_recent_count >= 5 then
        raise exception 'Zu viele Meldungen — bitte spaeter erneut versuchen.'
              using errcode = 'P0001';
    end if;

    select count(*) into v_recent_count
      from public.reports
     where reporter_id = v_uid
       and created_at >= now() - interval '24 hours';
    if v_recent_count >= 30 then
        raise exception 'Tageslimit fuer Meldungen erreicht.'
              using errcode = 'P0001';
    end if;

    -- Backwards-Compat: wenn target_type listing/message ist, parsen wir
    -- target_id als uuid in die typed Spalten — der bestehende Admin-Workflow
    -- nutzt sie wahrscheinlich.
    if p_target_type = 'listing' then
        begin v_listing_id := p_target_id::uuid; exception when others then null; end;
    elsif p_target_type = 'message' then
        begin v_message_id := p_target_id::uuid; exception when others then null; end;
    end if;

    insert into public.reports
        (reporter_id, reported_type, reported_id, listing_id, message_id,
         reason, description, status)
    values
        (v_uid, p_target_type, p_target_id, v_listing_id, v_message_id,
         p_reason, nullif(trim(coalesce(p_message, '')), ''), 'open')
    returning id into v_id;

    return v_id;
end;
$$;

revoke all on function public.report_content(text, text, text, text) from public, anon;
grant execute on function public.report_content(text, text, text, text) to authenticated;
