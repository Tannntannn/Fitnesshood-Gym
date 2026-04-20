@echo off
setlocal

set "TASK_NAME=FitnessHood Auto Start"
set "START_SCRIPT=%~dp0START_FITNESSHOOD.cmd"

if not exist "%START_SCRIPT%" (
  echo ERROR: START_FITNESSHOOD.cmd not found at:
  echo %START_SCRIPT%
  pause
  exit /b 1
)

echo Creating scheduled task "%TASK_NAME%"...
schtasks /Create /TN "%TASK_NAME%" /SC ONLOGON /RU "%USERNAME%" /TR "\"%START_SCRIPT%\"" /F >nul
if errorlevel 1 (
  echo Failed to create startup task.
  echo Try running this file as Administrator.
  pause
  exit /b 1
)

echo Startup task created successfully.
echo FitnessHood will auto-start when this user logs in.
pause
exit /b 0

