@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Установите Node.js 22 или новее, затем запустите этот файл снова.
  pause
  exit /b 1
)
echo Откройте http://127.0.0.1:3008 в браузере. Для остановки нажмите Ctrl+C.
node server.mjs
pause
