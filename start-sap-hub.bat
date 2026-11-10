@echo off
title SAP Student Hub - Local Server
echo Starting SAP Student Hub Local Server (No Node.js required)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8787
pause

