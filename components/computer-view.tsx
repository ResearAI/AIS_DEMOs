"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Terminal, FileText, FolderTree, ChevronRight, ChevronDown, File, Folder, Info, X, Plus } from "lucide-react"
import { FileStructureNode } from "@/lib/api"

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
}

export function ComputerView({
  currentFile,
  fileContent,
  setFileContent,
  isLive = true,
  taskStatus = 'idle',
  terminalOutput = [],
  fileStructure = null
}: ComputerViewProps) {
  const [selectedTab, setSelectedTab] = useState<string>('files')
  const [fileTabs, setFileTabs] = useState<FileTab[]>([])
  const [activeFileId, setActiveFileId] = useState<string>('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['resear-pro-task']))
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map())

  // Initialize with current file
  useEffect(() => {
    if (currentFile && fileContent && !fileTabs.find(tab => tab.filename === currentFile)) {
      const newTab: FileTab = {
        id: `file-${Date.now()}`,
        filename: currentFile,
        content: fileContent,
        hasChanges: false
      }
      setFileTabs([newTab])
      setActiveFileId(newTab.id)
      setFileContents(new Map([[currentFile, fileContent]]))
    }
  }, [currentFile, fileContent, fileTabs])

  // Update file content when it changes from server
  useEffect(() => {
    if (currentFile && fileContent && isLive) {
      setFileContents(prev => new Map(prev).set(currentFile, fileContent))

      // Update tab content
      setFileTabs(prev => prev.map(tab =>
        tab.filename === currentFile
          ? { ...tab, content: fileContent, hasChanges: false }
          : tab
      ))
    }
  }, [currentFile, fileContent, isLive])

  // Auto-switch to terminal when there's output
  useEffect(() => {
    if (terminalOutput.length > 0 && terminalOutput.length <= 2 && selectedTab === 'files') {
      setSelectedTab('terminal')
    }
  }, [terminalOutput.length, selectedTab])

  const handleFileClick = (filename: string) => {
    // Check if file is already open
    const existingTab = fileTabs.find(tab => tab.filename === filename)
    if (existingTab) {
      setActiveFileId(existingTab.id)
      setSelectedTab('files')
      return
    }

    // Create new tab
    const content = fileContents.get(filename) || ''
    const newTab: FileTab = {
      id: `file-${Date.now()}`,
      filename,
      content,
      hasChanges: false
    }

    setFileTabs([...fileTabs, newTab])
    setActiveFileId(newTab.id)
    setSelectedTab('files')
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
            className="flex items-center gap-1 py-1 px-2 hover:bg-gray-100 cursor-pointer select-none text-sm"
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
          className={`flex items-center gap-1 py-1 px-2 hover:bg-gray-100 cursor-pointer text-sm ${
            isOpen ? 'bg-blue-50 text-blue-700' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 24}px` }}
          onClick={() => handleFileClick(node.name)}
        >
          <File className="h-4 w-4 text-gray-500" />
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

  const activeTab = fileTabs.find(tab => tab.id === activeFileId)

  return (
    <div className="h-full flex">
      {/* Left sidebar - File structure */}
      <div className="w-64 border-r border-gray-300 bg-gray-50">
        <div className="border-b border-gray-300 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            File Explorer
          </h3>
        </div>
        <div className="overflow-y-auto h-[calc(100%-3rem)] py-2">
          {fileStructure ? (
            renderFileTree(fileStructure)
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No files yet
            </div>
          )}
        </div>
      </div>

      {/* Right content area */}
      <div className="flex-1 flex flex-col">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full flex flex-col">
          <div className="border-b border-gray-300 bg-gray-50">
            <TabsList className="h-10 bg-transparent border-0 p-0">
              <TabsTrigger
                value="files"
                className="h-10 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white"
              >
                <FileText className="h-4 w-4 mr-2" />
                Files
              </TabsTrigger>
              <TabsTrigger
                value="terminal"
                className="h-10 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white relative"
              >
                <Terminal className="h-4 w-4 mr-2" />
                Terminal
                {terminalOutput.length > 0 && (
                  <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                    {Math.floor(terminalOutput.length / 2)}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="info"
                className="h-10 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white"
              >
                <Info className="h-4 w-4 mr-2" />
                Info
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Files content */}
          <TabsContent value="files" className="flex-1 p-0 overflow-hidden">
            {fileTabs.length > 0 ? (
              <div className="h-full flex flex-col">
                {/* File tabs */}
                <div className="flex bg-gray-100 border-b border-gray-300 overflow-x-auto">
                  {fileTabs.map(tab => (
                    <div
                      key={tab.id}
                      className={`flex items-center gap-2 px-3 py-2 border-r border-gray-300 cursor-pointer min-w-[120px] ${
                        activeFileId === tab.id ? 'bg-white' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveFileId(tab.id)}
                    >
                      <FileText className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                      <span className="text-sm truncate">{tab.filename}</span>
                      {tab.hasChanges && <span className="w-2 h-2 bg-orange-400 rounded-full flex-shrink-0" />}
                      <button
                        onClick={(e) => handleCloseTab(tab.id, e)}
                        className="ml-auto p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* File content */}
                {activeTab && (
                  <div className="flex-1 p-4 overflow-hidden">
                    <textarea
                      value={activeTab.content}
                      onChange={(e) => handleFileContentChange(activeTab.id, e.target.value)}
                      className="w-full h-full outline-none resize-none text-sm font-mono text-gray-800 placeholder:text-gray-400"
                      placeholder="Empty file"
                      readOnly={!isLive && taskStatus !== 'completed'}
                      style={{ lineHeight: '1.6' }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No files open</p>
                  <p className="text-xs mt-1">Select a file from the explorer</p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Terminal content */}
          <TabsContent value="terminal" className="flex-1 p-0 overflow-hidden bg-gray-900">
            <div className="h-full overflow-y-auto p-4 font-mono text-sm">
              {terminalOutput.length > 0 ? (
                terminalOutput.map((line, i) => (
                  <div
                    key={i}
                    className={`mb-1 ${
                      line.startsWith('$') ? 'text-green-400 font-bold' : 'text-gray-300'
                    }`}
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                  >
                    {line}
                  </div>
                ))
              ) : (
                <div className="text-gray-500 text-center py-8">
                  Waiting for terminal output...
                </div>
              )}
            </div>
          </TabsContent>

          {/* Info page */}
          <TabsContent value="info" className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Task Status</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className={`inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full ${
                    taskStatus === 'completed' ? 'bg-green-100 text-green-800' :
                    taskStatus === 'failed' ? 'bg-red-100 text-red-800' :
                    taskStatus === 'started' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-200 text-gray-800'
                  }`}>
                    {taskStatus === 'completed' ? '✓ Completed' :
                     taskStatus === 'failed' ? '✗ Failed' :
                     taskStatus === 'started' ? '● Running' : '○ Waiting'}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3">File Statistics</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Open files:</span>
                    <span>{fileTabs.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total files:</span>
                    <span>{fileContents.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Modified files:</span>
                    <span>{fileTabs.filter(tab => tab.hasChanges).length}</span>
                  </div>
                </div>
              </div>

              {activeTab && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Current File</h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Name:</span>
                      <span className="font-mono">{activeTab.filename}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Size:</span>
                      <span>{formatFileSize(new Blob([activeTab.content]).size)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Lines:</span>
                      <span>{activeTab.content.split('\n').length}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}