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
  'sap-fico', 'essbase', 'sap-bpc'
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
  'sap-bpc': 'SAP BPC'
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
  const articlesDir = join(catDir, 'articles')
  if (!existsSync(articlesDir)) return []

  try {
    const files = readdirSync(articlesDir)
      .filter((f) => f.startsWith('article_') && f.endsWith('.md'))
      .sort()

    return files.map((filename) => {
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

      const topicKey = filename
        .replace(/^article_\d+_/, '')
        .replace(/\.md$/, '')

      return { filename, title, subtitle, topicKey }
    })
  } catch {
    return []
  }
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
  if (!/^article_\d+_[\w-]+\.md$/.test(filename)) {
    return null
  }

  const cacheKey = `${categoryKey}/${filename}`
  if (articleContentCache.has(cacheKey)) return articleContentCache.get(cacheKey)!

  const pipelineOutput = getPipelineOutputPath()
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
    'sap-bpc': ['sap bpc', 'business planning', 'sap consolidation']
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
