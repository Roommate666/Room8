@echo off
echo ==========================================
echo   ERZWUNGENE BEREINIGUNG (KILL PROCESSES)
echo ==========================================

echo 1. Beende alle Java/Gradle Prozesse hart...
taskkill /F /IM java.exe >nul 2>&1
taskkill /F /IM javaw.exe >nul 2>&1
taskkill /F /IM gradle-daemon.exe >nul 2>&1
taskkill /F /IM adb.exe >nul 2>&1
taskkill /F /IM studio64.exe >nul 2>&1

echo.
echo 2. Warte auf Freigabe...
timeout /t 3 /nobreak >nul

echo.
echo 3. Versuche blockierte Ordner zu loeschen...
if exist "android\app\build" (
    rmdir /s /q "android\app\build"
    echo - android/app/build geloescht
)
if exist "android\.gradle" (
    rmdir /s /q "android\.gradle"
    echo - android/.gradle geloescht
)

rem Speziell fuer den Capacitor Push Fehler:
if exist "node_modules\@capacitor\push-notifications\android\build" (
    rmdir /s /q "node_modules\@capacitor\push-notifications\android\build"
    echo - Capacitor Push Build Ordner geloescht
)

echo.
echo 4. Synchronisiere neu...
call npx cap sync

echo.
echo ==========================================
echo   FERTIG. Du kannst Android Studio jetzt wieder oeffnen.
echo ==========================================
pause
