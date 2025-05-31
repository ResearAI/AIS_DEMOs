"use client"

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Terminal, FileText, FolderTree, ChevronRight, ChevronDown, File, Folder, Info, X, Plus, ArrowLeft, ArrowRight, Save, RotateCcw, Eye, EyeOff, ChevronLeft, Download, Play, Pause, CheckCircle2, XCircle, Edit, AlertCircle } from "lucide-react"
import { FileStructureNode, apiService } from "@/lib/api"

// 添加CSS样式
const scrollbarStyles = `
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #94a3b8 transparent;
  }
  
  .scrollbar-thin::-webkit-scrollbar {
    height: 4px;
    width: 4px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #94a3b8;
    border-radius: 2px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }
  
  .scrollbar-hide {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
`

// 注入样式
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style')
  styleElement.textContent = scrollbarStyles
  if (!document.head.querySelector('style[data-component="computer-view"]')) {
    styleElement.setAttribute('data-component', 'computer-view')
    document.head.appendChild(styleElement)
  }
}

// 动态导入 Prism.js 以避免服务器端渲染问题
let Prism: any;
if (typeof window !== 'undefined') {
  try {
    Prism = require('prismjs');
    require('prismjs/components/prism-python');
    require('prismjs/components/prism-javascript');
    require('prismjs/components/prism-typescript');
    require('prismjs/components/prism-css');
    require('prismjs/components/prism-json');
    require('prismjs/themes/prism-coy.css');
  } catch (e) {
    console.warn('Prism.js not available');
  }
}

