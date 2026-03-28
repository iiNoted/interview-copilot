import { useState, useEffect, useMemo } from 'react'
import { useFlashcardStore } from '@renderer/stores/flashcard-store'
import type { Difficulty, Flashcard, FlashcardCategory, CardProgress, SelfRating } from '@renderer/types/flashcards'
import flashcardBank from '@renderer/data/flashcards.json'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Search, RotateCcw, ChevronRight, ChevronLeft,
  Binary, Network, Globe, Server, Database, Cloud,
  Blocks, FileCode2, Code2, Coffee, Shield,
  Brain, Zap, Anchor, Filter, Share2, Wifi, Terminal, Cog, Smartphone, GitBranch,
  Layers, Box, Rocket, Puzzle, Package, RefreshCw, Activity, Lightbulb,
  HardDrive, Target, Cpu, Diamond, Compass, Link, Hash, Lock, Flame, Repeat, Gauge, Award
} from 'lucide-react'

// Map icon string names from JSON to actual Lucide components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Binary, Network, Globe, Server, Database, Cloud, Shield,
  Blocks, FileCode2, Code2, Coffee,
  Brain, Zap, Anchor, Filter, Share2, Wifi, Terminal, Cog, Smartphone, GitBranch,
  Layers, Box, Rocket, Puzzle, Package, RefreshCw, Activity, Lightbulb,
  HardDrive, Target, Cpu, Diamond, Compass, Link, Hash, Lock, Flame, Repeat, Gauge, Award
}

// Tailwind color map for category accent colors
const COLOR_MAP: Record<string, { bg: string; border: string; text: string; ring: string }> = {
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', ring: 'stroke-emerald-400' },
  blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-400',    ring: 'stroke-blue-400' },
  orange:  { bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  text: 'text-orange-400',  ring: 'stroke-orange-400' },
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-400',  ring: 'stroke-violet-400' },
  cyan:    { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    text: 'text-cyan-400',    ring: 'stroke-cyan-400' },
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400',   ring: 'stroke-amber-400' },
  pink:    { bg: 'bg-pink-500/10',    border: 'border-pink-500/30',    text: 'text-pink-400',    ring: 'stroke-pink-400' },
  yellow:  { bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  text: 'text-yellow-400',  ring: 'stroke-yellow-400' },
  red:     { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-400',     ring: 'stroke-red-400' },
  indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30',  text: 'text-indigo-400',  ring: 'stroke-indigo-400' },
  purple:  { bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  text: 'text-purple-400',  ring: 'stroke-purple-400' },
  rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    text: 'text-rose-400',    ring: 'stroke-rose-400' },
  teal:    { bg: 'bg-teal-500/10',    border: 'border-teal-500/30',    text: 'text-teal-400',    ring: 'stroke-teal-400' },
  lime:    { bg: 'bg-lime-500/10',    border: 'border-lime-500/30',    text: 'text-lime-400',    ring: 'stroke-lime-400' },
  sky:     { bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     text: 'text-sky-400',     ring: 'stroke-sky-400' },
  slate:   { bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   text: 'text-slate-400',   ring: 'stroke-slate-400' },
  stone:   { bg: 'bg-stone-500/10',   border: 'border-stone-500/30',   text: 'text-stone-400',   ring: 'stroke-stone-400' },
  fuchsia: { bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30', text: 'text-fuchsia-400', ring: 'stroke-fuchsia-400' },
  zinc:    { bg: 'bg-zinc-500/10',    border: 'border-zinc-500/30',    text: 'text-zinc-400',    ring: 'stroke-zinc-400' }
}

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: 'bg-green-500/15 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  hard: 'bg-red-500/15 text-red-400 border-red-500/30'
}

const RATING_COLORS: Record<SelfRating, string> = {
  knew: 'border-l-green-400',
  partial: 'border-l-yellow-400',
  didnt_know: 'border-l-red-400'
}

function ProgressRing({ reviewed, total, colorClass }: { reviewed: number; total: number; colorClass: string }) {
  const pct = total === 0 ? 0 : reviewed / total
  const r = 14
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct)
  return (
    <svg width="36" height="36" className="shrink-0 -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/5" />
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
        className={colorClass}
        strokeDasharray={circ} strokeDashoffset={offset}
      />
      <text x="18" y="18" textAnchor="middle" dominantBaseline="central"
        className="fill-white/50 text-[9px] font-medium rotate-90 origin-center"
      >
        {reviewed}
      </text>
    </svg>
  )
}

