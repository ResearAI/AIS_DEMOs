#!/bin/bash

echo "停止 Manus Pro 应用的所有服务..."

# 通过端口强制终止后端进程 (5000端口)
echo "停止Flask后端服务 (端口 5000)..."
BACKEND_PIDS=$(lsof -ti :5000 2>/dev/null)
if [ ! -z "$BACKEND_PIDS" ]; then
    echo "找到后端进程: $BACKEND_PIDS"
    echo $BACKEND_PIDS | xargs kill -9 2>/dev/null
    echo "✅ 后端进程已强制停止"
else
    echo "ℹ️  没有找到占用5000端口的进程"
fi

# 通过端口强制终止前端进程 (3000端口)
echo "停止Next.js前端服务 (端口 3000)..."
FRONTEND_PIDS=$(lsof -ti :3000 2>/dev/null)
if [ ! -z "$FRONTEND_PIDS" ]; then
    echo "找到前端进程: $FRONTEND_PIDS"
    echo $FRONTEND_PIDS | xargs kill -9 2>/dev/null
    echo "✅ 前端进程已强制停止"
else
    echo "ℹ️  没有找到占用3000端口的进程"
fi

# 额外清理：通过进程名称查找并终止
echo "额外清理剩余进程..."
pkill -f "python.*app.py" 2>/dev/null && echo "✅ 清理了Flask相关进程" || echo "ℹ️  没有找到Flask进程"
pkill -f "next dev" 2>/dev/null && echo "✅ 清理了Next.js相关进程" || echo "ℹ️  没有找到Next.js进程"

echo ""
echo "🎉 所有服务已停止"

# 验证端口是否已释放
echo "验证端口状态..."
if lsof -i :5000 >/dev/null 2>&1; then
    echo "⚠️  警告: 端口5000仍被占用"
    lsof -i :5000
else
    echo "✅ 端口5000已释放"
fi

if lsof -i :3000 >/dev/null 2>&1; then
    echo "⚠️  警告: 端口3000仍被占用"
    lsof -i :3000
else
    echo "✅ 端口3000已释放"
fi