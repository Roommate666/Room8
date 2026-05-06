#!/usr/bin/env bash
# Room8 Smoke-Tests
# Laeuft nach jedem Deploy. Prueft die wichtigsten Live-Patterns mit curl + grep.
# Bricht beim ersten Fehler ab.
#
# Aufruf: bash tests/smoke.sh

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE="https://www.room8.club"
PASS=0
FAIL=0

check() {
    local name="$1"
    local url="$2"
    local pattern="$3"
    local content
    content=$(curl -s "$url" 2>/dev/null || echo "")
    if echo "$content" | grep -qE "$pattern"; then
        echo -e "${GREEN}OK${NC}   $name"
        PASS=$((PASS+1))
    else
        echo -e "${RED}FAIL${NC} $name"
        echo -e "      url: $url"
        echo -e "      pattern: $pattern"
        FAIL=$((FAIL+1))
    fi
}

http_check() {
    local name="$1"
    local url="$2"
    local expected="$3"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    if [ "$code" = "$expected" ]; then
        echo -e "${GREEN}OK${NC}   $name (HTTP $code)"
        PASS=$((PASS+1))
    else
        echo -e "${RED}FAIL${NC} $name (HTTP $code, expected $expected)"
        FAIL=$((FAIL+1))
    fi
}

echo "========================================"
echo "Room8 Smoke-Tests"
echo "========================================"

# 1. Critical Pages erreichbar
http_check "index.html"           "$BASE/"                  "200"
http_check "dashboard.html"       "$BASE/dashboard.html"    "200"
http_check "events.html"          "$BASE/events.html"       "200"
http_check "event-create.html"    "$BASE/event-create.html" "200"
http_check "event-detail.html"    "$BASE/event-detail.html" "200"
http_check "wohnungen.html"       "$BASE/wohnungen.html"    "200"
http_check "gegenstaende.html"    "$BASE/gegenstaende.html" "200"
http_check "nachrichten.html"     "$BASE/nachrichten.html"  "200"
http_check "admin.html"           "$BASE/admin.html"        "200"
http_check "intro.mp4"            "$BASE/intro.mp4"         "200"
http_check "sw.js"                "$BASE/sw.js"             "200"

# 2. Pflicht-Patterns (Regression-Detection)
check "events.html: Plus-Icon im Header"            "$BASE/events.html"       "headerCreateBtn"
check "events.html: i18n-Key ist events_title"      "$BASE/events.html"       "data-i18n=\"events_title\""
check "event-detail.html: sanitizeUrl-Pattern"      "$BASE/event-detail.html" "sanitizeUrl"
check "event-create.html: SVG-Block"                "$BASE/event-create.html" "image/jpeg.*image/png.*image/webp.*image/gif"
check "event-create.html: End-Datum-Check"          "$BASE/event-create.html" "Endzeit muss nach Startzeit"
check "event-create.html: Antrag-RPC"               "$BASE/event-create.html" "request_event_creator_permission"
check "events.html: Plus initial display:none"      "$BASE/events.html"       'id="headerCreateBtn".*display:none'
check "nachrichten.html: ROTER Verify-Button"       "$BASE/nachrichten.html"  "linear-gradient.135deg, ?#EF4444"
check "chat.html: ROTER Verify-Button"              "$BASE/chat.html"         "linear-gradient.135deg, ?#EF4444"
check "room8-utils.js: compressImage"               "$BASE/room8-utils.js"    "function compressImage"
check "room8-utils.js: getOptimizedImageUrl"        "$BASE/room8-utils.js"    "function getOptimizedImageUrl"
check "sw.js: IMAGE_CACHE"                          "$BASE/sw.js"             "IMAGE_CACHE"
check "navigation.js: events nav-tab"               "$BASE/navigation.js"     "active-events"
check "admin.html: Antraege-Tab"                    "$BASE/admin.html"        "tab-eventrequests"
check "admin.html: Events-Tab"                      "$BASE/admin.html"        "tab-events"
check "admin.html: toggleEventCreator"              "$BASE/admin.html"        "toggleEventCreator"
check "admin.html: Push-Health Tab"                 "$BASE/admin.html"        "tab-pushhealth"
check "admin.html: loadPushHealth Fn"               "$BASE/admin.html"        "window.loadPushHealth"
check "admin.html: get_notification_health RPC"     "$BASE/admin.html"        "get_notification_health"

