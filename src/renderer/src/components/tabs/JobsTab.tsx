import { useState, useCallback, useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import { useJobStore, type JobListing } from '@renderer/stores/job-store'
import { useT } from '@renderer/i18n/context'
import { formatSalary as formatSalaryI18n } from '@renderer/i18n/currency'
import { LOCALE_COUNTRY, ALL_LOCALES, LOCALE_NAMES, type Locale } from '@renderer/i18n/types'
import {
  Search,
  Loader2,
  MapPin,
  Building2,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  X,
  Wifi,
  Clock,
  ChevronRight,
  Sparkles
} from 'lucide-react'

function timeAgo(dateStr: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return t('jobs.time.today')
  if (days === 1) return t('jobs.time.yesterday')
  if (days < 7) return t('jobs.time.days_ago', { count: days })
  if (days < 30) return t('jobs.time.weeks_ago', { count: Math.floor(days / 7) })
  return t('jobs.time.months_ago', { count: Math.floor(days / 30) })
}

function JobCard({
  job,
  isSelected,
  isSaved,
  onSelect,
  onSave,
  t,
  locale
}: {
  job: JobListing
  isSelected: boolean
  isSaved: boolean
  onSelect: () => void
  onSave: () => void
  t: (key: string, vars?: Record<string, string | number>) => string
  locale: Locale
}) {
  const salary = formatSalaryI18n(locale, job.salaryMin, job.salaryMax)

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-lg border transition-colors ${
        isSelected
          ? 'bg-purple-500/10 border-purple-500/30'
          : 'bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10'
      }`}
    >
      <div className="flex items-start gap-3">
        {job.companyLogo ? (
          <img
            src={job.companyLogo}
            alt=""
            className="w-10 h-10 rounded-lg object-cover shrink-0 bg-white/5"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-white/20" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium text-white truncate">{job.title}</h3>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSave()
              }}
              className="shrink-0 p-1 -m-1 hover:bg-white/10 rounded"
            >
              {isSaved ? (
                <BookmarkCheck className="h-4 w-4 text-purple-400" />
              ) : (
                <Bookmark className="h-4 w-4 text-white/20 hover:text-white/40" />
              )}
            </button>
          </div>
          <p className="text-xs text-white/50 mt-0.5">{job.company}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-white/40">
              <MapPin className="h-3 w-3" />
              {job.location}
            </span>
            {job.remote && (
              <span className="flex items-center gap-1 text-xs text-green-400/70">
                <Wifi className="h-3 w-3" />
                {t('jobs.remote')}
              </span>
            )}
            {salary && <span className="text-xs text-amber-400/70">{salary}</span>}
            <span className="flex items-center gap-1 text-xs text-white/30">
              <Clock className="h-3 w-3" />
              {timeAgo(job.postedAt, t)}
            </span>
          </div>
          {job.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {job.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/40"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-white/10 shrink-0 mt-1" />
      </div>
    </button>
  )
}

// Inline AI explanation card for qualifications / selected text
function AIExplainCard({
  text,
  jobTitle,
  company,
  onClose
}: {
  text: string
  jobTitle: string
  company: string
  onClose: () => void
}) {
  const [response, setResponse] = useState('')
  const [isStreaming, setIsStreaming] = useState(true)
  const requestIdRef = useRef(`job-explain-${Date.now()}`)

  useEffect(() => {
    const requestId = requestIdRef.current
    const systemPrompt = `You are a career advisor. The user highlighted a qualification or term from a job posting for "${jobTitle}" at "${company}". Explain:
1. What this means in practical terms
2. What skills/experience employers expect when they list this
3. How to talk about it in an interview (1-2 sentence example)

Be concise — max 150 words. Use plain language, not textbook definitions.`

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Explain this job requirement: "${text}"` }
    ]

    const removeChunk = window.api.onStreamChunk((data) => {
      if (data.id === requestId) setResponse((prev) => prev + data.text)
    })
    const removeDone = window.api.onStreamDone((data) => {
      if (data.id === requestId) setIsStreaming(false)
    })
    const removeError = window.api.onStreamError((data) => {
      if (data.id === requestId) {
        setResponse('Failed to get explanation. Check your AI settings.')
        setIsStreaming(false)
      }
    })

    window.api.queryAI({ requestId, messages, model: 'claude-haiku-4-5-20251001' })

    return () => {
      removeChunk()
      removeDone()
      removeError()
    }
  }, [text, jobTitle, company])

  return (
    <div className="mt-2 bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 relative">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-xs font-medium text-purple-300">AI Explain</span>
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-white/10">
          <X className="h-3.5 w-3.5 text-white/40" />
        </button>
      </div>
      <p className="text-[10px] text-purple-400/60 mb-1.5 italic">"{text}"</p>
      <div className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">
        {response || (isStreaming ? 'Thinking...' : '')}
        {isStreaming && <span className="inline-block w-1.5 h-3 bg-purple-400/60 animate-pulse ml-0.5" />}
      </div>
    </div>
  )
}

