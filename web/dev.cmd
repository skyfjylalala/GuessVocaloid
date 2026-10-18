@echo off
setlocal
cd /d "%~dp0"

rem Prefer installed developer tools; fall back to the existing Codex runtime.
set "GV_RUNTIME=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
where node.exe >nul 2>nul
if errorlevel 1 (
  if not exist "%GV_RUNTIME%\node\bin\node.exe" (
    echo Node.js was not found. Install Node.js 24 LTS and pnpm, then try again.
    exit /b 1
  )
  set "PATH=%GV_RUNTIME%\node\bin;%PATH%"
)

where pnpm.cmd >nul 2>nul
if errorlevel 1 (
  if not exist "%GV_RUNTIME%\bin\fallback\pnpm.cmd" (
    echo pnpm was not found. Install pnpm, then try again.
    exit /b 1
  )
  set "PATH=%GV_RUNTIME%\bin\fallback;%PATH%"
)

if not exist "node_modules\.bin\vite.cmd" (
  echo Installing project dependencies...
  call pnpm.cmd install
  if errorlevel 1 exit /b 1
)

if not exist ".dev.vars" copy /y ".dev.vars.example" ".dev.vars" >nul
if not exist ".wrangler\state\v3\d1" (
  call pnpm.cmd data:import
  if errorlevel 1 exit /b 1
  call pnpm.cmd db:local
  if errorlevel 1 exit /b 1
)

call pnpm.cmd dev %*
exit /b %ERRORLEVEL%
