// lib/api.ts
import { useState, useEffect, useCallback } from 'react';

// 可以通过环境变量或简单修改这里来切换后端
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
// 如果要使用简化版后端，取消注释下面这行：
// const API_BASE_URL = 'http://localhost:5001/api';

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

  // 新的连接方法，使用POST模式
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

  // 废弃的SSE方法（保留兼容性）
  streamTaskProgress(taskId: string): EventSource {
    console.warn('streamTaskProgress is deprecated, use connectTask instead');
    const eventSource = new EventSource(`${API_BASE_URL}/tasks/${taskId}/stream`);
    return eventSource;
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

  async sendUserMessage(taskId: string, message: string): Promise<{ success: boolean; message_id?: number }> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
    
    return response.json();
  }

  async createFile(taskId: string, filename: string, content: string = '', type: 'file' | 'folder' = 'file'): Promise<{ success: boolean; filename?: string; file_structure?: any }> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/create-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename, content, type }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to create file: ${response.statusText}`);
    }
    
    return response.json();
  }

  async deleteFile(taskId: string, filename: string): Promise<{ success: boolean; filename?: string; file_structure?: any }> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/delete-file`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to delete file: ${response.statusText}`);
    }
    
    return response.json();
  }

  async renameFile(taskId: string, oldName: string, newName: string): Promise<{ success: boolean; old_name?: string; new_name?: string; file_structure?: any }> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/rename-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ old_name: oldName, new_name: newName }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to rename file: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getFileStructure(taskId: string): Promise<{ success: boolean; file_structure?: any; files_count?: number }> {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/file-structure`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to get file structure: ${response.statusText}`);
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
        setCurrentFile(fileUpdate.filename);
        setFileContent(fileUpdate.content);
        break;

      case 'file_structure_update':
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
        // 保持连接活跃，重置错误状态
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

          // 解码数据块
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // 按行分割消息
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留最后一个不完整的行

          // 处理完整的消息行
          for (const line of lines) {
            if (line.trim()) {
              try {
                const message: StreamMessage = JSON.parse(line);
                messageCount++;
                console.log(`处理消息 ${messageCount}:`, message.type);
                handleMessage(message);

                // 检查任务是否完成
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

        // 只有在任务仍在运行时才显示错误
        if (taskStatus !== 'completed' && taskStatus !== 'failed') {
          setError('连接失败: ' + fetchError.message);
        }
        setIsConnected(false);
      } finally {
        isProcessing = false;
      }
    };

    // 启动连接
    connectAndStream();

    // 清理函数
    return () => {
      if (abortController) {
        console.log('中断连接');
        abortController.abort();
      }
      setIsConnected(false);
    };
  }, [taskId, handleMessage, taskStatus]);

  // 任务完成后清理状态
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