@echo off
setlocal

set "TASK_NAME=FitnessHood Auto Start"

echo Removing scheduled task "%TASK_NAME%"...
schtasks /Delete /TN "%TASK_NAME%" /F >nul
if errorlevel 1 (
  echo Task not found or could not be removed.
  pause
  exit /b 1
)

echo Startup task removed successfully.
pause
exit /b 0

