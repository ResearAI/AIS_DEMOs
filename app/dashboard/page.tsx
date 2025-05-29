"use client"

import React, { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { DashboardContent } from "@/components/dashboard-content"
import { ComputerView } from "@/components/computer-view"
import { Terminal, AlertCircle, GitBranch, Activity, CheckCircle2, XCircle, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useTaskStream, Activity as ApiActivity, FileStructureNode } from "@/lib/api" // Aliased Activity type
import { apiService } from "@/lib/api"

// DialogMessage interface removed

// Define History Snapshot type - dialogMessages field removed
interface HistorySnapshot {
  taskId: string | null; 
  promptText: string;
  activities: ApiActivity[]; // This will now hold combined AI and user messages
  currentFile: string;
  fileContent: string;
  terminalOutput: string[];
  fileStructure: FileStructureNode | null;
  timestamp: number; 
}

function DashboardPageContent() {
  const searchParams = useSearchParams()
  const taskId = searchParams?.get('taskId')
  const promptText = searchParams?.get('prompt') || "AI任务执行中"

  const [isPaused, setIsPaused] = useState(false)
  // dialogMessages state removed
  const [displayedActivities, setDisplayedActivities] = useState<ApiActivity[]>([]); // New state for unified log

  // History State
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(-1); // -1 means live
  const [isViewingHistory, setIsViewingHistory] = useState<boolean>(false);

  // useTaskStream hook
  const liveTaskState = useTaskStream(taskId);

  // Effect to merge liveTaskState.activities (AI) into displayedActivities
  useEffect(() => {
    if (isViewingHistory) return; // Don't merge if viewing history

    setDisplayedActivities(prevDisplayed => {
      const newAiActivities = liveTaskState.activities.filter(
        aiActivity => !prevDisplayed.some(dispActivity => dispActivity.id === aiActivity.id && dispActivity.speaker !== 'user')
      );
      const combined = [...prevDisplayed, ...newAiActivities];
      return combined.sort((a, b) => a.timestamp - b.timestamp);
    });
  }, [liveTaskState.activities, isViewingHistory]);


  const handleAddUserMessage = (text: string) => {
    if (isViewingHistory) return; 

    const newUserActivity: ApiActivity = {
      id: Date.now(), 
      text: text,
      type: 'user_input', 
      timestamp: Math.floor(Date.now() / 1000), 
      speaker: 'user',
      status: 'completed' 
    };
    
    setDisplayedActivities(prevDisplayed => {
      const combined = [...prevDisplayed, newUserActivity];
      return combined.sort((a, b) => a.timestamp - b.timestamp);
    });
  };


  // Snapshotting Logic - uses displayedActivities
  useEffect(() => {
    if (isViewingHistory) {
      return; 
    }

    const newSnapshot: HistorySnapshot = {
      taskId,
      promptText,
      activities: displayedActivities, // Use unified displayedActivities
      currentFile: liveTaskState.currentFile,
      fileContent: liveTaskState.fileContent,
      terminalOutput: liveTaskState.terminalOutput,
      fileStructure: liveTaskState.fileStructure,
      timestamp: Date.now()
    };

    if (history.length > 0) {
      const lastSnapshot = history[history.length - 1];
      if (
        lastSnapshot.activities === newSnapshot.activities && // Shallow compare, might need deep for robustness
        lastSnapshot.currentFile === newSnapshot.currentFile &&
        lastSnapshot.fileContent === newSnapshot.fileContent &&
        lastSnapshot.terminalOutput === newSnapshot.terminalOutput &&
        lastSnapshot.fileStructure === newSnapshot.fileStructure
      ) {
        return;
      }
    }
    
    setHistory(prevHistory => {
      const updatedHistory = [...prevHistory, newSnapshot];
      return updatedHistory;
    });
    setCurrentHistoryIndex(history.length); 

  }, [
    displayedActivities, // Now depends on displayedActivities
    liveTaskState.currentFile, 
    liveTaskState.fileContent, 
    liveTaskState.terminalOutput, 
    liveTaskState.fileStructure, 
    isViewingHistory, 
    taskId, 
    promptText,
    history 
  ]);

  const handleHistoryChange = (newIndex: number) => {
    if (newIndex === -1 || newIndex >= history.length) { 
      setIsViewingHistory(false);
      setCurrentHistoryIndex(history.length > 0 ? history.length -1 : -1); 
    } else if (newIndex >= 0 && newIndex < history.length) {
      setCurrentHistoryIndex(newIndex);
      setIsViewingHistory(true);
    }
  };
  
  // Determine display state based on whether viewing history or live
  const displayState: HistorySnapshot = isViewingHistory && history[currentHistoryIndex]
    ? history[currentHistoryIndex]
    : { 
        taskId,
        promptText,
        activities: displayedActivities, // Use unified displayedActivities
        currentFile: liveTaskState.currentFile,
        fileContent: liveTaskState.fileContent,
        terminalOutput: liveTaskState.terminalOutput,
        fileStructure: liveTaskState.fileStructure,
        timestamp: Date.now() 
      };

  // Diagnostic Log for displayState
  useEffect(() => {
    console.log("[DashboardPage] displayState updated:", 
      "Current File:", displayState.currentFile, 
      "File Content Length:", displayState.fileContent?.length,
      "Is Viewing History:", isViewingHistory,
      "History Index:", currentHistoryIndex
      );
  }, [displayState.currentFile, displayState.fileContent, isViewingHistory, currentHistoryIndex]); // Log when these specific parts of displayState change

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm max-w-md w-full">
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

  // Use liveTaskState for status display, error, etc.
  const getStatusIcon = () => {
    switch (liveTaskState.taskStatus) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'started':
        return <Activity className="h-4 w-4 text-blue-600 animate-pulse" />
      default:
        return <Activity className="h-4 w-4 text-slate-500" />
    }
  }

  const getStatusText = () => {
    switch (liveTaskState.taskStatus) {
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
    <div className="min-h-screen bg-slate-50">
      {/* GitHub 风格的顶部栏 */}
      <div className="bg-white border-b border-slate-300">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Resear Pro
              </h1>

              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <span className="font-medium">{getStatusText()}</span>
                </div>

                {liveTaskState.isConnected && liveTaskState.taskStatus === 'started' && !isViewingHistory && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span>Live sync</span>
                  </div>
                )}
                {isViewingHistory && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <Activity className="h-4 w-4" />
                    <span>Viewing History</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePause}
                disabled={liveTaskState.taskStatus === 'completed' || liveTaskState.taskStatus === 'failed' || isViewingHistory}
                className="border-slate-300 hover:bg-slate-100"
              >
                {isPaused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
                {isPaused ? "Resume" : "Pause"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="border-slate-300 hover:bg-slate-100"
              >
                Export
              </Button>
            </div>
          </div>

          {/* 任务描述 */}
          <div className="mt-3 pb-3">
            <p className="text-slate-600 text-sm">{displayState.promptText}</p>
          </div>
        </div>

        {/* 错误提示 */}
        {liveTaskState.error && !['completed', 'failed'].includes(liveTaskState.taskStatus) && !isViewingHistory && (
          <div className="px-6 pb-3">
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{liveTaskState.error}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      {/* 主内容区域 - GitHub 风格布局 */}
      <div className="flex h-[calc(100vh-8rem)]">
        {/* 左侧面板 - 活动日志 */}
        <div className="w-2/5 border-r border-slate-300 bg-white">
          <DashboardContent
            activeTask={displayState.promptText} // Use displayState
            commandOutput={[]} // Assuming commandOutput is not part of history for now
            activities={displayState.activities} // Pass unified activities
            taskStatus={isViewingHistory ? 'history' : liveTaskState.taskStatus} 
            onAddUserMessage={handleAddUserMessage}
            dialogMessages={displayState.activities.filter(a => a.speaker === 'user' || a.speaker === 'ai')} // Filter for dialog display, though now part of activities
            isViewingHistory={isViewingHistory} 
          />
        </div>

        {/* 右侧面板 - 文件编辑器和终端 */}
        <div className="flex-1 bg-white">
          <ComputerView
            currentFile={displayState.currentFile} // Use displayState
            fileContent={displayState.fileContent} // Use displayState
            setFileContent={() => {}} // Will be read-only if viewing history
            isLive={liveTaskState.isConnected && !isViewingHistory} // Live only if not viewing history
            taskStatus={isViewingHistory ? 'history' : liveTaskState.taskStatus} // Adjust taskStatus display
            terminalOutput={displayState.terminalOutput} // Use displayState
            fileStructure={displayState.fileStructure} // Use displayState
            // dialogMessages prop is removed from ComputerView
            isViewingHistory={isViewingHistory} // Pass down isViewingHistory
            historyLength={history.length}
            currentHistoryIndexValue={currentHistoryIndex} // Pass current history index
            onHistoryChange={handleHistoryChange} // Pass handler
          />
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-100 border-t border-slate-200 text-slate-700 text-xs">
        <div className="px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Task ID: {displayState.taskId ? displayState.taskId.slice(0, 8) : 'N/A'}...</span>
            <span>Activities: {displayState.activities.length}</span>
            <span>Files: {displayState.fileStructure?.children?.length || 0}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>{isViewingHistory ? `Viewing step ${currentHistoryIndex + 1} of ${history.length}` : new Date().toLocaleTimeString() }</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading workspace...</p>
        </div>
      </div>
    }>
      <DashboardPageContent />
    </Suspense>
  )
}