import { useEffect, useRef, useCallback, useState } from 'react'
import { useOverlayStore, type DetectedQuestion } from '@renderer/stores/overlay-store'
import { useT } from '@renderer/i18n/context'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { isLikelyQuestion, QUESTION_DEBOUNCE_MS } from '@renderer/lib/question-detector'
import { sanitizePromptText } from '@renderer/lib/prompt-utils'
import { ChevronDown, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SpawnedChatsPanel } from './SpawnedChatsPanel'
import { PreparednessRing } from './PreparednessRing'

function QuestionCard({ q }: { q: DetectedQuestion }): React.JSX.Element {
  const { t } = useT()
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
              {t('ai.generating')}
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
  const { t } = useT()
  const {
    transcript,
    detectedQuestions,
    processedTranscriptIndices,
    resumeText,
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

  // Register stream listeners for question + spawned chat responses
  useEffect(() => {
    const cleanupChunk = window.api.onStreamChunk((data) => {
      const store = useOverlayStore.getState()
      if (data.id.startsWith('question-')) {
        store.appendToQuestion(data.id, data.text)
      } else if (data.id.startsWith('spawn-cat-')) {
        const spawnId = 'spawn-' + data.id.slice('spawn-cat-'.length)
        store.appendToCategoryResponse(spawnId, data.text)
      } else if (data.id.startsWith('spawn-')) {
        store.appendToSpawnedChat(data.id, data.text)
      } else {
        store.appendToMessage(data.id, data.text)
      }
    })
    const cleanupDone = window.api.onStreamDone((data) => {
      const store = useOverlayStore.getState()
      if (data.id.startsWith('question-')) {
        store.finishQuestionStreaming(data.id)
      } else if (data.id.startsWith('spawn-cat-')) {
        const spawnId = 'spawn-' + data.id.slice('spawn-cat-'.length)
        store.finishCategoryStreaming(spawnId)
      } else if (data.id.startsWith('spawn-')) {
        store.finishSpawnedChatStreaming(data.id)
        // Generate follow-up chips after response completes
        const chat = store.spawnedChats.find((c) => c.id === data.id)
        if (chat) {
          const chips: string[] = []
          if (store.resumeText) {
            chips.push(`How does this relate to my experience?`)
          }
          chips.push(`What questions might they ask about ${chat.selectedText}?`)
          if (chips.length > 0) {
            store.setFollowUpChips(data.id, chips.slice(0, 3))
          }
        }
      } else {
        store.finishStreaming(data.id)
      }
    })
    const cleanupError = window.api.onStreamError((data) => {
      const store = useOverlayStore.getState()
      if (data.id.startsWith('question-')) {
        store.updateQuestionResponse(data.id, `Error: ${data.error}`)
        store.finishQuestionStreaming(data.id)
      } else if (data.id.startsWith('spawn-cat-')) {
        const spawnId = 'spawn-' + data.id.slice('spawn-cat-'.length)
        store.finishCategoryStreaming(spawnId)
      } else if (data.id.startsWith('spawn-')) {
        store.appendToSpawnedChat(data.id, `Error: ${data.error}`)
        store.finishSpawnedChatStreaming(data.id)
      } else {
        store.updateMessage(data.id, `Error: ${data.error}`)
        store.finishStreaming(data.id)
      }
    })
    return () => {
      cleanupChunk()
      cleanupDone()
      cleanupError()
    }
  }, [])

  const sendQuestionToAI = useCallback(
    (line: string, transcriptIndex: number) => {
      const state = useOverlayStore.getState()
      const questionId = `question-${Date.now()}`
      const lineIsQuestion = isLikelyQuestion(line)

      const newQ: DetectedQuestion = {
        id: questionId,
        question: line,
        transcriptIndex,
        timestamp: Date.now(),
        response: '',
        isStreaming: true
      }
      addDetectedQuestion(newQ)
      markTranscriptProcessed(transcriptIndex)

      // Build recent transcript context (last 10 lines)
      const contextStart = Math.max(0, transcriptIndex - 10)
      const recentTranscript = state.transcript
        .slice(contextStart, transcriptIndex + 1)
        .filter((l) => !l.startsWith('['))
        .join('\n')

      // Build enhanced system prompt — works for both questions and general coaching
      let systemPrompt = `You are a live interview coach whispering in the candidate's ear. You see the conversation in real-time and proactively help.

RESPONSE FORMAT:
1. **Key talking points** (3-4 short phrases the candidate can glance at)
2. **What to say** — a natural, first-person script they can read aloud or paraphrase. Use contractions and casual connectors. Never use bullet lists in the spoken script.

CRITICAL RULES:
- You MUST reference SPECIFIC details from the candidate's resume — project names, company names, metrics, technologies, job titles. Pull real examples from their background. Never be generic.
- You MUST align every response to the job description requirements. Map the candidate's experience to what the employer is looking for.
- Keep under 200 words. The candidate needs to glance and speak, not read.
- Sound human. Say "I spent two years building..." not "I have extensive experience in..."`

      if (state.resumeText) {
        systemPrompt += `\n\nCANDIDATE RESUME (USE THIS — reference specific projects, metrics, and companies):\n${sanitizePromptText(state.resumeText)}`
      } else {
        systemPrompt += `\n\n[No resume uploaded — give general coaching]`
      }

      if (state.jobText) {
        systemPrompt += `\n\nJOB DESCRIPTION (ALIGN RESPONSES TO THESE REQUIREMENTS):\n${sanitizePromptText(state.jobText)}`
      }

      // Auto-attach relevant qualification article snippets
      if (state.extractedQualifications.length > 0) {
        const lineLower = line.toLowerCase()
        const matchedQuals = state.extractedQualifications.filter((q) =>
          lineLower.includes(q.keyword.toLowerCase()) ||
          q.keyword.toLowerCase().split(/[\s&]+/).some((w) => w.length >= 5 && lineLower.includes(w))
        )
        if (matchedQuals.length > 0) {
          // Load snippets async — but for now include the qualification context inline
          const qualContext = matchedQuals
            .slice(0, 2)
            .map((q) => `- ${q.displayName} (${q.category}): coverage ${q.coverageScore}/100${q.resumeMatch ? ', matches resume' : ''}`)
            .join('\n')
          systemPrompt += `\n\nRELEVANT QUALIFICATIONS FROM JD (focus on these):\n${qualContext}`
        }
      }

      const userContent = lineIsQuestion
        ? `The interviewer just asked: "${line}"\n\nProvide talking points and a natural script to answer this.`
        : `Recent conversation:\n${recentTranscript}\n\nThe discussion now covers: "${line}"\n\nProvide relevant talking points and a natural response the candidate can use to contribute meaningfully. Connect to their resume and the job requirements.`

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]

      window.api.queryAI({
        requestId: questionId,
        messages,
        model: state.currentModel
      })
    },
    [addDetectedQuestion, markTranscriptProcessed]
  )

  // Watch transcript for ANY new or edited content — auto-coach on all substantive lines
  useEffect(() => {
    // Find the most recent unprocessed substantive line (check last 5)
    for (let i = transcript.length - 1; i >= Math.max(0, transcript.length - 5); i--) {
      if (processedTranscriptIndices.has(i)) continue
      const line = transcript[i]
      if (!line || line.startsWith('[') || line.length < 15) continue

      // Clear existing timer for this index
      const existing = debounceTimers.current.get(i)
      if (existing) clearTimeout(existing)

      const lineIndex = i
      // Questions get faster response, general coaching has longer debounce
      const delay = isLikelyQuestion(line) ? QUESTION_DEBOUNCE_MS : 3000

      const timer = setTimeout(() => {
        const currentState = useOverlayStore.getState()
        const currentLine = currentState.transcript[lineIndex]
        if (
          currentLine &&
          currentLine.length >= 15 &&
          !currentLine.startsWith('[') &&
          !currentState.processedTranscriptIndices.has(lineIndex)
        ) {
          sendQuestionToAI(currentLine, lineIndex)
        }
        debounceTimers.current.delete(lineIndex)
      }, delay)

      debounceTimers.current.set(i, timer)
      break // Process one at a time to avoid spam
    }
  }, [transcript, processedTranscriptIndices, sendQuestionToAI])

  const spawnedChats = useOverlayStore((s) => s.spawnedChats)
  const hasContent = detectedQuestions.length > 0 || spawnedChats.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
        <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">
          {t('ai.header')}
        </span>
        {detectedQuestions.length > 0 && (
          <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 rounded-full">
            {detectedQuestions.length}
          </span>
        )}
        <div className="ml-auto">
          <PreparednessRing />
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-3 space-y-3">
          {!hasContent && (
            <div className="text-center text-white/20 text-xs py-8 space-y-2">
              <Sparkles className="h-6 w-6 mx-auto opacity-40" />
              <p>{t('ai.listening')}</p>
              <p className="text-[10px] text-white/15">
                {t('ai.select_hint')}
              </p>
              <p className="text-[10px]">
                {resumeText
                  ? t('ai.resume_loaded')
                  : t('ai.no_resume')}
              </p>
            </div>
          )}

          {/* Spawned research cards (living document) */}
          <SpawnedChatsPanel />

          {/* Detected questions */}
          {detectedQuestions.length > 0 && spawnedChats.length > 0 && (
            <div className="flex items-center gap-2 px-1 pt-1">
              <span className="text-[10px] font-semibold text-yellow-400/60 uppercase tracking-wide">
                {t('ai.questions')}
              </span>
              <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 rounded-full">
                {detectedQuestions.length}
              </span>
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
