export type Difficulty = 'easy' | 'medium' | 'hard'
export type SelfRating = 'knew' | 'partial' | 'didnt_know'

export interface Flashcard {
  id: string
  categoryId: string
  question: string
  answer: string
  difficulty: Difficulty
  tags: string[]
}

export interface FlashcardCategory {
  id: string
  name: string
  icon: string
  description: string
  color: string
}

export interface FlashcardBank {
  version: number
  categories: FlashcardCategory[]
  cards: Flashcard[]
}

export interface CardProgress {
  cardId: string
  rating: SelfRating
  reviewedAt: number
  reviewCount: number
}
