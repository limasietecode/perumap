@echo off
rem Starts the map on http://localhost:8000 (close this window to stop it).
cd /d "%~dp0"
start "" http://localhost:8000
python tools\serve.py 8000
