# requirements.txt
Flask==2.3.3
Flask-CORS==4.0.0

# package.json 需要添加的环境变量配置
# 在你的 package.json 的 scripts 部分添加：
# "dev": "NEXT_PUBLIC_API_URL=http://localhost:5000/api next dev"

# .env.local (在 Next.js 项目根目录创建)
NEXT_PUBLIC_API_URL=http://localhost:5000/api

# 启动脚本 start.sh
#!/bin/bash

echo "启动 Manus Pro 全栈应用..."

# 启动 Flask 后端
echo "启动后端服务..."
cd backend
python app.py &
BACKEND_PID=$!

# 等待后端启动
sleep 3

# 启动 Next.js 前端
echo "启动前端服务..."
cd ../
npm run dev &
FRONTEND_PID=$!

echo "应用启动完成！"
echo "前端地址: http://localhost:3000"
echo "后端地址: http://localhost:5000"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 捕获中断信号，清理进程
trap 'kill $BACKEND_PID $FRONTEND_PID; exit' INT

# 等待进程结束
wait