@echo off
SETLOCAL EnableDelayedExpansion
TITLE DMP41 Server Manager

:: Default port
SET "PORT=3000"

:: Try to find PORT in .env
if exist .env (
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        if "%%a"=="PORT" SET "PORT=%%b"
    )
)

:menu
cls
echo ==========================================
echo       DMP41 Server Control Panel
echo ==========================================
echo Configured Port: %PORT%
echo ------------------------------------------
echo 1. Start Server (opens in new window)
echo 2. Stop Server (kills process on port %PORT%)
echo 3. Restart Server
echo 4. Install/Update Dependencies
echo 5. Exit
echo ==========================================
set /p choice="Select an option (1-5): "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto restart
if "%choice%"=="4" goto install
if "%choice%"=="5" goto exit

goto menu

:start
echo.
if not exist node_modules (
    echo [!] node_modules not found. Running npm install first...
    call npm install
)
echo Starting DMP41 server on port %PORT%...
start "DMP41_Server_Process" cmd /k "node server.js"
echo Server launched in a new window.
timeout /t 2 >nul
goto menu

:stop
echo.
echo Stopping server listening on port %PORT%...
set "killed="
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo Killing PID %%a...
    taskkill /F /PID %%a
    set "killed=1"
)
if not defined killed echo No server found running on port %PORT%.
pause
goto menu

:restart
echo.
echo Stopping server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo Waiting for port to free up...
timeout /t 2 >nul
echo Starting server...
start "DMP41_Server_Process" cmd /k "node server.js"
echo Server restarted.
pause
goto menu

:install
echo.
echo Installing dependencies...
call npm install
echo Done.
pause
goto menu

:exit
exit
