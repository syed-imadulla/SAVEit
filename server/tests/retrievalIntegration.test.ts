import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { connectToDatabase, disconnectFromDatabase } from '../src/config/db';
import { Item, ProcessingStatus, Platform, ContentType } from '../src/models/Item';
import {
  AdapterRegistry,
  RetrievalService,
  EvidenceReport,
  YouTubeAdapter,
  InstagramAdapter,
} from '../src/services/retrieval';
import {
  setRetrievalService,
  resetRetrievalService,
} from '../src/controllers/itemController';

const app = createApp();
const TEST_MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/saveit_test';

describe('Retrieval Adapter Registry & Integration Suite', () => {
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      await connectToDatabase(TEST_MONGO_URI);
      isDbAvailable = true;
      await Item.deleteMany({});
    } catch {
      console.warn('[Integration Test] Local MongoDB unavailable; skipping live DB tests.');
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      await Item.deleteMany({});
      await disconnectFromDatabase();
    }
  });

  afterEach(() => {
    resetRetrievalService();
  });

  describe('AdapterRegistry & RetrievalService Architecture', () => {
    it('initializes with default YouTube and Instagram adapters', () => {
      const registry = new AdapterRegistry();
      expect(registry.get(Platform.YOUTUBE)).toBeInstanceOf(YouTubeAdapter);
      expect(registry.get(Platform.INSTAGRAM)).toBeInstanceOf(InstagramAdapter);
      expect(registry.getAll()).toHaveLength(2);
    });

    it('correctly resolves adapter based on target URL format', () => {
      const registry = new AdapterRegistry();
      const ytAdapter = registry.findForUrl('https://www.youtube.com/shorts/q1qKv5TBaOA');
      const igAdapter = registry.findForUrl('https://www.instagram.com/reel/C8qLqL-A0B1/');
      const unknown = registry.findForUrl('https://example.com/video');

      expect(ytAdapter?.platform).toBe(Platform.YOUTUBE);
      expect(igAdapter?.platform).toBe(Platform.INSTAGRAM);
      expect(unknown).toBeUndefined();
    });

    it('RetrievalService catches unhandled adapter exceptions and returns safe RETRYABLE_FAILURE', async () => {
      const faultyAdapter = {
        platform: Platform.YOUTUBE,
        canHandle: () => true,
        retrieve: vi.fn().mockRejectedValue(new Error('Fatal unhandled crash in adapter engine')),
      };

      const registry = new AdapterRegistry();
      registry.register(faultyAdapter);

      const service = new RetrievalService(registry);
      const report = await service.retrieveEvidence('https://youtube.com/shorts/q1qKv5TBaOA');

      expect(report.accessLevel).toBe('inaccessible');
      expect(report.status).toBe(ProcessingStatus.RETRYABLE_FAILURE);
      expect(report.rawEvidence.failureReason).toBe('UNHANDLED_ADAPTER_ERROR');
      expect(report.rawEvidence.notes).toContain('Fatal unhandled crash in adapter engine');
    });
  });

  describe('End-to-End POST /api/items Retrieval Pipeline', () => {
    beforeEach(async () => {
      if (isDbAvailable) {
        await Item.deleteMany({});
      }
    });

    it('1. Successfully captures YouTube Short and enriches record with metadata and transcript', async () => {
      if (!isDbAvailable) return;

      const mockReport: EvidenceReport = {
        originalUrl: 'https://www.youtube.com/shorts/q1qKv5TBaOA?feature=share',
        normalizedUrl: 'https://www.youtube.com/shorts/q1qKv5TBaOA',
        platform: Platform.YOUTUBE,
        contentType: ContentType.SHORT,
        platformId: 'q1qKv5TBaOA',
        accessLevel: 'full',
        status: ProcessingStatus.PARTIALLY_ANALYZED,
        metadata: {
          title: 'Principled Software Engineering',
          author: 'Coderized',
          thumbnailUrl: 'https://i.ytimg.com/vi/q1qKv5TBaOA/hqdefault.jpg',
          durationSeconds: 58,
        },
        transcript: {
          text: 'Principled coders design software with clear interfaces and modular boundaries.',
          segments: [
            {
              start: 0.0,
              duration: 3.5,
              text: 'Principled coders design software with clear interfaces and modular boundaries.',
            },
          ],
          source: 'timedtext',
        },
        rawEvidence: {
          metadataAccessible: true,
          captionsDetected: true,
          rawStreamAccessible: true,
        },
        retrievedAt: new Date(),
      };

      const mockService = {
        retrieveEvidence: vi.fn().mockResolvedValue(mockReport),
      } as unknown as RetrievalService;

      setRetrievalService(mockService);

      const res = await request(app)
        .post('/api/items')
        .send({ url: 'https://www.youtube.com/shorts/q1qKv5TBaOA?feature=share' });

      expect(res.status).toBe(201);
      expect(res.body.isDuplicate).toBe(false);
      expect(res.body.item.title).toBe('Principled Software Engineering');
      expect(res.body.item.author).toBe('Coderized');
      expect(res.body.item.thumbnailUrl).toBe('https://i.ytimg.com/vi/q1qKv5TBaOA/hqdefault.jpg');
      expect(res.body.item.status).toBe(ProcessingStatus.PARTIALLY_ANALYZED);
      expect(res.body.item.rawEvidence.transcript).toContain('Principled coders');

      // Verify database state matches
      const saved = await Item.findById(res.body.item._id);
      expect(saved?.title).toBe('Principled Software Engineering');
      expect(saved?.status).toBe(ProcessingStatus.PARTIALLY_ANALYZED);
    });

    it('2. Captures Instagram Reel restricted by login wall and marks UNSUPPORTED_INACCESSIBLE without losing item', async () => {
      if (!isDbAvailable) return;

      const mockReport: EvidenceReport = {
        originalUrl: 'https://www.instagram.com/reel/C8qLqL-A0B1/',
        normalizedUrl: 'https://www.instagram.com/reel/C8qLqL-A0B1/',
        platform: Platform.INSTAGRAM,
        contentType: ContentType.REEL,
        platformId: 'C8qLqL-A0B1',
        accessLevel: 'inaccessible',
        status: ProcessingStatus.UNSUPPORTED_INACCESSIBLE,
        metadata: {},
        rawEvidence: {
          metadataAccessible: false,
          captionsDetected: false,
          rawStreamAccessible: false,
          failureReason: 'INSTAGRAM_LOGIN_WALL_ENCOUNTERED',
          notes: 'Instagram redirected automated request to /accounts/login/.',
        },
        retrievedAt: new Date(),
      };

      const mockService = {
        retrieveEvidence: vi.fn().mockResolvedValue(mockReport),
      } as unknown as RetrievalService;

      setRetrievalService(mockService);

      const res = await request(app)
        .post('/api/items')
        .send({ url: 'https://www.instagram.com/reel/C8qLqL-A0B1/' });

      expect(res.status).toBe(201);
      expect(res.body.item.platform).toBe(Platform.INSTAGRAM);
      expect(res.body.item.status).toBe(ProcessingStatus.UNSUPPORTED_INACCESSIBLE);
      expect(res.body.item.failureReason).toBe('INSTAGRAM_LOGIN_WALL_ENCOUNTERED');
      expect(res.body.item.url).toBe('https://www.instagram.com/reel/C8qLqL-A0B1/');

      // Item remains persisted in database
      const saved = await Item.findById(res.body.item._id);
      expect(saved).not.toBeNull();
      expect(saved?.status).toBe(ProcessingStatus.UNSUPPORTED_INACCESSIBLE);
    });

    it('3. Recognizes duplicate submissions and avoids re-executing retrieval', async () => {
      if (!isDbAvailable) return;

      const mockRetrieve = vi.fn().mockResolvedValue({
        originalUrl: 'https://www.youtube.com/shorts/q1qKv5TBaOA',
        normalizedUrl: 'https://www.youtube.com/shorts/q1qKv5TBaOA',
        platform: Platform.YOUTUBE,
        contentType: ContentType.SHORT,
        accessLevel: 'metadata_only',
        status: ProcessingStatus.METADATA_ONLY,
        metadata: { title: 'First Submission' },
        rawEvidence: { metadataAccessible: true, captionsDetected: false, rawStreamAccessible: false },
        retrievedAt: new Date(),
      });

      setRetrievalService({ retrieveEvidence: mockRetrieve } as unknown as RetrievalService);

      // First submission
      const res1 = await request(app)
        .post('/api/items')
        .send({ url: 'https://www.youtube.com/shorts/q1qKv5TBaOA?utm_source=feed' });
      expect(res1.status).toBe(201);
      expect(mockRetrieve).toHaveBeenCalledTimes(1);

      // Duplicate submission with different tracking query params
      const res2 = await request(app)
        .post('/api/items')
        .send({ url: 'https://www.youtube.com/shorts/q1qKv5TBaOA?feature=share' });
      expect(res2.status).toBe(200);
      expect(res2.body.isDuplicate).toBe(true);
      expect(res2.body.item._id).toBe(res1.body.item._id);

      // Verify retrieval service was not called again
      expect(mockRetrieve).toHaveBeenCalledTimes(1);
    });

    it('4. Preserves saved item with RETRYABLE_FAILURE if retrieval encounters unhandled network crash', async () => {
      if (!isDbAvailable) return;

      const crashingService = {
        retrieveEvidence: vi.fn().mockRejectedValue(new Error('Connection reset by peer')),
      } as unknown as RetrievalService;

      setRetrievalService(crashingService);

      const res = await request(app)
        .post('/api/items')
        .send({ url: 'https://www.youtube.com/shorts/q1qKv5TBaOA' });

      // Item is still created and not lost
      expect(res.status).toBe(201);
      expect(res.body.item.status).toBe(ProcessingStatus.RETRYABLE_FAILURE);
      expect(res.body.item.failureReason).toContain('Connection reset by peer');

      const saved = await Item.findById(res.body.item._id);
      expect(saved).not.toBeNull();
      expect(saved?.status).toBe(ProcessingStatus.RETRYABLE_FAILURE);
    });

    it('5. Rejects SSRF target with 400 and never creates a MongoDB record', async () => {
      if (!isDbAvailable) return;

      const res = await request(app)
        .post('/api/items')
        .send({ url: 'http://127.0.0.1:27017/shorts/exploit' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('security');

      const count = await Item.countDocuments({});
      expect(count).toBe(0);
    });
  });
});