# 3. Sentry-Integration (Error Monitoring)
http_check "sentry-init.js erreichbar"              "$BASE/sentry-init.js"    "200"
check "sentry-init.js: Loader-URL"                  "$BASE/sentry-init.js"    "js-de.sentry-cdn.com"
check "sentry-init.js: PII-Filter beforeSend"       "$BASE/sentry-init.js"    "beforeSend"
check "index.html: Sentry-Tag im head"              "$BASE/index.html"        "sentry-init.js"
check "admin.html: Sentry-Tag im head"              "$BASE/admin.html"        "sentry-init.js"
check "events.html: Sentry-Tag im head"             "$BASE/events.html"       "sentry-init.js"

# 4. Notification-Routing (notification_settings Toggles)
check "settings: new_event_city Toggle"             "$BASE/notification-settings.html"  "new_event_city"
check "settings: new_job_city Toggle"               "$BASE/notification-settings.html"  "new_job_city"
check "settings: new_coupon_city Toggle"            "$BASE/notification-settings.html"  "new_coupon_city"
check "settings: chat_message Toggle"               "$BASE/notification-settings.html"  "chat_message"
check "settings: saved_search_match Toggle"         "$BASE/notification-settings.html"  "saved_search_match"
check "settings: Quiet Hours Toggle"                "$BASE/notification-settings.html"  "quiet_hours_enabled"
check "settings: Quiet Hours Start Time"            "$BASE/notification-settings.html"  "quiet_hours_start"
check "settings: Quiet Hours End Time"              "$BASE/notification-settings.html"  "quiet_hours_end"

# 5. Admin Push-Health Erweiterungen
check "admin: pushHealthSkips Container"            "$BASE/admin.html"        "pushHealthSkips"
check "admin: get_skip_stats RPC"                   "$BASE/admin.html"        "get_skip_stats"
check "admin: get_token_cleanup_count RPC"          "$BASE/admin.html"        "get_token_cleanup_count"
check "admin: skipReasonLabels"                     "$BASE/admin.html"        "skipReasonLabels"
check "index.html: splashOverlay"                   "$BASE/index.html"        "splashOverlay"

# 6. Coupon-Redemption-System (Phase 1-4)
http_check "partner-scan.html"                      "$BASE/partner-scan.html" "200"
check "partner-scan: html5-qrcode lib geladen"      "$BASE/partner-scan.html" "html5-qrcode"
check "partner-scan: redeem_coupon RPC"             "$BASE/partner-scan.html" "redeem_coupon"
check "partner-scan: QR-Regex"                      "$BASE/partner-scan.html" "room8:redeem"
check "partner-scan: NOT_PARTNER Mapping"           "$BASE/partner-scan.html" "NOT_PARTNER"
check "coupon-detail: openRedeemQR Funktion"        "$BASE/coupon-detail.html" "openRedeemQR"
check "coupon-detail: QRCode lib"                   "$BASE/coupon-detail.html" "qrcode.min.js"
check "coupon-detail: usage_limit_per_user check"   "$BASE/coupon-detail.html" "usage_limit_per_user"
check "partner-dashboard: scanBanner CTA"           "$BASE/partner-dashboard.html" "scanBanner"
check "partner-dashboard: v_partner_redemptions"    "$BASE/partner-dashboard.html" "v_partner_redemptions_today"
check "partner-dashboard: pd-item-scan Link"        "$BASE/partner-dashboard.html" "pd-item-scan"

# 7. i18n-Cleanup Coupon/Scan-Strings (translations.js + data-i18n Keys)
check "coupon-detail: translations.js geladen"      "$BASE/coupon-detail.html" "translations.js"
check "coupon-detail: data-i18n=coupon_redeem_btn"  "$BASE/coupon-detail.html" "data-i18n=\"coupon_redeem_btn\""
check "coupon-detail: data-i18n=coupon_modal_title" "$BASE/coupon-detail.html" "data-i18n=\"coupon_modal_title\""
check "partner-scan: translations.js geladen"       "$BASE/partner-scan.html" "translations.js"
check "partner-scan: data-i18n=scan_page_title"     "$BASE/partner-scan.html" "data-i18n=\"scan_page_title\""
check "partner-scan: ti() helper definiert"         "$BASE/partner-scan.html" "function ti\\("
check "partner-dashboard: translations.js geladen"  "$BASE/partner-dashboard.html" "translations.js"
check "partner-dashboard: data-i18n=pd_action_scan" "$BASE/partner-dashboard.html" "data-i18n=\"pd_action_scan\""

echo ""
echo "========================================"
echo "Ergebnis: $PASS bestanden, $FAIL fehlgeschlagen"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}REGRESSION DETECTED${NC}"
    exit 1
fi

echo -e "${GREEN}Alle Smoke-Tests bestanden${NC}"
