import { Platform, ContentType, ProcessingStatus } from '../../models/Item';

/**
 * Honest classification of what content was successfully retrieved.
 *
 * - full: Both structured metadata and verified transcript/captions were extracted.
 * - transcript_only: Transcript/captions obtained, but metadata was missing.
 * - metadata_only: Title/author/thumbnail retrieved, but captions/audio inaccessible or protected.
 * - inaccessible: Content is deleted, private, invalid, or login-walled.
 */
export type AccessLevel = 'full' | 'transcript_only' | 'metadata_only' | 'inaccessible';

/**
 * Origin of the extracted transcript text.
 */
export type TranscriptSource = 'timedtext' | 'closed_captions' | 'whisper' | 'none';

/**
 * An individual timestamped subtitle or spoken segment.
 */
export interface TranscriptSegment {
  /** Start time in seconds from the beginning of the video */
  start: number;
  /** Duration of this segment in seconds */
  duration: number;
  /** Cleaned text for this segment */
  text: string;
}

/**
 * Structured transcript and caption payload.
 */
export interface TranscriptData {
  /** Full concatenated text of all segments */
  text: string;
  /** Individual timestamped segments */
  segments: TranscriptSegment[];
  /** Language code (e.g. 'en', 'es', 'hi') */
  language?: string;
  /** Method/origin of retrieval */
  source: TranscriptSource;
  /** Display label of the track (e.g. 'English (auto-generated)') */
  trackName?: string;
}

/**
 * Public metadata extracted from the platform.
 */
export interface RetrievalMetadata {
  title?: string;
  author?: string;
  authorUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  providerName?: string;
}

/**
 * Raw diagnostic indicators capturing exactly what was reachable.
 */
export interface RawEvidence {
  metadataAccessible: boolean;
  captionsDetected: boolean;
  captionTracksCount?: number;
  captionLanguages?: string[];
  rawStreamAccessible: boolean;
  httpStatusCode?: number;
  latencyMs?: number;
  failureReason?: string;
  notes?: string;
}

/**
 * The standardized evidence payload produced by all platform adapters.
 */
export interface EvidenceReport {
  /** The exact URL submitted by the user */
  originalUrl: string;
  /** Cleaned canonical URL with tracking parameters stripped */
  normalizedUrl: string;
  /** Video platform */
  platform: Platform;
  /** Video format (Reel or Short) */
  contentType: ContentType;
  /** Extracted platform video ID if present */
  platformId?: string;
  /** Honest access level */
  accessLevel: AccessLevel;
  /** Mapped item processing status */
  status: ProcessingStatus;
  /** Extracted public metadata */
  metadata: RetrievalMetadata;
  /** Extracted transcript if available */
  transcript?: TranscriptData;
  /** Diagnostics and audit trail */
  rawEvidence: RawEvidence;
  /** Timestamp when retrieval was attempted */
  retrievedAt: Date;
}

/**
 * Modular retrieval adapter interface that all platform adapters implement.
 */
export interface RetrievalAdapter {
  /** The platform handled by this adapter */
  readonly platform: Platform;

  /**
   * Fast synchronous check whether this adapter can process the given URL.
   */
  canHandle(url: string): boolean;

  /**
   * Probes and extracts evidence from the platform, returning an honest EvidenceReport.
   */
  retrieve(url: string): Promise<EvidenceReport>;
}
