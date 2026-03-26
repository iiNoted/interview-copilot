import { create } from 'zustand'

interface ResumeBuilderState {
  targetTitle: string
  qualifications: string[]
  generatedContent: string
  isGenerating: boolean
  requestId: string | null

  setTargetTitle: (title: string) => void
  setQualifications: (quals: string[]) => void
  addQualification: (qual: string) => void
  removeQualification: (qual: string) => void
  setGeneratedContent: (content: string) => void
  appendContent: (text: string) => void
  setIsGenerating: (val: boolean) => void
  setRequestId: (id: string | null) => void
  reset: () => void
}

export const useResumeBuilderStore = create<ResumeBuilderState>((set) => ({
  targetTitle: '',
  qualifications: [],
  generatedContent: '',
  isGenerating: false,
  requestId: null,

  setTargetTitle: (targetTitle) => set({ targetTitle }),
  setQualifications: (qualifications) => set({ qualifications }),
  addQualification: (qual) =>
    set((s) => {
      if (s.qualifications.includes(qual)) return s
      return { qualifications: [...s.qualifications, qual] }
    }),
  removeQualification: (qual) =>
    set((s) => ({ qualifications: s.qualifications.filter((q) => q !== qual) })),
  setGeneratedContent: (generatedContent) => set({ generatedContent }),
  appendContent: (text) => set((s) => ({ generatedContent: s.generatedContent + text })),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setRequestId: (requestId) => set({ requestId }),
  reset: () =>
    set({
      targetTitle: '',
      qualifications: [],
      generatedContent: '',
      isGenerating: false,
      requestId: null
    })
}))