// 简单的内置Markdown渲染器
const MarkdownRenderer = ({ children }: { children: string }) => {
  const convertSimpleMarkdown = (text: string) => {
    return text
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4">$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*)\*/gim, '<em class="italic">$1</em>')
      .replace(/`([^`]*)`/gim, '<code class="bg-slate-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
      .replace(/```([^`]*)```/gim, '<pre class="bg-slate-100 p-3 rounded-lg overflow-x-auto mb-4"><code class="text-sm font-mono">$1</code></pre>')
      .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">$1</a>')
      .replace(/^\* (.+)$/gim, '<li class="ml-4">$1</li>')
      .replace(/(<li.*?<\/li>(\s*<li.*?<\/li>)*)/g, '<ul class="mb-3">$1</ul>')
      .replace(/\n/gim, '<br>');
  };

  const htmlContent = convertSimpleMarkdown(children || '');
  
  return (
    <div 
      className="text-slate-800 leading-relaxed max-w-none prose prose-slate"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};

// 文件状态接口定义
interface FileState {
  id: string
  filename: string
  content: string
  originalContent: string  // 用于检测是否有变更
  isDirty: boolean  // 是否有未保存的变更
  isLoading: boolean
  lastSaved: number
  fileType: 'text' | 'image' | 'video' | 'pdf' | 'markdown' | 'html' | 'folder'
}

// 文件系统状态管理器 - 重新设计为前端优先架构
class FileSystemManager {
  private files: Map<string, FileState> = new Map()
  private openTabs: string[] = []
  private activeTab: string | null = null
  private listeners: Set<() => void> = new Set()
  
  // 虚拟文件结构 - 前端维护的文件树
  private virtualFileStructure: FileStructureNode = {
    name: 'resear-pro-task',
    type: 'directory',
    children: []
  }
  
  // 待同步的操作队列
  private pendingOperations: Array<{
    type: 'create' | 'delete' | 'rename' | 'save'
    data: any
    timestamp: number
  }> = []

  // 添加状态变更监听器
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // 通知所有监听器状态已变更
  private notify() {
    this.listeners.forEach(listener => listener())
  }

  // 获取虚拟文件结构
  getVirtualFileStructure(): FileStructureNode {
    return this.virtualFileStructure
  }

  // 更新虚拟文件结构
  private updateVirtualFileStructure(operation: string, path: string, isDirectory: boolean = false) {
    const pathParts = path.split('/').filter(part => part !== 'resear-pro-task' && part !== '')
    
    if (operation === 'create') {
      this.addToVirtualStructure(pathParts, isDirectory)
    } else if (operation === 'delete') {
      this.removeFromVirtualStructure(pathParts)
    }
    
    this.notify()
  }

  // 添加到虚拟文件结构
  private addToVirtualStructure(pathParts: string[], isDirectory: boolean) {
    let current = this.virtualFileStructure
    
    // 遍历路径的每一部分（除了最后一个）
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i]
      if (!current.children) current.children = []
      
      let found = current.children.find(child => child.name === part && child.type === 'directory')
      if (!found) {
        found = { name: part, type: 'directory', children: [] }
        current.children.push(found)
      }
      current = found
    }
    
    // 添加最后一个文件/文件夹
    if (pathParts.length > 0) {
      const fileName = pathParts[pathParts.length - 1]
      if (!current.children) current.children = []
      
      // 检查是否已存在
      const exists = current.children.some(child => child.name === fileName)
      if (!exists) {
        current.children.push({
          name: fileName,
          type: isDirectory ? 'directory' : 'file',
          ...(isDirectory ? { children: [] } : {})
        })
      }
    }
  }

  // 从虚拟文件结构中移除
  private removeFromVirtualStructure(pathParts: string[]) {
    if (pathParts.length === 0) return
    
    let current = this.virtualFileStructure
    const parents: FileStructureNode[] = [current]
    
    // 找到父节点路径
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i]
      if (!current.children) return
      
      const found = current.children.find(child => child.name === part)
      if (!found) return
      
      parents.push(found)
      current = found
    }
    
    // 删除目标文件/文件夹
    const targetName = pathParts[pathParts.length - 1]
    if (current.children) {
      current.children = current.children.filter(child => child.name !== targetName)
    }
  }

  // 获取文件状态
  getFile(filename: string): FileState | undefined {
    return this.files.get(filename)
  }

  // 获取所有打开的标签页
  getOpenTabs(): FileState[] {
    return this.openTabs.map(filename => this.files.get(filename)!).filter(Boolean)
  }

  // 获取当前活动文件
  getActiveFile(): FileState | null {
    return this.activeTab ? this.files.get(this.activeTab) || null : null
  }

  // 创建文件 - 立即在前端创建
  createFile(filename: string, content: string = '', parentPath: string = ''): FileState {
    // 计算完整路径
    let fullPath = filename
    if (parentPath && parentPath !== 'resear-pro-task') {
      fullPath = `${parentPath}/${filename}`
    }

    // 立即创建文件状态
    const file: FileState = {
      id: `file-${fullPath}-${Date.now()}`,
      filename: fullPath,
      content,
      originalContent: content,
      isDirty: false,
      isLoading: false,
      lastSaved: Date.now(),
      fileType: this.detectFileType(fullPath)
    }

    // 添加到文件映射
    this.files.set(fullPath, file)
    
    // 更新虚拟文件结构
    this.updateVirtualFileStructure('create', fullPath, false)
    
    // 添加到待同步队列
    this.pendingOperations.push({
      type: 'create',
      data: { filename: fullPath, content },
      timestamp: Date.now()
    })

    // 立即打开文件
    this.openFile(fullPath, content)
    
    return file
  }

  // 创建文件夹 - 立即在前端创建
  createFolder(foldername: string, parentPath: string = ''): void {
    // 计算完整路径
    let fullPath = foldername
    if (parentPath && parentPath !== 'resear-pro-task') {
      fullPath = `${parentPath}/${foldername}`
    }

    // 更新虚拟文件结构
    this.updateVirtualFileStructure('create', fullPath, true)
    
    // 添加到待同步队列
    this.pendingOperations.push({
      type: 'create',
      data: { filename: fullPath, isFolder: true },
      timestamp: Date.now()
    })
  }

  // 打开文件
  openFile(filename: string, content: string = '', fileType?: string): FileState {
    const id = `file-${filename}-${Date.now()}`
    
    if (!this.files.has(filename)) {
      const file: FileState = {
        id,
        filename,
        content,
        originalContent: content,
        isDirty: false,
        isLoading: false,
        lastSaved: Date.now(),
        fileType: fileType as any || this.detectFileType(filename)
      }
      this.files.set(filename, file)
    }

    // 如果标签页不存在，添加到最右侧
    if (!this.openTabs.includes(filename)) {
      this.openTabs.push(filename)
    }

    // 设置为活动标签页
    this.activeTab = filename
    this.notify()
    
    return this.files.get(filename)!
  }

  // 关闭文件标签页
  closeFile(filename: string): boolean {
    const fileIndex = this.openTabs.indexOf(filename)
    if (fileIndex === -1) return false

    // 移除标签页
    this.openTabs.splice(fileIndex, 1)

    // 如果关闭的是当前活动标签页，切换到相邻标签页
    if (this.activeTab === filename) {
      if (this.openTabs.length > 0) {
        // 优先选择右侧标签页，如果没有则选择左侧
        const newIndex = Math.min(fileIndex, this.openTabs.length - 1)
        this.activeTab = this.openTabs[newIndex]
      } else {
        this.activeTab = null
      }
    }

    this.notify()
    return true
  }

  // 切换活动标签页
  setActiveTab(filename: string) {
    if (this.openTabs.includes(filename)) {
      this.activeTab = filename
      this.notify()
    }
  }

  // 更新文件内容
  updateFileContent(filename: string, content: string) {
    const file = this.files.get(filename)
    if (file) {
      file.content = content
      file.isDirty = content !== file.originalContent
      
      // 移除自动添加到待同步队列的逻辑
      // 现在只更新本地状态，不自动保存到后端
      
      this.notify()
    }
  }

  // 保存文件
  saveFile(filename: string) {
    const file = this.files.get(filename)
    if (file) {
      file.originalContent = file.content
      file.isDirty = false
      file.lastSaved = Date.now()
      this.notify()
      return file.content
    }
    return null
  }

  // 重命名文件
  renameFile(oldName: string, newName: string) {
    const file = this.files.get(oldName)
    if (file) {
      // 更新文件映射
      this.files.delete(oldName)
      file.filename = newName
      this.files.set(newName, file)

      // 更新标签页
      const tabIndex = this.openTabs.indexOf(oldName)
      if (tabIndex !== -1) {
        this.openTabs[tabIndex] = newName
      }

      // 更新活动标签页
      if (this.activeTab === oldName) {
        this.activeTab = newName
      }

      // 添加到待同步队列
      this.pendingOperations.push({
        type: 'rename',
        data: { oldName, newName },
        timestamp: Date.now()
      })

      this.notify()
    }
  }

  // 删除文件
  deleteFile(filename: string) {
    this.files.delete(filename)
    this.closeFile(filename)
    
    // 更新虚拟文件结构
    const pathParts = filename.split('/').filter(part => part !== 'resear-pro-task' && part !== '')
    this.removeFromVirtualStructure(pathParts)
    
    // 添加到待同步队列
    this.pendingOperations.push({
      type: 'delete',
      data: { filename },
      timestamp: Date.now()
    })
  }

  // 检测文件类型
  detectFileType(filename: string): FileState['fileType'] {
    const extension = filename.split('.').pop()?.toLowerCase() || ''
    
    if (extension === 'md') return 'markdown'
    if (extension === 'html' || extension === 'htm') return 'html'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) return 'image'
    if (['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(extension)) return 'video'
    if (extension === 'pdf') return 'pdf'
    return 'text'
  }

  // 获取所有有变更的文件
  getDirtyFiles(): FileState[] {
    return Array.from(this.files.values()).filter(file => file.isDirty)
  }

  // 获取待同步的操作
  getPendingOperations() {
    return [...this.pendingOperations]
  }

  // 清除已同步的操作
  clearPendingOperations() {
    this.pendingOperations = []
  }

  // 合并外部文件结构（从后端获取）
  mergeExternalFileStructure(externalStructure: FileStructureNode) {
    // 智能合并逻辑：保留本地创建的文件，合并外部文件
    const mergeNodes = (localNode: FileStructureNode, externalNode: FileStructureNode): FileStructureNode => {
      const result: FileStructureNode = {
        name: localNode.name,
        type: localNode.type,
        children: []
      }

      // 创建一个映射来跟踪现有的节点
      const localMap = new Map<string, FileStructureNode>()
      const externalMap = new Map<string, FileStructureNode>()

      // 建立本地节点映射
      if (localNode.children) {
        localNode.children.forEach(child => {
          localMap.set(child.name, child)
        })
      }

      // 建立外部节点映射
      if (externalNode.children) {
        externalNode.children.forEach(child => {
          externalMap.set(child.name, child)
        })
      }

      // 合并所有唯一的节点
      const allNames = new Set([...localMap.keys(), ...externalMap.keys()])
      
      allNames.forEach(name => {
        const localChild = localMap.get(name)
        const externalChild = externalMap.get(name)

        if (localChild && externalChild) {
          // 两边都存在，递归合并
          if (localChild.type === 'directory' && externalChild.type === 'directory') {
            result.children!.push(mergeNodes(localChild, externalChild))
          } else {
            // 文件优先使用本地版本（保留用户修改）
            result.children!.push(localChild)
          }
        } else if (localChild) {
          // 只存在本地，保留
          result.children!.push(localChild)
        } else if (externalChild) {
          // 只存在外部，添加
          result.children!.push(externalChild)
        }
      })

      return result
    }

    // 如果当前虚拟结构为空或只有根节点，直接使用外部结构
    if (!this.virtualFileStructure.children || this.virtualFileStructure.children.length === 0) {
      this.virtualFileStructure = externalStructure
    } else {
      // 否则进行智能合并
      this.virtualFileStructure = mergeNodes(this.virtualFileStructure, externalStructure)
    }
    
    this.notify()
  }
}

