@echo off
REM DMP41 Unified Management Console [v3.2]
REM This script manages the hybrid Node.js + PHP + Python environment.
cd /d "%~dp0"
title DMP41 Unified Management Console

REM Check for Administrator Privileges
net session >nul 2>&1
if "%ERRORLEVEL%" NEQ "0" (
    echo ===================================================
    echo ERROR: ADMINISTRATOR PRIVILEGES REQUIRED
    echo ===================================================
    echo This script needs to manage services and XAMPP.
    echo Please right-click and "Run as Administrator".
    echo ===================================================
    pause
    exit
)

REM Logging Setup
if not exist "logs" mkdir "logs"
REM Robust locale-independent date stamp via PowerShell
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd'"`) do set "STAMP=%%i"
set "LOG_FILE=logs\system_%STAMP%.log"

REM Load .env variables [Simple parser]
if exist ".env" (
    for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
        set "%%a=%%b"
    )
)

REM XAMPP Path Detection
if "%XAMPP_ROOT%"=="" set "XAMPP_ROOT=C:\xampp"
if not exist "%XAMPP_ROOT%\htdocs" (
    if exist "D:\xampp\htdocs" set "XAMPP_ROOT=D:\xampp"
)

:MENU
cls
echo ===================================================
echo     DMP41 Hybrid System - Management Console
echo ===================================================
echo  XAMPP Root: %XAMPP_ROOT%
echo ===================================================
echo.
echo  [1] Start System
echo  [2] Restart System
echo  [3] Stop System
echo  [4] Update Dependencies
echo  [5] View Service Status
echo  [6] Open Application [Browser]
echo  [7] Exit
echo.
echo ===================================================
set /p choice="Select an option (1-7): "

if "%choice%"=="1" goto START_SYSTEM
if "%choice%"=="2" goto RESTART_SYSTEM
if "%choice%"=="3" goto STOP_SYSTEM
if "%choice%"=="4" goto UPDATE_DEPS
if "%choice%"=="5" goto VIEW_STATUS
if "%choice%"=="6" goto OPEN_BROWSER
if "%choice%"=="7" goto EXIT_CMD
goto MENU

:START_SYSTEM
cls
echo DEBUG (L82): Entering START_SYSTEM block
echo [1/5] Checking Database and PHP Environment...
REM 1. CHECK AND INSTALL XAMPP [Silent]
echo DEBUG (L85): Checking XAMPP at %XAMPP_ROOT%
IF NOT EXIST "%XAMPP_ROOT%\htdocs" (
    echo       - XAMPP not found at %XAMPP_ROOT%.
    echo       - Attempting automated installation via winget...
    winget install --id ApacheFriends.Xampp.8.2 -e --silent --accept-package-agreements --accept-source-agreements --override "--mode unattended" >> "%LOG_FILE%" 2>&1
    if "%ERRORLEVEL%" NEQ "0" (
        echo       - ERROR: XAMPP installation failed or winget not found.
        echo       - Please install XAMPP manually to %XAMPP_ROOT%
        pause
        goto MENU
    )
)

REM 2. START APACHE / MYSQL [Background]
echo DEBUG (L101): Starting Apache/MySQL
echo       - Starting Apache and MySQL...

REM Check if Port 80 is already in use [Common conflict]
netstat -aon | findstr ":80 " | findstr "LISTENING" >nul
if "%ERRORLEVEL%" == "0" (
    echo       - WARNING: Port 80 is already in use. Apache may fail to start.
)

if exist "%XAMPP_ROOT%\xampp_start.exe" (
    REM Use a separate log for XAMPP to avoid file locking conflicts
    start /B "" "%XAMPP_ROOT%\xampp_start.exe" > logs\xampp.log 2>&1
) else (
    echo       - ERROR: xampp_start.exe not found at %XAMPP_ROOT%
    pause
    goto MENU
)

