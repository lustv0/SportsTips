@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="--smoke-test" (
  shift
  call npm run discord:gui:smoke -- %*
  exit /b %errorlevel%
)

call npm run discord:gui -- %*
exit /b %errorlevel%