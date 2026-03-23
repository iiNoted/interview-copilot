import { useEffect, useRef, useCallback, useState } from 'react'
import { useOverlayStore, type DetectedQuestion } from '@renderer/stores/overlay-store'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { isLikelyQuestion, QUESTION_DEBOUNCE_MS } from '@renderer/lib/question-detector'
import { sanitizePromptText } from '@renderer/lib/prompt-utils'
import { ChevronDown, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function QuestionCard({ q }: { q: DetectedQuestion }): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-white/[0.03]">
      {/* Question header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-400" />
        )}
        <span className="text-xs font-medium text-yellow-300 leading-snug">
          {q.question}
        </span>
      </button>

      {/* Response */}
      {!collapsed && (
        <div className="px-3 pb-3 border-t border-white/5">
          {q.isStreaming && !q.response ? (
            <div className="flex items-center gap-2 py-3 text-xs text-white/40">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating response...
            </div>
          ) : (
            <div className="prose prose-invert prose-xs max-w-none pt-2 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-blue-300 [&_code]:text-blue-300 [&_code]:bg-white/5 [&_code]:px-1 [&_code]:rounded text-xs leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{q.response}</ReactMarkdown>
              {q.isStreaming && (
                <span className="inline-block w-1.5 h-3 bg-blue-400 animate-pulse rounded-sm ml-0.5" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AISidebar(): React.JSX.Element {
  const {
    transcript,
    detectedQuestions,
    processedTranscriptIndices,
    resumeText,
    currentModel,
    addDetectedQuestion,
    markTranscriptProcessed
  } = useOverlayStore()

  const scrollRef = useRef<HTMLDivElement>(null)
  const debounceTimers = useRef<Map<number, NodeJS.Timeout>>(new Map())

  // Auto-scroll to bottom when new questions arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [detectedQuestions])

  // Register stream listeners for question responses
  useEffect(() => {
    const cleanupChunk = window.api.onStreamChunk((data) => {
      // Route to question if ID starts with 'question-'
      if (data.id.startsWith('question-')) {
        useOverlayStore.getState().appendToQuestion(data.id, data.text)
      } else {
        useOverlayStore.getState().appendToMessage(data.id, data.text)
      }
    })
    const cleanupDone = window.api.onStreamDone((data) => {
      if (data.id.startsWith('question-')) {
        useOverlayStore.getState().finishQuestionStreaming(data.id)
      } else {
        useOverlayStore.getState().finishStreaming(data.id)
      }
    })
    const cleanupError = window.api.onStreamError((data) => {
      if (data.id.startsWith('question-')) {
        useOverlayStore.getState().updateQuestionResponse(data.id, `Error: ${data.error}`)
        useOverlayStore.getState().finishQuestionStreaming(data.id)
      } else {
        useOverlayStore.getState().updateMessage(data.id, `Error: ${data.error}`)
        useOverlayStore.getState().finishStreaming(data.id)
      }
    })
    return () => {
      cleanupChunk()
      cleanupDone()
      cleanupError()
    }
  }, [])

  const sendQuestionToAI = useCallback(
    (question: string, transcriptIndex: number) => {
      const state = useOverlayStore.getState()
      const questionId = `question-${Date.now()}`

      const newQ: DetectedQuestion = {
        id: questionId,
        question,
        transcriptIndex,
        timestamp: Date.now(),
        response: '',
        isStreaming: true
      }
      addDetectedQuestion(newQ)
      markTranscriptProcessed(transcriptIndex)

      // Build enhanced system prompt
      let systemPrompt = `You are a live interview coach whispering in the candidate's ear. Your job is to help them sound natural, confident, and specific.

RESPONSE FORMAT — every answer must follow this structure:
1. **Key talking points** (3-4 short phrases the candidate can glance at)
2. **What to say** — a natural, conversational script they can read aloud or paraphrase. Write it in first person as if the candidate is speaking. Use contractions, casual connectors ("so", "actually", "one thing I'm proud of"), and vary sentence length. Never use bullet-point lists in the spoken script.

RULES:
- Reference SPECIFIC details from the candidate's background — project names, company names, metrics, technologies, job titles. Never be vague.
- If a job description is provided, align the answer to the role's requirements. Emphasize qualifications and skills that match what they're looking for.
- Keep the total response under 200 words. The candidate needs to glance and speak, not read an essay.
- Sound human. No corporate jargon. No "I have extensive experience in..." — say "I spent two years building..." instead.`

      if (state.resumeText) {
        systemPrompt += `\n\n--- CANDIDATE RESUME ---\n${sanitizePromptText(state.resumeText)}\n--- END RESUME ---`
      }

      if (state.jobText) {
        systemPrompt += `\n\n--- JOB DESCRIPTION ---\n${sanitizePromptText(state.jobText)}\n--- END JOB DESCRIPTION ---`
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `The interviewer just asked: "${question}"\n\nProvide talking points and a natural script to answer this.`
        }
      ]

      window.api.queryAI({
        requestId: questionId,
        messages,
        model: state.currentModel
      })
    },
    [addDetectedQuestion, markTranscriptProcessed]
  )

  // Watch transcript for new questions with debounce
  useEffect(() => {
    const lastIndex = transcript.length - 1
    if (lastIndex < 0) return
    if (processedTranscriptIndices.has(lastIndex)) return

    const line = transcript[lastIndex]
    if (!isLikelyQuestion(line)) return

    // Clear existing timer for this index
    const existing = debounceTimers.current.get(lastIndex)
    if (existing) clearTimeout(existing)

    // Set new debounce timer
    const timer = setTimeout(() => {
      // Re-check: line might have been updated
      const currentState = useOverlayStore.getState()
      const currentLine = currentState.transcript[lastIndex]
      if (
        currentLine &&
        isLikelyQuestion(currentLine) &&
        !currentState.processedTranscriptIndices.has(lastIndex)
      ) {
        sendQuestionToAI(currentLine, lastIndex)
      }
      debounceTimers.current.delete(lastIndex)
    }, QUESTION_DEBOUNCE_MS)

    debounceTimers.current.set(lastIndex, timer)

    return () => {
      const t = debounceTimers.current.get(lastIndex)
      if (t) clearTimeout(t)
    }
  }, [transcript, processedTranscriptIndices, sendQuestionToAI])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
        <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">
          AI Copilot
        </span>
        {detectedQuestions.length > 0 && (
          <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 rounded-full">
            {detectedQuestions.length}
          </span>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-3 space-y-3">
          {detectedQuestions.length === 0 && (
            <div className="text-center text-white/20 text-xs py-8 space-y-2">
              <Sparkles className="h-6 w-6 mx-auto opacity-40" />
              <p>Listening for interview questions...</p>
              <p className="text-[10px]">
                {resumeText
                  ? 'Resume loaded — responses will reference your experience'
                  : 'Upload a resume & job description for targeted answers'}
              </p>
            </div>
          )}
          {detectedQuestions.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
