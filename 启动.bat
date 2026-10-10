@echo off
title PersonalApp Launcher
cd /d "%~dp0"
echo ======================================
echo   个人专属App 启动器
echo ======================================
echo 正在启动本地服务...
echo 数据保存在本机 data 目录，关机重启不会丢失。
echo 打开浏览器后即可使用。
start "AppServer" /min node server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
echo 已尝试打开浏览器：http://localhost:3000
echo 提示：如需停止服务，请在最小化的命令行窗口按 Ctrl+C。
timeout /t 4 /nobreak >nul
exit