import { useState, useEffect, useCallback, useRef } from 'react'
import { useResumeBuilderStore } from '@renderer/stores/resume-builder-store'
import { useOverlayStore } from '@renderer/stores/overlay-store'
import { useJobStore } from '@renderer/stores/job-store'
import {
  FileText,
  Loader2,
  Sparkles,
  X,
  Plus,
  Download,
  RefreshCw,
  Briefcase,
  Copy,
  Check
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useT } from '@renderer/i18n/context'

export function ResumeTab(): React.JSX.Element {
  const { t } = useT()
  const {
    targetTitle,
    qualifications,
    generatedContent,
    isGenerating,
    requestId,
    setTargetTitle,
    addQualification,
    removeQualification,
    setGeneratedContent,
    appendContent,
    setIsGenerating,
    setRequestId,
    setQualifications
  } = useResumeBuilderStore()

  const { resumeText } = useOverlayStore()
  const { savedJobs, selectedJob } = useJobStore()
  const [newQual, setNewQual] = useState('')
  const [copied, setCopied] = useState(false)
  const [autoLoaded, setAutoLoaded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Auto-populate from selected job or saved jobs on first render
  useEffect(() => {
    if (autoLoaded) return
    setAutoLoaded(true)

    // If a job is selected in the Jobs tab, use it
    if (selectedJob) {
      if (!targetTitle) setTargetTitle(selectedJob.title)
      if (qualifications.length === 0 && selectedJob.qualifications.length > 0) {
        setQualifications(selectedJob.qualifications.slice(0, 30))
      } else if (qualifications.length === 0 && selectedJob.tags.length > 0) {
        setQualifications(selectedJob.tags.slice(0, 20))
      }
      return
    }

    // Otherwise, pull from all saved jobs
    if (savedJobs.length > 0 && qualifications.length === 0) {
      const allQuals = new Set<string>()
      const titles = new Set<string>()
      for (const job of savedJobs) {
        titles.add(job.title)
        for (const q of job.qualifications) allQuals.add(q)
        for (const t of job.tags) allQuals.add(t)
      }
      if (!targetTitle && titles.size > 0) {
        setTargetTitle([...titles][0])
      }
      if (allQuals.size > 0) {
        setQualifications([...allQuals].slice(0, 30))
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Import qualifications from saved jobs
  const importFromSavedJobs = useCallback(() => {
    const allQuals = new Set<string>()
    for (const job of savedJobs) {
      for (const q of job.qualifications) allQuals.add(q)
      for (const t of job.tags) allQuals.add(t)
    }
    setQualifications([...allQuals].slice(0, 30))
  }, [savedJobs, setQualifications])

  // Stream listener for resume generation
  useEffect(() => {
    if (!requestId) return

    const cleanupChunk = window.api.onStreamChunk((data) => {
      if (data.id === requestId) {
        appendContent(data.text)
      }
    })

    const cleanupDone = window.api.onStreamDone((data) => {
      if (data.id === requestId) {
        setIsGenerating(false)
        setRequestId(null)
      }
    })

    const cleanupError = window.api.onStreamError((data) => {
      if (data.id === requestId) {
        appendContent('\n\n*Error: ' + data.error + '*')
        setIsGenerating(false)
        setRequestId(null)
      }
    })

    return () => {
      cleanupChunk()
      cleanupDone()
      cleanupError()
    }
  }, [requestId, appendContent, setIsGenerating, setRequestId])

  const handleGenerate = useCallback(async () => {
    if (!targetTitle.trim()) return
    if (isGenerating) return

    const id = `resume-${Date.now()}`
    setRequestId(id)
    setIsGenerating(true)
    setGeneratedContent('')

    // Fetch pipeline data pack for the target role
    const dataPack = await window.api.getResumeDataPack(targetTitle, resumeText || null)

    // Build skills context from pipeline data
    let pipelineContext = ''
    if (dataPack.matchedCategories.length > 0) {
      const allSkills = new Set<string>()
      const allTopics: string[] = []
      const allBullets: string[] = []

      for (const cat of dataPack.matchedCategories) {
        for (const s of cat.skills) allSkills.add(s)
        allTopics.push(...cat.topics.map(t => `${t} (${cat.displayName})`))
        allBullets.push(...cat.experienceBullets)
      }

      // Auto-populate qualifications if empty
      if (qualifications.length === 0) {
        const autoQuals = [...allSkills].slice(0, 20)
        setQualifications(autoQuals)
      }

      pipelineContext = `
INDUSTRY KNOWLEDGE BASE (use these to make the resume technically accurate):

Matched Technology Areas: ${dataPack.matchedCategories.map(c => `${c.displayName} (${c.role})`).join(', ')}

Key Technical Skills to Include:
${[...allSkills].slice(0, 30).map(s => `- ${s}`).join('\n')}

Core Competency Areas:
${allTopics.slice(0, 15).map(t => `- ${t}`).join('\n')}

Real-World Experience Examples (use these as inspiration for bullet points):
${allBullets.slice(0, 10).map(b => `- ${b}`).join('\n')}
`
    }

    const systemPrompt = `You are an elite resume writer who has placed candidates at FAANG, Fortune 500, and top startups. Generate a professional, ATS-optimized resume.

CRITICAL RULES:
- If an existing resume is provided, USE that person's real experience. Enhance it, don't replace it.
- Rewrite bullet points using STAR format with quantifiable results (%, $, #)
- Match EVERY qualification keyword naturally in the resume body for ATS scoring
- Use strong verbs: Architected, Spearheaded, Optimized, Reduced, Increased, Delivered
- Keep it to 1-2 pages max (no fluff)
- Technical skills section should mirror the job's tech stack exactly
- Include specific tools, frameworks, and technologies from the knowledge base below

FORMAT (clean Markdown):
# [Full Name]
[Email] | [Phone] | [LinkedIn] | [Location]

## Professional Summary
2-3 power sentences showing exactly why this person is perfect for this role.

## Technical Skills
**Languages & Frameworks:** ...
**Cloud & Infrastructure:** ...
**Data & Databases:** ...
**Tools & Platforms:** ...

## Professional Experience
### [Title] — [Company] | [Dates]
- [STAR format bullet with metrics]
- [STAR format bullet with metrics]

## Education
### [Degree] — [School] | [Year]

## Certifications (if relevant)
${pipelineContext}`

    // Build a rich context prompt
    const jobContext = selectedJob
      ? `\nTarget Job Posting:\nTitle: ${selectedJob.title}\nCompany: ${selectedJob.company}\nLocation: ${selectedJob.location}\nDescription excerpt: ${selectedJob.description.slice(0, 1500)}`
      : ''

    const userPrompt = `Target Role: ${targetTitle}

Required Qualifications (MUST appear as keywords in resume):
${qualifications.length > 0 ? qualifications.map((q) => `- ${q}`).join('\n') : '- General qualifications for this role'}
${jobContext}

${resumeText ? `\nCandidate's Current Resume:\n${resumeText}\n\nREWRITE this resume to perfectly target the role above. Keep their real experience but optimize every line for ATS and impact.` : 'No existing resume provided. Generate a strong template with realistic placeholder content that the user can customize. Use [Your Name], [Your Email] etc for personal info but make the experience sections feel real and specific with concrete examples they can edit.'}

Generate the resume now.`

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    try {
      await window.api.queryAI({ requestId: id, messages, model: 'gpt-4o-mini' })
    } catch {
      setIsGenerating(false)
      setRequestId(null)
    }
  }, [
    targetTitle,
    qualifications,
    resumeText,
    isGenerating,
    setRequestId,
    setIsGenerating,
    setGeneratedContent
  ])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [generatedContent])

  const handleExportMarkdown = useCallback(() => {
    const blob = new Blob([generatedContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `resume-${targetTitle.toLowerCase().replace(/\s+/g, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [generatedContent, targetTitle])

  return (
    <div className="h-full flex">
      {/* Left panel — inputs */}
      <div className="w-[40%] shrink-0 flex flex-col border-r border-white/5">
        <div className="p-4 border-b border-white/5 shrink-0">
          <h3 className="text-sm font-semibold text-white mb-3">{t('resume.title')}</h3>

          {/* Target title */}
          <label className="block text-xs text-white/50 mb-1">{t('resume.target_title')}</label>
          <input
            type="text"
            placeholder={t('resume.target_placeholder')}
            value={targetTitle}
            onChange={(e) => setTargetTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-green-500/50 mb-4"
          />

          {/* Import from saved jobs */}
          {savedJobs.length > 0 && (
            <button
              onClick={importFromSavedJobs}
              className="flex items-center gap-1.5 text-xs text-brand hover:text-brand-light mb-4 transition-colors"
            >
              <Briefcase className="h-3.5 w-3.5" />
              {t('resume.import_jobs', { count: savedJobs.length })}
            </button>
          )}

          {/* Qualifications */}
          <label className="block text-xs text-white/50 mb-1">{t('resume.qualifications')}</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder={t('resume.add_qual')}
              value={newQual}
              onChange={(e) => setNewQual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newQual.trim()) {
                  addQualification(newQual.trim())
                  setNewQual('')
                }
              }}
              className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-green-500/50"
            />
            <button
              onClick={() => {
                if (newQual.trim()) {
                  addQualification(newQual.trim())
                  setNewQual('')
                }
              }}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-white/50" />
            </button>
          </div>
        </div>

        {/* Qualifications list */}
        <div className="flex-1 overflow-y-auto p-4">
          {qualifications.length === 0 ? (
            <p className="text-xs text-white/20 text-center py-4">
              {t('resume.empty_quals')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {qualifications.map((q) => (
                <span
                  key={q}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-green-500/10 text-green-300 border border-green-500/20"
                >
                  {q}
                  <button
                    onClick={() => removeQualification(q)}
                    className="hover:text-red-300 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Resume source info */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <p className="text-xs text-white/30">
              {resumeText
                ? t('resume.has_resume')
                : t('resume.no_resume')}
            </p>
          </div>
        </div>

        {/* Generate button */}
        <div className="p-4 border-t border-white/5 shrink-0">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !targetTitle.trim()}
            className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('resume.generating')}
              </>
            ) : generatedContent ? (
              <>
                <RefreshCw className="h-4 w-4" />
                {t('resume.regenerate')}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {t('resume.generate')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right panel — preview */}
      <div className="flex-1 min-w-0 flex flex-col">
        {generatedContent ? (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
              <span className="text-xs text-white/40">{t('resume.preview')}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copied ? t('resume.copied') : t('resume.copy')}
                </button>
                <button
                  onClick={handleExportMarkdown}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
                >
                  <Download className="h-3 w-3" />
                  {t('resume.export_md')}
                </button>
              </div>
            </div>
            <div ref={contentRef} className="flex-1 overflow-y-auto px-8 py-6">
              <div className="max-w-3xl mx-auto prose prose-invert prose-sm [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-green-300/80 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-white/60 [&_li]:text-sm [&_li]:text-white/60 [&_strong]:text-white/80 [&_em]:text-white/50 [&_hr]:border-white/5 [&_hr]:my-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{generatedContent}</ReactMarkdown>
                {isGenerating && (
                  <span className="inline-block w-2 h-4 bg-green-400/50 animate-pulse ml-0.5" />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <FileText className="h-10 w-10 text-white/10 mb-4" />
            <p className="text-sm text-white/30">
              {t('resume.empty_title')}
            </p>
            <p className="text-xs text-white/15 mt-2">
              {t('resume.empty_subtitle')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
