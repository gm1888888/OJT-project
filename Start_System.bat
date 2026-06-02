@echo off
setlocal EnableDelayedExpansion

:: =========================================================================
:: DMP41 Calibration System - Unified Launcher
:: =========================================================================

cd /d "%~dp0"
title DMP41 Master Launcher

:MENU
cls
echo ===================================================
echo     DMP41 Hybrid System - Master Launcher
echo ===================================================
echo.
echo  [1] Start FULL System (PHP + Node.js)
echo  [2] Start PHP Server ONLY (Auth/Database)
echo  [3] Start Node.js Engine ONLY (Calibration)
echo  [4] Stop All Services
echo  [5] Exit
echo.
echo ===================================================
set /p choice="Select an option (1-5): "

if "!choice!"=="1" (
    start "DMP41 PHP" cmd /c "Start_PHP_Server.bat"
    start "DMP41 Node" cmd /c "Start_Node_Server.bat"
    goto MENU
)
if "!choice!"=="2" (
    start "DMP41 PHP" cmd /c "Start_PHP_Server.bat"
    goto MENU
)
if "!choice!"=="3" (
    start "DMP41 Node" cmd /c "Start_Node_Server.bat"
    goto MENU
)
if "!choice!"=="4" (
    echo Stopping all processes...
    taskkill /F /IM node.exe >nul 2>&1
    taskkill /F /IM httpd.exe >nul 2>&1
    taskkill /F /IM mysqld.exe >nul 2>&1
    echo Done.
    pause
    goto MENU
)
if "!choice!"=="5" exit /b
goto MENU