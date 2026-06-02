@echo off
setlocal enabledelayedexpansion
:: DMP41 Unified Management Console (v4.0 - GitHub Portable)
:: This script manages the hybrid Node.js + PHP + Python environment.
:: Designed for portability across different devices.

cd /d "%~dp0"
title DMP41 Unified Management Console

:: Check for Administrator Privileges
net session >nul 2>&1
if errorlevel 1 (
    echo ===================================================
    echo NOTICE: Administrator Privileges REQUIRED
    echo ===================================================
    echo This script manages services and XAMPP which need
    echo elevated privileges. Attempting to restart as Admin...
    echo ===================================================
    echo.
    powershell -Command "Start-Process cmd.exe -ArgumentList '/c %0' -Verb RunAs" >nul 2>&1
    exit /b
)

:: Logging Setup
if not exist "logs" mkdir "logs"
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"`) do set "STAMP=%%i"
set "LOG_FILE=logs\system_%STAMP%.log"
set "STARTUP_LOG=logs\startup_%STAMP%.log"

echo [%date% %time%] === System Startup === >> "%STARTUP_LOG%"
echo PROJECT_DIR=%cd% >> "%STARTUP_LOG%"

:: Initialize variables
set "XAMPP_ROOT="
set "XAMPP_FOUND=0"
set "INSTALLATION_FAILED=0"

:: Load .env variables (Robust parser with error handling)
if not exist ".env" (
    echo [%date% %time%] .env not found, checking for .env.example >> "%STARTUP_LOG%"
    if exist ".env.example" (
        echo Creating .env from .env.example...
        copy ".env.example" ".env" >nul 2>&1
        if errorlevel 1 (
            echo [%date% %time%] WARNING: Failed to copy .env.example >> "%STARTUP_LOG%"
        )
    )
)

:: Load environment variables
if exist ".env" (
    echo [%date% %time%] Loading .env file >> "%STARTUP_LOG%"
    for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
        if not "%%a"=="" if not "%%b"=="" (
            set "%%a=%%b"
            echo [%date% %time%] Loaded: %%a >> "%STARTUP_LOG%"
        )
    )
)

:: XAMPP Path Detection - Multi-location search
echo [%date% %time%] Detecting XAMPP installation >> "%STARTUP_LOG%"
if not "!XAMPP_ROOT!"=="" (
    if exist "!XAMPP_ROOT!\htdocs" (
        set "XAMPP_FOUND=1"
        echo [%date% %time%] XAMPP found at !XAMPP_ROOT! >> "%STARTUP_LOG%"
    )
)

if !XAMPP_FOUND! equ 0 (
    for %%D in (C: D: E: F: G: H: I: J: K:) do (
        if exist "%%D\xampp\htdocs" (
            set "XAMPP_ROOT=%%D:\xampp"
            set "XAMPP_FOUND=1"
            echo [%date% %time%] XAMPP found at !XAMPP_ROOT! >> "%STARTUP_LOG%"
            goto XAMPP_FOUND_LABEL
        )
    )
    :XAMPP_FOUND_LABEL
)

:: If still not found, set default and proceed with installation
if !XAMPP_FOUND! equ 0 (
    set "XAMPP_ROOT=C:\xampp"
    echo [%date% %time%] XAMPP not found, will attempt installation >> "%STARTUP_LOG%"
)

:MENU
cls
echo ===================================================
echo     DMP41 Hybrid System - Management Console (v4.0)
echo ===================================================
echo  Project Directory: %cd%
echo  XAMPP Root: !XAMPP_ROOT!
echo ===================================================
echo.
echo  [1] Start System
echo  [2] Restart System
echo  [3] Stop System
echo  [4] Update Dependencies
echo  [5] View Service Status
echo  [6] View System Logs
echo  [7] Exit
echo.
echo ===================================================
set "choice="
set /p choice="Select an option (1-7): "

if "!choice!"=="1" goto START_SYSTEM
if "!choice!"=="2" goto RESTART_SYSTEM
if "!choice!"=="3" goto STOP_SYSTEM
if "!choice!"=="4" goto UPDATE_DEPS
if "!choice!"=="5" goto VIEW_STATUS
if "!choice!"=="6" goto VIEW_LOGS
if "!choice!"=="7" goto EXIT_CMD
goto MENU

:START_SYSTEM
cls
echo [%date% %time%] === START_SYSTEM Called === >> "%STARTUP_LOG%"
echo ===================================================
echo     Starting DMP41 System
echo ===================================================
echo.

