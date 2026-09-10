@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python not found. Install Python 3 and try again.
  pause
  exit /b 1
)

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process 'http://127.0.0.1:8080/'"
python server\app.py

if errorlevel 1 pause