function JobDetail({
  job,
  isSaved,
  onClose,
  onSave,
  t,
  locale
}: {
  job: JobListing
  isSaved: boolean
  onClose: () => void
  onSave: () => void
  t: (key: string, vars?: Record<string, string | number>) => string
  locale: Locale
}) {
  const [explainText, setExplainText] = useState<string | null>(null)
  const descRef = useRef<HTMLDivElement>(null)

  // Text selection handler — show AI explain on mouseup if text is selected
  const handleDescriptionMouseUp = useCallback(() => {
    const selection = window.getSelection()
    const selected = selection?.toString().trim()
    if (selected && selected.length >= 3 && selected.length <= 500) {
      setExplainText(selected)
    }
  }, [])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <h2 className="text-sm font-semibold text-white truncate">{job.title}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onSave}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title={isSaved ? t('jobs.unsave') : t('jobs.save')}
          >
            {isSaved ? (
              <BookmarkCheck className="h-4 w-4 text-purple-400" />
            ) : (
              <Bookmark className="h-4 w-4 text-white/40" />
            )}
          </button>
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title={t('jobs.open_browser')}
          >
            <ExternalLink className="h-4 w-4 text-white/40" />
          </a>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4 text-white/40" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          {job.companyLogo ? (
            <img
              src={job.companyLogo}
              alt=""
              className="w-12 h-12 rounded-lg object-cover bg-white/5"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-white/20" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-white">{job.company}</p>
            <p className="text-xs text-white/40">{job.location}</p>
            {formatSalaryI18n(locale, job.salaryMin, job.salaryMax) && (
              <p className="text-xs text-amber-400/80 mt-0.5">
                {formatSalaryI18n(locale, job.salaryMin, job.salaryMax)}
              </p>
            )}
          </div>
        </div>

        {job.qualifications.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
              {t('jobs.qualifications')}
              <span className="ml-2 text-[10px] font-normal text-purple-400/50 normal-case tracking-normal">
                Click any to explain with AI
              </span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {job.qualifications.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setExplainText(explainText === q ? null : q)}
                  className={`px-2 py-1 rounded-md text-xs border transition-colors cursor-pointer ${
                    explainText === q
                      ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                      : 'bg-purple-500/10 text-purple-300 border-purple-500/20 hover:bg-purple-500/15 hover:border-purple-500/30'
                  }`}
                >
                  <Sparkles className="h-3 w-3 inline mr-1 opacity-40" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {explainText && (
          <AIExplainCard
            text={explainText}
            jobTitle={job.title}
            company={job.company}
            onClose={() => setExplainText(null)}
          />
        )}

        <div>
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
            {t('jobs.description')}
            <span className="ml-2 text-[10px] font-normal text-purple-400/50 normal-case tracking-normal">
              Highlight text to explain
            </span>
          </h3>
          <div
            ref={descRef}
            onMouseUp={handleDescriptionMouseUp}
            className="text-sm text-white/70 leading-relaxed prose prose-invert prose-sm max-w-none [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:mb-2 [&>li]:mb-1 cursor-text select-text"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(
                job.description.replace(/\n/g, '<br/>'),
                { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p', 'ul', 'ol', 'li', 'h3', 'h4', 'span', 'a'], ALLOWED_ATTR: ['href', 'target', 'rel'] }
              )
            }}
          />
        </div>

        <div className="pt-2 border-t border-white/5">
          <p className="text-xs text-white/30">
            {t('jobs.source', { source: job.source === 'remoteok' ? 'RemoteOK' : 'JSearch', time: timeAgo(job.postedAt, t) })}
          </p>
        </div>
      </div>
    </div>
  )
}

