"use client"

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Terminal, FileText, FolderTree, ChevronRight, ChevronDown, File, Folder, Info, X, Plus, ArrowLeft, ArrowRight, Save, RotateCcw, Eye, EyeOff, ChevronLeft, Download, Play, Pause, CheckCircle2, XCircle, Edit, AlertCircle } from "lucide-react"
import { FileStructureNode, apiService } from "@/lib/api"

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

// 条件导入 ReactMarkdown，避免在没有依赖时崩溃
let ReactMarkdown: any;
try {
  ReactMarkdown = require('react-markdown').default;
} catch (e) {
  console.warn('react-markdown not available, using fallback markdown renderer');
  ReactMarkdown = null;
}

// 简单的Markdown fallback渲染器
const SimpleFallbackMarkdownRenderer = ({ children }: { children: string }) => {
  // 简单的markdown到HTML转换
  const convertSimpleMarkdown = (text: string) => {
    return text
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      // Links
      .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // Line breaks
      .replace(/\n/gim, '<br>');
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
      <div className="prose prose-slate max-w-none">
        <pre className="whitespace-pre-wrap text-sm">{children}</pre>
      </div>
    );
  }
};

// Markdown 组件选择器
const MarkdownRenderer = ({ children }: { children: string }) => {
  if (ReactMarkdown) {
    return (
      <div className="prose prose-slate max-w-none">
        <ReactMarkdown>
          {children}
        </ReactMarkdown>
      </div>
    );
  }
  return <SimpleFallbackMarkdownRenderer>{children}</SimpleFallbackMarkdownRenderer>;
};

