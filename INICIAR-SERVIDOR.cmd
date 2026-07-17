@echo off
setlocal
cd /d "%~dp0"
echo Iniciando Gaming Store con backend y MySQL...
echo Si es la primera vez, ejecuta antes: CREAR-TABLAS.cmd
npm.cmd start
pause
endlocal
