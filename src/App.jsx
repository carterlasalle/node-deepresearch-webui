import React, { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [query, setQuery] = useState("")
  const [conversation, setConversation] = useState([])
  const [currentMessage, setCurrentMessage] = useState(null)
  const [thinking, setThinking] = useState([])
  const [showThinking, setShowThinking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [debugLogs, setDebugLogs] = useState([]) // Raw responses for debugging

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    // Add user's query to conversation history.
    const userMessage = { id: Date.now(), type: 'user', text: query }
    setConversation((prev) => [...prev, userMessage])
    setQuery("")

    const payload = {
      q: query,
      budget: 1000000,
      maxBadAttempt: 3
    }

    // Reset previous thinking details and debugging logs; create a placeholder for the bot.
    setThinking([])
    setShowThinking(false)
    setDebugLogs([])
    const botMessage = { id: Date.now() + 1, type: 'bot', text: "" }
    setCurrentMessage(botMessage)
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
          // Log raw response for debugging
          console.log("Raw SSE response:", event.data)
          setDebugLogs((prev) => [...prev, event.data])
          
          let parsed
          try {
            parsed = JSON.parse(event.data)
          } catch (err) {
            console.error("Error parsing SSE data:", err)
            return
          }

          // Handle "progress" events
          if (parsed.type === "progress") {
            setThinking((prev) => [...prev, parsed])
            // Check if this progress event contains final answer details.
            if (parsed.answer && (parsed.references || parsed.evaluation)) {
              setCurrentMessage({
                id: Date.now(),
                type: 'bot',
                text: parsed.answer,
                references: parsed.references,
                evaluation: parsed.evaluation,
                thoughts: parsed.thoughts,
              })
              eventSource.close()
              setLoading(false)
            }
          } 
          // Handle the final answer event sent as type "answer"
          else if (parsed.type === "answer") {
            // In this event, the answer data is inside the "data" field.
            const finalData = parsed.data
            setCurrentMessage({
              id: Date.now(),
              type: 'bot',
              text: finalData.answer,
              references: finalData.references,
              evaluation: finalData.evaluation,
              thoughts: finalData.thoughts,
            })
            eventSource.close()
            setLoading(false)
          } 
          // Handle events of type "final" if ever used.
          else if (parsed.type === "final") {
            setCurrentMessage({
              id: Date.now(),
              type: 'bot',
              text: parsed.answer,
              references: parsed.references,
              evaluation: parsed.evaluation,
              thoughts: parsed.thoughts,
            })
            eventSource.close()
            setLoading(false)
          } 
          // Handle error events.
          else if (parsed.type === "error") {
            setCurrentMessage({
              id: Date.now(),
              type: 'bot',
              text: "Error: " + parsed.message,
            })
            eventSource.close()
            setLoading(false)
          }
        }

        eventSource.onerror = (err) => {
          console.error("EventSource error:", err)
          eventSource.close()
          setLoading(false)
        }
      }
    } catch (err) {
      console.error("Error submitting query", err)
      setCurrentMessage({
        id: Date.now(),
        type: 'bot',
        text: "An error occurred. Please try again."
      })
      setLoading(false)
    }
  }

  // Once the bot's answer is ready, add it to the conversation.
  useEffect(() => {
    if (!loading && currentMessage && currentMessage.text !== "") {
      setConversation((prev) => [...prev, currentMessage])
      setCurrentMessage(null)
    }
  }, [loading, currentMessage])

  // Function to download the raw debug logs as a file.
  const downloadDebugLog = () => {
    const blob = new Blob([debugLogs.join("\n\n")], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'debug_log.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Render a message depending on its type.
  const renderMessage = (message) => {
    if (message.type === 'bot') {
      return (
        <div className="chat-bubble bot">
          <div className="answer-text">{message.text}</div>
          {message.references && message.references.length > 0 && (
            <div className="references">
              <h4>References:</h4>
              <ul>
                {message.references.map((ref, idx) => (
                  <li key={idx}>
                    <a href={ref.url} target="_blank" rel="noopener noreferrer">
                      {ref.exactQuote}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {message.evaluation && (
            <div className="evaluation">
              <strong>Evaluation:</strong>
              <p>{message.evaluation.reason}</p>
              <p>{message.evaluation.definitive ? "Definitive" : "Not definitive"}</p>
            </div>
          )}
        </div>
      )
    } else if (message.type === 'user') {
      return (
        <div className="chat-bubble user">
          {message.text}
        </div>
      )
    }
  }

  return (
    <div className="chat-container">
      <div className="chat-history">
        {conversation.map((message) => (
          <div key={message.id}>
            {renderMessage(message)}
          </div>
        ))}
        {currentMessage && (
          <div className="chat-bubble bot">
            {loading ? (
              <>
                <div className="answer-text">Thinking...</div>
                <div
                  className="thinking-toggle"
                  onClick={() => setShowThinking(!showThinking)}
                >
                  {showThinking ? "Hide Details" : "Show Details"}
                </div>
                {showThinking && thinking.length > 0 && (
                  <div className="thinking-details">
                    {thinking.map((step, idx) => (
                      <div key={idx} className="thinking-step">
                        <span className="step-number">Step {step.step}:</span>{" "}
                        <span className="step-action">
                          {step.trackers?.actionState?.action}
                        </span>{" "}
                        <span className="step-thoughts">
                          {step.trackers?.actionState?.thoughts}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              renderMessage(currentMessage)
            )}
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="chat-input-area">
        <input
          type="text"
          className="chat-input"
          placeholder="Enter your question..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="send-button" disabled={loading}>
          Send
        </button>
      </form>
      {/* Debug section: Download raw debug logs */}
      {debugLogs.length > 0 && (
        <div className="debug-section">
          <button onClick={downloadDebugLog} className="download-debug-button">
            Download Debug Log
          </button>
        </div>
      )}
    </div>
  )
}

export default App
