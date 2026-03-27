import * as https from 'node:https'
import Store from 'electron-store'

// Reliable fetch using Node https with proper timeout and abort
function reliableFetch(url: string, headers: Record<string, string> = {}): Promise<{ ok: boolean; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: 10000 }, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        resolve({
          ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
          json: () => Promise.resolve(JSON.parse(data))
        })
      })
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
    req.on('error', (err) => {
      reject(err)
    })
  })
}

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

interface JobCache {
  [queryHash: string]: { jobs: JobListing[]; timestamp: number }
}

const cache = new Store<{ jobCache: JobCache }>({
  name: 'job-search-cache',
  defaults: { jobCache: {} }
})

const CACHE_TTL = 60 * 60 * 1000 // 1 hour

function getCacheKey(query: string, remote: boolean, country?: string): string {
  return `${query.toLowerCase().trim()}|${remote}|${country || ''}`
}

function getCached(key: string): JobListing[] | null {
  const entry = cache.get(`jobCache.${key}`) as { jobs: JobListing[]; timestamp: number } | undefined
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) return null
  return entry.jobs
}

function setCache(key: string, jobs: JobListing[]): void {
  cache.set(`jobCache.${key}`, { jobs, timestamp: Date.now() })
}

// Extract qualifications from job description — fast, no complex regex
function extractQualifications(description: string): string[] {
  // Strip HTML and take first 2000 chars
  const text = description.replace(/<[^>]+>/g, ' ').slice(0, 2000).toLowerCase()

  const found = new Set<string>()

  // Extract tech keywords (fast literal matching)
  const techTerms = [
    'React', 'Node.js', 'TypeScript', 'JavaScript', 'Python', 'Java', 'C++',
    'Go', 'Rust', 'Ruby', 'Swift', 'Kotlin', 'AWS', 'Azure', 'GCP', 'Docker',
    'Kubernetes', 'SQL', 'PostgreSQL', 'MongoDB', 'Redis', 'GraphQL', 'REST',
    'Git', 'Agile', 'Scrum', 'CI/CD', 'Terraform', 'Linux', 'React Native',
    'Next.js', 'Vue', 'Angular', 'Django', 'Flask', 'Spring', '.NET', 'PHP',
    'Scala', 'Hadoop', 'Spark', 'Kafka', 'Elasticsearch', 'Machine Learning',
    'Deep Learning', 'TensorFlow', 'PyTorch', 'Figma', 'Tailwind'
  ]
  for (const term of techTerms) {
    if (text.includes(term.toLowerCase())) found.add(term)
  }

  // Extract years of experience
  const yearsMatch = text.match(/(\d+)\+?\s*years?/)
  if (yearsMatch) found.add(`${yearsMatch[1]}+ years experience`)

  return [...found].slice(0, 20)
}

// RemoteOK API — free, no key required
async function searchRemoteOK(query: string): Promise<JobListing[]> {
  try {
    // RemoteOK uses single-word tags — use the most specific word from the query
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const tag = words.find(w => !['the', 'and', 'for', 'with', 'senior', 'junior', 'lead', 'staff', 'principal', 'software'].includes(w)) || words[0] || query
    const url = `https://remoteok.com/api?tag=${encodeURIComponent(tag)}`

    const response = await reliableFetch(url, { 'User-Agent': 'InterviewCopilot/1.0' })
    if (!response.ok) return []

    const data = (await response.json()) as any[]
    // First element is metadata, skip it
    // First element is metadata, skip it
    const jobs = data.slice(1)

    const mapped = jobs.slice(0, 30).map((job: any) => ({
      id: `rok-${job.id}`,
      source: 'remoteok' as const,
      title: job.position || job.title || 'Unknown',
      company: job.company || 'Unknown',
      companyLogo: job.company_logo || undefined,
      location: job.location || 'Remote',
      remote: true,
      salaryMin: job.salary_min ? parseInt(job.salary_min) : undefined,
      salaryMax: job.salary_max ? parseInt(job.salary_max) : undefined,
      description: job.description || '',
      qualifications: extractQualifications(job.description || ''),
      tags: (job.tags || []).slice(0, 10),
      url: job.url || `https://remoteok.com/remote-jobs/${job.id}`,
      postedAt: job.date || new Date().toISOString()
    }))
    return mapped
  } catch (err) {
    console.error('RemoteOK search failed:', err)
    return []
  }
}

// JSearch via SourceThread server proxy
async function searchJSearch(query: string, remote: boolean, country?: string): Promise<JobListing[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      remote: remote ? 'true' : 'false',
      num_pages: '1'
    })
    if (country) params.set('country', country)
    const url = `https://copilot.sourcethread.com/api/copilot/jobs/search?${params}`
    const response = await reliableFetch(url)
    if (!response.ok) return []

    const data = (await response.json()) as { jobs: any[] }
    return (data.jobs || []).map((job: any) => ({
      id: `js-${job.job_id || Math.random().toString(36).slice(2)}`,
      source: 'jsearch' as const,
      title: job.job_title || 'Unknown',
      company: job.employer_name || 'Unknown',
      companyLogo: job.employer_logo || undefined,
      location: job.job_city
        ? `${job.job_city}, ${job.job_state || ''} ${job.job_country || ''}`
        : job.job_country || 'Unknown',
      remote: job.job_is_remote || false,
      salaryMin: job.job_min_salary ? parseInt(job.job_min_salary) : undefined,
      salaryMax: job.job_max_salary ? parseInt(job.job_max_salary) : undefined,
      description: job.job_description || '',
      qualifications: extractQualifications(job.job_description || ''),
      tags: (job.job_required_skills || []).slice(0, 10),
      url: job.job_apply_link || job.job_google_link || '#',
      postedAt: job.job_posted_at_datetime_utc || new Date().toISOString()
    }))
  } catch (err) {
    console.error('JSearch search failed:', err)
    return []
  }
}

// Main search — combines both sources
export async function searchJobs(params: {
  query: string
  remote?: boolean
  country?: string
}): Promise<JobListing[]> {
  const { query, remote = false, country } = params
  if (!query.trim()) return []

  const cacheKey = getCacheKey(query, remote, country)
  const cached = getCached(cacheKey)
  if (cached) return cached

  // Fetch from both sources in parallel — use allSettled so one failure doesn't block
  const results = await Promise.allSettled([
    searchRemoteOK(query),
    searchJSearch(query, remote, country)
  ])
  const remoteOKJobs = results[0].status === 'fulfilled' ? results[0].value : []
  const jsearchJobs = results[1].status === 'fulfilled' ? results[1].value : []

  // Merge and deduplicate by title+company
  const seen = new Set<string>()
  const merged: JobListing[] = []

  for (const job of [...jsearchJobs, ...remoteOKJobs]) {
    const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(job)
  }

  // Sort by date (newest first)
  merged.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())

  setCache(cacheKey, merged)
  return merged
}

export function getJobDetail(id: string): JobListing | null {
  const allCaches = cache.get('jobCache') || {}
  for (const entry of Object.values(allCaches)) {
    const job = entry.jobs.find((j: JobListing) => j.id === id)
    if (job) return job
  }
  return null
}
