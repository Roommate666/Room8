package club.room8.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.res.ResourcesCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import me.leolin.shortcutbadger.ShortcutBadger;
import android.app.ActivityManager;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;

public class Room8MessagingService extends FirebaseMessagingService {

    private static final String TAG = "Room8FCM";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "onMessageReceived called! Data size: " + remoteMessage.getData().size()
            + ", hasNotification: " + (remoteMessage.getNotification() != null));

        // Wenn Notification+Data Payload UND App im Hintergrund:
        // System zeigt Notification automatisch, wir ueberspringen um Dopplung zu vermeiden
        if (remoteMessage.getNotification() != null && !isAppInForeground()) {
            Log.d(TAG, "Background + notification payload -> System handles it, skipping");
            return;
        }

        String title = null;
        String body = null;
        String url = null;
        int badgeCount = -1;

        // Data payload (vom Edge Function)
        if (remoteMessage.getData().size() > 0) {
            title = remoteMessage.getData().get("title");
            body = remoteMessage.getData().get("body");
            url = remoteMessage.getData().get("url");
            String badgeStr = remoteMessage.getData().get("badgeCount");
            if (badgeStr != null) {
                try { badgeCount = Integer.parseInt(badgeStr); } catch (Exception ignored) {}
            }
            Log.d(TAG, "Data message - title: " + title + ", body: " + body + ", badge: " + badgeCount);
        }

        // Fallback: Notification payload (nur im Vordergrund)
        if (title == null && remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle();
            body = remoteMessage.getNotification().getBody();
        }

        if (title != null) {
            Log.d(TAG, "Showing custom notification with Room8 logo");
            showNotification(title, body, url, badgeCount);
        }
    }

    private boolean isAppInForeground() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        List<ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
        if (processes != null) {
            for (ActivityManager.RunningAppProcessInfo process : processes) {
                if (process.processName.equals(getPackageName())) {
                    return process.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
                }
            }
        }
        return false;
    }

    private void showNotification(String title, String body, String url, int badgeCount) {
        createChannel();

        // Room8 Logo als Large Icon (farbig)
        Bitmap largeIcon = loadLargeIcon();
        Log.d(TAG, "Large icon loaded: " + (largeIcon != null ? largeIcon.getWidth() + "x" + largeIcon.getHeight() : "NULL"));

        // Intent wenn Notification geklickt wird
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (url != null) {
            intent.putExtra("pushUrl", url);
        }

        int requestCode = (int) System.currentTimeMillis();
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, "room8_default")
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(largeIcon)
            .setContentTitle(title != null ? title : "Room8")
            .setContentText(body != null ? body : "")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setColor(0xFF6366F1)
            .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_VIBRATE);

        // Badge-Count auf Notification setzen
        if (badgeCount > 0) {
            builder.setNumber(badgeCount);
        }

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            int notifId = requestCode;
            Notification notification = builder.build();

            // MIUI: Badge-Count ueber Notification-Extra setzen
            int count = badgeCount > 0 ? badgeCount : 1;
            try {
                Field extraNotification = notification.getClass().getDeclaredField("extraNotification");
                extraNotification.setAccessible(true);
                Object extra = extraNotification.get(notification);
                Method setMessageCount = extra.getClass().getDeclaredMethod("setMessageCount", int.class);
                setMessageCount.invoke(extra, count);
                Log.d(TAG, "MIUI extraNotification.setMessageCount(" + count + ") OK");
            } catch (Exception e) {
                Log.d(TAG, "MIUI reflection not available: " + e.getMessage());
            }

            manager.notify(notifId, notification);
            Log.d(TAG, "Notification posted with ID: " + notifId);

            // Xiaomi ContentProvider Badge Ansatz
            try {
                Bundle bundle = new Bundle();
                bundle.putString("package", getPackageName());
                bundle.putString("class", getPackageName() + ".MainActivity");
                bundle.putInt("messageCount", count);
                getContentResolver().call(
                    Uri.parse("content://com.android.badge/badge"),
                    "setAppBadgeCount", null, bundle);
                Log.d(TAG, "Xiaomi ContentProvider badge set to " + count);
            } catch (Exception e) {
                Log.d(TAG, "Xiaomi ContentProvider not available: " + e.getMessage());
            }

            // ShortcutBadger als weiterer Fallback
            try {
                ShortcutBadger.applyCount(this, count);
                Log.d(TAG, "ShortcutBadger set to " + count);
            } catch (Exception e) {
                Log.w(TAG, "ShortcutBadger failed: " + e.getMessage());
            }
        }
    }

    private Bitmap loadLargeIcon() {
        try {
            // Versuche zuerst die PNG direkt zu laden (funktioniert auf API < 26)
            Bitmap bmp = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
            if (bmp != null) return bmp;

            // Auf API 26+ ist ic_launcher ein AdaptiveIconDrawable - konvertiere zu Bitmap
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Drawable drawable = ResourcesCompat.getDrawable(getResources(), R.mipmap.ic_launcher, getTheme());
                if (drawable != null) {
                    int size = 192;
                    Bitmap result = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
                    Canvas canvas = new Canvas(result);
                    drawable.setBounds(0, 0, size, size);
                    drawable.draw(canvas);
                    return result;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "loadLargeIcon failed: " + e.getMessage());
        }

        // Fallback: lade foreground direkt als PNG
        try {
            Bitmap fg = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher_foreground);
            if (fg != null) return fg;
        } catch (Exception e) {
            Log.w(TAG, "Foreground fallback failed: " + e.getMessage());
        }

        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "room8_default",
                "Room8 Benachrichtigungen",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Benachrichtigungen von Room8");
            channel.enableVibration(true);
            channel.setShowBadge(true);

            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
