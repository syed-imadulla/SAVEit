import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  Item,
  ProcessingStatus,
  Platform,
  IResource,
  ResourceType,
  ResourceVerificationStatus,
} from '../models/Item';
import { validateAndParseVideoUrl } from '../utils/urlValidator';
import { defaultRetrievalService, RetrievalService } from '../services/retrieval';
import {
  defaultStructuringService,
  StructuringService,
  defaultLinkVerifier,
  LinkVerifier,
  ExtractedResource,
} from '../services/intelligence';
import {
  defaultMultimodalService,
  MultimodalService,
} from '../services/multimodal';

// Active service instances allowing dependency injection for integration testing
let activeRetrievalService: RetrievalService = defaultRetrievalService;
let activeStructuringService: StructuringService = defaultStructuringService;
let activeLinkVerifier: LinkVerifier = defaultLinkVerifier;
let activeMultimodalService: MultimodalService = defaultMultimodalService;

export function setRetrievalService(service: RetrievalService): void {
  activeRetrievalService = service;
}

export function resetRetrievalService(): void {
  activeRetrievalService = defaultRetrievalService;
}

export function setStructuringService(service: StructuringService): void {
  activeStructuringService = service;
}

export function setLinkVerifier(verifier: LinkVerifier): void {
  activeLinkVerifier = verifier;
}

export function setMultimodalService(service: MultimodalService): void {
  activeMultimodalService = service;
}

export function resetMultimodalService(): void {
  activeMultimodalService = defaultMultimodalService;
}

export function resetIntelligenceServices(): void {
  activeStructuringService = defaultStructuringService;
  activeLinkVerifier = defaultLinkVerifier;
  activeMultimodalService = defaultMultimodalService;
}

function mapExtractedResource(r: ExtractedResource): IResource {
  let verificationStatus = ResourceVerificationStatus.UNVERIFIED_MENTION;
  if (r.status === 'verified') verificationStatus = ResourceVerificationStatus.VERIFIED_LINK;
  else if (r.status === 'broken') verificationStatus = ResourceVerificationStatus.UNAVAILABLE;

  let resType = ResourceType.OTHER;
  if (r.type === 'github_repo') resType = ResourceType.GITHUB_REPO;
  else if (r.type === 'tool') resType = ResourceType.TOOL;
  else if (r.type === 'website') resType = ResourceType.WEBSITE;
  else if (r.type === 'documentation') resType = ResourceType.TUTORIAL;

  return {
    name: r.title,
    url: r.url,
    type: resType,
    verificationStatus,
    description: r.description,
  };
}

/**
 * POST /api/items
 * Validates, checks SSRF safety, persists the record, and triggers evidence retrieval.
 */
