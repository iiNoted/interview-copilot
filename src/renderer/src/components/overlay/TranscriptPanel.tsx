import { useOverlayStore, type TextHighlight, type SpawnedChat } from '@renderer/stores/overlay-store'
import { useT } from '@renderer/i18n/context'
import { sanitizePromptText } from '@renderer/lib/prompt-utils'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Mic, MicOff, AlertCircle, Trash2, CheckCircle2, X, Save } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'

interface AudioSetupStatus {
  platform: string
  ready: boolean
  currentOutput: string
  hasLoopback: boolean
  instructions: string | null
}

function renderHighlightedText(
  text: string,
  highlights: TextHighlight[],
  onHighlightClick?: (chatId: string) => void,
  chatMap?: Map<string, string>
): React.ReactNode {
  if (highlights.length === 0) return text
  const sorted = [...highlights].sort((a, b) => a.startOffset - b.startOffset)
  const parts: React.ReactNode[] = []
  let cursor = 0

  for (const hl of sorted) {
    const start = Math.max(hl.startOffset, cursor)
    const end = Math.min(hl.endOffset, text.length)
    if (start > cursor) {
      parts.push(text.slice(cursor, start))
    }
    if (start < end) {
      const key = `${hl.transcriptIndex}-${hl.startOffset}`
      const chatId = chatMap?.get(key)
      parts.push(
        <span
          key={key}
          className="bg-purple-500/30 text-purple-200 rounded-sm px-0.5 cursor-pointer hover:bg-purple-500/50 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            if (chatId && onHighlightClick) onHighlightClick(chatId)
          }}
        >
          {text.slice(start, end)}
        </span>
      )
    }
    cursor = end
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }
  return <>{parts}</>
}

function EditableTranscriptLine({
  text,
  index,
  isSystem,
  highlights,
  onTextSelected,
  onHighlightClick,
  chatMap
}: {
  text: string
  index: number
  isSystem: boolean
  highlights: TextHighlight[]
  onTextSelected: (h: TextHighlight) => void
  onHighlightClick?: (chatId: string) => void
  chatMap?: Map<string, string>
}): React.JSX.Element {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(text)
  const inputRef = useRef<HTMLInputElement>(null)
  const lineRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    if (!editing) setValue(text)
  }, [text, editing])

  const save = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== text) {
      useOverlayStore.getState().updateTranscriptLine(index, trimmed)
    }
    setEditing(false)
  }, [value, text, index])

  const remove = useCallback(() => {
    useOverlayStore.getState().deleteTranscriptLine(index)
  }, [index])

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return

    const selectedText = selection.toString().trim()
    if (selectedText.length < 2) return

    // Make sure selection is within this line
    if (!lineRef.current) return
    const range = selection.getRangeAt(0)
    if (!lineRef.current.contains(range.startContainer) || !lineRef.current.contains(range.endContainer)) return

    // Find offset in the line text
    const startOffset = text.indexOf(selectedText)
    if (startOffset === -1) return

    onTextSelected({
      transcriptIndex: index,
      startOffset,
      endOffset: startOffset + selectedText.length,
      text: selectedText
    })

    selection.removeAllRanges()
  }, [text, index, onTextSelected])

  if (isSystem) {
    return <p className="text-xs text-white/30 leading-relaxed">{text}</p>
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 group">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setValue(text)
              setEditing(false)
            }
          }}
          className="flex-1 bg-blue-500/10 border border-blue-500/30 rounded px-2 py-0.5 text-sm text-white/90 outline-none focus:ring-1 focus:ring-blue-500/50"
        />
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            remove()
          }}
          className="shrink-0 p-0.5 text-red-400/60 hover:text-red-400 transition-colors"
          title="Delete line"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <p
      ref={lineRef}
      onMouseUp={handleMouseUp}
      onDoubleClick={() => setEditing(true)}
      className="text-sm text-white/80 leading-relaxed cursor-text rounded px-1 -mx-1 hover:bg-white/5 transition-colors select-text"
      title={t('transcript.select_hint')}
    >
      {renderHighlightedText(text, highlights, onHighlightClick, chatMap)}
    </p>
  )
}