REM 3. DEPLOY PHP CODE
echo DEBUG (L120): Syncing PHP code
echo       - Syncing Authentication Portal to htdocs...
xcopy /E /I /Y "php-auth-system" "%XAMPP_ROOT%\htdocs\php-auth-system" >nul 2>&1

REM 4. CHECK NODE/PYTHON/XLWINGS
echo DEBUG (L125): Entering Step 2 [Dependencies]
echo [2/5] Verifying Node.js, Python, and xlwings...

REM Ensure .env exists
echo DEBUG (L129): Checking for .env
if not exist ".env" (
    echo DEBUG (L131): .env missing, checking .env.example
    if exist ".env.example" (
        echo       - .env file missing. Creating from .env.example...
        copy ".env.example" ".env" >nul
    )
)

REM Internet Connectivity Check [Quick Ping]
echo DEBUG (L138): Checking internet connectivity
ping -n 1 google.com >nul 2>&1
echo DEBUG (L140): Ping ERRORLEVEL is %ERRORLEVEL%
if "%ERRORLEVEL%" NEQ "0" (
    echo DEBUG (L142): Entering no-internet block
    echo       - WARNING: No internet connection detected. 
    echo       - Dependency installation [npm/pip] may fail if packages are not cached.
)

REM Node.js Detection / Install
echo DEBUG (L147): Detecting Node.js
node -v >nul 2>&1
echo DEBUG (L149): node -v ERRORLEVEL is %ERRORLEVEL%
if "%ERRORLEVEL%" NEQ "0" (
    echo DEBUG (L151): Node.js missing, attempting install
    echo       - Node.js missing. Installing...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements >> "%LOG_FILE%" 2>&1
    echo       - IMPORTANT: Node.js was just installed. 
    echo       - If the next steps fail, please restart this script.
)

REM Python Detection / Install
echo DEBUG (L159): Detecting Python
set "PYTHON_CMD=python"
set "PIP_CMD=pip"

python --version >nul 2>&1
echo DEBUG (L164): python --version ERRORLEVEL is %ERRORLEVEL%
if "%ERRORLEVEL%" NEQ "0" (
    echo DEBUG (L166): python command failed, checking py launcher
    echo       - Python 'python' command not found. Checking for 'py' launcher...
    py --version >nul 2>&1
    if "%ERRORLEVEL%" EQU "0" (
        echo DEBUG (L170): Found py launcher
        echo       - Found Python Launcher [py].
        set "PYTHON_CMD=py"
        set "PIP_CMD=py -m pip"
    ) else (
        echo DEBUG (L175): py launcher failed, attempting winget install
        echo       - Python missing. Attempting installation via winget...
        winget install Python.Python.3.12 --accept-package-agreements >> "%LOG_FILE%" 2>&1
        echo       - IMPORTANT: Python was just installed. 
        echo       - You MAY need to restart this script for PATH changes to take effect.
        
        REM Try one last time to see if it became available
        python --version >nul 2>&1
        if "%ERRORLEVEL%" NEQ "0" (
            echo DEBUG (L184): python still missing after install
            echo       - ERROR: Python installed but not found in PATH.
            echo       - Please restart your terminal or computer and run this script again.
            pause
            goto MENU
        )
    )
)
echo DEBUG (L191): Using PYTHON_CMD=%PYTHON_CMD%
echo DEBUG (L192): Using PIP_CMD=%PIP_CMD%