:: Phase 1: Verify Prerequisites
echo [1/6] Verifying Prerequisites...
echo [%date% %time%] Phase 1: Verifying Prerequisites >> "%STARTUP_LOG%"

:: Check required folders
if not exist "php-auth-system" (
    echo [%date% %time%] ERROR: php-auth-system folder not found >> "%STARTUP_LOG%"
    echo ERROR: php-auth-system folder not found in project root
    echo Please ensure the project is cloned correctly from GitHub.
    pause
    goto MENU
)

if not exist "public" (
    echo [%date% %time%] ERROR: public folder not found >> "%STARTUP_LOG%"
    echo ERROR: public folder not found in project root
    pause
    goto MENU
)

:: Phase 2: XAMPP Check and Install
echo [2/6] Checking Database and PHP Environment...
echo [%date% %time%] Phase 2: XAMPP Check >> "%STARTUP_LOG%"

IF NOT EXIST "!XAMPP_ROOT!\htdocs" (
    echo       - XAMPP not found.
    echo       - Attempting automated installation...
    echo [%date% %time%] Attempting XAMPP installation via winget >> "%STARTUP_LOG%"
    
    winget install --id ApacheFriends.Xampp.8.2 -e --silent --accept-package-agreements --accept-source-agreements --override "--mode unattended" >> "%LOG_FILE%" 2>&1
    
    if errorlevel 1 (
        echo       - XAMPP installation failed via winget.
        echo       - Please install XAMPP manually from: https://www.apachefriends.org/
        echo       - After installation, rerun this script.
        echo [%date% %time%] XAMPP installation failed >> "%STARTUP_LOG%"
        pause
        goto MENU
    )
    echo       - XAMPP installed successfully.
    echo [%date% %time%] XAMPP installed >> "%STARTUP_LOG%"
) else (
    echo       - XAMPP found: !XAMPP_ROOT!
)

:: Start XAMPP
echo       - Starting Apache and MySQL...
echo [%date% %time%] Starting XAMPP services >> "%STARTUP_LOG%"

if exist "!XAMPP_ROOT!\xampp_start.exe" (
    start /B "" "!XAMPP_ROOT!\xampp_start.exe" > "logs\xampp.log" 2>&1
    timeout /t 3 /nobreak >nul
    echo       - XAMPP services initiated.
) else (
    echo       - ERROR: xampp_start.exe not found
    echo [%date% %time%] ERROR: xampp_start.exe not found >> "%STARTUP_LOG%"
    pause
    goto MENU
)

:: Deploy PHP Code
echo       - Syncing PHP authentication system...
xcopy /E /I /Y /Q "php-auth-system" "!XAMPP_ROOT!\htdocs\php-auth-system" >nul 2>&1
if errorlevel 1 (
    echo       - WARNING: Could not sync PHP files completely
    echo [%date% %time%] WARNING: PHP sync incomplete >> "%STARTUP_LOG%"
) else (
    echo       - PHP files synced successfully.
)

:: Phase 3: Dependencies Check
echo [3/6] Verifying Node.js, Python, and xlwings...
echo [%date% %time%] Phase 3: Dependencies Check >> "%STARTUP_LOG%"

:: Ensure .env exists
if not exist .env (
    echo [%date% %time%] .env missing, creating from .env.example >> "%STARTUP_LOG%"
    if exist .env.example (
        copy .env.example .env >nul
        echo       - Created .env file from template
    )
)

:: Node.js Detection & Install
echo       - Checking Node.js...
node -v >nul 2>&1
if errorlevel 1 (
    echo       - Node.js not found. Installing...
    echo [%date% %time%] Installing Node.js >> "%STARTUP_LOG%"
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --silent >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        echo       - Node.js installation failed. Please install manually from nodejs.org
        echo [%date% %time%] Node.js installation failed >> "%STARTUP_LOG%"
        pause
        goto MENU
    )
    echo       - Node.js installed. Restarting script for PATH refresh...
    timeout /t 2 /nobreak >nul
    start "" cmd /c "%0"
    exit /b
) else (
    for /f "tokens=*" %%i in ('node -v') do (
        echo       - Node.js %%i found
    )
)

:: Python Detection & Install
echo       - Checking Python...
set "PYTHON_CMD=python"
set "PIP_CMD=pip"

