@echo off
title WorkUco
cd /d "%~dp0"
if not exist data mkdir data
echo.
echo  WorkUco - Portal de empleo del Valle de Uco
echo  http://localhost:4250
echo.
start "" http://localhost:4250
node server.js
echo.
echo El servidor se detuvo.
pause
