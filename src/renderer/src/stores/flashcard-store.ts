import { create } from 'zustand'
import type { Difficulty, Flashcard, FlashcardCategory, CardProgress } from '@renderer/types/flashcards'

interface FlashcardState {
  categories: FlashcardCategory[]
  cards: Flashcard[]
  selectedCategoryId: string | null
  selectedCardId: string | null
  difficultyFilter: Difficulty | 'all'
  search: string
  isFlipped: boolean
  progress: Record<string, CardProgress>

  setCategories: (cats: FlashcardCategory[]) => void
  setCards: (cards: Flashcard[]) => void
  selectCategory: (id: string | null) => void
  selectCard: (id: string | null) => void
  setDifficultyFilter: (d: Difficulty | 'all') => void
  setSearch: (s: string) => void
  flip: () => void
  unflip: () => void
  setProgress: (p: Record<string, CardProgress>) => void
  updateCardProgress: (cardId: string, progress: CardProgress) => void
  resetProgress: () => void
}

export const useFlashcardStore = create<FlashcardState>((set) => ({
  categories: [],
  cards: [],
  selectedCategoryId: null,
  selectedCardId: null,
  difficultyFilter: 'all',
  search: '',
  isFlipped: false,
  progress: {},

  setCategories: (categories) => set({ categories }),
  setCards: (cards) => set({ cards }),
  selectCategory: (id) => set({ selectedCategoryId: id, selectedCardId: null, isFlipped: false }),
  selectCard: (id) => set({ selectedCardId: id, isFlipped: false }),
  setDifficultyFilter: (difficultyFilter) => set({ difficultyFilter }),
  setSearch: (search) => set({ search }),
  flip: () => set((s) => ({ isFlipped: !s.isFlipped })),
  unflip: () => set({ isFlipped: false }),
  setProgress: (progress) => set({ progress }),
  updateCardProgress: (cardId, progress) =>
    set((s) => ({ progress: { ...s.progress, [cardId]: progress } })),
  resetProgress: () => set({ progress: {} })
}))
