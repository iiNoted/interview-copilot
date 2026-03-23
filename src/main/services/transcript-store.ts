import Store from 'electron-store'
import { dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'

interface SavedQuestion {
  question: string
  response: string
  timestamp: number
}

interface TranscriptSession {
  id: string
  savedAt: number
  lineCount: number
  questionCount: number
  lines: string[]
  questions: SavedQuestion[]
}

const store = new Store<{ transcripts: TranscriptSession[] }>({
  defaults: { transcripts: [] }
})

export function saveTranscript(
  lines: string[],
  questions: Array<{ question: string; response: string; timestamp: number }>
): TranscriptSession {
  const session: TranscriptSession = {
    id: `ts-${Date.now()}`,
    savedAt: Date.now(),
    lineCount: lines.length,
    questionCount: questions.length,
    lines,
    questions
  }
  const all = store.get('transcripts')
  all.push(session)
  // Keep max 50 sessions
  if (all.length > 50) all.shift()
  store.set('transcripts', all)
  return session
}

export function getTranscriptHistory(): Array<{
  id: string
  savedAt: number
  lineCount: number
  questionCount: number
}> {
  return store.get('transcripts').map((s) => ({
    id: s.id,
    savedAt: s.savedAt,
    lineCount: s.lineCount,
    questionCount: s.questionCount
  }))
}

export function getTranscript(id: string): TranscriptSession | null {
  return store.get('transcripts').find((s) => s.id === id) || null
}

export async function exportTranscript(
  id: string,
  parentWindow: BrowserWindow | null
): Promise<boolean> {
  const session = getTranscript(id)
  if (!session) return false

  const result = await dialog.showSaveDialog(parentWindow || BrowserWindow.getFocusedWindow()!, {
    title: 'Export Transcript',
    defaultPath: `interview-${new Date(session.savedAt).toISOString().slice(0, 10)}.md`,
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] }
    ]
  })

  if (result.canceled || !result.filePath) return false

  let content = `# Interview Transcript\n`
  content += `_${new Date(session.savedAt).toLocaleString()}_\n\n`

  if (session.lines.length > 0) {
    content += `## Transcript\n\n`
    for (const line of session.lines) {
      content += `${line}\n\n`
    }
  }

  if (session.questions.length > 0) {
    content += `## Detected Questions & AI Responses\n\n`
    for (const q of session.questions) {
      content += `### Q: ${q.question}\n\n`
      content += `${q.response}\n\n---\n\n`
    }
  }

  writeFileSync(result.filePath, content, 'utf-8')
  return true
}
