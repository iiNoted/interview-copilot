import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app } from 'electron'

// Resolve pipeline data path:
// 1. Packaged app: look in resources/pipeline-data
// 2. Dev mode: look in ~/Projects/pipeline-engine/output
function getPipelineOutputPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'pipeline-data')
  }
  return join(homedir(), 'Projects', 'pipeline-engine', 'output')
}

const KNOWN_CATEGORIES = [
  'tm1', 'kubernetes', 'terraform', 'power-bi', 'snowflake', 'airflow',
  'databricks', 'gcp', 'cognos', 'spark', 'kafka', 'langchain', 'dbt',
  'docker', 'azure-data', 'aws-bedrock', 'mlops', 'tableau', 'hyperion',
  'sap-fico', 'essbase', 'sap-bpc', 'cybersecurity'
]

const DISPLAY_NAMES: Record<string, string> = {
  'tm1': 'IBM TM1 / Planning Analytics',
  'kubernetes': 'Kubernetes',
  'terraform': 'Terraform / HCL',
  'power-bi': 'Microsoft Power BI',
  'snowflake': 'Snowflake',
  'airflow': 'Apache Airflow',
  'databricks': 'Databricks / Delta Lake',
  'gcp': 'Google Cloud Platform',
  'cognos': 'IBM Cognos Analytics',
  'spark': 'Apache Spark / PySpark',
  'kafka': 'Apache Kafka',
  'langchain': 'LangChain / RAG',
  'dbt': 'dbt (Data Build Tool)',
  'docker': 'Docker / Containers',
  'azure-data': 'Azure Data / Synapse',
  'aws-bedrock': 'AWS Bedrock / AI',
  'mlops': 'MLOps / MLflow',
  'tableau': 'Tableau',
  'hyperion': 'Oracle Hyperion / EPM',
  'sap-fico': 'SAP FICO',
  'essbase': 'Oracle Essbase / OLAP',
  'sap-bpc': 'SAP BPC',
  'cybersecurity': 'Cybersecurity / InfoSec'
}

export interface ArticleSummary {
  filename: string
  title: string
  subtitle: string
  topicKey: string
}

export interface CategorySummary {
  key: string
  displayName: string
  role: string
  articleCount: number
  topicCount: number
}

export interface CategoryDetail {
  key: string
  displayName: string
  role: string
  articles: ArticleSummary[]
}

let categoriesCache: CategorySummary[] | null = null
const detailCache = new Map<string, CategoryDetail>()
const articleContentCache = new Map<string, string>()

function readJson(path: string): any | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function getArticles(catDir: string): ArticleSummary[] {
  const articles: ArticleSummary[] = []

  // Original pipeline articles
  const articlesDir = join(catDir, 'articles')
  if (existsSync(articlesDir)) {
    try {
      const files = readdirSync(articlesDir)
        .filter((f) => f.startsWith('article_') && f.endsWith('.md'))
        .sort()

      for (const filename of files) {
        const content = readFileSync(join(articlesDir, filename), 'utf-8')
        const lines = content.split('\n')
        const titleLine = lines.find((l) => l.startsWith('# '))
        const title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : filename

        let subtitle = ''
        let foundTitle = false
        for (const line of lines) {
          if (line.startsWith('# ')) { foundTitle = true; continue }
          if (!foundTitle) continue
          const trimmed = line.trim()
          if (!trimmed || trimmed === '---') continue
          subtitle = trimmed.replace(/^\*+/, '').replace(/\*+$/, '').trim()
          break
        }

        const topicKey = filename.replace(/^article_\d+_/, '').replace(/\.md$/, '')
        articles.push({ filename, title, subtitle, topicKey })
      }
    } catch { /* */ }
  }

  // Qualification articles
  const qualDir = join(catDir, 'qualification_articles')
  if (existsSync(qualDir)) {
    try {
      const files = readdirSync(qualDir).filter((f) => f.endsWith('.md')).sort()
      for (const filename of files) {
        const raw = readFileSync(join(qualDir, filename), 'utf-8')
        // Strip YAML frontmatter
        const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)
        const content = fmMatch ? fmMatch[1] : raw
        const lines = content.split('\n')
        const titleLine = lines.find((l) => l.startsWith('# '))
        const title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : filename.replace(/\.md$/, '')

        let subtitle = ''
        let foundTitle = false
        for (const line of lines) {
          if (line.startsWith('# ')) { foundTitle = true; continue }
          if (!foundTitle) continue
          const trimmed = line.trim()
          if (!trimmed || trimmed === '---') continue
          subtitle = trimmed.replace(/^\*+/, '').replace(/\*+$/, '').trim()
          break
        }

        const topicKey = filename.replace(/\.md$/, '')
        articles.push({ filename: `qual:${filename}`, title, subtitle, topicKey })
      }
    } catch { /* */ }
  }

  return articles
}

