"use client"

import React, { useState, useEffect, useRef } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Terminal, FileText, Eye, ArrowDown, ArrowUp, Edit, Loader2, CheckCircle, XCircle, GitCommit, Code2, FolderOpen, Send } from "lucide-react"
import { Activity } from "@/lib/api"

interface DashboardContentProps {
  activeTask: string
  commandOutput: string[]
  activities: Activity[]
  taskStatus: string
}

export function DashboardContent({ activeTask, commandOutput, activities, taskStatus }: DashboardContentProps) {
  const activitiesEndRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [userInput, setUserInput] = useState("")

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && activitiesEndRef.current) {
      activitiesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [activities, autoScroll])

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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    setAutoScroll(isNearBottom)
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部标题栏 - GitHub 风格 */}
      <div className="border-b border-slate-300 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            活动日志
          </h2>
          <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
            {activities.length} 个活动
          </span>
        </div>
      </div>

      {/* 活动列表 - GitHub 风格 */}
      <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {activities.length === 0 && taskStatus !== 'completed' && taskStatus !== 'failed' ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-12 h-12 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mb-4"></div>
            <h3 className="text-base font-medium text-slate-700 mb-2">Waiting for task to start</h3>
            <p className="text-sm text-slate-500">AI assistant is preparing to execute your task...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <h3 className="text-base font-medium text-slate-700 mb-2">No activities</h3>
            <p className="text-sm text-slate-500">Task has {taskStatus === 'completed' ? 'completed' : 'ended'}</p>
          </div>
        ) : (
          <div className="p-4">
            {activities.map((activity, index) => (
              <div key={activity.id} className="mb-4 last:mb-0">
                {/* 活动项 - GitHub commit 风格 */}
                <div className="flex items-start gap-3">
                  {/* 时间线 */}
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                      {getActivityIcon(activity.type)}
                    </div>
                    {index < activities.length - 1 && (
                      <div className="w-0.5 h-12 bg-slate-200 mt-2"></div>
                    )}
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 -mt-1">
                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            {getActivityTypeLabel(activity.type)}
                          </span>
                          {getStatusIcon(activity.status)}
                        </div>
                        <span className="text-xs text-slate-500">
                          {formatTimestamp(activity.timestamp)}
                        </span>
                      </div>

                      <p className="text-sm text-slate-800 font-medium mb-2">
                        {activity.text}
                      </p>

                      {/* 命令或文件详情 */}
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
            ))}
            <div ref={activitiesEndRef} />
          </div>
        )}
      </div>

      {/* 用户输入区域 */}
      <div className="border-t border-slate-300 p-4 bg-white">
        <Textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Type your instructions or feedback here..."
          className="w-full min-h-[80px] border-slate-300 focus:ring-sky-500 focus:border-sky-500 text-sm mb-2"
          rows={3}
        />
        <div className="flex justify-end">
          <Button 
            size="sm" 
            className="bg-sky-600 hover:bg-sky-700 text-white"
            onClick={() => console.log("User input:", userInput)} // Placeholder action
          >
            <Send className="h-3.5 w-3.5 mr-2" />
            Send
          </Button>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="border-t border-slate-300 px-4 py-2 bg-slate-50">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>
            {taskStatus === 'completed' ? '✓ Task completed' :
             taskStatus === 'failed' ? '✗ Task failed' :
             taskStatus === 'started' ? '● Running...' : '○ Waiting'}
          </span>
          <span>
            {autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          </span>
        </div>
      </div>
    </div>
  )
}