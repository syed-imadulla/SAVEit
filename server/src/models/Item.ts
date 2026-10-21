import mongoose, { Document, Schema } from 'mongoose';

/**
 * The 7 honest processing states of SAVEit.
 *
 * It is critical that we never claim a video was fully analyzed when only
 * metadata was accessible, nor discard an item if processing failed.
 */
export enum ProcessingStatus {
  QUEUED = 'queued',
  FULL_ANALYZED = 'full_analyzed',
  FULLY_ANALYZED = 'full_analyzed',
  PARTIALLY_ANALYZED = 'partially_analyzed',
  METADATA_ONLY = 'metadata_only',
  NEEDS_USER_INPUT = 'needs_user_input',
  RETRYABLE_FAILURE = 'retryable_failure',
  UNSUPPORTED_INACCESSIBLE = 'unsupported_inaccessible',
}

export enum Platform {
  INSTAGRAM = 'instagram',
  YOUTUBE = 'youtube',
}

export enum ContentType {
  REEL = 'reel',
  SHORT = 'short',
  UNKNOWN = 'unknown',
}

export enum ResourceType {
  TOOL = 'tool',
  WEBSITE = 'website',
  GITHUB_REPO = 'github_repo',
  TUTORIAL = 'tutorial',
  API = 'api',
  LIBRARY = 'library',
  PRODUCT = 'product',
  OTHER = 'other',
}

export enum ResourceVerificationStatus {
  VERIFIED_LINK = 'verified_link',
  UNVERIFIED_MENTION = 'unverified_mention',
  UNAVAILABLE = 'unavailable',
  NEEDS_REVIEW = 'needs_review',
}

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

export interface IResource {
  name: string;
  url?: string;
  type: ResourceType;
  verificationStatus: ResourceVerificationStatus;
  description?: string;
  evidence?: IEvidenceReference;
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

export interface IItem extends Document {
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
  capturedAt: Date;
  analyzedAt?: Date;
  structuredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EvidenceReferenceSchema = new Schema<IEvidenceReference>(
  {
    targetType: {
      type: String,
      enum: ['keyPoint', 'resource'],
      required: true,
    },
    targetIndex: { type: Number, required: true },
    targetText: { type: String },
    sourceType: {
      type: String,
      enum: ['transcript', 'ocr', 'metadata'],
      required: true,
    },
    timestampMs: { type: Number },
    timestampSeconds: { type: Number },
    excerpt: { type: String, required: true },
    frameIndex: { type: Number },
  },
  { _id: false }
);

const TranscriptSegmentSchema = new Schema<ITranscriptSegment>(
  {
    start: { type: Number, required: true },
    duration: { type: Number, required: true },
    text: { type: String, required: true },
  },
  { _id: false }
);

const ResourceSchema = new Schema<IResource>(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, trim: true },
    type: {
      type: String,
      enum: Object.values(ResourceType),
      default: ResourceType.OTHER,
    },
    verificationStatus: {
      type: String,
      enum: Object.values(ResourceVerificationStatus),
      default: ResourceVerificationStatus.UNVERIFIED_MENTION,
    },
    description: { type: String, trim: true },
    evidence: { type: EvidenceReferenceSchema },
  },
  { _id: false }
);

const OcrObservationSchema = new Schema<IOcrObservation>(
  {
    frameIndex: { type: Number, required: true },
    timestampMs: { type: Number, required: true },
    rawText: { type: String, required: true },
    codeSnippets: [{ type: String }],
    terminalCommands: [{ type: String }],
    urls: [{ type: String }],
    toolMentions: [{ type: String }],
    confidenceScore: { type: Number },
  },
  { _id: false }
);

const RawEvidenceSchema = new Schema<IRawEvidence>(
  {
    transcript: { type: String },
    transcriptSegments: [TranscriptSegmentSchema],
    captions: { type: String },
    ocrText: { type: String },
    ocrObservations: [OcrObservationSchema],
    evidenceAttributions: [EvidenceReferenceSchema],
    notes: { type: String },
    failureReason: { type: String },
  },
  { _id: false }
);

const ItemSchema = new Schema<IItem>(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedUrl: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    platform: {
      type: String,
      enum: Object.values(Platform),
      required: true,
      index: true,
    },
    contentType: {
      type: String,
      enum: Object.values(ContentType),
      default: ContentType.UNKNOWN,
    },
    platformId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(ProcessingStatus),
      default: ProcessingStatus.QUEUED,
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
    },
    author: {
      type: String,
      trim: true,
    },
    duration: {
      type: Number,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
    },
    summary: {
      type: String,
    },
    keyPoints: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    resources: {
      type: [ResourceSchema],
      default: [],
    },
    rawEvidence: {
      type: RawEvidenceSchema,
    },
    failureReason: {
      type: String,
    },
    capturedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    analyzedAt: {
      type: Date,
    },
    structuredAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient user library feed queries sorted by capture date
ItemSchema.index({ status: 1, capturedAt: -1 });

export const Item = mongoose.model<IItem>('Item', ItemSchema);
