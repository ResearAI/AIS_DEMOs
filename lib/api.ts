// lib/api.ts
import { useState, useEffect, useCallback } from 'react';

// 可以通过环境变量或简单修改这里来切换后端
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export interface Activity {
  id: number;
  text: string;
  type: string;
  status: string;
  timestamp: number;
  command?: string;
  filename?: string;
  path?: string;
  speaker?: 'user' | 'ai';
}

export interface FileStructureNode {
  name: string;
  type: 'file' | 'directory';
  children?: FileStructureNode[];
  size?: number;
}

export interface StreamMessage {
  type: 'activity' | 'activity_update' | 'file_update' | 'task_update' | 'terminal' | 'heartbeat' | 'connection_close' | 'error' | 'file_structure_update';
  data?: any;
  reason?: string;
  message?: string;
}

export interface TaskResponse {
  task_id: string;
  status: string;
}

export interface FileUpdate {
  filename: string;
  content: string;
}

export class ApiService {
  async createTask(prompt: string, attachments: File[] = []): Promise<TaskResponse> {
    const formData = new FormData();
    formData.append('prompt', prompt);

    attachments.forEach((file, index) => {
      formData.append(`attachment_${index}`, file);
    });

    const response = await fetch(`${API_BASE_URL}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        attachments: attachments.map(f => f.name)
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async connectTask(taskId: string): Promise<Response> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  }

  async pauseTask(taskId: string): Promise<{ is_paused: boolean }> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/pause`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to pause/resume task: ${response.statusText}`);
    }
    
    return response.json();
  }

  async saveFileContent(taskId: string, filename: string, content: string): Promise<{ success: boolean; message?: string }> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/save-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename, content }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save file: ${response.statusText}`);
    }
    
    return response.json();
  }

  async exportTask(taskId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/export`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.blob();
  }

  async getTask(taskId: string) {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async healthCheck() {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  // 🆕 新增：获取文件内容
  async getFileContent(taskId: string, filename: string): Promise<{ success: boolean; content?: string; message?: string }> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/files/${encodeURIComponent(filename)}`, {
      method: 'GET',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get file content: ${response.statusText}`);
    }
    
    return response.json();
  }

  // 🆕 新增：列出所有文件内容（用于历史回放）
  async getAllFilesContent(taskId: string): Promise<{ success: boolean; files?: Record<string, string>; message?: string }> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/files`, {
      method: 'GET',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get all files content: ${response.statusText}`);
    }
    
    return response.json();
  }
}

export const apiService = new ApiService();

// React Hook for streaming task data
export interface UseTaskStreamResult {
  activities: Activity[];
  currentFile: string;
  fileContent: string;
  taskStatus: string;
  error: string | null;
  isConnected: boolean;
  terminalOutput: string[];
  fileStructure: FileStructureNode | null;
}

export function useTaskStream(taskId: string | null): UseTaskStreamResult {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [currentFile, setCurrentFile] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [taskStatus, setTaskStatus] = useState('idle');
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [fileStructure, setFileStructure] = useState<FileStructureNode | null>(null);

  const handleMessage = useCallback((message: StreamMessage) => {
    console.log('收到消息:', message.type, message);

    switch (message.type) {
      case 'activity':
        setActivities(prev => [...prev, message.data as Activity]);
        break;

      case 'activity_update':
        setActivities(prev => prev.map(activity =>
          activity.id === message.data.id
            ? { ...activity, status: message.data.status, ...message.data }
            : activity
        ));
        break;

      case 'file_update':
        const fileUpdate = message.data as FileUpdate;
        // 🔧 简化：直接使用后端发送的文件名，不做任何路径处理
        console.log('File update - 文件名:', fileUpdate.filename, '内容长度:', fileUpdate.content?.length || 0);
        setCurrentFile(fileUpdate.filename);
        setFileContent(fileUpdate.content);
        break;

      case 'file_structure_update':
        // 🔧 直接使用后端的文件结构
        console.log('File structure update:', message.data);
        setFileStructure(message.data as FileStructureNode);
        break;

      case 'task_update':
        setTaskStatus(message.data.status);
        if (message.data.error) {
          setError(message.data.error);
        }
        break;

      case 'terminal':
        setTerminalOutput(prev => [
          ...prev,
          `$ ${message.data.command}`,
          message.data.output
        ]);
        break;

      case 'heartbeat':
        setError(null);
        break;

      case 'error':
        setError(message.message || '未知错误');
        setIsConnected(false);
        break;

      default:
        console.log('未知消息类型:', message.type);
    }
  }, []);

  useEffect(() => {
    if (!taskId) return;

    let abortController: AbortController | null = null;
    let isProcessing = false;

    const connectAndStream = async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        console.log('开始连接任务:', taskId);
        setIsConnected(true);
        setError(null);

        abortController = new AbortController();
        
        const response = await apiService.connectTask(taskId);
        
        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let messageCount = 0;

        while (true) {
          const { value, done } = await reader.read();
          
          if (done) {
            console.log('连接结束，总共处理了', messageCount, '条消息');
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const message: StreamMessage = JSON.parse(line);
                messageCount++;
                console.log(`处理消息 ${messageCount}:`, message.type);
                handleMessage(message);

                if (message.type === 'task_update' && 
                    message.data?.status && 
                    ['completed', 'failed'].includes(message.data.status)) {
                  console.log('任务完成，状态:', message.data.status);
                  setIsConnected(false);
                  return;
                }
              } catch (parseError) {
                console.error('解析消息失败:', parseError, '原始内容:', line);
              }
            }
          }
        }

      } catch (fetchError: any) {
        console.error('连接错误:', fetchError);
        
        if (fetchError.name === 'AbortError') {
          console.log('连接被主动中断');
          return;
        }

        if (taskStatus !== 'completed' && taskStatus !== 'failed') {
          setError('连接失败: ' + fetchError.message);
        }
        setIsConnected(false);
      } finally {
        isProcessing = false;
      }
    };

    connectAndStream();

    return () => {
      if (abortController) {
        console.log('中断连接');
        abortController.abort();
      }
      setIsConnected(false);
    };
  }, [taskId, handleMessage, taskStatus]);

  useEffect(() => {
    if (taskStatus === 'completed' || taskStatus === 'failed') {
      setError(null);
      
      const timer = setTimeout(() => {
        setIsConnected(false);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [taskStatus]);

  return {
    activities,
    currentFile,
    fileContent,
    taskStatus,
    error,
    isConnected,
    terminalOutput,
    fileStructure
  };
}

// 🆕 添加调试工具函数
export const debugFileStructure = (structure: FileStructureNode | null) => {
  if (!structure) {
    console.log('File structure: null');
    return;
  }
  
  const printNode = (node: FileStructureNode, indent = 0) => {
    const prefix = '  '.repeat(indent);
    console.log(`${prefix}${node.type === 'directory' ? '📁' : '📄'} ${node.name}`);
    if (node.children) {
      node.children.forEach(child => printNode(child, indent + 1));
    }
  };
  
  console.log('=== File Structure ===');
  printNode(structure);
  console.log('=====================');
};