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
        # 更新内部状态
        self.task_status = status
        
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

    def emit_file_delete(self, filename: str):
        """
        发送文件删除事件

        Args:
            filename: 被删除的文件名
        """
        # 从文件存储中删除
        if filename in self.all_files:
            del self.all_files[filename]
        
        # 更新文件结构
        self.update_file_structure()
        
        if self.task_id in task_queues:
            task_queues[self.task_id].put({
                "type": "file_delete",
                "data": {
                    "filename": filename
                }
            })

    def emit_file_rename(self, old_name: str, new_name: str):
        """
        发送文件重命名事件

        Args:
            old_name: 原文件名
            new_name: 新文件名
        """
        # 重命名文件存储
        if old_name in self.all_files:
            content = self.all_files[old_name]
            del self.all_files[old_name]
            self.all_files[new_name] = content
        
        # 更新文件结构
        self.update_file_structure()
        
        if self.task_id in task_queues:
            task_queues[self.task_id].put({
                "type": "file_rename",
                "data": {
                    "old_name": old_name,
                    "new_name": new_name
                }
            })

    def create_folder(self, folder_name: str, parent_path: str = ''):
        """
        创建文件夹

        Args:
            folder_name: 文件夹名称
            parent_path: 父路径
        """
        # 计算完整路径
        full_path = folder_name if not parent_path or parent_path == 'resear-pro-task' else f"{parent_path}/{folder_name}"
        
        # 更新文件结构（文件夹不需要在all_files中存储）
        self.update_file_structure_for_folder(full_path)
        
        # 发送文件夹创建事件
        if self.task_id in task_queues:
            task_queues[self.task_id].put({
                "type": "folder_create",
                "data": {
                    "folder_name": full_path,
                    "parent_path": parent_path
                }
            })

    def update_file_structure_for_folder(self, folder_path: str):
        """为文件夹更新文件结构"""
        path_parts = [part for part in folder_path.split('/') if part != 'resear-pro-task' and part != '']
        
        current = self.file_structure
        if not current.get("children"):
            current["children"] = []
        
        # 遍历路径创建文件夹结构
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
        
        # 发送文件结构更新
        if self.task_id in task_queues:
            task_queues[self.task_id].put({
                "type": "file_structure_update",
                "data": self.file_structure
            })

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

    def create_media_files(self):
        """创建示例多媒体文件"""
        media_files_created = []

        for filename, media_info in SAMPLE_MEDIA.items():
            file_id = self.emit_activity("file", f"Creating media file: {filename}", filename=filename,
                                         status="in-progress")
            self.wait_if_paused(1)

            # 根据媒体类型处理内容
            if 'url' in media_info:
                # 使用真实的URL
                self.emit_file_update(filename, media_info['url'])
            elif 'content' in media_info:
                # 使用提供的内容（如SVG）
                self.emit_file_update(filename, media_info['content'])
            else:
                # 默认文本内容
                self.emit_file_update(filename, f'Content for {filename}')

            self.update_activity_status(file_id, "completed")
            media_files_created.append(filename)

        return media_files_created

    def execute_task(self):
        """
        执行任务的主要逻辑
        模拟完整的AI助手工作流程
        """
        try:
            # 1. 任务开始
            self.emit_task_update("started")
            thinking_id = self.emit_activity("thinking", "Analyzing task requirements and preparing multimedia demo...",
                                             status="in-progress")
            self.wait_if_paused(2)
            self.update_activity_status(thinking_id, "completed")

            # 2. 创建工作环境
            cmd_id = self.emit_activity("command", "Creating workspace with multimedia support", status="in-progress")
            command = "mkdir -p workspace/media && cd workspace"
            self.wait_if_paused(1)
            self.emit_terminal_output(command,
                                      "Directory created successfully\nMultimedia workspace initialized\nReady for PDF, images, and interactive content")
            self.update_activity_status(cmd_id, "completed", command=command)

            # 3. 创建任务清单文件 (todo.md)
            initial_todo = f"""# Task: {self.prompt}

## Task Analysis
- [x] Understand user requirements
- [x] Setup multimedia workspace
- [ ] Create real multimedia demos
- [ ] Generate PDF and image content
- [ ] Create interactive examples
- [ ] Test multimedia support
- [ ] Complete task

## Multimedia Demo Features
- 📸 Real image display (brand_logo.png)
- 📄 Live PDF viewing (research_paper.pdf) 
- 📊 Interactive charts and graphs
- 🎨 SVG graphics and data visualization

## Live Demo Sources
- PDF: https://openreview.net/pdf?id=bjcsVLoHYs
- Image: https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png

## Execution Log
Start time: {time.strftime('%Y-%m-%d %H:%M:%S')}
Status: In progress with real multimedia content

## File List
- todo.md (Task checklist)
- config.json (Configuration file)
- main.py (Main program file)
- research_paper.pdf (Real PDF from OpenReview)
- brand_logo.png (Real image from web)
- demo_chart.svg (Interactive chart)
"""

            self.current_file = "todo.md"
            self.file_content = initial_todo

            file_id = self.emit_activity("file", "Creating enhanced task checklist with real URLs", filename="todo.md",
                                         status="in-progress")
            self.wait_if_paused(1)
            self.emit_file_update("todo.md", initial_todo)
            self.update_activity_status(file_id, "completed")

            # 4. 创建多媒体演示文件
            media_thinking_id = self.emit_activity("thinking", "Downloading and preparing real multimedia files...",
                                                   status="in-progress")
            self.wait_if_paused(2)
            self.update_activity_status(media_thinking_id, "completed")

            created_media = self.create_media_files()

            # 5. 创建配置文件
            config_content = json.dumps({
                "project": {
                    "name": "Resear Pro Task - Real Multimedia Edition",
                    "version": "2.0.0",
                    "description": "AI research assistant with real multimedia support",
                    "created": time.strftime('%Y-%m-%d %H:%M:%S')
                },
                "settings": {
                    "debug": True,
                    "auto_save": True,
                    "max_retries": 3,
                    "features": ["streaming", "real-time", "multi-file", "multimedia", "real-pdf-viewer",
                                 "live-images"],
                    "supported_formats": ["txt", "md", "json", "py", "js", "css", "png", "jpg", "gif", "svg", "pdf",
                                          "mp4", "webm"]
                },
                "multimedia": {
                    "real_urls": True,
                    "pdf_source": "https://openreview.net/pdf?id=bjcsVLoHYs",
                    "image_source": "https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png",
                    "preview_enabled": True
                },
                "execution": {
                    "max_steps": 15,
                    "timeout": 600,
                    "retry_count": 3,
                    "parallel_processing": True
                },
                "task": {
                    "description": self.prompt,
                    "priority": "normal",
                    "estimated_duration": "10-15 minutes",
                    "multimedia_demo": True,
                    "created_media": created_media
                }
            }, indent=2, ensure_ascii=False)

            config_id = self.emit_activity("file", "Creating project configuration with real URLs",
                                           filename="config.json", status="in-progress")
            self.wait_if_paused(1)
            self.emit_file_update("config.json", config_content)
            self.update_activity_status(config_id, "completed")

            # 6. 创建 Markdown 演示文件
            markdown_content = f"""# Real Multimedia Demo Report

## Task Overview
**Task:** {self.prompt}  
**Created:** {time.strftime('%Y-%m-%d %H:%M:%S')}  
**Status:** ✅ In Progress

## Live Multimedia Capabilities

### 📸 Real Image Support
Displaying actual images from the web:

![Brand Logo](https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png)

### 📊 Interactive Data Visualization
Live chart rendering with SVG:

![Demo Chart](demo_chart.svg)

### 📄 Live PDF Document Viewing
Real research paper with full viewer functionality:

[View Research Paper](https://openreview.net/pdf?id=bjcsVLoHYs)

## Real Demo Sources
- **PDF Document**: OpenReview research paper on neural networks
- **Brand Image**: Live web image with proper loading
- **Interactive Chart**: SVG-based data visualization

## Features Demonstrated
- ✅ Real-time image loading from web URLs
- ✅ Live PDF document viewing with navigation
- ✅ Interactive SVG chart rendering
- ✅ Markdown preview with embedded media
- ✅ Multi-tab file management system
- ✅ Responsive multimedia layout

## Technical Implementation
- Direct URL integration for media files
- PDF.js powered document viewer
- Native image loading with error handling
- SVG graphics for interactive charts

---
*Generated by Resear Pro AI Assistant with Real Multimedia URLs*
"""

            md_id = self.emit_activity("file", "Creating multimedia demonstration with real sources",
                                       filename="demo_report.md", status="in-progress")
            self.wait_if_paused(1)
            self.emit_file_update("demo_report.md", markdown_content)
            self.update_activity_status(md_id, "completed")

            # 7. 执行主要任务步骤
            steps = [
                ("thinking", "Verifying multimedia URL accessibility", 2),
                ("command", "Testing PDF document access", "curl -I https://openreview.net/pdf?id=bjcsVLoHYs"),
                ("edit", "Updating task progress with live content", "todo.md"),
                ("command", "Verifying image accessibility",
                 "curl -I https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png"),
                ("browse", "Testing multimedia gallery view", "file:///demo_report.md"),
                ("command", "Running multimedia integration tests", "python test_multimedia.py"),
                ("thinking", "Finalizing real multimedia demonstration", 2),
                ("edit", "Completing live demo setup", "demo_report.md"),
            ]

            for i, (step_type, step_text, *args) in enumerate(steps, 1):
                step_id = self.emit_activity(step_type, f"Step {i}: {step_text}", status="in-progress")

                if step_type == "thinking":
                    self.wait_if_paused(args[0] if args else 2)
                else:
                    self.wait_if_paused(1)

                if step_type == "command":
                    command = args[0] if args else ""
                    if "curl -I" in command and "openreview.net" in command:
                        output = """HTTP/2 200 OK
content-type: application/pdf
content-length: 2847392
server: nginx
access-control-allow-origin: *
✅ PDF document accessible and ready for viewing
📄 Research paper loaded successfully"""
                    elif "curl -I" in command and "bianxieai.com" in command:
                        output = """HTTP/1.1 200 OK
content-type: image/png
content-length: 45681
server: Apache
cache-control: public, max-age=31536000
✅ Image file accessible and ready for display
🖼️ Brand logo loaded successfully"""
                    elif "test_multimedia.py" in command:
                        output = f"""Testing Real Multimedia Integration...
✅ PDF Viewer: Successfully loaded OpenReview paper
✅ Image Display: Brand logo rendered correctly  
✅ SVG Charts: Interactive graphics working
✅ Markdown Preview: Media links properly embedded
✅ Tab Management: Multiple file types supported

=== Multimedia Test Results ===
PDF Loading: ✅ PASS (2.3s)
Image Loading: ✅ PASS (0.8s) 
SVG Rendering: ✅ PASS (0.2s)
URL Validation: ✅ PASS
Integration: ✅ PASS

All real multimedia features working perfectly! 🎉"""
                    else:
                        output = f"Command executed: {command}\\nOperation completed successfully."

                    self.emit_terminal_output(command, output)
                    self.update_activity_status(step_id, "completed", command=command)

                elif step_type == "edit":
                    if "todo.md" in args[0]:
                        if i <= 4:
                            updated_todo = self.file_content.replace(
                                "- [ ] Create real multimedia demos", "- [x] Create real multimedia demos"
                            ).replace(
                                "- [ ] Generate PDF and image content", "- [x] Generate PDF and image content"
                            )
                        else:
                            updated_todo = self.file_content.replace(
                                "- [ ] Create interactive examples", "- [x] Create interactive examples"
                            ).replace(
                                "- [ ] Test multimedia support", "- [x] Test multimedia support"
                            ).replace(
                                "- [ ] Complete task", "- [x] Complete task"
                            ).replace(
                                "Status: In progress with real multimedia content",
                                f"Status: ✅ Completed with live multimedia URLs\\nCompletion time: {time.strftime('%Y-%m-%d %H:%M:%S')}"
                            )

                        self.file_content = updated_todo
                        self.emit_file_update("todo.md", updated_todo)

                    self.update_activity_status(step_id, "completed", filename=args[0] if args else "")

                elif step_type == "browse":
                    self.update_activity_status(step_id, "completed", path=args[0] if args else "")
                else:
                    self.update_activity_status(step_id, "completed")

                self.wait_if_paused(0.5)

            # 8. 创建requirements.txt
            requirements_content = """# Core dependencies
Flask==2.3.3
requests==2.31.0
flake8==6.0.0
pytest==7.4.0

# Multimedia support  
Pillow==9.5.0
PyPDF2==3.0.1

# Optional enhancements
matplotlib==3.7.2
plotly==5.15.0"""

            req_id = self.emit_activity("file", "Creating dependencies file", filename="requirements.txt",
                                        status="in-progress")
            self.wait_if_paused(0.5)
            self.emit_file_update("requirements.txt", requirements_content)
            self.update_activity_status(req_id, "completed")

            # 9. 创建README.md
            readme_content = f"""# Resear Pro Task - Real Multimedia Edition

## Task Description
{self.prompt}

## 🎯 Live Demo Features
- 📄 **Real PDF Viewing**: OpenReview research paper
- 🖼️ **Live Image Display**: Web-hosted brand logo
- 📊 **Interactive Charts**: SVG-based data visualization
- 💬 **Real-time Chat**: Live conversation interface

## 📂 Project Structure
```
resear-pro-task/
├── todo.md              # Task checklist
├── config.json          # Configuration with real URLs
├── demo_report.md       # Live multimedia showcase
├── research_paper.pdf   # https://openreview.net/pdf?id=bjcsVLoHYs
├── brand_logo.png       # https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png
├── demo_chart.svg       # Interactive data chart
├── requirements.txt     # Dependencies
└── README.md           # This documentation
```

## 🌐 Live Demo URLs
- **PDF Document**: https://openreview.net/pdf?id=bjcsVLoHYs
- **Brand Image**: https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png

## 🚀 How to Run
```bash
# Install dependencies
pip install -r requirements.txt

# Start the multimedia demo
python app.py
```

## 📊 Real-time Features
- Live PDF document viewing with navigation
- Direct image loading from web URLs
- Interactive SVG chart rendering
- Real-time chat and collaboration

## Generated Information
- **Created**: {time.strftime('%Y-%m-%d %H:%M:%S')}
- **Task ID**: {self.task_id[:8]}...
- **Status**: ✅ Completed Successfully
- **Media Files**: {len(created_media)} live files created
- **Real URLs**: All multimedia content loaded from web

---
*Generated by Resear Pro AI Assistant with Live Multimedia URLs* 🚀
"""
            readme_id = self.emit_activity("file", "Creating project README with live URLs", filename="README.md",
                                           status="in-progress")
            self.wait_if_paused(0.5)
            self.emit_file_update("README.md", readme_content)
            self.update_activity_status(readme_id, "completed")

            # 10. 任务完成
            final_id = self.emit_activity("thinking",
                                          "Finalizing real multimedia task and generating completion report",
                                          status="in-progress")
            self.wait_if_paused(2)

            # 发送最终总结
            self.emit_terminal_output(
                "echo 'Real multimedia task execution completed successfully'",
                f"""
=== Resear Pro Real Multimedia Task Execution Report ===
Task ID: {self.task_id}
Start time: {time.strftime('%Y-%m-%d %H:%M:%S')}
Task description: {self.prompt}

📊 **Statistics**
Created files: {len(self.all_files)} total
├── Text files: {len([f for f in self.all_files.keys() if f.endswith(('.md', '.txt', '.py', '.json'))])}
├── Live media files: {len(created_media)}
└── Documentation: {len([f for f in self.all_files.keys() if f.startswith('README') or f.startswith('demo_')])}

🌐 **Live Multimedia Sources**
📄 PDF: https://openreview.net/pdf?id=bjcsVLoHYs
🖼️ Image: https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png
📊 Charts: Interactive SVG graphics

🎯 **Features Implemented**
✅ Real PDF document viewer integration
✅ Live image display from web URLs
✅ Interactive SVG chart rendering
✅ Markdown preview with embedded media
✅ Multi-tab file management system
✅ Real-time conversation interface

Execution steps: {len(steps)}
Execution log: {len(self.execution_log)} entries
Status: ✅ Successfully completed with live multimedia URLs

🎉 All real multimedia files ready for viewing! 🎉
Visit the dashboard to interact with live PDFs and images.
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
            "file_structure": task_executor.file_structure,
            "multimedia_support": True,
            "real_urls": True,
            "pdf_source": "https://openreview.net/pdf?id=bjcsVLoHYs",
            "image_source": "https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png"
        }
        zip_file.writestr("task_info.json", json.dumps(task_info, indent=2, ensure_ascii=False))

        # 4. 添加README说明文件
        readme_content = f"""# Resear Pro Real Multimedia Task Export

## Task Information
- Task ID: {task_executor.task_id}
- Task Description: {task_executor.prompt}
- Export Time: {time.strftime('%Y-%m-%d %H:%M:%S')}
- Real Multimedia: ✅ Live URLs Enabled

## File Structure
- `files/` - All files created during task execution
- `execution_log.json` - Detailed execution log
- `task_info.json` - Task information and metadata
- `README.md` - This documentation file

## Created Files
{chr(10).join(f"- {filename}" for filename in task_executor.all_files.keys())}

## Live Multimedia Sources
📄 **PDF Document**: https://openreview.net/pdf?id=bjcsVLoHYs
🖼️ **Brand Image**: https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png
📊 **Interactive Charts**: SVG-based data visualization

## Usage Instructions
1. Extract all files from this archive
2. All multimedia files contain live URLs
3. Check `execution_log.json` for detailed process
4. Media content loads directly from web sources

---
Generated by Resear Pro AI Assistant - Real Multimedia Edition 🚀
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
        'created_at': time.time(),
        'multimedia_support': True,
        'real_urls': True
    }

    # 创建并启动任务执行器
    executor = TaskExecutor(task_id, prompt)
    task_executors[task_id] = executor

    thread = Thread(target=executor.execute_task)
    thread.daemon = True
    thread.start()

    logger.info(f"Created real multimedia task {task_id}: {prompt[:50]}...")

    return jsonify({
        'task_id': task_id,
        'status': 'created',
        'multimedia_support': True,
        'real_urls': True
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
        logger.info(f"Started streaming for real multimedia task {task_id}")

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
                        logger.info(f"Real multimedia task {task_id} {final_status}, closing stream")
                        break

                except queue.Empty:
                    # 发送心跳保持连接
                    yield f"data: {json.dumps({'type': 'heartbeat', 'timestamp': time.time()})}\n\n"
                    continue

        except Exception as e:
            logger.error(f"Stream error for task {task_id}: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Stream connection error'})}\n\n"
        finally:
            logger.info(f"Cleaned up resources for real multimedia task {task_id}")

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


@app.route('/api/tasks/<task_id>/save-file', methods=['POST'])
def save_file_content(task_id):
    """
    保存文件内容到任务中
    """
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404

    try:
        data = request.get_json()
        if not data or 'filename' not in data or 'content' not in data:
            return jsonify({'error': 'Missing filename or content'}), 400

        filename = data['filename']
        content = data['content']

        executor = task_executors[task_id]
        
        # 更新文件内容
        if filename in executor.all_files:
            old_content = executor.all_files[filename]
            executor.all_files[filename] = content
            
            # 发送文件更新事件
            executor.emit_file_update(filename, content)
            
            # 记录文件编辑活动
            edit_id = executor.emit_activity(
                "edit", 
                f"User modified file: {filename}",
                filename=filename,
                status="completed"
            )
            
            logger.info(f"File saved: {filename} for task {task_id}")
            
            return jsonify({
                'success': True,
                'message': f'File {filename} saved successfully',
                'filename': filename,
                'size': len(content)
            })
        else:
            return jsonify({'error': f'File {filename} not found in task'}), 404

    except Exception as e:
        logger.error(f"Error saving file for task {task_id}: {str(e)}")
        return jsonify({'error': 'Failed to save file'}), 500


@app.route('/api/tasks/<task_id>/create-file', methods=['POST'])
def create_file(task_id):
    """
    创建新文件
    """
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404

    try:
        data = request.get_json()
        if not data or 'filename' not in data:
            return jsonify({'error': 'Missing filename'}), 400

        filename = data['filename']
        content = data.get('content', '')  # 默认空内容
        file_type = data.get('type', 'file')  # file 或 folder

        executor = task_executors[task_id]
        
        # 检查文件是否已存在
        if filename in executor.all_files:
            return jsonify({'error': f'File {filename} already exists'}), 400

        if file_type == 'file':
            # 创建文件
            executor.all_files[filename] = content
            
            # 更新文件结构
            executor.update_file_structure()
            
            # 发送文件创建事件
            executor.emit_file_update(filename, content)
            
            # 记录文件创建活动
            create_id = executor.emit_activity(
                "create", 
                f"User created file: {filename}",
                filename=filename,
                status="completed"
            )
            
            logger.info(f"File created: {filename} for task {task_id}")
            
            return jsonify({
                'success': True,
                'message': f'File {filename} created successfully',
                'filename': filename,
                'type': 'file',
                'file_structure': executor.file_structure
            })
        else:
            # 创建文件夹的逻辑（如果需要的话）
            executor.create_folder(filename)
            return jsonify({
                'success': True, 
                'message': f'Folder {filename} created successfully',
                'filename': filename,
                'type': 'folder',
                'file_structure': executor.file_structure
            })

    except Exception as e:
        logger.error(f"Error creating file for task {task_id}: {str(e)}")
        return jsonify({'error': 'Failed to create file'}), 500


@app.route('/api/tasks/<task_id>/delete-file', methods=['DELETE'])
def delete_file(task_id):
    """
    删除文件
    """
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404

    try:
        data = request.get_json()
        if not data or 'filename' not in data:
            return jsonify({'error': 'Missing filename'}), 400

        filename = data['filename']
        executor = task_executors[task_id]
        
        # 检查文件是否存在
        if filename not in executor.all_files:
            return jsonify({'error': f'File {filename} not found'}), 404

        # 删除文件
        executor.emit_file_delete(filename)
        
        # 记录文件删除活动
        delete_id = executor.emit_activity(
            "delete", 
            f"User deleted file: {filename}",
            filename=filename,
            status="completed"
        )
        
        logger.info(f"File deleted: {filename} for task {task_id}")
        
        return jsonify({
            'success': True,
            'message': f'File {filename} deleted successfully',
            'filename': filename,
            'file_structure': executor.file_structure
        })

    except Exception as e:
        logger.error(f"Error deleting file for task {task_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete file'}), 500


@app.route('/api/tasks/<task_id>/rename-file', methods=['POST'])
def rename_file(task_id):
    """
    重命名文件
    """
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404

    try:
        data = request.get_json()
        if not data or 'old_name' not in data or 'new_name' not in data:
            return jsonify({'error': 'Missing old_name or new_name'}), 400

        old_name = data['old_name']
        new_name = data['new_name']
        executor = task_executors[task_id]
        
        # 检查原文件是否存在
        if old_name not in executor.all_files:
            return jsonify({'error': f'File {old_name} not found'}), 404
        
        # 检查新文件名是否已存在
        if new_name in executor.all_files:
            return jsonify({'error': f'File {new_name} already exists'}), 400

        # 重命名文件
        executor.emit_file_rename(old_name, new_name)
        
        # 记录文件重命名活动
        rename_id = executor.emit_activity(
            "rename", 
            f"User renamed file: {old_name} → {new_name}",
            filename=new_name,
            status="completed"
        )
        
        logger.info(f"File renamed: {old_name} → {new_name} for task {task_id}")
        
        return jsonify({
            'success': True,
            'message': f'File renamed from {old_name} to {new_name}',
            'old_name': old_name,
            'new_name': new_name,
            'file_structure': executor.file_structure
        })

    except Exception as e:
        logger.error(f"Error renaming file for task {task_id}: {str(e)}")
        return jsonify({'error': 'Failed to rename file'}), 500


@app.route('/api/tasks/<task_id>/file-structure', methods=['GET'])
def get_file_structure(task_id):
    """
    获取文件结构
    """
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404

    try:
        executor = task_executors[task_id]
        return jsonify({
            'success': True,
            'file_structure': executor.file_structure,
            'files_count': len(executor.all_files)
        })

    except Exception as e:
        logger.error(f"Error getting file structure for task {task_id}: {str(e)}")
        return jsonify({'error': 'Failed to get file structure'}), 500


@app.route('/api/tasks/<task_id>/send-message', methods=['POST'])
def send_user_message(task_id):
    """
    发送用户消息到任务中
    """
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404

    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({'error': 'Missing message content'}), 400

        message = data['message']
        executor = task_executors[task_id]
        
        # 记录用户消息活动
        message_id = executor.emit_activity(
            "user_input",
            message,
            status="completed"
        )
        
        # 模拟AI响应
        if not executor.is_paused and executor.task_status == "started":
            # 延迟发送AI响应
            def send_ai_response():
                time.sleep(1)
                response_text = f"I understand your message: '{message}'. Let me help you with that."
                executor.emit_activity(
                    "response",
                    response_text,
                    status="completed"
                )
            
            Thread(target=send_ai_response, daemon=True).start()
        
        logger.info(f"User message received for task {task_id}: {message}")
        
        return jsonify({
            'success': True,
            'message': 'Message sent successfully',
            'message_id': message_id
        })

    except Exception as e:
        logger.error(f"Error sending message for task {task_id}: {str(e)}")
        return jsonify({'error': 'Failed to send message'}), 500


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
                'Content-Disposition': f'attachment; filename=resear-pro-real-multimedia-task-{task_id}.zip',
                'Content-Length': str(len(zip_data))
            }
        )

        logger.info(f"Exported real multimedia task {task_id} ({len(zip_data)} bytes)")
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
        'version': '2.0.0',
        'features': ['real-multimedia', 'live-urls', 'streaming', 'real-time', 'multi-format']
    })


# ==================== 应用启动 ====================

if __name__ == '__main__':
    logger.info("Starting Resear Pro AI Assistant Backend with Real Multimedia URLs...")
    logger.info("API endpoints:")
    logger.info("  POST /api/tasks - Create new real multimedia task")
    logger.info("  GET  /api/tasks/<id>/stream - Stream task progress")
    logger.info("  POST /api/tasks/<id>/pause - Pause/Resume task")
    logger.info("  GET  /api/tasks/<id>/export - Export task files")
    logger.info("  GET  /api/tasks/<id> - Get task info")
    logger.info("  GET  /api/health - Health check")
    logger.info("Real Multimedia Sources:")
    logger.info("  PDF: https://openreview.net/pdf?id=bjcsVLoHYs")
    logger.info("  Image: https://bianxieai.com/wp-content/uploads/2024/05/bianxieai.png")
    logger.info("Features: Live PDF viewing, Real image display, Interactive charts")

    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)