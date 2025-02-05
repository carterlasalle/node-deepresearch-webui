import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTheme } from 'next-themes'
import { Moon, Sun, Menu, X, Plus, Trash2, ArrowLeft } from 'lucide-react'
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
  const [debugLogs, setDebugLogs] = useState([])
  const [showSidebar, setShowSidebar] = useState(true)

  // All useEffect hooks must be at the top level
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    localStorage.setItem('conversations', JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    localStorage.setItem('currentConversationId', JSON.stringify(currentConversationId))
  }, [currentConversationId])

  useEffect(() => {
    if (conversations.length === 0) {
      handleNewChat()
    }
  }, [])

  // Get current conversation
  const currentConversation = conversations.find(c => c.id === currentConversationId) || null

  // Event handlers
  const handleExitChat = () => {
    setCurrentConversationId(null)
    setQuery("")
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
      id: Date.now(),
      messages: [],
      title: 'New Question',
      completed: false
    }
    setConversations(prev => [newConversation, ...prev])
    setCurrentConversationId(newConversation.id)
    setThinking([])
    setShowThinking(false)
    setDebugLogs([])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!query.trim() || !currentConversationId) return

    // Check if the current conversation is already completed
    const current = conversations.find(c => c.id === currentConversationId)
    if (current?.completed) {
      alert("This question has already been answered. Ask a new question.")
      return
    }

    const userMessage = { id: Date.now(), type: 'user', text: query }
    
    setConversations(prev => prev.map(conv => {
      if (conv.id === currentConversationId) {
        return {
          ...conv,
          messages: [...conv.messages, userMessage],
          title: conv.title === 'New Question' ? query.slice(0, 30) + '...' : conv.title,
          completed: true
        }
      }
      return conv
    }))

    setQuery("")

    const enhancedQuery = [
      query,
      "Please provide a detailed response with the following requirements:",
      "- Include relevant references and citations",
      "- Provide source links where applicable",
      "- Format the response in markdown",
      "- Give comprehensive explanations and examples",
      "- Include any relevant code snippets or APIs"
    ].join(" ")

    const payload = {
      q: enhancedQuery,
      budget: 1000000,
      maxBadAttempt: 3
    }

    setThinking([])
    setShowThinking(false)
    setDebugLogs([])
    setLoading(true)

    try {
      const res = await fetch('http://localhost:3000/api/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (data.requestId) {
        const eventSource = new EventSource(`http://localhost:3000/api/v1/stream/${data.requestId}`)
        
        eventSource.onmessage = (event) => {
          const parsed = JSON.parse(event.data)
          
          if (parsed.type === "progress") {
            setThinking(prev => [...prev, parsed])
            if (parsed.answer && (parsed.references || parsed.evaluation)) {
              const finalBotMessage = {
                id: Date.now(),
                type: 'bot',
                text: parsed.answer,
                references: parsed.references,
                evaluation: parsed.evaluation,
                thoughts: parsed.thoughts,
              }
              setConversations(prev => prev.map(conv => {
                if (conv.id === currentConversationId) {
                  return {
                    ...conv,
                    messages: [...conv.messages, finalBotMessage]
                  }
                }
                return conv
              }))
              eventSource.close()
              setLoading(false)
            }
          }
        }

        eventSource.onerror = () => {
          eventSource.close()
          setLoading(false)
        }
      }
    } catch (err) {
      console.error("Error submitting query:", err)
      setLoading(false)
    }
  }

  // Don't render anything until mounted
  if (!mounted) {
    return null
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <SheetHeader className="p-4">
              <SheetTitle>Questions</SheetTitle>
              <SheetDescription>
                Your research questions and answers
              </SheetDescription>
            </SheetHeader>
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
            <div className="p-4 mt-auto">
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

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center justify-between p-4 bg-background">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSidebar(true)}
                className="lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
              {currentConversationId && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExitChat}
                  className="flex lg:hidden"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="sr-only">Back to questions</span>
                </Button>
              )}
              <h1 className="text-xl font-semibold">Deep Research</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </header>
          <Separator />

          <main className="flex-1 overflow-auto p-4">
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
                {thinking.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {thinking.map((step, idx) => (
                      <div key={idx} className="text-sm text-muted-foreground">
                        <span className="font-medium">Step {step.step}:</span>{" "}
                        <span>{step.trackers?.actionState?.action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
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
                disabled={loading || currentConversation?.completed}
              />
              <Button
                type="submit"
                disabled={loading || currentConversation?.completed}
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