export function getCategories(): CategorySummary[] {
  if (categoriesCache) return categoriesCache

  const pipelineOutput = getPipelineOutputPath()
  if (!existsSync(pipelineOutput)) {
    categoriesCache = []
    return []
  }

  const categories: CategorySummary[] = []

  for (const cat of KNOWN_CATEGORIES) {
    const catDir = join(pipelineOutput, cat)
    if (!existsSync(catDir)) continue

    const scaffold = readJson(join(catDir, 'skill', 'skill_scaffold.json'))
    if (!scaffold) continue

    const articles = getArticles(catDir)

    categories.push({
      key: cat,
      displayName: DISPLAY_NAMES[cat] || cat,
      role: scaffold.role || '',
      articleCount: articles.length,
      topicCount: scaffold.stats?.total_topics || 0
    })
  }

  categoriesCache = categories
  return categories
}

export function getCategoryDetail(categoryKey: string): CategoryDetail | null {
  if (categoryKey.includes('..') || categoryKey.includes('/') || categoryKey.includes('\\')) {
    return null
  }
  if (detailCache.has(categoryKey)) return detailCache.get(categoryKey)!

  const pipelineOutput = getPipelineOutputPath()
  const catDir = join(pipelineOutput, categoryKey)
  if (!existsSync(catDir)) return null

  const scaffold = readJson(join(catDir, 'skill', 'skill_scaffold.json'))
  if (!scaffold) return null

  const articles = getArticles(catDir)

  const detail: CategoryDetail = {
    key: categoryKey,
    displayName: DISPLAY_NAMES[categoryKey] || categoryKey,
    role: scaffold.role || '',
    articles
  }

  detailCache.set(categoryKey, detail)
  return detail
}

export function getArticleContent(categoryKey: string, filename: string): string | null {
  if (
    categoryKey.includes('..') || categoryKey.includes('/') || categoryKey.includes('\\') ||
    filename.includes('..') || filename.includes('/') || filename.includes('\\')
  ) {
    return null
  }

  const cacheKey = `${categoryKey}/${filename}`
  if (articleContentCache.has(cacheKey)) return articleContentCache.get(cacheKey)!

  const pipelineOutput = getPipelineOutputPath()

  // Qualification articles have a "qual:" prefix
  if (filename.startsWith('qual:')) {
    const qualFilename = filename.slice(5)
    if (!/^[\w-]+\.md$/.test(qualFilename)) return null

    const filePath = join(pipelineOutput, categoryKey, 'qualification_articles', qualFilename)
    if (!existsSync(filePath)) return null

    try {
      const raw = readFileSync(filePath, 'utf-8')
      // Strip frontmatter
      const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)
      const content = fmMatch ? fmMatch[1] : raw
      articleContentCache.set(cacheKey, content)
      return content
    } catch {
      return null
    }
  }

  // Original articles
  if (!/^article_\d+_[\w-]+\.md$/.test(filename)) return null

  const filePath = join(pipelineOutput, categoryKey, 'articles', filename)
  if (!existsSync(filePath)) return null

  try {
    const content = readFileSync(filePath, 'utf-8')
    articleContentCache.set(cacheKey, content)
    return content
  } catch {
    return null
  }
}

// ── Qualifications DB ─────────────────────────────────────────────
export interface QualificationEntry {
  id: string
  keyword: string
  display: string
  topic: string
  searchTitle: string
  searchQueries: string[]
  priorityScore: number
  existingArticle: string | null
}

let qualificationsDbCache: Record<string, QualificationEntry[]> | null = null

export function getQualificationsDb(): Record<string, QualificationEntry[]> {
  if (qualificationsDbCache) return qualificationsDbCache

  const pipelineOutput = getPipelineOutputPath()
  const db: Record<string, QualificationEntry[]> = {}

  for (const cat of KNOWN_CATEGORIES) {
    const qualPath = join(pipelineOutput, cat, 'qualifications.json')
    const data = readJson(qualPath)
    if (data?.qualifications) {
      db[cat] = data.qualifications
    }
  }

  qualificationsDbCache = db
  return db
}

