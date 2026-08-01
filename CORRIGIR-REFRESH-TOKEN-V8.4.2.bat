@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CORRIGIR-REFRESH-TOKEN-V8.4.2.ps1"
