from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import json
import time
import uuid
import zipfile
import io
import os
from threading import Thread
import queue
from typing import Dict, Any, Optional
import logging

# Flask应用初始化
app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 日志配置
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 全局状态管理
active_tasks: Dict[str, Dict[str, Any]] = {}  # 活跃任务存储
task_queues: Dict[str, queue.Queue] = {}  # 任务消息队列
task_executors: Dict[str, 'TaskExecutor'] = {}  # 任务执行器实例


class TaskExecutor:
    """
    AI任务执行器类
    负责模拟AI助手执行任务的完整流程
    """

    def __init__(self, task_id: str, prompt: str):
        """
        初始化任务执行器

        Args:
            task_id: 任务唯一标识符
            prompt: 用户输入的任务描述
        """
        self.task_id = task_id
        self.prompt = prompt
        self.current_file = "todo.md"
        self.file_content = ""
        self.is_paused = False
        self.all_files = {}  # 存储所有创建的文件
        self.execution_log = []  # 执行日志
        self.file_structure = {}  # 文件结构

    def emit_activity(self, activity_type: str, text: str, **kwargs) -> int:
        """
        发送活动更新到前端

        Args:
            activity_type: 活动类型 (thinking, command, file, edit等)
            text: 活动描述文本
            **kwargs: 其他活动相关参数

        Returns:
            活动ID，用于后续状态更新
        """
        activity_id = int(time.time() * 1000000)  # 使用微秒确保唯一性
        activity = {
            "id": activity_id,
            "text": text,
            "type": activity_type,
            "status": kwargs.get("status", "in-progress"),
            "timestamp": time.time()
        }

        # 根据活动类型添加特定数据
        if activity_type == "command":
            activity["command"] = kwargs.get("command", "")
        elif activity_type in ["file", "edit"]:
            activity["filename"] = kwargs.get("filename", "")
        elif activity_type == "browse":
            activity["path"] = kwargs.get("path", "")
        elif activity_type == "terminal":
            activity["output"] = kwargs.get("output", "")
            activity["command"] = kwargs.get("command", "")

        # 记录到执行日志
        self.execution_log.append(activity)

        # 发送到前端
        if self.task_id in task_queues:
            task_queues[self.task_id].put({
                "type": "activity",
                "data": activity
            })

        return activity_id

    def update_activity_status(self, activity_id: int, status: str, **kwargs):
        """
        更新活动状态

        Args:
            activity_id: 活动ID
            status: 新状态 (completed, failed, in-progress)
            **kwargs: 其他更新参数
        """
        if self.task_id in task_queues:
            task_queues[self.task_id].put({
                "type": "activity_update",
                "data": {
                    "id": activity_id,
                    "status": status,
                    **kwargs
                }
            })

    def emit_file_update(self, filename: str, content: str):
        """
        发送文件内容更新

        Args:
            filename: 文件名
            content: 文件内容
        """
        # 保存文件到内存
        self.all_files[filename] = content
        self.update_file_structure()

        if self.task_id in task_queues:
            task_queues[self.task_id].put({
                "type": "file_update",
                "data": {
                    "filename": filename,
                    "content": content
                }
            })

    def update_file_structure(self):
        """更新文件结构并发送到前端"""
        # 构建文件结构
        structure = {
            "name": "resear-pro-task",
            "type": "directory",
            "children": []
        }

        # 按文件夹组织文件
        folders = {}
        for filename in self.all_files.keys():
            parts = filename.split('/')
            if len(parts) > 1:
                folder = parts[0]
                if folder not in folders:
                    folders[folder] = []
                folders[folder].append('/'.join(parts[1:]))
            else:
                structure["children"].append({
                    "name": filename,
                    "type": "file",
                    "size": len(self.all_files[filename])
                })

        # 添加文件夹
        for folder, files in folders.items():
            folder_node = {
                "name": folder,
                "type": "directory",
                "children": [
                    {
                        "name": file,
                        "type": "file",
                        "size": len(self.all_files[f"{folder}/{file}"])
                    }
                    for file in files
                ]
            }
            structure["children"].append(folder_node)

        self.file_structure = structure

        # 发送文件结构更新
        if self.task_id in task_queues:
            task_queues[self.task_id].put({
                "type": "file_structure_update",
                "data": structure
            })

    def emit_terminal_output(self, command: str, output: str, status: str = "completed"):
        """
        发送终端输出

        Args:
            command: 执行的命令
            output: 命令输出结果
            status: 执行状态
        """
        if self.task_id in task_queues:
            task_queues[self.task_id].put({
                "type": "terminal",
                "data": {
                    "command": command,
                    "output": output,
                    "status": status,
                    "timestamp": time.time()
                }
            })

    def emit_task_update(self, status: str, **kwargs):
        """
        发送任务状态更新

        Args:
            status: 任务状态 (started, completed, failed, paused)
            **kwargs: 其他状态信息
        """
        if self.task_id in task_queues:
            task_queues[self.task_id].put({
                "type": "task_update",
                "data": {
                    "status": status,
                    **kwargs
                }
            })

    def pause_task(self):
        """暂停任务执行"""
        self.is_paused = True
        logger.info(f"Task {self.task_id} paused")

    def resume_task(self):
        """恢复任务执行"""
        self.is_paused = False
        logger.info(f"Task {self.task_id} resumed")

    def wait_if_paused(self, step_duration: float = 1.0):
        """
        检查暂停状态，如果暂停则等待

        Args:
            step_duration: 步骤正常执行时间
        """
        if self.is_paused:
            while self.is_paused:
                time.sleep(0.5)  # 暂停期间每0.5秒检查一次
        else:
            time.sleep(step_duration)

    def execute_task(self):
        """
        执行任务的主要逻辑
        模拟完整的AI助手工作流程
        """
        try:
            # 1. 任务开始
            self.emit_task_update("started")
            thinking_id = self.emit_activity("thinking", "Analyzing task requirements...", status="in-progress")
            self.wait_if_paused(2)
            self.update_activity_status(thinking_id, "completed")

            # 2. 创建工作环境
            cmd_id = self.emit_activity("command", "Creating workspace and environment setup", status="in-progress")
            command = "mkdir -p workspace && cd workspace"
            self.wait_if_paused(1)
            self.emit_terminal_output(command, "Directory created successfully\nChanged to workspace directory")
            self.update_activity_status(cmd_id, "completed", command=command)

            # 3. 创建任务清单文件 (todo.md)
            initial_todo = f"""# Task: {self.prompt}

## Task Analysis
- [x] Understand user requirements
- [ ] Develop execution plan
- [ ] Create project files
- [ ] Implement core functionality
- [ ] Test and verify
- [ ] Complete task

## Execution Log
Start time: {time.strftime('%Y-%m-%d %H:%M:%S')}
Status: In progress

## File List
- todo.md (Task checklist)
- config.json (Configuration file)
- main.py (Main program file)
"""

            self.current_file = "todo.md"
            self.file_content = initial_todo

            file_id = self.emit_activity("file", "Creating task checklist file", filename="todo.md", status="in-progress")
            self.wait_if_paused(1)
            self.emit_file_update("todo.md", initial_todo)
            self.update_activity_status(file_id, "completed")

            # 4. 创建配置文件 (config.json)
            config_content = json.dumps({
                "project": {
                    "name": "Resear Pro Task",
                    "version": "1.0.0",
                    "description": "AI research assistant task execution",
                    "created": time.strftime('%Y-%m-%d %H:%M:%S')
                },
                "settings": {
                    "debug": True,
                    "auto_save": True,
                    "max_retries": 3,
                    "features": ["streaming", "real-time", "multi-file"]
                },
                "execution": {
                    "max_steps": 10,
                    "timeout": 300,
                    "retry_count": 3,
                    "parallel_processing": False
                },
                "task": {
                    "description": self.prompt,
                    "priority": "normal",
                    "estimated_duration": "5-10 minutes"
                }
            }, indent=2, ensure_ascii=False)

            config_id = self.emit_activity("file", "Creating project configuration file", filename="config.json", status="in-progress")
            self.wait_if_paused(1)
            self.emit_file_update("config.json", config_content)
            cmd = "touch config.json && echo 'Configuration file created'"
            self.emit_terminal_output(cmd, "Configuration file created")
            self.update_activity_status(config_id, "completed")

            # 5. 创建主程序文件 (main.py)
            python_content = f'''#!/usr/bin/env python3
"""
Resear Pro - AI Task Executor
Generated at: {time.strftime('%Y-%m-%d %H:%M:%S')}
Task description: {self.prompt}
"""

import json
import time
import logging
from datetime import datetime
from typing import Dict, List, Any

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TaskExecutor:
    """Task executor class"""

    def __init__(self, config_file: str = "config.json"):
        """
        Initialize task executor

        Args:
            config_file: Configuration file path
        """
        self.load_config(config_file)
        self.start_time = datetime.now()
        self.completed_steps = 0

    def load_config(self, config_file: str):
        """Load configuration file"""
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                self.config = json.load(f)
            logger.info("Configuration file loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load configuration file: {{e}}")
            self.config = {{"project": {{"name": "Default Task"}}}}

    def log_progress(self, message: str, step: int = None):
        """Log progress message"""
        timestamp = datetime.now().strftime('%H:%M:%S')
        if step:
            print(f"[{{timestamp}}] Step {{step}}: {{message}}")
        else:
            print(f"[{{timestamp}}] {{message}}")

    def execute_step(self, step_name: str, duration: float = 1.0) -> bool:
        """
        Execute a single step

        Args:
            step_name: Step name
            duration: Simulated execution time

        Returns:
            Whether execution was successful
        """
        self.log_progress(f"Starting: {{step_name}}")

        try:
            # Simulate step execution
            time.sleep(duration)
            self.completed_steps += 1
            self.log_progress(f"Completed: {{step_name}}")
            return True
        except Exception as e:
            self.log_progress(f"Failed: {{step_name}} - {{e}}")
            return False

    def execute(self) -> bool:
        """
        Execute main task logic

        Returns:
            Whether the task was successfully completed
        """
        self.log_progress("=== Resear Pro Task Executor Started ===")
        self.log_progress(f"Task description: {self.prompt}")
        self.log_progress(f"Project name: {{self.config['project']['name']}}")

        # Define execution steps
        steps = [
            ("Environment initialization", 1.0),
            ("Configuration validation", 0.5),
            ("Dependency check", 1.0),
            ("Core logic execution", 2.0),
            ("Result verification", 1.0),
            ("Cleanup and optimization", 0.5)
        ]

        success_count = 0

        for i, (step_name, duration) in enumerate(steps, 1):
            self.log_progress(f"Executing step {{i}}/{{len(steps)}}: {{step_name}}")

            if self.execute_step(step_name, duration):
                success_count += 1
            else:
                self.log_progress(f"Step failed, but continuing execution...")

        # Generate execution report
        execution_time = (datetime.now() - self.start_time).total_seconds()
        success_rate = (success_count / len(steps)) * 100

        self.log_progress("=== Execution completed ===")
        self.log_progress(f"Total steps: {{len(steps)}}")
        self.log_progress(f"Successful steps: {{success_count}}")
        self.log_progress(f"Success rate: {{success_rate:.1f}}%")
        self.log_progress(f"Execution time: {{execution_time:.1f}}s")

        return success_rate >= 80  # 80% or higher success rate is considered successful

def main():
    """Main function"""
    print("Starting Resear Pro Task Executor...")

    executor = TaskExecutor()
    success = executor.execute()

    if success:
        print("\\n🎉 Task executed successfully!")
        exit(0)
    else:
        print("\\n❌ Task execution failed")
        exit(1)

if __name__ == "__main__":
    main()
'''

            py_id = self.emit_activity("file", "Creating main program file", filename="main.py", status="in-progress")
            self.wait_if_paused(1)
            self.emit_file_update("main.py", python_content)
            cmd = "touch main.py && chmod +x main.py"
            self.emit_terminal_output(cmd, "Python script created and made executable")
            self.update_activity_status(py_id, "completed")

            # 6. 执行主要任务步骤
            steps = [
                ("thinking", "Developing detailed execution plan", 2),
                ("command", "Installing project dependencies", "pip install -r requirements.txt"),
                ("edit", "Updating task progress", "todo.md"),
                ("command", "Running code analysis", "python -m flake8 main.py"),
                ("browse", "Viewing project documentation", "file:///docs/project-guide.md"),
                ("command", "Executing main program", "python main.py"),
                ("thinking", "Verifying execution results", 2),
                ("edit", "Updating final status", "todo.md"),
            ]

            for i, (step_type, step_text, *args) in enumerate(steps, 1):
                step_id = self.emit_activity(step_type, f"Step {i}: {step_text}", status="in-progress")

                if step_type == "thinking":
                    self.wait_if_paused(args[0] if args else 2)
                else:
                    self.wait_if_paused(1)

                if step_type == "command":
                    command = args[0] if args else ""
                    # 生成不同命令的模拟输出
                    if "pip install" in command:
                        output = """Collecting packages...
Looking in indexes: https://pypi.org/simple/
Collecting flask
  Downloading Flask-2.3.3-py3-none-any.whl (96 kB)
Collecting requests
  Downloading requests-2.31.0-py3-none-any.whl (62 kB)
Installing collected packages: flask, requests
Successfully installed flask-2.3.3 requests-2.31.0"""
                    elif "flake8" in command:
                        output = """Checking Python code style...
main.py:1:1: E302 expected 2 blank lines, found 1
main.py:45:80: E501 line too long (85 > 79 characters)
2 warnings found, but code quality is acceptable."""
                    elif "python main.py" in command:
                        output = f"""Starting Resear Pro Task Executor...
=== Resear Pro Task Executor Started ===
[{time.strftime('%H:%M:%S')}] Task description: {self.prompt}
[{time.strftime('%H:%M:%S')}] Project name: Resear Pro Task
[{time.strftime('%H:%M:%S')}] Executing step 1/6: Environment initialization
[{time.strftime('%H:%M:%S')}] Step 1: Starting: Environment initialization
[{time.strftime('%H:%M:%S')}] Step 1: Completed: Environment initialization
[{time.strftime('%H:%M:%S')}] Executing step 2/6: Configuration validation
[{time.strftime('%H:%M:%S')}] Step 2: Starting: Configuration validation
[{time.strftime('%H:%M:%S')}] Step 2: Completed: Configuration validation
[{time.strftime('%H:%M:%S')}] Executing step 3/6: Dependency check
[{time.strftime('%H:%M:%S')}] Step 3: Starting: Dependency check
[{time.strftime('%H:%M:%S')}] Step 3: Completed: Dependency check
[{time.strftime('%H:%M:%S')}] Executing step 4/6: Core logic execution
[{time.strftime('%H:%M:%S')}] Step 4: Starting: Core logic execution
[{time.strftime('%H:%M:%S')}] Step 4: Completed: Core logic execution
[{time.strftime('%H:%M:%S')}] Executing step 5/6: Result verification
[{time.strftime('%H:%M:%S')}] Step 5: Starting: Result verification
[{time.strftime('%H:%M:%S')}] Step 5: Completed: Result verification
[{time.strftime('%H:%M:%S')}] Executing step 6/6: Cleanup and optimization
[{time.strftime('%H:%M:%S')}] Step 6: Starting: Cleanup and optimization
[{time.strftime('%H:%M:%S')}] Step 6: Completed: Cleanup and optimization
=== Execution completed ===
[{time.strftime('%H:%M:%S')}] Total steps: 6
[{time.strftime('%H:%M:%S')}] Successful steps: 6
[{time.strftime('%H:%M:%S')}] Success rate: 100.0%
[{time.strftime('%H:%M:%S')}] Execution time: 6.1s

🎉 Task executed successfully!"""
                    else:
                        output = f"Command executed: {command}\\nOperation completed successfully."

                    self.emit_terminal_output(command, output)
                    self.update_activity_status(step_id, "completed", command=command)

                elif step_type == "edit":
                    if "todo.md" in args[0]:
                        if i <= 3:
                            # 第一次更新
                            updated_todo = self.file_content.replace(
                                "- [ ] Develop execution plan", "- [x] Develop execution plan"
                            ).replace(
                                "- [ ] Create project files", "- [x] Create project files"
                            )
                        else:
                            # 最终更新
                            updated_todo = self.file_content.replace(
                                "- [ ] Implement core functionality", "- [x] Implement core functionality"
                            ).replace(
                                "- [ ] Test and verify", "- [x] Test and verify"
                            ).replace(
                                "- [ ] Complete task", "- [x] Complete task"
                            ).replace(
                                "Status: In progress", f"Status: Completed\\nCompletion time: {time.strftime('%Y-%m-%d %H:%M:%S')}"
                            )

                        self.file_content = updated_todo
                        self.emit_file_update("todo.md", updated_todo)

                    self.update_activity_status(step_id, "completed", filename=args[0] if args else "")

                elif step_type == "browse":
                    self.update_activity_status(step_id, "completed", path=args[0] if args else "")
                else:
                    self.update_activity_status(step_id, "completed")

                self.wait_if_paused(0.5)

            # 7. 创建额外的文件来丰富文件结构
            # 创建 requirements.txt
            requirements_content = """Flask==2.3.3
requests==2.31.0
flake8==6.0.0
pytest==7.4.0"""
            req_id = self.emit_activity("file", "Creating dependencies file", filename="requirements.txt", status="in-progress")
            self.wait_if_paused(0.5)
            self.emit_file_update("requirements.txt", requirements_content)
            self.update_activity_status(req_id, "completed")

            # 创建 README.md
            readme_content = f"""# Resear Pro Task

## Task Description
{self.prompt}

## Project Structure
```
resear-pro-task/
├── todo.md          # Task checklist
├── config.json      # Project configuration
├── main.py          # Main program
├── requirements.txt # Python dependencies
└── README.md        # Project documentation
```

## How to Run
```bash
pip install -r requirements.txt
python main.py
```

## Generated at
{time.strftime('%Y-%m-%d %H:%M:%S')}
"""
            readme_id = self.emit_activity("file", "Creating project README file", filename="README.md", status="in-progress")
            self.wait_if_paused(0.5)
            self.emit_file_update("README.md", readme_content)
            self.update_activity_status(readme_id, "completed")

            # 8. 任务完成
            final_id = self.emit_activity("thinking", "Generating final report and completing task", status="in-progress")
            self.wait_if_paused(1)

            # 发送最终总结
            self.emit_terminal_output(
                "echo 'Task execution completed successfully'",
                f"""
=== Resear Pro Task Execution Report ===
Task ID: {self.task_id}
Start time: {time.strftime('%Y-%m-%d %H:%M:%S')}
Task description: {self.prompt}
Created files: {len(self.all_files)} ({', '.join(self.all_files.keys())})
Execution steps: {len(steps)}
Execution log: {len(self.execution_log)} entries
Status: ✅ Successfully completed

All files have been saved and execution log has been recorded.
Task execution completed successfully
"""
            )

            self.update_activity_status(final_id, "completed")
            self.emit_task_update("completed")

        except Exception as e:
            logger.error(f"Task {self.task_id} failed: {str(e)}")
            self.emit_activity("thinking", f"Task execution error: {str(e)}", status="error")
            self.emit_task_update("failed", error=str(e))