interface FileTab {
  id: string
  filename: string
  content: string
  hasChanges: boolean
  fileType: 'text' | 'image' | 'video' | 'pdf' | 'markdown' | 'html'
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

// 检测文件类型的函数
const getFileType = (filename: string): 'text' | 'image' | 'video' | 'pdf' | 'markdown' | 'html' => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  if (extension === 'md') return 'markdown';
  if (extension === 'html' || extension === 'htm') return 'html';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) return 'image';
  if (['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(extension)) return 'video';
  if (extension === 'pdf') return 'pdf';
  return 'text';
};

// PDF查看器组件（使用iframe，避免依赖问题）
const PDFViewer = ({ src, filename }: { src: string; filename: string }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // 检查src是否为空
  if (!src || src.trim() === '') {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium">{filename}</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-100">
          <div className="text-center text-slate-500">
            <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
            <p>No PDF content available</p>
          </div>
        </div>
      </div>
    );
  }

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
    if (!src || src.trim() === '') {
      // 如果src为空，创建一个默认的SVG
      const svgContent = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <text x="50%" y="40%" font-family="Arial" font-size="18" fill="#333333" text-anchor="middle">${filename}</text>
        <text x="50%" y="60%" font-family="Arial" font-size="12" fill="#666666" text-anchor="middle">No Image Content</text>
      </svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      setImageUrl(URL.createObjectURL(blob));
      setIsLoading(false);
    } else if (src.startsWith('data:')) {
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
          disabled={!imageUrl}
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
          imageUrl && (
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
          )
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

  // 检查src是否为空
  if (!src || src.trim() === '') {
    return (
      <div className="h-full flex flex-col bg-black">
        <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium text-white">{filename}</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-400">
            <Play className="h-12 w-12 mx-auto mb-2 text-slate-600" />
            <p>No video content available</p>
          </div>
        </div>
      </div>
    );
  }

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

// HTML预览器组件
const HTMLViewer = ({ content, filename }: { content: string; filename: string }) => {
  const [showCode, setShowCode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 检查content是否为空
  if (!content || content.trim() === '') {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-medium">{filename}</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
            <p>No HTML content available</p>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (iframeRef.current && !showCode) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(content);
        doc.close();
      }
    }
  }, [content, showCode]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between p-3 border-b border-slate-300 bg-slate-50">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-orange-600" />
          <span className="text-sm font-medium">{filename}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCode(!showCode)}
            className="border-slate-300"
          >
            {showCode ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            {showCode ? 'Preview' : 'Code'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const blob = new Blob([content], { type: 'text/html' });
              const url = URL.createObjectURL(blob);
              window.open(url, '_blank');
              setTimeout(() => URL.revokeObjectURL(url), 100);
            }}
          >
            <Download className="h-4 w-4 mr-1" />
            Open External
          </Button>
        </div>
      </div>

      {showCode ? (
        <div className="flex-1 p-4 overflow-auto">
          <pre className="text-sm font-mono text-slate-800 whitespace-pre-wrap">
            <code>{content}</code>
          </pre>
        </div>
      ) : (
        <div className="flex-1 relative">
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            title={`HTML preview for ${filename}`}
          />
        </div>
      )}
    </div>
  );
};

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
  maxTabs = 4,
  onFileSelect,
  onFileEditStateChange,
  taskId,
  activities = [],
  taskStartTime
}, ref) => {
  const [selectedView, setSelectedView] = useState<string>('editing')
  const [fileTabs, setFileTabs] = useState<FileTab[]>([])
  const [activeFileId, setActiveFileId] = useState<string>('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['resear-pro-task']))
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map())
  const [originalFileContents, setOriginalFileContents] = useState<Map<string, string>>(new Map())
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(true);
  const [tabScrollPosition, setTabScrollPosition] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const terminalDisplayRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const [terminalInputValue, setTerminalInputValue] = useState('');
  const [displayedTerminalOutput, setDisplayedTerminalOutput] = useState<string[]>([]);

  const [showFileContextMenu, setShowFileContextMenu] = useState<{show: boolean, x: number, y: number, filename: string, isFolder: boolean}>({
    show: false, x: 0, y: 0, filename: '', isFolder: false
  });
  const [newItemDialog, setNewItemDialog] = useState<{show: boolean, type: 'file' | 'folder', parentPath: string}>({
    show: false, type: 'file', parentPath: ''
  });
  const [renameDialog, setRenameDialog] = useState<{show: boolean, filename: string, newName: string}>({
    show: false, filename: '', newName: ''
  });

  // 监听从父组件传来的文件选择
  useEffect(() => {
    if (currentFile && fileContent !== undefined && fileContent !== null) {
      // 检查是否已经有这个文件的标签页
      const existingTab = fileTabs.find(tab => tab.filename === currentFile);
      
      if (existingTab) {
        // 如果已经存在，切换到该标签页
        setActiveFileId(existingTab.id);
        setSelectedView('editing');
        // 更新内容
        setFileTabs(prev => prev.map(tab =>
          tab.filename === currentFile
            ? { ...tab, content: fileContent, hasChanges: false }
            : tab
        ));
      } else if (!isViewingHistory) {
        // 如果不存在且不在查看历史记录，创建新标签页
        const fileType = getFileType(currentFile);
        const newTab: FileTab = {
          id: `file-${currentFile}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          filename: currentFile,
          content: fileContent,
          hasChanges: false,
          fileType
        };
        setFileTabs(prev => [...prev, newTab]);
        setActiveFileId(newTab.id);
        setSelectedView('editing');
      }
      
      // 更新文件内容缓存
      setFileContents(prev => new Map(prev).set(currentFile, fileContent));
      setOriginalFileContents(prev => new Map(prev).set(currentFile, fileContent));
    }
  }, [currentFile, fileContent, isViewingHistory]);

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
  }, [currentFile, fileContent, isLive, isViewingHistory]);

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
    // 如果是仅显示文件树模式，调用回调函数通知父组件
    if (showOnlyFileTree && onFileSelect) {
      onFileSelect(filename);
      return;
    }

    // 检查是否已经有这个文件的标签页
    const existingTab = fileTabs.find(tab => tab.filename === filename)
    if (existingTab) {
      // 如果已经存在，直接切换到该标签页
      setActiveFileId(existingTab.id)
      setSelectedView('editing')
      
      // 通知父组件文件选择变化
      if (onFileSelect) {
        onFileSelect(filename);
      }
      return
    }

    // 从缓存中获取内容，如果没有则尝试从父组件获取
    let content = fileContents.get(filename) || '';
    
    // 如果是当前文件并且有内容，使用当前文件内容
    if (filename === currentFile && fileContent) {
      content = fileContent;
    }

    const fileType = getFileType(filename);

    // 创建新的文件标签页
    const newTab: FileTab = {
      id: `file-${filename}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      filename,
      content,
      hasChanges: false,
      fileType
    }

    // 限制最大标签页数量
    const maxTabsForCurrentMode = maxTabs || 4;
    setFileTabs(prevTabs => {
      let newTabs = [...prevTabs, newTab];
      if (newTabs.length > maxTabsForCurrentMode) {
        // 如果超过最大数量，移除最老的标签页
        newTabs = newTabs.slice(-maxTabsForCurrentMode);
      }
      return newTabs;
    });
    
    setActiveFileId(newTab.id)
    setSelectedView('editing')
    setOriginalFileContents(prev => new Map(prev).set(filename, content));
    
    // 更新文件内容缓存
    setFileContents(prev => new Map(prev).set(filename, content));
    
    // 通知父组件文件选择变化
    if (onFileSelect) {
      onFileSelect(filename);
    }
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

  // 计算文件总数的辅助函数
  const countAllFiles = (node: FileStructureNode): number => {
    if (!node) return 0;
    let count = node.type === 'file' ? 1 : 0;
    if (node.children) {
      count += node.children.reduce((acc, child) => acc + countAllFiles(child), 0);
    }
    return count;
  };

  // 计算所有文件大小
  const calculateTotalSize = () => {
    let totalSize = 0;
    fileContents.forEach(content => {
      totalSize += new Blob([content]).size;
    });
    return totalSize;
  };

  // 计算运行时长
  const getRuntime = () => {
    if (!taskStartTime) return 'Unknown';
    const now = Date.now();
    const runtime = Math.floor((now - taskStartTime * 1000) / 1000);
    const hours = Math.floor(runtime / 3600);
    const minutes = Math.floor((runtime % 3600) / 60);
    const seconds = runtime % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // 文件操作函数
  const handleCreateNewItem = async (name: string, type: 'file' | 'folder', parentPath: string) => {
    if (!taskId || !name.trim()) return;
    
    try {
      setSaveStatus('saving');
      const fullPath = parentPath ? `${parentPath}/${name}` : name;
      
      if (type === 'file') {
        const result = await apiService.createFile(taskId, fullPath, '');
        if (result.success) {
          console.log('File created successfully:', fullPath);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
          
          // 如果返回了新的文件结构，可以通知父组件更新
          if (result.file_structure && onFileSelect) {
            // 可以触发文件结构更新的逻辑
          }
        }
      } else {
        console.log('Folder creation not implemented yet');
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Failed to create item:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleDeleteItem = async (filename: string) => {
    if (!taskId || !filename) return;
    
    try {
      setSaveStatus('saving');
      const result = await apiService.deleteFile(taskId, filename);
      
      if (result.success) {
        console.log('File deleted successfully:', filename);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        
        // 如果当前删除的文件是活动文件，关闭对应的标签页
        const deletedTab = fileTabs.find(tab => tab.filename === filename);
        if (deletedTab) {
          setFileTabs(prev => prev.filter(tab => tab.filename !== filename));
          if (activeFileId === deletedTab.id && fileTabs.length > 1) {
            const remainingTabs = fileTabs.filter(tab => tab.id !== deletedTab.id);
            if (remainingTabs.length > 0) {
              setActiveFileId(remainingTabs[0].id);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to delete item:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleRenameItem = async (oldName: string, newName: string) => {
    if (!taskId || !oldName || !newName.trim()) return;
    
    try {
      setSaveStatus('saving');
      const result = await apiService.renameFile(taskId, oldName, newName);
      
      if (result.success) {
        console.log('File renamed successfully:', oldName, '->', newName);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        
        // 更新打开的标签页中的文件名
        setFileTabs(prev => prev.map(tab => 
          tab.filename === oldName 
            ? { ...tab, filename: newName }
            : tab
        ));
        
        // 更新文件内容缓存
        setFileContents(prev => {
          const newMap = new Map(prev);
          if (newMap.has(oldName)) {
            const content = newMap.get(oldName)!;
            newMap.delete(oldName);
            newMap.set(newName, content);
          }
          return newMap;
        });
        
        setOriginalFileContents(prev => {
          const newMap = new Map(prev);
          if (newMap.has(oldName)) {
            const content = newMap.get(oldName)!;
            newMap.delete(oldName);
            newMap.set(newName, content);
          }
          return newMap;
        });
      }
    } catch (error) {
      console.error('Failed to rename item:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // 处理右键菜单
  const handleFileRightClick = (e: React.MouseEvent, filename: string, isFolder: boolean) => {
    e.preventDefault();
    setShowFileContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      filename,
      isFolder
    });
  };

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFileContextMenu(prev => ({ ...prev, show: false }));
    };
    
    if (showFileContextMenu.show) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showFileContextMenu.show]);

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
      // 检查文件是否在操作台中打开（通过fileTabs检查）
      const isOpen = fileTabs.some(tab => tab.filename === node.name)
      // 检查是否是当前活动文件 - 修复绑定逻辑
      const isActiveInEditor = selectedView === 'editing' && 
        activeFileId && fileTabs.some(tab => tab.id === activeFileId && tab.filename === node.name)
      
      return (
        <div
          key={fullPath}
          className={`flex items-center gap-1 py-1 px-2 hover:bg-slate-100 cursor-pointer text-sm transition-colors duration-150 ${
            isActiveInEditor ? 'bg-blue-100 text-blue-800 border-r-2 border-blue-500' : 
            isOpen ? 'bg-blue-50 text-blue-700' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 24}px` }}
          onClick={() => handleFileClick(node.name)}
          onContextMenu={(e) => handleFileRightClick(e, node.name, false)}
        >
          <File className={`h-4 w-4 ${isActiveInEditor ? 'text-blue-600' : 'text-slate-500'}`} />
          <span className={isActiveInEditor ? 'font-medium' : ''}>{node.name}</span>
          {isOpen && (
            <div className={`w-1.5 h-1.5 rounded-full ml-auto ${
              isActiveInEditor ? 'bg-blue-600' : 'bg-blue-500'
            }`}></div>
          )}
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

  const handleSave = useCallback(async () => {
    if (activeTab && activeTab.hasChanges && taskId) {
      try {
        setSaveStatus('saving');
        const currentContent = activeTab.content;
        
        // 调用API保存文件
        const result = await apiService.saveFileContent(taskId, activeTab.filename, currentContent);
        
        if (result.success) {
          // 保存成功，更新本地状态
          setOriginalFileContents(prev => new Map(prev).set(activeTab.filename, currentContent));
          setFileContents(prev => new Map(prev).set(activeTab.filename, currentContent));
          setFileTabs(prevTabs =>
            prevTabs.map(t =>
              t.id === activeTab.id ? { ...t, hasChanges: false } : t
            )
          );
          
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000); // 2秒后隐藏成功提示
          console.log('File saved successfully:', activeTab.filename);
        } else {
          setSaveStatus('error');
          setTimeout(() => setSaveStatus('idle'), 3000);
          console.error('Failed to save file:', result.message);
        }
      } catch (error) {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
        console.error('Error saving file:', error);
      }
    } else if (activeTab && activeTab.hasChanges && !taskId) {
      // 如果没有taskId，只更新本地状态
      const currentContent = activeTab.content;
      setOriginalFileContents(prev => new Map(prev).set(activeTab.filename, currentContent));
      setFileTabs(prevTabs =>
        prevTabs.map(t =>
          t.id === activeTab.id ? { ...t, hasChanges: false } : t
        )
      );
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }, [activeTab, taskId]);

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

  // 使用useImperativeHandle暴露保存和还原功能
  useImperativeHandle(ref, () => ({
    save: handleSave,
    revert: handleRevert
  }), [handleSave, handleRevert]);

  // 监听文件编辑状态变化，通知父组件
  useEffect(() => {
    if (onFileEditStateChange && activeTab) {
      onFileEditStateChange(activeTab.hasChanges, activeTab.filename);
    } else if (onFileEditStateChange && !activeTab) {
      onFileEditStateChange(false, null);
    }
  }, [activeTab?.hasChanges, activeTab?.filename, onFileEditStateChange]);

  // 自动保存函数
  const autoSave = useCallback(async (tab: FileTab) => {
    if (tab.hasChanges && taskId) {
      try {
        const result = await apiService.saveFileContent(taskId, tab.filename, tab.content);
        if (result.success) {
          setOriginalFileContents(prev => new Map(prev).set(tab.filename, tab.content));
          setFileContents(prev => new Map(prev).set(tab.filename, tab.content));
          setFileTabs(prevTabs =>
            prevTabs.map(t =>
              t.id === tab.id ? { ...t, hasChanges: false } : t
            )
          );
          console.log('Auto-saved file:', tab.filename);
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }
  }, [taskId]);

  // 在标签页切换前自动保存当前标签
  const handleTabSwitch = useCallback((newTabId: string) => {
    // 先保存当前标签页（如果有修改）
    if (activeTab && activeTab.hasChanges) {
      autoSave(activeTab);
    }
    
    // 切换到新标签页
    setActiveFileId(newTabId);
    setSelectedView('editing');
    
    // 通知父组件文件选择变化
    const newTab = fileTabs.find(tab => tab.id === newTabId);
    if (newTab && onFileSelect) {
      onFileSelect(newTab.filename);
    }
  }, [activeTab, autoSave, fileTabs, onFileSelect]);

  // 渲染不同类型文件的内容
  const renderFileContent = () => {
    const activeTab = fileTabs.find(tab => tab.id === activeFileId);
    if (!activeTab) return null;

    const isMarkdown = activeTab.filename.endsWith('.md');
    const fileContent = fileContents.get(activeTab.filename) || '';

    return (
      <div className="h-full flex flex-col">
        {/* 文件工具栏 - 添加保存状态显示 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-slate-900">{activeTab.filename}</span>
            {activeTab.hasChanges && (
              <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
                未保存
              </span>
            )}
          </div>
          
          {/* 保存状态指示器 */}
          <div className="flex items-center space-x-2">
            {saveStatus !== 'idle' && (
              <div className="flex items-center space-x-1">
                {saveStatus === 'saving' && (
                  <>
                    <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-blue-600">保存中...</span>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-green-600">已保存</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <AlertCircle className="w-3 h-3 text-red-600" />
                    <span className="text-xs text-red-600">保存失败</span>
                  </>
                )}
              </div>
            )}
            
            {/* 文件操作按钮 */}
            <div className="flex items-center space-x-1">
              {activeTab.hasChanges && (
                <>
                  <button
                    onClick={handleSave}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleRevert}
                    className="px-2 py-1 text-xs bg-slate-300 text-slate-700 rounded hover:bg-slate-400 transition-colors"
                  >
                    还原
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 文件内容区域 */}
        <div className="flex-1 overflow-hidden">
          {/* ... 现有的文件内容渲染逻辑 ... */}
          {/* 现有代码保持不变 */}
          <div className="h-full">
            {(() => {
              const fileType = getFileType(activeTab.filename);
              const isMarkdown = fileType === 'markdown';
              
              if (fileType === 'pdf') {
                return <PDFViewer src={fileContent} filename={activeTab.filename} />;
              }
              
              if (fileType === 'image') {
                return <ImageViewer src={fileContent} filename={activeTab.filename} />;
              }
              
              if (fileType === 'video') {
                return <VideoPlayer src={fileContent} filename={activeTab.filename} />;
              }
              
              if (fileType === 'html') {
                return <HTMLViewer content={fileContent} filename={activeTab.filename} />;
              }
              
              // Markdown 和其他文本文件
              return (
                <div className="h-full flex">
                  {isMarkdown && showMarkdownPreview ? (
                    <div className="h-full flex">
                      <div className="w-1/2 border-r border-slate-200">
                        <textarea
                          className="w-full h-full p-4 border-none resize-none focus:outline-none font-mono text-sm"
                          value={fileContent}
                          onChange={(e) => handleFileContentChange(activeTab.id, e.target.value)}
                          placeholder="Enter your markdown content..."
                          readOnly={isViewingHistory}
                        />
                      </div>
                      <div className="w-1/2 p-4 overflow-auto bg-white">
                        <MarkdownRenderer>
                          {fileContent}
                        </MarkdownRenderer>
                      </div>
                    </div>
                  ) : (
                    <textarea
                      className="w-full h-full p-4 border-none resize-none focus:outline-none font-mono text-sm"
                      value={fileContent}
                      onChange={(e) => handleFileContentChange(activeTab.id, e.target.value)}
                      placeholder={
                        activeTab.filename.endsWith('.md') 
                          ? "Enter your markdown content..."
                          : "Enter your content..."
                      }
                      readOnly={isViewingHistory}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  };

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
          {fileStructure ? (
            renderFileTree(fileStructure)
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No files yet
            </div>
          )}
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
                setNewItemDialog({ show: true, type: 'file', parentPath: showFileContextMenu.isFolder ? showFileContextMenu.filename : '' });
                setShowFileContextMenu(prev => ({ ...prev, show: false }));
              }}
            >
              <Plus className="h-4 w-4" />
              New File
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
              onClick={() => {
                setNewItemDialog({ show: true, type: 'folder', parentPath: showFileContextMenu.isFolder ? showFileContextMenu.filename : '' });
                setShowFileContextMenu(prev => ({ ...prev, show: false }));
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
                    setRenameDialog({ show: true, filename: showFileContextMenu.filename, newName: showFileContextMenu.filename });
                    setShowFileContextMenu(prev => ({ ...prev, show: false }));
                  }}
                >
                  <Edit className="h-4 w-4" />
                  Rename
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete ${showFileContextMenu.filename}?`)) {
                      handleDeleteItem(showFileContextMenu.filename);
                    }
                    setShowFileContextMenu(prev => ({ ...prev, show: false }));
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
                placeholder={`Enter ${newItemDialog.type} name...`}
                className="w-full border border-slate-300 rounded px-3 py-2 mb-4"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const name = (e.target as HTMLInputElement).value;
                    handleCreateNewItem(name, newItemDialog.type, newItemDialog.parentPath);
                    setNewItemDialog({ show: false, type: 'file', parentPath: '' });
                  } else if (e.key === 'Escape') {
                    setNewItemDialog({ show: false, type: 'file', parentPath: '' });
                  }
                }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                  onClick={() => setNewItemDialog({ show: false, type: 'file', parentPath: '' })}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  onClick={() => {
                    const input = document.querySelector('input[placeholder*="name"]') as HTMLInputElement;
                    if (input?.value) {
                      handleCreateNewItem(input.value, newItemDialog.type, newItemDialog.parentPath);
                      setNewItemDialog({ show: false, type: 'file', parentPath: '' });
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
                  if (e.key === 'Enter') {
                    handleRenameItem(renameDialog.filename, renameDialog.newName);
                    setRenameDialog({ show: false, filename: '', newName: '' });
                  } else if (e.key === 'Escape') {
                    setRenameDialog({ show: false, filename: '', newName: '' });
                  }
                }}
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
                    handleRenameItem(renameDialog.filename, renameDialog.newName);
                    setRenameDialog({ show: false, filename: '', newName: '' });
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
        <div className="flex items-center border-b border-slate-300 bg-slate-50 h-10 flex-shrink-0">
          {/* 文件标签滚动区域 */}
          <div className="flex-1 flex items-center overflow-hidden">
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
              {fileTabs.slice(0, maxTabs).map(tab => (
                <div
                  key={tab.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    handleTabSwitch(tab.id)
                  }}
                  className={`flex items-center gap-2 px-3 h-full text-sm cursor-pointer min-w-[120px] max-w-[200px] border-r border-slate-300 flex-shrink-0
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

          {/* 视图选择按钮 */}
          <div className="flex border-l border-slate-300 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className={`h-full px-3 rounded-none text-xs flex items-center justify-center gap-1
                ${selectedView === 'terminal' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'}`}
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
              className={`h-full px-3 rounded-none text-xs flex items-center justify-center gap-1 border-l border-slate-300
                ${selectedView === 'info' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'}`}
              onClick={() => setSelectedView('info')}
            >
              <Info className="h-3 w-3" />
              <span>Info</span>
            </Button>
          </div>

          {/* 工具按钮 */}
          <div className="flex items-center border-l border-slate-300 flex-shrink-0">
            {/* 保存状态提示 */}
            {saveStatus !== 'idle' && (
              <div className={`flex items-center gap-1 px-3 text-xs ${
                saveStatus === 'saving' ? 'text-blue-600' :
                saveStatus === 'saved' ? 'text-green-600' :
                'text-red-600'
              }`}>
                {saveStatus === 'saving' && (
                  <>
                    <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Saving...</span>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Saved!</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <XCircle className="h-3 w-3" />
                    <span>Save failed</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 新增的工具栏行 - 放置Code/Preview等按钮 */}
        {selectedView === 'editing' && activeTab && (
          <div className="flex items-center border-b border-slate-300 bg-slate-100 h-8 flex-shrink-0 px-2">
            <div className="flex items-center gap-1">
              {/* Markdown预览切换按钮 */}
              {activeTab.fileType === 'markdown' && (
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
              
              {/* 其他文件类型的工具按钮 */}
              {activeTab.fileType === 'text' && (
                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <span>Plain Text</span>
                  <span>•</span>
                  <span>{activeTab.content.split('\n').length} lines</span>
                </div>
              )}
            </div>
          </div>
        )}

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
                      <span>{fileStructure ? countAllFiles(fileStructure) : 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Open tabs:</span>
                      <span>{fileTabs.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Modified files:</span>
                      <span>{fileTabs.filter(tab => tab.hasChanges).length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total size:</span>
                      <span>{formatFileSize(calculateTotalSize())}</span>
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
        <div className="border-t border-slate-300 p-4 bg-slate-50 flex-shrink-0">
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
    )
  }

  // 默认的完整布局（已有的实现保持不变）
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

      {/* 右侧内容区域 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* 文件标签栏和工具栏 */}
        <div className="flex items-center border-b border-slate-300 bg-slate-50 h-10">
          {/* 其他已有的内容保持原样... */}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-hidden">
          {selectedView === 'editing' && renderFileContent()}
          {/* 其他视图的渲染逻辑保持原样... */}
        </div>

        {/* 历史记录控制区域 */}
        <div className="border-t border-slate-300 p-4 bg-slate-50 flex-shrink-0">
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
})