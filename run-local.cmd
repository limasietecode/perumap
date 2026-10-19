@echo off
rem Starts the map on http://localhost:8000 (close this window to stop it).
rem Works from any folder or USB drive; needs Python and an internet connection.
cd /d "%~dp0"

set "PY="
python --version >nul 2>nul && set "PY=python"
if not defined PY py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
  echo.
  echo  No se encontro Python en este computador.
  echo  Instalalo gratis desde https://www.python.org/downloads/
  echo  ^(durante la instalacion marca "Add python.exe to PATH"^) y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

start "" http://localhost:8000
%PY% tools\serve.py 8000
if errorlevel 1 pause
