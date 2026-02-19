package club.room8.app;

import android.app.NotificationManager;
import android.content.Context;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import me.leolin.shortcutbadger.ShortcutBadger;

@CapacitorPlugin(name = "Badge")
public class BadgePlugin extends Plugin {

    private static final String TAG = "BadgePlugin";

    @PluginMethod
    public void setBadge(PluginCall call) {
        int count = call.getInt("count", 0);

        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);

        if (count == 0 && nm != null) {
            // Alle Notifications aus der Shade entfernen -> Badge auf 0
            nm.cancelAll();
            Log.d(TAG, "All notifications cancelled, badge should be 0");
        }

        // ShortcutBadger als Fallback versuchen
        try {
            if (count > 0) {
                ShortcutBadger.applyCount(getContext(), count);
            } else {
                ShortcutBadger.removeCount(getContext());
            }
            Log.d(TAG, "ShortcutBadger set to " + count);
        } catch (Exception e) {
            Log.w(TAG, "ShortcutBadger failed: " + e.getMessage());
        }

        call.resolve();
    }

    @PluginMethod
    public void clearBadge(PluginCall call) {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancelAll();
        }
        try {
            ShortcutBadger.removeCount(getContext());
        } catch (Exception e) {
            Log.w(TAG, "ShortcutBadger clear failed: " + e.getMessage());
        }
        Log.d(TAG, "Badge cleared + notifications cancelled");
        call.resolve();
    }
}