export function FlashcardsTab(): React.JSX.Element {
  const store = useFlashcardStore()
  const [loadedProgress, setLoadedProgress] = useState(false)

  // Load data on mount
  useEffect(() => {
    store.setCategories(flashcardBank.categories as FlashcardCategory[])
    store.setCards(flashcardBank.cards as Flashcard[])
    window.api.getFlashcardProgress().then((p) => {
      store.setProgress(p as Record<string, CardProgress>)
      setLoadedProgress(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') { e.preventDefault(); store.flip() }
      if (e.code === 'ArrowRight') advanceCard(1)
      if (e.code === 'ArrowLeft') advanceCard(-1)
      if (e.key === '1') handleRate('knew')
      if (e.key === '2') handleRate('partial')
      if (e.key === '3') handleRate('didnt_know')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // intentionally no deps — needs current closure

  // Derived data
  const categoryCards = useMemo(() => {
    if (!store.selectedCategoryId) return []
    return store.cards.filter((c) => c.categoryId === store.selectedCategoryId)
  }, [store.cards, store.selectedCategoryId])

  const filteredCards = useMemo(() => {
    if (store.difficultyFilter === 'all') return categoryCards
    return categoryCards.filter((c) => c.difficulty === store.difficultyFilter)
  }, [categoryCards, store.difficultyFilter])

  const selectedCard = useMemo(
    () => store.cards.find((c) => c.id === store.selectedCardId) || null,
    [store.cards, store.selectedCardId]
  )

  const filteredCategories = useMemo(() => {
    if (!store.search) return store.categories
    const q = store.search.toLowerCase()
    return store.categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    )
  }, [store.categories, store.search])

  // Category progress counts
  const categoryProgress = useMemo(() => {
    const map: Record<string, { reviewed: number; total: number }> = {}
    for (const cat of store.categories) {
      const catCards = store.cards.filter((c) => c.categoryId === cat.id)
      const reviewed = catCards.filter((c) => store.progress[c.id]).length
      map[cat.id] = { reviewed, total: catCards.length }
    }
    return map
  }, [store.categories, store.cards, store.progress])

  // Actions
  function advanceCard(dir: number) {
    if (filteredCards.length === 0) return
    const idx = filteredCards.findIndex((c) => c.id === store.selectedCardId)
    const next = idx === -1 ? 0 : (idx + dir + filteredCards.length) % filteredCards.length
    store.selectCard(filteredCards[next].id)
  }

  async function handleRate(rating: SelfRating) {
    if (!store.selectedCardId) return
    const result = await window.api.rateFlashcard(store.selectedCardId, rating)
    store.updateCardProgress(store.selectedCardId, result as CardProgress)
    // Auto-advance to next unreviewed card
    const currentIdx = filteredCards.findIndex((c) => c.id === store.selectedCardId)
    for (let i = 1; i < filteredCards.length; i++) {
      const nextIdx = (currentIdx + i) % filteredCards.length
      if (!store.progress[filteredCards[nextIdx].id]) {
        store.selectCard(filteredCards[nextIdx].id)
        return
      }
    }
    // All reviewed — just advance to next
    advanceCard(1)
  }

  async function handleResetProgress() {
    await window.api.resetFlashcardProgress()
    store.resetProgress()
  }

  const colors = (color: string) => COLOR_MAP[color] || COLOR_MAP.blue

  return (
    <div className="h-full flex">
      {/* Left — Category list */}
      <div className="w-72 shrink-0 flex flex-col border-r border-white/5">
        <div className="p-3 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
            <input
              value={store.search}
              onChange={(e) => store.setSearch(e.target.value)}
              placeholder="Search categories..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredCategories.map((cat) => {
            const Icon = ICON_MAP[cat.icon] || Binary
            const c = colors(cat.color)
            const prog = categoryProgress[cat.id]
            const isActive = store.selectedCategoryId === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => store.selectCategory(cat.id)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors group ${
                  isActive
                    ? `${c.bg} border ${c.border}`
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className={`p-1.5 rounded-md ${c.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${c.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white/80 truncate">{cat.name}</div>
                  <div className="text-[10px] text-white/30 truncate">{cat.description}</div>
                </div>
                {prog && (
                  <ProgressRing reviewed={prog.reviewed} total={prog.total} colorClass={c.ring} />
                )}
              </button>
            )
          })}
          {filteredCategories.length === 0 && (
            <div className="text-center text-white/20 text-xs py-6">No categories found</div>
          )}
        </div>

        {/* Reset progress */}
        {loadedProgress && Object.keys(store.progress).length > 0 && (
          <div className="p-3 border-t border-white/5">
            <button
              onClick={handleResetProgress}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset all progress
            </button>
          </div>
        )}
      </div>

      {/* Middle — Question list */}
      {store.selectedCategoryId && (
        <div className="w-64 shrink-0 flex flex-col border-r border-white/5">
          {/* Difficulty filter tabs */}
          <div className="px-3 py-2 border-b border-white/5 flex gap-1">
            {(['all', 'easy', 'medium', 'hard'] as const).map((d) => (
              <button
                key={d}
                onClick={() => store.setDifficultyFilter(d)}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                  store.difficultyFilter === d
                    ? 'bg-white/10 text-white'
                    : 'text-white/30 hover:text-white/50'
                }`}
              >
                {d === 'all' ? `All (${categoryCards.length})` : `${d.charAt(0).toUpperCase() + d.slice(1)}`}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredCards.length === 0 && (
              <div className="text-center text-white/20 text-xs py-6">No cards match filter</div>
            )}
            {filteredCards.map((card, i) => {
              const prog = store.progress[card.id]
              const isActive = store.selectedCardId === card.id
              const ratingBorder = prog ? RATING_COLORS[prog.rating] : 'border-l-transparent'
              return (
                <button
                  key={card.id}
                  onClick={() => store.selectCard(card.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 border-l-2 transition-colors ${ratingBorder} ${
                    isActive
                      ? 'bg-blue-500/10 border-r border-t border-b border-blue-500/20'
                      : 'hover:bg-white/5 border-r border-t border-b border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-white/20 mt-0.5 shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-white/70 leading-snug line-clamp-2">
                        {card.question}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${DIFFICULTY_COLORS[card.difficulty]}`}>
                          {card.difficulty}
                        </span>
                        {prog && (
                          <span className={`text-[9px] ${
                            prog.rating === 'knew' ? 'text-green-400/60' :
                            prog.rating === 'partial' ? 'text-yellow-400/60' :
                            'text-red-400/60'
                          }`}>
                            {prog.rating === 'knew' ? 'Knew it' : prog.rating === 'partial' ? 'Partial' : "Didn't know"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Right — Flip card viewer */}
      <div className="flex-1 min-w-0 flex flex-col">
        {selectedCard ? (
          <>
            {/* Card navigation bar */}
            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between shrink-0">
              <button onClick={() => advanceCard(-1)} className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded border ${DIFFICULTY_COLORS[selectedCard.difficulty]}`}>
                  {selectedCard.difficulty}
                </span>
                {selectedCard.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[10px] text-white/25 bg-white/5 px-1.5 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
              <button onClick={() => advanceCard(1)} className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Flip card area */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col" onClick={() => store.flip()}>
              <div className="flex-1 flex items-center justify-center cursor-pointer select-none">
                <div className="w-full max-w-2xl">
                  {!store.isFlipped ? (
                    /* Question side */
                    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-8">
                      <div className="text-[10px] text-white/20 uppercase tracking-wider mb-4">Question</div>
                      <div className="text-base text-white/90 leading-relaxed font-medium">
                        {selectedCard.question}
                      </div>
                      <div className="mt-6 text-[10px] text-white/15 text-center">
                        Click or press Space to reveal answer
                      </div>
                    </div>
                  ) : (
                    /* Answer side */
                    <div className="bg-white/[0.03] border border-blue-500/15 rounded-xl p-8">
                      <div className="text-[10px] text-blue-400/40 uppercase tracking-wider mb-4">Answer</div>
                      <div className="prose prose-invert prose-sm max-w-none [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:text-white/90 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-blue-300/70 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-white/70 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:my-1.5 [&_p]:text-white/60 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:text-sm [&_li]:text-white/60 [&_li]:my-0.5 [&_code]:text-xs [&_code]:text-blue-300 [&_code]:bg-white/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:text-xs [&_pre]:bg-white/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_strong]:text-white/80">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedCard.answer}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Rating buttons */}
            {store.isFlipped && (
              <div className="px-6 py-3 border-t border-white/5 flex items-center justify-center gap-3 shrink-0">
                <span className="text-[10px] text-white/20 mr-2">How well did you know this?</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRate('knew') }}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                >
                  Knew It (1)
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRate('partial') }}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors"
                >
                  Partially (2)
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRate('didnt_know') }}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                >
                  Didn't Know (3)
                </button>
              </div>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="text-4xl mb-4 opacity-10">
              <Binary className="h-12 w-12 text-white" />
            </div>
            <p className="text-sm text-white/30">
              {store.selectedCategoryId
                ? 'Select a question to start practicing'
                : 'Select a category to start'}
            </p>
            <p className="text-xs text-white/15 mt-2">
              {store.cards.length} questions across {store.categories.length} categories
            </p>
            <div className="mt-4 text-[10px] text-white/10">
              Space = flip &middot; &larr;&rarr; = navigate &middot; 1/2/3 = rate
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
