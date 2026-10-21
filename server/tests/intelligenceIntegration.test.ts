import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { connectToDatabase, disconnectFromDatabase } from '../src/config/db';
import { Item, ProcessingStatus, Platform, ContentType } from '../src/models/Item';
import {
  setRetrievalService,
  resetRetrievalService,
  setStructuringService,
  setLinkVerifier,
  resetIntelligenceServices,
} from '../src/controllers/itemController';
import { RetrievalService, AdapterRegistry, RetrievalAdapter, EvidenceReport } from '../src/services/retrieval';
import { StructuringService, LinkVerifier, MockLlmProvider, LlmProviderError } from '../src/services/intelligence';

const app = createApp();
const TEST_MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/saveit_test';

describe('Text-First Intelligence Pipeline & API Integration (Phase 3)', () => {
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      await connectToDatabase(TEST_MONGO_URI);
      isDbAvailable = true;
      await Item.deleteMany({});
    } catch {
      console.warn('[Test] Local MongoDB not reachable. Skipping live DB intelligence tests.');
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      await Item.deleteMany({});
      await disconnectFromDatabase();
    }
  });

  beforeEach(async () => {
    if (isDbAvailable) {
      await Item.deleteMany({});
    }
    resetRetrievalService();
    resetIntelligenceServices();
  });

  afterEach(() => {
    resetRetrievalService();
    resetIntelligenceServices();
  });

  it('1. POST /api/items extracts transcript, structures knowledge, and promotes item to fully_analyzed', async () => {
    if (!isDbAvailable) return;

    // Mock Retrieval Adapter returning caption evidence
    const mockAdapter: RetrievalAdapter = {
      platform: Platform.YOUTUBE,
      canHandle: () => true,
      retrieve: async (url: string): Promise<EvidenceReport> => ({
        url,
        platform: Platform.YOUTUBE,
        contentType: ContentType.SHORT,
        accessLevel: 'full',
        status: ProcessingStatus.PARTIALLY_ANALYZED,
        metadata: {
          title: 'Docker in 60 Seconds',
          author: 'DevTips',
          durationSeconds: 60,
        },
        transcript: {
          text: 'In this short we explain Docker containers, how to mount volumes, and connect to https://redis.io/docs for caching.',
          segments: [],
          source: 'timedtext',
        },
        rawEvidence: {
          retrievalLatencyMs: 45,
          captionsDetected: true,
        },
        retrievedAt: new Date(),
      }),
    };

    const registry = new AdapterRegistry();
    registry.register(mockAdapter);
    setRetrievalService(new RetrievalService(registry));

    // Mock Structuring Service with Mock LLM
    const mockLlm = new MockLlmProvider({
      customResponse: {
        summary: 'Learn how to package apps with Docker containers and connect external services.',
        keyPoints: [
          'Understand containerization basics',
          'Mount persistent volumes for data',
          'Integrate external caching services',
        ],
        tags: ['docker', 'containers', 'caching'],
        resources: [
          {
            title: 'Redis Documentation',
            url: 'https://redis.io/docs',
            type: 'documentation',
            status: 'unverified_mention',
            description: 'Caching documentation',
          },
        ],
      },
    });

    setStructuringService(new StructuringService(mockLlm));

    // Mock LinkVerifier verifying the link
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    setLinkVerifier(new LinkVerifier({ fetchFn: mockFetch }));

    const res = await request(app)
      .post('/api/items')
      .send({ url: 'https://www.youtube.com/shorts/507dwt_qF4k' });

    expect(res.status).toBe(201);
    expect(res.body.item.status).toBe(ProcessingStatus.FULLY_ANALYZED);
    expect(res.body.item.summary).toContain('Learn how to package apps with Docker');
    expect(res.body.item.keyPoints).toHaveLength(3);
    expect(res.body.item.tags).toContain('docker');
    expect(res.body.item.structuredAt).toBeDefined();

    // Check verified resources
    expect(res.body.item.resources.length).toBeGreaterThanOrEqual(1);
    const redisDoc = res.body.item.resources.find((r: any) => r.name === 'Redis Documentation');
    expect(redisDoc).toBeDefined();
    expect(redisDoc.verificationStatus).toBe('verified_link');
  });

  it('2. POST /api/items with metadata-only input degrades gracefully to metadata_only without fake takeaways', async () => {
    if (!isDbAvailable) return;

    const mockAdapter: RetrievalAdapter = {
      platform: Platform.YOUTUBE,
      canHandle: () => true,
      retrieve: async (url: string): Promise<EvidenceReport> => ({
        url,
        platform: Platform.YOUTUBE,
        contentType: ContentType.SHORT,
        accessLevel: 'metadata_only',
        status: ProcessingStatus.METADATA_ONLY,
        metadata: {
          title: 'Music Video Short',
          author: 'Artist',
        },
        rawEvidence: {
          retrievalLatencyMs: 30,
          captionsDetected: false,
        },
        retrievedAt: new Date(),
      }),
    };

    const registry = new AdapterRegistry();
    registry.register(mockAdapter);
    setRetrievalService(new RetrievalService(registry));

    const res = await request(app)
      .post('/api/items')
      .send({ url: 'https://www.youtube.com/shorts/test_nomedia_123' });

    expect(res.status).toBe(201);
    expect(res.body.item.status).toBe(ProcessingStatus.METADATA_ONLY);
    expect(res.body.item.keyPoints).toHaveLength(0);
    expect(res.body.item.summary).toContain('Transcript text is unavailable or insufficient');
  });

  it('3. POST /api/items preserves captured item with partially_analyzed if AI quota is exhausted', async () => {
    if (!isDbAvailable) return;

    const mockAdapter: RetrievalAdapter = {
      platform: Platform.YOUTUBE,
      canHandle: () => true,
      retrieve: async (url: string): Promise<EvidenceReport> => ({
        url,
        platform: Platform.YOUTUBE,
        contentType: ContentType.SHORT,
        accessLevel: 'full',
        status: ProcessingStatus.PARTIALLY_ANALYZED,
        metadata: {
          title: 'Advanced Rust Concurrency',
        },
        transcript: {
          text: 'Rust concurrency guarantees memory safety without garbage collection through ownership and borrow checking.',
          segments: [],
          source: 'timedtext',
        },
        rawEvidence: { retrievalLatencyMs: 40 },
        retrievedAt: new Date(),
      }),
    };

    const registry = new AdapterRegistry();
    registry.register(mockAdapter);
    setRetrievalService(new RetrievalService(registry));

    // Structuring fails with 429 quota exhaustion
    const mockLlm = new MockLlmProvider({
      shouldFail: true,
      failureError: 'Gemini free tier quota limit reached (HTTP 429).',
    });
    setStructuringService(new StructuringService(mockLlm));

    const res = await request(app)
      .post('/api/items')
      .send({ url: 'https://www.youtube.com/shorts/rust_concurrency_123' });

    expect(res.status).toBe(201);
    // Crucial: Item must not be dropped; must report pending/quota status honestly
    expect(res.body.item.status).toBe(ProcessingStatus.PARTIALLY_ANALYZED);
    expect(res.body.item.failureReason).toContain('quota limit reached');
  });

  it('4. POST /api/items/:id/analyze allows on-demand re-structuring of an existing item', async () => {
    if (!isDbAvailable) return;

    // Create an item with transcript that was previously unanalyzed
    const saved = await Item.create({
      url: 'https://www.youtube.com/shorts/analyze_test_123',
      normalizedUrl: 'https://www.youtube.com/shorts/analyze_test_123',
      platform: Platform.YOUTUBE,
      contentType: ContentType.SHORT,
      status: ProcessingStatus.PARTIALLY_ANALYZED,
      title: 'Kubernetes Pod Networking',
      rawEvidence: {
        transcript: 'Kubernetes pods communicate via a flat network where each pod has a unique IP address.',
      },
      capturedAt: new Date(),
    });

    const mockLlm = new MockLlmProvider({
      customResponse: {
        summary: 'Overview of Kubernetes pod networking and IP allocation.',
        keyPoints: ['Each pod receives a unique IP address', 'Flat network architecture simplifies routing'],
        tags: ['kubernetes', 'networking'],
        resources: [
          {
            title: 'Kubernetes Networking Docs',
            url: 'https://kubernetes.io/docs/concepts/cluster-administration/networking/',
            type: 'documentation',
            status: 'unverified_mention',
          },
        ],
      },
    });
    setStructuringService(new StructuringService(mockLlm));

    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    setLinkVerifier(new LinkVerifier({ fetchFn: mockFetch }));

    const res = await request(app)
      .post(`/api/items/${saved._id}/analyze`);

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe(ProcessingStatus.FULLY_ANALYZED);
    expect(res.body.item.summary).toContain('Overview of Kubernetes pod networking');
    expect(res.body.item.keyPoints).toHaveLength(2);
    expect(res.body.item.tags).toContain('kubernetes');
    expect(res.body.item.resources[0].verificationStatus).toBe('verified_link');
  });

  it('5. POST /api/items/:id/analyze returns 404 for non-existent item ID', async () => {
    if (!isDbAvailable) return;

    const fakeId = '507f1f77bcf86cd799439011';
    const res = await request(app).post(`/api/items/${fakeId}/analyze`);
    expect(res.status).toBe(404);
  });
});
