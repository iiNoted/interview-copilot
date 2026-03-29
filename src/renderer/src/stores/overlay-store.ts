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

export interface TextHighlight {
  transcriptIndex: number
  startOffset: number
  endOffset: number
  text: string
}

export interface SpawnedChat {
  id: string
  highlight: TextHighlight
  selectedText: string
  response: string
  isStreaming: boolean
  thinkingStep: string | null
  categoryResponse: string | null
  isCategoryStreaming: boolean
  followUpChips: string[]
  createdAt: number
}

interface OverlayState {
  mode: 'minimized' | 'expanded'
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
  selectedAudioDeviceId: number

  // AI sidebar state
  aiBackend: 'openai'
  detectedQuestions: DetectedQuestion[]
  processedTranscriptIndices: Set<number>

  // Spawned chats (living document)
  spawnedChats: SpawnedChat[]
  preparednessScore: number

  // Qualification map (spider chart)
  extractedQualifications: Array<{
    keyword: string
    category: string
    displayName: string
    confidence: number
    articleSlugs: string[]
    resumeMatch: boolean
    coverageScore: number
  }>
  knowledgeView: 'map' | 'browse'

  setMode: (mode: 'minimized' | 'expanded') => void
  setModel: (model: string) => void
  setTranscribing: (val: boolean) => void
  toggleWebSearch: () => void
  toggleSourcethread: () => void
  setAiBackend: (backend: 'openai') => void
  setShowSettings: (show: boolean) => void
  setSelectedAudioDeviceId: (id: number) => void

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

  // Qualification map actions
  setExtractedQualifications: (quals: OverlayState['extractedQualifications']) => void
  setKnowledgeView: (view: 'map' | 'browse') => void

  // AI sidebar actions
  addDetectedQuestion: (q: DetectedQuestion) => void
  appendToQuestion: (id: string, text: string) => void
  finishQuestionStreaming: (id: string) => void
  updateQuestionResponse: (id: string, content: string) => void
  clearDetectedQuestions: () => void
  markTranscriptProcessed: (index: number) => void

  // Spawned chat actions (living document)
  addSpawnedChat: (chat: SpawnedChat) => void
  removeSpawnedChat: (id: string) => void
  appendToSpawnedChat: (id: string, text: string) => void
  finishSpawnedChatStreaming: (id: string) => void
  setThinkingStep: (id: string, step: string | null) => void
  appendToCategoryResponse: (id: string, text: string) => void
  finishCategoryStreaming: (id: string) => void
  startCategoryStreaming: (id: string) => void
  setFollowUpChips: (id: string, chips: string[]) => void
  clearSpawnedChats: () => void
}

export const useOverlayStore = create<OverlayState>((set) => ({
  mode: 'expanded',
  isTranscribing: false,
  currentModel: 'gpt-5.4-mini-2026-03-17',
  messages: [],
  transcript: [],
  webSearchEnabled: false,
  sourcethreadEnabled: false,
  resumeText: null,
  resumeFilename: null,
  jobText: null,
  jobFilename: null,
  showSettings: false,
  selectedAudioDeviceId: 0,
  aiBackend: 'openai',
  detectedQuestions: [],
  processedTranscriptIndices: new Set(),
  spawnedChats: [],
  preparednessScore: 0,
  extractedQualifications: [],
  knowledgeView: 'browse',

  setMode: (mode) => set({ mode }),
  setModel: (model) => set({ currentModel: model }),
  setTranscribing: (val) => set({ isTranscribing: val }),
  toggleWebSearch: () => set((s) => ({ webSearchEnabled: !s.webSearchEnabled })),
  toggleSourcethread: () => set((s) => ({ sourcethreadEnabled: !s.sourcethreadEnabled })),
  setAiBackend: (backend) => set({ aiBackend: backend }),
  setShowSettings: (show) => set({ showSettings: show }),
  setSelectedAudioDeviceId: (id) => set({ selectedAudioDeviceId: id }),

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
    set((s) => {
      const next = new Set(s.processedTranscriptIndices)
      next.delete(index) // Allow re-analysis of edited lines
      return {
        transcript: s.transcript.map((l, i) => (i === index ? text : l)),
        processedTranscriptIndices: next
      }
    }),
  deleteTranscriptLine: (index) =>
    set((s) => ({
      transcript: s.transcript.filter((_, i) => i !== index),
      spawnedChats: s.spawnedChats
        .filter((c) => c.highlight.transcriptIndex !== index)
        .map((c) => ({
          ...c,
          highlight: {
            ...c.highlight,
            transcriptIndex:
              c.highlight.transcriptIndex > index
                ? c.highlight.transcriptIndex - 1
                : c.highlight.transcriptIndex
          }
        }))
    })),
  clearTranscript: () =>
    set({ transcript: [], processedTranscriptIndices: new Set(), spawnedChats: [], preparednessScore: 0 }),

  setResume: (text, filename) => set({ resumeText: text, resumeFilename: filename }),
  clearResume: () => set({ resumeText: null, resumeFilename: null }),
  setJob: (text, filename) => set({ jobText: text, jobFilename: filename }),
  clearJob: () => set({ jobText: null, jobFilename: null }),

  // Qualification map
  setExtractedQualifications: (quals) => set({ extractedQualifications: quals }),
  setKnowledgeView: (view) => set({ knowledgeView: view }),

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
    }),

  // Spawned chat actions (living document)
  addSpawnedChat: (chat) =>
    set((s) => {
      const chats = [chat, ...s.spawnedChats]
      const score = Math.min(100, chats.length * 12 + s.detectedQuestions.filter((q) => q.response).length * 8)
      return { spawnedChats: chats, preparednessScore: score }
    }),
  removeSpawnedChat: (id) =>
    set((s) => {
      const chats = s.spawnedChats.filter((c) => c.id !== id)
      const score = Math.min(100, chats.length * 12 + s.detectedQuestions.filter((q) => q.response).length * 8)
      return { spawnedChats: chats, preparednessScore: score }
    }),
  appendToSpawnedChat: (id, text) =>
    set((s) => ({
      spawnedChats: s.spawnedChats.map((c) =>
        c.id === id ? { ...c, response: c.response + text, thinkingStep: null } : c
      )
    })),
  finishSpawnedChatStreaming: (id) =>
    set((s) => ({
      spawnedChats: s.spawnedChats.map((c) =>
        c.id === id ? { ...c, isStreaming: false } : c
      )
    })),
  setThinkingStep: (id, step) =>
    set((s) => ({
      spawnedChats: s.spawnedChats.map((c) =>
        c.id === id ? { ...c, thinkingStep: step } : c
      )
    })),
  appendToCategoryResponse: (id, text) =>
    set((s) => ({
      spawnedChats: s.spawnedChats.map((c) =>
        c.id === id ? { ...c, categoryResponse: (c.categoryResponse || '') + text } : c
      )
    })),
  finishCategoryStreaming: (id) =>
    set((s) => ({
      spawnedChats: s.spawnedChats.map((c) =>
        c.id === id ? { ...c, isCategoryStreaming: false } : c
      )
    })),
  startCategoryStreaming: (id) =>
    set((s) => ({
      spawnedChats: s.spawnedChats.map((c) =>
        c.id === id ? { ...c, isCategoryStreaming: true, categoryResponse: '' } : c
      )
    })),
  setFollowUpChips: (id, chips) =>
    set((s) => ({
      spawnedChats: s.spawnedChats.map((c) =>
        c.id === id ? { ...c, followUpChips: chips } : c
      )
    })),
  clearSpawnedChats: () => set({ spawnedChats: [], preparednessScore: 0 })
}))
