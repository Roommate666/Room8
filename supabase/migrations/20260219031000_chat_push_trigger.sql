-- Enable pg_net extension for HTTP calls from PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function that sends push notification + creates notification on new message
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
    sender_name TEXT;
    msg_preview TEXT;
    receiver_token TEXT;
    service_role_key TEXT;
    supabase_url TEXT;
BEGIN
    -- Get sender name
    SELECT COALESCE(full_name, username, 'Jemand') INTO sender_name
    FROM profiles WHERE id = NEW.sender_id;

    -- Get receiver FCM token
    SELECT fcm_token INTO receiver_token
    FROM profiles WHERE id = NEW.receiver_id;

    -- Message preview (max 50 chars)
    msg_preview := LEFT(COALESCE(NEW.content, ''), 50);
    IF LENGTH(COALESCE(NEW.content, '')) > 50 THEN
        msg_preview := msg_preview || '...';
    END IF;

    -- Create notification in notifications table
    INSERT INTO notifications (user_id, type, title, message, link, is_read)
    VALUES (
        NEW.receiver_id,
        'chat_message',
        '💬 Neue Nachricht von ' || sender_name,
        msg_preview,
        'nachrichten.html',
        false
    );

    -- Send push notification via Edge Function (non-blocking)
    IF receiver_token IS NOT NULL THEN
        supabase_url := current_setting('app.settings.supabase_url', true);
        service_role_key := current_setting('app.settings.service_role_key', true);

        -- Use pg_net to call the edge function asynchronously
        PERFORM net.http_post(
            url := COALESCE(supabase_url, 'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-push',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || COALESCE(service_role_key, current_setting('request.jwt.claim.sub', true))
            ),
            body := jsonb_build_object(
                'userId', NEW.receiver_id,
                'title', '💬 Neue Nachricht von ' || sender_name,
                'body', msg_preview,
                'data', jsonb_build_object('url', 'nachrichten.html')
            )
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Don't block message insert if notification fails
    RAISE WARNING 'notify_new_message failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on messages table
DROP TRIGGER IF EXISTS on_new_message ON messages;
CREATE TRIGGER on_new_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_message();