interface ComputerViewRef {
  save: () => void;
  revert: () => void;
}

interface ComputerViewProps {
  currentFile: string
  fileContent: string
  setFileContent: (content: string) => void
  isLive?: boolean
  taskStatus?: string
  terminalOutput?: string[]
  fileStructure?: FileStructureNode | null
  isViewingHistory?: boolean;
  historyLength?: number;
  currentHistoryIndexValue?: number;
  onHistoryChange?: (newIndex: number) => void;
  showOnlyFileTree?: boolean;
  showOnlyWorkspace?: boolean;
  maxTabs?: number;
  onFileSelect?: (filename: string) => void;
  onFileEditStateChange?: (hasChanges: boolean, activeFilename: string | null) => void;
  taskId?: string;
  activities?: any[];
  taskStartTime?: number;
}

export const ComputerView = forwardRef<ComputerViewRef, ComputerViewProps>(({
  currentFile,
  fileContent,
  setFileContent,
  isLive = true,
  taskStatus = 'idle',
  terminalOutput = [],
  fileStructure = null,
  isViewingHistory = false,
  historyLength = 0,
  currentHistoryIndexValue = -1,
  onHistoryChange,
  showOnlyFileTree = false,
  showOnlyWorkspace = false,
  maxTabs = 999,  // 移除4个标签页的限制
  onFileSelect,
  onFileEditStateChange,
  taskId,
  activities = [],
  taskStartTime
}, ref) => {
  // 文件系统状态管理
  const fileSystemRef = useRef<FileSystemManager | null>(null)
  if (!fileSystemRef.current) {
    fileSystemRef.current = new FileSystemManager()
  }
  const fileSystem = fileSystemRef.current

  const [selectedView, setSelectedView] = useState<string>('editing')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['resear-pro-task']))
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  
  // 强制重新渲染的状态
  const [, forceUpdate] = useState({})
  const triggerUpdate = useCallback(() => forceUpdate({}), [])

  // 订阅文件系统状态变化
  useEffect(() => {
    const unsubscribe = fileSystem.subscribe(triggerUpdate)
    return unsubscribe
  }, [fileSystem, triggerUpdate])

  const terminalInputRef = useRef<HTMLInputElement>(null)
  const terminalDisplayRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  const [terminalInputValue, setTerminalInputValue] = useState('')
  const [displayedTerminalOutput, setDisplayedTerminalOutput] = useState<string[]>([])

  const [showFileContextMenu, setShowFileContextMenu] = useState<{
    show: boolean, x: number, y: number, filename: string, isFolder: boolean
  }>({
    show: false, x: 0, y: 0, filename: '', isFolder: false
  })
  const [newItemDialog, setNewItemDialog] = useState<{
    show: boolean, type: 'file' | 'folder', parentPath: string, inputValue: string
  }>({
    show: false, type: 'file', parentPath: '', inputValue: ''
  })
  const [renameDialog, setRenameDialog] = useState<{
    show: boolean, filename: string, newName: string
  }>({
    show: false, filename: '', newName: ''
  })

  // 监听来自父组件的文件变化
  useEffect(() => {
    if (currentFile && fileContent !== undefined && fileContent !== null && !isViewingHistory) {
      fileSystem.openFile(currentFile, fileContent)
      
      // 如果是工作空间组件且有新文件更新，自动切换到编辑视图
      if (showOnlyWorkspace && currentFile) {
        setSelectedView('editing')
        console.log('Auto-switched to editing view for file:', currentFile)
      }
    }
  }, [currentFile, fileContent, isViewingHistory, showOnlyWorkspace])

  // 初始化时合并外部文件结构
  useEffect(() => {
    if (fileStructure && !isViewingHistory) {
      // 总是尝试合并外部结构，智能合并逻辑会处理重复文件
      fileSystem.mergeExternalFileStructure(fileStructure)
    }
  }, [fileStructure, isViewingHistory])

  // 实时更新文件内容
  useEffect(() => {
    if (currentFile && fileContent !== undefined && fileContent !== null && isLive && !isViewingHistory) {
      const existingFile = fileSystem.getFile(currentFile)
      if (existingFile && !existingFile.isDirty) {
        // 只有在文件没有本地修改时才更新内容
        fileSystem.openFile(currentFile, fileContent)
      }
    }
  }, [currentFile, fileContent, isLive, isViewingHistory])

  // 移除自动切换到终端的逻辑，让用户完全控制视图切换
  // 只有在用户首次进入且没有活动文件时才考虑显示Terminal
  useEffect(() => {
    if (terminalOutput.length > 0 && selectedView === 'editing') {
      const activeFile = fileSystem.getActiveFile()
      const openTabs = fileSystem.getOpenTabs()
      // 只有在没有打开任何文件时才自动切换到terminal
      if (!activeFile && openTabs.length === 0) {
        setSelectedView('terminal')
      }
    }
  }, [terminalOutput.length])

  // 更新终端输出
  useEffect(() => {
    setDisplayedTerminalOutput(terminalOutput || [])
  }, [terminalOutput])

  // 自动滚动终端
  useEffect(() => {
    if (selectedView === 'terminal' && terminalDisplayRef.current) {
      terminalDisplayRef.current.scrollTop = terminalDisplayRef.current.scrollHeight
    }
  }, [displayedTerminalOutput, selectedView])

  // 自动聚焦终端输入
  useEffect(() => {
    if (selectedView === 'terminal' && terminalInputRef.current) {
      terminalInputRef.current.focus()
    }
  }, [selectedView])

  // 通知父组件文件编辑状态变化
  useEffect(() => {
    if (onFileEditStateChange) {
      const activeFile = fileSystem.getActiveFile()
      onFileEditStateChange(activeFile?.isDirty || false, activeFile?.filename || null)
    }
  }, [onFileEditStateChange])

  // 文件树点击处理 - 确保强制切换到编辑视图
  const handleFileClick = useCallback((filename: string) => {
    console.log('File clicked:', filename, 'Current view:', selectedView) // Debug log
    
    if (showOnlyFileTree && onFileSelect) {
      onFileSelect(filename)
      return
    }

    // 强制切换到编辑视图，立即生效
        setSelectedView('editing')

    // 打开文件（如果已打开则切换到该标签页）
    const existingFile = fileSystem.getFile(filename)
    if (existingFile) {
      fileSystem.setActiveTab(filename)
    } else {
      // 新文件，需要获取内容
      fileSystem.openFile(filename, '', fileSystem.detectFileType(filename))
    }

    // 通知父组件
    if (onFileSelect) {
      onFileSelect(filename)
    }
    
    // 延迟一点再滚动，确保DOM已更新
    setTimeout(() => {
      const tabs = fileSystem.getOpenTabs()
      const tabIndex = tabs.findIndex(tab => tab.filename === filename)
      
      if (tabIndex !== -1 && tabsContainerRef.current) {
        // 计算标签页的位置
        const tabWidth = 120 // 最小标签页宽度
        const scrollPosition = tabIndex * tabWidth
        
        // 平滑滚动到对应位置
        tabsContainerRef.current.scrollTo({
          left: scrollPosition,
          behavior: 'smooth'
        })
      }
    }, 50)
  }, [showOnlyFileTree, onFileSelect, selectedView])

  // 标签页自动滚动功能
  const scrollToTab = useCallback((filename: string) => {
    if (!tabsContainerRef.current) return
    
    const tabs = fileSystem.getOpenTabs()
    const tabIndex = tabs.findIndex(tab => tab.filename === filename)
    
    if (tabIndex !== -1) {
      // 计算标签页的位置
      const tabWidth = 120 // 最小标签页宽度
      const scrollPosition = tabIndex * tabWidth
      
      // 平滑滚动到对应位置
      tabsContainerRef.current.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      })
    }
  }, [])

  // 标签页切换处理 - 核心逻辑2
  const handleTabClick = useCallback((filename: string) => {
    fileSystem.setActiveTab(filename)
    if (onFileSelect) {
      onFileSelect(filename)
    }
    setSelectedView('editing')
    scrollToTab(filename)
  }, [onFileSelect, scrollToTab])

  // 关闭标签页处理
  const handleCloseTab = useCallback((filename: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    const file = fileSystem.getFile(filename)
    if (file?.isDirty) {
      const confirmed = window.confirm(`File "${filename}" has unsaved changes. Close anyway?`)
      if (!confirmed) return
    }
    
    fileSystem.closeFile(filename)
  }, [])

  // 文件内容更改处理 - 核心逻辑3
  const handleFileContentChange = useCallback((filename: string, newContent: string) => {
    fileSystem.updateFileContent(filename, newContent)
    // 现在只更新本地状态，不自动保存，需要手动点击Save按钮保存到后端
  }, [])

  // 保存文件处理 - 核心逻辑4
  const handleSave = useCallback(async (filename?: string) => {
    const targetFile = filename ? fileSystem.getFile(filename) : fileSystem.getActiveFile()
    if (!targetFile || !targetFile.isDirty || !taskId) return

    try {
      setSaveStatus('saving')
      const result = await apiService.saveFileContent(taskId, targetFile.filename, targetFile.content)
      
      if (result.success) {
        fileSystem.saveFile(targetFile.filename)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (error) {
      console.error('Save failed:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [taskId])

  // 还原文件处理
  const handleRevert = useCallback(() => {
    const activeFile = fileSystem.getActiveFile()
    if (activeFile) {
      fileSystem.updateFileContent(activeFile.filename, activeFile.originalContent)
    }
  }, [])

  // 文件创建处理 - 立即反馈
  const handleCreateNewItem = useCallback((name: string, type: 'file' | 'folder', parentPath: string) => {
    if (!name.trim()) return

    try {
      if (type === 'file') {
        // 立即在前端创建文件
        const newFile = fileSystem.createFile(name, '', parentPath)
        
        // 立即切换到新文件
        if (onFileSelect) {
          onFileSelect(newFile.filename)
        }
        setSelectedView('editing')
        
        // 展开父文件夹
        if (parentPath && parentPath !== 'resear-pro-task') {
          setExpandedFolders(prev => new Set([...prev, parentPath]))
        }
        
      } else {
        // 立即在前端创建文件夹
        fileSystem.createFolder(name, parentPath)
        
        // 展开新创建的文件夹和父文件夹
        const fullPath = parentPath && parentPath !== 'resear-pro-task' ? `${parentPath}/${name}` : name
        setExpandedFolders(prev => new Set([...prev, fullPath, parentPath]))
      }
      
    } catch (error) {
      console.error('Failed to create item:', error)
    }
  }, [onFileSelect])

  // 文件删除处理 - 立即反馈
  const handleDeleteItem = useCallback((filename: string) => {
    if (!filename) return

    try {
      // 立即从前端删除
      fileSystem.deleteFile(filename)
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }, [])

  // 文件重命名处理 - 立即反馈
  const handleRenameItem = useCallback((oldName: string, newName: string) => {
    if (!oldName || !newName.trim()) return

    try {
      // 立即在前端重命名
      fileSystem.renameFile(oldName, newName)
    } catch (error) {
      console.error('Failed to rename item:', error)
    }
  }, [])

  // 文件夹展开/折叠处理 - 核心逻辑8
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }, [])

  // 快捷键处理 - 增强逻辑11
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey)) {
        switch (event.key) {
          case 's':
            event.preventDefault()
            handleSave()
            break
          case 'w':
            event.preventDefault()
            const activeFile = fileSystem.getActiveFile()
            if (activeFile) {
              fileSystem.closeFile(activeFile.filename)
            }
            break
          case 'n':
            event.preventDefault()
            setNewItemDialog({ show: true, type: 'file', parentPath: '', inputValue: '' })
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    save: () => handleSave(),
    revert: handleRevert
  }), [handleSave, handleRevert])

  // 获取当前状态
  const openTabs = fileSystem.getOpenTabs()
  const activeFile = fileSystem.getActiveFile()

  // 渲染文件树的辅助函数 - 使用虚拟文件结构
  const renderFileTree = useCallback((node: FileStructureNode, path: string = '', level: number = 0) => {
    if (!node) return null

    const fullPath = path ? `${path}/${node.name}` : node.name
    const isExpanded = expandedFolders.has(fullPath)

    if (node.type === 'directory') {
      return (
        <div key={fullPath}>
          <div
            className="flex items-center gap-1 py-1 px-2 hover:bg-slate-100 cursor-pointer select-none text-sm"
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => toggleFolder(fullPath)}
            onContextMenu={(e) => handleFileRightClick(e, fullPath, true)}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Folder className="h-4 w-4 text-blue-600" />
            <span>{node.name}</span>
          </div>
          {isExpanded && node.children && (
            <div>
              {node.children.map(child => renderFileTree(child, fullPath, level + 1))}
            </div>
          )}
        </div>
      )
    } else {
      const isOpen = openTabs.some(tab => tab.filename === fullPath)
      const isActive = activeFile?.filename === fullPath
      
      return (
        <div
          key={fullPath}
          className={`flex items-center gap-1 py-1 px-2 hover:bg-slate-100 cursor-pointer text-sm transition-colors duration-150 ${
            isActive ? 'bg-blue-100 text-blue-800 border-r-2 border-blue-500' : 
            isOpen ? 'bg-blue-50 text-blue-700' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 24}px` }}
          onClick={() => handleFileClick(fullPath)}
          onContextMenu={(e) => handleFileRightClick(e, fullPath, false)}
        >
          <File className={`h-4 w-4 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
          <span className={isActive ? 'font-medium' : ''}>{node.name}</span>
          {isOpen && (
            <div className={`w-1.5 h-1.5 rounded-full ml-auto ${
              isActive ? 'bg-blue-600' : 'bg-blue-500'
            }`}></div>
          )}
        </div>
      )
    }
  }, [expandedFolders, openTabs, activeFile, handleFileClick, toggleFolder])

  // 右键菜单处理
  const handleFileRightClick = useCallback((e: React.MouseEvent, filename: string, isFolder: boolean) => {
    e.preventDefault()
    setShowFileContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      filename,
      isFolder
    })
  }, [])

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFileContextMenu(prev => ({ ...prev, show: false }))
    }
    
    if (showFileContextMenu.show) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showFileContextMenu.show])

  const handleTerminalInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTerminalInputValue(e.target.value)
  }

  const handleTerminalInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && terminalInputValue.trim() !== '') {
      e.preventDefault()
      const commandToDisplay = `> ${terminalInputValue}`
      setDisplayedTerminalOutput(prevOutput => [...prevOutput, commandToDisplay])
      console.log(`Terminal command submitted: ${terminalInputValue}`)
      setTerminalInputValue('')
    }
  }

  // 计算文件总数的辅助函数
  const countAllFiles = (node: FileStructureNode): number => {
    if (!node) return 0
    let count = node.type === 'file' ? 1 : 0
    if (node.children) {
      count += node.children.reduce((acc, child) => acc + countAllFiles(child), 0)
    }
    return count
  }

  // 计算运行时长
  const getRuntime = () => {
    if (!taskStartTime) return 'Unknown'
    const now = Date.now()
    const runtime = Math.floor((now - taskStartTime * 1000) / 1000)
    const hours = Math.floor(runtime / 3600)
    const minutes = Math.floor((runtime % 3600) / 60)
    const seconds = runtime % 60
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    } else {
      return `${seconds}s`
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 文件内容渲染器组件
  const FileContentRenderer = useCallback(({ file }: { file: FileState }) => {
    if (!file) return null

    const isMarkdown = file.fileType === 'markdown'

    // PDF查看器
    if (file.fileType === 'pdf') {
      return (
        <div className="h-full flex flex-col bg-white">
          <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium">{file.filename}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(file.content, '_blank')}
              disabled={!file.content}
            >
              <Download className="h-4 w-4 mr-1" />
              Open External
            </Button>
          </div>
          <div className="flex-1 relative">
            {file.content ? (
              <iframe
                src={file.content}
                className="w-full h-full border-0"
                title={`PDF viewer for ${file.filename}`}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-slate-100">
                <div className="text-center text-slate-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                  <p>No PDF content available</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }

    // 图片查看器
    if (file.fileType === 'image') {
      return (
        <div className="h-full flex flex-col bg-white">
          <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">{file.filename}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(file.content, '_blank')}
              disabled={!file.content}
            >
              <Download className="h-4 w-4 mr-1" />
              View Full Size
            </Button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {file.content ? (
              <img
                src={file.content}
                alt={file.filename}
                className="max-w-full max-h-full object-contain shadow-lg rounded-lg"
              />
            ) : (
              <div className="text-center text-slate-500">
                <Eye className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No image content available</p>
              </div>
            )}
          </div>
        </div>
      )
    }

    // HTML预览器
    if (file.fileType === 'html') {
      const [showCode, setShowCode] = useState(false)
      const iframeRef = useRef<HTMLIFrameElement>(null)

      // 修复：当文件内容变化时实时更新预览
      useEffect(() => {
        if (iframeRef.current && !showCode && file.content) {
          const iframe = iframeRef.current
          const doc = iframe.contentDocument || iframe.contentWindow?.document
          if (doc) {
            doc.open()
            doc.write(file.content)
            doc.close()
          }
        }
      }, [file.content, showCode]) // 添加file.content依赖

      return (
        <div className="h-full flex flex-col bg-white">
          <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium">{file.filename}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCode(!showCode)}
              >
                {showCode ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                {showCode ? 'Preview' : 'Code'}
              </Button>
            </div>
          </div>
          {showCode ? (
            <div className="flex-1 p-4 overflow-auto">
              <textarea
                className="w-full h-full border-none resize-none focus:outline-none font-mono text-sm"
                value={file.content}
                onChange={(e) => handleFileContentChange(file.filename, e.target.value)}
                readOnly={isViewingHistory}
              />
            </div>
          ) : (
            <div className="flex-1 relative">
              <iframe
                ref={iframeRef}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title={`HTML preview for ${file.filename}`}
              />
            </div>
          )}
        </div>
      )
    }

    // Markdown和文本文件编辑器
    return (
      <div className="h-full flex">
        {isMarkdown && showMarkdownPreview ? (
          <>
            <div className="w-1/2 border-r border-slate-200">
              <textarea
                className="w-full h-full p-4 border-none resize-none focus:outline-none font-mono text-sm"
                value={file.content}
                onChange={(e) => handleFileContentChange(file.filename, e.target.value)}
                placeholder="Enter your markdown content..."
                readOnly={isViewingHistory}
              />
            </div>
            <div className="w-1/2 p-4 overflow-auto bg-white">
              <MarkdownRenderer>{file.content}</MarkdownRenderer>
            </div>
          </>
        ) : (
          <textarea
            className="w-full h-full p-4 border-none resize-none focus:outline-none font-mono text-sm"
            value={file.content}
            onChange={(e) => handleFileContentChange(file.filename, e.target.value)}
            placeholder={
              file.fileType === 'markdown' 
                ? "Enter your markdown content..."
                : "Enter your content..."
            }
            readOnly={isViewingHistory}
          />
        )}
      </div>
    )
  }, [handleFileContentChange, showMarkdownPreview, isViewingHistory])

  // 如果只显示文件树
  if (showOnlyFileTree) {
    return (
      <div className="h-full flex flex-col bg-slate-50 relative">
        <div className="border-b border-slate-300 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            File Explorer
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
          {/* 使用虚拟文件结构而不是外部文件结构 */}
          {renderFileTree(fileSystem.getVirtualFileStructure())}
        </div>

        {/* 右键菜单 */}
        {showFileContextMenu.show && (
          <div
            className="fixed bg-white border border-slate-300 rounded-lg shadow-lg py-2 z-50 min-w-[160px]"
            style={{ left: showFileContextMenu.x, top: showFileContextMenu.y }}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
              onClick={() => {
                setNewItemDialog({ 
                  show: true, 
                  type: 'file', 
                  parentPath: showFileContextMenu.isFolder ? showFileContextMenu.filename : '',
                  inputValue: ''
                })
                setShowFileContextMenu(prev => ({ ...prev, show: false }))
              }}
            >
              <Plus className="h-4 w-4" />
              New File
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
              onClick={() => {
                setNewItemDialog({ 
                  show: true, 
                  type: 'folder', 
                  parentPath: showFileContextMenu.isFolder ? showFileContextMenu.filename : '',
                  inputValue: ''
                })
                setShowFileContextMenu(prev => ({ ...prev, show: false }))
              }}
            >
              <FolderTree className="h-4 w-4" />
              New Folder
            </button>
            {!showFileContextMenu.isFolder && (
              <>
                <div className="border-t border-slate-200 my-1"></div>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
                  onClick={() => {
                    setRenameDialog({ 
                      show: true, 
                      filename: showFileContextMenu.filename, 
                      newName: showFileContextMenu.filename 
                    })
                    setShowFileContextMenu(prev => ({ ...prev, show: false }))
                  }}
                >
                  <Edit className="h-4 w-4" />
                  Rename
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete ${showFileContextMenu.filename}?`)) {
                      handleDeleteItem(showFileContextMenu.filename)
                    }
                    setShowFileContextMenu(prev => ({ ...prev, show: false }))
                  }}
                >
                  <X className="h-4 w-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {/* 新建文件/文件夹对话框 */}
        {newItemDialog.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96">
              <h3 className="text-lg font-semibold mb-4">
                Create New {newItemDialog.type === 'file' ? 'File' : 'Folder'}
              </h3>
              <input
                type="text"
                value={newItemDialog.inputValue}
                onChange={(e) => setNewItemDialog(prev => ({ ...prev, inputValue: e.target.value }))}
                placeholder={`Enter ${newItemDialog.type} name...`}
                className="w-full border border-slate-300 rounded px-3 py-2 mb-4"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItemDialog.inputValue.trim()) {
                    handleCreateNewItem(newItemDialog.inputValue, newItemDialog.type, newItemDialog.parentPath)
                    setNewItemDialog({ show: false, type: 'file', parentPath: '', inputValue: '' })
                  } else if (e.key === 'Escape') {
                    setNewItemDialog({ show: false, type: 'file', parentPath: '', inputValue: '' })
                  }
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                  onClick={() => setNewItemDialog({ show: false, type: 'file', parentPath: '', inputValue: '' })}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  onClick={() => {
                    if (newItemDialog.inputValue.trim()) {
                      handleCreateNewItem(newItemDialog.inputValue, newItemDialog.type, newItemDialog.parentPath)
                      setNewItemDialog({ show: false, type: 'file', parentPath: '', inputValue: '' })
                    }
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 重命名对话框 */}
        {renameDialog.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96">
              <h3 className="text-lg font-semibold mb-4">Rename File</h3>
              <input
                type="text"
                value={renameDialog.newName}
                onChange={(e) => setRenameDialog(prev => ({ ...prev, newName: e.target.value }))}
                className="w-full border border-slate-300 rounded px-3 py-2 mb-4"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameDialog.newName.trim()) {
                    handleRenameItem(renameDialog.filename, renameDialog.newName)
                    setRenameDialog({ show: false, filename: '', newName: '' })
                  } else if (e.key === 'Escape') {
                    setRenameDialog({ show: false, filename: '', newName: '' })
                  }
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                  onClick={() => setRenameDialog({ show: false, filename: '', newName: '' })}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  onClick={() => {
                    if (renameDialog.newName.trim()) {
                      handleRenameItem(renameDialog.filename, renameDialog.newName)
                      setRenameDialog({ show: false, filename: '', newName: '' })
                    }
                  }}
                >
                  Rename
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 如果只显示工作空间（文件编辑器和终端）
  if (showOnlyWorkspace) {
    return (
      <div className="h-full flex flex-col bg-white">
        {/* 文件标签栏 */}
        <div className="flex items-center border-b border-slate-300 bg-slate-50 min-h-[40px] flex-shrink-0">
          {/* 标签页滚动区域 */}
          <div className="flex-1 flex items-center overflow-hidden">
            <div
              ref={tabsContainerRef}
              className="flex overflow-x-auto flex-1 h-full scrollbar-thin"
              style={{ 
                scrollBehavior: 'smooth',
                scrollbarWidth: 'thin',
                scrollbarColor: '#94a3b8 transparent'
              }}
              onWheel={(e) => {
                // 支持鼠标滚轮水平滚动
                if (tabsContainerRef.current) {
                  e.preventDefault()
                  tabsContainerRef.current.scrollLeft += e.deltaY
                }
              }}
            >
              {openTabs.map(tab => (
                <div
                  key={tab.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleTabClick(tab.filename)}
                  className={`flex items-center gap-2 px-3 h-10 text-sm cursor-pointer min-w-[120px] max-w-[200px] border-r border-slate-300 flex-shrink-0 ${
                    activeFile?.filename === tab.filename && selectedView === 'editing'
                      ? 'bg-white text-slate-900 border-b-2 border-blue-500' 
                      : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate flex-1">{tab.filename}</span>
                  {tab.isDirty && <span className="w-2 h-2 bg-orange-400 rounded-full flex-shrink-0" />}
                  <button
                    onClick={(e) => handleCloseTab(tab.filename, e)}
                    className="p-0.5 hover:bg-slate-300 rounded flex-shrink-0"
                    aria-label={`Close tab ${tab.filename}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 视图选择按钮 */}
          <div className="flex border-l border-slate-300 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 px-3 rounded-none text-xs flex items-center justify-center gap-1 ${
                selectedView === 'terminal' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
              }`}
              onClick={() => setSelectedView('terminal')}
            >
              <Terminal className="h-3 w-3" />
              <span>Terminal</span>
              {terminalOutput.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full">
                  {Math.floor(terminalOutput.length / 2)}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 px-3 rounded-none text-xs flex items-center justify-center gap-1 border-l border-slate-300 ${
                selectedView === 'info' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
              }`}
              onClick={() => setSelectedView('info')}
            >
              <Info className="h-3 w-3" />
              <span>Info</span>
            </Button>
          </div>

          {/* 增强的状态指示器 */}
          <div className="flex items-center border-l border-slate-300 flex-shrink-0 px-3">
            {saveStatus !== 'idle' && (
              <div className={`flex items-center gap-2 text-xs transition-all duration-300 ${
                saveStatus === 'saving' ? 'text-blue-600' :
                saveStatus === 'saved' ? 'text-green-600' :
                'text-red-600'
              }`}>
                {saveStatus === 'saving' && (
                  <>
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-medium">保存中...</span>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <CheckCircle2 className="h-4 w-4 animate-pulse" />
                    <span className="font-medium">已保存</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <XCircle className="h-4 w-4 animate-bounce" />
                    <span className="font-medium">保存失败</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 文件工具栏 */}
        {selectedView === 'editing' && activeFile && (
          <div className="flex items-center border-b border-slate-300 bg-slate-100 h-8 flex-shrink-0 px-2">
            <div className="flex items-center gap-1">
              {/* Markdown预览切换按钮 */}
              {activeFile.fileType === 'markdown' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 border-slate-300 rounded text-xs px-2 py-1 flex items-center gap-1"
                  onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
                >
                  {showMarkdownPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showMarkdownPreview ? 'Code' : 'Preview'}
                </Button>
              )}
              
              {/* 文件信息 */}
              <div className="text-xs text-slate-600 flex items-center gap-2 ml-2">
                <span>{activeFile.fileType}</span>
                <span>•</span>
                <span>{activeFile.content.split('\n').length} lines</span>
                {activeFile.isDirty && (
                  <>
                    <span>•</span>
                    <span className="text-orange-600">未保存</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 内容区域 */}
        <div className="flex-1 overflow-hidden">
          {selectedView === 'editing' && activeFile && (
            <FileContentRenderer file={activeFile} />
          )}

          {selectedView === 'editing' && !activeFile && (
            <div className="h-full flex items-center justify-center bg-slate-50">
              <div className="text-center text-slate-500">
                <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No file selected</p>
                <p className="text-sm mt-1">Select a file from the tree to start editing</p>
              </div>
            </div>
          )}

          {selectedView === 'terminal' && (
            <div className="h-full flex flex-col bg-slate-900">
              <div
                ref={terminalDisplayRef}
                className="flex-1 overflow-y-auto p-4 font-mono text-sm custom-scrollbar-dark"
              >
                {displayedTerminalOutput.length > 0 ? (
                  displayedTerminalOutput.map((line, i) => (
                    <div
                      key={i}
                      className={`mb-1 ${
                        line.startsWith('$') ? 'text-green-400 font-bold' : 
                        line.startsWith('>') ? 'text-sky-400' : 'text-slate-300'
                      }`}
                      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                    >
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-400 text-center py-8">
                    Waiting for terminal output...
                  </div>
                )}
              </div>
              <div className="flex items-center p-2 border-t border-slate-700 flex-shrink-0">
                <span className="text-slate-400 font-mono text-sm mr-2">&gt;</span>
                <input
                  ref={terminalInputRef}
                  type="text"
                  value={terminalInputValue}
                  onChange={handleTerminalInputChange}
                  onKeyDown={handleTerminalInputKeyDown}
                  className="flex-1 bg-transparent text-slate-300 outline-none font-mono text-sm placeholder:text-slate-500"
                  placeholder="Type a command..."
                  disabled={isViewingHistory}
                />
              </div>
            </div>
          )}

          {selectedView === 'info' && (
            <div className="p-4 overflow-y-auto custom-scrollbar">
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Task Status</h3>
                  <div className="bg-slate-100 rounded-lg p-4">
                    <div className={`inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full ${
                      taskStatus === 'completed' ? 'bg-green-100 text-green-800' :
                      taskStatus === 'failed' ? 'bg-red-100 text-red-800' :
                      taskStatus === 'started' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-200 text-slate-800'
                    }`}>
                      {taskStatus === 'completed' ? '✓ Completed' :
                       taskStatus === 'failed' ? '✗ Failed' :
                       taskStatus === 'started' ? '● Running' : '○ Waiting'}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Project Overview</h3>
                  <div className="bg-slate-100 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total files:</span>
                      <span>{countAllFiles(fileSystem.getVirtualFileStructure())}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Open tabs:</span>
                      <span>{openTabs.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Modified files:</span>
                      <span>{fileSystem.getDirtyFiles().length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Steps completed:</span>
                      <span>{activities?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Runtime:</span>
                      <span>{getRuntime()}</span>
                    </div>
                  </div>
                </div>

                {activeFile && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">
                      Current File {activeFile.isDirty ? <span className="text-orange-500 font-normal">(Unsaved)</span> : ''}
                    </h3>
                    <div className="bg-slate-100 rounded-lg p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Name:</span>
                        <span className="font-mono">{activeFile.filename}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Type:</span>
                        <span className="capitalize">{activeFile.fileType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Size:</span>
                        <span>{formatFileSize(new Blob([activeFile.content]).size)}</span>
                      </div>
                      {(activeFile.fileType === 'text' || activeFile.fileType === 'markdown') && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Lines:</span>
                          <span>{activeFile.content.split('\n').length}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 历史记录控制区域 */}
        {historyLength > 0 && selectedView === 'editing' && (
          <div className="border-t border-slate-300 p-4 bg-slate-50 flex-shrink-0">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="border-slate-300 hover:bg-slate-200"
                onClick={() => onHistoryChange?.(Math.max(0, (currentHistoryIndexValue ?? 0) - 1))}
                disabled={currentHistoryIndexValue === 0}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Slider
                value={isViewingHistory ? [currentHistoryIndexValue ?? 0] : [historyLength - 1]}
                max={historyLength - 1}
                step={1}
                className="flex-1"
                onValueChange={value => onHistoryChange?.(value[0])}
              />
              <Button
                variant="outline"
                size="icon"
                className="border-slate-300 hover:bg-slate-200"
                onClick={() => onHistoryChange?.(Math.min(historyLength - 1, (currentHistoryIndexValue ?? -1) + 1))}
                disabled={!isViewingHistory || currentHistoryIndexValue === historyLength - 1}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
              {isViewingHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 border-blue-500 text-blue-600 hover:bg-blue-50"
                  onClick={() => onHistoryChange?.(-1)}
                >
                  Go Live
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // 默认的完整布局（左侧文件树 + 右侧工作空间）
  return (
    <div className="h-full flex w-full">
      {/* 左侧文件树 */}
      <div className="w-64 border-r border-slate-300 bg-slate-50 flex-shrink-0">
        <div className="border-b border-slate-300 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            File Explorer
          </h3>
        </div>
        <div className="overflow-y-auto h-[calc(100%-3rem)] py-2 custom-scrollbar">
          {/* 使用虚拟文件结构而不是外部文件结构 */}
          {renderFileTree(fileSystem.getVirtualFileStructure())}
        </div>
      </div>

      {/* 右侧工作空间 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* 重用工作空间的内容 */}
        <ComputerView 
          {...{
            currentFile,
            fileContent,
            setFileContent,
            isLive,
            taskStatus,
            terminalOutput,
            fileStructure,
            isViewingHistory,
            historyLength,
            currentHistoryIndexValue,
            onHistoryChange,
            showOnlyFileTree: false,
            showOnlyWorkspace: true,
            maxTabs,
            onFileSelect,
            onFileEditStateChange,
            taskId,
            activities,
            taskStartTime
          }}
          ref={ref}
        />
      </div>
    </div>
  )
})

ComputerView.displayName = 'ComputerView'