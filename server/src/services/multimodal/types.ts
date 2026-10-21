import { Platform, ProcessingStatus } from '../../models/Item';
import { TranscriptSegment } from '../retrieval/types';

export { TranscriptSegment };

/**
 * Options passed to an STT transcription job.
 */
export interface SttOptions {
  /** Target or hint language (e.g. 'en', 'es') */
  language?: string;
  /** Optional domain-specific prompt or vocabulary guidance */
  prompt?: string;
  /** Sampling temperature (0.0 for deterministic output) */
  temperature?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** MIME type of the supplied audio buffer (default: 'audio/wav') */
  mimeType?: string;
}

/**
 * Standardized speech-to-text transcription result.
 */
export interface SttResult {
  /** Full concatenated text of the speech */
  text: string;
  /** Timestamped segments for evidence attribution */
  segments: TranscriptSegment[];
  /** Detected or asserted language */
  language?: string;
  /** Audio duration in seconds if known */
  durationSeconds?: number;
  /** Name of the STT provider that produced this transcript */
  providerName: string;
}

/**
 * Error thrown by STT providers during processing.
 */
export class SttProviderError extends Error {
  readonly code: 'MISSING_API_KEY' | 'QUOTA_EXHAUSTED' | 'INVALID_AUDIO' | 'TIMEOUT' | 'NETWORK_ERROR' | 'UNSUPPORTED';
  readonly statusCode?: number;