export function getQualificationArticleSnippet(
  category: string,
  qualId: string,
  maxChars: number = 600
): string | null {
  if (category.includes('..') || category.includes('/')) return null
  if (!/^[\w-]+$/.test(qualId)) return null

  const pipelineOutput = getPipelineOutputPath()
  const filePath = join(pipelineOutput, category, 'qualification_articles', `${qualId}.md`)
  if (!existsSync(filePath)) return null

  try {
    const raw = readFileSync(filePath, 'utf-8')
    // Strip frontmatter
    const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)
    const content = fmMatch ? fmMatch[1] : raw
    // Strip title line and return first N chars
    const lines = content.split('\n').filter((l) => !l.startsWith('# '))
    return lines.join('\n').trim().slice(0, maxChars)
  } catch {
    return null
  }
}

// Rank categories by BOTH resume AND job description
export function rankCategoriesByContext(
  categories: CategorySummary[],
  resumeText: string | null,
  jobText: string | null
): CategorySummary[] {
  if (!resumeText && !jobText) return categories

  const TECH_KEYWORDS: Record<string, string[]> = {
    'tm1': ['tm1', 'planning analytics', 'cognos tm1', 'turbointegrator'],
    'kubernetes': ['kubernetes', 'k8s', 'kubectl', 'helm', 'eks', 'gke', 'aks'],
    'terraform': ['terraform', 'hcl', 'hashicorp', 'infrastructure as code'],
    'power-bi': ['power bi', 'powerbi', 'dax', 'power query'],
    'snowflake': ['snowflake', 'snowpark', 'snowpipe'],
    'airflow': ['airflow', 'apache airflow', 'dag'],
    'databricks': ['databricks', 'delta lake', 'unity catalog'],
    'gcp': ['google cloud', 'gcp', 'bigquery', 'vertex ai'],
    'cognos': ['cognos', 'ibm cognos', 'framework manager'],
    'spark': ['spark', 'pyspark', 'apache spark'],
    'kafka': ['kafka', 'confluent', 'event streaming'],
    'langchain': ['langchain', 'llamaindex', 'rag', 'vector database'],
    'dbt': ['dbt', 'data build tool', 'analytics engineering'],
    'docker': ['docker', 'container', 'dockerfile', 'docker compose'],
    'azure-data': ['azure data factory', 'synapse', 'azure data lake'],
    'aws-bedrock': ['bedrock', 'sagemaker', 'aws ai'],
    'mlops': ['mlops', 'mlflow', 'model serving', 'feature store'],
    'tableau': ['tableau', 'data visualization'],
    'hyperion': ['hyperion', 'oracle epm', 'hfm'],
    'sap-fico': ['sap fico', 'sap fi', 'sap co'],
    'essbase': ['essbase', 'oracle olap', 'calc script'],
    'sap-bpc': ['sap bpc', 'business planning', 'sap consolidation'],
    'cybersecurity': ['cybersecurity', 'security engineer', 'penetration testing', 'pentest', 'infosec', 'soc analyst', 'threat detection', 'vulnerability', 'owasp', 'encryption', 'tls', 'ssl', 'firewall', 'siem', 'incident response']
  }

  const resumeLower = (resumeText || '').toLowerCase()
  const jobLower = (jobText || '').toLowerCase()

  const scored = categories.map((cat) => {
    const keywords = TECH_KEYWORDS[cat.key] || [cat.key]
    let resumeScore = 0
    let jobScore = 0

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      if (resumeLower.includes(kwLower)) resumeScore += kw.length
      if (jobLower.includes(kwLower)) jobScore += kw.length * 1.5 // JD matches get higher weight
    }

    return { cat, score: resumeScore + jobScore }
  })

  scored.sort((a, b) => {
    if (a.score > 0 && b.score > 0) return b.score - a.score
    if (a.score > 0) return -1
    if (b.score > 0) return 1
    return a.cat.displayName.localeCompare(b.cat.displayName)
  })

  return scored.map((s) => s.cat)
}

// Resume data pack — skills, topics, and experience bullets from pipeline data
export interface ResumeDataPack {
  matchedCategories: Array<{
    key: string
    displayName: string
    role: string
    skills: string[]
    topics: string[]
    experienceBullets: string[]
  }>
}

