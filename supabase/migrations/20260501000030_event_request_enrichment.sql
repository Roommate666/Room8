-- Erweitert event_creator_requests + RPC um zusaetzliche Verifizierungs-Felder.
-- Felder: phone, social_proof_url, social_proof_type, university_name, business_address.
-- Pflicht je nach organization_type.

-- ---------------------------------------------------------
-- 1. Neue Spalten
-- ---------------------------------------------------------
alter table public.event_creator_requests
    add column if not exists phone               text,
    add column if not exists social_proof_url    text,
    add column if not exists social_proof_type   text,
    add column if not exists university_name     text,
    add column if not exists business_address    text;

-- Constraint fuer social_proof_type
alter table public.event_creator_requests
    drop constraint if exists request_social_proof_type_check;
alter table public.event_creator_requests
    add constraint request_social_proof_type_check
    check (social_proof_type is null or social_proof_type in (
        'instagram', 'website', 'linkedin', 'uni_email', 'other'
    ));

-- ---------------------------------------------------------
-- 2. Neue RPC mit erweiterten Feldern
-- ---------------------------------------------------------
create or replace function public.request_event_creator_permission_v2(
    organization_name_input text,
    organization_type_input text,
    reason_input             text,
    phone_input              text,
    social_proof_url_input   text,
    social_proof_type_input  text,
    university_name_input    text default null,
    business_address_input   text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_can_create boolean;
    v_existing_id uuid;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        return json_build_object('success', false, 'error', 'not_authenticated');
    end if;

    select can_create_events into v_can_create from public.profiles where id = v_user_id;
    if v_can_create = true then
        return json_build_object('success', false, 'error', 'already_approved');
    end if;

    select id into v_existing_id from public.event_creator_requests
     where user_id = v_user_id and status = 'pending';
    if v_existing_id is not null then
        return json_build_object('success', false, 'error', 'already_pending');
    end if;

    -- Validierung
    if length(trim(coalesce(organization_name_input, ''))) < 2
       or length(organization_name_input) > 200 then
        return json_build_object('success', false, 'error', 'invalid_organization_name');
    end if;
    if organization_type_input not in ('asta','university','student_association','partner','private','other') then
        return json_build_object('success', false, 'error', 'invalid_organization_type');
    end if;
    if length(trim(coalesce(reason_input, ''))) < 50 then
        return json_build_object('success', false, 'error', 'invalid_reason');
    end if;
    if length(trim(coalesce(phone_input, ''))) < 6 then
        return json_build_object('success', false, 'error', 'invalid_phone');
    end if;
    if length(trim(coalesce(social_proof_url_input, ''))) < 3 then
        return json_build_object('success', false, 'error', 'invalid_social_proof');
    end if;
    if social_proof_type_input not in ('instagram','website','linkedin','uni_email','other') then
        return json_build_object('success', false, 'error', 'invalid_social_proof_type');
    end if;
    -- Bei 'partner' (Bar/Club/Gewerbe) ist Business-Adresse Pflicht
    if organization_type_input = 'partner' and length(trim(coalesce(business_address_input, ''))) < 5 then
        return json_build_object('success', false, 'error', 'business_address_required');
    end if;

    insert into public.event_creator_requests (
        user_id, organization_name, organization_type, reason,
        phone, social_proof_url, social_proof_type,
        university_name, business_address
    ) values (
        v_user_id, organization_name_input, organization_type_input, reason_input,
        phone_input, social_proof_url_input, social_proof_type_input,
        nullif(trim(coalesce(university_name_input, '')), ''),
        nullif(trim(coalesce(business_address_input, '')), '')
    );

    return json_build_object('success', true);
end $$;

grant execute on function public.request_event_creator_permission_v2(
    text, text, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------
-- 3. Trust-Score Berechnung fuer Admin-Anzeige
-- ---------------------------------------------------------
create or replace function public.calc_event_request_trust_score(p_request_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_score integer := 0;
    v_req record;
    v_profile record;
    v_age_days integer;
begin
    select * into v_req from public.event_creator_requests where id = p_request_id;
    if not found then return 0; end if;

    select * into v_profile from public.profiles where id = v_req.user_id;

    -- Konto-Alter
    v_age_days := extract(day from (now() - v_profile.created_at));
    if v_age_days >= 30 then v_score := v_score + 15;
    elsif v_age_days >= 7 then v_score := v_score + 5; end if;

    -- Studenten-Verifizierung
    if v_profile.is_student_verified = true then v_score := v_score + 25; end if;
    if v_profile.uni_email_verified = true then v_score := v_score + 20; end if;

    -- Profil-Vollstaendigkeit
    if v_profile.full_name is not null and length(v_profile.full_name) > 3 then v_score := v_score + 5; end if;
    if v_profile.avatar_url is not null then v_score := v_score + 5; end if;
    if v_profile.bio is not null and length(v_profile.bio) > 20 then v_score := v_score + 5; end if;

    -- Antrag-Qualitaet
    if v_req.organization_type in ('asta','university','student_association') then v_score := v_score + 10; end if;
    if v_req.organization_type = 'partner' then v_score := v_score + 10; end if;
    if v_req.social_proof_type = 'uni_email' then v_score := v_score + 10; end if;
    if v_req.social_proof_type in ('website','linkedin') then v_score := v_score + 5; end if;
    if length(coalesce(v_req.reason, '')) > 200 then v_score := v_score + 5; end if;

    return least(v_score, 100);
end $$;

grant execute on function public.calc_event_request_trust_score(uuid) to authenticated;
