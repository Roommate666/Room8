@echo off
echo === Room8 Setup Script ===
echo.

echo Erstelle www Ordner...
mkdir www 2>nul

echo Kopiere alle Dateien in www...
xcopy *.html www\ /Y >nul 2>&1
xcopy *.css www\ /Y >nul 2>&1
xcopy *.js www\ /Y >nul 2>&1
xcopy *.png www\ /Y >nul 2>&1
xcopy *.jpg www\ /Y >nul 2>&1
xcopy *.json www\ /Y >nul 2>&1

echo.
echo === FERTIG! ===
echo.
echo Jetzt fuehre aus: npx cap add android
pause
