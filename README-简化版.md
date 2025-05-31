# Resear Pro - 简化版后端说明

## 📋 概述

`app2.py` 是一个极简化的后端版本，专门用于测试和演示。它只包含核心功能：创建任务后按预定顺序发送消息。

**🚀 新特性：POST + Chunked Transfer 模式**
- 解决了SSE（Server-Sent Events）可能丢失消息的问题
- 使用HTTP POST请求和chunked传输，确保消息完整性
- 前端通过ReadableStream处理响应，支持实时流式更新

## 🚀 启动方式

### 1. 启动简化版后端
```bash
python app2.py
```
服务将在端口 **5001** 上运行

### 2. 启动完整版后端（对比）
```bash
python app.py
```
服务将在端口 **5000** 上运行

### 3. 启动前端
```bash
npm run dev
```
前端将在端口 **3000** 或 **3001** 上运行

## 🔄 切换后端

使用提供的切换脚本：

```bash
# 切换到简化版后端
node switch-backend.js simple

# 切换到完整版后端  
node switch-backend.js full

# 查看帮助
node switch-backend.js
```

## 🧪 测试POST模式

运行测试脚本验证连接：

```bash
node test-post-mode.js
```

这将创建一个测试任务并验证所有13条消息都能正确接收。

## 📋 简化版功能

### 预定义消息序列（每条间隔2秒）

1. **任务开始** - `task_update: started`
2. **步骤1：分析任务需求** - `activity: thinking`
3. **步骤1完成** - `activity_update: completed`
4. **步骤2：创建工作文件** - `activity: file`
5. **文件结构更新** - `file_structure_update`
6. **文件内容更新** - `file_update: example.md`
7. **步骤2完成** - `activity_update: completed`
8. **终端输出** - `terminal: 任务进行中...`
9. **步骤3：完成任务** - `activity: thinking`
10. **文件内容更新** - `file_update: 完成状态`
11. **步骤3完成** - `activity_update: completed`
12. **最终终端输出** - `terminal: 任务完成`
13. **任务完成** - `task_update: completed`

### API 端点

- `POST /api/tasks` - 创建新任务
- `POST /api/tasks/<task_id>/connect` - 连接任务并获取实时流（新）
- `GET /api/health` - 健康检查

## 🎯 POST模式优势

### ✅ **消息完整性保证**
- 使用HTTP chunked transfer，确保所有消息都能到达前端
- 不会因为网络波动或浏览器限制丢失消息
- 每条消息都有序号，便于调试和验证

### ✅ **更好的错误处理**
- 支持标准HTTP状态码
- 可以正确处理连接中断和重新连接
- 提供详细的错误信息

### ✅ **调试友好**
- 后端和前端都有详细的控制台输出
- 消息处理过程可视化
- 支持中断和清理

## 🎯 使用场景

- **快速测试前端功能**：不需要复杂的AI逻辑
- **演示流程**：展示消息传递和UI更新
- **开发调试**：简化的流程便于定位问题
- **性能测试**：测试前端处理消息的性能
- **消息完整性验证**：确保关键消息不丢失

## 📝 自定义消息

修改 `app2.py` 中的 `messages` 列表来自定义发送的消息：

```python
messages = [
    {
        "type": "activity",
        "data": {
            "id": 1,
            "text": "你的自定义步骤",
            "type": "thinking",
            "status": "in-progress",
            "timestamp": time.time()
        }
    },
    # 添加更多消息...
]
```

## ⏱️ 调整时间间隔

修改 `time.sleep(2)` 中的数值来改变消息发送间隔：

```python
time.sleep(1)  # 1秒间隔
time.sleep(5)  # 5秒间隔
```

## 🔧 端口配置

- 简化版后端：`5001`
- 完整版后端：`5000`
- 前端：`3000` 或 `3001`

如需修改端口，编辑对应文件中的端口配置。

## 🐛 故障排除

### 前端没有收到消息
1. 确保后端正在运行：`node test-post-mode.js`
2. 检查浏览器控制台是否有错误
3. 确认前端已切换到简化版模式：`node switch-backend.js simple`

### 后端无响应
1. 检查端口5001是否被占用
2. 查看后端控制台输出
3. 验证健康检查：`Invoke-WebRequest -Uri "http://localhost:5001/api/health"` 