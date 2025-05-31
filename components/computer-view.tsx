"use client"

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { 
  Terminal, FileText, FolderTree, ChevronRight, ChevronDown, File, Folder, Info, X, Plus, 
  ArrowLeft, ArrowRight, Save, RotateCcw, Eye, EyeOff, ChevronLeft, Download, Play, 
  Pause, CheckCircle2, XCircle, Edit, AlertCircle, Search, Copy, Undo, 
  Redo, Image as ImageIcon, FileCode, FileJson, Hash, Code, FileType 
} from "lucide-react"
import { FileStructureNode, apiService } from "@/lib/api"
import { EnhancedFileSystemManager } from "@/lib/file-system"
import { debounce, throttle, detectFileType, formatFileSize, getLanguageFromFileType } from "@/lib/file-utils"

// Add CSS for scrollbar
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
  
  .custom-scrollbar-dark {
    scrollbar-width: thin;
    scrollbar-color: #475569 #1e293b;
  }
  
  .custom-scrollbar-dark::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  .custom-scrollbar-dark::-webkit-scrollbar-track {
    background: #1e293b;
    border-radius: 4px;
  }
  
  .custom-scrollbar-dark::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 4px;
  }
  
  .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }
`

// Inject styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style')
  styleElement.textContent = scrollbarStyles
  if (!document.head.querySelector('style[data-component="enhanced-computer-view"]')) {
    styleElement.setAttribute('data-component', 'enhanced-computer-view')
    document.head.appendChild(styleElement)
  }
}

// Dynamic imports
let Prism: any;
if (typeof window !== 'undefined') {
  try {
    Prism = require('prismjs');
    require('prismjs/components/prism-python');
    require('prismjs/components/prism-javascript');
    require('prismjs/components/prism-typescript');
    require('prismjs/components/prism-css');
    require('prismjs/components/prism-json');
    require('prismjs/components/prism-markdown');
    require('prismjs/components/prism-bash');
    require('prismjs/components/prism-yaml');
    require('prismjs/themes/prism-tomorrow.css');
  } catch (e) {
    console.warn('Prism.js not available');
  }
}

let ReactMarkdown: any;
try {
  ReactMarkdown = require('react-markdown').default;
} catch (e) {
  console.warn('react-markdown not available');
  ReactMarkdown = null;
}

// Simple Markdown renderer fallback
const SimpleFallbackMarkdownRenderer = ({ children }: { children: string }) => {
  const convertSimpleMarkdown = (text: string) => {
    // Escape HTML first
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold and italic
    html = html.replace(/\*\*\*(.*)\*\*\*/gim, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*(.*)\*/gim, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Code blocks
    html = html.replace(/```([^`]*)```/gim, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]*)`/gim, '<code>$1</code>');
    
    // Lists
    html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
    // Convert consecutive <li> tags into <ul>
    html = html.replace(/(<li>.*?<\/li>(\s*<li>.*?<\/li>)*)/g, '<ul>$1</ul>');
    
    // Line breaks
    html = html.replace(/\n/gim, '<br>');
    
    return html;
  };

  try {
    const htmlContent = convertSimpleMarkdown(children || '');
  return (
      <div 
        className="prose prose-slate max-w-none"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    );
  } catch (error) {
    return (
      <div className="text-slate-800 leading-relaxed max-w-none">
        <pre className="whitespace-pre-wrap text-sm">{children}</pre>
      </div>
    );
  }
};

// Markdown component selector
const MarkdownRenderer = ({ children }: { children: string }) => {
  if (ReactMarkdown) {
  return (
      <div className="prose prose-slate max-w-none">
        <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
  }
  return <SimpleFallbackMarkdownRenderer>{children}</SimpleFallbackMarkdownRenderer>;
};

// Interfaces
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
  isViewingHistory?: boolean
  historyLength?: number
  currentHistoryIndexValue?: number
  onHistoryChange?: (newIndex: number) => void
  showOnlyFileTree?: boolean
  showOnlyWorkspace?: boolean
  maxTabs?: number
  onFileSelect?: (filename: string) => void
  onFileEditStateChange?: (hasChanges: boolean, activeFilename: string | null) => void
  taskId?: string
  activities?: any[]
  taskStartTime?: number
  sharedFileSystem?: EnhancedFileSystemManager | null
}

// Get file icon based on type
const getFileIcon = (fileName: string, fileType: string) => {
  const iconClass = "h-4 w-4";
  
  if (fileType === 'python') return <Hash className={`${iconClass} text-blue-600`} />;
  if (fileType === 'javascript' || fileType === 'typescript') return <FileCode className={`${iconClass} text-yellow-600`} />;
  if (fileType === 'html') return <Code className={`${iconClass} text-orange-600`} />;
  if (fileType === 'css' || fileType === 'scss') return <FileType className={`${iconClass} text-pink-600`} />;
  if (fileType === 'json') return <FileJson className={`${iconClass} text-green-600`} />;
  if (fileType === 'markdown') return <FileText className={`${iconClass} text-slate-600`} />;
  if (fileType === 'image') return <ImageIcon className={`${iconClass} text-purple-600`} />;
  if (fileType === 'pdf') return <FileText className={`${iconClass} text-red-600`} />;
  
  return <File className={`${iconClass} text-slate-500`} />;
};

// Enhanced Computer View Component
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
  sharedFileSystem
}, ref) => {
  // 使用共享的文件系统实例或创建新的实例
  const fileSystemRef = useRef<EnhancedFileSystemManager | null>(null)
  if (!fileSystemRef.current && taskId) {
    if (sharedFileSystem) {
      fileSystemRef.current = sharedFileSystem
    } else {
      fileSystemRef.current = new EnhancedFileSystemManager(taskId)
    }
  }
  
  // Only use file system if we have taskId
  if (!taskId || !fileSystemRef.current) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-500">
          <AlertCircle className="h-12 w-12 mx-auto mb-2 text-slate-300" />
          <p>Task ID is required to initialize file system</p>
        </div>
      </div>
    )
  }
  
  const fileSystem = fileSystemRef.current

  // State
  const [selectedView, setSelectedView] = useState<string>('editing')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']))
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [, forceUpdate] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [clipboard, setClipboard] = useState<{ type: 'cut' | 'copy', path: string } | null>(null)
  
  // Refs
  const terminalInputRef = useRef<HTMLInputElement>(null)
  const terminalDisplayRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const htmlPreviewRef = useRef<HTMLIFrameElement>(null)
  const codeEditorRef = useRef<HTMLTextAreaElement>(null)
  
  const [terminalInputValue, setTerminalInputValue] = useState('')
  const [displayedTerminalOutput, setDisplayedTerminalOutput] = useState<string[]>([])
  
  // Context menus and dialogs
  const [showFileContextMenu, setShowFileContextMenu] = useState<{
    show: boolean, x: number, y: number, path: string, isFolder: boolean
  }>({ show: false, x: 0, y: 0, path: '', isFolder: false })
  
  const [newItemDialog, setNewItemDialog] = useState<{
    show: boolean, type: 'file' | 'folder', parentPath: string, inputValue: string
  }>({ show: false, type: 'file', parentPath: '/', inputValue: '' })
  
  const [renameDialog, setRenameDialog] = useState<{
    show: boolean, path: string, newName: string
  }>({ show: false, path: '', newName: '' })

  // Subscribe to file system events
  useEffect(() => {
    const handleFileSystemChange = debounce(() => {
      forceUpdate({})
      
      // Notify parent about changes
      if (onFileEditStateChange) {
        const activeTab = fileSystem.getActiveTab()
        if (activeTab) {
          const node = fileSystem.getNode(activeTab)
          onFileEditStateChange(node?.isDirty || false, activeTab)
        } else {
          onFileEditStateChange(false, null)
        }
      }
    }, 100)

    fileSystem.on('fileCreated', handleFileSystemChange)
    fileSystem.on('fileUpdated', handleFileSystemChange)
    fileSystem.on('fileSaved', handleFileSystemChange)
    fileSystem.on('fileOpened', handleFileSystemChange)
    fileSystem.on('fileClosed', handleFileSystemChange)
    fileSystem.on('tabActivated', handleFileSystemChange)
    fileSystem.on('nodeDeleted', handleFileSystemChange)
    fileSystem.on('nodeRenamed', handleFileSystemChange)
    fileSystem.on('structureMerged', handleFileSystemChange)
    fileSystem.on('contentMapUpdated', handleFileSystemChange)

    return () => {
      fileSystem.removeAllListeners()
    }
  }, [fileSystem, onFileEditStateChange])

  // Merge external file structure
  useEffect(() => {
    if (fileStructure && !isViewingHistory) {
      fileSystem.mergeExternalStructure(fileStructure)
    }
  }, [fileStructure, isViewingHistory, fileSystem])

  // Handle incoming file content
  useEffect(() => {
    if (currentFile && fileContent !== undefined && !isViewingHistory) {
      const node = fileSystem.getNode(currentFile)
      
      // Only update existing files from backend, don't create new ones
      if (node && !node.isNew && !node.isLocked) {
        // Update content if it's different
        if (node.content !== fileContent) {
          fileSystem.updateFileContent(currentFile, fileContent)
          fileSystem.saveFile(currentFile) // Mark as saved since it's from backend
        }
      }
    }
  }, [currentFile, fileContent, isViewingHistory, fileSystem])

  // Terminal output
  useEffect(() => {
    setDisplayedTerminalOutput(terminalOutput || [])
  }, [terminalOutput])

  // Auto-scroll terminal
  useEffect(() => {
    if (selectedView === 'terminal' && terminalDisplayRef.current) {
      terminalDisplayRef.current.scrollTop = terminalDisplayRef.current.scrollHeight
    }
  }, [displayedTerminalOutput, selectedView])

  // HTML Preview update with debounce
  const updateHtmlPreview = useCallback(
    debounce((content: string) => {
      if (htmlPreviewRef.current) {
        const iframe = htmlPreviewRef.current
        const doc = iframe.contentDocument || iframe.contentWindow?.document
        if (doc) {
          doc.open()
          doc.write(content)
          doc.close()
        }
      }
    }, 300),
    []
  )

  // File operations
  const handleFileClick = useCallback((path: string) => {
    if (showOnlyFileTree && onFileSelect) {
      onFileSelect(path)
      return
    }

    // 确保文件在文件系统中打开
    const node = fileSystem.openFile(path)
    setSelectedView('editing')
    
    // 强制更新组件状态
    forceUpdate({})
    
    if (onFileSelect) {
      onFileSelect(path)
    }
    
    // Auto-scroll to tab
    setTimeout(() => {
      const tabs = fileSystem.getOpenTabs()
      const tabIndex = tabs.findIndex(tab => tab.path === path)
      
      if (tabIndex !== -1 && tabsContainerRef.current) {
        const tabWidth = 180
        const scrollPosition = tabIndex * tabWidth
        
        tabsContainerRef.current.scrollTo({
          left: scrollPosition,
          behavior: 'smooth'
        })
      }
    }, 50)
  }, [showOnlyFileTree, onFileSelect, fileSystem])

  const handleTabClick = useCallback((path: string) => {
    fileSystem.activateTab(path)
      setSelectedView('editing')
    
    if (onFileSelect) {
      onFileSelect(path)
    }
  }, [onFileSelect, fileSystem])

  const handleCloseTab = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    const node = fileSystem.getNode(path)
    if (node?.isDirty) {
      const confirmed = window.confirm(`File "${node.name}" has unsaved changes. Close anyway?`)
      if (!confirmed) return
    }
    
    fileSystem.closeFile(path)
  }, [fileSystem])

  const handleFileContentChange = useCallback(
    throttle((path: string, newContent: string) => {
      fileSystem.updateFileContent(path, newContent)
      
      // Update HTML preview if needed
      const node = fileSystem.getNode(path)
      if (node && (node.name.endsWith('.html') || node.name.endsWith('.htm'))) {
        updateHtmlPreview(newContent)
      }
    }, 100),
    [fileSystem, updateHtmlPreview]
  )

  const handleSave = useCallback(async () => {
    const activeTab = fileSystem.getActiveTab()
    if (!activeTab || !taskId) return

    const node = fileSystem.getNode(activeTab)
    if (!node || !node.isDirty) return

    try {
      setSaveStatus('saving')
      
      // Try to save, if file doesn't exist, create it
      try {
        await apiService.saveFileContent(taskId, activeTab, node.content || '')
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          await apiService.createFile(taskId, activeTab, node.content || '')
      } else {
          throw error
        }
      }
      
      fileSystem.saveFile(activeTab)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error) {
      console.error('Save failed:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [taskId, fileSystem])

  const handleRevert = useCallback(() => {
    const activeTab = fileSystem.getActiveTab()
    if (activeTab) {
      fileSystem.revertFile(activeTab)
    }
  }, [fileSystem])

  const handleCreateNewItem = useCallback((name: string, type: 'file' | 'folder', parentPath: string) => {
    if (!name.trim()) return

    try {
      if (type === 'file') {
        const node = fileSystem.createFile(parentPath, name)
        handleFileClick(node.path)
    } else {
        fileSystem.createDirectory(parentPath, name)
      }
      
      // Expand parent folder
      setExpandedFolders(prev => new Set([...prev, parentPath]))
      
      // Sync to backend immediately for new items
      if (taskId) {
      if (type === 'file') {
          apiService.createFile(taskId, `${parentPath}/${name}`, '').catch(console.error)
      } else {
          apiService.createFile(taskId, `${parentPath}/${name}`, '', 'folder').catch(console.error)
        }
      }
    } catch (error: any) {
      alert(error.message)
    }
  }, [fileSystem, handleFileClick, taskId])

  const handleDeleteItem = useCallback((path: string) => {
    if (!path || path === '/') return

    const node = fileSystem.getNode(path)
    if (!node) return

    const confirmMessage = node.type === 'directory' 
      ? `Delete folder "${node.name}" and all its contents?`
      : `Delete file "${node.name}"?`

    if (confirm(confirmMessage)) {
      fileSystem.deleteNode(path)
      
      // Sync to backend
      if (taskId) {
        apiService.deleteFile(taskId, path).catch(console.error)
      }
    }
  }, [fileSystem, taskId])

  const handleRenameItem = useCallback((path: string, newName: string) => {
    if (!path || !newName.trim()) return

    try {
      fileSystem.renameNode(path, newName)
      
      // Sync to backend
      if (taskId) {
        apiService.renameFile(taskId, path, `${fileSystem.getNode(path)?.parent || '/'}/${newName}`).catch(console.error)
      }
    } catch (error: any) {
      alert(error.message)
    }
  }, [fileSystem, taskId])

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeTab = fileSystem.getActiveTab()
      
      if ((event.ctrlKey || event.metaKey)) {
        switch (event.key) {
          case 's':
            event.preventDefault()
            handleSave()
            break
          case 'w':
            event.preventDefault()
            if (activeTab) {
              fileSystem.closeFile(activeTab)
            }
            break
          case 'n':
            event.preventDefault()
            setNewItemDialog({ show: true, type: 'file', parentPath: '/', inputValue: '' })
            break
          case 'f':
            event.preventDefault()
            setShowSearch(!showSearch)
            break
          case 'z':
            event.preventDefault()
            if (activeTab && fileSystem.canUndo(activeTab)) {
              fileSystem.undo(activeTab)
            }
            break
          case 'y':
            event.preventDefault()
            if (activeTab && fileSystem.canRedo(activeTab)) {
              fileSystem.redo(activeTab)
            }
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, showSearch, fileSystem])

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    save: handleSave,
    revert: handleRevert
  }), [handleSave, handleRevert])

  // Right-click menu handler
  const handleFileRightClick = useCallback((e: React.MouseEvent, path: string, isFolder: boolean) => {
    e.preventDefault()
    setShowFileContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      path,
      isFolder
    })
  }, [])

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFileContextMenu(prev => ({ ...prev, show: false }))
    }
    
    if (showFileContextMenu.show) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showFileContextMenu.show])

  // Render file tree
  const renderFileTree = useCallback((node: any, level: number = 0) => {
    if (!node) return null

    const isExpanded = expandedFolders.has(node.path)
    const activeTab = fileSystem.getActiveTab()
    const openTabs = fileSystem.getOpenTabs()
    const isOpen = openTabs.some(tab => tab.path === node.path)
    const isActive = activeTab === node.path
    const fileType = node.type === 'file' ? detectFileType(node.name) : 'folder'

    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <div
            className="flex items-center gap-1 py-1 px-2 hover:bg-slate-100 cursor-pointer select-none text-sm"
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => toggleFolder(node.path)}
            onContextMenu={(e) => handleFileRightClick(e, node.path, true)}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Folder className="h-4 w-4 text-blue-600" />
            <span>{node.name}</span>
          </div>
          {isExpanded && node.children && (
            <div>
              {node.children.map((child: any) => renderFileTree(child, level + 1))}
            </div>
          )}
        </div>
      )
    } else {
      return (
        <div
          key={node.path}
          className={`flex items-center gap-1 py-1 px-2 hover:bg-slate-100 cursor-pointer text-sm transition-colors ${
            isActive ? 'bg-blue-100 text-blue-800 border-r-2 border-blue-500' : 
            isOpen ? 'bg-blue-50 text-blue-700' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 24}px` }}
          onClick={() => handleFileClick(node.path)}
          onContextMenu={(e) => handleFileRightClick(e, node.path, false)}
        >
          {getFileIcon(node.name, fileType)}
          <span className={`flex-1 ${isActive ? 'font-medium' : ''}`}>{node.name}</span>
          {node.isDirty && (
            <div className="w-2 h-2 rounded-full bg-orange-400"></div>
          )}
          {isOpen && !node.isDirty && (
            <div className={`w-1.5 h-1.5 rounded-full ${
              isActive ? 'bg-blue-600' : 'bg-blue-500'
            }`}></div>
          )}
        </div>
      )
    }
  }, [expandedFolders, fileSystem, toggleFolder, handleFileClick, handleFileRightClick])

  // File content renderer with syntax highlighting
  const FileContentRenderer = useCallback(({ node }: { node: any }) => {
    if (!node) return null

    const fileType = detectFileType(node.name)
    const content = node.content || ''

    // 检查内容是否为网址
    const isUrl = (str: string) => {
      try {
        new URL(str)
        return true
      } catch {
        return false
      }
    }

    // PDF viewer
    if (fileType === 'pdf') {
      return (
        <div className="h-full flex flex-col bg-white">
          <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium">{node.name}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (content) window.open(content, '_blank')
              }}
              disabled={!content}
            >
              <Download className="h-4 w-4 mr-1" />
              Open External
            </Button>
          </div>
          <div className="flex-1 relative">
            {content ? (
              isUrl(content) ? (
                <iframe
                  src={content}
                  className="w-full h-full border-0"
                  title={`PDF viewer for ${node.name}`}
                />
              ) : (
                <div className="p-4 text-center text-slate-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                  <p>PDF content (not a URL)</p>
                  <pre className="text-xs mt-2 max-w-md mx-auto truncate">{content}</pre>
                </div>
              )
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

    // Image viewer (包括SVG)
    if (fileType === 'image') {
      return (
        <div className="h-full flex flex-col bg-white">
          <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium">{node.name}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (content && isUrl(content)) window.open(content, '_blank')
              }}
              disabled={!content || !isUrl(content)}
            >
              <Download className="h-4 w-4 mr-1" />
              View Full Size
            </Button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-slate-50">
            {content ? (
              isUrl(content) ? (
                <img
                  src={content}
                  alt={node.name}
                  className="max-w-full max-h-full object-contain shadow-lg rounded-lg"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    target.nextElementSibling?.classList.remove('hidden')
                  }}
                />
              ) : node.name.toLowerCase().endsWith('.svg') ? (
                // SVG文件直接渲染内容
                <div 
                  className="max-w-full max-h-full"
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              ) : (
                <div className="text-center text-slate-500">
                  <ImageIcon className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                  <p>Image content (not a URL)</p>
                  <pre className="text-xs mt-2 max-w-md mx-auto truncate">{content}</pre>
                </div>
              )
            ) : (
              <div className="text-center text-slate-500">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No image content available</p>
              </div>
            )}
            <div className="hidden text-center text-slate-500">
              <ImageIcon className="h-12 w-12 mx-auto mb-2 text-slate-300" />
              <p>Failed to load image</p>
            </div>
          </div>
        </div>
      )
    }

    // HTML preview with live update
    if (fileType === 'html') {
      const [showCode, setShowCode] = useState(false)

      useEffect(() => {
        if (!showCode && content) {
          updateHtmlPreview(content)
        }
      }, [content, showCode])

      return (
        <div className="h-full flex flex-col bg-white">
          <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
            <div className="flex items-center gap-2">
              {getFileIcon(node.name, fileType)}
              <span className="text-sm font-medium">{node.name}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCode(!showCode)}
            >
              {showCode ? <Eye className="h-4 w-4 mr-1" /> : <Code className="h-4 w-4 mr-1" />}
              {showCode ? 'Preview' : 'Code'}
            </Button>
          </div>
          {showCode ? (
            <div className="flex-1 overflow-hidden">
              <textarea
                ref={codeEditorRef}
                className="w-full h-full p-4 border-none resize-none focus:outline-none font-mono text-sm bg-slate-900 text-slate-100"
                value={content}
                onChange={(e) => handleFileContentChange(node.path, e.target.value)}
                readOnly={isViewingHistory}
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="flex-1 relative">
              <iframe
                ref={htmlPreviewRef}
                className="w-full h-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin"
                title={`HTML preview for ${node.name}`}
              />
            </div>
          )}
        </div>
      )
    }

    // Markdown editor with preview
    if (fileType === 'markdown') {
      return (
        <div className="h-full flex bg-white">
          {showMarkdownPreview ? (
            <>
              <div className="w-1/2 border-r border-slate-200 overflow-hidden">
                <textarea
                  className="w-full h-full p-4 border-none resize-none focus:outline-none font-mono text-sm"
                  value={content}
                  onChange={(e) => handleFileContentChange(node.path, e.target.value)}
                  placeholder="Enter your markdown content..."
                  readOnly={isViewingHistory}
                  spellCheck={false}
                />
              </div>
              <div className="w-1/2 p-4 overflow-auto bg-white">
                <MarkdownRenderer>{content}</MarkdownRenderer>
              </div>
            </>
          ) : (
            <textarea
              className="w-full h-full p-4 border-none resize-none focus:outline-none font-mono text-sm"
              value={content}
              onChange={(e) => handleFileContentChange(node.path, e.target.value)}
              placeholder="Enter your markdown content..."
              readOnly={isViewingHistory}
              spellCheck={false}
            />
          )}
        </div>
      )
    }

    // Simple text editor for all other file types (including code files)
    return (
      <textarea
        className="w-full h-full p-4 border-none resize-none focus:outline-none font-mono text-sm"
        value={content}
        onChange={(e) => handleFileContentChange(node.path, e.target.value)}
        placeholder="Enter your content..."
        readOnly={isViewingHistory}
        spellCheck={false}
      />
    )
  }, [handleFileContentChange, showMarkdownPreview, isViewingHistory, updateHtmlPreview])

  // Get current state
  const fileTree = fileSystem.getFileTree()
  const openTabs = fileSystem.getOpenTabs()
  const activeTab = fileSystem.getActiveTab()
  const activeNode = activeTab ? fileSystem.getNode(activeTab) : null

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery) return []
    return fileSystem.searchFiles(searchQuery)
  }, [searchQuery, fileSystem])

  // Terminal command handling
  const handleTerminalCommand = useCallback(async (command: string) => {
    if (!taskId) return
    
    // Special handling for clear command
    if (command.trim() === 'clear') {
      setDisplayedTerminalOutput([])
      return
    }
    
    // Add command to display
    setDisplayedTerminalOutput(prev => [...prev, `$ ${command}`])
    
    try {
      // Send command to backend
      const result = await apiService.executeCommand(taskId, command)
      
      if (result.success && result.output) {
        // Add output to display
        setDisplayedTerminalOutput(prev => [...prev, result.output || ''])
      } else {
        setDisplayedTerminalOutput(prev => [...prev, 'Command executed successfully (no output)'])
      }
    } catch (error) {
      console.error('Command execution failed:', error)
      setDisplayedTerminalOutput(prev => [...prev, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`])
    }
  }, [taskId])

  // File tree only view
  if (showOnlyFileTree) {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        <div className="border-b border-slate-300 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            File Explorer
          </h3>
        </div>
        
        {showSearch && (
          <div className="border-b border-slate-300 p-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        )}
        
        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
          {searchQuery ? (
            <div className="px-2">
              {searchResults.map(node => (
                <div
                  key={node.path}
                  className="flex items-center gap-2 py-1 px-2 hover:bg-slate-100 cursor-pointer text-sm"
                  onClick={() => handleFileClick(node.path)}
                >
                  {getFileIcon(node.name, detectFileType(node.name))}
                  <span className="text-slate-600 text-xs">{node.path}</span>
                </div>
              ))}
              {searchResults.length === 0 && (
                <div className="text-center text-slate-500 text-sm py-4">
                  No files found
            </div>
              )}
            </div>
          ) : (
            renderFileTree(fileTree)
          )}
        </div>

        {/* Context Menu */}
        {showFileContextMenu.show && (
          <div
            className="fixed bg-white border border-slate-300 rounded-lg shadow-lg py-2 z-50 min-w-[160px]"
            style={{ left: showFileContextMenu.x, top: showFileContextMenu.y }}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
              onClick={() => {
                const parentPath = showFileContextMenu.isFolder 
                  ? showFileContextMenu.path 
                  : (fileSystem.getNode(showFileContextMenu.path)?.parent || '/')
                setNewItemDialog({ 
                  show: true, 
                  type: 'file', 
                  parentPath,
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
                const parentPath = showFileContextMenu.isFolder 
                  ? showFileContextMenu.path 
                  : (fileSystem.getNode(showFileContextMenu.path)?.parent || '/')
                setNewItemDialog({ 
                  show: true, 
                  type: 'folder', 
                  parentPath,
                  inputValue: ''
                })
                setShowFileContextMenu(prev => ({ ...prev, show: false }))
              }}
            >
              <FolderTree className="h-4 w-4" />
              New Folder
            </button>
            
                <div className="border-t border-slate-200 my-1"></div>
            
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
                  onClick={() => {
                setClipboard({ type: 'copy', path: showFileContextMenu.path })
                setShowFileContextMenu(prev => ({ ...prev, show: false }))
              }}
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
              onClick={() => {
                setClipboard({ type: 'cut', path: showFileContextMenu.path })
                setShowFileContextMenu(prev => ({ ...prev, show: false }))
              }}
            >
              <X className="h-4 w-4" />
              Cut
            </button>
            
            {clipboard && showFileContextMenu.isFolder && (
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
                onClick={() => {
                  // TODO: Implement paste logic
                  setShowFileContextMenu(prev => ({ ...prev, show: false }))
                }}
              >
                <Copy className="h-4 w-4" />
                Paste
              </button>
            )}
            
            <div className="border-t border-slate-200 my-1"></div>
            
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
              onClick={() => {
                const node = fileSystem.getNode(showFileContextMenu.path)
                setRenameDialog({ 
                  show: true, 
                  path: showFileContextMenu.path, 
                  newName: node?.name || ''
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
                handleDeleteItem(showFileContextMenu.path)
                setShowFileContextMenu(prev => ({ ...prev, show: false }))
                  }}
                >
                  <X className="h-4 w-4" />
                  Delete
                </button>
          </div>
        )}

        {/* Dialogs */}
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
                className="w-full border border-slate-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItemDialog.inputValue.trim()) {
                    handleCreateNewItem(newItemDialog.inputValue, newItemDialog.type, newItemDialog.parentPath)
                    setNewItemDialog({ show: false, type: 'file', parentPath: '/', inputValue: '' })
                  } else if (e.key === 'Escape') {
                    setNewItemDialog({ show: false, type: 'file', parentPath: '/', inputValue: '' })
                  }
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                  onClick={() => setNewItemDialog({ show: false, type: 'file', parentPath: '/', inputValue: '' })}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  onClick={() => {
                    if (newItemDialog.inputValue.trim()) {
                      handleCreateNewItem(newItemDialog.inputValue, newItemDialog.type, newItemDialog.parentPath)
                      setNewItemDialog({ show: false, type: 'file', parentPath: '/', inputValue: '' })
                    }
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {renameDialog.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96">
              <h3 className="text-lg font-semibold mb-4">Rename</h3>
              <input
                type="text"
                value={renameDialog.newName}
                onChange={(e) => setRenameDialog(prev => ({ ...prev, newName: e.target.value }))}
                className="w-full border border-slate-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameDialog.newName.trim()) {
                    handleRenameItem(renameDialog.path, renameDialog.newName)
                    setRenameDialog({ show: false, path: '', newName: '' })
                  } else if (e.key === 'Escape') {
                    setRenameDialog({ show: false, path: '', newName: '' })
                  }
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                  onClick={() => setRenameDialog({ show: false, path: '', newName: '' })}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  onClick={() => {
                    if (renameDialog.newName.trim()) {
                      handleRenameItem(renameDialog.path, renameDialog.newName)
                      setRenameDialog({ show: false, path: '', newName: '' })
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

  // Workspace only view
  if (showOnlyWorkspace) {
    return (
      <div className="h-full flex flex-col bg-white">
        {/* Tab bar */}
        <div className="flex items-center border-b border-slate-300 bg-slate-50 min-h-[40px] flex-shrink-0">
          <div className="flex-1 flex items-center overflow-hidden">
            <div
              ref={tabsContainerRef}
              className="flex overflow-x-auto flex-1 h-full scrollbar-thin"
              onWheel={(e) => {
                if (tabsContainerRef.current) {
                  e.preventDefault()
                  tabsContainerRef.current.scrollLeft += e.deltaY
                }
              }}
            >
              {openTabs.map((tab, index) => {
                const node = fileSystem?.getNode(tab.path)
                if (!node) return null
                const fileType = detectFileType(node.name)
                
                return (
                <div
                  key={tab.path}
                  role="button"
                  tabIndex={0}
                    onClick={() => handleTabClick(tab.path)}
                    className={`flex items-center gap-2 px-3 h-10 text-sm cursor-pointer min-w-[120px] max-w-[200px] border-r border-slate-300 flex-shrink-0 ${
                      activeTab === tab.path && selectedView === 'editing'
                        ? 'bg-white text-slate-900 border-b-2 border-blue-500' 
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {getFileIcon(node.name, fileType)}
                    <span className="truncate flex-1">{node.name}</span>
                    {tab.isDirty && <span className="w-2 h-2 bg-orange-400 rounded-full flex-shrink-0" />}
                  <button
                      onClick={(e) => handleCloseTab(tab.path, e)}
                    className="p-0.5 hover:bg-slate-300 rounded flex-shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                )
              })}
            </div>
          </div>

          {/* View buttons */}
          <div className="flex border-l border-slate-300 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 px-3 rounded-none text-xs ${
                selectedView === 'terminal' ? 'bg-slate-200' : ''
              }`}
              onClick={() => setSelectedView('terminal')}
            >
              <Terminal className="h-3 w-3" />
              <span className="ml-1">Terminal</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 px-3 rounded-none text-xs border-l border-slate-300 ${
                selectedView === 'info' ? 'bg-slate-200' : ''
              }`}
              onClick={() => setSelectedView('info')}
            >
              <Info className="h-3 w-3" />
              <span className="ml-1">Info</span>
            </Button>
          </div>

          {/* Save status */}
          <div className="flex items-center border-l border-slate-300 flex-shrink-0 px-3">
            {saveStatus !== 'idle' && (
              <div className={`flex items-center gap-2 text-xs ${
                saveStatus === 'saving' ? 'text-blue-600' :
                saveStatus === 'saved' ? 'text-green-600' :
                'text-red-600'
              }`}>
                {saveStatus === 'saving' && (
                  <>
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Saving...</span>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Saved</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <XCircle className="h-4 w-4" />
                    <span>Error</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Toolbar */}
        {selectedView === 'editing' && activeNode && (
          <div className="flex items-center border-b border-slate-300 bg-slate-100 h-8 px-2">
            <div className="flex items-center gap-1">
              {activeNode.name.endsWith('.md') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2 py-1"
                  onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
                >
                  {showMarkdownPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showMarkdownPreview ? 'Code Only' : 'Split View'}
                </Button>
              )}
              
              <div className="text-xs text-slate-600 flex items-center gap-2 ml-2">
                <span>{activeNode.name}</span>
                  <span>•</span>
                <span>{(activeNode.content || '').split('\n').length} lines</span>
                <span>•</span>
                <span>{formatFileSize(activeNode.size || 0)}</span>
                {activeNode.isDirty && (
                  <>
                    <span>•</span>
                    <span className="text-orange-600">Modified</span>
                  </>
                )}
              </div>
              
              {/* Undo/Redo buttons */}
              <div className="flex items-center gap-1 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => fileSystem.undo(activeNode.path)}
                  disabled={!fileSystem.canUndo(activeNode.path)}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => fileSystem.redo(activeNode.path)}
                  disabled={!fileSystem.canRedo(activeNode.path)}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {selectedView === 'editing' && activeNode && (
            <FileContentRenderer node={activeNode} />
          )}

          {selectedView === 'editing' && !activeNode && (
            <div className="h-full flex items-center justify-center bg-slate-50">
              <div className="text-center text-slate-500">
                <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No file selected</p>
                <p className="text-sm mt-1">Open a file to start editing</p>
              </div>
            </div>
          )}

          {selectedView === 'terminal' && (
            <div className="h-full flex flex-col bg-slate-900">
              <div
                ref={terminalDisplayRef}
                className="flex-1 overflow-y-auto p-4 font-mono text-sm custom-scrollbar-dark"
              >
                {displayedTerminalOutput.map((line, i) => (
                    <div
                      key={i}
                      className={`mb-1 ${
                      line.startsWith('$') ? 'text-green-400' : 
                        line.startsWith('>') ? 'text-sky-400' : 'text-slate-300'
                      }`}
                    >
                      {line}
                    </div>
                ))}
                  </div>
              <div className="flex items-center p-2 border-t border-slate-700">
                <span className="text-green-400 font-mono text-sm mr-2">$</span>
                <input
                  ref={terminalInputRef}
                  type="text"
                  value={terminalInputValue}
                  onChange={(e) => setTerminalInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && terminalInputValue.trim()) {
                      handleTerminalCommand(terminalInputValue)
                      setTerminalInputValue('')
                    }
                  }}
                  className="flex-1 bg-transparent text-slate-300 outline-none font-mono text-sm"
                  placeholder="Type a command..."
                  disabled={isViewingHistory}
                />
              </div>
            </div>
          )}

          {selectedView === 'info' && (
            <div className="p-4 overflow-y-auto">
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="font-semibold mb-3">Task Status</h3>
                  <div className="bg-slate-100 rounded-lg p-4">
                    <span className={`inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full ${
                      taskStatus === 'completed' ? 'bg-green-100 text-green-800' :
                      taskStatus === 'failed' ? 'bg-red-100 text-red-800' :
                      taskStatus === 'started' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-200 text-slate-800'
                    }`}>
                      {taskStatus === 'completed' ? '✓ Completed' :
                       taskStatus === 'failed' ? '✗ Failed' :
                       taskStatus === 'started' ? '● Running' : '○ Waiting'}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">File System Stats</h3>
                  <div className="bg-slate-100 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total files:</span>
                      <span>{Array.from(fileSystem['fileMap'].values()).filter(n => n.type === 'file').length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Open tabs:</span>
                      <span>{openTabs.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Modified files:</span>
                      <span>{fileSystem.getDirtyFiles().length}</span>
                    </div>
                  </div>
                </div>

                {activeNode && (
                  <div>
                    <h3 className="font-semibold mb-3">
                      Current File {activeNode.isDirty && <span className="text-orange-500 font-normal">(Modified)</span>}
                    </h3>
                    <div className="bg-slate-100 rounded-lg p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Name:</span>
                        <span className="font-mono">{activeNode.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Path:</span>
                        <span className="font-mono text-xs">{activeNode.path}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Type:</span>
                        <span className="capitalize">{detectFileType(activeNode.name)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Size:</span>
                        <span>{formatFileSize(activeNode.size || 0)}</span>
                      </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Lines:</span>
                        <span>{(activeNode.content || '').split('\n').length}</span>
                        </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Last modified:</span>
                        <span>{new Date(activeNode.lastModified || 0).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* History controls */}
        {historyLength > 0 && selectedView === 'editing' && (
          <div className="border-t border-slate-300 p-4 bg-slate-50">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
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
              onClick={() => onHistoryChange?.(Math.min(historyLength - 1, (currentHistoryIndexValue ?? -1) + 1))}
                disabled={!isViewingHistory || currentHistoryIndexValue === historyLength - 1}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            {isViewingHistory && (
              <Button
                variant="outline"
                size="sm"
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

  // Full layout view - not implemented as it's not used in the current setup
  return null
})

ComputerView.displayName = 'ComputerView'