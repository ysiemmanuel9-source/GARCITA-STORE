@echo off
setlocal
cd /d "%~dp0"
echo Instalando dependencias si faltan...
npm.cmd install
echo.
echo Creando tablas en MySQL...
npm.cmd run setup-db
echo.
echo Listo. Si no salio error, ya puedes abrir INICIAR-SERVIDOR.cmd
pause
endlocal
