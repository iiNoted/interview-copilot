import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isStreaming?: boolean
}

export interface DetectedQuestion {
  id: string
  question: string
  transcriptIndex: number
  timestamp: number
  response: string
  isStreaming: boolean
}

interface OverlayState {
  mode: 'minimized' | 'compact' | 'expanded'
  isTranscribing: boolean
  currentModel: string
  messages: Message[]
  transcript: string[]
  webSearchEnabled: boolean
  sourcethreadEnabled: boolean
  resumeText: string | null
  resumeFilename: string | null
  jobText: string | null
  jobFilename: string | null
  showSettings: boolean

  // AI sidebar state
  aiBackend: 'openclaw' | 'anthropic'
  detectedQuestions: DetectedQuestion[]
  processedTranscriptIndices: Set<number>

  setMode: (mode: OverlayState['mode']) => void
  setModel: (model: string) => void
  setTranscribing: (val: boolean) => void
  toggleWebSearch: () => void
  toggleSourcethread: () => void
  setAiBackend: (backend: 'openclaw' | 'anthropic') => void
  setShowSettings: (show: boolean) => void

  addMessage: (msg: Message) => void
  updateMessage: (id: string, content: string) => void
  appendToMessage: (id: string, text: string) => void
  finishStreaming: (id: string) => void
  clearMessages: () => void

  addTranscriptLine: (line: string) => void
  updateTranscriptLine: (index: number, text: string) => void
  deleteTranscriptLine: (index: number) => void
  clearTranscript: () => void

  setResume: (text: string, filename: string) => void
  clearResume: () => void
  setJob: (text: string, filename: string) => void
  clearJob: () => void

  // AI sidebar actions
  addDetectedQuestion: (q: DetectedQuestion) => void
  appendToQuestion: (id: string, text: string) => void
  finishQuestionStreaming: (id: string) => void
  updateQuestionResponse: (id: string, content: string) => void
  clearDetectedQuestions: () => void
  markTranscriptProcessed: (index: number) => void
}

export const useOverlayStore = create<OverlayState>((set) => ({
  mode: 'expanded',
  isTranscribing: false,
  currentModel: 'claude-haiku-4-5-20251001',
  messages: [],
  transcript: [],
  webSearchEnabled: false,
  sourcethreadEnabled: false,
  resumeText: null,
  resumeFilename: null,
  jobText: null,
  jobFilename: null,
  showSettings: false,
  aiBackend: 'openclaw',
  detectedQuestions: [],
  processedTranscriptIndices: new Set(),

  setMode: (mode) => set({ mode }),
  setModel: (model) => set({ currentModel: model }),
  setTranscribing: (val) => set({ isTranscribing: val }),
  toggleWebSearch: () => set((s) => ({ webSearchEnabled: !s.webSearchEnabled })),
  toggleSourcethread: () => set((s) => ({ sourcethreadEnabled: !s.sourcethreadEnabled })),
  setAiBackend: (backend) => set({ aiBackend: backend }),
  setShowSettings: (show) => set({ showSettings: show }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateMessage: (id, content) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, content } : m))
    })),
  appendToMessage: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + text } : m
      )
    })),
  finishStreaming: (id) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, isStreaming: false } : m))
    })),
  clearMessages: () => set({ messages: [] }),
  addTranscriptLine: (line) =>
    set((s) => {
      const last = s.transcript[s.transcript.length - 1]
      if (last && last === line) return s
      if (line.length <= 3 && !line.startsWith('[')) return s
      if (last && last.toLowerCase().includes(line.toLowerCase()) && line.length < last.length)
        return s
      return { transcript: [...s.transcript, line] }
    }),
  updateTranscriptLine: (index, text) =>
    set((s) => ({
      transcript: s.transcript.map((l, i) => (i === index ? text : l))
    })),
  deleteTranscriptLine: (index) =>
    set((s) => ({
      transcript: s.transcript.filter((_, i) => i !== index)
    })),
  clearTranscript: () => set({ transcript: [], processedTranscriptIndices: new Set() }),

  setResume: (text, filename) => set({ resumeText: text, resumeFilename: filename }),
  clearResume: () => set({ resumeText: null, resumeFilename: null }),
  setJob: (text, filename) => set({ jobText: text, jobFilename: filename }),
  clearJob: () => set({ jobText: null, jobFilename: null }),

  // AI sidebar
  addDetectedQuestion: (q) =>
    set((s) => ({ detectedQuestions: [...s.detectedQuestions, q] })),
  appendToQuestion: (id, text) =>
    set((s) => ({
      detectedQuestions: s.detectedQuestions.map((q) =>
        q.id === id ? { ...q, response: q.response + text } : q
      )
    })),
  finishQuestionStreaming: (id) =>
    set((s) => ({
      detectedQuestions: s.detectedQuestions.map((q) =>
        q.id === id ? { ...q, isStreaming: false } : q
      )
    })),
  updateQuestionResponse: (id, content) =>
    set((s) => ({
      detectedQuestions: s.detectedQuestions.map((q) =>
        q.id === id ? { ...q, response: content } : q
      )
    })),
  clearDetectedQuestions: () => set({ detectedQuestions: [], processedTranscriptIndices: new Set() }),
  markTranscriptProcessed: (index) =>
    set((s) => {
      const next = new Set(s.processedTranscriptIndices)
      next.add(index)
      return { processedTranscriptIndices: next }
    })
}))
