/**
 * IMDB ID Parser
 *
 * Robust extraction and validation of IMDB IDs from AI responses.
 * Handles various formats and edge cases.
 */

// IMDB IDs are in format: tt followed by 7-9 digits
const IMDB_ID_REGEX = /^tt\d{7,9}$/;

/**
 * Parse IMDB IDs from AI response text
 *
 * Handles various response formats:
 * - JSON array: ["tt0133093", "tt0088763"]
 * - Markdown code blocks with JSON
 * - Mixed text with embedded JSON
 *
 * @param text - Raw text from AI response
 * @returns Array of valid, deduplicated IMDB IDs
 */
export function parseImdbList(text: string): string[] {
  const cleaned = text.trim();
  const jsonCandidate = extractJsonArray(cleaned);
  if (!jsonCandidate) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  // Deduplicate and validate
  const seen = new Set<string>();
  const results: string[] = [];

  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    if (!isValidImdbId(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    results.push(item);
  }

  return results;
}

/**
 * Validate a single IMDB ID
 */
export function isValidImdbId(id: string): boolean {
  return IMDB_ID_REGEX.test(id);
}

/**
 * Extract JSON array from potentially mixed text
 *
 * Handles:
 * - Pure JSON: ["tt123"]
 * - Markdown: ```json\n["tt123"]\n```
 * - Mixed text: Here are recommendations: ["tt123"]
 */
function extractJsonArray(text: string): string | null {
  // If it already starts with [, assume it's JSON
  if (text.startsWith('[')) {
    return extractBalanced(text);
  }

  // Try to find JSON array in the text
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');

  if (start === -1 || end === -1 || end <= start) return null;

  return text.slice(start, end + 1);
}

/**
 * Extract a balanced JSON array (handles nested structures)
 */
function extractBalanced(text: string): string | null {
  if (!text.startsWith('[')) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '[') {
      depth++;
    } else if (char === ']') {
      depth--;
      if (depth === 0) {
        return text.slice(0, i + 1);
      }
    }
  }

  // Unbalanced - return null
  return null;
}

/**
 * Parse comma-separated IMDB IDs (for URL parameters)
 *
 * @param raw - Comma-separated string like "tt0133093,tt0088763"
 * @returns Array of valid IMDB IDs
 */
export function parseCommaSeparatedIds(raw: string): string[] {
  if (!raw || !raw.trim()) return [];

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(isValidImdbId);
}

/**
 * Parse IMDB IDs from JSON array string or comma-separated
 *
 * Auto-detects format and parses accordingly.
 */
export function parseHistoryParam(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // If it looks like JSON, try that first
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === 'string' && isValidImdbId(item));
      }
    } catch {
      // Fall through to comma-separated
    }
  }

  return parseCommaSeparatedIds(trimmed);
}
