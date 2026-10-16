@echo off
title Tented Local Server
echo Starting Tented Couple Chat Web App...
powershell -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause
