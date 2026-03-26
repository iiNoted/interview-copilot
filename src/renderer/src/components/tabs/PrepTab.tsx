import { useState, useEffect, useRef } from 'react'
import { useOverlayStore } from '@renderer/stores/overlay-store'
import { Search, BookOpen, ChevronRight, FileText, ArrowLeft, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useT } from '@renderer/i18n/context'

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

export function PrepTab(): React.JSX.Element {
  const { t } = useT()
  const { resumeText } = useOverlayStore()
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<CategoryDetail | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<ArticleSummary | null>(null)
  const [articleContent, setArticleContent] = useState<string | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingArticle, setLoadingArticle] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getCategories(resumeText || undefined).then((cats) => {
      setCategories(cats)
      setLoadingCategories(false)
    })
  }, [resumeText])

  async function handleSelectCategory(key: string) {
    const detail = await window.api.getCategoryDetail(key)
    if (detail) {
      setSelectedCategory(detail)
      setSelectedArticle(null)
      setArticleContent(null)
    }
  }

  async function handleSelectArticle(article: ArticleSummary) {
    if (!selectedCategory) return
    setSelectedArticle(article)
    setLoadingArticle(true)
    const content = await window.api.getArticleContent(selectedCategory.key, article.filename)
    setArticleContent(content)
    setLoadingArticle(false)
    if (contentRef.current) contentRef.current.scrollTop = 0
  }

  const filtered = categories.filter(
    (c) =>
      c.displayName.toLowerCase().includes(search.toLowerCase()) ||
      c.key.includes(search.toLowerCase())
  )

  return (
    <div className="h-full flex">
      {/* Left sidebar — category + article list */}
      <div className="w-72 shrink-0 flex flex-col border-r border-white/5">
        <div className="p-3 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('prep.search_placeholder')}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loadingCategories ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/20" />
            </div>
          ) : (
            filtered.map((cat) => (
              <button
                key={cat.key}
                onClick={() => handleSelectCategory(cat.key)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors group ${
                  selectedCategory?.key === cat.key
                    ? 'bg-blue-500/10 border border-blue-500/20'
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5 text-blue-400/60 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white/80 truncate">
                    {cat.displayName}
                  </div>
                  {(cat.articleCount ?? 0) > 0 && (
                    <div className="text-[10px] text-white/30">
                      {t('prep.guides', { count: cat.articleCount ?? 0 })}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-3 w-3 text-white/20 group-hover:text-white/50 shrink-0" />
              </button>
            ))
          )}
          {!loadingCategories && filtered.length === 0 && (
            <div className="text-center text-white/20 text-xs py-6">{t('prep.no_categories')}</div>
          )}
        </div>
      </div>

      {/* Middle — article list */}
      {selectedCategory && (
        <div className="w-64 shrink-0 flex flex-col border-r border-white/5">
          <div className="px-3 py-2.5 border-b border-white/5">
            <div className="text-sm font-semibold text-white/90">{selectedCategory.displayName}</div>
            <div className="text-[10px] text-white/40 mt-0.5">{selectedCategory.role}</div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {selectedCategory.articles.length === 0 && (
              <div className="text-center text-white/20 text-xs py-6">
                {t('prep.no_guides')}
              </div>
            )}
            {selectedCategory.articles.map((article) => (
              <button
                key={article.filename}
                onClick={() => handleSelectArticle(article)}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors group ${
                  selectedArticle?.filename === article.filename
                    ? 'bg-blue-500/10 border border-blue-500/20'
                    : 'hover:bg-white/5 border border-transparent'
                }`}
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
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Right — article reader */}
      <div className="flex-1 min-w-0 flex flex-col">
        {loadingArticle ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/20" />
          </div>
        ) : articleContent && selectedArticle ? (
          <>
            <div className="px-6 py-3 border-b border-white/5 shrink-0">
              <button
                onClick={() => { setSelectedArticle(null); setArticleContent(null) }}
                className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                {t('prep.back')}
              </button>
            </div>
            <div ref={contentRef} className="flex-1 overflow-y-auto px-8 py-6">
              <div className="max-w-3xl mx-auto prose prose-invert prose-sm max-w-none [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:text-white/90 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-blue-300/80 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-white/70 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:my-2 [&_p]:text-white/60 [&_ul]:my-2 [&_ol]:my-2 [&_li]:text-sm [&_li]:text-white/60 [&_li]:my-0.5 [&_code]:text-xs [&_code]:text-blue-300 [&_code]:bg-white/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:text-xs [&_pre]:bg-white/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:border-blue-400/30 [&_blockquote]:pl-4 [&_blockquote]:my-3 [&_blockquote]:text-white/50 [&_hr]:my-4 [&_hr]:border-white/5 [&_em]:text-white/50 [&_strong]:text-white/80">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{articleContent}</ReactMarkdown>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <BookOpen className="h-10 w-10 text-white/10 mb-4" />
            <p className="text-sm text-white/30">
              {selectedCategory
                ? t('prep.select_article')
                : t('prep.select_category')}
            </p>
            <p className="text-xs text-white/15 mt-2">
              {t('prep.category_count', { count: categories.length })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
