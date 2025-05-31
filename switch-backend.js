#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const API_FILE = path.join(__dirname, 'lib/api.ts');

function switchToSimpleBackend() {
    let content = fs.readFileSync(API_FILE, 'utf8');
    
    // 注释掉原来的API_BASE_URL
    content = content.replace(
        "const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://ai-researcher.net:5000/api';",
        "// const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://ai-researcher.net:5000/api';"
    );
    
    // 启用简化版API_BASE_URL
    content = content.replace(
        "// const API_BASE_URL = 'http://localhost:5001/api';",
        "const API_BASE_URL = 'http://localhost:5001/api';"
    );
    
    fs.writeFileSync(API_FILE, content);
    console.log('✅ 已切换到简化版后端 (端口 5001)');
}

function switchToFullBackend() {
    let content = fs.readFileSync(API_FILE, 'utf8');
    
    // 启用完整版API_BASE_URL
    content = content.replace(
        "// const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://ai-researcher.net:5000/api';",
        "const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://ai-researcher.net:5000/api';"
    );
    
    // 注释掉简化版API_BASE_URL
    content = content.replace(
        "const API_BASE_URL = 'http://localhost:5001/api';",
        "// const API_BASE_URL = 'http://localhost:5001/api';"
    );
    
    fs.writeFileSync(API_FILE, content);
    console.log('✅ 已切换到完整版后端 (端口 5000)');
}

const command = process.argv[2];

if (command === 'simple') {
    switchToSimpleBackend();
} else if (command === 'full') {
    switchToFullBackend();
} else {
    console.log(`
🔄 后端切换工具

使用方法:
  node switch-backend.js simple   # 切换到简化版后端 (app2.py, 端口 5001)
  node switch-backend.js full     # 切换到完整版后端 (app.py, 端口 5000)

当前状态:
  - 完整版后端: python app.py (端口 5000)
  - 简化版后端: python app2.py (端口 5001)
`);
} 