"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Terminal, FileText, FolderTree, ChevronRight, ChevronDown, File, Folder, Info, X, Plus, ArrowLeft, ArrowRight, Save, RotateCcw, Eye, EyeOff, ChevronLeft, Download, Play, Pause } from "lucide-react"
import { FileStructureNode } from "@/lib/api"
import { marked } from 'marked'
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism-coy.css';

interface FileTab {
  id: string
  filename: string
  content: string
  hasChanges: boolean
  fileType: 'text' | 'image' | 'video' | 'pdf' | 'markdown'
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
}

// 检测文件类型的函数
const getFileType = (filename: string): 'text' | 'image' | 'video' | 'pdf' | 'markdown' => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  if (extension === 'md') return 'markdown';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) return 'image';
  if (['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(extension)) return 'video';
  if (extension === 'pdf') return 'pdf';
  return 'text';
};

// PDF查看器组件（使用iframe，避免依赖问题）
const PDFViewer = ({ src, filename }: { src: string; filename: string }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-red-600" />
          <span className="text-sm font-medium">{filename}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(src, '_blank')}
          >
            <Download className="h-4 w-4 mr-1" />
            Open External
          </Button>
        </div>
      </div>

      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
            <div className="text-center text-slate-500">
              <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-2"></div>
              <p>Loading PDF...</p>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
            <div className="text-center text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
              <p className="text-red-600">Failed to load PDF</p>
              <p className="text-sm mt-1">Click "Open External" to view</p>
            </div>
          </div>
        )}

        <iframe
          src={src}
          className="w-full h-full border-0"
          title={`PDF viewer for ${filename}`}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      </div>
    </div>
  );
};

// 图片查看器组件
const ImageViewer = ({ src, filename }: { src: string; filename: string }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>('');

  useEffect(() => {
    // 处理不同的图片源格式
    if (src.startsWith('data:')) {
      setImageUrl(src);
    } else if (src.startsWith('http')) {
      setImageUrl(src);
    } else {
      // 假设是文件内容，创建SVG
      const svgContent = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <text x="50%" y="40%" font-family="Arial" font-size="18" fill="#333333" text-anchor="middle">${filename}</text>
        <text x="50%" y="60%" font-family="Arial" font-size="12" fill="#666666" text-anchor="middle">Demo Image</text>
      </svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      setImageUrl(URL.createObjectURL(blob));
    }
  }, [src, filename]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium">{filename}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(imageUrl, '_blank')}
        >
          <Download className="h-4 w-4 mr-1" />
          View Full Size
        </Button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto image-viewer-container">
        {hasError ? (
          <div className="text-center text-slate-500">
            <Eye className="h-12 w-12 mx-auto mb-2 text-slate-300" />
            <p>Failed to load image</p>
            <p className="text-sm mt-1">{filename}</p>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={filename}
            className="max-w-full max-h-full object-contain shadow-lg rounded-lg"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            style={{ display: isLoading ? 'none' : 'block' }}
          />
        )}
        {isLoading && (
          <div className="text-center text-slate-500">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-2"></div>
            <p>Loading image...</p>
          </div>
        )}
      </div>
    </div>
  );
};

// 视频播放器组件
const VideoPlayer = ({ src, filename }: { src: string; filename: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="h-full flex flex-col bg-black">
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-white">{filename}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={togglePlay}
            className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(src, '_blank')}
            className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
          >
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <video
          ref={videoRef}
          src={src}
          className="max-w-full max-h-full"
          controls
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
};

