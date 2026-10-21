import {
  LlmProvider,
  LlmPromptContext,
  StructuredKnowledge,
  ExtractedResource,
  ResourceType,
  ResourceStatus,
  LlmProviderError,
} from './types';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_TIMEOUT_MS = 15000;

/**
 * System prompt defining the exact JSON schema and expectations for short-form video structuring.
 */
export const STRUCTURING_SYSTEM_INSTRUCTION = `You are a technical knowledge extraction engine for SAVEit.
Your task is to analyze short-form educational and technical video content (transcripts, captions, title, author) and extract structured, high-value knowledge.

Output strictly valid JSON conforming to this schema:
{
  "summary": "1-2 sentence concise summary highlighting the core technical lesson or insight.",
  "keyPoints": [
    "3 to 5 actionable bullet points or technical takeaways explained clearly."
  ],
  "tags": [
    "3 to 7 normalized lowercase technical tags (e.g. 'docker', 'typescript', 'react', 'git')."
  ],
  "resources": [
    {
      "title": "Name of the tool, package, library, or repository mentioned",
      "url": "Candidate or mentioned URL, or omit if only spoken name",
      "type": "github_repo | documentation | tool | website | article | other",
      "status": "unverified_mention",
      "description": "Short note of why this tool/repo is useful or referenced"
    }
  ]
}

Guidelines:
- Never fabricate or hallucinate content not grounded in the provided text.
- If a tool or repository name is spoken without an explicit URL, do not guess a fake URL; leave "url" undefined.
- Keep tags concise, single-concept, and lowercase.
- Only return the raw JSON object. Do not include markdown code fences or conversational text.`;

/**
 * Deterministic mock provider for hermetic testing and offline operation.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'MockLlmProvider';
  private customResponse?: StructuredKnowledge;
  private shouldFail = false;
  private failureError = 'Mock LLM error';

  constructor(options: { customResponse?: StructuredKnowledge; shouldFail?: boolean; failureError?: string } = {}) {
    this.customResponse = options.customResponse;
    this.shouldFail = options.shouldFail || false;
    if (options.failureError) this.failureError = options.failureError;
  }

  setCustomResponse(response: StructuredKnowledge): void {
    this.customResponse = response;
  }

  setShouldFail(shouldFail: boolean, error = 'Mock LLM error'): void {
    this.shouldFail = shouldFail;
    this.failureError = error;
  }

  async generateStructured(context: LlmPromptContext): Promise<StructuredKnowledge> {
    if (this.shouldFail) {
      throw new LlmProviderError(this.failureError, 'NETWORK_ERROR');
    }

    if (this.customResponse) {
      return this.customResponse;
    }

    // Default heuristic mock response derived from context
    const tags = ['coding', 'tutorial', context.platform.toLowerCase()];
    if (context.title && context.title.toLowerCase().includes('python')) tags.push('python');
    if (context.title && context.title.toLowerCase().includes('docker')) tags.push('docker');

    return {
      summary: context.title
        ? `Summary of "${context.title}": Covers core techniques and practical workflows.`
        : 'Summary of video content highlighting key principles and implementation steps.',
      keyPoints: [
        'Understand the core concepts presented in the video.',
        'Apply best practices for implementation and architecture.',
        'Review the referenced tools and practical demonstrations.',
      ],
      tags,
      resources: [
        {
          title: 'Reference Tool',
          type: 'tool',
          status: 'unverified_mention',
          description: 'Mentioned tool in the educational video.',
        },
      ],
    };
  }
}

export interface GeminiLlmProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Production provider integrating Google Gemini 1.5 Flash via REST.
 *
 * Implements the modular LlmProvider interface so other providers (e.g. Groq, Ollama)
 * can be plugged in without changing business logic.
 */
