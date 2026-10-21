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

export interface IResource {
  name: string;
  url?: string;
  type: ResourceType;
  verificationStatus: ResourceVerificationStatus;
}

export interface IRawEvidence {
  transcript?: string;
  captions?: string;
  ocrText?: string;
  notes?: string;
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