def create_task_export_zip(task_executor: TaskExecutor) -> bytes:
    """
    创建任务导出ZIP文件

    Args:
        task_executor: 任务执行器实例

    Returns:
        ZIP文件的字节数据
    """
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # 1. 添加所有创建的文件
        for filename, content in task_executor.all_files.items():
            zip_file.writestr(f"files/{filename}", content)

        # 2. 添加执行日志
        log_content = json.dumps(task_executor.execution_log, indent=2, ensure_ascii=False)
        zip_file.writestr("execution_log.json", log_content)

        # 3. 添加任务信息
        task_info = {
            "task_id": task_executor.task_id,
            "prompt": task_executor.prompt,
            "created_at": time.strftime('%Y-%m-%d %H:%M:%S'),
            "total_files": len(task_executor.all_files),
            "total_activities": len(task_executor.execution_log),
            "file_list": list(task_executor.all_files.keys()),
            "file_structure": task_executor.file_structure
        }
        zip_file.writestr("task_info.json", json.dumps(task_info, indent=2, ensure_ascii=False))

        # 4. 添加README说明文件
        readme_content = f"""# Resear Pro Task Export

## Task Information
- Task ID: {task_executor.task_id}
- Task Description: {task_executor.prompt}
- Export Time: {time.strftime('%Y-%m-%d %H:%M:%S')}

## File Structure
- `files/` - All files created during task execution
- `execution_log.json` - Detailed execution log
- `task_info.json` - Basic task information
- `README.md` - This documentation file

## Created Files
{chr(10).join(f"- {filename}" for filename in task_executor.all_files.keys())}

## Usage Instructions
1. All created files are in the `files/` directory
2. Check `execution_log.json` for detailed execution process
3. These files can be used directly or edited further

---
Generated by Resear Pro AI Assistant
"""
        zip_file.writestr("README.md", readme_content)

    zip_buffer.seek(0)
    return zip_buffer.getvalue()


