"use client"

import React, { useState, useEffect, useRef } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Terminal, FileText, Eye, ArrowDown, ArrowUp, Edit, Loader2, CheckCircle, XCircle, GitCommit, Code2, FolderOpen, Send, User, Bot } from "lucide-react"
import { Activity } from "@/lib/api"

interface DashboardContentProps {
  activeTask: string
  commandOutput: string[]
  activities: Activity[]
  taskStatus: string
  onAddUserMessage: (text: string) => void;
  isViewingHistory?: boolean;
}

export function DashboardContent({
  activeTask,
  commandOutput,
  activities,
  taskStatus,
  onAddUserMessage,
  isViewingHistory = false
}: DashboardContentProps) {
  const dialogDisplayRef = useRef<HTMLDivElement>(null);
  const [userInput, setUserInput] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Auto-scroll for the unified dialog/activity display area
  useEffect(() => {
    if (dialogDisplayRef.current) {
      dialogDisplayRef.current.scrollTop = dialogDisplayRef.current.scrollHeight;
    }
  }, [activities]);

  const getActivityIcon = (type: string) => {
    const iconClass = "h-4 w-4"
    switch (type) {
      case "command":
        return <Terminal className={iconClass} />
      case "file":
        return <FileText className={iconClass} />
      case "browse":
      case "view":
        return <Eye className={iconClass} />
      case "edit":
        return <Edit className={iconClass} />
      case "thinking":
        return <Loader2 className={`${iconClass} animate-spin`} />
      default:
        return <GitCommit className={iconClass} />
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-3.5 w-3.5 text-green-600" />
      case "error":
      case "failed":
        return <XCircle className="h-3.5 w-3.5 text-red-600" />
      case "in-progress":
        return <div className="h-3.5 w-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      default:
        return null
    }
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getActivityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      command: "Execute Command",
      file: "Create File",
      edit: "Edit File",
      browse: "Browse",
      thinking: "Thinking",
      terminal: "Terminal Output"
    }
    return labels[type] || type
  }

  const handleSendMessage = () => {
    if (userInput.trim() && !isViewingHistory) {
      onAddUserMessage(userInput.trim());
      setUserInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 顶部标题栏 */}
      <div className="flex items-center border-b border-slate-300 px-4 h-10 bg-slate-50">
        <div className="flex items-center justify-between w-full">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            Conversation & Activities
          </h2>
          <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
            {activities.length} items
          </span>
        </div>
      </div>

      {/* 统一的对话和活动区域 */}
      <div
        ref={dialogDisplayRef}
        className="flex-1 flex flex-col overflow-y-auto bg-slate-50 custom-scrollbar"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#cbd5e1 #f1f5f9'
        }}
      >
        {/* 消息和活动显示区域 */}
        <div className="flex-grow p-4 space-y-4">
          {activities.length === 0 && !isViewingHistory ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-12 h-12 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mb-4"></div>
              <h3 className="text-base font-medium text-slate-700 mb-2">Waiting for task to start</h3>
              <p className="text-sm text-slate-600">AI assistant is preparing to execute your task...</p>
            </div>
          ) : activities.length === 0 && isViewingHistory ? (
             <div className="text-sm text-slate-400 text-center py-4">
              No activities or messages in this historical step.
            </div>
          ) : (
            activities.map((activity, index) => {
              if (activity.speaker === 'user' || activity.type === 'user_input') {
                // 用户消息样式 - 恢复原来的样式
                return (
                  <div key={activity.id || `user-${index}`} className="mb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 shadow-sm">
                          <div className="flex items-start justify-between mb-1">
                            <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                              User Message
                            </span>
                            <span className="text-xs text-blue-600">
                              {formatTimestamp(activity.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-blue-900 whitespace-pre-wrap break-words">
                            {activity.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } else {
                // AI活动样式 - 保持原来的垂直条纹样式
                return (
                  <div key={activity.id || `ai-${index}`} className="mb-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                          {getActivityIcon(activity.type)}
                        </div>
                        {index < activities.length - 1 && (
                          <div className="w-0.5 bg-slate-200 flex-1 mt-2" style={{ minHeight: '20px' }}></div>
                        )}
                      </div>
                      <div className="flex-1 -mt-1">
                        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                {getActivityTypeLabel(activity.type)}
                              </span>
                              {activity.status && getStatusIcon(activity.status)}
                            </div>
                            <span className="text-xs text-slate-600">
                              {formatTimestamp(activity.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-800 font-medium mb-2 whitespace-pre-wrap break-words">
                            {activity.text}
                          </p>
                          {activity.command && (
                            <div className="bg-slate-50 rounded p-2 font-mono text-xs text-slate-700 border border-slate-200">
                              $ {activity.command}
                            </div>
                          )}
                          {activity.filename && (
                            <div className="flex items-center gap-2 text-xs text-slate-600 mt-2">
                              <FolderOpen className="h-3.5 w-3.5" />
                              <span className="font-mono">{activity.filename}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
            })
          )}
        </div>

        {/* 用户输入区域 - 固定在底部 */}
        <div className="sticky bottom-0 border-t border-slate-300 p-4 bg-white shadow-sm">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder={isViewingHistory ? "Viewing history mode - input disabled" : "Type a message..."}
                disabled={isViewingHistory}
                className={`
                  min-h-[40px] max-h-[120px] resize-none 
                  border border-slate-300 rounded-xl
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  transition-all duration-200
                  ${isInputFocused ? 'shadow-md' : 'shadow-sm'}
                  ${isViewingHistory ? 'bg-slate-100 text-slate-500' : 'bg-white'}
                `}
              />
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!userInput.trim() || isViewingHistory}
              size="sm"
              className={`
                h-10 w-10 rounded-xl p-0 transition-all duration-200
                ${userInput.trim() && !isViewingHistory 
                  ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-md hover:shadow-lg' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }
              `}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {!isViewingHistory && (
            <p className="text-xs text-slate-500 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          )}
        </div>
      </div>
    </div>
  )
}