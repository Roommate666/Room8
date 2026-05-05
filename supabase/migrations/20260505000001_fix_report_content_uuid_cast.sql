-- Fix: report_content RPC scheiterte mit
--   "column reported_id is of type uuid but expression is of type text"
-- weil p_target_id als text in eine UUID-Spalte ging. Postgres macht keinen
-- impliziten Cast. Loesung: explizit auf uuid casten — alle aktuellen
-- target-Typen (user/listing/message/event/item/job/coupon) sind UUIDs.

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
    v_target_uuid uuid;
begin
    if v_uid is null then raise exception 'not authenticated'; end if;
    if p_target_type is null or p_target_id is null or p_reason is null then
        raise exception 'target_type, target_id, reason required';
    end if;

    -- target_id als UUID casten — graceful exception falls mal kein UUID kommt
    begin
        v_target_uuid := p_target_id::uuid;
    exception when others then
        raise exception 'target_id must be a valid UUID';
    end;

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

    -- Backwards-Compat: typed columns fuer den existing Admin-Workflow
    if p_target_type = 'listing' then
        v_listing_id := v_target_uuid;
    elsif p_target_type = 'message' then
        v_message_id := v_target_uuid;
    end if;

    insert into public.reports
        (reporter_id, reported_type, reported_id, listing_id, message_id,
         reason, description, status)
    values
        (v_uid, p_target_type, v_target_uuid, v_listing_id, v_message_id,
         p_reason, nullif(trim(coalesce(p_message, '')), ''), 'open')
    returning id into v_id;

    return v_id;
end;
$$;

revoke all on function public.report_content(text, text, text, text) from public, anon;
grant execute on function public.report_content(text, text, text, text) to authenticated;
