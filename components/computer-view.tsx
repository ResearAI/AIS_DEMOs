"use client"

import { useState, useEffect, useCallback, useRef } from "react" // Removed useMemo, Added useRef
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent } from "@/components/ui/tabs" // TabsList and TabsTrigger will be removed
import { Slider } from "@/components/ui/slider"
import { Terminal, FileText, FolderTree, ChevronRight, ChevronDown, File, Folder, Info, X, Plus, ArrowLeft, ArrowRight, Save, RotateCcw, Eye, EyeOff } from "lucide-react" // Removed MessageCircle
import { FileStructureNode } from "@/lib/api"
import { marked } from 'marked'
import Prism from 'prismjs';
// Add specific language imports if not all are bundled by default or for tree shaking
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
// Choose a Prism theme. Ensure this is handled by the build process.
import 'prismjs/themes/prism-coy.css'; // Changed to a light theme

interface FileTab {
  id: string
  filename: string
  content: string
  hasChanges: boolean
}

interface ComputerViewProps {
  currentFile: string
  fileContent: string
  setFileContent: (content: string) => void
  isLive?: boolean
  taskStatus?: string
  terminalOutput?: string[]
  fileStructure?: FileStructureNode | null
  // dialogMessages prop removed
  isViewingHistory?: boolean;
  historyLength?: number;
  currentHistoryIndexValue?: number;
  onHistoryChange?: (newIndex: number) => void;
}

