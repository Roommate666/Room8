-- Breite Profil-Update-RPC fuer edit-profile.html.
-- Grund: authenticated hat KEIN direktes UPDATE auf profiles (42501) -> direktes
-- profiles.update() in edit-profile schlug still fehl ("nicht gespeichert").
-- Diese RPC setzt NUR eine Whitelist eigener, unkritischer Felder (KEINE
-- privilegierten Felder wie is_admin/is_verified/coins/is_champion).

create or replace function public.update_my_profile(p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_un text := nullif(trim(p_data->>'username'),'');
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  if v_un is not null and exists (
     select 1 from public.profiles where lower(username)=lower(v_un) and id<>v_uid) then
    return jsonb_build_object('ok',false,'error','USERNAME_TAKEN');
  end if;

  update public.profiles set
    username    = coalesce(v_un, username),
    full_name   = case when p_data ? 'full_name'   then nullif(trim(p_data->>'full_name'),'')   else full_name end,
    city        = case when p_data ? 'city'        then nullif(trim(p_data->>'city'),'')        else city end,
    age         = case when p_data ? 'age'         then nullif(p_data->>'age','')::int          else age end,
    university  = case when p_data ? 'university'   then nullif(trim(p_data->>'university'),'')   else university end,
    study_field = case when p_data ? 'study_field' then nullif(trim(p_data->>'study_field'),'')  else study_field end,
    semester    = case when p_data ? 'semester'    then nullif(p_data->>'semester','')::int      else semester end,
    bio         = case when p_data ? 'bio'         then nullif(trim(p_data->>'bio'),'')          else bio end,
    languages   = case when p_data ? 'languages'   then nullif(trim(p_data->>'languages'),'')    else languages end,
    interests   = case when p_data ? 'interests'   then nullif(trim(p_data->>'interests'),'')    else interests end,
    avatar_url  = case when p_data ? 'avatar_url'  then nullif(trim(p_data->>'avatar_url'),'')   else avatar_url end,
    updated_at  = now()
  where id = v_uid;

  if not found then
    insert into public.profiles (id, username, updated_at) values (v_uid, v_un, now());
    update public.profiles set
      full_name   = nullif(trim(p_data->>'full_name'),''),
      city        = nullif(trim(p_data->>'city'),''),
      age         = nullif(p_data->>'age','')::int,
      university  = nullif(trim(p_data->>'university'),''),
      study_field = nullif(trim(p_data->>'study_field'),''),
      semester    = nullif(p_data->>'semester','')::int,
      bio         = nullif(trim(p_data->>'bio'),''),
      languages   = nullif(trim(p_data->>'languages'),''),
      interests   = nullif(trim(p_data->>'interests'),''),
      avatar_url  = nullif(trim(p_data->>'avatar_url'),''),
      updated_at  = now()
    where id = v_uid;
  end if;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.update_my_profile(jsonb) to authenticated;

-- Daily-Quest-Belohnung: fixe Punkte serverseitig, 1x/Tag pro Quest (Anti-Farm).
create or replace function public.claim_daily_quest(p_quest text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bonus int := 25; v_already int; v_coins int; v_reason text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  if p_quest is null or length(trim(p_quest))=0 or length(p_quest)>40 then
    return jsonb_build_object('ok',false,'error','BAD_QUEST'); end if;
  v_reason := 'dq_' || regexp_replace(lower(p_quest), '[^a-z0-9_]', '', 'g');
  select count(*) into v_already from public.coin_transactions
    where user_id=v_uid and reason=v_reason and created_at::date=current_date;
  if v_already > 0 then
    select coins into v_coins from public.profiles where id=v_uid;
    return jsonb_build_object('ok',true,'awarded',0,'coins',coalesce(v_coins,0),'already',true);
  end if;
  v_coins := public.add_coins(v_uid, v_bonus, v_reason, null);
  return jsonb_build_object('ok',true,'awarded',v_bonus,'coins',v_coins,'already',false);
end; $$;
grant execute on function public.claim_daily_quest(text) to authenticated;
