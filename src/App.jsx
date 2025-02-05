import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTheme } from 'next-themes'
import { Moon, Sun, Menu, X, Plus, Trash2, ArrowLeft, Download } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import './App.css'

function App() {
  // All hooks must be at the top level
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const didInit = useRef(false)
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('conversations')
    return saved ? JSON.parse(saved) : []
  })
  const [currentConversationId, setCurrentConversationId] = useState(() => {
    const saved = localStorage.getItem('currentConversationId')
    return saved ? JSON.parse(saved) : null
  })
  const [query, setQuery] = useState("")
  const [thinking, setThinking] = useState([])
  const [showThinking, setShowThinking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const isDesktop = window.innerWidth >= 1024 // lg breakpoint
  const [debugLogs, setDebugLogs] = useState([])

  // Handle mounting and initialization
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!didInit.current && conversations.length === 0) {
      handleNewChat()
      didInit.current = true
    }
  }, [conversations])

  useEffect(() => {
    localStorage.setItem('conversations', JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    localStorage.setItem('currentConversationId', JSON.stringify(currentConversationId))
    // Show sidebar on mobile when no conversation is selected
    if (!currentConversationId && !isDesktop) {
      setShowSidebar(true)
    }
  }, [currentConversationId])

  // Get current conversation
  const currentConversation = conversations.find(c => c.id === currentConversationId) || null

  // Event handlers
  const handleExitChat = () => {
    setCurrentConversationId(null)
    setQuery("")
    if (!isDesktop) {
      setShowSidebar(true)
    }
  }

  const handleDeleteChat = (chatId, e) => {
    e.stopPropagation()
    if (window.confirm('Are you sure you want to delete this question?')) {
      setConversations(prev => prev.filter(conv => conv.id !== chatId))
      if (currentConversationId === chatId) {
        const remainingChats = conversations.filter(conv => conv.id !== chatId)
        setCurrentConversationId(remainingChats.length > 0 ? remainingChats[0].id : null)
        if (remainingChats.length === 0) {
          handleNewChat()
        }
      }
    }
  }

  const handleNewChat = () => {
    const newConversation = {
      id: uuidv4(),
      messages: [],
      title: 'New Question',
      completed: false
    }
    setConversations(prev => [newConversation, ...prev])
    setCurrentConversationId(newConversation.id)
    setThinking([])
    setShowThinking(false)
  }

  function formatStepLabel(step) {
    if (!step) return "Progress update"
    if (typeof step.step === 'number') {
      return `Step ${step.step}:`
    }
    if (typeof step.step === 'string') {
      return `${step.step.charAt(0).toUpperCase() + step.step.slice(1)}:`
    }
    return "Progress update:"
  }

  function formatActionState(trackers) {
    if (!trackers?.actionState?.action) return ""
    return trackers.actionState.action
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!query.trim() || !currentConversationId) return

    const current = conversations.find(c => c.id === currentConversationId)
    if (current?.completed) {
      alert("This question has already been answered. Ask a new question.")
      return
    }

    const userMessage = { id: uuidv4(), type: 'user', text: query }
    
    setConversations(prev => prev.map(conv => {
      if (conv.id === currentConversationId) {
        return {
          ...conv,
          messages: [...conv.messages, userMessage],
          title: conv.title === 'New Question' ? query.slice(0, 30) + '...' : conv.title,
        }
      }
      return conv
    }))

    setQuery("")
    setThinking([])
    setShowThinking(false)
    setLoading(true)
    setDebugLogs([])

    try {
      const res = await fetch('http://localhost:3000/api/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: query,
          budget: 1000000,
          maxBadAttempt: 3
        })
      })
      const data = await res.json()
      
      const timestamp = new Date().toISOString()
      setDebugLogs(prev => [...prev, { 
        type: 'initial-response', 
        timestamp,
        data 
      }])

      if (data.requestId) {
        const eventSource = new EventSource(`http://localhost:3000/api/v1/stream/${data.requestId}`)
        
        eventSource.onmessage = (event) => {
          const timestamp = new Date().toISOString()
          let parsed
          
          try {
            parsed = JSON.parse(event.data)
          } catch (err) {
            console.error('Failed to parse SSE data:', err)
            setDebugLogs(prev => [...prev, {
              type: 'sse-parse-error',
              timestamp,
              error: err.toString(),
              rawData: event.data
            }])
            return
          }

          // Log all events for debugging
          setDebugLogs(prev => [...prev, { 
            type: 'sse-event', 
            timestamp,
            data: event.data,
            parsed 
          }])

          // Handle progress updates
          if (parsed.type === "progress" && parsed.step) {
            const progressStep = {
              ...parsed,
              timestamp,
              formattedStep: formatStepLabel(parsed),
              formattedAction: formatActionState(parsed.trackers)
            }
            setThinking(prev => [...prev, progressStep])
            return
          }
          
          // Handle final answer
          if (parsed.type === "final" && parsed.answer) {
            const references = Array.isArray(parsed.references) 
              ? parsed.references 
              : (typeof parsed.references === 'object' ? [parsed.references] : [])

            const finalBotMessage = {
              id: uuidv4(),
              type: 'bot',
              text: parsed.answer,
              references: references.map(ref => ({
                url: ref.url || '#',
                exactQuote: ref.exactQuote || ref.text || 'Reference'
              })),
              evaluation: parsed.evaluation,
              thoughts: parsed.thoughts,
              timestamp
            }
            
            setConversations(prev => prev.map(conv => {
              if (conv.id === currentConversationId) {
                return {
                  ...conv,
                  messages: [...conv.messages, finalBotMessage],
                  completed: true
                }
              }
              return conv
            }))
            
            // Clear thinking state and close connection
            setThinking([])
            eventSource.close()
            setLoading(false)

            // Add final state to debug logs
            setDebugLogs(prev => [...prev, {
              type: 'final-state',
              timestamp,
              thinking: [],
              finalMessage: finalBotMessage
            }])
            return
          }
          
          // Handle error
          if (parsed.type === "error") {
            const errorMessage = {
              id: uuidv4(),
              type: 'bot',
              text: `Error: ${parsed.message || 'Unknown error occurred'}`,
              timestamp
            }

            setConversations(prev => prev.map(conv => {
              if (conv.id === currentConversationId) {
                return {
                  ...conv,
                  messages: [...conv.messages, errorMessage],
                  completed: true
                }
              }
              return conv
            }))

            // Add error to debug logs
            setDebugLogs(prev => [...prev, {
              type: 'error-state',
              timestamp,
              error: parsed.message || 'Unknown error occurred'
            }])

            eventSource.close()
            setLoading(false)
          }
        }

        eventSource.onerror = (error) => {
          const timestamp = new Date().toISOString()
          setDebugLogs(prev => [...prev, { 
            type: 'sse-error', 
            timestamp,
            error: error.toString() 
          }])
          eventSource.close()
          setLoading(false)
        }
      }
    } catch (err) {
      const timestamp = new Date().toISOString()
      setDebugLogs(prev => [...prev, { 
        type: 'fetch-error', 
        timestamp,
        error: err.toString() 
      }])
      console.error("Error submitting query:", err)
      setLoading(false)
    }
  }

  const handleDownloadDebug = () => {
    const debugData = {
      timestamp: new Date().toISOString(),
      conversation: {
        ...currentConversation,
        currentState: {
          thinking,
          loading,
          completed: currentConversation?.completed
        }
      },
      debugLogs: debugLogs.map(log => ({
        ...log,
        parsed: log.type === 'sse-event' ? JSON.parse(log.data) : undefined
      }))
    }
    
    const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `debug-log-${currentConversation?.id ?? 'no-conversation'}-${new Date().toISOString().replace(/:/g, '_')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Don't render anything until mounted
  if (!mounted) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        {/* Sidebar - permanent on desktop, sheet on mobile */}
        {isDesktop ? (
          <div className="w-72 border-r bg-background flex flex-col">
            <div className="p-4">
              <h2 className="text-lg font-semibold">Questions</h2>
              <p className="text-sm text-muted-foreground">Your research questions and answers</p>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-2 p-4">
                <Button
                  variant="outline"
                  onClick={handleNewChat}
                  className="justify-start"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Question
                </Button>
                {conversations.map(conv => (
                  <div
                    key={conv.id}
                    className={`group flex items-center justify-between rounded-md p-2 text-sm ${
                      conv.id === currentConversationId
                        ? "bg-secondary"
                        : "hover:bg-secondary/50"
                    }`}
                  >
                    <button
                      onClick={() => setCurrentConversationId(conv.id)}
                      className="flex-1 truncate text-left"
                    >
                      {conv.title}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDeleteChat(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 h-8 w-8 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete question</span>
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Separator />
            <div className="p-4">
              <Button
                variant="outline"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full justify-center"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="mr-2 h-4 w-4" />
                    Light Mode
                  </>
                ) : (
                  <>
                    <Moon className="mr-2 h-4 w-4" />
                    Dark Mode
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
            <SheetContent side="left" className="w-72 p-0 flex flex-col">
              {/* Mobile sidebar content - same as desktop */}
              <SheetHeader className="p-4">
                <SheetTitle>Questions</SheetTitle>
                <SheetDescription>
                  Your research questions and answers
                </SheetDescription>
              </SheetHeader>
              <Separator />
              <ScrollArea className="flex-1">
                {/* Same content as desktop sidebar */}
                <div className="flex flex-col gap-2 p-4">
                  <Button
                    variant="outline"
                    onClick={handleNewChat}
                    className="justify-start"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Question
                  </Button>
                  {conversations.map(conv => (
                    <div
                      key={conv.id}
                      className={`group flex items-center justify-between rounded-md p-2 text-sm ${
                        conv.id === currentConversationId
                          ? "bg-secondary"
                          : "hover:bg-secondary/50"
                      }`}
                    >
                      <button
                        onClick={() => {
                          setCurrentConversationId(conv.id)
                          setShowSidebar(false)
                        }}
                        className="flex-1 truncate text-left"
                      >
                        {conv.title}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleDeleteChat(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 h-8 w-8 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete question</span>
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <Separator />
              <div className="p-4">
                <Button
                  variant="outline"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="w-full justify-center"
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="mr-2 h-4 w-4" />
                      Light Mode
                    </>
                  ) : (
                    <>
                      <Moon className="mr-2 h-4 w-4" />
                      Dark Mode
                    </>
                  )}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center justify-between p-4 bg-background">
            <div className="flex items-center gap-2">
              {!isDesktop && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSidebar(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              {currentConversationId && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExitChat}
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="sr-only">Back to questions</span>
                </Button>
              )}
              <h1 className="text-xl font-semibold">Deep Research</h1>
            </div>
            <div className="flex items-center gap-2">
              {debugLogs.length > 0 && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDownloadDebug}
                  title="Download debug logs"
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
              {!isDesktop && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                >
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </header>
          <Separator />

          <main className="flex-1 overflow-auto p-4">
            {!currentConversationId ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <h2 className="text-xl font-semibold mb-2">Welcome to Deep Research</h2>
                <p className="text-muted-foreground mb-4">Select a question from the sidebar or start a new one</p>
                <Button onClick={handleNewChat}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Question
                </Button>
              </div>
            ) : (
              <>
                {currentConversation?.messages.map((message) => (
                  <div key={message.id} className="mb-8">
                    {message.type === 'user' ? (
                      <div className="mb-4">
                        <h3 className="text-sm font-medium text-muted-foreground">Question:</h3>
                        <p className="mt-1 text-lg">{message.text}</p>
                      </div>
                    ) : (
                      <Card className="p-4">
                        <h3 className="text-sm font-medium text-muted-foreground">Answer:</h3>
                        <div className="prose prose-sm dark:prose-invert mt-2">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.text}
                          </ReactMarkdown>
                        </div>
                        {message.references?.length > 0 && (
                          <>
                            <Separator className="my-4" />
                            <h4 className="text-sm font-medium text-muted-foreground">References:</h4>
                            <ul className="mt-2 space-y-2">
                              {message.references.map((ref, idx) => (
                                <li key={idx}>
                                  <a
                                    href={ref.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-primary hover:underline"
                                  >
                                    {ref.exactQuote}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </Card>
                    )}
                  </div>
                ))}
                {loading && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                    {thinking.filter(Boolean).length > 0 && (
                      <div className="mt-4 space-y-2">
                        {thinking.filter(Boolean).map((step, idx) => (
                          <div key={idx} className="text-sm text-muted-foreground">
                            <span className="font-medium">{step.formattedStep}</span>{" "}
                            <span>{step.formattedAction}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </>
            )}
          </main>

          <Separator />
          <footer className="p-4">
            <form onSubmit={handleSubmit} className="flex gap-4">
              <Input
                type="text"
                placeholder={currentConversation?.completed ? "This question has been answered. Ask a new question." : "Ask a question..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loading || currentConversation?.completed || !currentConversationId}
              />
              <Button
                type="submit"
                disabled={loading || currentConversation?.completed || !currentConversationId}
              >
                Ask
              </Button>
            </form>
          </footer>
        </div>
      </div>
    </div>
  )
}

export default App