export function ComputerView({
  currentFile,
  fileContent,
  setFileContent,
  isLive = true,
  taskStatus = 'idle',
  terminalOutput = [],
  fileStructure = null,
  // dialogMessages prop removed from destructuring
  isViewingHistory = false,
  historyLength = 0,
  currentHistoryIndexValue = -1,
  onHistoryChange
}: ComputerViewProps) {
  const [selectedView, setSelectedView] = useState<string>('editing') // 'editing', 'terminal', 'info' - 'chat' removed
  const [fileTabs, setFileTabs] = useState<FileTab[]>([])
  const [activeFileId, setActiveFileId] = useState<string>('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['resear-pro-task']))
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map()) // Live content cache, might be redundant if fileTabs holds all content
  const [originalFileContents, setOriginalFileContents] = useState<Map<string, string>>(new Map())
  const [sliderValue, setSliderValue] = useState([50])
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const terminalDisplayRef = useRef<HTMLDivElement>(null);
  // chatDisplayRef removed

  const [terminalInputValue, setTerminalInputValue] = useState('');
  const [displayedTerminalOutput, setDisplayedTerminalOutput] = useState<string[]>([]);

  // Initialize with current file
  useEffect(() => {
    console.log('[ComputerView] Mount/Prop Effect (currentFile, fileContent, fileTabs):', 
      'currentFile:', currentFile, 
      'fileContent length:', fileContent?.length,
      'isViewingHistory:', isViewingHistory
    );
    if (currentFile && fileContent !== undefined && fileContent !== null && !fileTabs.find(tab => tab.filename === currentFile) && !isViewingHistory) { // Allow empty string for fileContent
      console.log('[ComputerView] Initializing new tab for currentFile:', currentFile, 'with content length:', fileContent.length);
      const newTab: FileTab = {
        id: `file-${Date.now()}`,
        filename: currentFile,
        content: fileContent,
        hasChanges: false
      }
      setFileTabs(prev => [...prev, newTab])
      setActiveFileId(newTab.id)
      setSelectedView('editing') // Ensure view is set to editing
      setFileContents(prev => {
        const newMap = new Map(prev).set(currentFile, fileContent);
        console.log('[ComputerView] Mount/Prop Effect - fileContents updated:', newMap);
        return newMap;
      });
      // If it's a new tab being auto-opened, store its initial content as original
      // The outer if already ensures !fileTabs.find(tab => tab.filename === currentFile)
      setOriginalFileContents(prev => {
        const newMap = new Map(prev).set(currentFile, fileContent);
        console.log('[ComputerView] Mount/Prop Effect - originalFileContents updated:', newMap);
        return newMap;
      });
    }
  }, [currentFile, fileContent, fileTabs, isViewingHistory]) // Added isViewingHistory

  // Update file content when it changes from server OR when fileContent prop changes while isLive
  useEffect(() => {
    console.log('[ComputerView] Live Update Effect (currentFile, fileContent, isLive):',
      'currentFile:', currentFile,
      'fileContent length:', fileContent?.length,
      'isLive:', isLive,
      'isViewingHistory:', isViewingHistory
    );
    if (currentFile && fileContent !== undefined && fileContent !== null && isLive && !isViewingHistory) { // Allow empty string for fileContent, only apply if live and not viewing history
      console.log('[ComputerView] Live Update - Applying server content for:', currentFile, 'with content length:', fileContent.length);
      // Update the live content cache
      setFileContents(prev => {
        const newMap = new Map(prev).set(currentFile, fileContent);
        console.log('[ComputerView] Live Update - fileContents updated:', newMap);
        return newMap;
      });

      // Server push becomes the new "original" baseline for this file
      setOriginalFileContents(prevOrig => {
        const newMap = new Map(prevOrig).set(currentFile, fileContent);
        console.log('[ComputerView] Live Update - originalFileContents updated:', newMap);
        return newMap;
      });
      
      // Update tab content and reset hasChanges as server content is now the baseline
      setFileTabs(prev => prev.map(tab =>
        tab.filename === currentFile
          ? { ...tab, content: fileContent, hasChanges: false } // Server push resets changes
          : tab
      ));
    }
  }, [currentFile, fileContent, isLive]); // Removed originalFileContents dependency

  // Auto-switch to terminal when there's output
  useEffect(() => {
    if (terminalOutput.length > 0 && terminalOutput.length <= 2 && selectedView === 'editing') {
      setSelectedView('terminal')
    }
  }, [terminalOutput.length, selectedView])

  // Effect to update displayedTerminalOutput when terminalOutput prop changes
  useEffect(() => {
    setDisplayedTerminalOutput(terminalOutput || []);
  }, [terminalOutput]);

  // Effect for auto-scrolling terminal
  useEffect(() => {
    if (selectedView === 'terminal' && terminalDisplayRef.current) {
      terminalDisplayRef.current.scrollTop = terminalDisplayRef.current.scrollHeight;
    }
  }, [displayedTerminalOutput, selectedView]);

  // Effect for auto-scrolling chat - REMOVED

  // Effect for auto-focusing terminal input
  useEffect(() => {
    if (selectedView === 'terminal' && terminalInputRef.current) {
      terminalInputRef.current.focus();
    }
  }, [selectedView]);

  const handleTerminalInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTerminalInputValue(e.target.value);
  };

  const handleTerminalInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && terminalInputValue.trim() !== '') {
      e.preventDefault();
      const commandToDisplay = `> ${terminalInputValue}`;
      setDisplayedTerminalOutput(prevOutput => [...prevOutput, commandToDisplay]);
      // TODO: Send command to backend: terminalInputValue
      console.log(`Terminal command submitted: ${terminalInputValue}`);
      setTerminalInputValue('');
    }
  };

  const handleFileClick = (filename: string) => {
    console.log('[ComputerView] handleFileClick - filename:', filename);
    // Check if file is already open
    const existingTab = fileTabs.find(tab => tab.filename === filename)
    if (existingTab) {
      console.log('[ComputerView] handleFileClick - Tab already open:', existingTab.id);
      setActiveFileId(existingTab.id)
      setSelectedView('editing')
      return
    }

    // Create new tab
    const contentFromCache = fileContents.get(filename);
    console.log('[ComputerView] handleFileClick - Content from fileContents cache for', filename, 'length:', contentFromCache?.length);
    const content = contentFromCache || '' // Use cached content or empty string

    const newTab: FileTab = {
      id: `file-${Date.now()}`,
      filename,
      content, // Use content from cache
      hasChanges: false // New tab shouldn't have changes initially based on cache
    }
    console.log('[ComputerView] handleFileClick - New tab created:', newTab);

    setFileTabs(prevTabs => [...prevTabs, newTab]);
    setActiveFileId(newTab.id)
    setSelectedView('editing')
    // Store initial content as original when user clicks to open a file
    setOriginalFileContents(prev => new Map(prev).set(filename, content));
  }

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const tabIndex = fileTabs.findIndex(tab => tab.id === tabId)
    const newTabs = fileTabs.filter(tab => tab.id !== tabId)
    setFileTabs(newTabs)

    // Select adjacent tab if closing active tab
    if (activeFileId === tabId && newTabs.length > 0) {
      const newIndex = Math.min(tabIndex, newTabs.length - 1)
      setActiveFileId(newTabs[newIndex].id)
      setSelectedView('editing') // Ensure view remains or switches to editing
    } else if (newTabs.length === 0) {
      // If all tabs are closed, perhaps switch to a default view or clear activeFileId
      // For now, let's assume it stays on 'editing' but with no file selected
      // Or, switch to 'info' or another default view.
      // setSelectedView('info'); // Example: switch to info if no files open
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
      console.log(`File ${activeTab.filename} saved.`);
    }
  }, [activeTab, setOriginalFileContents, setFileTabs]);

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
  }, [activeTab, originalFileContents, setFileTabs, setFileContents]);

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
  }, [selectedView, activeTab, originalFileContents, handleSave, handleRevert]); // Comment moved or removed

  // Keyboard Shortcuts
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const renderEditorContent = () => {
    if (selectedView === 'editing' && activeTab && activeTab.filename.endsWith('.md') && showMarkdownPreview) {
      return (
        <div className="flex h-full">
          <div className="w-1/2 h-full border-r border-slate-300">
            <textarea
              value={activeTab.content}
              onChange={(e) => handleFileContentChange(activeTab.id, e.target.value)}
              className="w-full h-full outline-none resize-none text-sm font-mono text-slate-800 placeholder:text-slate-500 p-4 bg-white"
              placeholder="Enter Markdown..."
              readOnly={isViewingHistory || (!isLive && taskStatus !== 'completed')}
              style={{ lineHeight: '1.6' }}
            />
          </div>
          <div 
            className="w-1/2 h-full p-4 overflow-y-auto prose prose-sm lg:prose-base bg-white"
            dangerouslySetInnerHTML={{ __html: marked.parse(activeTab.content || '') }} 
          />
        </div>
      );
    }

    if (selectedView === 'editing' && activeTab && (!activeTab.filename.endsWith('.md') || !showMarkdownPreview)) {
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
        <div className="h-full flex flex-col relative"> {/* This container might not need to be flex flex-col if its child is the scroller */}
          {isCodeFile ? (
            // Container A: This will be the scrollable container
            <div 
              ref={scrollContainerRef}
              className="flex-1 p-0 overflow-y-auto relative bg-white" // Changed bg-slate-800 to bg-white
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
                className="w-full h-full outline-none resize-none text-sm font-mono text-transparent bg-transparent caret-slate-700 p-4 absolute inset-0 z-10 overflow-hidden" // Changed caret-white to caret-slate-700
                placeholder="Enter code..."
                readOnly={isViewingHistory || (!isLive && taskStatus !== 'completed')}
                style={{ lineHeight: '1.6' }}
                spellCheck="false"
              />
              <pre 
                ref={preRef}
                className="w-full outline-none resize-none text-sm font-mono p-4 z-0 bg-transparent" // Added bg-transparent
                style={{ lineHeight: '1.6', margin: 0 }} 
                aria-hidden="true"
              >
                <code dangerouslySetInnerHTML={{ __html: highlightedContent }} />
              </pre>
            </div>
          ) : (
            // Plain text editor
            <div className="flex-1 p-4 overflow-hidden"> 
              <textarea
                value={activeTab.content}
                onChange={(e) => handleFileContentChange(activeTab.id, e.target.value)}
                className="w-full h-full outline-none resize-none text-sm font-mono text-slate-800 placeholder:text-slate-500 bg-white"
                placeholder="Empty file"
                readOnly={isViewingHistory || (!isLive && taskStatus !== 'completed')}
                style={{ lineHeight: '1.6' }}
              />
            </div>
          )}
        </div>
      );
    }

    if (selectedView === 'editing' && !activeTab) {
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
    return null; // Default case for renderEditorContent
  }; // Explicitly terminate the const assignment

  return (
    <div className="h-full flex">
      {/* Left sidebar - File structure */}
      <div className="w-64 border-r border-slate-300 bg-slate-50">
        <div className="border-b border-slate-300 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            File Explorer
          </h3>
        </div>
        <div className="overflow-y-auto h-[calc(100%-3rem)] py-2">
          {fileStructure ? (
            renderFileTree(fileStructure)
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No files yet
            </div>
          )}
        </div>
      </div>

      {/* Right content area */}
      <div className="flex-1 flex flex-col overflow-hidden"> {/* Added overflow-hidden here for safety */}
        {/* Unified Top Bar */}
        <div className="flex items-center border-b border-slate-300 bg-slate-50 h-10 pr-2">
          {/* Scrollable File Tabs */}
          <div className="flex-shrink-0 flex overflow-x-auto h-full">
            {fileTabs.map(tab => (
              <div
                key={tab.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveFileId(tab.id)
                  setSelectedView('editing')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveFileId(tab.id);
                    setSelectedView('editing');
                  }
                }}
                className={`flex items-center gap-2 px-3 h-full text-sm cursor-pointer min-w-[120px] border-r border-slate-300
                  ${activeFileId === tab.id && selectedView === 'editing' 
                    ? 'bg-white text-slate-900' // Active file tab style
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800' // Inactive file tab style
                  }`}
              >
                <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{tab.filename}</span>
                {tab.hasChanges && <span className="w-2 h-2 bg-orange-400 rounded-full flex-shrink-0" />}
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="ml-auto p-0.5 hover:bg-slate-300 rounded flex-shrink-0"
                  aria-label={`Close tab ${tab.filename}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Terminal and Info View Selectors */}
          <Button
            variant="ghost"
            size="sm"
            className={`h-full px-3 rounded-none text-sm flex items-center gap-1 ml-1
              ${selectedView === 'terminal' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'}`}
            onClick={() => setSelectedView('terminal')}
          >
            <Terminal className="h-4 w-4" />
            Terminal
            {terminalOutput.length > 0 && (
              <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                {Math.floor(terminalOutput.length / 2)}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-full px-3 rounded-none text-sm flex items-center gap-1
              ${selectedView === 'info' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'}`}
            onClick={() => setSelectedView('info')}
          >
            <Info className="h-4 w-4" />
            Info
          </Button>
          {/* "Chat" Button Removed */}

          {/* Spacer */}
          <div className="flex-grow"></div>

          {/* Save and Revert Buttons */}
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-2 border-slate-300 hover:bg-slate-200 text-slate-700 flex items-center gap-1" 
            onClick={handleSave}
            disabled={!(activeTab && activeTab.hasChanges)}
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-2 border-slate-300 hover:bg-slate-200 text-slate-700 flex items-center gap-1" 
            onClick={handleRevert}
            disabled={isViewingHistory || !(activeTab && activeTab.hasChanges)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </Button>

          {activeTab && activeTab.filename.endsWith('.md') && (
            <Button
              variant="outline"
              size="sm"
              className="ml-2 border-slate-300 hover:bg-slate-200 text-slate-700 flex items-center gap-1"
              onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
            >
              {showMarkdownPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showMarkdownPreview ? 'Hide Preview' : 'Show Preview'}
            </Button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {selectedView === 'editing' && renderEditorContent()}

          {selectedView === 'terminal' && (
            <div className="h-full flex flex-col bg-slate-900">
              <div 
                ref={terminalDisplayRef}
                className="flex-1 overflow-y-auto p-4 font-mono text-sm"
              >
                {displayedTerminalOutput.length > 0 ? (
                  displayedTerminalOutput.map((line, i) => (
                    <div
                      key={i}
                      className={`mb-1 ${
                        line.startsWith('$') ? 'text-green-400 font-bold' : 
                        line.startsWith('>') ? 'text-sky-400' : 'text-slate-300' // User commands in sky blue
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
            <div className="p-4 overflow-y-auto">
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

                {activeTab && selectedView === 'editing' && ( 
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">Current File {activeTab.hasChanges ? <span className="text-orange-500 font-normal">(Unsaved)</span> : ''}</h3>
                    <div className="bg-slate-100 rounded-lg p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Name:</span>
                        <span className="font-mono">{activeTab.filename}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Size:</span>
                        <span>{formatFileSize(new Blob([activeTab.content]).size)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Lines:</span>
                        <span>{activeTab.content.split('\n').length}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chat View Rendering Removed */}
        </div>
        
        {/* Dashboard Operations Area (remains at the bottom of the right panel) */}
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