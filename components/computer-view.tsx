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

// 🆕 简化的路径工具
class PathUtils {
  static normalizePath(path: string): string {
    if (!path) return '';
    return path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  }
  
  static isSamePath(path1: string, path2: string): boolean {
    const normalized1 = this.normalizePath(path1);
    const normalized2 = this.normalizePath(path2);
    return normalized1 === normalized2;
  }
  
  static fromTreePath(treePath: string, parentPath: string = ''): string {
    if (!treePath) return '';
    
    if (treePath === '/' && !parentPath) {
      return '/';
    }
    
    if (parentPath && parentPath !== '/') {
      return `${parentPath}/${treePath}`;
    } else {
      return treePath;
    }
  }
  
  static getFileName(path: string): string {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1];
  }
  
  static getParentPath(path: string): string {
    if (!path || path === '/') return '/';
    const lastSlash = path.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : path.substring(0, lastSlash);
  }
}

// 文件状态接口定义
interface FileState {
  id: string
  filename: string
  content: string
  originalContent: string
  isDirty: boolean
  isLoading: boolean
  lastSaved: number
  fileType: 'text' | 'image' | 'video' | 'pdf' | 'markdown' | 'html' | 'folder'
}

// 🆕 简化的文件系统管理器 - 扁平化结构
class FileSystemManager {
  private files: Map<string, FileState> = new Map()
  private openTabs: string[] = []
  private activeTab: string | null = null
  private listeners: Set<() => void> = new Set()
  
  // 虚拟文件结构 - 扁平化根目录
  private virtualFileStructure: FileStructureNode = {
    name: '/',
    type: 'directory',
    children: []
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    this.listeners.forEach(listener => listener())
  }

  // 🆕 新增公开的notify方法，用于外部触发UI更新
  notifyListeners() {
    this.notify()
  }

  getVirtualFileStructure(): FileStructureNode {
    return this.virtualFileStructure
  }

  getFile(filename: string): FileState | undefined {
    return this.files.get(filename)
  }

  getOpenTabs(): FileState[] {
    return this.openTabs.map(filename => this.files.get(filename)!).filter(Boolean)
  }

  getActiveFile(): FileState | null {
    return this.activeTab ? this.files.get(this.activeTab) || null : null
  }

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

    if (!this.openTabs.includes(filename)) {
      this.openTabs.push(filename)
    }

    this.activeTab = filename
    this.notify()
    
