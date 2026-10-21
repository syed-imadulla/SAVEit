/**
 * Text Preprocessing & Sanitization Utility for Transcripts and Captions.
 *
 * Prepares raw transcript segments and captions for LLM consumption by:
 * 1. Stripping non-verbal cues ([Music], [Applause], (laughter)).
 * 2. Normalizing whitespace, line breaks, and punctuation spacing.
 * 3. Bounding text length safely to fit within model context budgets.
 */

export const DEFAULT_MAX_CHARS = 12000;
export const MIN_SUBSTANTIAL_WORDS = 5;

// Common non-verbal and audio cue patterns in auto-generated captions
const AUDIO_CUE_REGEX = /\[(music|applause|laughter|snicker|sigh|gasp|silence|cheering|chuckle|screaming|groan)\]|\((music|applause|laughter|snicker|sigh|gasp|silence|cheering|chuckle|screaming|groan|upbeat music|background music)\)/gi;

/**
 * Normalizes raw caption or transcript text into clean, coherent sentences.
 */
export function cleanTranscriptText(rawText: string, maxChars = DEFAULT_MAX_CHARS): string {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  let cleaned = rawText
    // 1. Remove bracketed and parenthesized audio cues
    .replace(AUDIO_CUE_REGEX, ' ')
    // 2. Decode common HTML entity remnants if present
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // 3. Remove stray control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 4. Collapse whitespace and line breaks
    .replace(/\s+/g, ' ')
    // 5. Fix punctuation spacing (e.g. "word , next" -> "word, next")
    .replace(/\s+([,.:;!?])/g, '$1')
    .trim();

  // 6. Safe truncation at sentence or word boundary if over maxChars
  if (cleaned.length > maxChars) {
    const truncated = cleaned.slice(0, maxChars);
    const lastPeriod = truncated.lastIndexOf('. ');
    if (lastPeriod > maxChars * 0.75) {
      cleaned = truncated.slice(0, lastPeriod + 1);
    } else {
      const lastSpace = truncated.lastIndexOf(' ');
      cleaned = (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
    }
  }

  return cleaned;
}

/**
 * Concatenates an array of transcript segments into a unified clean string.
 */
export function formatTranscriptSegments(
  segments: Array<{ text: string; start?: number; duration?: number }>,
  maxChars = DEFAULT_MAX_CHARS
): string {
  if (!Array.isArray(segments) || segments.length === 0) {
    return '';
  }

  const rawJoined = segments
    .map((s) => s.text)
    .filter(Boolean)
    .join(' ');

  return cleanTranscriptText(rawJoined, maxChars);
}

/**
 * Checks if the text has enough meaningful content for AI structuring.
 */
export function isTextSubstantial(text: string, minWords = MIN_SUBSTANTIAL_WORDS): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const words = text.trim().split(/\s+/).filter((w) => w.length > 1);
  return words.length >= minWords;
}
