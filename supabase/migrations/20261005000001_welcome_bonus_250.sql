-- Welcome-Bonus auf 250 G-Coins nachgezogen (Datei an Live-Stand angeglichen).
-- Grund: Live-DB gibt seit laengerem 250 (manuell gesetzt), aber Datei 20260818000001
--   stand noch auf 50. Ohne diese Migration wuerde ein DB-Reset den Bonus auf 50
--   zuruecksetzen -> Aufsteller "Neu? +250 G-Coins" waere dann falsch.
-- 1:1-Kopie des verifizierten Live-Funktionskoerpers (05.10.2026). Idempotent (reason='welcome').
-- KEIN Daten-/Schemaeingriff, nur CREATE OR REPLACE der Funktion.
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user is null then return; end if;
  if exists (select 1 from public.coin_transactions where user_id = p_user and reason = 'welcome') then
    return; -- schon vergeben
  end if;
  perform public.add_coins(p_user, 250, 'welcome', null);
  begin
    perform public.notify_user_push(p_user, 'welcome',
      'Willkommen bei UniGoat! 🐐',
      'Du hast +250 G-Coins zum Start bekommen. Spiel, sammel mehr und komm in die Monats-Rangliste!',
      jsonb_build_object('url','/game/'), 'welcome_' || p_user::text);
  exception when others then null; end;
end; $function$;
-- Rechte wie bei der Originalfunktion (nur service_role ruft auf):
revoke all on function public.grant_welcome_bonus(uuid) from public, authenticated;
grant execute on function public.grant_welcome_bonus(uuid) to service_role;
