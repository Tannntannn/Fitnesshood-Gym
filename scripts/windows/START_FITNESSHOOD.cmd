@echo off
setlocal

pushd "%~dp0..\.."
if not exist package.json (
  echo ERROR: package.json not found in: %CD%
  echo This script must be inside the project at: scripts\windows\
  pause
  popd
  exit /b 1
)

echo === FitnessHood Local Start (Gym PC) ===
echo Opening: http://localhost:3000
echo.

if /I "%~1"=="--rebuild" (
  echo Rebuilding production app...
  call npm.cmd run build
  if errorlevel 1 (
    echo Build failed.
    pause
    popd
    exit /b 1
  )
)

REM Auto-rebuild if logo (or other public assets) changed after last build
if exist "public\\logo.png" if exist ".next\\BUILD_ID" (
  powershell -NoProfile -Command ^
    "$logo = Get-Item 'public\\logo.png'; $build = Get-Item '.next\\BUILD_ID'; if ($logo.LastWriteTime -gt $build.LastWriteTime) { exit 42 } else { exit 0 }"
  if errorlevel 42 (
    echo Detected updated logo. Rebuilding...
    call npm.cmd run build
    if errorlevel 1 (
      echo Build failed.
      pause
      popd
      exit /b 1
    )
  )
)

if not exist ".next\\BUILD_ID" (
  echo No production build found. Building now...
  call npm.cmd run build
  if errorlevel 1 (
    echo Build failed. Please run INSTALL_FITNESSHOOD.cmd first.
    pause
    popd
    exit /b 1
  )
)

start "" "http://localhost:3000"
call npm.cmd run start

popd

