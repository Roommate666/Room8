#!/bin/bash
# /test command — End-to-End Push-Test
# Erstellt 2 verifizierte Test-User in Augsburg, triggert alle Push-Typen,
# verifiziert Status, cleanup nach Bestaetigung.
#
# Voraussetzung: Yusufs aktueller fcm_token muss in profiles.fcm_token stehen
# (sonst kommen Pushes nicht aufs iPhone). Wird via REAL_USER_ID dynamisch geholt.
#
# Usage:
#   ./tools/test-push.sh                      # full run
#   ./tools/test-push.sh cleanup              # nur cleanup von Test-Daten

set -e
# Service-Role-Key MUSS aus ENV kommen — niemals hardcoden, Repo ist public.
# Holen via: export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase projects api-keys --project-ref tvnvmogaqmduzcycmvby | awk '/service_role/{print $3}')
SR="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY env var not set — siehe Kommentar oben}"
URL="${SUPABASE_URL:-https://tvnvmogaqmduzcycmvby.supabase.co}"

# REAL_USER_ID = der User auf dessen iPhone die Pushes ankommen sollen
# Default: yusuf.paypal.albayrak (id 900b8392). Override mit ENV.
REAL_USER_ID="${REAL_USER_ID:-900b8392-8334-4fcb-969e-fc2c289996a5}"

# ----- Helpers -----
api() {
    curl -s -X "$1" "$URL$2" \
        -H "apikey: $SR" -H "Authorization: Bearer $SR" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation" \
        ${3:+-d "$3"}
}

# ----- Cleanup -----
cleanup() {
    echo "==> Cleanup Test-Daten..."

    # Loesche Test-Daten (Cascade durch FK)
    api DELETE "/rest/v1/listings?is_test=eq.true" >/dev/null
    api DELETE "/rest/v1/events?is_test=eq.true" >/dev/null

    # Test-User loeschen (Auth + Profile cascade)
    local test_uids=$(api GET "/rest/v1/profiles?is_test=eq.true&select=id" | python3 -c "import sys,json; print(' '.join([p['id'] for p in json.load(sys.stdin)]))")
    for uid in $test_uids; do
        api DELETE "/auth/v1/admin/users/$uid" >/dev/null
    done

    echo "==> Cleanup fertig."
}

if [ "$1" = "cleanup" ]; then
    cleanup
    exit 0
fi

# ----- Pre-Check: hat REAL_USER einen FCM-Token? -----
echo "==> Check Real-User Setup..."
TOKEN_CHECK=$(api GET "/rest/v1/profiles?id=eq.$REAL_USER_ID&select=username,city,fcm_token,is_test")
echo "    Real-User: $TOKEN_CHECK" | head -c 200
echo ""

HAS_TOKEN=$(echo "$TOKEN_CHECK" | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d and d[0].get('fcm_token') else '0')")
if [ "$HAS_TOKEN" != "1" ]; then
    echo "[FEHLER] Real-User hat keinen fcm_token. Oeffne die App auf dem iPhone (Dashboard) damit Token registriert wird."
    exit 1
fi

REAL_CITY=$(echo "$TOKEN_CHECK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('city','Augsburg'))")
echo "    Real-User Stadt: $REAL_CITY"

# ----- Cleanup vorher -----
cleanup
echo ""