  constructor(
    message: string,
    code: 'MISSING_API_KEY' | 'QUOTA_EXHAUSTED' | 'INVALID_AUDIO' | 'TIMEOUT' | 'NETWORK_ERROR' | 'UNSUPPORTED',
    statusCode?: number
  ) {
    super(message);
    this.name = 'SttProviderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Modular interface for Speech-to-Text providers.
 */
export interface SttProvider {
  /** Friendly identifier for the provider */
  readonly name: string;

  /**
   * Transcribes raw audio bytes into timestamped text.
   */
  transcribe(audioBuffer: Buffer, options?: SttOptions): Promise<SttResult>;
}

/**
 * Empirical media accessibility probe result.
 */
export interface MediaAccessProbeResult {
  url: string;
  platform: Platform;
  metadataAccessible: boolean;
  captionsAccessible: boolean;
  audioStreamAccessible: boolean;
  videoStreamAccessible: boolean;
  directBytesDownloadable: boolean;
  latencyMs: number;
  notes: string;
}

// ==========================================
// Phase 4 Plan 02: Keyframe Sampling & OCR
// ==========================================

/**
 * An individual sampled video frame.
 */
export interface SampledFrame {
  /** Zero-indexed sequence number of the frame */
  index: number;
  /** Exact time offset in milliseconds from the start of the video */
  timestampMs: number;
  /** Raw image buffer (JPEG or PNG) */
  imageBuffer: Buffer;
  /** Width of the frame in pixels if known */
  width?: number;
  /** Height of the frame in pixels if known */
  height?: number;
}

/**
 * Configuration options for the KeyframeSampler.
 */
export interface KeyframeOptions {
  /** Sampling interval in seconds (default: 3.0) */
  intervalSeconds?: number;
  /** Maximum number of frames to extract (default: 10) */
  maxFrames?: number;
  /** Execution timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Maximum allowable media duration in seconds to process (default: 60) */
  maxDurationSeconds?: number;
  /** Whether to filter out consecutive visually redundant frames (default: true) */
  dropRedundant?: boolean;
}

/**
 * Error thrown during keyframe extraction.
 */
export class KeyframeSamplerError extends Error {
  readonly code: 'INVALID_INPUT' | 'FFMPEG_MISSING' | 'TIMEOUT' | 'EXECUTION_FAILED' | 'LIMIT_EXCEEDED';

  constructor(message: string, code: 'INVALID_INPUT' | 'FFMPEG_MISSING' | 'TIMEOUT' | 'EXECUTION_FAILED' | 'LIMIT_EXCEEDED') {
    super(message);
    this.name = 'KeyframeSamplerError';
    this.code = code;
  }
}

/**
 * Options passed to OCR recognition.
 */
export interface OcrOptions {
  /** Language hint for OCR engine (default: 'eng') */
  language?: string;
  /** Maximum execution timeout per frame in milliseconds (default: 5000) */
  timeoutMs?: number;
}

/**
 * Low-level OCR engine recognition output.
 */
export interface OcrRecognitionResult {
  /** Extracted raw text */
  text: string;
  /** Average confidence score (0 to 100) if supported */
  confidence?: number;
}

/**
 * Modular interface for OCR providers.
 */
export interface OcrProvider {
  /** Friendly identifier for the provider */
  readonly name: string;

  /**
   * Checks whether the underlying OCR engine or binary is available.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Recognizes text from a single frame image buffer.
   */
  recognizeText(imageBuffer: Buffer, options?: OcrOptions): Promise<OcrRecognitionResult>;
}

/**
 * A single timestamped visual observation extracted from a video keyframe.
 */
export interface OcrObservation {
  /** Frame index */
  frameIndex: number;
  /** Video timestamp in milliseconds */
  timestampMs: number;
  /** Cleaned text detected on-screen */
  rawText: string;
  /** Isolated code snippets detected on screen */
  codeSnippets: string[];
  /** Terminal commands identified (e.g. $ npm install, $ docker run) */
  terminalCommands: string[];
  /** Discovered URLs or GitHub references */
  urls: string[];
  /** Mentioned developer tools detected visually */
  toolMentions: string[];
  /** Confidence score (0-100) if provided by OCR engine */
  confidenceScore?: number;
}

/**
 * Aggregate result of video frame OCR extraction.
 */
export interface OcrExtractionResult {
  /** Sequential timestamped observations */
  observations: OcrObservation[];
  /** Full concatenated, deduplicated text from all frames */
  fullOcrText: string;
  /** Unique code snippets discovered across all frames */
  uniqueCodeSnippets: string[];
  /** Unique terminal commands discovered */
  uniqueTerminalCommands: string[];
  /** Unique URLs discovered */
  uniqueUrls: string[];
  /** Unique developer tools mentioned */
  uniqueTools: string[];
  /** Number of frames sampled */
  framesSampled: number;
  /** Number of frames containing legible text */
  framesWithText: number;
  /** Name of OCR provider used */
  providerName: string;
}

// ==========================================
// Phase 4 Plan 03: Multimodal Pipeline & Grounding
// ==========================================

export { IEvidenceReference, ITranscriptSegment } from '../../models/Item';

/**
 * Input payload for multimodal analysis pipeline.
 */
export interface MultimodalAnalysisInput {
  url: string;
  platform: Platform;
  existingTranscript?: string;
  existingSegments?: TranscriptSegment[];
  audioBuffer?: Buffer;
  mediaFilePath?: string;
  title?: string;
  author?: string;
  sttOptions?: SttOptions;
  keyframeOptions?: KeyframeOptions;
  ocrOptions?: OcrOptions;
}

/**
 * Standardized diagnostic report on multimodal pipeline execution.
 */
export interface MultimodalDiagnostics {
  sttAttempted: boolean;
  sttSuccess: boolean;
  sttProvider?: string;
  sttError?: string;
  keyframesSampled: number;
  ocrAttempted: boolean;
  ocrSuccess: boolean;
  ocrProvider?: string;
  ocrError?: string;
}

/**
 * Complete result of the multimodal analysis pipeline.
 */
export interface MultimodalAnalysisResult {
  status: ProcessingStatus;
  transcriptText?: string;
  transcriptSegments?: TranscriptSegment[];
  transcriptSource: 'timedtext' | 'whisper' | 'none';
  ocrText?: string;
  ocrObservations?: OcrObservation[];
  combinedText: string;
  evidenceAttributions: import('../../models/Item').IEvidenceReference[];
  diagnostics: MultimodalDiagnostics;
}
