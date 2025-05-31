from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import json
import time
import uuid
from threading import Thread
import queue
from typing import Dict

# Flask应用初始化
app = Flask(__name__)
CORS(app)

# 全局状态管理
task_queues: Dict[str, queue.Queue] = {}
task_executors: Dict[str, 'SimpleTaskExecutor'] = {}

class SimpleTaskExecutor:
    """简化的任务执行器"""
    
    def __init__(self, task_id: str, prompt: str):
        self.task_id = task_id
        self.prompt = prompt
        self.is_running = False
        self.messages_sent = 0
        
    def execute_task(self):
        """执行简化的任务流程"""
        self.is_running = True
        try:
            # 发送任务开始
            self.send_message("task_update", {"status": "started"})
            
            # 预定义的消息序列
            messages = [
                {
                    "type": "activity",
                    "data": {
                        "id": 1,
                        "text": "步骤1：分析任务需求",
                        "type": "thinking",
                        "status": "in-progress",
                        "timestamp": time.time()
                    }
                },
                {
                    "type": "activity_update", 
                    "data": {"id": 1, "status": "completed"}
                },
                {
                    "type": "activity",
                    "data": {
                        "id": 2,
                        "text": "步骤2：创建工作文件",
                        "type": "file",
                        "status": "in-progress",
                        "timestamp": time.time(),
                        "filename": "example.md"
                    }
                },
                {
                    "type": "file_structure_update",
                    "data": {
                        "name": "resear-pro-task",
                        "type": "directory",
                        "children": [
                            {"name": "example.md", "type": "file", "size": 100}
                        ]
                    }
                },
                {
                    "type": "file_update",
                    "data": {
                        "filename": "example.md",
                        "content": f"# 任务: {self.prompt}\n\n这是一个示例文件。\n\n## 进度\n- [x] 分析需求\n- [x] 创建文件\n- [ ] 完成任务"
                    }
                },
                {
                    "type": "activity_update",
                    "data": {"id": 2, "status": "completed"}
                },
                {
                    "type": "terminal",
                    "data": {
                        "command": "echo '任务进行中...'",
                        "output": "任务进行中...\n✅ 文件创建成功",
                        "status": "completed",
                        "timestamp": time.time()
                    }
                },
                {
                    "type": "activity",
                    "data": {
                        "id": 3,
                        "text": "步骤3：完成任务",
                        "type": "thinking",
                        "status": "in-progress",
                        "timestamp": time.time()
                    }
                },
                {
                    "type": "file_update",
                    "data": {
                        "filename": "example.md",
                        "content": f"# 任务: {self.prompt}\n\n这是一个示例文件。\n\n## 进度\n- [x] 分析需求\n- [x] 创建文件\n- [x] 完成任务\n\n## 结果\n任务已成功完成！"
                    }
                },
                {
                    "type": "activity_update",
                    "data": {"id": 3, "status": "completed"}
                },
                {
                    "type": "terminal",
                    "data": {
                        "command": "echo '任务完成'",
                        "output": "🎉 任务执行完成！\n📄 文件已更新\n✅ 状态：成功",
                        "status": "completed",
                        "timestamp": time.time()
                    }
                },
                {
                    "type": "task_update",
                    "data": {"status": "completed"}
                }
            ]
            
            # 按顺序发送消息，每条消息间隔2秒
            for i, message in enumerate(messages):
                time.sleep(2)  # 等待2秒
                print(f"发送消息 {i+1}/{len(messages)}: {message['type']}")
                self.send_message(message["type"], message["data"])
                
        except Exception as e:
            print(f"任务执行错误: {e}")
            # 发送错误状态
            self.send_message("task_update", {"status": "failed", "error": str(e)})
        finally:
            self.is_running = False
    
    def send_message(self, msg_type: str, data: dict):
        """发送消息到队列"""
        if self.task_id in task_queues:
            message = {
                "type": msg_type,
                "data": data,
                "sequence": self.messages_sent
            }
            task_queues[self.task_id].put(message)
            self.messages_sent += 1
            print(f"消息已发送: {msg_type}, 序号: {self.messages_sent}")

@app.route('/api/tasks', methods=['POST'])
def create_task():
    """创建新任务"""
    data = request.get_json()
    prompt = data.get('prompt', '')
    
    if not prompt.strip():
        return jsonify({'error': 'Prompt is required'}), 400
    
    # 生成任务ID
    task_id = str(uuid.uuid4())
    task_queues[task_id] = queue.Queue()
    
    # 创建任务执行器（但不立即启动）
    executor = SimpleTaskExecutor(task_id, prompt)
    task_executors[task_id] = executor
    
    print(f"任务已创建: {task_id}")
    
    return jsonify({
        'task_id': task_id,
        'status': 'created'
    })

@app.route('/api/tasks/<task_id>/connect', methods=['POST'])
def connect_task(task_id):
    """连接并开始执行任务（POST模式）"""
    print(f"前端连接任务: {task_id}")
    
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404
    
    def generate_chunked_response():
        """生成分块响应"""
        executor = task_executors[task_id]
        task_queue = task_queues[task_id]
        
        # 启动任务执行（如果还没有启动）
        if not executor.is_running:
            print("启动任务执行线程...")
            thread = Thread(target=executor.execute_task)
            thread.daemon = True
            thread.start()
        
        message_count = 0
        
        try:
            while True:
                try:
                    # 等待消息，超时30秒
                    message = task_queue.get(timeout=30)
                    message_count += 1
                    
                    print(f"发送给前端: 消息 {message_count}, 类型: {message.get('type')}")
                    
                    # 发送消息（使用换行符分隔）
                    chunk = json.dumps(message) + '\n'
                    yield chunk
                    
                    # 如果任务完成或失败，结束连接
                    if (message.get('type') == 'task_update' and 
                        message.get('data', {}).get('status') in ['completed', 'failed']):
                        print(f"任务完成，总共发送 {message_count} 条消息")
                        break
                        
                except queue.Empty:
                    # 发送心跳
                    heartbeat = json.dumps({'type': 'heartbeat', 'timestamp': time.time()}) + '\n'
                    yield heartbeat
                    continue
                    
        except Exception as e:
            print(f"连接错误: {e}")
            error_msg = json.dumps({'type': 'error', 'message': str(e)}) + '\n'
            yield error_msg
        finally:
            # 清理资源
            print(f"清理任务资源: {task_id}")
            if task_id in task_queues:
                del task_queues[task_id]
            if task_id in task_executors:
                del task_executors[task_id]
    
    return Response(
        generate_chunked_response(),
        mimetype='text/plain',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Transfer-Encoding': 'chunked'
        }
    )

@app.route('/api/health')
def health_check():
    """健康检查"""
    return jsonify({
        'status': 'healthy',
        'active_tasks': len(task_queues),
        'running_executors': len(task_executors),
        'timestamp': time.time()
    })

if __name__ == '__main__':
    print("启动简化版 AI 助手后端...")
    print("端口: 5001")
    print("模式: POST + Chunked Transfer")
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=True) 