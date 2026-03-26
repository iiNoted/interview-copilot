/**
 * JD Parser — Extracts qualifications from job description text
 * and matches them against the pipeline qualifications database.
 */

export interface QualificationEntry {
  id: string
  keyword: string
  display: string
  topic: string
  searchTitle: string
  priorityScore: number
  existingArticle: string | null
}

export interface ExtractedQualification {
  keyword: string
  category: string
  displayName: string
  confidence: number
  articleSlugs: string[]
  resumeMatch: boolean
  coverageScore: number
}

/**
 * Extract qualifications from JD text by matching against the qualifications DB.
 * Returns top 8-12 qualifications sorted by confidence.
 */
export function extractQualifications(
  jdText: string,
  qualificationsDb: Record<string, QualificationEntry[]>,
  resumeText: string | null
): ExtractedQualification[] {
  if (!jdText || Object.keys(qualificationsDb).length === 0) return []

  const jdLower = jdText.toLowerCase()
  const resumeLower = (resumeText || '').toLowerCase()
  const results: ExtractedQualification[] = []

  // Check proximity to "required" / "preferred" sections
  const requiredZones = findSectionZones(jdLower, ['required', 'must have', 'minimum', 'qualifications'])
  const preferredZones = findSectionZones(jdLower, ['preferred', 'nice to have', 'bonus', 'desired'])

  for (const [category, quals] of Object.entries(qualificationsDb)) {
    for (const qual of quals) {
      const kw = qual.keyword.toLowerCase()
      // Split multi-word keywords for partial matching
      const kwParts = kw.split(/[\s&]+/).filter((p) => p.length >= 3)

      let confidence = 0

      // Exact match (full keyword phrase found)
      if (jdLower.includes(kw)) {
        confidence = 1.0
      } else if (kwParts.length > 1 && kwParts.every((p) => jdLower.includes(p))) {
        // All parts present but not as a phrase
        confidence = 0.8
      } else if (kwParts.some((p) => p.length >= 5 && jdLower.includes(p))) {
        // At least one significant part matches
        confidence = 0.5
      }

      if (confidence === 0) continue

      // Boost if in "required" section
      const kwIndex = jdLower.indexOf(kw)
      if (kwIndex >= 0) {
        if (isInZone(kwIndex, requiredZones)) confidence = Math.min(1.0, confidence * 1.3)
        else if (isInZone(kwIndex, preferredZones)) confidence = Math.min(1.0, confidence * 1.1)
      }

      // Check resume match
      const resumeMatch = resumeLower.includes(kw) ||
        (kwParts.length > 1 && kwParts.some((p) => p.length >= 5 && resumeLower.includes(p)))

      // Calculate coverage score (0-100)
      const hasArticle = qual.existingArticle !== null
      const articleBonus = hasArticle ? 30 : 0
      const resumeBonus = resumeMatch ? 25 : 0
      const evidenceBonus = Math.min(25, qual.priorityScore)
      const coverageScore = Math.min(100, articleBonus + resumeBonus + evidenceBonus + 20)

      // Check for existing duplicate (keep highest confidence per keyword)
      const existingIdx = results.findIndex(
        (r) => r.keyword.toLowerCase() === kw || r.category === category && r.keyword === qual.keyword
      )
      if (existingIdx >= 0) {
        if (confidence > results[existingIdx].confidence) {
          results[existingIdx] = {
            keyword: qual.keyword,
            category,
            displayName: qual.display,
            confidence,
            articleSlugs: hasArticle ? [qual.existingArticle!] : [qual.id],
            resumeMatch,
            coverageScore
          }
        }
        continue
      }

      results.push({
        keyword: qual.keyword,
        category,
        displayName: qual.display,
        confidence,
        articleSlugs: hasArticle ? [qual.existingArticle!] : [qual.id],
        resumeMatch,
        coverageScore
      })
    }
  }

  // Sort by confidence desc, take top 12
  results.sort((a, b) => b.confidence - a.confidence || b.coverageScore - a.coverageScore)
  return results.slice(0, 12)
}

// Find text zones around section headers (returns array of [start, end] ranges)
function findSectionZones(text: string, markers: string[]): Array<[number, number]> {
  const zones: Array<[number, number]> = []
  for (const marker of markers) {
    let idx = text.indexOf(marker)
    while (idx >= 0) {
      // Zone extends 500 chars after the marker
      zones.push([idx, idx + 500])
      idx = text.indexOf(marker, idx + marker.length)
    }
  }
  return zones
}

function isInZone(position: number, zones: Array<[number, number]>): boolean {
  return zones.some(([start, end]) => position >= start && position <= end)
}