# ==================== API 路由定义 ====================

@app.route('/api/tasks', methods=['POST'])
def create_task():
    """
    创建新的AI任务

    接收用户的任务描述，创建任务实例并开始异步执行
    """
    data = request.get_json()
    prompt = data.get('prompt', '')
    attachments = data.get('attachments', [])

    if not prompt.strip():
        return jsonify({'error': 'Prompt is required'}), 400

    # 生成唯一任务ID
    task_id = str(uuid.uuid4())
    task_queues[task_id] = queue.Queue()

    # 创建任务记录
    active_tasks[task_id] = {
        'id': task_id,
        'prompt': prompt,
        'attachments': attachments,
        'status': 'created',
        'created_at': time.time()
    }

    # 创建并启动任务执行器
    executor = TaskExecutor(task_id, prompt)
    task_executors[task_id] = executor

    thread = Thread(target=executor.execute_task)
    thread.daemon = True
    thread.start()

    logger.info(f"Created task {task_id}: {prompt[:50]}...")

    return jsonify({
        'task_id': task_id,
        'status': 'created'
    })


@app.route('/api/tasks/<task_id>/stream')
def stream_task(task_id):
    """
    流式输出任务执行进度

    使用Server-Sent Events (SSE) 实时推送任务执行状态
    """

    def generate():
        if task_id not in task_queues:
            yield f"data: {json.dumps({'error': 'Task not found'})}\n\n"
            return

        task_queue = task_queues[task_id]
        logger.info(f"Started streaming for task {task_id}")

        try:
            while True:
                try:
                    # 等待新消息，超时后检查任务状态
                    message = task_queue.get(timeout=30)
                    yield f"data: {json.dumps(message)}\n\n"

                    # 如果任务完成或失败，发送完成信号后优雅退出
                    if (message.get('type') == 'task_update' and
                            message.get('data', {}).get('status') in ['completed', 'failed']):
                        # 发送最终状态消息
                        final_status = message.get('data', {}).get('status')
                        yield f"data: {json.dumps({'type': 'connection_close', 'reason': f'task_{final_status}'})}\n\n"
                        logger.info(f"Task {task_id} {final_status}, closing stream")
                        break

                except queue.Empty:
                    # 发送心跳保持连接
                    yield f"data: {json.dumps({'type': 'heartbeat', 'timestamp': time.time()})}\n\n"
                    continue

        except Exception as e:
            logger.error(f"Stream error for task {task_id}: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Stream connection error'})}\n\n"
        finally:
            # 清理资源
            #if task_id in task_queues:
                #del task_queues[task_id]
            #if task_id in active_tasks:
                #del active_tasks[task_id]
            #if task_id in task_executors:
                #del task_executors[task_id]
            logger.info(f"Cleaned up resources for task {task_id}")

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        }
    )


