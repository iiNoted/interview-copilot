import { useOverlayStore } from '@renderer/stores/overlay-store'
import { TranscriptPanel } from './TranscriptPanel'
import { AISidebar } from './AISidebar'
import { KnowledgePanel } from './KnowledgePanel'
import { SettingsPanel } from './SettingsPanel'
import { OnboardingBot } from './OnboardingBot'
import { Minimize2, Maximize2, Settings, FileText, Paperclip, Mic, BookOpen, Briefcase } from 'lucide-react'
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

export function OverlayContainer(): React.JSX.Element {
  const {
    mode,
    setMode,
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

  useEffect(() => {
    const cleanup = window.api.onFocusQueryInput(() => {})
    return cleanup
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
        isTranscribing: state.isTranscribing,
        currentModel: state.currentModel,
        resumeFilename: state.resumeFilename,
        jobFilename: state.jobFilename,
        mode: state.mode
      })
    })
    return unsub
  }, [])

  const handleMinimize = (): void => {
    setMode('minimized')
    window.api.minimizeOverlay()
  }

  const handleRestore = (): void => {
    setMode('expanded')
    window.api.restoreOverlay()
  }

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

  if (mode === 'minimized') {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Button
          onClick={handleRestore}
          className="h-12 w-12 rounded-full bg-primary shadow-lg hover:bg-primary/90"
          size="icon"
        >
          <Maximize2 className="h-5 w-5" />
        </Button>
      </div>
    )
  }

  const currentLabel = MODELS.find((m) => m.id === currentModel)?.label || currentModel

  return (
    <div className="fixed inset-2 flex flex-col rounded-xl border border-white/10 bg-[hsl(220,20%,10%)]/90 backdrop-blur-xl shadow-2xl overflow-hidden relative">
      {/* Settings overlay */}
      {showSettings && <SettingsPanel />}

      {/* Onboarding bot */}
      <OnboardingBot />

      {/* Title bar — draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-move select-none border-b border-white/5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-xs font-semibold text-white/70 tracking-wide uppercase">
          Interview Copilot
        </span>
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white/50 hover:text-white"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white/50 hover:text-white"
            onClick={handleMinimize}
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main content — side by side */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel (40%) with sub-tabs */}
        <div className="w-[40%] border-r border-white/5 flex flex-col min-h-0">
          {/* Tab switcher */}
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
              Transcript
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
              Knowledge
            </button>
          </div>

          {/* Tab content */}
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
                  <span>Direct API</span>
                </>
              ) : (
                <>
                  <Zap className="h-3 w-3 text-green-400" />
                  <span>OpenClaw</span>
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
                  {resumeText ? resumeText.slice(0, 200) + '...' : 'Resume loaded'}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={handleUploadResume}
                className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                <Paperclip className="h-3 w-3" />
                Resume
              </button>
            )}

            {/* Job Description badge */}
            {jobFilename ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5">
                    <Briefcase className="h-3 w-3 text-purple-400" />
                    <span className="text-[10px] text-purple-300 max-w-[60px] truncate">
                      {jobFilename}
                    </span>
                    <button
                      onClick={handleClearJob}
                      className="text-purple-400/50 hover:text-red-400 transition-colors ml-0.5"
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
                Job Desc
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
                  onClick={() => setModel(model.id)}
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
