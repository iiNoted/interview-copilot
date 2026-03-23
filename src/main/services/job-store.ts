import Store from 'electron-store'

interface JobDescriptionData {
  text: string
  filename: string
  uploadedAt: number
}

const store = new Store<{ jobDescription: JobDescriptionData | null }>({
  defaults: { jobDescription: null }
})

export function saveJobDescription(text: string, filename: string): JobDescriptionData {
  const data: JobDescriptionData = { text, filename, uploadedAt: Date.now() }
  store.set('jobDescription', data)
  return data
}

export function getJobDescription(): JobDescriptionData | null {
  return store.get('jobDescription') || null
}

export function clearJobDescription(): void {
  store.delete('jobDescription')
}
