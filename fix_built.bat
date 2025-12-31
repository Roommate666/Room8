@echo off
echo ==========================================
echo   ROOM8 BUILD REPARATUR
echo ==========================================

echo.
echo 1. Beende Java, Gradle und Android Studio gewaltsam...
taskkill /F /IM java.exe >nul 2>&1
taskkill /F /IM javaw.exe >nul 2>&1
taskkill /F /IM gradle-daemon.exe >nul 2>&1
taskkill /F /IM studio64.exe >nul 2>&1
taskkill /F /IM adb.exe >nul 2>&1

echo.
echo 2. Warte kurz, bis Windows die Dateien freigibt...
timeout /t 3 /nobreak >nul

echo.
echo 3. Loesche den blockierten Build-Ordner...
if exist "android\app\build" (
    rmdir /s /q "android\app\build"
    if exist "android\app\build" (
        echo FEHLER: OneDrive blockiert die Datei immer noch!
        echo BITTE PAUSIERE ONEDRIVE (Rechtsklick auf die Wolke im Tray -> Synchronisierung anhalten).
        pause
        exit /b
    )
)
echo Build-Ordner erfolgreich bereinigt.

echo.
echo 4. Synchronisiere neu...
call npx cap sync

echo.
echo ==========================================
echo   FERTIG! Android Studio startet gleich...
echo ==========================================
call npx cap open android
pause