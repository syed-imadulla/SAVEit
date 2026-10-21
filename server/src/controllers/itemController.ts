import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Item, ProcessingStatus, Platform } from '../models/Item';
import { validateAndParseVideoUrl } from '../utils/urlValidator';
import { defaultRetrievalService, RetrievalService } from '../services/retrieval';

// Active service instance allowing dependency injection for integration testing
let activeRetrievalService: RetrievalService = defaultRetrievalService;

export function setRetrievalService(service: RetrievalService): void {
  activeRetrievalService = service;
}

export function resetRetrievalService(): void {
  activeRetrievalService = defaultRetrievalService;
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
        };
      }

      // Update honest status, failure diagnostics, and analysis timestamp
      item.status = report.status;
      if (report.rawEvidence.failureReason) {
        item.failureReason = report.rawEvidence.failureReason;
      }
      item.analyzedAt = report.retrievedAt;

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
