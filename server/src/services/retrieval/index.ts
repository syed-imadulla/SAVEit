import { Platform, ContentType, ProcessingStatus } from '../../models/Item';
import {
  RetrievalAdapter,
  EvidenceReport,
  AccessLevel,
  RetrievalMetadata,
  TranscriptData,
  TranscriptSegment,
  RawEvidence,
} from './types';
import { YouTubeAdapter } from './youtubeAdapter';
import { InstagramAdapter } from './instagramAdapter';

export * from './types';
export * from './youtubeAdapter';
export * from './instagramAdapter';

/**
 * Registry storing platform retrieval adapters.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<Platform, RetrievalAdapter>();

  constructor() {
    // Register default platform adapters
    this.register(new YouTubeAdapter());
    this.register(new InstagramAdapter());
  }

  /**
   * Registers or replaces an adapter for a given platform.
   */
  register(adapter: RetrievalAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  /**
   * Retrieves an adapter by platform enum.
   */
  get(platform: Platform): RetrievalAdapter | undefined {
    return this.adapters.get(platform);
  }

  /**
   * Finds the first registered adapter whose canHandle(url) returns true.
   */
  findForUrl(url: string): RetrievalAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(url)) {
        return adapter;
      }
    }
    return undefined;
  }

  /**
   * Returns all registered adapters.
   */
  getAll(): RetrievalAdapter[] {
    return Array.from(this.adapters.values());
  }
}

/**
 * Central retrieval service coordinating multi-platform evidence capture.
 */
export class RetrievalService {
  constructor(private readonly registry: AdapterRegistry = new AdapterRegistry()) {}

  /**
   * Returns the underlying registry.
   */
  getRegistry(): AdapterRegistry {
    return this.registry;
  }

  /**
   * Safely retrieves evidence for a URL without throwing uncaught exceptions.
   */
  async retrieveEvidence(
    url: string,
    platformHint?: Platform
  ): Promise<EvidenceReport> {
    const retrievedAt = new Date();

    // 1. Resolve appropriate adapter
    let adapter: RetrievalAdapter | undefined;
    if (platformHint) {
      adapter = this.registry.get(platformHint);
    }
    if (!adapter) {
      adapter = this.registry.findForUrl(url);
    }

    if (!adapter) {
      return {
        originalUrl: url,
        normalizedUrl: url,
        platform: platformHint || Platform.YOUTUBE,
        contentType: ContentType.UNKNOWN,
        accessLevel: 'inaccessible',
        status: ProcessingStatus.UNSUPPORTED_INACCESSIBLE,
        metadata: {},
        rawEvidence: {
          metadataAccessible: false,
          captionsDetected: false,
          rawStreamAccessible: false,
          failureReason: 'UNSUPPORTED_PLATFORM',
          notes: `No retrieval adapter registered capable of processing URL: ${url}`,
        },
        retrievedAt,
      };
    }

    // 2. Dispatch retrieval with safety try/catch
    try {
      return await adapter.retrieve(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        originalUrl: url,
        normalizedUrl: url,
        platform: adapter.platform,
        contentType: ContentType.UNKNOWN,
        accessLevel: 'inaccessible',
        status: ProcessingStatus.RETRYABLE_FAILURE,
        metadata: {},
        rawEvidence: {
          metadataAccessible: false,
          captionsDetected: false,
          rawStreamAccessible: false,
          failureReason: 'UNHANDLED_ADAPTER_ERROR',
          notes: `Unexpected failure in ${adapter.platform} adapter: ${message}`,
        },
        retrievedAt,
      };
    }
  }
}

/**
 * Default singleton instance ready for use across application controllers.
 */
export const defaultRetrievalService = new RetrievalService();
