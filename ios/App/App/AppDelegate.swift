import UIKit
import Capacitor
import Firebase
import FirebaseMessaging
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Firebase init - liest GoogleService-Info.plist aus dem Bundle
        FirebaseApp.configure()

        // FCM Messaging Delegate setzen, damit didReceiveRegistrationToken
        // unten gefeuert wird.
        Messaging.messaging().delegate = self

        // UN UserNotificationCenter delegate fuer Foreground-Push
        UNUserNotificationCenter.current().delegate = self

        return true
    }

    // APNs Token vom System bekommen → an FCM weitergeben.
    // Capacitor PushNotifications plugin handhabt die Permission-Anfrage,
    // aber wir muessen den raw APNs-Token in Firebase Messaging einkippen
    // damit der FCM-Token-Mapping-Layer aktiv wird.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // 1. Firebase Messaging APNs-Token zuweisen (fuer FCM-Token-Mapping)
        Messaging.messaging().apnsToken = deviceToken
        // 2. Capacitor PushNotifications-Plugin benachrichtigen damit JS 'registration' Event feuert
        // ABER: wir geben dem Plugin eine LEERE Data weil der "richtige" Token der FCM-Token ist (siehe unten)
        // Es ist OK den APNs-Token zu posten - der wird in JS eh ueberschrieben sobald FCM-Token kommt.
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )

        // 3. FCM-Token aktiv abfragen (bei FirebaseAppDelegateProxyEnabled=false noetig)
        Messaging.messaging().token { [weak self] token, error in
            if let error = error {
                NSLog("Push: FCM token() error: %@", error.localizedDescription)
                return
            }
            guard let self = self, let token = token, !token.isEmpty else {
                NSLog("Push: FCM token() empty")
                return
            }
            NSLog("Push: FCM Token (active fetch): %@", token)
            DispatchQueue.main.async {
                guard let webView = self.findWebView() else { return }
                let escaped = token
                    .replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "'", with: "\\'")
                let js = "window.dispatchEvent(new CustomEvent('fcmToken', { detail: '\(escaped)' }))"
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NSLog("Push: APNs Registration failed: %@", error.localizedDescription)
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

    // MessagingDelegate: FCM-Token-Listener
    // Wird aufgerufen sobald Firebase einen FCM-Token bekommt oder rotiert.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken, !token.isEmpty else {
            NSLog("Push: FCM Token empty/nil")
            return
        }
        NSLog("Push: FCM Token erhalten: %@", token)

        // Custom Event "fcmToken" an die WebView feuern.
        // push-logic.js horcht via window.addEventListener('fcmToken', ...)
        DispatchQueue.main.async {
            guard let webView = self.findWebView() else {
                NSLog("Push: keine WebView gefunden zum Token-Pushen")
                return
            }
            // Token escapen fuer JS-String
            let escaped = token
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            let js = "window.dispatchEvent(new CustomEvent('fcmToken', { detail: '\(escaped)' }))"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    // Such die Capacitor WebView aus dem View-Hierarchy
    private func findWebView() -> WKWebView? {
        guard let rootVC = self.window?.rootViewController else { return nil }
        return findWebViewIn(rootVC)
    }

    private func findWebViewIn(_ vc: UIViewController) -> WKWebView? {
        if let bridgeVC = vc as? CAPBridgeViewController, let wv = bridgeVC.bridge?.webView {
            return wv
        }
        for child in vc.children {
            if let wv = findWebViewIn(child) { return wv }
        }
        return nil
    }

    // Foreground-Push: zeigen statt schlucken
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge, .list])
    }

    // ============== Capacitor / App-Lifecycle (unveraendert) ==============

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}

