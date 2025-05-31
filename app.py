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

# 示例多媒体内容 - 使用真实URL
SAMPLE_MEDIA = {
    'research_paper.pdf': {
        'type': 'pdf',
        'url': 'https://openreview.net/pdf?id=bjcsVLoHYs',
        'description': 'A research paper on neural networks from OpenReview'
    },
    'brand_logo.png': {
        'type': 'image',
        'url': 'https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png',
        'description': 'Brand logo image for demonstration'
    },
    'demo_chart.svg': {
        'type': 'image',
        'content': '''<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="50" y="50" width="60" height="150" fill="#3b82f6"/>
  <rect x="130" y="80" width="60" height="120" fill="#06d6a0"/>
  <rect x="210" y="100" width="60" height="100" fill="#f72585"/>
  <rect x="290" y="70" width="60" height="130" fill="#ffd60a"/>
  <text x="200" y="30" text-anchor="middle" font-family="Arial" font-size="16" fill="#1e293b">Sample Chart Data</text>
  <text x="80" y="230" text-anchor="middle" font-size="12" fill="#64748b">Q1</text>
  <text x="160" y="230" text-anchor="middle" font-size="12" fill="#64748b">Q2</text>
  <text x="240" y="230" text-anchor="middle" font-size="12" fill="#64748b">Q3</text>
  <text x="320" y="230" text-anchor="middle" font-size="12" fill="#64748b">Q4</text>
</svg>''',
        'description': 'A sample chart for data visualization demo'
    },
    'demo_page.html': {
        'type': 'html',
        'content': '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>演示页面 - Resear Pro</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 2rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        h1 { 
            color: #fff; 
            text-align: center; 
            font-size: 2.5rem;
            margin-bottom: 1rem;
        }
        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin: 2rem 0;
        }
        .feature-card {
            background: rgba(255, 255, 255, 0.2);
            padding: 1.5rem;
            border-radius: 15px;
            text-align: center;
            transition: transform 0.3s ease;
        }
        .feature-card:hover {
            transform: translateY(-5px);
        }
        .emoji { font-size: 3rem; margin-bottom: 1rem; }
        button {
            background: linear-gradient(45deg, #ff6b6b, #ee5a24);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 25px;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 10px;
        }
        button:hover {
            transform: scale(1.05);
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        }
        .demo-section {
            background: rgba(255, 255, 255, 0.1);
            padding: 1.5rem;
            border-radius: 15px;
            margin: 1.5rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Resear Pro 演示页面</h1>
        
        <div class="demo-section">
            <h2>🎯 多媒体支持展示</h2>
            <p>这是一个现代化的HTML演示页面，展示了Resear Pro的多媒体文件支持能力。</p>
        </div>

        <div class="feature-grid">
            <div class="feature-card">
                <div class="emoji">📄</div>
                <h3>PDF 查看器</h3>
                <p>支持直接在界面中查看PDF文档，无需外部软件。</p>
            </div>
            
            <div class="feature-card">
                <div class="emoji">🖼️</div>
                <h3>图像显示</h3>
                <p>支持多种图像格式的实时预览和显示。</p>
            </div>
            
            <div class="feature-card">
                <div class="emoji">🌐</div>
                <h3>HTML 预览</h3>
                <p>即时HTML页面渲染，支持代码和预览双模式。</p>
            </div>
            
            <div class="feature-card">
                <div class="emoji">📊</div>
                <h3>数据可视化</h3>
                <p>SVG图表和交互式数据展示功能。</p>
            </div>
        </div>

        <div class="demo-section">
            <h2>⚡ 交互功能测试</h2>
            <button onclick="showAlert()">点击测试JavaScript</button>
            <button onclick="changeColor()">改变背景色</button>
            <button onclick="addTimestamp()">添加时间戳</button>
            
            <div id="output" style="margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 10px;">
                <p>交互输出区域：等待用户操作...</p>
            </div>
        </div>

        <div class="demo-section">
            <h2>📝 实时编辑测试</h2>
            <p>您可以在代码模式下编辑此HTML文件，然后切换到预览模式查看效果。</p>
            <p><strong>创建时间：</strong> <span id="timestamp"></span></p>
        </div>
    </div>

    <script>
        // 设置创建时间
        document.getElementById('timestamp').textContent = new Date().toLocaleString();
        
        function showAlert() {
            document.getElementById('output').innerHTML = 
                '<p style="color: #4CAF50;">✅ JavaScript 功能正常运行！</p>';
        }
        
        function changeColor() {
            const colors = [
                'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
            ];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            document.body.style.background = randomColor;
            document.getElementById('output').innerHTML = 
                '<p style="color: #FF9800;">🎨 背景颜色已更改！</p>';
        }
        
        function addTimestamp() {
            const now = new Date().toLocaleTimeString();
            document.getElementById('output').innerHTML = 
                `<p style="color: #2196F3;">⏰ 当前时间：${now}</p>`;
        }
    </script>
</body>
</html>''',
        'description': 'Interactive HTML demonstration page with modern styling'
    }
}


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
        self.file_structure = {
            "name": "resear-pro-task",
            "type": "directory", 
            "children": []
        }  # 文件结构
        self.task_status = "created"  # 添加任务状态追踪
        self.step_interval = 3.0  # 每步间隔3秒
        self.messages_sent = 0  # 消息序号计数器
        self.is_running = False  # 运行状态标志

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
        
        logger.info(f"Task {self.task_id} - Activity: {activity}")
        # 记录到执行日志
        self.execution_log.append(activity)

        # 发送到前端
        self._send_message("activity", activity)

        return activity_id

    def update_activity_status(self, activity_id: int, status: str, **kwargs):
        """
        更新活动状态

        Args:
            activity_id: 活动ID
            status: 新状态 (completed, failed, in-progress)
            **kwargs: 其他更新参数
        """
        update_data = {
            "id": activity_id,
            "status": status,
            **kwargs
        }
        self._send_message("activity_update", update_data)

    def _send_message(self, msg_type: str, data: dict):
        """
        发送消息到队列的统一方法
        
        Args:
            msg_type: 消息类型
            data: 消息数据
        """
        if self.task_id in task_queues:
            message = {
                "type": msg_type,
                "data": data,
                "sequence": self.messages_sent
            }
            task_queues[self.task_id].put(message)
            self.messages_sent += 1
            logger.info(f"消息已发送: {msg_type}, 序号: {self.messages_sent}, 任务: {self.task_id}")

    def emit_file_update(self, filename: str, content: str):
        """
        发送文件内容更新

        Args:
            filename: 文件名
            content: 文件内容
        """
        # 保存文件到内存
        self.all_files[filename] = content
        
        # 先更新文件结构
        self.update_file_structure()

        # 1. 先发送文件结构更新
        self._send_message("file_structure_update", self.file_structure)
        
        # 2. 然后发送文件内容更新
        file_data = {
            "filename": filename,
            "content": content
        }
        self._send_message("file_update", file_data)
        
        # 3. 设置当前活动文件（用于前端显示）
        self.current_file = filename
        self.file_content = content

    def update_file_structure(self):
        """更新文件结构（不自动发送到前端）"""
        # 构建文件结构，文件路径与file_update中的路径保持一致
        structure = {
            "name": "resear-pro-task",
            "type": "directory",
            "children": []
        }

        # 按文件夹组织文件，保持与file_update相同的路径格式
        folders = {}
        for filename in self.all_files.keys():
            parts = filename.split('/')
            if len(parts) > 1:
                folder = parts[0]
                if folder not in folders:
                    folders[folder] = []
                folders[folder].append('/'.join(parts[1:]))
            else:
                # 直接在根目录的文件，使用原始文件名（不加resear-pro-task前缀）
                structure["children"].append({
                    "name": filename,  # 保持与file_update一致的路径
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
        # 移除自动发送，现在由emit_file_update统一控制

    def emit_terminal_output(self, command: str, output: str, status: str = "completed"):
        """
        发送终端输出

        Args:
            command: 执行的命令
            output: 命令输出结果
            status: 执行状态
        """
        terminal_data = {
            "command": command,
            "output": output,
            "status": status,
            "timestamp": time.time()
        }
        self._send_message("terminal", terminal_data)

    def emit_task_update(self, status: str, **kwargs):
        """
        发送任务状态更新

        Args:
            status: 任务状态 (started, completed, failed, paused)
            **kwargs: 其他状态信息
        """
        # 更新内部状态
        self.task_status = status
        
        task_data = {
            "status": status,
            **kwargs
        }
        self._send_message("task_update", task_data)

    def pause_task(self):
        """暂停任务执行"""
        self.is_paused = True
        logger.info(f"Task {self.task_id} paused")

    def resume_task(self):
        """恢复任务执行"""
        self.is_paused = False
        logger.info(f"Task {self.task_id} resumed")

    def wait_if_paused(self, duration: float = None):
        """
        检查暂停状态，如果暂停则等待

        Args:
            duration: 等待时长，默认使用step_interval
        """
        if duration is None:
            duration = self.step_interval
            
        if self.is_paused:
            while self.is_paused:
                time.sleep(0.5)  # 暂停期间每0.5秒检查一次
        else:
            time.sleep(duration)

    def execute_step(self, step_num: int, activity_type: str, text: str, **kwargs):
        """
        执行单个步骤的通用方法
        
        Args:
            step_num: 步骤号
            activity_type: 活动类型
            text: 步骤描述
            **kwargs: 其他参数
        """
        logger.info(f"Task {self.task_id} - Step {step_num}: {text}")
        
        # 发送活动开始
        activity_id = self.emit_activity(activity_type, f"Step {step_num}: {text}", 
                                       status="in-progress", **kwargs)
        
        # 等待（检查暂停状态）
        self.wait_if_paused()
        logger.info(f"SUCCESS Task {self.task_id} - Step {step_num}: {text}")
        # 标记完成
        self.update_activity_status(activity_id, "completed")
        
        return activity_id

    def execute_task(self):
        """
        重构后的任务执行流程 - 简化为10个主要步骤，每步3秒间隔
        """
        self.is_running = True
        try:
            # 任务开始
            self.emit_task_update("started")
            
            # 步骤1：任务分析和初始化
            self.execute_step(1, "thinking", "分析任务需求并初始化多媒体工作环境")
            
            # 步骤2：创建工作目录
            command = "mkdir -p workspace/media && cd workspace"
            activity_id = self.execute_step(2, "command", "创建多媒体工作空间", command=command)
            self.emit_terminal_output(command, 
                "✅ 工作目录创建成功\n📁 多媒体工作空间已初始化\n🎯 准备支持PDF、图片和交互内容")

            # 步骤3：创建任务清单文件
            todo_content = f"""# Task: {self.prompt}

## 📋 任务进度
- [x] 分析用户需求
- [x] 设置多媒体工作空间
- [ ] 创建实时多媒体演示
- [ ] 生成PDF和图像内容
- [ ] 创建交互示例
- [ ] 测试多媒体支持
- [ ] 完成任务

## 🎯 多媒体演示功能
- 📸 真实图像显示 (brand_logo.png)
- 📄 实时PDF查看 (research_paper.pdf) 
- 📊 交互式图表和图形
- 🎨 SVG图形和数据可视化

## 🌐 实时演示源
- PDF: https://openreview.net/pdf?id=bjcsVLoHYs
- 图像: https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png

## 📊 执行记录
开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}
状态: 🟡 进行中
"""
            self.execute_step(3, "file", "创建任务清单文件", filename="todo.md")
            self.emit_file_update("todo.md", todo_content)
            self.file_content = todo_content

            # 步骤4：创建配置文件
            config_content = json.dumps({
                "project": {
                    "name": "Resear Pro Task - 真实多媒体版",
                    "version": "2.0.0",
                    "description": "AI研究助手与真实多媒体支持",
                    "created": time.strftime('%Y-%m-%d %H:%M:%S')
                },
                "multimedia": {
                    "real_urls": True,
                    "pdf_source": "https://openreview.net/pdf?id=bjcsVLoHYs",
                    "image_source": "https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png",
                    "preview_enabled": True
                },
                "task": {
                    "description": self.prompt,
                    "priority": "normal",
                    "multimedia_demo": True
                }
            }, indent=2, ensure_ascii=False)
            
            self.execute_step(4, "file", "创建项目配置文件", filename="config.json")
            self.emit_file_update("config.json", config_content)

            # 步骤5：创建多媒体文件
            self.execute_step(5, "thinking", "下载并准备真实多媒体文件")
            
            # 创建多媒体文件
            for filename, media_info in SAMPLE_MEDIA.items():
                if 'url' in media_info:
                    content = media_info['url']
                elif 'content' in media_info:
                    content = media_info['content']
                else:
                    content = f'Content for {filename}'
                self.emit_file_update(filename, content)

            # 步骤6：验证多媒体链接
            command = "curl -I https://openreview.net/pdf?id=bjcsVLoHYs"
            self.execute_step(6, "command", "验证PDF文档可访问性", command=command)
            self.emit_terminal_output(command, 
                "HTTP/2 200 OK\ncontent-type: application/pdf\n✅ PDF文档可访问且准备就绪\n📄 研究论文加载成功")

            # 步骤7：创建演示报告
            demo_content = f"""# 🎯 真实多媒体演示报告

## 任务概述
**任务:** {self.prompt}  
**创建时间:** {time.strftime('%Y-%m-%d %H:%M:%S')}  
**状态:** ✅ 进行中

## 🎥 实时多媒体能力

### 📸 真实图像支持
来自网络的实际图像显示：
![品牌Logo](https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png)

### 📊 交互式数据可视化
SVG实时图表渲染：
![演示图表](demo_chart.svg)

### 📄 实时PDF文档查看
带完整查看器功能的真实研究论文：
[查看研究论文](https://openreview.net/pdf?id=bjcsVLoHYs)

## ✨ 功能展示
- ✅ 网络URL实时图像加载
- ✅ 实时PDF文档查看与导航
- ✅ 交互式SVG图表渲染
- ✅ 嵌入媒体的Markdown预览

---
*由Resear Pro AI助手生成 - 真实多媒体URL版* 🚀
"""
            self.execute_step(7, "file", "创建多媒体演示报告", filename="demo_report.md")
            self.emit_file_update("demo_report.md", demo_content)

            # 步骤8：运行多媒体集成测试
            command = "python test_multimedia.py"
            self.execute_step(8, "command", "运行多媒体集成测试", command=command)
            self.emit_terminal_output(command, 
                """🧪 测试真实多媒体集成...
✅ PDF查看器: 成功加载OpenReview论文
✅ 图像显示: 品牌logo正确渲染  
✅ SVG图表: 交互式图形正常工作
✅ Markdown预览: 媒体链接正确嵌入

=== 多媒体测试结果 ===
PDF加载: ✅ 通过 (2.3s)
图像加载: ✅ 通过 (0.8s) 
SVG渲染: ✅ 通过 (0.2s)
URL验证: ✅ 通过

🎉 所有真实多媒体功能完美运行！""")

            # 步骤9：更新任务进度
            updated_todo = self.file_content.replace(
                "- [ ] 创建实时多媒体演示", "- [x] 创建实时多媒体演示"
            ).replace(
                "- [ ] 生成PDF和图像内容", "- [x] 生成PDF和图像内容"
            ).replace(
                "- [ ] 创建交互示例", "- [x] 创建交互示例"
            ).replace(
                "- [ ] 测试多媒体支持", "- [x] 测试多媒体支持"
            ).replace(
                "- [ ] 完成任务", "- [x] 完成任务"
            ).replace(
                "状态: 🟡 进行中", 
                f"状态: ✅ 已完成\n完成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}"
            )
            
            self.execute_step(9, "edit", "更新任务完成状态", filename="todo.md")
            self.emit_file_update("todo.md", updated_todo)
            self.file_content = updated_todo

            # 步骤10：生成最终报告
            self.execute_step(10, "thinking", "生成任务完成报告和总结")
            
            # 发送最终总结
            self.emit_terminal_output(
                "echo '真实多媒体任务执行完成'",
                f"""
🎊 === Resear Pro 真实多媒体任务执行报告 ===

📋 任务信息
任务ID: {self.task_id[:8]}...
任务描述: {self.prompt}
完成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}

📊 统计数据
创建文件: {len(self.all_files)} 个
多媒体文件: {len(SAMPLE_MEDIA)} 个
执行步骤: 10 步
总耗时: 约30秒

🌐 实时多媒体源
📄 PDF: https://openreview.net/pdf?id=bjcsVLoHYs
🖼️ 图像: https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png

✅ 任务状态: 成功完成
🎯 所有真实多媒体文件准备就绪，可在仪表板中查看！
"""
            )

            # 任务完成
            self.emit_task_update("completed")
            logger.info(f"Task {self.task_id} completed successfully")

        except Exception as e:
            logger.error(f"Task {self.task_id} failed: {str(e)}")
            self.emit_activity("thinking", f"任务执行错误: {str(e)}", status="error")
            self.emit_task_update("failed", error=str(e))
        finally:
            self.is_running = False

    def emit_file_delete(self, filename: str):
        """发送文件删除事件"""
        if filename in self.all_files:
            del self.all_files[filename]
        self.update_file_structure()
        
        self._send_message("file_delete", {"filename": filename})

    def emit_file_rename(self, old_name: str, new_name: str):
        """发送文件重命名事件"""
        if old_name in self.all_files:
            content = self.all_files[old_name]
            del self.all_files[old_name]
            self.all_files[new_name] = content
        
        self.update_file_structure()
        
        rename_data = {
            "old_name": old_name,
            "new_name": new_name
        }
        self._send_message("file_rename", rename_data)

    def create_folder(self, folder_name: str, parent_path: str = ''):
        """创建文件夹"""
        full_path = folder_name if not parent_path or parent_path == 'resear-pro-task' else f"{parent_path}/{folder_name}"
        self.update_file_structure_for_folder(full_path)
        
        folder_data = {
            "folder_name": full_path,
            "parent_path": parent_path
        }
        self._send_message("folder_create", folder_data)

    def update_file_structure_for_folder(self, folder_path: str):
        """为文件夹更新文件结构"""
        path_parts = [part for part in folder_path.split('/') if part != 'resear-pro-task' and part != '']
        
        current = self.file_structure
        if not current.get("children"):
            current["children"] = []
        
        for i, part in enumerate(path_parts):
            existing = None
            for child in current["children"]:
                if child["name"] == part and child["type"] == "directory":
                    existing = child
                    break
            
            if not existing:
                new_folder = {
                    "name": part,
                    "type": "directory",
                    "children": []
                }
                current["children"].append(new_folder)
                current = new_folder
            else:
                current = existing
        
        self._send_message("file_structure_update", self.file_structure)


def create_task_export_zip(task_executor: TaskExecutor) -> bytes:
    """创建任务导出ZIP文件"""
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # 添加所有创建的文件
        for filename, content in task_executor.all_files.items():
            zip_file.writestr(f"files/{filename}", content)

        # 添加执行日志
        log_content = json.dumps(task_executor.execution_log, indent=2, ensure_ascii=False)
        zip_file.writestr("execution_log.json", log_content)

        # 添加任务信息
        task_info = {
            "task_id": task_executor.task_id,
            "prompt": task_executor.prompt,
            "created_at": time.strftime('%Y-%m-%d %H:%M:%S'),
            "total_files": len(task_executor.all_files),
            "total_activities": len(task_executor.execution_log),
            "file_list": list(task_executor.all_files.keys()),
            "file_structure": task_executor.file_structure,
            "multimedia_support": True,
            "real_urls": True
        }
        zip_file.writestr("task_info.json", json.dumps(task_info, indent=2, ensure_ascii=False))

        # 添加README
        readme_content = f"""# Resear Pro 真实多媒体任务导出

## 任务信息
- 任务ID: {task_executor.task_id}
- 任务描述: {task_executor.prompt}
- 导出时间: {time.strftime('%Y-%m-%d %H:%M:%S')}

## 文件结构
- `files/` - 任务执行期间创建的所有文件
- `execution_log.json` - 详细执行日志
- `task_info.json` - 任务信息和元数据

## 创建的文件
{chr(10).join(f"- {filename}" for filename in task_executor.all_files.keys())}

---
由Resear Pro AI助手生成 - 真实多媒体版 🚀
"""
        zip_file.writestr("README.md", readme_content)

    zip_buffer.seek(0)
    return zip_buffer.getvalue()


# ==================== API 路由定义 ====================

@app.route('/api/tasks', methods=['POST'])
def create_task():
    """创建新的AI任务"""
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
        'created_at': time.time(),
        'multimedia_support': True,
        'real_urls': True
    }

    # 创建任务执行器（但不立即启动）
    executor = TaskExecutor(task_id, prompt)
    task_executors[task_id] = executor

    logger.info(f"Created task {task_id}: {prompt[:50]}...")

    return jsonify({
        'task_id': task_id,
        'status': 'created',
        'multimedia_support': True,
        'real_urls': True
    })


@app.route('/api/tasks/<task_id>/connect', methods=['POST'])
def connect_task(task_id):
    """连接并开始执行任务（POST模式）"""
    logger.info(f"Frontend connecting to task: {task_id}")
    
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404
    
    def generate_chunked_response():
        """生成分块响应"""
        executor = task_executors[task_id]
        task_queue = task_queues[task_id]
        
        # 启动任务执行（如果还没有启动）
        if not executor.is_running:
            logger.info(f"Starting task execution thread for {task_id}...")
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
                    
                    logger.info(f"Sending to frontend: Message {message_count}, Type: {message.get('type')}, Task: {task_id}")
                    
                    # 发送消息（使用换行符分隔）
                    chunk = json.dumps(message) + '\n'
                    yield chunk
                    
                    # 如果任务完成或失败，结束连接
                    if (message.get('type') == 'task_update' and 
                        message.get('data', {}).get('status') in ['completed', 'failed']):
                        logger.info(f"Task {task_id} completed, sent {message_count} messages total")
                        break
                        
                except queue.Empty:
                    # 发送心跳
                    heartbeat = json.dumps({'type': 'heartbeat', 'timestamp': time.time()}) + '\n'
                    yield heartbeat
                    continue
                    
        except Exception as e:
            logger.error(f"Connection error for task {task_id}: {e}")
            error_msg = json.dumps({'type': 'error', 'message': str(e)}) + '\n'
            yield error_msg
        finally:
            # 清理资源
            logger.info(f"Cleaning up resources for task {task_id}")
            if task_id in task_queues:
                del task_queues[task_id]
            if task_id in task_executors:
                del task_executors[task_id]
            if task_id in active_tasks:
                del active_tasks[task_id]
    
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

@app.route('/api/tasks/<task_id>/pause', methods=['POST'])
def pause_task(task_id):
    """暂停或恢复任务执行"""
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
    """导出任务的所有文件和执行记录"""
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

    if task_id in task_executors:
        executor = task_executors[task_id]
        task_info.update({
            'is_paused': executor.is_paused,
            'files_created': len(executor.all_files),
            'activities_count': len(executor.execution_log),
            'file_structure': executor.file_structure,
            'multimedia_support': True,
            'real_urls': True
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
        'version': '2.1.0',
        'communication_mode': 'POST + Chunked Transfer',
        'features': ['real-multimedia', 'live-urls', 'post-streaming', 'reliable-messaging']
    })

# ==================== 应用启动 ====================

if __name__ == '__main__':
    logger.info("Starting Resear Pro AI Assistant Backend...")
    logger.info("Features: Real multimedia URLs, 10-step execution, 3s intervals")
    logger.info("Communication Mode: POST + Chunked Transfer (Reliable messaging)")
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)