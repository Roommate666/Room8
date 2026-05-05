package club.room8.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
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
    public void onResume() {
        super.onResume();
        dispatchPendingFcmToken();
    }

    /**
     * Hardware-Back: WebView-History.back() statt App schliessen.
     * Capacitor 7 hat keinen built-in Handler dafuer.
     */
    @Override
    public void onBackPressed() {
        if (getBridge() != null && getBridge().getWebView() != null
                && getBridge().getWebView().canGoBack()) {
            getBridge().getWebView().goBack();
        } else {
            super.onBackPressed();
        }
    }

    /**
     * Falls Room8MessagingService.onNewToken() einen Token gespeichert hat,
     * dispatch ihn an die WebView als 'fcmToken' CustomEvent.
     * Pendant zu iOS AppDelegate dispatch.
     */
    private void dispatchPendingFcmToken() {
        SharedPreferences prefs = getSharedPreferences("room8_push", Context.MODE_PRIVATE);
        String token = prefs.getString("pending_fcm_token", null);
        if (token == null || token.isEmpty()) return;
        new android.os.Handler().postDelayed(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                String escaped = token.replace("\\", "\\\\").replace("'", "\\'");
                String js = "window.dispatchEvent(new CustomEvent('fcmToken', { detail: '" + escaped + "' }))";
                getBridge().getWebView().evaluateJavascript(js, null);
                prefs.edit().remove("pending_fcm_token").apply();
            }
        }, 2000);
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
