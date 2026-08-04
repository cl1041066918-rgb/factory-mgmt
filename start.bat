@echo off
chcp 65001 >nul
echo ========================================
echo   工厂管理系统启动中...
echo ========================================
echo.

set NODE_PATH=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2
set SERVER_DIR=%~dp0server

echo [1/2] 启动后端服务...
cd /d "%SERVER_DIR%"
start /b "" "%NODE_PATH%\node.exe" src\index.js

echo [2/2] 等待服务就绪...
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   系统已启动！
echo.
echo   电脑端访问: http://localhost:3000
echo   手机端访问: https://192.168.124.3:3443
echo   (手机需信任证书，见下方说明)
echo.
echo   演示账号:
echo     管理员   admin / admin123
echo     生产线   production / prod123
echo     客服     service / service123
echo     发货     shipping / ship123
echo ========================================
echo.
echo 按任意键打开浏览器...
pause >nul
start http://localhost:3000