@app.route('/api/tasks/<task_id>/pause', methods=['POST'])
def pause_task(task_id):
    """
    暂停或恢复任务执行
    """
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404

    executor = task_executors[task_id]

    if executor.is_paused:
        executor.resume_task()
        status = 'resumed'
    else:
        executor.pause_task()
        status = 'paused'

    return jsonify({
        'task_id': task_id,
        'status': status,
        'is_paused': executor.is_paused
    })


@app.route('/api/tasks/<task_id>/export')
def export_task(task_id):
    """
    导出任务的所有文件和执行记录

    生成包含所有创建文件、执行日志和任务信息的ZIP文件
    """
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404

    try:
        executor = task_executors[task_id]
        zip_data = create_task_export_zip(executor)

        response = Response(
            zip_data,
            mimetype='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename=resear-pro-task-{task_id}.zip',
                'Content-Length': str(len(zip_data))
            }
        )

        logger.info(f"Exported task {task_id} ({len(zip_data)} bytes)")
        return response

    except Exception as e:
        logger.error(f"Export failed for task {task_id}: {str(e)}")
        return jsonify({'error': 'Export failed'}), 500


@app.route('/api/tasks/<task_id>')
def get_task(task_id):
    """获取任务详细信息"""
    if task_id not in active_tasks:
        return jsonify({'error': 'Task not found'}), 404

    task_info = active_tasks[task_id].copy()

    # 添加执行器状态信息
    if task_id in task_executors:
        executor = task_executors[task_id]
        task_info.update({
            'is_paused': executor.is_paused,
            'files_created': len(executor.all_files),
            'activities_count': len(executor.execution_log),
            'file_structure': executor.file_structure
        })

    return jsonify(task_info)


@app.route('/api/tasks')
def list_tasks():
    """列出所有活跃任务"""
    return jsonify(list(active_tasks.values()))


@app.route('/api/health')
def health_check():
    """系统健康检查"""
    return jsonify({
        'status': 'healthy',
        'active_tasks': len(active_tasks),
        'running_executors': len(task_executors),
        'timestamp': time.time(),
        'version': '1.0.0'
    })


# ==================== 应用启动 ====================

if __name__ == '__main__':
    logger.info("Starting Resear Pro AI Assistant Backend...")
    logger.info("API endpoints:")
    logger.info("  POST /api/tasks - Create new task")
    logger.info("  GET  /api/tasks/<id>/stream - Stream task progress")
    logger.info("  POST /api/tasks/<id>/pause - Pause/Resume task")
    logger.info("  GET  /api/tasks/<id>/export - Export task files")
    logger.info("  GET  /api/tasks/<id> - Get task info")
    logger.info("  GET  /api/health - Health check")

    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)