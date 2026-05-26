@echo off
:: ENSURE WORK DIR IS CORRECT
cd /d "%~dp0"
title DMP41 Server Manager

:: --- CRASH PROTECTION ---
:: If you see this, the script made it past the initial load.
echo [1/4] Initializing DMP41 System...

:: --- CHECK NODE.JS ---
echo [2/4] Verifying Node.js...
node -v >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto NO_NODE

:: --- CHECK PYTHON ---
echo [3/4] Verifying Python...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto NO_PYTHON

:: --- SYNC DEPENDENCIES ---
echo [4/4] Syncing Libraries...
if not exist node_modules (
    echo Installing required Node packages...
    call npm install
)

:: Check python packages
python -c "import xlrd, xlwt, xlutils" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing required Python packages...
    pip install xlutils xlrd==1.2.0 xlwt
)

:: --- START SERVER ---
:START_SERVER
cls
echo ==========================================
echo       DMP41 Calibration System
echo ==========================================
echo Local URL: http://localhost:3000
echo ------------------------------------------
echo [HINT] To stop the server, press Ctrl+C
echo.

:: Kill existing process on 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: RUN SERVER
node server.js

echo.
echo ------------------------------------------
echo Server has stopped.
echo ------------------------------------------
echo 1. Restart
echo 2. Exit
set /p opt="Choice (1 or 2): "
if "%opt%"=="1" goto START_SERVER
exit /b

:: --- ERROR HANDLERS ---

:NO_NODE
echo.
echo [!] ERROR: Node.js is not found on your system.
echo Attempting automated installation via winget...
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Node.js installed.
    echo Please CLOSE this window and run manage_server.bat again.
    pause
    exit /b
)
echo.
echo [FAILED] Automated installation failed.
echo Please download Node.js manually from: https://nodejs.org/
start https://nodejs.org/
pause
exit /b

:NO_PYTHON
echo.
echo [!] ERROR: Python is not found on your system.
echo Attempting automated installation via winget...
winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Python installed.
    echo Please CLOSE this window and run manage_server.bat again.
    pause
    exit /b
)
echo.
echo [FAILED] Automated installation failed.
echo Please download Python manually from: https://www.python.org/
start https://www.python.org/
pause
exit /b