export function ComputerView({
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
  onHistoryChange
}: ComputerViewProps) {
  const [selectedView, setSelectedView] = useState<string>('editing')
  const [fileTabs, setFileTabs] = useState<FileTab[]>([])
  const [activeFileId, setActiveFileId] = useState<string>('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['resear-pro-task']))
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map())
  const [originalFileContents, setOriginalFileContents] = useState<Map<string, string>>(new Map())
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(true);
  const [tabScrollPosition, setTabScrollPosition] = useState(0);
  const [showToolsMenu, setShowToolsMenu] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const terminalDisplayRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const [terminalInputValue, setTerminalInputValue] = useState('');
  const [displayedTerminalOutput, setDisplayedTerminalOutput] = useState<string[]>([]);

  // 初始化当前文件
  useEffect(() => {
    if (currentFile && fileContent !== undefined && fileContent !== null && !fileTabs.find(tab => tab.filename === currentFile) && !isViewingHistory) {
      const fileType = getFileType(currentFile);
      const newTab: FileTab = {
        id: `file-${Date.now()}`,
        filename: currentFile,
        content: fileContent,
        hasChanges: false,
        fileType
      }
      setFileTabs(prev => [...prev, newTab])
      setActiveFileId(newTab.id)
      setSelectedView('editing')
      setFileContents(prev => new Map(prev).set(currentFile, fileContent));
      setOriginalFileContents(prev => new Map(prev).set(currentFile, fileContent));
    }
  }, [currentFile, fileContent, fileTabs, isViewingHistory])

  // 实时更新文件内容
  useEffect(() => {
    if (currentFile && fileContent !== undefined && fileContent !== null && isLive && !isViewingHistory) {
      setFileContents(prev => new Map(prev).set(currentFile, fileContent));
      setOriginalFileContents(prevOrig => new Map(prevOrig).set(currentFile, fileContent));

      setFileTabs(prev => prev.map(tab =>
        tab.filename === currentFile
          ? { ...tab, content: fileContent, hasChanges: false }
          : tab
      ));
    }
  }, [currentFile, fileContent, isLive]);

  // 自动切换到终端
  useEffect(() => {
    if (terminalOutput.length > 0 && terminalOutput.length <= 2 && selectedView === 'editing') {
      setSelectedView('terminal')
    }
  }, [terminalOutput.length, selectedView])

  // 更新终端输出
  useEffect(() => {
    setDisplayedTerminalOutput(terminalOutput || []);
  }, [terminalOutput]);

  // 自动滚动终端
  useEffect(() => {
    if (selectedView === 'terminal' && terminalDisplayRef.current) {
      terminalDisplayRef.current.scrollTop = terminalDisplayRef.current.scrollHeight;
    }
  }, [displayedTerminalOutput, selectedView]);

  // 自动聚焦终端输入
  useEffect(() => {
    if (selectedView === 'terminal' && terminalInputRef.current) {
      terminalInputRef.current.focus();
    }
  }, [selectedView]);

  // 点击外部关闭工具菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showToolsMenu) {
        setShowToolsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showToolsMenu]);

  // 文件标签滚动函数
  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      const scrollAmount = 200;
      const newPosition = direction === 'left'
        ? Math.max(0, tabScrollPosition - scrollAmount)
        : tabScrollPosition + scrollAmount;

      tabsContainerRef.current.scrollLeft = newPosition;
      setTabScrollPosition(newPosition);
    }
  };

  const handleTerminalInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTerminalInputValue(e.target.value);
  };

  const handleTerminalInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && terminalInputValue.trim() !== '') {
      e.preventDefault();
      const commandToDisplay = `> ${terminalInputValue}`;
      setDisplayedTerminalOutput(prevOutput => [...prevOutput, commandToDisplay]);
      console.log(`Terminal command submitted: ${terminalInputValue}`);
      setTerminalInputValue('');
    }
  };

  const handleFileClick = (filename: string) => {
    const existingTab = fileTabs.find(tab => tab.filename === filename)
    if (existingTab) {
      setActiveFileId(existingTab.id)
      setSelectedView('editing')
      return
    }

    const contentFromCache = fileContents.get(filename);
    const content = contentFromCache || ''
    const fileType = getFileType(filename);

    const newTab: FileTab = {
      id: `file-${Date.now()}`,
      filename,
      content,
      hasChanges: false,
      fileType
    }

    setFileTabs(prevTabs => [...prevTabs, newTab]);
    setActiveFileId(newTab.id)
    setSelectedView('editing')
    setOriginalFileContents(prev => new Map(prev).set(filename, content));
  }

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const tabIndex = fileTabs.findIndex(tab => tab.id === tabId)
    const newTabs = fileTabs.filter(tab => tab.id !== tabId)
    setFileTabs(newTabs)

    if (activeFileId === tabId && newTabs.length > 0) {
      const newIndex = Math.min(tabIndex, newTabs.length - 1)
      setActiveFileId(newTabs[newIndex].id)
      setSelectedView('editing')
    }
  }

  const handleFileContentChange = (tabId: string, newContent: string) => {
    setFileTabs(prev => prev.map(tab =>
      tab.id === tabId
        ? { ...tab, content: newContent, hasChanges: true }
        : tab
    ))
  }

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }

  const renderFileTree = (node: FileStructureNode, path: string = '', level: number = 0) => {
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
      const isOpen = fileTabs.some(tab => tab.filename === node.name)
      return (
        <div
          key={fullPath}
          className={`flex items-center gap-1 py-1 px-2 hover:bg-slate-100 cursor-pointer text-sm ${
            isOpen ? 'bg-blue-50 text-blue-700' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 24}px` }}
          onClick={() => handleFileClick(node.name)}
        >
          <File className="h-4 w-4 text-slate-500" />
          <span>{node.name}</span>
        </div>
      )
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const activeTab = fileTabs.find(tab => tab.id === activeFileId);

  const handleSave = useCallback(() => {
    if (activeTab && activeTab.hasChanges) {
      const currentContent = activeTab.content;
      setOriginalFileContents(prev => new Map(prev).set(activeTab.filename, currentContent));
      setFileTabs(prevTabs =>
        prevTabs.map(t =>
          t.id === activeTab.id ? { ...t, hasChanges: false } : t
        )
      );
    }
  }, [activeTab]);

  const handleRevert = useCallback(() => {
    if (activeTab) {
      const originalContent = originalFileContents.get(activeTab.filename);
      if (originalContent !== undefined) {
        setFileTabs(prevTabs =>
          prevTabs.map(t =>
            t.id === activeTab.id ? { ...t, content: originalContent, hasChanges: false } : t
          )
        );
        setFileContents(prev => new Map(prev).set(activeTab.filename, originalContent));
      }
    }
  }, [activeTab, originalFileContents]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (selectedView === 'editing' && activeTab) {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (activeTab.hasChanges) handleSave();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        const originalContent = originalFileContents.get(activeTab.filename);
        if (activeTab.hasChanges || (originalContent !== undefined && activeTab.content !== originalContent)) {
          handleRevert();
        }
      }
    }
  }, [selectedView, activeTab, originalFileContents, handleSave, handleRevert]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // 渲染不同类型文件的内容
  const renderFileContent = () => {
    if (!activeTab) {
      return (
        <div className="h-full flex items-center justify-center text-slate-500">
          <div className="text-center">
            <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">No files open</p>
            <p className="text-xs mt-1">Select a file from the explorer or open a new one.</p>
          </div>
        </div>
      );
    }

    // 根据文件类型渲染不同的查看器
    switch (activeTab.fileType) {
      case 'image':
        return <ImageViewer src={activeTab.content} filename={activeTab.filename} />;

      case 'video':
        return <VideoPlayer src={activeTab.content} filename={activeTab.filename} />;

      case 'pdf':
        return <PDFViewer src={activeTab.content} filename={activeTab.filename} />;

      case 'markdown':
        if (showMarkdownPreview) {
          return (
            <div className="flex h-full">
              <div className="w-1/2 h-full border-r border-slate-300">
                <textarea
                  value={activeTab.content}
                  onChange={(e) => handleFileContentChange(activeTab.id, e.target.value)}
                  className="w-full h-full outline-none resize-none text-sm font-mono text-slate-800 placeholder:text-slate-500 p-4 bg-white custom-scrollbar"
                  placeholder="Enter Markdown..."
                  readOnly={isViewingHistory || (!isLive && taskStatus !== 'completed')}
                  style={{ lineHeight: '1.6' }}
                />
              </div>
              <div
                className="w-1/2 h-full p-4 overflow-y-auto prose prose-sm lg:prose-base bg-white custom-scrollbar"
                dangerouslySetInnerHTML={{ __html: marked.parse(activeTab.content || '') }}
              />
            </div>
          );
        }
        // Fall through to text editor for markdown without preview

      default:
        // 文本文件编辑器
        const isCodeFile = activeTab.filename.match(/\.(py|js|ts|css|json)$/);
        let highlightedContent = '';
        let language = '';

        if (isCodeFile) {
          const extension = activeTab.filename.split('.').pop() || '';
          if (extension === 'py') language = 'python';
          else if (extension === 'js') language = 'javascript';
          else if (extension === 'ts') language = 'typescript';
          else if (extension === 'css') language = 'css';
          else if (extension === 'json') language = 'json';

          if (language && Prism.languages[language]) {
            highlightedContent = Prism.highlight(activeTab.content || '', Prism.languages[language], language);
          } else {
            highlightedContent = activeTab.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          }
        }

        return (
          <div className="h-full flex flex-col relative">
            {isCodeFile ? (
              <div
                ref={scrollContainerRef}
                className="flex-1 p-0 overflow-y-auto relative bg-white custom-scrollbar"
                onScroll={() => {
                  if (textareaRef.current && scrollContainerRef.current) {
                    textareaRef.current.scrollTop = scrollContainerRef.current.scrollTop;
                  }
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={activeTab.content}
                  onChange={(e) => handleFileContentChange(activeTab.id, e.target.value)}
                  className="w-full h-full outline-none resize-none text-sm font-mono text-transparent bg-transparent caret-slate-700 p-4 absolute inset-0 z-10 overflow-hidden"
                  placeholder="Enter code..."
                  readOnly={isViewingHistory || (!isLive && taskStatus !== 'completed')}
                  style={{ lineHeight: '1.6' }}
                  spellCheck="false"
                />
                <pre
                  ref={preRef}
                  className="w-full outline-none resize-none text-sm font-mono p-4 z-0 bg-transparent"
                  style={{ lineHeight: '1.6', margin: 0 }}
                  aria-hidden="true"
                >
                  <code dangerouslySetInnerHTML={{ __html: highlightedContent }} />
                </pre>
              </div>
            ) : (
              <div className="flex-1 p-4 overflow-hidden">
                <textarea
                  value={activeTab.content}
                  onChange={(e) => handleFileContentChange(activeTab.id, e.target.value)}
                  className="w-full h-full outline-none resize-none text-sm font-mono text-slate-800 placeholder:text-slate-500 bg-white custom-scrollbar"
                  placeholder="Empty file"
                  readOnly={isViewingHistory || (!isLive && taskStatus !== 'completed')}
                  style={{ lineHeight: '1.6' }}
                />
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="h-full flex w-full">
      {/* 左侧文件树 - 固定宽度 */}
      <div className="w-64 border-r border-slate-300 bg-slate-50 flex-shrink-0">
        <div className="border-b border-slate-300 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            File Explorer
          </h3>
        </div>
        <div className="overflow-y-auto h-[calc(100%-3rem)] py-2 custom-scrollbar">
          {fileStructure ? (
            renderFileTree(fileStructure)
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No files yet
            </div>
          )}
        </div>
      </div>

      {/* 右侧内容区域 - 严格固定宽度 */}
      <div className="w-[calc(100vw-16rem)] flex flex-col overflow-hidden">
        {/* 文件标签栏和工具栏 */}
        <div className="flex items-center border-b border-slate-300 bg-slate-50 h-10">
          {/* 文件标签滚动区域 - 固定宽度 */}
          <div className="w-[60%] flex items-center overflow-hidden">
            {fileTabs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-full px-2 rounded-none border-r border-slate-300 flex-shrink-0"
                onClick={() => scrollTabs('left')}
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
            )}

            <div
              ref={tabsContainerRef}
              className="flex overflow-x-hidden flex-1 h-full"
              style={{ scrollBehavior: 'smooth' }}
            >
              {fileTabs.map(tab => (
                <div
                  key={tab.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveFileId(tab.id)
                    setSelectedView('editing')
                  }}
                  className={`flex items-center gap-2 px-3 h-full text-sm cursor-pointer w-32 border-r border-slate-300 flex-shrink-0
                    ${activeFileId === tab.id && selectedView === 'editing' 
                      ? 'bg-white text-slate-900' 
                      : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                    }`}
                >
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate flex-1">{tab.filename}</span>
                  {tab.hasChanges && <span className="w-2 h-2 bg-orange-400 rounded-full flex-shrink-0" />}
                  <button
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="p-0.5 hover:bg-slate-300 rounded flex-shrink-0"
                    aria-label={`Close tab ${tab.filename}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {fileTabs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-full px-2 rounded-none border-l border-slate-300 flex-shrink-0"
                onClick={() => scrollTabs('right')}
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* 视图选择按钮 - 固定宽度 */}
          <div className="w-[25%] flex border-l border-slate-300">
            <Button
              variant="ghost"
              size="sm"
              className={`flex-1 h-full px-2 rounded-none text-xs flex items-center justify-center gap-1
                ${selectedView === 'terminal' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'}`}
              onClick={() => setSelectedView('terminal')}
            >
              <Terminal className="h-3 w-3" />
              <span className="hidden sm:inline">Terminal</span>
              {terminalOutput.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full">
                  {Math.floor(terminalOutput.length / 2)}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`flex-1 h-full px-2 rounded-none text-xs flex items-center justify-center gap-1 border-l border-slate-300
                ${selectedView === 'info' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'}`}
              onClick={() => setSelectedView('info')}
            >
              <Info className="h-3 w-3" />
              <span className="hidden sm:inline">Info</span>
            </Button>
          </div>

          {/* 工具按钮 - 固定宽度，使用下拉菜单 */}
          <div className="w-[15%] flex items-center border-l border-slate-300 justify-center">
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-300 hover:bg-slate-200 text-slate-700 flex items-center gap-1 text-xs px-2"
                onClick={() => setShowToolsMenu(!showToolsMenu)}
              >
                Tools
                <ChevronDown className="h-3 w-3" />
              </Button>

              {showToolsMenu && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-slate-300 rounded-md shadow-lg z-50 min-w-[180px]">
                  <button
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => {
                      handleSave();
                      setShowToolsMenu(false);
                    }}
                    disabled={!(activeTab && activeTab.hasChanges)}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => {
                      handleRevert();
                      setShowToolsMenu(false);
                    }}
                    disabled={isViewingHistory || !(activeTab && activeTab.hasChanges)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Revert
                  </button>
                  {activeTab && activeTab.fileType === 'markdown' && (
                    <button
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
                      onClick={() => {
                        setShowMarkdownPreview(!showMarkdownPreview);
                        setShowToolsMenu(false);
                      }}
                    >
                      {showMarkdownPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {showMarkdownPreview ? 'Hide Preview' : 'Show Preview'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-hidden">
          {selectedView === 'editing' && renderFileContent()}

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
              <div className="flex items-center p-2 border-t border-slate-700">
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
                  <h3 className="font-semibold text-slate-900 mb-3">File Statistics</h3>
                  <div className="bg-slate-100 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Open files:</span>
                      <span>{fileTabs.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total files:</span>
                      <span>{fileContents.size}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Modified files:</span>
                      <span>{fileTabs.filter(tab => tab.hasChanges).length}</span>
                    </div>
                  </div>
                </div>

                {activeTab && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">
                      Current File {activeTab.hasChanges ? <span className="text-orange-500 font-normal">(Unsaved)</span> : ''}
                    </h3>
                    <div className="bg-slate-100 rounded-lg p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Name:</span>
                        <span className="font-mono">{activeTab.filename}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Type:</span>
                        <span className="capitalize">{activeTab.fileType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Size:</span>
                        <span>{formatFileSize(new Blob([activeTab.content]).size)}</span>
                      </div>
                      {activeTab.fileType === 'text' || activeTab.fileType === 'markdown' ? (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Lines:</span>
                          <span>{activeTab.content.split('\n').length}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 历史记录控制区域 */}
        <div className="border-t border-slate-300 p-4 bg-slate-50">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="border-slate-300 hover:bg-slate-200"
              onClick={() => onHistoryChange?.(Math.max(0, (currentHistoryIndexValue ?? 0) - 1))}
              disabled={historyLength === 0 || currentHistoryIndexValue === 0}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Slider
              value={isViewingHistory ? [currentHistoryIndexValue ?? 0] : (historyLength > 0 ? [historyLength -1] : [0])}
              max={historyLength > 0 ? historyLength - 1 : 0}
              step={1}
              className="flex-1"
              onValueChange={value => onHistoryChange?.(value[0])}
              disabled={historyLength === 0}
            />
            <Button
              variant="outline"
              size="icon"
              className="border-slate-300 hover:bg-slate-200"
              onClick={() => onHistoryChange?.(Math.min(historyLength - 1, (currentHistoryIndexValue ?? -1) + 1))}
              disabled={historyLength === 0 || !isViewingHistory || currentHistoryIndexValue === historyLength - 1}
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
      </div>


    </div>
  )
}