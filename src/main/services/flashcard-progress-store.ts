import Store from 'electron-store'

export type SelfRating = 'knew' | 'partial' | 'didnt_know'

export interface CardProgress {
  cardId: string
  rating: SelfRating
  reviewedAt: number
  reviewCount: number
}

const store = new Store<{ progress: Record<string, CardProgress> }>({
  name: 'flashcard-progress',
  defaults: { progress: {} }
})

export function getFlashcardProgress(): Record<string, CardProgress> {
  return store.get('progress')
}

export function rateFlashcard(cardId: string, rating: SelfRating): CardProgress {
  const all = store.get('progress')
  const existing = all[cardId]
  const updated: CardProgress = {
    cardId,
    rating,
    reviewedAt: Date.now(),
    reviewCount: (existing?.reviewCount || 0) + 1
  }
  all[cardId] = updated
  store.set('progress', all)
  return updated
}

export function resetFlashcardProgress(): void {
  store.set('progress', {})
}
