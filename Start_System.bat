@echo off
setlocal EnableDelayedExpansion

:: DEBUG: Keep window open on early crash
echo ===================================================
echo     DMP41 System Launcher - INITIALIZING...
echo ===================================================

:: Set working directory
cd /d "%~dp0"
title DMP41 Unified Management Console

:: Create logs directory
if not exist "logs" mkdir "logs"

:: Use fixed filenames for logs to avoid fragile date/time parsing
set "STARTUP_LOG=logs\startup.log"
set "NODE_LOG=logs\node.log"

echo Launcher Started > "%STARTUP_LOG%"

:MENU
cls
echo ===================================================
echo     DMP41 Hybrid System - Management Console
echo ===================================================
echo.
echo  [1] Start System
echo  [2] Restart System
echo  [3] Stop System
echo  [4] Update Dependencies
echo  [5] Exit
echo.
echo ===================================================
set /p choice="Select an option (1-5): "

if "%choice%"=="1" goto START_SYSTEM
if "%choice%"=="2" goto RESTART_SYSTEM
if "!choice!"=="3" goto STOP_SYSTEM
if "!choice!"=="4" goto UPDATE_DEPS
if "!choice!"=="5" exit /b
goto MENU

:: ---------------------------------------------------------
:: START SYSTEM
:: ---------------------------------------------------------
:START_SYSTEM
echo.
echo [1/4] Checking Node.js and Python...

:: Check Node.js
node -v >nul 2>&1
if !errorlevel! neq 0 (
    echo [INFO] Node.js not found. Installing via winget...
    winget install -e --id OpenJS.NodeJS --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install Node.js automatically. Please install it manually.
        pause
        goto MENU
    )
    echo [SUCCESS] Node.js installed. Please restart this console to apply PATH changes.
    pause
    exit /b
)

:: Check Python
set "PYTHON_CMD="
python --version >nul 2>&1 && set "PYTHON_CMD=python"
py --version >nul 2>&1 && set "PYTHON_CMD=py"

if "!PYTHON_CMD!"=="" (
    echo [INFO] Python not found. Installing via winget...
    winget install -e --id Python.Python.3.11 --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install Python automatically. Please install it manually.
        pause
        goto MENU
    )
    echo [SUCCESS] Python installed. Please restart this console to apply PATH changes.
    pause
    exit /b
)

:: Check dependencies
if not exist "node_modules" (
    echo [INFO] Installing Node modules...
    call npm install --silent
)

:: Check xlwings
!PYTHON_CMD! -c "import xlwings" >nul 2>&1
if !errorlevel! neq 0 (
    echo [INFO] Installing xlwings...
    !PYTHON_CMD! -m pip install xlwings --quiet
)

echo [2/4] Cleaning up existing processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM excel.exe >nul 2>&1

:: Kill port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [3/4] Starting Calibration Engine...
:: Clear node log and start background
echo Server Starting... > "%NODE_LOG%"
start /B "DMP41_Node" cmd /c "node server.js >> %NODE_LOG% 2>&1"

echo [4/4] Waiting for server...
set "RETRY=0"

:HEALTH_CHECK
set /a RETRY+=1
if !RETRY! gtr 20 (
    echo.
    echo [ERROR] Startup timeout. Displaying recent logs from node.log:
    echo ---------------------------------------------------
    type "%NODE_LOG%"
    echo ---------------------------------------------------
    pause
    goto MENU
)

:: Simple ping check using PowerShell (more universal than curl)
powershell -Command "$c = (Invoke-WebRequest -Uri 'http://localhost:3000/api/hardware/status' -UseBasicParsing -ErrorAction SilentlyContinue); if($c.StatusCode -eq 200){exit 0}else{exit 1}" >nul 2>&1
if !errorlevel! equ 0 (
    echo.
    echo [SUCCESS] Online!
    start "" "http://localhost:3000/auth"
    timeout /t 2 /nobreak >nul
    goto MENU
) else (
    <nul set /p=.
    timeout /t 1 /nobreak >nul
    goto HEALTH_CHECK
)

:: ---------------------------------------------------------
:: STOP SYSTEM
:: ---------------------------------------------------------
:STOP_SYSTEM
echo Stopping System...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM excel.exe >nul 2>&1
echo Done.
pause
goto MENU

:: ---------------------------------------------------------
:: RESTART SYSTEM
:: ---------------------------------------------------------
:RESTART_SYSTEM
echo Restarting System...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM excel.exe >nul 2>&1
timeout /t 2 /nobreak >nul
goto START_SYSTEM

:: ---------------------------------------------------------
:: UPDATE DEPENDENCIES
:: ---------------------------------------------------------
:UPDATE_DEPS
echo Updating Node...
call npm install
echo Updating Python...
if not "!PYTHON_CMD!"=="" !PYTHON_CMD! -m pip install --upgrade xlwings
echo Done.
pause
goto MENU