export function TranscriptPanel(): React.JSX.Element {
  const { t } = useT()
  const { transcript, isTranscribing, setTranscribing, addTranscriptLine, selectedAudioDeviceId, spawnedChats } = useOverlayStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [audioStatus, setAudioStatus] = useState<AudioSetupStatus | null>(null)
  const [saved, setSaved] = useState(false)

  // Derive highlights per line from spawnedChats
  const highlightsByLine = useMemo(() => {
    const map = new Map<number, TextHighlight[]>()
    for (const chat of spawnedChats) {
      const idx = chat.highlight.transcriptIndex
      const existing = map.get(idx) || []
      existing.push(chat.highlight)
      map.set(idx, existing)
    }
    return map
  }, [spawnedChats])

  // Map highlight keys to chat IDs for click-to-scroll
  const chatMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const chat of spawnedChats) {
      const key = `${chat.highlight.transcriptIndex}-${chat.highlight.startOffset}`
      map.set(key, chat.id)
    }
    return map
  }, [spawnedChats])

  // Auto-spawn research on text selection
  const handleTextSelected = useCallback((highlight: TextHighlight) => {
    const state = useOverlayStore.getState()
    const spawnId = `spawn-${Date.now()}`

    const newChat: SpawnedChat = {
      id: spawnId,
      highlight,
      selectedText: highlight.text,
      response: '',
      isStreaming: true,
      thinkingStep: 'Analyzing term...',
      categoryResponse: null,
      isCategoryStreaming: false,
      followUpChips: [],
      createdAt: Date.now()
    }
    state.addSpawnedChat(newChat)

    // Thinking trace steps (safe — checks chat still exists before updating)
    setTimeout(() => {
      const s = useOverlayStore.getState()
      if (s.spawnedChats.some((c) => c.id === spawnId && !c.response)) {
        s.setThinkingStep(spawnId, 'Finding interview context...')
      }
    }, 300)
    setTimeout(() => {
      const s = useOverlayStore.getState()
      if (s.spawnedChats.some((c) => c.id === spawnId && !c.response)) {
        s.setThinkingStep(spawnId, 'Generating talking points...')
      }
    }, 600)

    // Build context from surrounding lines
    const contextStart = Math.max(0, highlight.transcriptIndex - 2)
    const contextEnd = Math.min(state.transcript.length, highlight.transcriptIndex + 3)
    const transcriptContext = state.transcript.slice(contextStart, contextEnd).join(' ')

    let systemPrompt = `You are an interview research assistant. The candidate selected a term from a live transcript. Provide a brief, actionable briefing.

FORMAT:
1. **What it is** — 1-sentence definition
2. **Why it matters** — how it connects to the interview
3. **Talking points** — 3-4 bullet points to reference

RULES:
- Under 150 words total
- Be specific to the interview context
- If resume/job data available, connect to candidate's background`

    if (state.resumeText) {
      systemPrompt += `\n\n--- RESUME ---\n${sanitizePromptText(state.resumeText)}\n--- END ---`
    }
    if (state.jobText) {
      systemPrompt += `\n\n--- JOB DESCRIPTION ---\n${sanitizePromptText(state.jobText)}\n--- END ---`
    }

    window.api.queryAI({
      requestId: spawnId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Selected: "${highlight.text}"\nTranscript context: "${transcriptContext}"\n\nBrief interview-relevant briefing:` }
      ],
      model: state.currentModel
    })
  }, [])

  const handleHighlightClick = useCallback((chatId: string) => {
    const el = document.getElementById(`spawned-chat-${chatId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcript])

  // Listen for transcription events
  useEffect(() => {
    const cleanup1 = window.api.onTranscriptionResult((data) => {
      useOverlayStore.getState().addTranscriptLine(data.text)
    })
    const cleanup2 = window.api.onTranscriptionError((data) => {
      setError(data.error)
    })
    const cleanup3 = window.api.onTranscriptionStopped(() => {
      useOverlayStore.getState().setTranscribing(false)
    })
    return () => {
      cleanup1()
      cleanup2()
      cleanup3()
    }
  }, [])

  // Listen for hotkey toggle
  useEffect(() => {
    const cleanup = window.api.onToggleTranscription(() => {
      const current = useOverlayStore.getState().isTranscribing
      if (current) {
        handleStop()
      } else {
        handleStart()
      }
    })
    return () => { cleanup() }
  }, [])

  // Check audio setup on mount
  useEffect(() => {
    window.api.checkAudioSetup().then(setAudioStatus)
  }, [])

  async function handleStart(): Promise<void> {
    setError(null)
    await window.api.requestMicPermission()
    await window.api.startTranscription(selectedAudioDeviceId)
    setTranscribing(true)
    addTranscriptLine(t('transcript.started'))
  }

  async function handleStop(): Promise<void> {
    await window.api.stopTranscription()
    setTranscribing(false)
    addTranscriptLine(t('transcript.stopped'))
    // Auto-save on stop
    const state = useOverlayStore.getState()
    const lines = state.transcript.filter((l) => !l.startsWith('['))
    if (lines.length > 0) {
      const questions = (state.detectedQuestions || []).map((q) => ({
        question: q.question,
        response: q.response || '',
        timestamp: q.timestamp || Date.now()
      }))
      await window.api.saveTranscript(lines, questions)
    }
  }

  async function handleSave(): Promise<void> {
    const state = useOverlayStore.getState()
    const lines = state.transcript.filter((l) => !l.startsWith('['))
    if (lines.length === 0) return
    const questions = (state.detectedQuestions || []).map((q) => ({
      question: q.question,
      response: q.response || '',
      timestamp: q.timestamp || Date.now()
    }))
    await window.api.saveTranscript(lines, questions)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-3 space-y-1.5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-300">
              <p>{error}</p>
            </div>
          )}

          {audioStatus && !audioStatus.ready && !isTranscribing && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2.5 text-xs text-yellow-200 space-y-1">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-semibold">{t('transcript.setup_needed')}</span>
              </div>
              {audioStatus.instructions && (
                <p className="text-yellow-200/70">{audioStatus.instructions}</p>
              )}
            </div>
          )}

          {audioStatus?.ready && !isTranscribing && transcript.length === 0 && (
            <div className="text-center text-white/30 text-sm py-6 space-y-3">
              <Mic className="h-8 w-8 mx-auto opacity-50" />
              <p>{t('transcript.whisper')}</p>
              <div className="flex items-center justify-center gap-1.5 text-xs text-green-400/60">
                <CheckCircle2 className="h-3 w-3" />
                <span>{t('transcript.audio_ready')}</span>
              </div>
              <p className="text-xs text-white/20">
                {t('transcript.hint')}
              </p>
            </div>
          )}

          {isTranscribing && transcript.length <= 1 && (
            <div className="text-center text-white/40 text-xs py-2 space-y-1">
              <div className="flex items-center justify-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                {t('transcript.listening')}
              </div>
            </div>
          )}

          {transcript.map((line, i) => (
            <EditableTranscriptLine
              key={`${i}-${line.slice(0, 20)}`}
              text={line}
              index={i}
              isSystem={line.startsWith('[')}
              highlights={highlightsByLine.get(i) || []}
              onTextSelected={handleTextSelected}
              onHighlightClick={handleHighlightClick}
              chatMap={chatMap}
            />
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-white/5 p-2 flex items-center justify-center gap-2">
        {transcript.length > 0 && !isTranscribing && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/40 hover:text-green-400"
              onClick={handleSave}
              title={saved ? t('transcript.saved') : t('transcript.save')}
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/40 hover:text-red-400"
              onClick={() => useOverlayStore.getState().clearTranscript()}
              title={t('transcript.clear')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        <Button
          variant={isTranscribing ? 'destructive' : 'default'}
          size="sm"
          className="gap-2"
          onClick={() => (isTranscribing ? handleStop() : handleStart())}
        >
          {isTranscribing ? (
            <>
              <MicOff className="h-4 w-4" />
              {t('transcript.stop')}
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              {t('transcript.start')}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