REM Check xlwings [Critical for Excel Engine]
echo DEBUG (L195): Checking xlwings
%PYTHON_CMD% -c "import xlwings" >nul 2>&1
echo DEBUG (L197): xlwings check ERRORLEVEL is %ERRORLEVEL%
if "%ERRORLEVEL%" NEQ "0" (
    echo DEBUG (L199): xlwings missing, attempting pip install
    echo       - Installing required Python packages [xlwings]...
    if exist "logs\pip_install.log" del "logs\pip_install.log"
    
    REM Use -m pip for maximum reliability
    echo DEBUG (L204): Executing %PIP_CMD% install xlwings
    %PIP_CMD% install xlwings > logs\pip_install.log 2>&1
    
    REM Verify installation
    %PYTHON_CMD% -c "import xlwings" >nul 2>&1
    if "%ERRORLEVEL%" NEQ "0" (
        echo DEBUG (L210): xlwings still missing after install
        echo       - ERROR: Failed to install xlwings.
        echo       - SURFACING PIP ERROR LOG [logs\pip_install.log]:
        echo ---------------------------------------------------
        if exist "logs\pip_install.log" (
            type "logs\pip_install.log"
        ) else (
            echo       - ERROR: pip_install.log was not created.
        )
        echo ---------------------------------------------------
        echo       - SUGGESTION: Check your internet connection or run:
        echo         %PIP_CMD% install xlwings --user
        echo.
        pause
    ) else (
        echo DEBUG (L225): xlwings installed successfully
        echo       - xlwings: INSTALLED
    )
) else (
    echo DEBUG (L229): xlwings already found
    echo       - xlwings: FOUND
)

REM Ensure node_modules exists
echo DEBUG (L233): Checking node_modules
if not exist "node_modules" (
    echo DEBUG (L235): node_modules missing, attempting npm install
    echo       - Installing Node.js dependencies...
    if exist "logs\npm_install.log" del "logs\npm_install.log"
    call npm install > logs\npm_install.log 2>&1
    
    if not exist "node_modules" (
        echo       - ERROR: Failed to install Node.js dependencies.
        echo       - SURFACING NPM ERROR LOG [logs\npm_install.log]:
        echo ---------------------------------------------------
        if exist "logs\npm_install.log" (
            type "logs\npm_install.log"
        ) else (
            echo       - ERROR: npm_install.log was not created.
        )
        echo ---------------------------------------------------
        pause
    ) else (
        echo       - Node.js dependencies: INSTALLED
    )
) else (
    echo       - Node.js dependencies: FOUND
)

REM 5. START NODE.JS [Background]
echo DEBUG (L258): Starting Node.js
echo [3/5] Starting Node.js Calibration Engine...
REM Kill existing process on 3000 to avoid conflicts
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo       - Terminating existing process on port 3000 [PID: %%a]...
    taskkill /F /PID %%a >nul 2>&1
)
REM Start node and ensure it uses its own log file
if exist "logs\node.log" del "logs\node.log"
start /B "NodeEngine" cmd /c "node server.js > logs\node.log 2>&1"

echo DEBUG (L269): Waiting for stabilization
echo [4/5] Waiting for services to stabilize...
timeout /t 5 /nobreak >nul

REM Check if node is actually listening
netstat -aon | findstr ":3000 " | findstr "LISTENING" >nul
if "%ERRORLEVEL%" NEQ "0" (
    echo       - ERROR: Node.js failed to start on port 3000.
    echo       - SURFACING LOG CONTENT [logs\node.log]:
    echo ---------------------------------------------------
    if exist "logs\node.log" (
        type "logs\node.log"
    ) else (
        echo       - ERROR: node.log was not created. Check permissions.
    )
    echo ---------------------------------------------------
    echo.
    pause
    goto MENU
) else (
    echo       - Node.js Engine: STARTED
)

REM 6. SERVICE DETECTION / AUTO-LAUNCH
echo DEBUG (L292): Checking Service Health
echo [5/5] Checking Service Health...
set "APP_URL=http://localhost/php-auth-system/"
set "NODE_URL=http://localhost:3000/api/hardware/status"

