import { useOverlayStore } from '@renderer/stores/overlay-store'
import { useT } from '@renderer/i18n/context'
import { useProductTheme } from '../../App'
import { TranscriptPanel } from '../overlay/TranscriptPanel'
import { AISidebar } from '../overlay/AISidebar'
import { KnowledgePanel } from '../overlay/KnowledgePanel'
import { SettingsPanel } from '../overlay/SettingsPanel'
import { OnboardingBot } from '../overlay/OnboardingBot'
import { Settings, FileText, Paperclip, Mic, BookOpen, Briefcase } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@renderer/components/ui/tooltip'
import { ChevronDown, Zap, Key } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' }
]

export function CopilotTab(): React.JSX.Element {
  const { t } = useT()
  const theme = useProductTheme()
  const {
    showSettings,
    setShowSettings,
    currentModel,
    setModel,
    aiBackend,
    resumeFilename,
    resumeText,
    setResume,
    clearResume,
    jobFilename,
    jobText,
    setJob,
    clearJob
  } = useOverlayStore()

  const [leftTab, setLeftTab] = useState<'transcript' | 'knowledge'>('transcript')

  // Load persisted data on mount
  useEffect(() => {
    window.api.getResume().then((data) => {
      if (data) {
        useOverlayStore.getState().setResume(data.text, data.filename)
      }
    })
    window.api.getJobDescription().then((data) => {
      if (data) {
        useOverlayStore.getState().setJob(data.text, data.filename)
      }
    })
    window.api.getSettings().then((s) => {
      useOverlayStore.getState().setAiBackend(s.aiBackend as 'openclaw' | 'anthropic')
      if (s.preferredModel) {
        useOverlayStore.getState().setModel(s.preferredModel)
      }
    })
  }, [])

  // Push state to remote view server (throttled 100ms)
  const lastPushRef = useRef(0)
  useEffect(() => {
    const unsub = useOverlayStore.subscribe((state) => {
      const now = Date.now()
      if (now - lastPushRef.current < 100) return
      lastPushRef.current = now
      window.api.pushRemoteViewState({
        transcript: state.transcript,
        detectedQuestions: state.detectedQuestions,
        spawnedChats: state.spawnedChats,
        isTranscribing: state.isTranscribing,
        currentModel: state.currentModel,
        resumeFilename: state.resumeFilename,
        jobFilename: state.jobFilename
      })
    })
    return unsub
  }, [])

  async function handleUploadResume(): Promise<void> {
    const result = await window.api.uploadResume()
    if (result) setResume(result.text, result.filename)
  }

  async function handleClearResume(): Promise<void> {
    await window.api.clearResume()
    clearResume()
  }

  async function handleUploadJob(): Promise<void> {
    const result = await window.api.uploadJobDescription()
    if (result) setJob(result.text, result.filename)
  }

  async function handleClearJob(): Promise<void> {
    await window.api.clearJobDescription()
    clearJob()
  }

  const currentLabel = MODELS.find((m) => m.id === currentModel)?.label || currentModel

  return (
    <div className="h-full flex flex-col rounded-lg border border-white/5 bg-[var(--color-bg-base)] overflow-hidden relative">
      {/* Settings overlay */}
      {showSettings && <SettingsPanel />}

      {/* Onboarding bot */}
      <OnboardingBot />

      {/* Copilot header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs font-semibold text-white/50 tracking-wide">
          Live {theme.name}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-white/50 hover:text-white"
          onClick={() => setShowSettings(true)}
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Main content — side by side */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel (40%) with sub-tabs */}
        <div className="w-[40%] border-r border-white/5 flex flex-col min-h-0">
          <div className="flex border-b border-white/5">
            <button
              onClick={() => setLeftTab('transcript')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-medium transition-colors ${
                leftTab === 'transcript'
                  ? 'text-white/80 border-b-2 border-blue-400'
                  : 'text-white/30 hover:text-white/50'
              }`}
            >
              <Mic className="h-3 w-3" />
              {t('copilot.transcript')}
            </button>
            <button
              onClick={() => setLeftTab('knowledge')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-medium transition-colors ${
                leftTab === 'knowledge'
                  ? 'text-white/80 border-b-2 border-blue-400'
                  : 'text-white/30 hover:text-white/50'
              }`}
            >
              <BookOpen className="h-3 w-3" />
              {t('copilot.knowledge')}
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {leftTab === 'transcript' ? <TranscriptPanel /> : <KnowledgePanel />}
          </div>
        </div>

        {/* Right: AI Sidebar (60%) */}
        <div className="w-[60%] flex flex-col min-h-0">
          <AISidebar />
        </div>
      </div>

      {/* Bottom bar */}
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] text-white/40">
              {aiBackend === 'anthropic' ? (
                <>
                  <Key className="h-3 w-3 text-blue-400" />
                  <span>{t('copilot.direct_api')}</span>
                </>
              ) : (
                <>
                  <Zap className="h-3 w-3 text-green-400" />
                  <span>{t('copilot.openclaw')}</span>
                </>
              )}
            </div>

            {/* Resume badge */}
            {resumeFilename ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5">
                    <FileText className="h-3 w-3 text-blue-400" />
                    <span className="text-[10px] text-blue-300 max-w-[60px] truncate">
                      {resumeFilename}
                    </span>
                    <button
                      onClick={handleClearResume}
                      className="text-blue-400/50 hover:text-red-400 transition-colors ml-0.5"
                    >
                      <span className="text-[10px]">x</span>
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-[10px] leading-snug whitespace-pre-line">
                  {resumeText ? resumeText.slice(0, 200) + '...' : t('copilot.resume_loaded')}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={handleUploadResume}
                className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                <Paperclip className="h-3 w-3" />
                {t('copilot.resume')}
              </button>
            )}

            {/* Job Description badge */}
            {jobFilename ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 bg-brand/10 border border-brand/20 rounded px-1.5 py-0.5">
                    <Briefcase className="h-3 w-3 text-brand" />
                    <span className="text-[10px] text-brand-light max-w-[60px] truncate">
                      {jobFilename}
                    </span>
                    <button
                      onClick={handleClearJob}
                      className="text-brand/50 hover:text-red-400 transition-colors ml-0.5"
                    >
                      <span className="text-[10px]">x</span>
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-[10px] leading-snug whitespace-pre-line">
                  {jobText ? jobText.slice(0, 200) + '...' : 'Job description loaded'}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={handleUploadJob}
                className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                <Briefcase className="h-3 w-3" />
                {t('copilot.job_desc')}
              </button>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] gap-1 text-white/50 px-2"
              >
                {currentLabel}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              {MODELS.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => {
                    setModel(model.id)
                    window.api.updateSettings({ preferredModel: model.id })
                  }}
                  className={currentModel === model.id ? 'bg-accent' : ''}
                >
                  {model.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    </div>
  )
}
