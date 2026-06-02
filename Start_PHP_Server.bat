@echo off
setlocal EnableDelayedExpansion

:: =========================================================================
:: DMP41 - PHP Authentication Server (Apache/MySQL)
:: =========================================================================

cd /d "%~dp0"
title DMP41 - PHP/XAMPP Server

:: 1. Admin Check
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Administrator Privileges REQUIRED.
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%~dp0\" && \"%~f0\"' -Verb RunAs"
    exit /b
)

:: 2. Logging
if not exist "logs" mkdir "logs"
set "LOG_FILE=logs\php_server.log"
echo [%date% %time%] === PHP Server Startup === > "%LOG_FILE%"

:: 3. Load XAMPP Path
set "XAMPP_ROOT=C:\xampp"
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        if "%%a"=="XAMPP_ROOT" set "XAMPP_ROOT=%%b"
    )
)

:: 4. Verify/Install XAMPP
if not exist "!XAMPP_ROOT!\htdocs" (
    echo [INFO] XAMPP not found. Installing...
    winget install --id ApacheFriends.Xampp.8.2 -e --silent --accept-package-agreements --accept-source-agreements --override "--mode unattended"
    if !errorlevel! neq 0 (
        echo [ERROR] XAMPP installation failed.
        pause & exit /b
    )
    set "XAMPP_ROOT=C:\xampp"
)

:: 5. Sync PHP Files
echo [INFO] Syncing PHP authentication system...
if exist "php-auth-system" (
    xcopy /E /I /Y /Q "php-auth-system" "!XAMPP_ROOT!\htdocs\php-auth-system" >nul 2>&1
)

:: 6. Start Services
echo [INFO] Starting Apache and MySQL...
taskkill /F /IM httpd.exe >nul 2>&1
taskkill /F /IM mysqld.exe >nul 2>&1

if exist "!XAMPP_ROOT!\xampp_start.exe" (
    start /B "" "!XAMPP_ROOT!\xampp_start.exe" >> "%LOG_FILE%" 2>&1
    timeout /t 5 /nobreak >nul
) else (
    echo [ERROR] xampp_start.exe not found at !XAMPP_ROOT!
    pause & exit /b
)

:: 7. Launch Browser
echo [SUCCESS] PHP Server is running.
start "" "http://localhost/php-auth-system/"
echo Press any key to stop the server and exit...
pause >nul

:: Cleanup on exit
if exist "!XAMPP_ROOT!\xampp_stop.exe" (
    call "!XAMPP_ROOT!\xampp_stop.exe" >nul 2>&1
)
taskkill /F /IM httpd.exe >nul 2>&1
taskkill /F /IM mysqld.exe >nul 2>&1
exit /b