export function getResumeDataPack(targetTitle: string, resumeText: string | null): ResumeDataPack {
  const pipelineOutput = getPipelineOutputPath()
  const titleLower = targetTitle.toLowerCase()
  const resumeLower = (resumeText || '').toLowerCase()
  const searchText = `${titleLower} ${resumeLower}`

  const ROLE_KEYWORDS: Record<string, string[]> = {
    'tm1': ['tm1', 'planning analytics', 'turbointegrator', 'ibm planning', 'cognos tm1'],
    'kubernetes': ['kubernetes', 'k8s', 'devops', 'platform engineer', 'site reliability', 'sre', 'cloud native'],
    'terraform': ['terraform', 'infrastructure', 'iac', 'devops', 'cloud engineer', 'platform'],
    'power-bi': ['power bi', 'business intelligence', 'bi developer', 'bi analyst', 'data analyst', 'dax'],
    'snowflake': ['snowflake', 'data engineer', 'data warehouse', 'analytics engineer'],
    'airflow': ['airflow', 'data engineer', 'pipeline', 'etl', 'data platform'],
    'databricks': ['databricks', 'data engineer', 'spark', 'delta lake', 'lakehouse'],
    'gcp': ['google cloud', 'gcp', 'cloud architect', 'bigquery'],
    'cognos': ['cognos', 'ibm cognos', 'reporting', 'business intelligence'],
    'spark': ['spark', 'pyspark', 'data engineer', 'big data'],
    'kafka': ['kafka', 'event streaming', 'real-time', 'data engineer'],
    'langchain': ['langchain', 'llm', 'ai engineer', 'ml engineer', 'rag', 'generative ai', 'prompt'],
    'dbt': ['dbt', 'analytics engineer', 'data modeling', 'data analyst'],
    'docker': ['docker', 'container', 'devops', 'platform', 'microservices'],
    'azure-data': ['azure', 'data factory', 'synapse', 'azure data', 'cloud data'],
    'aws-bedrock': ['aws', 'bedrock', 'sagemaker', 'machine learning', 'ai engineer'],
    'mlops': ['mlops', 'ml engineer', 'machine learning', 'model deployment'],
    'tableau': ['tableau', 'data visualization', 'data analyst', 'bi'],
    'hyperion': ['hyperion', 'oracle epm', 'financial planning', 'hfm'],
    'sap-fico': ['sap', 'fico', 'financial accounting', 'controlling', 'sap consultant'],
    'essbase': ['essbase', 'oracle olap', 'financial analyst', 'planning'],
    'sap-bpc': ['sap bpc', 'business planning', 'consolidation'],
    'cybersecurity': ['cybersecurity', 'security engineer', 'infosec', 'penetration tester', 'soc analyst', 'security architect', 'threat hunter', 'incident responder', 'application security']
  }

  // Score each category against the job title + resume
  const scored: Array<{ key: string; score: number }> = []
  for (const cat of KNOWN_CATEGORIES) {
    const keywords = ROLE_KEYWORDS[cat] || [cat]
    let score = 0
    for (const kw of keywords) {
      if (searchText.includes(kw)) score += kw.length
    }
    if (score > 0) scored.push({ key: cat, score })
  }
  scored.sort((a, b) => b.score - a.score)

  // Also add general software engineering skills for common titles
  const generalRoles = ['software', 'developer', 'engineer', 'fullstack', 'full stack', 'backend', 'frontend', 'web']
  const isGeneral = generalRoles.some(r => titleLower.includes(r))

  // Take top matching categories (max 5)
  const topCats = scored.slice(0, 5).map(s => s.key)

  // If general software role and few matches, add docker/kubernetes/gcp
  if (isGeneral && topCats.length < 3) {
    for (const fallback of ['docker', 'kubernetes', 'terraform', 'gcp']) {
      if (!topCats.includes(fallback)) topCats.push(fallback)
      if (topCats.length >= 4) break
    }
  }

  const matchedCategories: ResumeDataPack['matchedCategories'] = []

  for (const catKey of topCats) {
    const catDir = join(pipelineOutput, catKey)
    const scaffold = readJson(join(catDir, 'skill', 'skill_scaffold.json'))
    if (!scaffold) continue

    // Extract skills from topics
    const skills: string[] = []
    const topics: string[] = []
    for (const topic of (scaffold.topics || [])) {
      topics.push(topic.display_name || topic.topic_key)
      // Add common mistake patterns as implied skills
      for (const mistake of (topic.common_mistakes || []).slice(0, 2)) {
        if (typeof mistake === 'string' && mistake.length < 100) {
          skills.push(mistake)
        }
      }
    }

    // Extract experience bullets from resolutions
    const experienceBullets: string[] = []
    const resolutionsPath = join(catDir, 'skill', 'resolutions.jsonl')
    if (existsSync(resolutionsPath)) {
      try {
        const lines = readFileSync(resolutionsPath, 'utf-8').split('\n').filter(Boolean)
        for (const line of lines.slice(0, 15)) {
          try {
            const res = JSON.parse(line)
            if (res.problem && res.fix && res.confidence > 0.4) {
              experienceBullets.push(`Resolved ${res.problem}: ${res.fix}`.slice(0, 200))
            }
          } catch { /* skip bad lines */ }
        }
      } catch { /* skip */ }
    }

    // Pull retrieval keywords as skills
    const keywordsFile = readJson(join(catDir, 'retrieval_keywords.json'))
    if (keywordsFile && typeof keywordsFile === 'object') {
      for (const [, kws] of Object.entries(keywordsFile)) {
        if (Array.isArray(kws)) {
          for (const kw of kws.slice(0, 5)) {
            if (typeof kw === 'string' && kw.length < 50) skills.push(kw)
          }
        }
      }
    }

    matchedCategories.push({
      key: catKey,
      displayName: DISPLAY_NAMES[catKey] || catKey,
      role: scaffold.role || '',
      skills: [...new Set(skills)].slice(0, 25),
      topics,
      experienceBullets: experienceBullets.slice(0, 10)
    })
  }

  return { matchedCategories }
}

