import { create } from 'zustand'

export interface JobListing {
  id: string
  source: 'remoteok' | 'jsearch'
  title: string
  company: string
  companyLogo?: string
  location: string
  remote: boolean
  salaryMin?: number
  salaryMax?: number
  description: string
  qualifications: string[]
  tags: string[]
  url: string
  postedAt: string
}

interface JobState {
  query: string
  remoteOnly: boolean
  jobs: JobListing[]
  loading: boolean
  selectedJob: JobListing | null
  savedJobs: JobListing[]
  error: string | null

  setQuery: (query: string) => void
  setRemoteOnly: (remote: boolean) => void
  setJobs: (jobs: JobListing[]) => void
  setLoading: (loading: boolean) => void
  setSelectedJob: (job: JobListing | null) => void
  setError: (error: string | null) => void
  saveJob: (job: JobListing) => void
  unsaveJob: (id: string) => void
}

export const useJobStore = create<JobState>((set) => ({
  query: '',
  remoteOnly: false,
  jobs: [],
  loading: false,
  selectedJob: null,
  savedJobs: [],
  error: null,

  setQuery: (query) => set({ query }),
  setRemoteOnly: (remoteOnly) => set({ remoteOnly }),
  setJobs: (jobs) => set({ jobs }),
  setLoading: (loading) => set({ loading }),
  setSelectedJob: (selectedJob) => set({ selectedJob }),
  setError: (error) => set({ error }),
  saveJob: (job) =>
    set((s) => {
      if (s.savedJobs.some((j) => j.id === job.id)) return s
      return { savedJobs: [...s.savedJobs, job] }
    }),
  unsaveJob: (id) =>
    set((s) => ({ savedJobs: s.savedJobs.filter((j) => j.id !== id) }))
}))
