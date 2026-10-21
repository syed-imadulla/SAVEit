import { describe, it, expect } from 'vitest';
import {
  cleanTranscriptText,
  formatTranscriptSegments,
  isTextSubstantial,
} from '../src/services/intelligence/textCleaner';

describe('Text Preprocessor (cleanTranscriptText)', () => {
  it('handles empty or non-string inputs gracefully', () => {
    expect(cleanTranscriptText('')).toBe('');
    expect(cleanTranscriptText(null as any)).toBe('');
    expect(cleanTranscriptText(undefined as any)).toBe('');
  });

  it('strips bracketed and parenthesized audio cues', () => {
    const raw = 'Welcome back [Music] today we are looking at (cheering) Docker containers [Applause]';
    const cleaned = cleanTranscriptText(raw);
    expect(cleaned).toBe('Welcome back today we are looking at Docker containers');
    expect(cleaned).not.toContain('[Music]');
    expect(cleaned).not.toContain('(cheering)');
    expect(cleaned).not.toContain('[Applause]');
  });

  it('decodes HTML entities and removes control characters', () => {
    const raw = 'Fast &amp; modern &lt;div&gt; with &quot;quotes&quot;&#39; and \x00null';
    const cleaned = cleanTranscriptText(raw);
    expect(cleaned).toBe('Fast & modern <div> with "quotes"\' and null');
  });

  it('collapses multiple whitespace characters and fixes punctuation spacing', () => {
    const raw = 'Hello    world   ,   how are you  ?   Great  ! ';
    const cleaned = cleanTranscriptText(raw);
    expect(cleaned).toBe('Hello world, how are you? Great!');
  });

  it('truncates cleanly at sentence boundaries when exceeding maxChars', () => {
    const sentence1 = 'First sentence explains the initial concept.';
    const sentence2 = 'Second sentence describes the architecture.';
    const longText = `${sentence1} ${sentence2} Third sentence goes too far.`;

    const cleaned = cleanTranscriptText(longText, 80);
    expect(cleaned.length).toBeLessThanOrEqual(80);
    expect(cleaned).toContain(sentence1);
  });
});

describe('formatTranscriptSegments', () => {
  it('combines segment arrays into a coherent clean string', () => {
    const segments = [
      { text: 'First part of', start: 0, duration: 2 },
      { text: '[Music] the explanation', start: 2, duration: 2 },
      { text: 'about React hooks.', start: 4, duration: 2 },
    ];

    const result = formatTranscriptSegments(segments);
    expect(result).toBe('First part of the explanation about React hooks.');
  });

  it('returns empty string for empty or invalid segment arrays', () => {
    expect(formatTranscriptSegments([])).toBe('');
    expect(formatTranscriptSegments(null as any)).toBe('');
  });
});

describe('isTextSubstantial', () => {
  it('returns true for text with sufficient meaningful words', () => {
    expect(isTextSubstantial('Here is a great technique to optimize your React components')).toBe(true);
  });

  it('returns false for empty or brief filler text', () => {
    expect(isTextSubstantial('')).toBe(false);
    expect(isTextSubstantial('thanks bye')).toBe(false);
    expect(isTextSubstantial('[Music]')).toBe(false);
  });
});
