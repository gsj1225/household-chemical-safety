@echo off
setlocal
cd /d "%~dp0"
call "node_modules\.bin\expo.cmd" start --go --lan --port 8092 --clear
