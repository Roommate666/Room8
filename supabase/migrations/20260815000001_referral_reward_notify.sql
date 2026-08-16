-- Referral-Reward: Werber per Push + In-App benachrichtigen, wenn geworbener
-- Freund sich verifiziert und dadurch die 100 G-Coins ausgeloest werden.
-- Erweitert reward_pending_referral (Original: nur Coins, keine Benachrichtigung).

create or replace function public.reward_pending_referral(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid;
  v_rewarded boolean;
begin
  select referred_by, referral_rewarded into v_ref, v_rewarded
    from public.profiles where id = p_user;
  if v_ref is null or coalesce(v_rewarded, false) = true then
    return jsonb_build_object('ok', true, 'rewarded', false);
  end if;

  perform public.add_coins(v_ref, 100, 'referral', p_user);
  perform public.add_coins(p_user, 100, 'referral_welcome', v_ref);
  update public.profiles set referral_rewarded = true where id = p_user;

  -- Werber: In-App-Benachrichtigung (erscheint im Benachrichtigungen-Feed)
  begin
    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (v_ref, 'referral', 'Freund geworben! 🎉',
            'Dein Freund ist jetzt bei UniGoat dabei — du hast 100 G-Coins bekommen! 🐐',
            '/profile.html', false);
  exception when others then null; end;

  -- Werber: Push (best-effort, darf den Reward nie blockieren)
  begin
    perform public.notify_user_push(
      v_ref, 'referral', 'Freund geworben! 🎉',
      'Dein Freund ist dabei — du hast 100 G-Coins bekommen! 🐐',
      jsonb_build_object('url', '/profile.html'));
  exception when others then null; end;

  -- Neuer Freund: Willkommensbonus-Hinweis (In-App)
  begin
    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (p_user, 'referral', 'Willkommensbonus! 🎁',
            'Du bist über eine Einladung dabei — 100 G-Coins sind dir gutgeschrieben.',
            '/challenge.html', false);
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'rewarded', true);
end;
$$;

revoke all on function public.reward_pending_referral(uuid) from public, authenticated;
grant execute on function public.reward_pending_referral(uuid) to service_role;