python --version >nul 2>&1
if errorlevel 1 (
    echo       - Checking Python launcher (py)...
    py --version >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON_CMD=py"
        set "PIP_CMD=py -m pip"
        echo       - Using Python Launcher (py)
    ) else (
        echo       - Python not found. Installing...
        echo [%date% %time%] Installing Python >> "%STARTUP_LOG%"
        winget install Python.Python.3.12 --accept-package-agreements --silent >> "%LOG_FILE%" 2>&1
        if errorlevel 1 (
            echo       - Python installation failed. Please install from python.org
            echo [%date% %time%] Python installation failed >> "%STARTUP_LOG%"
            pause
            goto MENU
        )
        echo       - Python installed. Restarting script for PATH refresh...
        timeout /t 2 /nobreak >nul
        start "" cmd /c "%0"
        exit /b
    )
) else (
    for /f "tokens=*" %%i in ('python --version') do (
        echo       - %%i found
    )
)

:: Check xlwings
echo       - Checking xlwings...
%PYTHON_CMD% -c "import xlwings" >nul 2>&1
if errorlevel 1 (
    echo       - Installing xlwings...
    echo [%date% %time%] Installing xlwings >> "%STARTUP_LOG%"
    %PIP_CMD% install xlwings --quiet >> "logs\pip_install.log" 2>&1
    
    %PYTHON_CMD% -c "import xlwings" >nul 2>&1
    if errorlevel 1 (
        echo       - WARNING: xlwings installation may have failed
        echo       - Check logs\pip_install.log for details
        echo [%date% %time%] xlwings installation issue >> "%STARTUP_LOG%"
    ) else (
        echo       - xlwings installed
    )
) else (
    echo       - xlwings found
)

:: Check Node dependencies
echo       - Checking Node.js dependencies...
if not exist "node_modules" (
    echo       - Installing npm packages...
    echo [%date% %time%] Installing npm packages >> "%STARTUP_LOG%"
    call npm install --quiet >> "logs\npm_install.log" 2>&1
    
    if not exist "node_modules" (
        echo       - ERROR: npm install failed
        echo       - Check logs\npm_install.log for details
        echo [%date% %time%] npm install failed >> "%STARTUP_LOG%"
        type "logs\npm_install.log" | findstr "error" >nul 2>&1
        if not errorlevel 1 (
            echo       - Errors found:
            findstr "error" "logs\npm_install.log" | more
        )
        pause
        goto MENU
    ) else (
        echo       - npm packages installed
    )
) else (
    echo       - npm packages found
)

:: Phase 4: Start Node.js
echo [4/6] Starting Node.js Calibration Engine...
echo [%date% %time%] Starting Node.js >> "%STARTUP_LOG%"

REM Kill existing process on 3000
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

if exist "logs\node.log" del "logs\node.log"
start /B "NodeEngine" cmd /c "node server.js > logs\node.log 2>&1"
echo [%date% %time%] Node.js process started >> "%STARTUP_LOG%"

timeout /t 3 /nobreak >nul

netstat -aon 2>nul | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo       - WARNING: Node.js may not have started on port 3000
    echo       - Check logs\node.log for details
    echo [%date% %time%] Node.js port 3000 not listening >> "%STARTUP_LOG%"
    if exist "logs\node.log" type "logs\node.log"
) else (
    echo       - Node.js Engine started successfully
)

:: Phase 5: Wait for Services
echo [5/6] Waiting for services to stabilize...
timeout /t 3 /nobreak >nul

:: Phase 6: Launch Application
echo [6/6] Opening Application...
echo [%date% %time%] Opening browser >> "%STARTUP_LOG%"

set "APP_URL=http://localhost/php-auth-system/"
start %APP_URL%

echo.
echo ===================================================
echo System Started Successfully!
echo ===================================================
echo Frontend URL: %APP_URL%
echo Node.js API: http://localhost:3000
echo ===================================================
echo.
echo [%date% %time%] System startup complete >> "%STARTUP_LOG%"
pause
goto MENU

:RESTART_SYSTEM
cls
echo Restarting all services...
echo [%date% %time%] === RESTART_SYSTEM Called === >> "%STARTUP_LOG%"
call :STOP_SYSTEM_SILENT
timeout /t 3 /nobreak >nul
goto START_SYSTEM

:STOP_SYSTEM
cls
echo Stopping all DMP41 related processes...
echo [%date% %time%] === STOP_SYSTEM Called === >> "%STARTUP_LOG%"
call :STOP_SYSTEM_SILENT
echo Services stopped.
echo [%date% %time%] Services stopped >> "%STARTUP_LOG%"
pause
goto MENU

