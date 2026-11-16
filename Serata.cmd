@echo off
rem OnPeace su Windows: doppio clic per la serata tra amici.
rem Se sul PC non c'e' Node 22 o superiore ne scarica una copia solo per OnPeace in .cache\node
rem (tools\scarica-node.ps1, niente installazione nel sistema); poi npm run serata fa il resto:
rem dipendenze se servono, client, server, tunnel e browser.
rem Opzioni come npm run serata, per esempio: Serata.cmd --locale
setlocal
cd /d "%~dp0"
title OnPeace - serata

call :nodeok
if not errorlevel 1 goto avvia

if exist ".cache\node\node.exe" goto portatile
echo [serata] Node 22 o superiore non trovato: ne scarico una copia solo per OnPeace in .cache\node
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\scarica-node.ps1"
if errorlevel 1 goto errore

:portatile
set "PATH=%CD%\.cache\node;%PATH%"
call :nodeok
if errorlevel 1 goto errore

:avvia
call npm run serata -- %*
if errorlevel 1 goto errore
exit /b 0

:errore
echo.
echo [serata] Qualcosa non e' andato: leggi i messaggi qui sopra.
echo [serata] Se non riesce a scaricare Node, installalo da https://nodejs.org (versione LTS) e riprova.
pause
exit /b 1

:nodeok
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" >nul 2>&1
exit /b
