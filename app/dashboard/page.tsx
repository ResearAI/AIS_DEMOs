"use client"

import React, { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { DashboardContent } from "@/components/dashboard-content"
import { ComputerView } from "@/components/computer-view"
import { Terminal, AlertCircle, GitBranch, Activity, CheckCircle2, XCircle, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useTaskStream } from "@/lib/api"
import { apiService } from "@/lib/api"

function DashboardPageContent() {
  const searchParams = useSearchParams()
  const taskId = searchParams?.get('taskId')
  const prompt = searchParams?.get('prompt') || "AI任务执行中"

  const [isPaused, setIsPaused] = useState(false)

  // 使用自定义 hook 获取流式数据
  const {
    activities,
    currentFile,
    fileContent,
    taskStatus,
    error,
    isConnected,
    terminalOutput,
    fileStructure
  } = useTaskStream(taskId)

  const handlePause = async () => {
    if (!taskId) return

    try {
      const result = await apiService.pauseTask(taskId)
      setIsPaused(result.is_paused)
    } catch (error) {
      console.error('Failed to pause/resume task:', error)
    }
  }

  const handleExport = async () => {
    if (!taskId) return

    try {
      const blob = await apiService.exportTask(taskId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `manus-pro-task-${taskId}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to export task:', error)
    }
  }

  // 如果没有 taskId，显示错误
  if (!taskId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm max-w-md w-full">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              任务 ID 缺失，请从主页重新开始。
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  const getStatusIcon = () => {
    switch (taskStatus) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'started':
        return <Activity className="h-4 w-4 text-blue-600 animate-pulse" />
      default:
        return <Activity className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusText = () => {
    switch (taskStatus) {
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed'
      case 'started':
        return 'Running'
      default:
        return 'Preparing'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* GitHub 风格的顶部栏 */}
      <div className="bg-white border-b border-gray-300">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Resear Pro
              </h1>

              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <span className="font-medium">{getStatusText()}</span>
                </div>

                {isConnected && taskStatus === 'started' && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span>Live sync</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePause}
                disabled={taskStatus === 'completed' || taskStatus === 'failed'}
                className="border-gray-300 hover:bg-gray-100"
              >
                {isPaused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
                {isPaused ? "Resume" : "Pause"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="border-gray-300 hover:bg-gray-100"
              >
                Export
              </Button>
            </div>
          </div>

          {/* 任务描述 */}
          <div className="mt-3 pb-3">
            <p className="text-gray-600 text-sm">{prompt}</p>
          </div>
        </div>

        {/* 错误提示 */}
        {error && !['completed', 'failed'].includes(taskStatus) && (
          <div className="px-6 pb-3">
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      {/* 主内容区域 - GitHub 风格布局 */}
      <div className="flex h-[calc(100vh-8rem)]">
        {/* 左侧面板 - 活动日志 */}
        <div className="w-2/5 border-r border-gray-300 bg-white">
          <DashboardContent
            activeTask={prompt}
            commandOutput={[]}
            activities={activities}
            taskStatus={taskStatus}
          />
        </div>

        {/* 右侧面板 - 文件编辑器和终端 */}
        <div className="flex-1 bg-white">
          <ComputerView
            currentFile={currentFile}
            fileContent={fileContent}
            setFileContent={() => {}}
            isLive={isConnected}
            taskStatus={taskStatus}
            terminalOutput={terminalOutput}
            fileStructure={fileStructure}
          />
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-gray-300 text-xs">
        <div className="px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Task ID: {taskId.slice(0, 8)}...</span>
            <span>Activities: {activities.length}</span>
            <span>Files: {fileStructure?.children?.length || 0}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading workspace...</p>
        </div>
      </div>
    }>
      <DashboardPageContent />
    </Suspense>
  )
}