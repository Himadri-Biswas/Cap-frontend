@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo  TalentPulse Frontend
echo ==============================================
echo.

if not exist node_modules (
    echo node_modules not found - installing dependencies...
    echo ^(this uses --legacy-peer-deps due to a known vite/plugin-react version conflict^)
    echo.
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo.
        echo npm install failed. See the error above.
        pause
        exit /b 1
    )
)

echo Starting dev server...
echo Open the URL Vite prints below in your browser ^(usually http://localhost:5173^).
echo Press Ctrl+C to stop.
echo.

call npm run dev

echo.
echo Dev server stopped.
pause
