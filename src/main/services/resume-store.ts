import Store from 'electron-store'

interface ResumeData {
  text: string
  filename: string
  uploadedAt: number
}

const store = new Store<{ resume: ResumeData | null }>({
  defaults: { resume: null }
})

export function saveResume(text: string, filename: string): ResumeData {
  const data: ResumeData = { text, filename, uploadedAt: Date.now() }
  store.set('resume', data)
  return data
}

export function getResume(): ResumeData | null {
  return store.get('resume') || null
}

export function clearResume(): void {
  store.delete('resume')
}
