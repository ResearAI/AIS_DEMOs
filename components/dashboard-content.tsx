"use client"

import React, { useState, useEffect, useRef } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Terminal, FileText, Eye, ArrowDown, ArrowUp, Edit, Loader2, CheckCircle, XCircle, GitCommit, Code2, FolderOpen, Send } from "lucide-react"
import { Activity } from "@/lib/api"

interface DashboardContentProps {
  activeTask: string
  commandOutput: string[] // This prop seems unused currently
  activities: Activity[] // This will be the unified list
  taskStatus: string
  onAddUserMessage: (text: string) => void;
  // dialogMessages prop removed
  isViewingHistory?: boolean; 
}

export function DashboardContent({ 
  activeTask, 
  commandOutput, 
  activities, // Unified list
  taskStatus, 
  onAddUserMessage,
  // dialogMessages prop removed
  isViewingHistory = false
}: DashboardContentProps) {
  const dialogDisplayRef = useRef<HTMLDivElement>(null); // Single ref for the unified scrollable area
  const [userInput, setUserInput] = useState("");
  // autoScroll state and activitiesEndRef removed

  // Auto-scroll for the unified dialog/activity display area
  useEffect(() => {
    if (dialogDisplayRef.current) {
      dialogDisplayRef.current.scrollTop = dialogDisplayRef.current.scrollHeight;
    }
  }, [activities]); // Scroll when unified activities list changes

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

  // handleScroll for autoScroll state is removed as not directly applicable to the new unified view's auto-scroll-to-bottom logic

  return (
    <div className="h-full flex flex-col">
      {/* 顶部标题栏 - GitHub 风格 */}
      <div className="flex items-center border-b border-slate-300 px-4 h-10">
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

      {/* Unified Conversation/Activity Area */}
      <div ref={dialogDisplayRef} className="flex-1 flex flex-col overflow-y-auto bg-slate-50"> {/* Main scroller */}
        {/* Messages and Activities Display (grows to fill space) */}
        <div className="flex-grow p-4 space-y-4">
          {activities.length === 0 && !isViewingHistory ? ( // Show different message if viewing history and it's empty
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
                // User Message Styling
                return (
                  <div key={activity.id || `user-${index}`} className="flex justify-end ml-10"> {/* Added ml-10 for indentation */}
                    <div className="max-w-[85%] p-2 px-3 rounded-lg text-sm shadow-sm bg-blue-100 text-blue-900"> {/* Darker blue text */}
                      <p className="whitespace-pre-wrap break-words">{activity.text}</p>
                      <p className="text-xs mt-1 text-blue-700 text-right"> {/* Darker timestamp */}
                        {formatTimestamp(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              } else { // AI Activity Styling
                return (
                  <div key={activity.id || `ai-${index}`} className="mr-10"> {/* Added mr-10 for indentation */}
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                          {getActivityIcon(activity.type)}
                        </div>
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

        {/* User Input Area (sticks to bottom of this scrollable container) */}
        <div className="sticky bottom-0 border-t border-slate-300 p-4 bg-white mt-auto"> {/* Added mt-auto */}
// Removed the old footer that showed auto-scroll status
    </div>
  )
}