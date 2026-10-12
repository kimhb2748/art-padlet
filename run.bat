@echo off
chcp 65001 > nul
title 고등학교 미술 수업 아트보드 & 세특 관리 서버
echo ==================================================================
echo   [미술 수업 아트보드] 로컬 웹 서버를 실행하고 있습니다...
echo   잠시만 기다려주세요...
echo ==================================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
