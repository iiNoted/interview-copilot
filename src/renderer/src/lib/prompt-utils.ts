/**
 * Sanitize user-provided text before injecting into AI prompts.
 * Prevents basic prompt injection by escaping control sequences.
 */
export function sanitizePromptText(text: string): string {
  return text
    // Remove triple-backtick blocks that could break prompt formatting
    .replace(/```/g, "'''")
    // Remove markdown separator sequences that could confuse prompt structure
    .replace(/^---+$/gm, '- - -')
    // Limit length to prevent token explosion (~15k chars ≈ 4k tokens)
    .slice(0, 15000)
}
