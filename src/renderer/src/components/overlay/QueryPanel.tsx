import { useState, useRef, useEffect, useCallback } from 'react'
import { useOverlayStore, type Message } from '@renderer/stores/overlay-store'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Button } from '@renderer/components/ui/button'
import { Send, Trash2, Globe, Database, Paperclip, FileText, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function QueryPanel(): React.JSX.Element {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const {
    messages,
    currentModel,
    addMessage,
    clearMessages,
    webSearchEnabled,
    sourcethreadEnabled,
    toggleWebSearch,
    toggleSourcethread,
    resumeFilename,
    setResume,
    clearResume
  } = useOverlayStore()

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Listen for focus event from main process
  useEffect(() => {
    const cleanup = window.api.onFocusQueryInput(() => {
      inputRef.current?.focus()
    })
    return () => { cleanup() }
  }, [])

  // Load persisted resume on mount
  useEffect(() => {
    window.api.getResume().then((data) => {
      if (data) {
        setResume(data.text, data.filename)
      }
    })
  }, [])

  // Register stream listeners ONCE
  useEffect(() => {
    const cleanupChunk = window.api.onStreamChunk((data) => {
      useOverlayStore.getState().appendToMessage(data.id, data.text)
    })
    const cleanupDone = window.api.onStreamDone((data) => {
      useOverlayStore.getState().finishStreaming(data.id)
    })
    const cleanupError = window.api.onStreamError((data) => {
      useOverlayStore.getState().updateMessage(data.id, `Error: ${data.error}`)
      useOverlayStore.getState().finishStreaming(data.id)
    })
    return () => {
      cleanupChunk()
      cleanupDone()
      cleanupError()
    }
  }, [])

  async function handleUploadResume(): Promise<void> {
    const result = await window.api.uploadResume()
    if (result) {
      setResume(result.text, result.filename)
    }
  }

  async function handleClearResume(): Promise<void> {
    await window.api.clearResume()
    clearResume()
  }

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return

    const now = Date.now()
    const userMsg: Message = {
      id: `user-${now}`,
      role: 'user',
      content: text,
      timestamp: now
    }
    addMessage(userMsg)

    const assistantId = `assistant-${now}`
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: now,
      isStreaming: true
    }
    addMessage(assistantMsg)

    // Build system prompt with optional resume context
    const state = useOverlayStore.getState()
    let systemPrompt =
      'You are a meeting assistant. Be concise, direct, and actionable. Format answers for quick scanning during a live meeting. Use markdown for structure.'

    if (state.resumeText) {
      systemPrompt += `\n\nThe user's resume is loaded below. When answering interview questions or discussing experience, reference specific items from the resume — projects, skills, metrics, job titles, company names. Be specific, not generic. Help the user articulate their experience confidently.\n\n---\nRESUME:\n${state.resumeText}\n---`
    }

    const currentMessages = state.messages
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...currentMessages
        .filter((m) => !m.isStreaming)
        .filter((m) => m.id !== assistantId)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text }
    ]

    window.api.queryAI({
      requestId: assistantId,
      messages: apiMessages,
      model: currentModel
    })

    setInput('')
  }, [input, currentModel, addMessage])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-white/30 text-sm py-8 space-y-2">
              <p>Ask anything. Cmd+Shift+Q to quick focus.</p>
              {resumeFilename && (
                <p className="text-xs text-green-400/60">Resume loaded — AI will reference it</p>
              )}
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-sm ${msg.role === 'user' ? 'text-blue-300' : 'text-white/90'}`}
            >
              {msg.role === 'user' ? (
                <div className="bg-white/5 rounded-lg px-3 py-2">{msg.content}</div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_code]:text-blue-300 [&_code]:bg-white/5 [&_code]:px-1 [&_code]:rounded">
                  {msg.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  ) : msg.isStreaming ? (
                    <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse rounded-sm" />
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Toggles + Input */}
      <div className="border-t border-white/5 p-2 space-y-2">
        {/* Toggle row */}
        <div className="flex items-center gap-1 px-1 flex-wrap">
          <Button
            variant={webSearchEnabled ? 'default' : 'ghost'}
            size="sm"
            className="h-6 text-[10px] gap-1 px-2"
            onClick={toggleWebSearch}
          >
            <Globe className="h-3 w-3" />
            Web
          </Button>
          <Button
            variant={sourcethreadEnabled ? 'default' : 'ghost'}
            size="sm"
            className="h-6 text-[10px] gap-1 px-2"
            onClick={toggleSourcethread}
          >
            <Database className="h-3 w-3" />
            ST
          </Button>

          {/* Resume upload/badge */}
          {resumeFilename ? (
            <div className="flex items-center gap-0.5 bg-green-500/10 border border-green-500/20 rounded-md px-1.5 h-6">
              <FileText className="h-3 w-3 text-green-400" />
              <span className="text-[10px] text-green-300 max-w-[80px] truncate">
                {resumeFilename}
              </span>
              <button
                onClick={handleClearResume}
                className="ml-0.5 text-green-400/50 hover:text-red-400 transition-colors"
                title="Remove resume"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1 px-2"
              onClick={handleUploadResume}
              title="Upload resume (PDF)"
            >
              <Paperclip className="h-3 w-3" />
              Resume
            </Button>
          )}

          <div className="flex-1" />
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1 px-2 text-white/40 hover:text-red-400"
              onClick={clearMessages}
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>

        {/* Input */}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={resumeFilename ? 'Ask about your resume...' : 'Ask anything...'}
            rows={1}
            className="flex-1 resize-none rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[36px] max-h-[120px]"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim()}
            size="icon"
            className="h-9 w-9 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