# ----- 1. Test-User A erstellen (Sender) -----
echo "==> Erstelle Test-User A (Sender)..."
TEST_EMAIL_A="testbot_alpha_$(date +%s)@room8.test"
TEST_USER_A=$(api POST "/auth/v1/admin/users" "{\"email\":\"$TEST_EMAIL_A\",\"password\":\"TestBot2026!\",\"email_confirm\":true,\"user_metadata\":{\"is_test\":true}}")
TEST_UID_A=$(echo "$TEST_USER_A" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "    UID A: $TEST_UID_A"

# Profile fuer A: gleiche Stadt wie REAL_USER, is_test=true
api PATCH "/rest/v1/profiles?id=eq.$TEST_UID_A" \
    "{\"username\":\"testbot_alpha\",\"full_name\":\"TestBot Alpha\",\"city\":\"$REAL_CITY\",\"is_test\":true,\"is_verified\":true,\"is_student_verified\":true,\"can_create_events\":true,\"trusted_organizer\":true}" >/dev/null

# ----- 2. Test-User B erstellen (Empfaenger fuer Test-zu-Test-Push) -----
echo "==> Erstelle Test-User B (Empfaenger)..."
TEST_EMAIL_B="testbot_beta_$(date +%s)@room8.test"
TEST_USER_B=$(api POST "/auth/v1/admin/users" "{\"email\":\"$TEST_EMAIL_B\",\"password\":\"TestBot2026!\",\"email_confirm\":true,\"user_metadata\":{\"is_test\":true}}")
TEST_UID_B=$(echo "$TEST_USER_B" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "    UID B: $TEST_UID_B"

api PATCH "/rest/v1/profiles?id=eq.$TEST_UID_B" \
    "{\"username\":\"testbot_beta\",\"full_name\":\"TestBot Beta\",\"city\":\"$REAL_CITY\",\"is_test\":true,\"is_verified\":true}" >/dev/null

# ----- 3. Test-Inserat von A (loest is_test cascade fuer Inserat) -----
echo ""
echo "==> Test-Inserat erstellen (von A)..."
LISTING_A=$(api POST "/rest/v1/listings" "{\"owner_id\":\"$TEST_UID_A\",\"type\":\"wohnung\",\"title\":\"TEST-WG in $REAL_CITY\",\"city\":\"$REAL_CITY\",\"is_active\":true,\"monthly_rent\":500,\"is_test\":true}")
LISTING_ID=$(echo "$LISTING_A" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) else d.get('id',''))")
echo "    Listing ID: $LISTING_ID"

# ----- 4. Push-Tests (alle Empfaenger = REAL_USER, gesendet von Test-User A) -----
echo ""
echo "==> Sende Pushes an REAL_USER..."

send_to_real() {
    local title="$1"; local body="$2"; local urlpath="$3"
    curl -s -X POST "$URL/functions/v1/send-push" \
        -H "apikey: $SR" -H "Authorization: Bearer $SR" \
        -H "Content-Type: application/json" \
        -d "{\"userId\":\"$REAL_USER_ID\",\"title\":\"$title\",\"body\":\"$body\",\"data\":{\"url\":\"$urlpath\"}}" \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(('  OK ' if d.get('success') else '  FAIL ') + '$title')"
    sleep 2
}

send_to_real "🧪 [Test] Chat" "TestBot Alpha: Hey, ist die WG noch frei?" "chat.html"
send_to_real "🧪 [Test] Bewertung" "TestBot Alpha hat dich bewertet" "profile.html"
send_to_real "🧪 [Test] Favorit" "TestBot Alpha hat dein Inserat gespeichert" "wohnung.html?id=$LISTING_ID"
send_to_real "🧪 [Test] Event-Interesse" "TestBot Alpha hat Interesse an deinem Event" "event-detail.html"
send_to_real "🏠 Neue Wohnung in $REAL_CITY" "Tap um zu pruefen ob Deep-Link richtig oeffnet" "detail.html?id=$LISTING_ID"
send_to_real "💼 Neuer Job in $REAL_CITY" "Werkstudent gesucht" "jobs.html"
send_to_real "🎟️ Neuer Coupon in $REAL_CITY" "20% bei Dominos" "coupons.html"
send_to_real "🎉 Neues Event in $REAL_CITY" "Studentenparty heute Abend" "events.html"
send_to_real "🔍 Suchauftrag-Match" "1 neue WG passt zu deiner Suche" "saved-searches.html"

# ----- 5. Status-Check -----
echo ""
echo "==> Status-Check (letzte 10 Pushes an REAL_USER)..."
sleep 2
api GET "/rest/v1/notification_logs?user_id=eq.$REAL_USER_ID&channel=eq.push&order=created_at.desc&limit=10&select=status,error_code,title" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d[:10]:
    s = r['status']
    icon = '✅' if s == 'success' else '❌'
    print(f'  {icon} {s:10s} {(r.get(\"error_code\") or \"\"):25s} {r.get(\"title\",\"\")}')
"

echo ""
echo "==> Test fertig."
echo ""
echo "Auf iPhone pruefen:"
echo "  1. Sind alle 9 Pushes angekommen?"
echo "  2. Tap einen Push -> oeffnet sich die richtige Seite?"
echo ""
echo "Cleanup mit:  ./tools/test-push.sh cleanup"