// Resume-aware category ranking
export function rankCategoriesByResume(
  categories: CategorySummary[],
  resumeText: string | null
): CategorySummary[] {
  if (!resumeText) return categories

  const lower = resumeText.toLowerCase()

  const TECH_KEYWORDS: Record<string, string[]> = {
    'tm1': ['tm1', 'planning analytics', 'cognos tm1', 'turbointegrator', 'ibm planning'],
    'kubernetes': ['kubernetes', 'k8s', 'kubectl', 'helm', 'eks', 'gke', 'aks'],
    'terraform': ['terraform', 'hcl', 'hashicorp', 'infrastructure as code', 'iac'],
    'power-bi': ['power bi', 'powerbi', 'dax', 'power query'],
    'snowflake': ['snowflake', 'snowpark', 'snowpipe'],
    'airflow': ['airflow', 'apache airflow', 'dag'],
    'databricks': ['databricks', 'delta lake', 'unity catalog'],
    'gcp': ['google cloud', 'gcp', 'bigquery', 'vertex ai'],
    'cognos': ['cognos', 'ibm cognos', 'framework manager'],
    'spark': ['spark', 'pyspark', 'apache spark'],
    'kafka': ['kafka', 'confluent', 'event streaming'],
    'langchain': ['langchain', 'llamaindex', 'rag', 'vector database'],
    'dbt': ['dbt', 'data build tool', 'analytics engineering'],
    'docker': ['docker', 'container', 'dockerfile', 'docker compose'],
    'azure-data': ['azure data factory', 'synapse', 'azure data lake'],
    'aws-bedrock': ['bedrock', 'sagemaker', 'aws ai'],
    'mlops': ['mlops', 'mlflow', 'model serving', 'feature store'],
    'tableau': ['tableau', 'data visualization'],
    'hyperion': ['hyperion', 'oracle epm', 'hfm'],
    'sap-fico': ['sap fico', 'sap fi', 'sap co'],
    'essbase': ['essbase', 'oracle olap', 'calc script'],
    'sap-bpc': ['sap bpc', 'business planning', 'sap consolidation'],
    'cybersecurity': ['cybersecurity', 'security engineer', 'penetration testing', 'pentest', 'infosec', 'soc analyst', 'threat detection', 'vulnerability', 'owasp', 'encryption', 'tls', 'ssl', 'firewall', 'siem', 'incident response']
  }

  const scored = categories.map((cat) => {
    const keywords = TECH_KEYWORDS[cat.key] || [cat.key]
    let score = 0
    for (const kw of keywords) {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const matches = lower.match(regex)
      if (matches) score += matches.length * (kw.length > 5 ? 2 : 1)
    }
    for (const kw of keywords) {
      const idx = lower.indexOf(kw.toLowerCase())
      if (idx >= 0) {
        score += Math.max(0, 1 - idx / lower.length) * 3
        break
      }
    }
    return { cat, score }
  })

  scored.sort((a, b) => {
    if (a.score > 0 && b.score > 0) return b.score - a.score
    if (a.score > 0) return -1
    if (b.score > 0) return 1
    return a.cat.displayName.localeCompare(b.cat.displayName)
  })

  return scored.map((s) => s.cat)
}