export async function createItem(req: Request, res: Response): Promise<void> {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({
      error: 'Please provide a valid "url" string in the request body.',
    });
    return;
  }

  const validation = validateAndParseVideoUrl(url);

  if (!validation.isValid) {
    res.status(400).json({
      error: validation.error,
    });
    return;
  }

  try {
    // Check if URL is already saved (deduplicated by normalized canonical URL)
    let item = await Item.findOne({ normalizedUrl: validation.normalizedUrl });

    if (item) {
      res.status(200).json({
        message: 'This video URL is already saved in your library.',
        item,
        isDuplicate: true,
      });
      return;
    }

    // Persist new record immediately with QUEUED status
    item = await Item.create({
      url: validation.originalUrl,
      normalizedUrl: validation.normalizedUrl,
      platform: validation.platform,
      contentType: validation.contentType,
      platformId: validation.platformId,
      status: ProcessingStatus.QUEUED,
      capturedAt: new Date(),
    });

    // Execute platform retrieval adapter to extract metadata and transcripts
    try {
      const report = await activeRetrievalService.retrieveEvidence(item.url, item.platform);

      // Populate extracted metadata
      if (report.metadata.title) item.title = report.metadata.title;
      if (report.metadata.author) item.author = report.metadata.author;
      if (report.metadata.thumbnailUrl) item.thumbnailUrl = report.metadata.thumbnailUrl;
      if (report.metadata.durationSeconds) item.duration = report.metadata.durationSeconds;

      // Populate transcript if available
      if (report.transcript?.text) {
        item.rawEvidence = {
          ...item.rawEvidence,
          transcript: report.transcript.text,
          transcriptSegments: report.transcript.segments,
        };
      }

      // Update honest status, failure diagnostics, and analysis timestamp
      item.status = report.status;
      if (report.rawEvidence.failureReason) {
        item.failureReason = report.rawEvidence.failureReason;
      }
      item.analyzedAt = report.retrievedAt;

      // Check for optional audio/video media supplied in request body
      const audioBuf = req.body?.audioBase64
        ? Buffer.from(req.body.audioBase64, 'base64')
        : (req.body?.audioBuffer instanceof Buffer ? req.body.audioBuffer : undefined);
      const mediaFilePath = typeof req.body?.mediaFilePath === 'string' ? req.body.mediaFilePath : undefined;

      // Execute multimodal pipeline (STT if native captions absent, keyframe OCR if mediaFilePath provided)
      if (audioBuf || mediaFilePath || item.rawEvidence?.transcript) {
        try {
          const mmResult = await activeMultimodalService.processMultimodal({
            url: item.url,
            platform: item.platform,
            existingTranscript: item.rawEvidence?.transcript,
            existingSegments: item.rawEvidence?.transcriptSegments,
            audioBuffer: audioBuf,
            mediaFilePath: mediaFilePath,
            title: item.title,
            author: item.author,
          });

          if (mmResult.transcriptText) {
            item.rawEvidence = {
              ...item.rawEvidence,
              transcript: mmResult.transcriptText,
              transcriptSegments: mmResult.transcriptSegments,
            };
          }
          if (mmResult.ocrText) {
            item.rawEvidence = {
              ...item.rawEvidence,
              ocrText: mmResult.ocrText,
              ocrObservations: mmResult.ocrObservations,
            };
          }
        } catch (mmErr: any) {
          console.warn('[ItemController] Multimodal processing failed non-fatally:', mmErr.message);
        }
      }

      // 3. Trigger text structuring and link verification if transcript or OCR text is present
      try {
        const textToAnalyze = item.rawEvidence?.transcript || '';
        const ocrToAnalyze = item.rawEvidence?.ocrText || '';
        const structResult = await activeStructuringService.structure({
          title: item.title,
          author: item.author,
          platform: item.platform,
          rawText: textToAnalyze,
          ocrText: ocrToAnalyze,
        });

        // Verify discovered links with SSRF protection
        const verifiedResources = await activeLinkVerifier.verifyResources(structResult.knowledge.resources);
        const mappedResources = verifiedResources.map(mapExtractedResource);

        // Grounding: Connect takeaways and resources to verifiable transcript & OCR evidence
        const groundingResult = activeMultimodalService.groundKnowledge({
          keyPoints: structResult.knowledge.keyPoints,
          resources: mappedResources,
          transcriptSegments: item.rawEvidence?.transcriptSegments,
          ocrObservations: item.rawEvidence?.ocrObservations,
          metadata: {
            title: item.title,
            author: item.author,
          },
        });

        if (structResult.knowledge.summary) item.summary = structResult.knowledge.summary;
        if (structResult.knowledge.keyPoints.length > 0) item.keyPoints = structResult.knowledge.keyPoints;
        if (structResult.knowledge.tags.length > 0) item.tags = structResult.knowledge.tags;
        item.resources = groundingResult.groundedResources;
        item.rawEvidence = {
          ...item.rawEvidence,
          evidenceAttributions: groundingResult.attributions,
        };
        item.structuredAt = new Date();

        // Promote to fully_analyzed if both metadata and content (transcript or OCR) were structured
        if (structResult.success && (item.rawEvidence?.transcript || item.rawEvidence?.ocrText)) {
          item.status = ProcessingStatus.FULLY_ANALYZED;
        } else if (!structResult.success && structResult.errorCode && structResult.errorCode !== 'INSUFFICIENT_TEXT') {
          item.failureReason = structResult.error || 'AI structuring failed';
          if (item.status === ProcessingStatus.QUEUED) {
            item.status = ProcessingStatus.PARTIALLY_ANALYZED;
          }
        }
      } catch (aiErr: any) {
        console.warn('[ItemController] Structuring step failed non-fatally:', aiErr.message);
      }

      await item.save();
    } catch (retrievalErr: any) {
      console.error('[ItemController] Retrieval step failed non-fatally:', retrievalErr);
      item.status = ProcessingStatus.RETRYABLE_FAILURE;
      item.failureReason = retrievalErr.message || 'Retrieval failed unexpectedly';
      await item.save();
    }

    res.status(201).json({
      message: 'Video captured and processed successfully.',
      item,
      isDuplicate: false,
    });
  } catch (err: any) {
    console.error('[ItemController] Error capturing item:', err);
    res.status(500).json({
      error: 'An internal error occurred while saving the item.',
      details: err.message,
    });
  }
}

/**
 * GET /api/items
 * Retrieves saved items with pagination and optional status/platform filtering.
 */
