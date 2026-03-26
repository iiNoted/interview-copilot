import { useState, useCallback } from 'react'
import { useOverlayStore, type SpawnedChat } from '@renderer/stores/overlay-store'
import { useT } from '@renderer/i18n/context'
import { sanitizePromptText } from '@renderer/lib/prompt-utils'
import { ChevronDown, ChevronRight, ArrowUp, X, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function ThinkingDots(): React.JSX.Element {
  return (
    <span className="inline-flex gap-0.5">
      <span className="w-1 h-1 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1 h-1 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1 h-1 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  )
}

function SpawnedChatCard({
  chat,
  onDismiss,
  onEscalate,
  onFollowUp
}: {
  chat: SpawnedChat
  onDismiss: (id: string) => void
  onEscalate: (id: string) => void
  onFollowUp: (chatId: string, chip: string) => void
}): React.JSX.Element {
  const { t } = useT()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      id={`spawned-chat-${chat.id}`}
      className="border border-purple-500/20 rounded-lg overflow-hidden bg-purple-500/[0.03] animate-in slide-in-from-top-2 fade-in duration-300"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex-1 flex items-start gap-1.5 text-left min-w-0"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-purple-400" />
          ) : (
            <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 text-purple-400" />
          )}
          <span className="text-xs font-medium text-purple-300 leading-snug truncate">
            &ldquo;{chat.selectedText}&rdquo;
          </span>
        </button>

        {/* Up-arrow: broader category */}
        <button
          onClick={() => onEscalate(chat.id)}
          className="shrink-0 p-1 text-purple-400/40 hover:text-purple-300 transition-colors"
          title={t('spawned.escalate')}
          disabled={chat.isCategoryStreaming}
        >
          <ArrowUp className="h-3 w-3" />
        </button>

        {/* X: dismiss */}
        <button
          onClick={() => onDismiss(chat.id)}
          className="shrink-0 p-1 text-white/25 hover:text-red-400 transition-colors"
          title={t('spawned.dismiss')}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Response */}
      {!collapsed && (
        <div className="px-3 pb-3 border-t border-purple-500/10">
          {/* Thinking trace */}
          {chat.thinkingStep && !chat.response ? (
            <div className="flex items-center gap-2 py-3 text-xs text-purple-300/60">
              <ThinkingDots />
              <span>{chat.thinkingStep}</span>
            </div>
          ) : chat.isStreaming && !chat.response ? (
            <div className="flex items-center gap-2 py-3 text-xs text-white/40">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('spawned.researching')}
            </div>
          ) : (
            <div className="prose prose-invert prose-xs max-w-none pt-2 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-purple-300 [&_code]:text-purple-300 [&_code]:bg-white/5 [&_code]:px-1 [&_code]:rounded [&_strong]:text-purple-200 text-xs leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{chat.response}</ReactMarkdown>
              {chat.isStreaming && (
                <span className="inline-block w-1.5 h-3 bg-purple-400 animate-pulse rounded-sm ml-0.5" />
              )}
            </div>
          )}

          {/* Category escalation */}
          {(chat.categoryResponse || chat.isCategoryStreaming) && (
            <div className="mt-2 pt-2 border-t border-purple-500/10">
              <div className="text-[10px] text-purple-400/50 mb-1 uppercase tracking-wide font-medium">
                {t('spawned.broader')}
              </div>
              {chat.isCategoryStreaming && !chat.categoryResponse ? (
                <div className="flex items-center gap-2 py-1 text-xs text-purple-300/40">
                  <ThinkingDots />
                  <span>{t('spawned.finding_broader')}</span>
                </div>
              ) : (
                <div className="prose prose-invert prose-xs max-w-none text-xs leading-relaxed [&_strong]:text-purple-200">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{chat.categoryResponse || ''}</ReactMarkdown>
                  {chat.isCategoryStreaming && (
                    <span className="inline-block w-1.5 h-3 bg-purple-400 animate-pulse rounded-sm ml-0.5" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Follow-up chips */}
          {chat.followUpChips.length > 0 && !chat.isStreaming && (
            <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-purple-500/10">
              {chat.followUpChips.map((chip, chipIdx) => (
                <button
                  key={`${chat.id}-chip-${chipIdx}`}
                  onClick={() => onFollowUp(chat.id, chip)}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-purple-500/20 text-purple-300/60 hover:text-purple-200 hover:border-purple-500/40 hover:bg-purple-500/10 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SpawnedChatsPanel(): React.JSX.Element | null {
  const { t } = useT()
  const spawnedChats = useOverlayStore((s) => s.spawnedChats)

  const handleDismiss = useCallback((id: string) => {
    useOverlayStore.getState().removeSpawnedChat(id)
  }, [])

  const handleEscalate = useCallback((chatId: string) => {
    const state = useOverlayStore.getState()
    const chat = state.spawnedChats.find((c) => c.id === chatId)
    if (!chat || chat.isCategoryStreaming) return

    state.startCategoryStreaming(chatId)

    const categoryRequestId = `spawn-cat-${chatId.replace('spawn-', '')}`

    let systemPrompt = `You are an interview coach. The candidate highlighted a term from their interview transcript. Provide the BROADER category this falls under and a natural talking point.

FORMAT:
"[Broader Category] — specifically through [the selected term]"
Then 2-3 sentences as a first-person talking point the candidate can say naturally.

RULES:
- Under 100 words
- Sound natural, not rehearsed
- Connect to resume/job if available`

    if (state.resumeText) {
      systemPrompt += `\n\n--- RESUME ---\n${sanitizePromptText(state.resumeText)}\n--- END ---`
    }
    if (state.jobText) {
      systemPrompt += `\n\n--- JOB DESCRIPTION ---\n${sanitizePromptText(state.jobText)}\n--- END ---`
    }

    window.api.queryAI({
      requestId: categoryRequestId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Selected: "${chat.selectedText}"\nInitial briefing: ${chat.response}\n\nBroader category framing:` }
      ],
      model: state.currentModel
    })
  }, [])

  const handleFollowUp = useCallback((chatId: string, chip: string) => {
    const state = useOverlayStore.getState()
    const chat = state.spawnedChats.find((c) => c.id === chatId)
    if (!chat) return

    // Spawn a new chat from the same highlight with the follow-up question
    const spawnId = `spawn-${Date.now()}`
    const newChat: SpawnedChat = {
      id: spawnId,
      highlight: { ...chat.highlight },
      selectedText: chip,
      response: '',
      isStreaming: true,
      thinkingStep: 'Researching...',
      categoryResponse: null,
      isCategoryStreaming: false,
      followUpChips: [],
      createdAt: Date.now()
    }
    state.addSpawnedChat(newChat)

    setTimeout(() => {
      const s = useOverlayStore.getState()
      if (s.spawnedChats.some((c) => c.id === spawnId && !c.response)) {
        s.setThinkingStep(spawnId, 'Generating response...')
      }
    }, 400)

    let systemPrompt = `You are an interview research assistant. Answer the follow-up question concisely (under 120 words). Be specific and actionable for an interview context.`
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
        { role: 'user', content: `Original topic: "${chat.selectedText}"\nFollow-up: ${chip}` }
      ],
      model: state.currentModel
    })
  }, [])

  if (spawnedChats.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-semibold text-purple-400/60 uppercase tracking-wide">
          {t('spawned.research')}
        </span>
        <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 rounded-full">
          {spawnedChats.length}
        </span>
      </div>
      {spawnedChats.map((chat) => (
        <SpawnedChatCard
          key={chat.id}
          chat={chat}
          onDismiss={handleDismiss}
          onEscalate={handleEscalate}
          onFollowUp={handleFollowUp}
        />
      ))}
    </div>
  )
}