export function JobsTab(): React.JSX.Element {
  const {
    query,
    remoteOnly,
    jobs,
    loading,
    selectedJob,
    savedJobs,
    error,
    setQuery,
    setRemoteOnly,
    setJobs,
    setLoading,
    setSelectedJob,
    setError,
    saveJob,
    unsaveJob
  } = useJobStore()

  const { t, locale } = useT()
  const [searchInput, setSearchInput] = useState(query)
  const [country, setCountry] = useState<string>('')
  const autoSearched = useRef(false)

  useEffect(() => {
    if (!country && locale !== 'en') {
      setCountry(LOCALE_COUNTRY[locale] || '')
    }
  }, [locale]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load trending jobs on first mount if empty
  useEffect(() => {
    if (autoSearched.current || jobs.length > 0 || loading) return
    autoSearched.current = true

    const defaultQuery = 'developer'
    setSearchInput(defaultQuery)
    setQuery(defaultQuery)
    setLoading(true)
    setError(null)

    window.api
      .searchJobs({ query: defaultQuery, remote: remoteOnly, country: country || undefined })
      .then((results) => setJobs(results))
      .catch(() => setError(t('jobs.load_failed')))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(async () => {
    const q = searchInput.trim()
    if (!q) return

    setQuery(q)
    setLoading(true)
    setError(null)
    setSelectedJob(null)

    try {
      const results = await window.api.searchJobs({ query: q, remote: remoteOnly, country: country || undefined })
      setJobs(results)
    } catch {
      setError(t('jobs.search_failed'))
    } finally {
      setLoading(false)
    }
  }, [searchInput, remoteOnly, country, t, setQuery, setLoading, setError, setSelectedJob, setJobs])

  const toggleSave = useCallback(
    (job: JobListing) => {
      if (savedJobs.some((j) => j.id === job.id)) {
        unsaveJob(job.id)
      } else {
        saveJob(job)
      }
    },
    [savedJobs, saveJob, unsaveJob]
  )

  return (
    <div className="h-full flex">
      {/* Left: search + results list */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-white/5">
        {/* Search bar */}
        <div className="p-3 border-b border-white/5 space-y-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              <Search className="h-4 w-4 text-white/30 shrink-0" />
              <input
                type="text"
                placeholder={t('jobs.search_placeholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !searchInput.trim()}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('jobs.search')}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/30"
              />
              <span className="text-xs text-white/50">{t('jobs.remote_only')}</span>
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            >
              <option value="">{t('jobs.all_countries')}</option>
              {ALL_LOCALES.map((loc) => (
                <option key={loc} value={LOCALE_COUNTRY[loc]}>
                  {LOCALE_NAMES[loc]} ({LOCALE_COUNTRY[loc]})
                </option>
              ))}
            </select>
            {jobs.length > 0 && (
              <span className="text-xs text-white/30">{t('jobs.results', { count: jobs.length })}</span>
            )}
            {savedJobs.length > 0 && (
              <span className="text-xs text-purple-400/60">
                {t('jobs.saved', { count: savedJobs.length })}
              </span>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {error && (
            <div className="text-center py-8">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {!loading && jobs.length === 0 && !error && (
            <div className="text-center py-16">
              <Search className="h-8 w-8 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">
                {query ? t('jobs.no_results') : t('jobs.get_started')}
              </p>
            </div>
          )}

          {loading && (
            <div className="text-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400/50 mx-auto mb-3" />
              <p className="text-sm text-white/30">{t('jobs.searching')}</p>
            </div>
          )}

          {!loading &&
            jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isSelected={selectedJob?.id === job.id}
                isSaved={savedJobs.some((j) => j.id === job.id)}
                onSelect={() => setSelectedJob(job)}
                onSave={() => toggleSave(job)}
                t={t}
                locale={locale}
              />
            ))}
        </div>
      </div>

      {/* Right: job detail panel */}
      <div className="w-[45%] shrink-0">
        {selectedJob ? (
          <JobDetail
            job={selectedJob}
            isSaved={savedJobs.some((j) => j.id === selectedJob.id)}
            onClose={() => setSelectedJob(null)}
            onSave={() => toggleSave(selectedJob)}
            t={t}
            locale={locale}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-white/20">{t('jobs.select_detail')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
