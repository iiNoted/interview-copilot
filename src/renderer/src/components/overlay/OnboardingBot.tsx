import { useState, useEffect } from 'react'
import { useOverlayStore } from '@renderer/stores/overlay-store'
import { Button } from '@renderer/components/ui/button'
import {
  CheckCircle2,
  AlertCircle,
  Mic,
  FileText,
  Briefcase,
  Zap,
  X,
  Loader2,
  Bot
} from 'lucide-react'

interface SetupStatus {
  audioReady: boolean
  resumeUploaded: boolean
  apiConfigured: boolean
  onboardingComplete: boolean
}

export function OnboardingBot(): React.JSX.Element | null {
  const { resumeFilename, setResume, jobFilename, setJob } = useOverlayStore()
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    window.api.getOnboardingStatus().then((s) => {
      setStatus(s)
      if (s.onboardingComplete) setDismissed(true)
    })
  }, [])

  if (dismissed || !status || status.onboardingComplete) return null

  // Always derive upload status from the store — never rely on stale local state
  const resumeUploaded = !!resumeFilename
  const jobUploaded = !!jobFilename
  const allGood = status.audioReady && resumeUploaded && status.apiConfigured

  async function handleAudioTest(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    const result = await window.api.runAudioTest()
    setTestResult(result)
    setTesting(false)
    if (result.success) {
      setStatus((s) => s ? { ...s, audioReady: true } : s)
    }
  }

  async function handleUploadResume(): Promise<void> {
    const result = await window.api.uploadResume()
    if (result) {
      setResume(result.text, result.filename)
    }
  }

  async function handleUploadJob(): Promise<void> {
    const result = await window.api.uploadJobDescription()
    if (result) {
      setJob(result.text, result.filename)
    }
  }

  function handleDismiss(): void {
    setFadeOut(true)
    window.api.completeOnboarding()
    setTimeout(() => setDismissed(true), 300)
  }

  return (
    <div
      className={`absolute top-14 left-3 right-3 z-40 transition-all duration-300 ${
        fadeOut ? 'opacity-0 translate-y-2' : 'opacity-100'
      }`}
    >
      <div className="bg-[hsl(220,25%,14%)] border border-blue-500/20 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/5 border-b border-blue-500/10">
          <Bot className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-medium text-blue-300 flex-1">Setup Assistant</span>
          <button
            onClick={handleDismiss}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-3 space-y-2.5">
          <p className="text-[11px] text-white/60 leading-snug">
            {allGood
              ? "You're all set! Everything looks good."
              : "Let's get you set up. Here's what we need:"}
          </p>

          {/* Checklist */}
          <div className="space-y-1.5">
            {/* Audio */}
            <div className="flex items-center gap-2">
              {status.audioReady ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
              )}
              <span
                className={`text-[11px] flex-1 ${
                  status.audioReady ? 'text-green-300/70' : 'text-yellow-200/70'
                }`}
              >
                <Mic className="h-3 w-3 inline mr-1" />
                {status.audioReady
                  ? 'Audio capture ready'
                  : 'Audio capture needs setup (BlackHole)'}
              </span>
              {!testing && !testResult && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[9px] px-1.5 text-blue-400/70 hover:text-blue-400"
                  onClick={handleAudioTest}
                >
                  Test
                </Button>
              )}
              {testing && <Loader2 className="h-3 w-3 text-blue-400 animate-spin shrink-0" />}
              {testResult && !testing && (
                <span
                  className={`text-[9px] ${testResult.success ? 'text-green-400' : 'text-red-400'}`}
                >
                  {testResult.success ? 'Pass' : 'Fail'}
                </span>
              )}
            </div>

            {/* Resume */}
            <div className="flex items-center gap-2">
              {resumeUploaded ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-white/30 shrink-0" />
              )}
              <span
                className={`text-[11px] flex-1 ${
                  resumeUploaded ? 'text-green-300/70' : 'text-white/40'
                }`}
              >
                <FileText className="h-3 w-3 inline mr-1" />
                {resumeUploaded
                  ? `Resume loaded (${resumeFilename || 'uploaded'})`
                  : 'Upload resume for personalized answers'}
              </span>
              {!resumeUploaded && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[9px] px-1.5 text-blue-400/70 hover:text-blue-400"
                  onClick={handleUploadResume}
                >
                  Upload
                </Button>
              )}
            </div>

            {/* Job Description */}
            <div className="flex items-center gap-2">
              {jobUploaded ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-white/30 shrink-0" />
              )}
              <span
                className={`text-[11px] flex-1 ${
                  jobUploaded ? 'text-green-300/70' : 'text-white/40'
                }`}
              >
                <Briefcase className="h-3 w-3 inline mr-1" />
                {jobUploaded
                  ? 'Job description loaded'
                  : 'Upload job posting for targeted answers'}
              </span>
              {!jobUploaded && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[9px] px-1.5 text-blue-400/70 hover:text-blue-400"
                  onClick={handleUploadJob}
                >
                  Upload
                </Button>
              )}
            </div>

            {/* API */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
              <span className="text-[11px] text-green-300/70 flex-1">
                <Zap className="h-3 w-3 inline mr-1" />
                AI connected (OpenClaw)
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {allGood && (
              <Button
                size="sm"
                className="flex-1 h-7 text-[11px] gap-1"
                onClick={handleDismiss}
              >
                <CheckCircle2 className="h-3 w-3" />
                Got it!
              </Button>
            )}
            {!allGood && (
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-[11px] text-white/40"
                onClick={handleDismiss}
              >
                Skip for now
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
