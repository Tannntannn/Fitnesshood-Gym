@echo off
setlocal

cd /d "%~dp0\..\.."

echo === FitnessHood Local Install (Gym PC) ===
echo Project: %CD%
echo.

echo [1/4] Installing dependencies...
call npm.cmd install
if errorlevel 1 goto :fail

echo.
echo [2/4] Generating Prisma client...
call npx.cmd prisma generate
if errorlevel 1 goto :fail

echo.
echo [3/4] Creating/updating local database schema...
call npx.cmd prisma db push
if errorlevel 1 goto :fail

echo.
echo [4/5] Building production app...
call npm.cmd run build
if errorlevel 1 goto :fail

echo.
echo [5/5] Seeding default admin (safe to re-run)...
call npm.cmd run db:seed
if errorlevel 1 goto :fail

echo.
echo Install complete.
echo Next: run START_FITNESSHOOD.cmd
pause
exit /b 0

:fail
echo.
echo Install failed. Check the error output above.
echo Tip: Close any running dev server then retry.
pause
exit /b 1

