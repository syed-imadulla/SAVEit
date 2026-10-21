export type ProcessingStatus =
  | 'queued'
  | 'full_analyzed'
  | 'partially_analyzed'
  | 'metadata_only'
  | 'needs_user_input'
  | 'retryable_failure'
  | 'unsupported_inaccessible';

export type Platform = 'instagram' | 'youtube';

export type ContentType = 'reel' | 'short' | 'unknown';

export type ResourceType =
  | 'tool'
  | 'website'
  | 'github_repo'
  | 'tutorial'
  | 'api'
  | 'library'
  | 'product'
  | 'other';

export type ResourceVerificationStatus =
  | 'verified_link'
  | 'unverified_mention'
  | 'unavailable'
  | 'needs_review';

export interface IEvidenceReference {
  targetType: 'keyPoint' | 'resource';
  targetIndex: number;
  targetText?: string;
  sourceType: 'transcript' | 'ocr' | 'metadata';
  timestampMs?: number;
  timestampSeconds?: number;
  excerpt: string;
  frameIndex?: number;
}

export interface ITranscriptSegment {
  start: number;
  duration: number;
  text: string;
}

export interface IOcrObservation {
  frameIndex: number;
  timestampMs: number;
  rawText: string;
  codeSnippets?: string[];
  terminalCommands?: string[];
  urls?: string[];
  toolMentions?: string[];
  confidenceScore?: number;
}

export interface IResource {
  name: string;
  url?: string;
  type: ResourceType;
  verificationStatus: ResourceVerificationStatus;
  description?: string;
  evidence?: IEvidenceReference;
}

export interface IRawEvidence {
  transcript?: string;
  transcriptSegments?: ITranscriptSegment[];
  captions?: string;
  ocrText?: string;
  ocrObservations?: IOcrObservation[];
  evidenceAttributions?: IEvidenceReference[];
  notes?: string;
  failureReason?: string;
}

export interface SavedItem {
  _id: string;
  url: string;
  normalizedUrl: string;
  platform: Platform;
  contentType: ContentType;
  platformId?: string;
  status: ProcessingStatus;
  title?: string;
  author?: string;
  duration?: number;
  thumbnailUrl?: string;
  summary?: string;
  keyPoints: string[];
  tags: string[];
  resources: IResource[];
  rawEvidence?: IRawEvidence;
  failureReason?: string;
  capturedAt: string;
  analyzedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemsResponse {
  items: SavedItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CaptureItemResponse {
  message: string;
  item: SavedItem;
  isDuplicate: boolean;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  uptime: number;
  database: 'connected' | 'disconnected';
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagsResponse {
  tags: TagCount[];
  total: number;
}

export type SortByOption = 'capturedAt' | 'analyzedAt' | 'relevance';
export type SortOrderOption = 'asc' | 'desc';

export interface FetchItemsParams {
  q?: string;
  tag?: string;
  platform?: string;
  status?: string;
  contentType?: string;
  sortBy?: SortByOption;
  sortOrder?: SortOrderOption;
  page?: number;
  limit?: number;
}