    return this.files.get(filename)!
  }

  closeFile(filename: string): boolean {
    const fileIndex = this.openTabs.indexOf(filename)
    if (fileIndex === -1) return false

    this.openTabs.splice(fileIndex, 1)

    if (this.activeTab === filename) {
      if (this.openTabs.length > 0) {
        const newIndex = Math.min(fileIndex, this.openTabs.length - 1)
        this.activeTab = this.openTabs[newIndex]
      } else {
        this.activeTab = null
      }
    }

    this.notify()
    return true
  }

  setActiveTab(filename: string) {
    if (this.openTabs.includes(filename)) {
      this.activeTab = filename
      this.notify()
    }
  }

  updateFileContent(filename: string, content: string) {
    const file = this.files.get(filename)
    if (file) {
      file.content = content
      file.isDirty = content !== file.originalContent
      this.notify()
    }
  }

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

  detectFileType(filename: string): FileState['fileType'] {
    const extension = filename.split('.').pop()?.toLowerCase() || ''
    
    if (extension === 'md') return 'markdown'
    if (extension === 'html' || extension === 'htm') return 'html'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) return 'image'
    if (['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(extension)) return 'video'
    if (extension === 'pdf') return 'pdf'
    return 'text'
  }

  getDirtyFiles(): FileState[] {
    return Array.from(this.files.values()).filter(file => file.isDirty)
  }

  // 🆕 合并外部文件结构 - 扁平化处理
  mergeExternalFileStructure(externalStructure: FileStructureNode): void {
    console.log('Merging external file structure:', externalStructure);
    
    // 直接使用外部结构，不做复杂的合并
    this.virtualFileStructure = externalStructure;
    this.notify();
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
  // 🆕 新增：历史文件内容映射
  historicalFilesContent?: Map<string, string>;
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
  maxTabs = 999,
  onFileSelect,
  onFileEditStateChange,
  taskId,
  activities = [],
  taskStartTime,
  historicalFilesContent, // 🆕 新增参数
}, ref) => {
  // 文件系统状态管理
  const fileSystemRef = useRef<FileSystemManager | null>(null)
  if (!fileSystemRef.current) {
    fileSystemRef.current = new FileSystemManager()
  }
  const fileSystem = fileSystemRef.current

  const [selectedView, setSelectedView] = useState<string>('editing')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']))
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
  const [showHtmlPreview, setShowHtmlPreview] = useState(false)

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
      console.log('Opening file from parent:', currentFile, 'Content length:', fileContent.length);
      fileSystem.openFile(currentFile, fileContent);
      
      if (showOnlyWorkspace && currentFile) {
        setSelectedView('editing');
        console.log('Auto-switched to editing view for file:', currentFile);
      }
    }
  }, [currentFile, fileContent, isViewingHistory, showOnlyWorkspace]);

  // 初始化时合并外部文件结构
  useEffect(() => {
    if (fileStructure && !isViewingHistory) {
      console.log('Merging file structure:', fileStructure);
      fileSystem.mergeExternalFileStructure(fileStructure);
    }
  }, [fileStructure, isViewingHistory]);

  // 实时更新文件内容
  useEffect(() => {
    if (currentFile && fileContent !== undefined && fileContent !== null && isLive && !isViewingHistory) {
      const existingFile = fileSystem.getFile(currentFile)
      if (existingFile && !existingFile.isDirty) {
        fileSystem.openFile(currentFile, fileContent)
      }
    }
  }, [currentFile, fileContent, isLive, isViewingHistory]);

  // 只有在用户首次进入且没有活动文件时才考虑显示Terminal
  useEffect(() => {
    if (terminalOutput.length > 0 && selectedView === 'editing') {
      const activeFile = fileSystem.getActiveFile()
      const openTabs = fileSystem.getOpenTabs()
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

  // 🆕 获取文件内容的增强方法 - 支持历史回放
  const getFileContent = useCallback((filename: string): string => {
    // 🆕 历史模式：优先从历史内容映射获取
    if (isViewingHistory && historicalFilesContent) {
      const historicalContent = historicalFilesContent.get(filename);
      if (historicalContent !== undefined) {
        console.log(`获取历史文件内容: ${filename}, 长度: ${historicalContent.length}`);
        return historicalContent;
      }
    }
    
    // 实时模式或找不到历史内容时的回退逻辑
    if (filename === currentFile) {
      return fileContent || '';
    }
    
    const file = fileSystem.getFile(filename);
    return file?.content || '';
  }, [isViewingHistory, historicalFilesContent, currentFile, fileContent, fileSystem]);

  // 🆕 扁平化文件树渲染函数
  const renderFileTree = useCallback((node: FileStructureNode, path: string = '', level: number = 0) => {
    if (!node) return null

    const fullPath = PathUtils.fromTreePath(node.name, path);
    const isExpanded = expandedFolders.has(fullPath);

    if (node.type === 'directory') {
      return (
        <div key={fullPath}>
          <div
            className="flex items-center gap-1 py-1 px-2 hover:bg-white/60 cursor-pointer select-none text-sm transition-all duration-200 rounded-lg mx-1"
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
      const openTabs = fileSystem.getOpenTabs();
      const activeFile = fileSystem.getActiveFile();
      const isOpen = openTabs.some(tab => PathUtils.isSamePath(tab.filename, fullPath));
      const isActive = activeFile ? PathUtils.isSamePath(activeFile.filename, fullPath) : false;
      
      return (
        <div
          key={fullPath}
          className={`flex items-center gap-1 py-1 px-2 hover:bg-white/60 cursor-pointer text-sm transition-all duration-200 rounded-lg mx-1 ${
            isActive ? 'bg-blue-100/80 text-blue-800 shadow-sm' : 
            isOpen ? 'bg-blue-50/60 text-blue-700' : ''
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
  }, [expandedFolders, fileSystem]);

  // 🆕 增强的文件点击处理逻辑
  const handleFileClick = useCallback((filename: string) => {
    console.log('File clicked:', filename, 'Is viewing history:', isViewingHistory);
    
    if (showOnlyFileTree && onFileSelect) {
      onFileSelect(filename);
      return;
    }

    setSelectedView('editing');

    // 🆕 获取文件内容（支持历史回放）
    const content = getFileContent(filename);
    
    if (isViewingHistory) {
      console.log('History mode: displaying file', filename, 'with', content.length, 'characters');
    } else {
      const existingFile = fileSystem.getFile(filename);
      if (existingFile) {
        fileSystem.setActiveTab(filename);
      } else {
        fileSystem.openFile(filename, content, fileSystem.detectFileType(filename));
      }
    }

    if (onFileSelect) {
      onFileSelect(filename);
    }
    
    setTimeout(() => {
      if (!isViewingHistory) {
        const tabs = fileSystem.getOpenTabs();
        const tabIndex = tabs.findIndex(tab => PathUtils.isSamePath(tab.filename, filename));
        
        if (tabIndex !== -1 && tabsContainerRef.current) {
          const tabWidth = 120;
          const scrollPosition = tabIndex * tabWidth;
          
          tabsContainerRef.current.scrollTo({
            left: scrollPosition,
            behavior: 'smooth'
          });
        }
      }
    }, 50);
  }, [showOnlyFileTree, onFileSelect, selectedView, isViewingHistory, getFileContent]);

  // 标签页切换处理
  const handleTabClick = useCallback((filename: string) => {
    fileSystem.setActiveTab(filename)
    if (onFileSelect) {
      onFileSelect(filename)
    }
    setSelectedView('editing')
    scrollToTab(filename)
  }, [onFileSelect])

  // 标签页自动滚动功能
  const scrollToTab = useCallback((filename: string) => {
    if (!tabsContainerRef.current) return
    
    const tabs = fileSystem.getOpenTabs()
    const tabIndex = tabs.findIndex(tab => tab.filename === filename)
    
    if (tabIndex !== -1) {
      const tabWidth = 120
      const scrollPosition = tabIndex * tabWidth
      
      tabsContainerRef.current.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      })
    }
  }, [])

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

  // 文件内容更改处理
  const handleFileContentChange = useCallback((filename: string, newContent: string) => {
    fileSystem.updateFileContent(filename, newContent)
  }, [])

  // 保存文件处理
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

  // 文件夹展开/折叠处理
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

  // 终端输入处理
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

  // 快捷键处理
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

  // 🆕 增强的文件内容渲染器 - 支持历史回放
  const FileContentRenderer = useCallback(({ file, overrideContent }: { file: FileState; overrideContent?: string }) => {
    if (!file) return null;

    const displayContent = overrideContent !== undefined ? overrideContent : file.content;
    const isMarkdown = file.fileType === 'markdown';

    // PDF查看器
    if (file.fileType === 'pdf') {
      return (
        <div className="h-full flex flex-col bg-white">
          <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium">{file.filename}</span>
              {isViewingHistory && (
                <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded">
                  Historical View
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(displayContent, '_blank')}
              disabled={!displayContent}
            >
              <Download className="h-4 w-4 mr-1" />
              Open External
            </Button>
          </div>
          <div className="flex-1 relative">
            {displayContent ? (
              <iframe
                src={displayContent}
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
              {isViewingHistory && (
                <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded">
                  Historical View
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(displayContent, '_blank')}
              disabled={!displayContent}
            >
              <Download className="h-4 w-4 mr-1" />
              View Full Size
            </Button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {displayContent ? (
              <img
                src={displayContent}
                alt={file.filename}
                className="max-w-full max-h-full object-contain shadow-lg rounded-lg"
                onError={(e) => {
                  console.error('Image load error:', displayContent);
                  e.currentTarget.style.display = 'none';
                  const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                  if (nextElement) {
                    nextElement.style.display = 'block';
                  }
                }}
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

      useEffect(() => {
        if (iframeRef.current && !showCode && displayContent) {
          const iframe = iframeRef.current
          const doc = iframe.contentDocument || iframe.contentWindow?.document
          if (doc) {
            doc.open()
            doc.write(displayContent)
            doc.close()
          }
        }
      }, [displayContent, showCode])

      return (
        <div className="h-full flex flex-col bg-white">
          <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium">{file.filename}</span>
              {isViewingHistory && (
                <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded">
                  Historical View
                </span>
              )}
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
                value={displayContent}
                onChange={(e) => !isViewingHistory && handleFileContentChange(file.filename, e.target.value)}
                readOnly={isViewingHistory}
                placeholder={isViewingHistory ? "Historical content (read-only)" : "Enter HTML content..."}
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
                value={displayContent}
                onChange={(e) => !isViewingHistory && handleFileContentChange(file.filename, e.target.value)}
                placeholder={isViewingHistory ? "Historical content (read-only)" : "Enter your markdown content..."}
                readOnly={isViewingHistory}
              />
            </div>
            <div className="w-1/2 p-4 overflow-auto bg-white">
              <MarkdownRenderer>{displayContent}</MarkdownRenderer>
            </div>
          </>
        ) : (
          <textarea
            className="w-full h-full p-4 border-none resize-none focus:outline-none text-sm font-mono leading-relaxed"
            value={displayContent}
            onChange={(e) => !isViewingHistory && handleFileContentChange(file.filename, e.target.value)}
            disabled={isViewingHistory}
            placeholder="Edit markdown content..."
          />
        )}
      </div>
    )
  }, [handleFileContentChange, showMarkdownPreview, isViewingHistory]);

  // 🆕 历史文件内容恢复逻辑
  useEffect(() => {
    if (isViewingHistory && historicalFilesContent && currentFile) {
      // 当切换到历史模式时，如果有历史文件内容，恢复文件状态
      const historicalContent = historicalFilesContent.get(currentFile);
      if (historicalContent !== undefined) {
        // 更新文件系统中的文件内容
        const file = fileSystem.openFile(currentFile, historicalContent);
        fileSystem.setActiveTab(currentFile);
        console.log(`恢复历史文件内容: ${currentFile}, 长度: ${historicalContent.length}`);
      }
    } else if (!isViewingHistory && currentFile && fileContent) {
      // 返回实时模式时，使用实时内容
      const file = fileSystem.openFile(currentFile, fileContent);
      fileSystem.setActiveTab(currentFile);
      console.log(`恢复实时文件内容: ${currentFile}, 长度: ${fileContent.length}`);
    }
  }, [isViewingHistory, historicalFilesContent, currentFile, fileContent, currentHistoryIndexValue]);

  // 渲染文件内容的核心逻辑
  const renderFileContent = () => {
    let contentToRender = '';
    
    // 🆕 优化的内容获取逻辑
    if (isViewingHistory && historicalFilesContent && activeFile?.filename) {
      // 历史模式：优先从历史内容映射获取
      const historicalContent = historicalFilesContent.get(activeFile.filename);
      if (historicalContent !== undefined) {
        contentToRender = historicalContent;
        console.log(`显示历史文件内容: ${activeFile.filename}, 长度: ${historicalContent.length}`);
      } else {
        contentToRender = activeFile.content;
        console.log(`历史模式但找不到历史内容，使用当前内容: ${activeFile.filename}`);
      }
    } else if (activeFile) {
      // 实时模式：使用当前文件内容
      contentToRender = activeFile.content;
      console.log(`显示实时文件内容: ${activeFile.filename}, 长度: ${contentToRender.length}`);
    }

    if (!activeFile) {
      return (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a file to view its contents</p>
          </div>
        </div>
      )
    }

    // 根据文件类型渲染内容
    switch (activeFile.fileType) {
      case 'image':
        if (contentToRender.startsWith('http')) {
          return (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="max-w-full max-h-full overflow-auto">
                <img 
                  src={contentToRender} 
                  alt={activeFile.filename}
                  className="max-w-full h-auto border border-slate-300 rounded-lg shadow-sm"
                  onError={(e) => {
                    console.error('Image load error:', contentToRender);
                    e.currentTarget.style.display = 'none';
                    const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                    if (nextElement) {
                      nextElement.style.display = 'block';
                    }
                  }}
                />
                <div style={{ display: 'none' }} className="text-center text-slate-500 mt-4">
                  <p>Failed to load image: {contentToRender}</p>
                </div>
              </div>
            </div>
          )
        } else {
          return (
            <div className="flex-1 p-4 overflow-auto custom-scrollbar">
              <pre className="text-sm text-slate-600 whitespace-pre-wrap font-mono bg-slate-100 p-4 rounded">
                {contentToRender}
              </pre>
            </div>
          )
        }

      case 'pdf':
        if (contentToRender.startsWith('http')) {
          return (
            <div className="flex-1 flex flex-col">
              <div className="flex-1">
                <iframe
                  src={`${contentToRender}#toolbar=1&navpanes=1&scrollbar=1`}
                  className="w-full h-full border-0"
                  title={activeFile.filename}
                />
              </div>
            </div>
          )
        } else {
          return (
            <div className="flex-1 p-4 overflow-auto custom-scrollbar">
              <pre className="text-sm text-slate-600 whitespace-pre-wrap font-mono bg-slate-100 p-4 rounded">
                {contentToRender}
              </pre>
            </div>
          )
        }

      case 'html':
        return (
          <div className="flex-1 flex flex-col">
            <div className="border-b border-slate-300 p-2 bg-slate-100 flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHtmlPreview(!showHtmlPreview)}
                className="border-slate-300 hover:bg-slate-200"
              >
                {showHtmlPreview ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                {showHtmlPreview ? 'Preview' : 'Code'}
              </Button>
            </div>
            {showHtmlPreview ? (
              <div className="flex-1 overflow-auto">
                <div dangerouslySetInnerHTML={{ __html: contentToRender }} />
              </div>
            ) : (
              <div className="flex-1 p-4 overflow-auto custom-scrollbar">
                <pre className="text-sm text-slate-600 whitespace-pre-wrap font-mono bg-slate-100 p-4 rounded">
                  {contentToRender}
                </pre>
              </div>
            )}
          </div>
        )

      case 'markdown':
        return (
          <div className="flex-1 flex flex-col">
            <div className="border-b border-slate-300 p-2 bg-slate-100 flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
                className="border-slate-300 hover:bg-slate-200"
              >
                {showMarkdownPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showMarkdownPreview ? 'Code' : 'Preview'}
              </Button>
            </div>
            {showMarkdownPreview ? (
              <div className="flex-1 p-4 overflow-auto custom-scrollbar">
                <MarkdownRenderer>{contentToRender}</MarkdownRenderer>
              </div>
            ) : (
              <div className="flex-1 p-4 overflow-auto custom-scrollbar">
                <textarea
                  className="w-full h-full resize-none border-0 focus:outline-none text-sm font-mono leading-relaxed"
                  value={contentToRender}
                  onChange={(e) => !isViewingHistory && activeFile && handleFileContentChange(activeFile.filename, e.target.value)}
                  disabled={isViewingHistory}
                  placeholder="Edit markdown content..."
                />
              </div>
            )}
          </div>
        )

      default:
        return (
          <div className="flex-1 p-4 overflow-auto custom-scrollbar">
            <textarea
              className="w-full h-full resize-none border-0 focus:outline-none text-sm font-mono leading-relaxed"
              value={contentToRender}
              onChange={(e) => !isViewingHistory && activeFile && handleFileContentChange(activeFile.filename, e.target.value)}
              disabled={isViewingHistory}
              placeholder="Edit file content..."
            />
          </div>
        )
    }
  }

  // 如果只显示文件树
  if (showOnlyFileTree) {
    return (
      <div className="h-full flex flex-col bg-transparent relative">
        <div className="border-b border-white/20 px-4 py-3 bg-white/30 backdrop-blur-sm">
          <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            File Explorer
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
          {renderFileTree(fileSystem.getVirtualFileStructure())}
        </div>

        {/* 右键菜单 */}
        {showFileContextMenu.show && (
          <div
            className="fixed bg-white/90 backdrop-blur-xl border border-white/30 rounded-xl shadow-xl py-2 z-50 min-w-[160px]"
            style={{ left: showFileContextMenu.x, top: showFileContextMenu.y }}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-white/60 transition-colors duration-200 flex items-center gap-2"
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
              className="w-full px-4 py-2 text-left text-sm hover:bg-white/60 transition-colors duration-200 flex items-center gap-2"
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
          </div>
        )}
      </div>
    )
  }

  // 如果只显示工作空间（文件编辑器和终端）
  if (showOnlyWorkspace) {
    return (
      <div className="h-full flex flex-col bg-transparent">
        {/* 文件标签栏 */}
        <div className="flex items-center border-b border-white/20 bg-white/30 backdrop-blur-sm min-h-[40px] flex-shrink-0">
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
                  className={`flex items-center gap-2 px-3 h-10 text-sm cursor-pointer min-w-[120px] max-w-[200px] border-r border-white/20 flex-shrink-0 transition-all duration-200 ${
                    activeFile?.filename === tab.filename && selectedView === 'editing'
                      ? 'bg-white/60 text-slate-900 shadow-sm' 
                      : 'text-slate-600 hover:bg-white/40 hover:text-slate-800'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate flex-1">{tab.filename}</span>
                  {tab.isDirty && <span className="w-2 h-2 bg-orange-400 rounded-full flex-shrink-0" />}
                  <button
                    onClick={(e) => handleCloseTab(tab.filename, e)}
                    className="p-0.5 hover:bg-white/50 rounded flex-shrink-0 transition-colors duration-200"
                    aria-label={`Close tab ${tab.filename}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 视图选择按钮 */}
          <div className="flex border-l border-white/20 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 px-3 rounded-none text-xs flex items-center justify-center gap-1 transition-all duration-200 ${
                selectedView === 'terminal' ? 'bg-white/60 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/40 hover:text-slate-800'
              }`}
              onClick={() => setSelectedView('terminal')}
            >
              <Terminal className="h-3 w-3" />
              <span>Terminal</span>
              {terminalOutput.length > 0 && (
                <span className="text-xs bg-blue-100/80 text-blue-700 px-1 py-0.5 rounded-full">
                  {Math.floor(terminalOutput.length / 2)}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 px-3 rounded-none text-xs flex items-center justify-center gap-1 border-l border-white/20 transition-all duration-200 ${
                selectedView === 'info' ? 'bg-white/60 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/40 hover:text-slate-800'
              }`}
              onClick={() => setSelectedView('info')}
            >
              <Info className="h-3 w-3" />
              <span>Info</span>
            </Button>
          </div>

          {/* 增强的状态指示器 */}
          <div className="flex items-center border-l border-white/20 flex-shrink-0 px-3">
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
          <div className="flex items-center border-b border-white/20 bg-white/20 backdrop-blur-sm h-8 flex-shrink-0 px-2">
            <div className="flex items-center gap-1">
              {/* Markdown预览切换按钮 */}
              {activeFile.fileType === 'markdown' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 border-white/30 bg-white/40 hover:bg-white/60 rounded text-xs px-2 py-1 flex items-center gap-1 transition-all duration-200"
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
                {isViewingHistory && (
                  <>
                    <span>•</span>
                    <span className="text-amber-600">历史模式</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 内容区域 */}
        <div className="flex-1 overflow-hidden">
          {selectedView === 'editing' && activeFile && (
            <FileContentRenderer 
              file={activeFile} 
              overrideContent={isViewingHistory ? getFileContent(activeFile.filename) : undefined}
            />
          )}

          {selectedView === 'editing' && !activeFile && (
            <div className="h-full flex items-center justify-center bg-white/20 backdrop-blur-sm">
              <div className="text-center text-slate-500">
                <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No file selected</p>
                <p className="text-sm mt-1">Select a file from the tree to start editing</p>
              </div>
            </div>
          )}

          {selectedView === 'terminal' && (
            <div className="h-full flex flex-col bg-slate-900/95 backdrop-blur-sm">
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
              <div className="flex items-center p-2 border-t border-slate-700/50 backdrop-blur-sm flex-shrink-0">
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
            <div className="p-4 overflow-y-auto custom-scrollbar bg-white/20 backdrop-blur-sm">
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Task Status</h3>
                  <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                    <div className={`inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full ${
                      taskStatus === 'completed' ? 'bg-green-100/80 text-green-800' :
                      taskStatus === 'failed' ? 'bg-red-100/80 text-red-800' :
                      taskStatus === 'started' ? 'bg-blue-100/80 text-blue-800' :
                      'bg-slate-200/80 text-slate-800'
                    }`}>
                      {taskStatus === 'completed' ? '✓ Completed' :
                       taskStatus === 'failed' ? '✗ Failed' :
                       taskStatus === 'started' ? '● Running' : 
                       taskStatus === 'history' ? '📜 History View' : '○ Waiting'}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Project Overview</h3>
                  <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 space-y-2 text-sm border border-white/30">
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
                    {isViewingHistory && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">History mode:</span>
                        <span className="text-amber-600">Active</span>
                      </div>
                    )}
                  </div>
                </div>

                {activeFile && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">
                      Current File {activeFile.isDirty ? <span className="text-orange-500 font-normal">(Unsaved)</span> : ''}
                    </h3>
                    <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 space-y-2 text-sm border border-white/30">
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
          <div className="border-t border-white/20 p-4 bg-white/30 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="border-white/30 bg-white/40 hover:bg-white/60 transition-all duration-200"
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
                className="border-white/30 bg-white/40 hover:bg-white/60 transition-all duration-200"
                onClick={() => onHistoryChange?.(Math.min(historyLength - 1, (currentHistoryIndexValue ?? -1) + 1))}
                disabled={!isViewingHistory || currentHistoryIndexValue === historyLength - 1}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
              {isViewingHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 border-blue-500/50 text-blue-600 hover:bg-blue-50/80 bg-white/60 backdrop-blur-sm transition-all duration-200"
                  onClick={() => onHistoryChange?.(-1)}
                >
                  Go Live
                </Button>
              )}
            </div>
            {isViewingHistory && (
              <div className="text-xs text-slate-600 mt-2 text-center">
                Viewing history step {(currentHistoryIndexValue ?? 0) + 1} of {historyLength}
              </div>
            )}
          </div>
        )}

        {/* 🆕 新增：Universal 历史记录控制区域 - 在所有视图中都显示 */}
        {historyLength > 0 && selectedView !== 'editing' && (
          <div className="border-t border-white/20 p-4 bg-white/30 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="border-white/30 bg-white/40 hover:bg-white/60 transition-all duration-200"
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
                className="border-white/30 bg-white/40 hover:bg-white/60 transition-all duration-200"
                onClick={() => onHistoryChange?.(Math.min(historyLength - 1, (currentHistoryIndexValue ?? -1) + 1))}
                disabled={!isViewingHistory || currentHistoryIndexValue === historyLength - 1}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
              {isViewingHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 border-blue-500/50 text-blue-600 hover:bg-blue-50/80 bg-white/60 backdrop-blur-sm transition-all duration-200"
                  onClick={() => onHistoryChange?.(-1)}
                >
                  Go Live
                </Button>
              )}
            </div>
            {isViewingHistory && (
              <div className="text-xs text-slate-600 mt-2 text-center">
                Viewing history step {(currentHistoryIndexValue ?? 0) + 1} of {historyLength}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // 默认的完整布局（左侧文件树 + 右侧工作空间）
  return (
    <div className="h-full flex w-full gap-6 p-6">
      {/* 左侧文件树 */}
      <div className="w-64 bg-white/60 backdrop-blur-xl border border-white/30 rounded-2xl shadow-xl flex-shrink-0 overflow-hidden">
        <div className="border-b border-white/20 px-4 py-3 bg-white/30 backdrop-blur-sm">
          <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            File Explorer
          </h3>
        </div>
        <div className="overflow-y-auto h-[calc(100%-3rem)] py-2 custom-scrollbar">
          {renderFileTree(fileSystem.getVirtualFileStructure())}
        </div>
      </div>

      {/* 右侧工作空间 */}
      <div className="flex-1 overflow-hidden">
        <div className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-xl overflow-hidden h-full">
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
              taskStartTime,
              historicalFilesContent
            }}
            ref={ref}
          />
        </div>
      </div>
    </div>
  )
})

ComputerView.displayName = 'ComputerView'