export class GeminiLlmProvider implements LlmProvider {
  readonly name = 'GeminiLlmProvider';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: GeminiLlmProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.model = options.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetchFn || fetch;
  }

  async generateStructured(context: LlmPromptContext): Promise<StructuredKnowledge> {
    if (!this.apiKey) {
      throw new LlmProviderError('GEMINI_API_KEY is not configured. AI analysis is pending.', 'MISSING_API_KEY');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const promptText = `Analyze the following video content and return the structured JSON object:

Platform: ${context.platform}
Title: ${context.title || 'Untitled'}
Author: ${context.author || 'Unknown'}
Content:
${context.text}`;

    const requestBody = {
      systemInstruction: {
        parts: [{ text: STRUCTURING_SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    let response: Response;
    try {
      response = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('aborted')) {
        throw new LlmProviderError(`Gemini request timed out after ${this.timeoutMs}ms.`, 'REQUEST_TIMEOUT');
      }
      throw new LlmProviderError(`Gemini network error: ${msg}`, 'NETWORK_ERROR');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 429) {
        throw new LlmProviderError(
          'Gemini free tier quota limit reached (HTTP 429). AI analysis is pending.',
          'QUOTA_EXHAUSTED',
          429
        );
      }
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new LlmProviderError(
          `Invalid or unauthorized GEMINI_API_KEY (HTTP ${response.status}).`,
          'INVALID_API_KEY',
          response.status
        );
      }
      throw new LlmProviderError(`Gemini API returned HTTP ${response.status}: ${errorText}`, 'NETWORK_ERROR', response.status);
    }

    const rawData = await response.json();
    const candidateText = rawData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText || typeof candidateText !== 'string') {
      throw new LlmProviderError('Gemini API returned an empty or invalid candidate response.', 'INVALID_OUTPUT');
    }

    return this.parseAndValidateJson(candidateText);
  }

  /**
   * Sanitizes and parses the raw JSON text from Gemini.
   */
  parseAndValidateJson(rawText: string): StructuredKnowledge {
    // Strip possible markdown code fences if present
    const cleanedJson = rawText
      .replace(/^```(json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanedJson);
    } catch (err) {
      throw new LlmProviderError(`Failed to parse Gemini JSON output: ${rawText}`, 'INVALID_OUTPUT');
    }

    // Validate required fields
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.filter((p: any) => typeof p === 'string' && p.trim().length > 0)
      : [];
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
          .map((t: string) => t.toLowerCase().trim())
      : [];

    const allowedTypes: ResourceType[] = ['github_repo', 'documentation', 'tool', 'website', 'article', 'other'];
    const resources: ExtractedResource[] = Array.isArray(parsed.resources)
      ? parsed.resources
          .filter((r: any) => r && typeof r.title === 'string' && r.title.trim().length > 0)
          .map((r: any) => ({
            title: r.title.trim(),
            url: typeof r.url === 'string' && r.url.trim().length > 0 ? r.url.trim() : undefined,
            type: allowedTypes.includes(r.type) ? r.type : 'tool',
            status: 'unverified_mention' as ResourceStatus,
            description: typeof r.description === 'string' ? r.description.trim() : undefined,
          }))
      : [];

    return {
      summary: summary || 'No summary could be synthesized.',
      keyPoints,
      tags,
      resources,
    };
  }
}

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

export interface GroqLlmProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Production provider integrating Groq Cloud via OpenAI-compatible REST API.
 */
export class GroqLlmProvider implements LlmProvider {
  readonly name = 'GroqLlmProvider';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: GroqLlmProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.GROQ_API_KEY || '';
    this.model = options.model || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetchFn || fetch;
  }

  async generateStructured(context: LlmPromptContext): Promise<StructuredKnowledge> {
    if (!this.apiKey) {
      throw new LlmProviderError('GROQ_API_KEY is not configured. AI analysis is pending.', 'MISSING_API_KEY');
    }

    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const promptText = `Analyze the following video content and return the structured JSON object:

Platform: ${context.platform}
Title: ${context.title || 'Untitled'}
Author: ${context.author || 'Unknown'}
Content:
${context.text}`;

    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: STRUCTURING_SYSTEM_INSTRUCTION },
        { role: 'user', content: promptText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    };

    let response: Response;
    try {
      response = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('aborted')) {
        throw new LlmProviderError(`Groq request timed out after ${this.timeoutMs}ms.`, 'REQUEST_TIMEOUT');
      }
      throw new LlmProviderError(`Groq network error: ${msg}`, 'NETWORK_ERROR');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 429) {
        throw new LlmProviderError(
          'Groq free tier rate/quota limit reached (HTTP 429). AI analysis is pending.',
          'QUOTA_EXHAUSTED',
          429
        );
      }
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new LlmProviderError(
          `Invalid or unauthorized GROQ_API_KEY (HTTP ${response.status}).`,
          'INVALID_API_KEY',
          response.status
        );
      }
      throw new LlmProviderError(`Groq API returned HTTP ${response.status}: ${errorText}`, 'NETWORK_ERROR', response.status);
    }

    const rawData = await response.json();
    const content = rawData?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      throw new LlmProviderError('Groq API returned an empty or invalid message content.', 'INVALID_OUTPUT');
    }

    return this.parseAndValidateJson(content);
  }

  /**
   * Sanitizes and parses the raw JSON text from Groq.
   */
  parseAndValidateJson(rawText: string): StructuredKnowledge {
    const cleanedJson = rawText
      .replace(/^```(json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanedJson);
    } catch (err) {
      throw new LlmProviderError(`Failed to parse Groq JSON output: ${rawText}`, 'INVALID_OUTPUT');
    }

    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.filter((p: any) => typeof p === 'string' && p.trim().length > 0)
      : [];
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
          .map((t: string) => t.toLowerCase().trim())
      : [];

    const allowedTypes: ResourceType[] = ['github_repo', 'documentation', 'tool', 'website', 'article', 'other'];
    const resources: ExtractedResource[] = Array.isArray(parsed.resources)
      ? parsed.resources
          .filter((r: any) => r && typeof r.title === 'string' && r.title.trim().length > 0)
          .map((r: any) => ({
            title: r.title.trim(),
            url: typeof r.url === 'string' && r.url.trim().length > 0 ? r.url.trim() : undefined,
            type: allowedTypes.includes(r.type) ? r.type : 'tool',
            status: 'unverified_mention' as ResourceStatus,
            description: typeof r.description === 'string' ? r.description.trim() : undefined,
          }))
      : [];

    return {
      summary: summary || 'No summary could be synthesized.',
      keyPoints,
      tags,
      resources,
    };
  }
}

/**
 * Returns the default provider based on environment configuration.
 * Selects based on LLM_PROVIDER ('gemini' | 'groq') or available API keys,
 * safely falling back to MockLlmProvider if no keys are configured.
 */
export function getDefaultLlmProvider(): LlmProvider {
  const preferred = (process.env.LLM_PROVIDER || '').toLowerCase().trim();
  if (preferred === 'groq' && process.env.GROQ_API_KEY) {
    return new GroqLlmProvider();
  }
  if (preferred === 'gemini' && process.env.GEMINI_API_KEY) {
    return new GeminiLlmProvider();
  }
  if (process.env.GEMINI_API_KEY) {
    return new GeminiLlmProvider();
  }
  if (process.env.GROQ_API_KEY) {
    return new GroqLlmProvider();
  }
  return new MockLlmProvider();
}
