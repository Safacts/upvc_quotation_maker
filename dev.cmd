@echo off
title Vitharn UPVC - Dev Launcher
setlocal

cd /d "%~dp0"

echo ============================================================
echo   Vitharn UPVC Quotation Maker - Local Dev Launcher
echo ============================================================
echo.
echo   Next.js dev server  : http://localhost:3000  (hot reload)
echo   Flutter web dev     : http://127.0.0.1:8080  (hot reload)
echo.
echo   Open the app at:
echo     Landing         : http://localhost:3000
echo     Market (sample) : http://localhost:3000/venkateshwara
echo     Portal          : http://localhost:3000/upvc/venkateshwara
echo     Flutter web     : http://localhost:3000/app
echo     Platform admin  : http://localhost:3000/admin
echo.
echo   Hot reload:
echo     - Next.js  : save any file, page reloads automatically
echo     - Flutter  : press R (hot restart) or r (hot reload)
echo       in the Flutter Web Dev window
echo.
echo   Close both windows (or Ctrl+C each) to stop.
echo ============================================================
echo.

start "Next.js Dev (:3000)" cmd /k "cd /d %~dp0 && npm run dev"
start "Flutter Web Dev (:8080)" cmd /k "cd /d %~dp0 && flutter run -d web-server --web-port 8080 --web-hostname 127.0.0.1"

echo Started. Press any key to close this window (servers keep running).
pause > NUL
