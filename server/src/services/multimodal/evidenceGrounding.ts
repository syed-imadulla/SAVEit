import { IEvidenceReference, IResource, IOcrObservation } from '../../models/Item';
import { TranscriptSegment } from '../retrieval/types';
import { OcrObservation } from './types';

export interface GroundingInput {
  keyPoints?: string[];
  resources?: IResource[];
  transcriptSegments?: TranscriptSegment[];
  ocrObservations?: Array<IOcrObservation | OcrObservation>;
  metadata?: {
    title?: string;
    author?: string;
    description?: string;
  };
}

export interface GroundingOutput {
  attributions: IEvidenceReference[];
  groundedResources: IResource[];
}

/**
 * Standard English stop words to filter out when performing token-based fuzzy matching.
 */
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing',
  'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t',
  'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if',
  'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t',
  'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s',
  'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re',
  'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t',
  'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s',
  'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t',
  'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself',
  'yourselves', 'use', 'using', 'used', 'make', 'makes', 'video', 'show', 'shows',
]);

/**
 * Extracts normalized tokens from a text string, stripping punctuation and stop words.
 */
function extractMeaningfulTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/**
 * Computes Jaccard word-overlap similarity between two token arrays.
 */
function tokenOverlapScore(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setB = new Set(tokensB);
  let matches = 0;
  for (const token of tokensA) {
    if (setB.has(token)) {
      matches++;
    }
  }
  return matches / Math.min(tokensA.length, tokensB.length);
}

/**
 * Grounds takeaways (keyPoints) and resources against verifiable transcript segments,
 * on-screen OCR observations, and metadata.
 *
 * CRITICAL RULE:
 * Never fabricate timestamps, URLs, excerpts, or supporting evidence. If a point or resource
 * is not grounded in legitimate observed evidence, omit attribution for that item.
 */
