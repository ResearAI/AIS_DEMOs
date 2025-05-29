"use client"

import React, { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Paperclip, ArrowUp, Loader2, FileText, X, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { apiService } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

export default function Home() {
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!prompt.trim()) {
      toast({
        title: "Please enter a task",
        description: "Describe what you need Resear Pro to help you with",
        variant: "destructive"
      })
      return
    }

    setIsSubmitting(true)

    try {
      const response = await apiService.createTask(prompt, attachments)
      router.push(`/dashboard?taskId=${response.task_id}&prompt=${encodeURIComponent(prompt)}`)
    } catch (error) {
      console.error('Failed to create task:', error)
      toast({
        title: "Failed to create task",
        description: "Please check your connection and try again",
        variant: "destructive"
      })
      setIsSubmitting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)
      setAttachments(prev => [...prev, ...newFiles])
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <main className="min-h-screen bg-gray-50 relative overflow-hidden">
      {/* 水墨画背景 - 极淡 */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-50/95 to-gray-100/90"></div>
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" preserveAspectRatio="xMidYMid slice">
          <filter id="ink">
            <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="4" result="turbulence"/>
            <feColorMatrix in="turbulence" type="saturate" values="0"/>
          </filter>
          <rect width="100%" height="100%" filter="url(#ink)"/>
        </svg>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          {/* 品牌标识 - 极简设计 */}
          <div className="text-center mb-12">
            <div className="inline-block relative">
              <h1 className="text-6xl font-extralight tracking-tight">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-700 via-sky-600 to-slate-700">Resear</span>
                <span className="font-normal text-gray-800 ml-2">Pro</span>
              </h1>
              <div className="absolute -top-3 -right-3 text-gray-400 opacity-50">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>

            <p className="mt-4 text-gray-600 font-light">
              AI-powered research assistant
            </p>
          </div>

          {/* 输入区域 - 毛玻璃效果 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className={`relative transition-all duration-300 ${isFocused ? 'transform -translate-y-1' : ''}`}>
              <div className={`
                backdrop-blur-xl bg-white/60 border rounded-2xl 
                shadow-lg hover:shadow-xl transition-all duration-300
                ${isFocused ? 'border-gray-300 shadow-gray-200/50' : 'border-gray-200/50'}
              `}>
                <textarea
                  className="w-full px-6 py-5 text-base resize-none border-0 bg-transparent focus:outline-none placeholder:text-gray-400 min-h-[120px]"
                  placeholder="Describe your research task..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  disabled={isSubmitting}
                />

                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200/30">
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-gray-600 hover:text-gray-800 hover:bg-gray-100/50"
                      onClick={triggerFileInput}
                      disabled={isSubmitting}
                    >
                      <Paperclip className="h-4 w-4 mr-2" />
                      Attach files
                    </Button>

                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      multiple
                      onChange={handleFileChange}
                      disabled={isSubmitting}
                    />

                    {attachments.length > 0 && (
                      <span className="text-sm text-gray-600">
                        {attachments.length} file{attachments.length > 1 ? 's' : ''} attached
                      </span>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:opacity-90 text-white px-6 rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
                    disabled={isSubmitting || !prompt.trim()}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Start Research
                        <ArrowUp className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* 文件列表 - 简约风格 */}
            {attachments.length > 0 && (
              <div className="backdrop-blur-lg bg-white/60 border border-gray-200/50 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Attached Files
                </h3>
                <div className="space-y-2">
                  {attachments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between py-2 px-3 bg-gray-50/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">{file.name}</p>
                          <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => removeAttachment(index)}
                        disabled={isSubmitting}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>

          {/* 提交状态 - 简约动画 */}
          {isSubmitting && (
            <div className="text-center mt-8">
              <div className="inline-flex items-center gap-3 text-gray-700">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-600 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-sm">Processing your request</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}