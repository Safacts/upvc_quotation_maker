@echo off
setlocal

:: Get current timestamp for folder name (YYYY-MM-DD_HH-MM-SS)
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set stamp=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%_%datetime:~8,2%-%datetime:~10,2%-%datetime:~12,2%

echo Running Supabase Backup at %stamp%...

:: Path to the backup script
set SCRIPT_DIR=%TEMP%\opencode
set SCRIPT_FILE=%SCRIPT_DIR%\full_backup.js

:: Ensure the script exists
if not exist "%SCRIPT_FILE%" (
    echo [ERROR] Backup script not found at %SCRIPT_FILE%
    exit /b 1
)

:: Run the Node.js backup script
cd /d "%SCRIPT_DIR%"
node full_backup.js

:: Define source (the temp output) and destination (permanent storage)
set TEMP_OUT_DIR=%SCRIPT_DIR%\db-backups-full
set PERM_OUT_DIR=C:\Users\aadi\supabase-backups

echo Moving backups from %TEMP_OUT_DIR% to %PERM_OUT_DIR%...
if not exist "%PERM_OUT_DIR%" mkdir "%PERM_OUT_DIR%"

:: Move all folders from temp output to permanent output
for /d %%D in ("%TEMP_OUT_DIR%\*") do (
    move "%%D" "%PERM_OUT_DIR%\"
)

echo Backup completed successfully and moved to %PERM_OUT_DIR%.
endlocal