:STOP_SYSTEM_SILENT
:: Kill Node.js
taskkill /F /IM node.exe >nul 2>&1
:: Kill XAMPP processes
if exist "!XAMPP_ROOT!\xampp_stop.exe" (
    "!XAMPP_ROOT!\xampp_stop.exe" >nul 2>&1
)
:: Force kill if hanging
taskkill /F /IM httpd.exe >nul 2>&1
taskkill /F /IM mysqld.exe >nul 2>&1
exit /b

:UPDATE_DEPS
cls
echo ===================================================
echo Updating project dependencies...
echo ===================================================
echo.
echo [1/3] Updating Node.js packages...
call npm install >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo WARNING: npm install reported errors. Check %LOG_FILE%
) else (
    echo Node.js packages updated successfully.
)

echo.
echo [2/3] Updating PHP packages...
IF EXIST "php-auth-system\composer.phar" (
    if exist "!XAMPP_ROOT!\php\php.exe" (
        "!XAMPP_ROOT!\php\php.exe" php-auth-system\composer.phar install --no-interaction >> "%LOG_FILE%" 2>&1
    ) else (
        php php-auth-system\composer.phar install --no-interaction >> "%LOG_FILE%" 2>&1
    )
    echo PHP packages updated.
) else (
    echo PHP composer not found, skipping PHP updates.
)

echo.
echo [3/3] Checking Python packages...
%PIP_CMD% list | findstr "xlwings" >nul 2>&1
if errorlevel 1 (
    echo Installing xlwings...
    %PIP_CMD% install xlwings --quiet >> "%LOG_FILE%" 2>&1
) else (
    echo xlwings already installed.
)

echo.
echo ===================================================
echo Updates complete. See logs for details.
echo ===================================================
pause
goto MENU

:VIEW_STATUS
cls
echo ===================================================
echo             Current Service Status
echo ===================================================
echo.
echo Checking running processes...
echo.
tasklist /FI "IMAGENAME eq node.exe" | findstr "node.exe" >nul && (
    echo  [ACTIVE] Node.js Engine
) || (
    echo  [DOWN]   Node.js Engine
)

tasklist /FI "IMAGENAME eq httpd.exe" | findstr "httpd.exe" >nul && (
    echo  [ACTIVE] Apache Web Server
) || (
    echo  [DOWN]   Apache Web Server
)

tasklist /FI "IMAGENAME eq mysqld.exe" | findstr "mysqld.exe" >nul && (
    echo  [ACTIVE] MySQL Database
) || (
    echo  [DOWN]   MySQL Database
)

echo.
echo Checking network ports...
echo.
echo Port 3000 (Node.js API):
netstat -aon 2>nul | findstr ":3000 " | findstr "LISTENING" >nul 2>&1 && (
    echo  [LISTENING] Active
) || (
    echo  [NOT LISTENING] Inactive
)

echo.
echo Port 80 (Apache HTTP):
netstat -aon 2>nul | findstr ":80 " | findstr "LISTENING" >nul 2>&1 && (
    echo  [LISTENING] Active
) || (
    echo  [NOT LISTENING] Inactive
)

echo.
echo ===================================================
pause
goto MENU

:VIEW_LOGS
cls
echo ===================================================
echo             Recent System Logs
echo ===================================================
echo.
if exist "%STARTUP_LOG%" (
    echo Latest Startup Log (Last 20 lines):
    echo ---------------------------------------------------
    for /f "skip=* tokens=*" %%a in ('find /v /c "" "%STARTUP_LOG%"') do set "LINES=%%a"
    setlocal enabledelayedexpansion
    set /a SKIP=!LINES!-20
    if !SKIP! lss 0 set SKIP=0
    more /e +!SKIP! "%STARTUP_LOG%"
    endlocal
) else (
    echo No startup logs found yet.
)

echo.
echo ===================================================
pause
goto MENU

:EXIT_CMD
echo.
set /p exitchoice="Stop services before exiting? (Y/N): "
if /I "!exitchoice!"=="Y" (
    call :STOP_SYSTEM_SILENT
    echo [%date% %time%] === System Exited (services stopped) === >> "%STARTUP_LOG%"
    exit /b
)
echo [%date% %time%] === System Exited (services running) === >> "%STARTUP_LOG%"
exit /b