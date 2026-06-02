@echo off
setlocal EnableDelayedExpansion

:: =========================================================================
:: DMP41 - Node.js Calibration Engine
:: =========================================================================

cd /d "%~dp0"
title DMP41 - Node.js Engine

:: 1. Admin Check
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Administrator Privileges REQUIRED.
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%~dp0\" && \"%~f0\"' -Verb RunAs"
    exit /b
)

:: 2. Logging
if not exist "logs" mkdir "logs"
set "NODE_LOG=logs\node_server.log"
echo [%date% %time%] === Node.js Server Startup === > "%NODE_LOG%"

:: 3. Node.js Dependency Check
node -v >nul 2>&1
if !errorlevel! neq 0 (
    echo [INFO] Node.js not found. Installing...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    echo [INFO] Restarting script after installation...
    timeout /t 2 /nobreak >nul
    start "" "%~f0"
    exit /b
)

if not exist "node_modules" (
    echo [INFO] Installing Node modules...
    call npm install --silent
)

:: 4. Python/Excel Bridge Check
set "PYTHON_CMD="
py --version >nul 2>&1
if !errorlevel! equ 0 ( set "PYTHON_CMD=py" ) else (
    python --version >nul 2>&1
    if !errorlevel! equ 0 set "PYTHON_CMD=python"
)

if "!PYTHON_CMD!"=="" (
    echo [INFO] Python not found. Installing...
    winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    timeout /t 2 /nobreak >nul
    start "" "%~f0"
    exit /b
)

!PYTHON_CMD! -c "import xlwings" >nul 2>&1
if !errorlevel! neq 0 (
    echo [INFO] Installing xlwings...
    !PYTHON_CMD! -m pip install xlwings --quiet
)

:: 5. Port Cleanup (3000)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: 6. Start Node.js
echo [SUCCESS] Starting Node.js Calibration Engine...
echo [INFO] Port 3000 will be used.
node server.js
pause