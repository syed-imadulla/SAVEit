import {
  LlmProvider,
  LlmPromptContext,
  StructuredKnowledge,
  LlmErrorCode,
  LlmProviderError,
} from './types';
import { getDefaultLlmProvider } from './llmProvider';
import { cleanTranscriptText, isTextSubstantial } from './textCleaner';
import { extractCandidateResources, mergeResources } from './resourceExtractor';

export interface StructuringInput {
  title?: string;
  author?: string;
  platform: string;
  rawText?: string;
  description?: string;
  ocrText?: string;
}

export interface StructuringResult {
  success: boolean;
  knowledge: StructuredKnowledge;
  error?: string;
  errorCode?: LlmErrorCode | 'INSUFFICIENT_TEXT';
}

/**
 * Orchestrates text pre-cleaning, LLM prompt assembly, heuristic resource extraction,
 * and graceful degradation when quotas or models are unavailable.
 */
export class StructuringService {
  private llmProvider: LlmProvider;

  constructor(llmProvider?: LlmProvider) {
    this.llmProvider = llmProvider || getDefaultLlmProvider();
  }

  /**
   * Allows swapping or injecting an LLM provider (useful for testing or runtime selection).
   */
  setProvider(provider: LlmProvider): void {
    this.llmProvider = provider;
  }

  getProviderName(): string {
    return this.llmProvider.name;
  }

  /**
   * Structures video text evidence into concise summary, key takeaways, tags, and resources.
   * Never throws unhandled errors — guarantees clean fallback and honest reporting.
   */
  async structure(input: StructuringInput): Promise<StructuringResult> {
    const rawContent = [
      input.rawText,
      input.ocrText ? `[On-Screen Visual Text & Code]\n${input.ocrText}` : undefined,
      input.description,
    ]
      .filter(Boolean)
      .join('\n\n');
    const cleanedText = cleanTranscriptText(rawContent);

    // Heuristically extract any candidate URLs, GitHub repos, or known tools from text & description
    const heuristicResources = extractCandidateResources(`${input.title || ''} ${rawContent}`);

    // Check if there is enough substantial text content to warrant an AI call
    if (!isTextSubstantial(cleanedText)) {
      const fallbackTags = [input.platform.toLowerCase()];
      return {
        success: false,
        knowledge: {
          summary: input.title
            ? `Captured: "${input.title}". Transcript text is unavailable or insufficient for full analysis.`
            : 'Captured short-form video item. Transcript text is unavailable.',
          keyPoints: [],
          tags: fallbackTags,
          resources: heuristicResources,
        },
        errorCode: 'INSUFFICIENT_TEXT',
        error: 'Transcript or text evidence is insufficient for AI structuring.',
      };
    }

    const promptContext: LlmPromptContext = {
      title: input.title,
      author: input.author,
      platform: input.platform,
      text: cleanedText,
    };

    try {
      const llmResult = await this.llmProvider.generateStructured(promptContext);

      // Merge and deduplicate resources from both LLM and regex heuristics
      const combinedResources = mergeResources(llmResult.resources, heuristicResources);

      return {
        success: true,
        knowledge: {
          ...llmResult,
          resources: combinedResources,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errorCode: LlmErrorCode = err instanceof LlmProviderError ? err.code : 'NETWORK_ERROR';

      console.warn(`[StructuringService] AI provider failed (${errorCode}): ${message}`);

      // Graceful degradation: preserve item and provide honest fallback without fabricating takeaways
      const fallbackTags = [input.platform.toLowerCase(), 'unstructured'];
      return {
        success: false,
        knowledge: {
          summary: input.title
            ? `Captured: "${input.title}". (AI analysis pending or quota limit reached)`
            : 'Captured video item. (AI analysis pending or quota limit reached)',
          keyPoints: [],
          tags: fallbackTags,
          resources: heuristicResources,
        },
        errorCode,
        error: message,
      };
    }
  }
}

export const defaultStructuringService = new StructuringService();
