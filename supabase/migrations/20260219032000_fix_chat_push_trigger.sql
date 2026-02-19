-- Fix the trigger function to use hardcoded anon key for edge function call
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
    sender_name TEXT;
    msg_preview TEXT;
    receiver_token TEXT;
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
        concat('Neue Nachricht von ', sender_name),
        msg_preview,
        'nachrichten.html',
        false
    );

    -- Send push notification via Edge Function (non-blocking, async via pg_net)
    IF receiver_token IS NOT NULL THEN
        PERFORM net.http_post(
            url := 'https://tvnvmogaqmduzcycmvby.supabase.co/functions/v1/send-push',
            headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bnZtb2dhcW1kdXpjeWNtdmJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTA4MTksImV4cCI6MjA3MDUyNjgxOX0.MuLv9AdclVVZYZpUFv6Bc2Jn1Z9cmmcarHwBHlHkvZw"}'::jsonb,
            body := jsonb_build_object(
                'userId', NEW.receiver_id::text,
                'title', concat('Neue Nachricht von ', sender_name),
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
