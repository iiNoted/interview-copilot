import { useState, useEffect, useRef } from 'react'
import { useOverlayStore } from '@renderer/stores/overlay-store'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { ArrowLeft, Search, BookOpen, ChevronRight, FileText, Radar, List } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { QualificationChart } from './QualificationChart'
import { extractQualifications } from '@renderer/lib/jd-parser'

interface CategorySummary {
  key: string
  displayName: string
  role: string
  articleCount?: number
  topicCount: number
  totalEvidence?: number
  totalClaims?: number
  totalResolutions?: number
  hasFunctionCatalog?: boolean
}

interface ArticleSummary {
  filename: string
  title: string
  subtitle: string
  topicKey: string
}

interface CategoryDetail {
  key: string
  displayName: string
  role: string
  articles: ArticleSummary[]
}

// --- Category List ---
function CategoryList({
  categories,
  search,
  setSearch,
  onSelect
}: {
  categories: CategorySummary[]
  search: string
  setSearch: (s: string) => void
  onSelect: (key: string) => void
}): React.JSX.Element {
  const filtered = categories.filter(
    (c) =>
      c.displayName.toLowerCase().includes(search.toLowerCase()) ||
      c.key.includes(search.toLowerCase())
  )

  return (
    <>
      <div className="px-3 py-2 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search technologies..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          {filtered.map((cat) => (
            <button
              key={cat.key}
              onClick={() => onSelect(cat.key)}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/5 transition-colors group"
            >
              <BookOpen className="h-3.5 w-3.5 text-blue-400/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white/80 truncate">
                  {cat.displayName}
                </div>
                {(cat.articleCount ?? 0) > 0 && (
                  <div className="text-[10px] text-white/30">
                    {cat.articleCount} guide{cat.articleCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              <ChevronRight className="h-3 w-3 text-white/20 group-hover:text-white/50 shrink-0" />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-white/20 text-xs py-6">No categories found</div>
          )}
        </div>
      </ScrollArea>
    </>
  )
}

// --- Article List (Category Detail) ---
function ArticleList({
  detail,
  onBack,
  onSelectArticle
}: {
  detail: CategoryDetail
  onBack: () => void
  onSelectArticle: (article: ArticleSummary) => void
}): React.JSX.Element {
  return (
    <>
      <div className="px-3 py-2 border-b border-white/5">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80 transition-colors mb-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>
        <div className="text-sm font-semibold text-white/90">{detail.displayName}</div>
        <div className="text-[10px] text-white/40">{detail.role}</div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {detail.articles.length === 0 && (
            <div className="text-center text-white/20 text-xs py-6">
              No guides available yet for this category
            </div>
          )}
          {detail.articles.map((article) => (
            <button
              key={article.filename}
              onClick={() => onSelectArticle(article)}
              className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-white/5 transition-colors group border border-transparent hover:border-white/5"
            >
              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-blue-400/50 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-white/80 leading-snug line-clamp-2">
                    {article.title}
                  </div>
                  {article.subtitle && (
                    <div className="text-[10px] text-white/30 mt-0.5 line-clamp-2 leading-snug italic">
                      {article.subtitle}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-3 w-3 text-white/15 group-hover:text-white/40 shrink-0 mt-0.5" />
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </>
  )
}

// --- Article Reader ---
function ArticleReader({
  categoryKey,
  article,
  onBack
}: {
  categoryKey: string
  article: ArticleSummary
  onBack: () => void
}): React.JSX.Element {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    window.api.getArticleContent(categoryKey, article.filename).then((c) => {
      setContent(c)
      setLoading(false)
      // Scroll to top
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    })
  }, [categoryKey, article.filename])

  return (
    <>
      <div className="px-3 py-2 border-b border-white/5">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="px-3 py-3">
          {loading ? (
            <div className="text-center text-white/20 text-xs py-8">Loading...</div>
          ) : content ? (
            <div className="prose prose-invert prose-xs max-w-none [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:text-white/90 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-blue-300/80 [&_h3]:text-xs [&_h3]:font-medium [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-white/70 [&_p]:text-[11px] [&_p]:leading-relaxed [&_p]:my-1.5 [&_p]:text-white/60 [&_ul]:my-1 [&_ol]:my-1 [&_li]:text-[11px] [&_li]:text-white/60 [&_li]:my-0 [&_code]:text-[10px] [&_code]:text-blue-300 [&_code]:bg-white/5 [&_code]:px-1 [&_code]:rounded [&_pre]:text-[10px] [&_pre]:bg-white/5 [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:border-blue-400/30 [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-white/50 [&_hr]:my-3 [&_hr]:border-white/5 [&_em]:text-white/50 [&_strong]:text-white/80">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-center text-white/20 text-xs py-8">Article not found</div>
          )}
        </div>
      </ScrollArea>
    </>
  )
}

// --- Qualification Map ---
function QualificationMap({
  onSelectCategory
}: {
  onSelectCategory: (key: string) => void
}): React.JSX.Element {
  const { extractedQualifications } = useOverlayStore()

  const chartData = extractedQualifications.map((q) => ({
    keyword: q.keyword,
    displayName: q.displayName,
    coverageScore: q.coverageScore,
    resumeMatch: q.resumeMatch,
    category: q.category
  }))

  function handleAxisClick(qual: { category: string }): void {
    onSelectCategory(qual.category)
  }

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-3 space-y-3">
        {/* Radar chart */}
        <div className="flex justify-center">
          <QualificationChart
            qualifications={chartData}
            onClickAxis={handleAxisClick}
            size={280}
          />
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 justify-center text-[9px] text-white/40">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500/60" /> Strong (60+)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500/60" /> Moderate (30-59)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500/60" /> Gap (&lt;30)
          </span>
        </div>

        {/* Qualification list below chart */}
        <div className="space-y-1">
          {extractedQualifications.map((q) => (
            <button
              key={`${q.category}-${q.keyword}`}
              onClick={() => onSelectCategory(q.category)}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white/80 truncate">
                  {q.displayName}
                </div>
                <div className="text-[10px] text-white/30">{q.category}</div>
              </div>
              {/* Coverage bar */}
              <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    q.coverageScore >= 60
                      ? 'bg-green-500/60'
                      : q.coverageScore >= 30
                        ? 'bg-yellow-500/60'
                        : 'bg-red-500/60'
                  }`}
                  style={{ width: `${q.coverageScore}%` }}
                />
              </div>
              <span className="text-[10px] text-white/30 w-6 text-right">{q.coverageScore}</span>
              {q.resumeMatch && (
                <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1 rounded">R</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}

// --- Main KnowledgePanel ---
export function KnowledgePanel(): React.JSX.Element {
  const { resumeText, jobText, extractedQualifications, knowledgeView, setExtractedQualifications, setKnowledgeView } = useOverlayStore()
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [search, setSearch] = useState('')
  const [selectedDetail, setSelectedDetail] = useState<CategoryDetail | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<ArticleSummary | null>(null)
  const [loading, setLoading] = useState(true)

  // Load categories
  useEffect(() => {
    window.api.getCategories(resumeText || undefined, jobText || undefined).then((cats) => {
      setCategories(cats)
      setLoading(false)
    })
  }, [resumeText, jobText])

  // Auto-extract qualifications when JD changes
  useEffect(() => {
    if (!jobText) {
      setExtractedQualifications([])
      if (knowledgeView === 'map') setKnowledgeView('browse')
      return
    }

    window.api.getQualificationsDb().then((db) => {
      const quals = extractQualifications(jobText, db, resumeText)
      setExtractedQualifications(quals)
      if (quals.length >= 3) setKnowledgeView('map')
    })
  }, [jobText, resumeText, setExtractedQualifications, setKnowledgeView, knowledgeView])

  async function handleSelectCategory(key: string): Promise<void> {
    const detail = await window.api.getCategoryDetail(key)
    if (detail) setSelectedDetail(detail)
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-white/20 text-xs">
        Loading...
      </div>
    )
  }

  // Article reader
  if (selectedDetail && selectedArticle) {
    return (
      <div className="flex flex-col h-full">
        <ArticleReader
          categoryKey={selectedDetail.key}
          article={selectedArticle}
          onBack={() => setSelectedArticle(null)}
        />
      </div>
    )
  }

  // Article list (category detail)
  if (selectedDetail) {
    return (
      <div className="flex flex-col h-full">
        <ArticleList
          detail={selectedDetail}
          onBack={() => { setSelectedDetail(null); setSelectedArticle(null) }}
          onSelectArticle={setSelectedArticle}
        />
      </div>
    )
  }

  // Has JD with qualifications → show view toggle
  const hasQualMap = extractedQualifications.length >= 3

  return (
    <div className="flex flex-col h-full">
      {/* View toggle (only when JD is loaded and qualifications matched) */}
      {hasQualMap && (
        <div className="flex px-3 pt-2 gap-1">
          <button
            onClick={() => setKnowledgeView('map')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              knowledgeView === 'map'
                ? 'bg-blue-500/20 text-blue-300'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Radar className="h-3 w-3" />
            Qualification Map
          </button>
          <button
            onClick={() => setKnowledgeView('browse')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              knowledgeView === 'browse'
                ? 'bg-blue-500/20 text-blue-300'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <List className="h-3 w-3" />
            Browse All
          </button>
        </div>
      )}

      {/* Qualification Map view */}
      {hasQualMap && knowledgeView === 'map' ? (
        <QualificationMap onSelectCategory={handleSelectCategory} />
      ) : (
        <CategoryList
          categories={categories}
          search={search}
          setSearch={setSearch}
          onSelect={handleSelectCategory}
        />
      )}
    </div>
  )
}
