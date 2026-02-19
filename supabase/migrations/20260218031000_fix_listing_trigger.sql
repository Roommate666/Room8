-- Fix: search_record.type -> search_record.search_type
-- The saved_searches table has column "search_type", not "type"
CREATE OR REPLACE FUNCTION public.match_saved_searches()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE
      search_record RECORD;
      listing_type TEXT;
      listing_price INTEGER;
      match_found BOOLEAN;
  BEGIN
      IF NEW.type IN ('wohnung', 'wg_room', 'entire_apartment', 'studio', 'housing') THEN
          listing_type := 'wohnung';
      ELSE
          listing_type := 'gegenstand';
      END IF;

      IF listing_type = 'wohnung' THEN
          listing_price := COALESCE(NEW.monthly_rent, NEW.price, 0);
      ELSE
          listing_price := COALESCE(NEW.price, 0);
      END IF;

      FOR search_record IN
          SELECT * FROM saved_searches WHERE is_active = true AND user_id != NEW.owner_id
      LOOP
          match_found := true;

          -- FIX: search_record.search_type instead of search_record.type
          IF search_record.search_type != listing_type THEN
              match_found := false;
          END IF;

          IF match_found AND search_record.city IS NOT NULL THEN
              IF LOWER(COALESCE(NEW.city, '')) NOT LIKE '%' || LOWER(search_record.city) || '%' THEN
                  match_found := false;
              END IF;
          END IF;

          IF match_found AND search_record.min_price IS NOT NULL AND listing_price < search_record.min_price THEN
              match_found := false;
          END IF;

          IF match_found AND search_record.max_price IS NOT NULL AND listing_price > search_record.max_price THEN
              match_found := false;
          END IF;

          IF match_found AND listing_type = 'gegenstand' AND search_record.category IS NOT NULL THEN
              IF COALESCE(NEW.category, '') != search_record.category THEN
                  match_found := false;
              END IF;
          END IF;

          IF match_found AND search_record.search_query IS NOT NULL AND search_record.search_query != '' THEN
              IF LOWER(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.description, ''))
                 NOT LIKE '%' || LOWER(search_record.search_query) || '%' THEN
                  match_found := false;
              END IF;
          END IF;

          IF match_found THEN
              INSERT INTO notifications (user_id, type, title, message, link, reference_id)
              VALUES (
                  search_record.user_id, 'search_match',
                  CASE WHEN listing_type = 'wohnung' THEN '🏠 Neue Wohnung gefunden!' ELSE '📦 Neuer Artikel gefunden!' END,
                  'Passt zu deiner Suche: ' || COALESCE(NEW.title, 'Ohne Titel'),
                  CASE WHEN listing_type = 'wohnung' THEN 'detail.html?id=' || NEW.id ELSE 'gegenstand.html?id=' || NEW.id END,
                  NEW.id
              );
          END IF;
      END LOOP;
      RETURN NEW;
  END;
$function$;

-- Also clean up debug function
DROP FUNCTION IF EXISTS public.debug_listing_triggers();
