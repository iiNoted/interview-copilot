import { readFileSync, statSync } from 'fs'
import mammoth from 'mammoth'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface ParseResult {
  text: string
  error?: never
}

export interface ParseError {
  text?: never
  error: string
}

export async function parseDocumentFile(filePath: string): Promise<ParseResult | ParseError> {
  const stats = statSync(filePath)
  if (stats.size > MAX_FILE_SIZE) {
    return { error: 'File too large. Maximum size is 10MB.' }
  }

  const ext = filePath.toLowerCase().split('.').pop()

  if (ext === 'pdf') {
    const pdfParse = require('pdf-parse')
    const buffer = readFileSync(filePath)
    const data = await pdfParse(buffer)
    return { text: data.text }
  }

  if (ext === 'docx' || ext === 'doc') {
    const buffer = readFileSync(filePath)
    const result = await mammoth.extractRawText({ buffer })
    return { text: result.value }
  }

  // Plain text fallback
  return { text: readFileSync(filePath, 'utf-8') }
}
