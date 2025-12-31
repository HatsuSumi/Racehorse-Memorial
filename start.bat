@echo off
setlocal

rem ===== Config =====
set "PORT=8080"
set "BIND_HOST=0.0.0.0"
set "LOCAL_URL=http://127.0.0.1:%PORT%/"

rem Try to detect a LAN IPv4 (192.168.x.x / 10.x.x.x / 172.16-31.x.x)
rem 暂时禁用自动检测，避免卡顿
set "LAN_IP="
rem for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4Address -and $_.IPv4DefaultGateway -and $_.IPv4DefaultGateway.NextHop -ne '0.0.0.0' }; $ip = $cfg | ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object { $_ -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' } | Select-Object -First 1; if ($ip) { $ip }"`) do set "LAN_IP=%%i"
set "LAN_URL="
if not "%LAN_IP%"=="" set "LAN_URL=http://%LAN_IP%:%PORT%/"

rem ===== Go to project root =====
cd /d "%~dp0"

echo [Start] Serving "%CD%"
echo - PC:    %LOCAL_URL%
if not "%LAN_URL%"=="" (
  echo - Phone: %LAN_URL%
) else (
  echo - Phone: (LAN IP not detected; run ipconfig and use your WLAN IPv4)
)
echo.

where py >nul 2>nul
if %errorlevel%==0 goto :run_py

where python >nul 2>nul
if %errorlevel%==0 goto :run_python

echo [Error] Python not found (py/python).
pause
exit /b 1

:open_browser
timeout /t 1 /nobreak >nul
start "" "%LOCAL_URL%"
exit /b 0

:run_py
call :open_browser
echo.
echo [Server] Listening on %BIND_HOST%:%PORT%  (Ctrl+C to stop)
py -3 -m http.server %PORT% --bind %BIND_HOST%
goto :eof

:run_python
call :open_browser
echo.
echo [Server] Listening on %BIND_HOST%:%PORT%  (Ctrl+C to stop)
python -m http.server %PORT% --bind %BIND_HOST%
goto :eof

where py >nul 2>nul
if %errorlevel%==0 goto :run_py
where python >nul 2>nul
if %errorlevel%==0 goto :run_python

echo [Error] Python not found (py/python).
pause
exit /b 1

:open_browser
timeout /t 1 /nobreak >nul
start "" "%LOCAL_URL%"
exit /b 0

:run_py
call :open_browser
echo.
echo [Server] Listening on %BIND_HOST%:%PORT%  (Ctrl+C to stop)
py -3 -m http.server %PORT% --bind %BIND_HOST%
goto :eof

:run_python
call :open_browser
echo.
echo [Server] Listening on %BIND_HOST%:%PORT%  (Ctrl+C to stop)
python -m http.server %PORT% --bind %BIND_HOST%
goto :eof
