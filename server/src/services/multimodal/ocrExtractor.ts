import {
  SampledFrame,
  OcrProvider,
  OcrOptions,
  OcrObservation,
  OcrExtractionResult,
} from './types';
import { extractCandidateResources } from '../intelligence/resourceExtractor';

// Regex patterns for terminal commands
const TERMINAL_COMMAND_PATTERNS = [
  /^\s*[$#>]\s*(.+)$/gm,
  /\b(npm|npx|pnpm|yarn|bun)\s+(install|add|run|create|build|test|init)\b[^\n]*/gi,
  /\b(docker|docker-compose)\s+(run|build|up|down|ps|exec|pull|push)\b[^\n]*/gi,
  /\b(git)\s+(clone|commit|push|pull|checkout|switch|branch|status|rebase|stash)\b[^\n]*/gi,
  /\b(cargo|pip|pip3|brew|apt|apt-get|kubectl)\s+[^\n]+/gi,
  /\b(curl|wget)\s+-[A-Za-z0-9]+\s+[^\n]*/gi,
];

// Regex patterns for code syntax indicators
const CODE_LINE_PATTERNS = [
  /^\s*(import|export)\s+.+from\s+['"][^'"]+['"]/i,
  /^\s*(const|let|var)\s+[a-zA-Z0-9_$]+\s*[:=]/,
  /^\s*(function|async function|class|interface|type)\s+[a-zA-Z0-9_$]+/,
  /^\s*(def|class)\s+[a-zA-Z0-9_]+(\(.*\))?:/,
  /=>\s*\{?/,
  /console\.(log|warn|error)\(/,
  /return\s+[\w$("'{\[]/,
];

// Curated catalog of developer tools for visual detection
const KNOWN_TOOLS = [
  'docker',
  'kubernetes',
  'redis',
  'postgres',
  'postgresql',
  'mongodb',
  'react',
  'vue',
  'angular',
  'svelte',
  'nextjs',
  'next.js',
  'vite',
  'tailwind',
  'tailwindcss',
  'typescript',
  'javascript',
  'python',
  'rust',
  'golang',
  'fastapi',
  'express',
  'graphql',
  'prisma',
  'ffmpeg',
  'git',
  'github',
];

/**
 * Normalizes OCR raw text: collapses excessive blank lines and spaces
 * while preserving multi-line code formatting.
 */
export function normalizeOcrText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, i, arr) => {
      // Allow single empty lines between code paragraphs, collapse multiples
      if (line.trim().length === 0) {
        return i > 0 && arr[i - 1].trim().length > 0;
      }
      return true;
    })
    .join('\n')
    .trim();
}

/**
 * Extracts distinct code snippets from normalized multi-line OCR text.
 */
export function extractCodeSnippets(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const snippets: string[] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    const isCode = CODE_LINE_PATTERNS.some((pat) => pat.test(line));
    if (isCode || (currentBlock.length > 0 && (line.startsWith('  ') || line.startsWith('\t') || line.trim() === '}'))) {
      currentBlock.push(line);
    } else {
      if (currentBlock.length > 0) {
        snippets.push(currentBlock.join('\n').trim());
        currentBlock = [];
      }
    }
  }

  if (currentBlock.length > 0) {
    snippets.push(currentBlock.join('\n').trim());
  }

  return snippets;
}

/**
 * Extracts terminal shell commands from text.
 */
export function extractTerminalCommands(text: string): string[] {
  if (!text) return [];
  const commands = new Set<string>();

  for (const pattern of TERMINAL_COMMAND_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const matches = text.matchAll(new RegExp(pattern.source, flags));
    for (const match of matches) {
      let cmd = (match[0] || '').replace(/^[$#>]\s*/, '').trim();
      if (cmd.length > 2) {
        commands.add(cmd);
      }
    }
  }

  return Array.from(commands);
}

/**
 * Checks if two text strings from nearby frames are essentially identical.
 */
function isConsecutiveDuplicate(textA: string, textB: string): boolean {
  if (textA === textB) return true;
  const cleanA = textA.replace(/\s+/g, ' ').toLowerCase();
  const cleanB = textB.replace(/\s+/g, ' ').toLowerCase();
  if (cleanA === cleanB) return true;

  // If one string contains >85% of the other, treat as duplicate on-screen slide
  const minLen = Math.min(cleanA.length, cleanB.length);
  const maxLen = Math.max(cleanA.length, cleanB.length);
  if (minLen > 20 && maxLen - minLen < 15 && (cleanA.includes(cleanB) || cleanB.includes(cleanA))) {
    return true;
  }
  return false;
}

/**
 * Visual OCR Extractor.
 *
 * Runs OCR across sampled keyframes, extracts code blocks, terminal commands,
 * URLs, and tool references, and maps them to timestamped evidence observations.
 */
export class OcrExtractor {
  private ocrProvider: OcrProvider;

  constructor(ocrProvider: OcrProvider) {
    this.ocrProvider = ocrProvider;
  }

  /**
   * Processes an array of sampled video frames and extracts timestamped observations.
   */
  async extractFromFrames(frames: SampledFrame[], options?: OcrOptions): Promise<OcrExtractionResult> {
    const observations: OcrObservation[] = [];
    const allCodeSnippets = new Set<string>();
    const allCommands = new Set<string>();
    const allUrls = new Set<string>();
    const allTools = new Set<string>();
    const textBlocks: string[] = [];

    let prevNormalizedText = '';

    for (const frame of frames) {
      const recognition = await this.ocrProvider.recognizeText(frame.imageBuffer, options);
      const normalized = normalizeOcrText(recognition.text);

      if (!normalized || normalized.length < 3) {
        continue;
      }

      // Skip consecutive redundant on-screen slide text
      if (prevNormalizedText && isConsecutiveDuplicate(prevNormalizedText, normalized)) {
        continue;
      }
      prevNormalizedText = normalized;

      // 1. Extract code snippets
      const codeSnippets = extractCodeSnippets(normalized);
      codeSnippets.forEach((c) => allCodeSnippets.add(c));

      // 2. Extract terminal commands
      const terminalCommands = extractTerminalCommands(normalized);
      terminalCommands.forEach((cmd) => allCommands.add(cmd));

      // 3. Extract candidate URLs & GitHub references
      const extractedResources = extractCandidateResources(normalized);
      const frameUrls: string[] = [];
      for (const res of extractedResources) {
        if (res.url) {
          frameUrls.push(res.url);
          allUrls.add(res.url);
        }
      }

      // 4. Extract developer tools mentioned on screen
      const lower = normalized.toLowerCase();
      const frameTools: string[] = [];
      for (const tool of KNOWN_TOOLS) {
        const regex = new RegExp(`\\b${tool}\\b`, 'i');
        if (regex.test(lower)) {
          frameTools.push(tool);
          allTools.add(tool);
        }
      }

      observations.push({
        frameIndex: frame.index,
        timestampMs: frame.timestampMs,
        rawText: normalized,
        codeSnippets,
        terminalCommands,
        urls: frameUrls,
        toolMentions: frameTools,
        confidenceScore: recognition.confidence,
      });

      textBlocks.push(normalized);
    }

    const fullOcrText = textBlocks.join('\n\n---\n\n');

    return {
      observations,
      fullOcrText,
      uniqueCodeSnippets: Array.from(allCodeSnippets),
      uniqueTerminalCommands: Array.from(allCommands),
      uniqueUrls: Array.from(allUrls),
      uniqueTools: Array.from(allTools),
      framesSampled: frames.length,
      framesWithText: observations.length,
      providerName: this.ocrProvider.name,
    };
  }
}
