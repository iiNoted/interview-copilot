// Detects interview questions from transcript lines

const QUESTION_STARTERS = [
  'tell me',
  'walk me through',
  'can you explain',
  'can you describe',
  'can you tell',
  'what is',
  'what are',
  'what was',
  'what were',
  'what do you',
  'what did you',
  'what would you',
  'what have you',
  'how do you',
  'how did you',
  'how would you',
  'how have you',
  'why do you',
  'why did you',
  'why would you',
  'describe',
  'explain',
  'give me an example',
  'where do you see',
  'when have you',
  'have you ever',
  'do you have experience',
  'what experience do you',
  'what challenges',
  'what strengths',
  'what weaknesses',
  'what motivates',
  'what interests you',
  "what's your",
  'what is your',
  'how familiar are you',
  'are you comfortable',
  'could you share',
  'would you mind'
]

export function isLikelyQuestion(line: string): boolean {
  const lower = line.toLowerCase().trim()

  // Skip system lines and very short
  if (lower.startsWith('[') || lower.length < 10) return false

  // Direct question mark
  if (lower.endsWith('?')) return true

  // Starts with question pattern
  for (const starter of QUESTION_STARTERS) {
    if (lower.startsWith(starter)) return true
  }

  return false
}

// Debounce: only process a line after it hasn't changed for this many ms
export const QUESTION_DEBOUNCE_MS = 2000