powershell -Command ^
    "$authUrl = '%APP_URL%index.php'; " ^
    "$nodeUrl = '%NODE_URL%'; " ^
    "$authReady = $false; $nodeReady = $false; $timeout = 60; $elapsed = 0; " ^
    "Write-Host '      - Waiting for services to stabilize (60s timeout)...' -NoNewline; " ^
    "while (-not ($authReady -and $nodeReady) -and $elapsed -lt $timeout) { " ^
    "    if (-not $authReady) { try { $r = Invoke-WebRequest $authUrl -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $authReady = $true } } catch {} } " ^
    "    if (-not $nodeReady) { try { $r = Invoke-WebRequest $nodeUrl -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $nodeReady = $true } } catch {} } " ^
    "    if (-not ($authReady -and $nodeReady)) { Start-Sleep -Seconds 2; $elapsed += 2; Write-Host '.' -NoNewline } " ^
    "} " ^
    "Write-Host ''; " ^
    "if ($authReady) { Write-Host '      - Auth Portal: READY' } else { Write-Host '      - Auth Portal: ERROR' }; " ^
    "if ($nodeReady) { Write-Host '      - Node Engine: READY' } else { Write-Host '      - Node Engine: ERROR' }; " ^
    "if ($authReady -and $nodeReady) { exit 0 } else { exit 1 }"

if "%ERRORLEVEL%" EQU "0" (
    echo.
    echo ===================================================
    echo System Ready.
    echo Frontend URL: %APP_URL%
    echo ===================================================
    echo.
    echo Launching browser...
    start "" "%APP_URL%"
) else (
    echo.
    echo ===================================================
    echo ERROR: System failed to stabilize. 
    echo Please check the logs in the logs folder.
    echo ===================================================
    echo.
)
pause
goto MENU

:RESTART_SYSTEM
echo Restarting all services...
call :STOP_SYSTEM_SILENT
timeout /t 2 /nobreak >nul
goto START_SYSTEM

:STOP_SYSTEM
echo Stopping all DMP41 related processes...
call :STOP_SYSTEM_SILENT
echo Services stopped.
pause
goto MENU

:STOP_SYSTEM_SILENT
REM Kill Node.js
taskkill /F /IM node.exe >nul 2>&1
REM Kill XAMPP processes
if exist "%XAMPP_ROOT%\xampp_stop.exe" (
    "%XAMPP_ROOT%\xampp_stop.exe" >nul 2>&1
)
REM Force kill if hanging
taskkill /F /IM httpd.exe >nul 2>&1
taskkill /F /IM mysqld.exe >nul 2>&1
exit /b

:UPDATE_DEPS
cls
echo Updating project dependencies...
echo.
echo [1/2] Updating Node.js packages...
call npm install >> "%LOG_FILE%" 2>&1
echo [2/2] Updating PHP packages...
IF EXIST "php-auth-system\composer.phar" (
    if exist "%XAMPP_ROOT%\php\php.exe" (
        "%XAMPP_ROOT%\php\php.exe" php-auth-system\composer.phar install --no-interaction >> "%LOG_FILE%" 2>&1
    ) else (
        php php-auth-system\composer.phar install --no-interaction >> "%LOG_FILE%" 2>&1
    )
)
echo.
echo Updates complete. See logs for details.
pause
goto MENU

:VIEW_STATUS
cls
echo ===================================================
echo             Current Service Status
echo ===================================================
echo.
tasklist /FI "IMAGENAME eq node.exe" | findstr "node.exe" >nul && (echo  [ACTIVE] Node.js Engine) || (echo  [DOWN]   Node.js Engine)
tasklist /FI "IMAGENAME eq httpd.exe" | findstr "httpd.exe" >nul && (echo  [ACTIVE] Apache Web Server) || (echo  [DOWN]   Apache Web Server)
tasklist /FI "IMAGENAME eq mysqld.exe" | findstr "mysqld.exe" >nul && (echo  [ACTIVE] MySQL Database) || (echo  [DOWN]   MySQL Database)
echo.
echo Port 3000:
netstat -aon | findstr ":3000 " | findstr "LISTENING" || echo  [NOT LISTENING]
echo.
pause
goto MENU

:OPEN_BROWSER
start http://localhost/php-auth-system/index.php
goto MENU

:EXIT_CMD
echo.
set /p exitchoice="Stop services before exiting? [Y/N]: "
if /I "%exitchoice%"=="Y" (
    call :STOP_SYSTEM_SILENT
    exit
)
exit
