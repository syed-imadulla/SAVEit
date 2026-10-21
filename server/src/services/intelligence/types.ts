/**
 * Type contracts for Phase 3: Text-First Intelligence & Structuring.
 */

export type ResourceType =
  | 'github_repo'
  | 'documentation'
  | 'tool'
  | 'website'
  | 'article'
  | 'other';

export type ResourceStatus =
  | 'verified'           // Confirmed reachable via HTTP 2xx/3xx
  | 'unverified_mention' // Spoken tool or repo mention without verified link
  | 'broken';            // URL returned 4xx, 5xx, or network failure

export interface ExtractedResource {
  /** Name of the tool, package, library, or repository */
  title: string;
  /** Candidate or resolved URL (if available) */
  url?: string;
  /** Categorized resource type */
  type: ResourceType;
  /** Verification status */
  status: ResourceStatus;
  /** Concise context of why this resource was mentioned */
  description?: string;
}

export interface StructuredKnowledge {
  /** Concise 1-2 sentence high-level overview focused on technical value */
  summary: string;
  /** 3-5 bulleted actionable takeaways or technical concepts */
  keyPoints: string[];
  /** 3-7 normalized lowercase topic tags (e.g., 'docker', 'react', 'typescript') */
  tags: string[];
  /** Extracted tools, libraries, repositories, and documentation links */
  resources: ExtractedResource[];
}

export interface LlmPromptContext {
  /** Video title */
  title?: string;
  /** Channel or author name */
  author?: string;
  /** Source video platform (e.g. 'youtube', 'instagram') */
  platform: string;
  /** Cleaned transcript or caption text */
  text: string;
}

export type LlmErrorCode =
  | 'MISSING_API_KEY'
  | 'QUOTA_EXHAUSTED'
  | 'INVALID_API_KEY'
  | 'REQUEST_TIMEOUT'
  | 'INVALID_OUTPUT'
  | 'NETWORK_ERROR';

export class LlmProviderError extends Error {
  readonly code: LlmErrorCode;
  readonly status?: number;

  constructor(message: string, code: LlmErrorCode, status?: number) {
    super(message);
    this.name = 'LlmProviderError';
    this.code = code;
    this.status = status;
  }
}

export interface LlmProvider {
  readonly name: string;
  /**
   * Generates structured knowledge from the provided context.
   * Throws an LlmProviderError if the model fails, times out, or returns unparseable output.
   */
  generateStructured(context: LlmPromptContext): Promise<StructuredKnowledge>;
}