export function groundEvidence(input: GroundingInput): GroundingOutput {
  const attributions: IEvidenceReference[] = [];
  const keyPoints = input.keyPoints || [];
  const resources = input.resources || [];
  const segments = input.transcriptSegments || [];
  const ocrObservations = input.ocrObservations || [];
  const metadata = input.metadata || {};

  // 1. Ground Takeaways (keyPoints)
  for (let idx = 0; idx < keyPoints.length; idx++) {
    const point = keyPoints[idx];
    const pointLower = point.toLowerCase();
    const pointTokens = extractMeaningfulTokens(point);
    let bestMatch: IEvidenceReference | undefined;

    // A. Check OCR Observations (terminal commands, code snippets, tools, URLs)
    for (const obs of ocrObservations) {
      // 1. Terminal command match
      for (const cmd of obs.terminalCommands || []) {
        const cmdClean = cmd.toLowerCase().trim();
        const cmdBase = cmdClean.replace(/\s+-[a-zA-Z0-9_-]+.*$/, '').trim();
        if (
          (cmdClean.length > 3 && pointLower.includes(cmdClean)) ||
          (cmdBase.length > 3 && pointLower.includes(cmdBase))
        ) {
          bestMatch = {
            targetType: 'keyPoint',
            targetIndex: idx,
            targetText: point,
            sourceType: 'ocr',
            timestampMs: obs.timestampMs,
            timestampSeconds: Math.round(obs.timestampMs / 1000),
            excerpt: cmd,
            frameIndex: obs.frameIndex,
          };
          break;
        }
      }
      if (bestMatch) break;

      // 2. Code snippet or tool mention in OCR
      for (const snippet of obs.codeSnippets || []) {
        if (snippet.length > 4 && pointLower.includes(snippet.toLowerCase().slice(0, 30))) {
          bestMatch = {
            targetType: 'keyPoint',
            targetIndex: idx,
            targetText: point,
            sourceType: 'ocr',
            timestampMs: obs.timestampMs,
            timestampSeconds: Math.round(obs.timestampMs / 1000),
            excerpt: snippet.slice(0, 100),
            frameIndex: obs.frameIndex,
          };
          break;
        }
      }
      if (bestMatch) break;

      // 3. OCR raw text keyword overlap (high confidence threshold >= 0.45)
      const obsTokens = extractMeaningfulTokens(obs.rawText);
      const score = tokenOverlapScore(pointTokens, obsTokens);
      if (score >= 0.45) {
        bestMatch = {
          targetType: 'keyPoint',
          targetIndex: idx,
          targetText: point,
          sourceType: 'ocr',
          timestampMs: obs.timestampMs,
          timestampSeconds: Math.round(obs.timestampMs / 1000),
          excerpt: obs.rawText.slice(0, 120),
          frameIndex: obs.frameIndex,
        };
        break;
      }
    }

    // B. Check Transcript Segments if not grounded by OCR
    if (!bestMatch) {
      let highestSegScore = 0;
      let matchedSeg: TranscriptSegment | undefined;

      for (const seg of segments) {
        const segTokens = extractMeaningfulTokens(seg.text);
        const score = tokenOverlapScore(pointTokens, segTokens);
        if (score > highestSegScore && score >= 0.35) {
          highestSegScore = score;
          matchedSeg = seg;
        }
      }

      if (matchedSeg) {
        bestMatch = {
          targetType: 'keyPoint',
          targetIndex: idx,
          targetText: point,
          sourceType: 'transcript',
          timestampSeconds: matchedSeg.start,
          timestampMs: Math.round(matchedSeg.start * 1000),
          excerpt: matchedSeg.text,
        };
      }
    }

    // C. Check Metadata (Title / Description) if still not grounded
    if (!bestMatch && metadata.title) {
      const titleTokens = extractMeaningfulTokens(metadata.title);
      const score = tokenOverlapScore(pointTokens, titleTokens);
      if (score >= 0.4) {
        bestMatch = {
          targetType: 'keyPoint',
          targetIndex: idx,
          targetText: point,
          sourceType: 'metadata',
          excerpt: metadata.title,
        };
      }
    }

    // Add attribution only if genuine evidence was matched
    if (bestMatch) {
      attributions.push(bestMatch);
    }
  }

  // 2. Ground Resources (Tools, URLs, Repositories)
  const groundedResources: IResource[] = [];

  for (let idx = 0; idx < resources.length; idx++) {
    const res = resources[idx];
    const nameLower = res.name.toLowerCase();
    const urlLower = res.url ? res.url.toLowerCase() : undefined;
    let resourceEvidence: IEvidenceReference | undefined;

    // A. Check OCR Observations
    for (const obs of ocrObservations) {
      // Direct URL match
      if (urlLower && obs.urls) {
        const matchedUrl = obs.urls.find((u) => u.toLowerCase() === urlLower || u.toLowerCase().includes(nameLower));
        if (matchedUrl) {
          resourceEvidence = {
            targetType: 'resource',
            targetIndex: idx,
            targetText: res.name,
            sourceType: 'ocr',
            timestampMs: obs.timestampMs,
            timestampSeconds: Math.round(obs.timestampMs / 1000),
            excerpt: matchedUrl,
            frameIndex: obs.frameIndex,
          };
          break;
        }
      }

      // Tool mention in OCR
      if (obs.toolMentions && obs.toolMentions.some((t) => t.toLowerCase() === nameLower)) {
        resourceEvidence = {
          targetType: 'resource',
          targetIndex: idx,
          targetText: res.name,
          sourceType: 'ocr',
          timestampMs: obs.timestampMs,
          timestampSeconds: Math.round(obs.timestampMs / 1000),
          excerpt: `Visible on-screen tool: ${res.name}`,
          frameIndex: obs.frameIndex,
        };
        break;
      }

      // Name boundary in OCR text
      const regex = new RegExp(`\\b${escapeRegExp(res.name)}\\b`, 'i');
      if (regex.test(obs.rawText)) {
        resourceEvidence = {
          targetType: 'resource',
          targetIndex: idx,
          targetText: res.name,
          sourceType: 'ocr',
          timestampMs: obs.timestampMs,
          timestampSeconds: Math.round(obs.timestampMs / 1000),
          excerpt: obs.rawText.slice(0, 100),
          frameIndex: obs.frameIndex,
        };
        break;
      }
    }

    // B. Check Transcript Segments
    if (!resourceEvidence) {
      const regex = new RegExp(`\\b${escapeRegExp(res.name)}\\b`, 'i');
      for (const seg of segments) {
        if (regex.test(seg.text)) {
          resourceEvidence = {
            targetType: 'resource',
            targetIndex: idx,
            targetText: res.name,
            sourceType: 'transcript',
            timestampSeconds: seg.start,
            timestampMs: Math.round(seg.start * 1000),
            excerpt: seg.text,
          };
          break;
        }
      }
    }

    // C. Check Metadata
    if (!resourceEvidence && metadata.title) {
      const regex = new RegExp(`\\b${escapeRegExp(res.name)}\\b`, 'i');
      if (regex.test(metadata.title)) {
        resourceEvidence = {
          targetType: 'resource',
          targetIndex: idx,
          targetText: res.name,
          sourceType: 'metadata',
          excerpt: metadata.title,
        };
      }
    }

    if (resourceEvidence) {
      attributions.push(resourceEvidence);
      groundedResources.push({
        ...res,
        evidence: resourceEvidence,
      });
    } else {
      groundedResources.push(res);
    }
  }

  return {
    attributions,
    groundedResources,
  };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
