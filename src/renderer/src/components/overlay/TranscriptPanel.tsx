import { useOverlayStore } from '@renderer/stores/overlay-store'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Mic, MicOff, AlertCircle, Trash2, CheckCircle2, X, Save } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useEffect, useRef, useState, useCallback } from 'react'

interface AudioSetupStatus {
  platform: string
  ready: boolean
  currentOutput: string
  hasLoopback: boolean
  instructions: string | null
}

function EditableTranscriptLine({
  text,
  index,
  isSystem
}: {
  text: string
  index: number
  isSystem: boolean
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  // Sync if new text comes from whisper while not editing
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
      onClick={() => setEditing(true)}
      className="text-sm text-white/80 leading-relaxed cursor-pointer rounded px-1 -mx-1 hover:bg-white/5 transition-colors"
      title="Click to edit"
    >
      {text}
    </p>
  )
}

export function TranscriptPanel(): React.JSX.Element {
  const { transcript, isTranscribing, setTranscribing, addTranscriptLine, detectedQuestions } = useOverlayStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [audioStatus, setAudioStatus] = useState<AudioSetupStatus | null>(null)
  const [saved, setSaved] = useState(false)

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
    return cleanup
  }, [])

  // Check audio setup on mount
  useEffect(() => {
    window.api.checkAudioSetup().then(setAudioStatus)
  }, [])

  async function handleStart(): Promise<void> {
    setError(null)
    await window.api.requestMicPermission()
    await window.api.startTranscription(0)
    setTranscribing(true)
    addTranscriptLine('[Live transcription started...]')
  }

  async function handleStop(): Promise<void> {
    await window.api.stopTranscription()
    setTranscribing(false)
    addTranscriptLine('[Transcription stopped]')
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
                <span className="font-semibold">Setup needed</span>
              </div>
              {audioStatus.instructions && (
                <p className="text-yellow-200/70">{audioStatus.instructions}</p>
              )}
            </div>
          )}

          {audioStatus?.ready && !isTranscribing && transcript.length === 0 && (
            <div className="text-center text-white/30 text-sm py-6 space-y-3">
              <Mic className="h-8 w-8 mx-auto opacity-50" />
              <p>Live transcription using Whisper</p>
              <div className="flex items-center justify-center gap-1.5 text-xs text-green-400/60">
                <CheckCircle2 className="h-3 w-3" />
                <span>Audio capture ready</span>
              </div>
              <p className="text-xs text-white/20">
                Click any line to edit — play meeting through this Mac
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
                Listening for audio...
              </div>
            </div>
          )}

          {transcript.map((line, i) => (
            <EditableTranscriptLine
              key={`${i}-${line.slice(0, 20)}`}
              text={line}
              index={i}
              isSystem={line.startsWith('[')}
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
              title={saved ? 'Saved!' : 'Save transcript'}
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/40 hover:text-red-400"
              onClick={() => useOverlayStore.getState().clearTranscript()}
              title="Clear transcript"
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
              Stop
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              Start
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
