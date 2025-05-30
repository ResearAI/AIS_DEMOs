// lib/api.ts
import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = 'http://ai-researcher.net:5000/api';

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

  streamTaskProgress(taskId: string): EventSource {
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
  const [currentFile, setCurrentFile] = useState('todo.md');
  const [fileContent, setFileContent] = useState('');
  const [taskStatus, setTaskStatus] = useState('idle');
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [fileStructure, setFileStructure] = useState<FileStructureNode | null>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: StreamMessage = JSON.parse(event.data);

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

        case 'connection_close':
          // 服务器主动关闭连接，这是正常的
          console.log(`Connection closed: ${message.reason}`);
          setIsConnected(false);
          // 不设置错误状态，因为这是预期的行为
          break;

        case 'heartbeat':
          // 保持连接活跃，重置错误状态
          setError(null);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('Error parsing SSE message:', err);
      setError('消息解析错误');
    }
  }, []);

  useEffect(() => {
    if (!taskId) return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        eventSource = apiService.streamTaskProgress(taskId);

        eventSource.onopen = () => {
          console.log('SSE connection opened');
          setIsConnected(true);
          setError(null);
        };

        eventSource.onmessage = handleMessage;

        eventSource.onerror = (event) => {
          console.log('SSE connection error or close');
          setIsConnected(false);

          // 检查当前任务状态，如果已完成则不显示错误
          if (taskStatus === 'completed' || taskStatus === 'failed') {
            console.log('Task completed, connection closed normally');
            return;
          }

          // 只有在任务仍在运行时才显示连接错误
          if (taskStatus === 'started') {
            setError('连接中断，正在尝试重连...');

            // 尝试重连（最多3次）
            if (!reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                console.log('Attempting to reconnect...');
                connect();
                reconnectTimer = null;
              }, 3000);
            }
          }
        };

      } catch (err) {
        console.error('Error creating SSE connection:', err);
        setError('无法连接到服务器');
      }
    };

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
        setIsConnected(false);
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [taskId, handleMessage, taskStatus]);

  // 任务完成后清理状态
  useEffect(() => {
    if (taskStatus === 'completed' || taskStatus === 'failed') {
      // 任务完成，清除错误状态
      setError(null);

      // 延迟1秒后设置连接状态为false，给用户看到完成状态的时间
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