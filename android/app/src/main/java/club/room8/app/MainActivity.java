package club.room8.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BadgePlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        handlePushUrl(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handlePushUrl(intent);
    }

    private void handlePushUrl(Intent intent) {
        if (intent == null) return;
        // Eigener pushUrl-Key (von Room8MessagingService im Vordergrund gesetzt)
        String url = intent.getStringExtra("pushUrl");
        // Fallback: Firebase Data-Key "url" (wenn System die Notification im Hintergrund zeigt)
        if (url == null || url.isEmpty()) {
            url = intent.getStringExtra("url");
        }
        if (url != null && !url.isEmpty()) {
            final String targetUrl = url;
            // Wait for WebView to be ready, then navigate
            new android.os.Handler().postDelayed(() -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "window.location.href = '" + targetUrl.replace("'", "\\'") + "';", null);
                }
            }, 1500);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "room8_default",
                "Room8 Benachrichtigungen",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Benachrichtigungen von Room8");
            channel.enableVibration(true);
            channel.setShowBadge(true);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