export async function getItems(req: Request, res: Response): Promise<void> {
  try {
    const { status, platform, page = '1', limit = '20' } = req.query;

    const query: Record<string, any> = {};

    if (status && typeof status === 'string' && Object.values(ProcessingStatus).includes(status as any)) {
      query.status = status;
    }

    if (platform && typeof platform === 'string' && Object.values(Platform).includes(platform as any)) {
      query.platform = platform;
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Item.find(query)
        .sort({ capturedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Item.countDocuments(query),
    ]);

    res.status(200).json({
      items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err: any) {
    console.error('[ItemController] Error fetching items:', err);
    res.status(500).json({
      error: 'Failed to retrieve saved items.',
      details: err.message,
    });
  }
}

/**
 * GET /api/items/:id
 * Retrieves a single saved item by its ID.
 */
export async function getItemById(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid item ID format.' });
    return;
  }

  try {
    const item = await Item.findById(id);

    if (!item) {
      res.status(404).json({ error: 'Saved item not found.' });
      return;
    }

    res.status(200).json({ item });
  } catch (err: any) {
    console.error('[ItemController] Error fetching item by ID:', err);
    res.status(500).json({
      error: 'Failed to retrieve item.',
      details: err.message,
    });
  }
}

/**
 * DELETE /api/items/:id
 * Removes a saved item from the library.
 */
export async function deleteItem(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid item ID format.' });
    return;
  }

  try {
    const deleted = await Item.findByIdAndDelete(id);

    if (!deleted) {
      res.status(404).json({ error: 'Saved item not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Item deleted successfully.',
    });
  } catch (err: any) {
    console.error('[ItemController] Error deleting item:', err);
    res.status(500).json({
      error: 'Failed to delete item.',
      details: err.message,
    });
  }
}

/**
 * POST /api/items/:id/analyze
 * Triggers or re-runs AI text structuring and SSRF-guarded link verification on a saved item.
 */
export async function analyzeItem(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid item ID format.' });
    return;
  }

  try {
    const item = await Item.findById(id);

    if (!item) {
      res.status(404).json({ error: 'Saved item not found.' });
      return;
    }

    // Check for optional audio/video media supplied in request body
    const audioBuf = req.body?.audioBase64
      ? Buffer.from(req.body.audioBase64, 'base64')
      : (req.body?.audioBuffer instanceof Buffer ? req.body.audioBuffer : undefined);
    const mediaFilePath = typeof req.body?.mediaFilePath === 'string' ? req.body.mediaFilePath : undefined;

    if (audioBuf || mediaFilePath) {
      try {
        const mmResult = await activeMultimodalService.processMultimodal({
          url: item.url,
          platform: item.platform,
          existingTranscript: item.rawEvidence?.transcript,
          existingSegments: item.rawEvidence?.transcriptSegments,
          audioBuffer: audioBuf,
          mediaFilePath: mediaFilePath,
          title: item.title,
          author: item.author,
        });

        if (mmResult.transcriptText) {
          item.rawEvidence = {
            ...item.rawEvidence,
            transcript: mmResult.transcriptText,
            transcriptSegments: mmResult.transcriptSegments,
          };
        }
        if (mmResult.ocrText) {
          item.rawEvidence = {
            ...item.rawEvidence,
            ocrText: mmResult.ocrText,
            ocrObservations: mmResult.ocrObservations,
          };
        }
      } catch (mmErr: any) {
        console.warn('[ItemController] Re-analysis multimodal processing failed non-fatally:', mmErr.message);
      }
    }

    const textToAnalyze = item.rawEvidence?.transcript || '';
    const ocrToAnalyze = item.rawEvidence?.ocrText || '';
    const structResult = await activeStructuringService.structure({
      title: item.title,
      author: item.author,
      platform: item.platform,
      rawText: textToAnalyze,
      ocrText: ocrToAnalyze,
    });

    // Verify candidate URLs with SSRF protection
    const verifiedResources = await activeLinkVerifier.verifyResources(structResult.knowledge.resources);
    const mappedResources = verifiedResources.map(mapExtractedResource);

    // Grounding: Connect takeaways and resources to verifiable transcript & OCR evidence
    const groundingResult = activeMultimodalService.groundKnowledge({
      keyPoints: structResult.knowledge.keyPoints,
      resources: mappedResources,
      transcriptSegments: item.rawEvidence?.transcriptSegments,
      ocrObservations: item.rawEvidence?.ocrObservations,
      metadata: {
        title: item.title,
        author: item.author,
      },
    });

    if (structResult.knowledge.summary) item.summary = structResult.knowledge.summary;
    item.keyPoints = structResult.knowledge.keyPoints;
    if (structResult.knowledge.tags.length > 0) item.tags = structResult.knowledge.tags;
    item.resources = groundingResult.groundedResources;
    item.rawEvidence = {
      ...item.rawEvidence,
      evidenceAttributions: groundingResult.attributions,
    };
    item.structuredAt = new Date();

    if (structResult.success && (item.rawEvidence?.transcript || item.rawEvidence?.ocrText)) {
      item.status = ProcessingStatus.FULLY_ANALYZED;
      item.failureReason = undefined;
    } else if (!structResult.success) {
      item.failureReason = structResult.error || 'AI analysis could not complete';
      if (structResult.errorCode === 'INSUFFICIENT_TEXT') {
        item.status = item.title ? ProcessingStatus.METADATA_ONLY : ProcessingStatus.UNSUPPORTED_INACCESSIBLE;
      } else {
        item.status = ProcessingStatus.PARTIALLY_ANALYZED;
      }
    }

    await item.save();

    res.status(200).json({
      message: 'Item analysis processed successfully.',
      item,
      structuringResult: structResult,
    });
  } catch (err: any) {
    console.error('[ItemController] Error analyzing item:', err);
    res.status(500).json({
      error: 'An internal error occurred while analyzing the item.',
      details: err.message,
    });
  }
}
