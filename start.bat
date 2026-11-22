@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Dang cai thu vien lan dau, vui long cho...
  call npm install
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Thieu Electron, dang cai bo sung...
  call npm install
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Khong tim thay Electron. Hay chay: npm install
  pause
  exit /b 1
)
rem Mo app desktop Flow Lookbook (cua so rieng, khong qua trinh duyet).
start "" "node_modules\electron\dist\electron.exe" .
