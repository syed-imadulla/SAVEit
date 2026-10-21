import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app';
import { Item, ProcessingStatus, Platform, ContentType } from '../src/models/Item';

const app = createApp();
import {
  setRetrievalService,
  resetRetrievalService,
  setStructuringService,
  resetIntelligenceServices,
  setMultimodalService,
  resetMultimodalService,
} from '../src/controllers/itemController';
import { RetrievalService, AdapterRegistry, EvidenceReport } from '../src/services/retrieval';
import { StructuringService, MockLlmProvider } from '../src/services/intelligence';
import {
  MultimodalService,
  MockSttProvider,
  MockOcrProvider,
  KeyframeSampler,
} from '../src/services/multimodal';

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/saveit_test';

/**
 * Helper to generate a short synthetic MP4 video file using host FFmpeg.
 */
async function createSyntheticVideo(durationSeconds = 2): Promise<string> {
  const filePath = path.join(os.tmpdir(), `saveit-mm-test-${randomUUID()}.mp4`);
  await new Promise<void>((resolve, reject) => {
    execFile(
      'ffmpeg',
      [
        '-y',
        '-f', 'lavfi',
        '-i', `color=c=navy:s=320x240:d=${durationSeconds}:r=5`,
        '-vf', 'drawtext=text=\'SAVEIT DEMO\':x=10:y=10:fontsize=24:fontcolor=white',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        filePath,
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
  return filePath;
}

describe('Multimodal Analysis Pipeline & Evidence Attribution (Plan 04-03)', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }
  });

  afterAll(async () => {
    await Item.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Item.deleteMany({});
    resetRetrievalService();
    resetIntelligenceServices();
    resetMultimodalService();
  });

  it('1. Native captions take precedence over STT when available', async () => {
    let sttCalled = false;
    const mockStt = new MockSttProvider({
      customResult: {
        text: 'Spoken transcription from STT',
        segments: [{ start: 0, duration: 2, text: 'Spoken transcription from STT' }],
        providerName: 'mock-stt',
      },
    });
    // Wrap to detect calls
    const originalTranscribe = mockStt.transcribe.bind(mockStt);
    mockStt.transcribe = async (buf, opts) => {
      sttCalled = true;
      return originalTranscribe(buf, opts);
    };

    const mockMultimodal = new MultimodalService({ sttProvider: mockStt });
    setMultimodalService(mockMultimodal);

    // Mock retrieval adapter returning native captions
    const mockRegistry = new AdapterRegistry();
    const mockAdapter = {
      platform: Platform.YOUTUBE,
      canHandle: () => true,
      retrieve: async (url: string): Promise<EvidenceReport> => ({
        originalUrl: url,
        normalizedUrl: url,
        platform: Platform.YOUTUBE,
        contentType: ContentType.SHORT,
        accessLevel: 'full',
        status: ProcessingStatus.FULLY_ANALYZED,
        metadata: { title: 'Docker Containers Explained', author: 'DevOpsPro' },
        transcript: {
          text: 'Docker simplifies application deployment using isolated containers.',
          segments: [
            { start: 1.5, duration: 4.0, text: 'Docker simplifies application deployment using isolated containers.' },
          ],
          source: 'timedtext',
        },
        rawEvidence: {
          metadataAccessible: true,
          captionsDetected: true,
          rawStreamAccessible: false,
        },
        retrievedAt: new Date(),
      }),
    };
    mockRegistry.register(mockAdapter);
    setRetrievalService(new RetrievalService(mockRegistry));

    // Submit item with dummy audioBase64
    const res = await request(app)
      .post('/api/items')
      .send({
        url: 'https://www.youtube.com/shorts/prec1234567',
        audioBase64: Buffer.from('dummy-audio-bytes').toString('base64'),
      });

    expect(res.status).toBe(201);
    expect(res.body.item.status).toBe(ProcessingStatus.FULLY_ANALYZED);
    expect(res.body.item.rawEvidence.transcript).toBe(
      'Docker simplifies application deployment using isolated containers.'
    );
    // STT should NOT have been invoked because native captions were already present!
    expect(sttCalled).toBe(false);
  });

  it('2. Invokes STT when native captions are absent and audio bytes are provided (MM-01)', async () => {
    const mockStt = new MockSttProvider({
      customResponse: {
        text: 'FastAPI provides automatic OpenAPI documentation and fast request processing.',
        segments: [
          { start: 2.0, duration: 3.5, text: 'FastAPI provides automatic OpenAPI documentation' },
          { start: 5.5, duration: 2.5, text: 'and fast request processing.' },
        ],
        providerName: 'mock-stt',
      },
    });

    const mockMultimodal = new MultimodalService({ sttProvider: mockStt });
    setMultimodalService(mockMultimodal);

    // Mock retrieval adapter with metadata only (no native captions)
    const mockRegistry = new AdapterRegistry();
    const mockAdapter = {
      platform: Platform.YOUTUBE,
      canHandle: () => true,
      retrieve: async (url: string): Promise<EvidenceReport> => ({
        originalUrl: url,
        normalizedUrl: url,
        platform: Platform.YOUTUBE,
        contentType: ContentType.SHORT,
        accessLevel: 'metadata_only',
        status: ProcessingStatus.METADATA_ONLY,
        metadata: { title: 'Modern Python APIs', author: 'PyDev' },
        rawEvidence: {
          metadataAccessible: true,
          captionsDetected: false,
          rawStreamAccessible: false,
        },
        retrievedAt: new Date(),
      }),
    };
    mockRegistry.register(mockAdapter);
    setRetrievalService(new RetrievalService(mockRegistry));

    const res = await request(app)
      .post('/api/items')
      .send({
        url: 'https://www.youtube.com/shorts/stt12345678',
        audioBase64: Buffer.from('real-audio-stream-bytes').toString('base64'),
      });

    expect(res.status).toBe(201);
    expect(res.body.item.rawEvidence.transcript).toContain('FastAPI provides automatic OpenAPI documentation');
    expect(res.body.item.rawEvidence.transcriptSegments).toHaveLength(2);
    expect(res.body.item.rawEvidence.transcriptSegments[0].start).toBe(2.0);
    expect(res.body.item.status).toBe(ProcessingStatus.FULLY_ANALYZED);
  });

  it('3. Samples keyframes and extracts OCR code, terminal commands, and URLs (MM-02, MM-03)', async () => {
    const videoPath = await createSyntheticVideo(3);

    try {
      const mockOcr = new MockOcrProvider({
        defaultText: '$ docker run -p 8080:8080 my-fastapi-app\nhttps://github.com/tiangolo/fastapi',
        defaultConfidence: 90,
      });

      const mockMultimodal = new MultimodalService({
        keyframeSampler: new KeyframeSampler(),
        ocrProvider: mockOcr,
      });
      setMultimodalService(mockMultimodal);

      // Retrieval returns metadata only
      const mockRegistry = new AdapterRegistry();
      const mockAdapter = {
        platform: Platform.YOUTUBE,
        canHandle: () => true,
        retrieve: async (url: string): Promise<EvidenceReport> => ({
          originalUrl: url,
          normalizedUrl: url,
          platform: Platform.YOUTUBE,
          contentType: ContentType.SHORT,
          accessLevel: 'metadata_only',
          status: ProcessingStatus.METADATA_ONLY,
          metadata: { title: 'Containerizing FastAPI', author: 'CloudMaster' },
          rawEvidence: {
            metadataAccessible: true,
            captionsDetected: false,
            rawStreamAccessible: false,
          },
          retrievedAt: new Date(),
        }),
      };
      mockRegistry.register(mockAdapter);
      setRetrievalService(new RetrievalService(mockRegistry));

      const res = await request(app)
        .post('/api/items')
        .send({
          url: 'https://www.youtube.com/shorts/ocr12345678',
          mediaFilePath: videoPath,
        });

      expect(res.status).toBe(201);
      expect(res.body.item.rawEvidence.ocrText).toContain('docker run');
      expect(res.body.item.rawEvidence.ocrObservations.length).toBeGreaterThan(0);

      const firstObs = res.body.item.rawEvidence.ocrObservations[0];
      expect(firstObs.timestampMs).toBeGreaterThanOrEqual(0);
      expect(firstObs.terminalCommands).toContain('docker run -p 8080:8080 my-fastapi-app');
      expect(firstObs.urls).toContain('https://github.com/tiangolo/fastapi');
    } finally {
      try {
        fs.unlinkSync(videoPath);
      } catch {}
    }
  });

  it('4. Grounds takeaways and resources to exact transcript and OCR timestamps (MM-04)', async () => {
    const videoPath = await createSyntheticVideo(2);

    try {
      const mockOcr = new MockOcrProvider({
        defaultText: '$ docker compose up -d\nhttps://github.com/docker/compose',
        defaultConfidence: 95,
      });

      const mockStt = new MockSttProvider({
        customResponse: {
          text: 'Docker compose simplifies local development by managing multi-container services.',
          segments: [
            {
              start: 4.5,
              duration: 3.5,
              text: 'Docker compose simplifies local development by managing multi-container services.',
            },
          ],
          providerName: 'mock-stt',
        },
      });

      const mockLlm = new MockLlmProvider({
        customResponse: {
          summary: 'Overview of running local microservices with Docker Compose.',
          keyPoints: [
            'Docker compose simplifies local development by managing multi-container services.',
            'Execute docker compose up to start application infrastructure in the background.',
            'Unrelated concept not mentioned in video frames or audio.',
          ],
          tags: ['docker', 'devops'],
          resources: [
            {
              title: 'Docker',
              url: 'https://github.com/docker/compose',
              type: 'tool',
              status: 'unverified_mention',
              description: 'Multi-container orchestration tool',
            },
          ],
        },
      });

      setStructuringService(new StructuringService(mockLlm));
      setMultimodalService(
        new MultimodalService({
          sttProvider: mockStt,
          ocrProvider: mockOcr,
          keyframeSampler: new KeyframeSampler(),
        })
      );

      const mockRegistry = new AdapterRegistry();
      mockRegistry.register({
        platform: Platform.YOUTUBE,
        canHandle: () => true,
        retrieve: async (url: string): Promise<EvidenceReport> => ({
          originalUrl: url,
          normalizedUrl: url,
          platform: Platform.YOUTUBE,
          contentType: ContentType.SHORT,
          accessLevel: 'metadata_only',
          status: ProcessingStatus.METADATA_ONLY,
          metadata: { title: 'Docker Compose Guide' },
          rawEvidence: {
            metadataAccessible: true,
            captionsDetected: false,
            rawStreamAccessible: false,
          },
          retrievedAt: new Date(),
        }),
      });
      setRetrievalService(new RetrievalService(mockRegistry));

      const res = await request(app)
        .post('/api/items')
        .send({
          url: 'https://www.youtube.com/shorts/ground12345',
          audioBase64: Buffer.from('audio-data').toString('base64'),
          mediaFilePath: videoPath,
        });

      expect(res.status).toBe(201);
      const attributions = res.body.item.rawEvidence.evidenceAttributions;
      expect(attributions).toBeDefined();

      // KeyPoint 0 was spoken in transcript at 4.5s
      const transcriptAttribution = attributions.find(
        (a: any) => a.targetType === 'keyPoint' && a.sourceType === 'transcript'
      );
      expect(transcriptAttribution).toBeDefined();
      expect(transcriptAttribution.timestampSeconds).toBe(4.5);
      expect(transcriptAttribution.excerpt).toContain('Docker compose simplifies local development');

      // KeyPoint 1 was shown on screen in OCR terminal command
      const ocrAttribution = attributions.find(
        (a: any) => a.targetType === 'keyPoint' && a.sourceType === 'ocr'
      );
      expect(ocrAttribution).toBeDefined();
      expect(ocrAttribution.timestampMs).toBeGreaterThanOrEqual(0);
      expect(ocrAttribution.excerpt).toContain('docker compose up');

      // Point 2 was unrelated -> no hallucinated attribution should exist for it
      const ungroundedAttribution = attributions.find(
        (a: any) => a.targetType === 'keyPoint' && a.targetIndex === 2
      );
      expect(ungroundedAttribution).toBeUndefined();

      // Resource "Docker" should have evidence attached
      const dockerResource = res.body.item.resources.find((r: any) => r.name === 'Docker');
      expect(dockerResource).toBeDefined();
      expect(dockerResource.evidence).toBeDefined();
      expect(dockerResource.evidence.sourceType).toBe('ocr');
      expect(dockerResource.evidence.excerpt).toBe('https://github.com/docker/compose');
    } finally {
      try {
        fs.unlinkSync(videoPath);
      } catch {}
    }
  });

  it('5. Degrades honestly to partially_analyzed when media file is corrupt or OCR fails', async () => {
    // Create an invalid text file with a .mp4 extension
    const invalidVideo = path.join(os.tmpdir(), `corrupt-${randomUUID()}.mp4`);
    fs.writeFileSync(invalidVideo, 'not-a-valid-mp4-video-file-at-all');

    try {
      const mockRegistry = new AdapterRegistry();
      mockRegistry.register({
        platform: Platform.YOUTUBE,
        canHandle: () => true,
        retrieve: async (url: string): Promise<EvidenceReport> => ({
          originalUrl: url,
          normalizedUrl: url,
          platform: Platform.YOUTUBE,
          contentType: ContentType.SHORT,
          accessLevel: 'metadata_only',
          status: ProcessingStatus.METADATA_ONLY,
          metadata: { title: 'Corrupt Video Demo' },
          rawEvidence: {
            metadataAccessible: true,
            captionsDetected: false,
            rawStreamAccessible: false,
          },
          retrievedAt: new Date(),
        }),
      });
      setRetrievalService(new RetrievalService(mockRegistry));

      const res = await request(app)
        .post('/api/items')
        .send({
          url: 'https://www.youtube.com/shorts/corrupt1234',
          mediaFilePath: invalidVideo,
        });

      expect(res.status).toBe(201);
      // Because media was supplied but extraction failed, status honestly reflects partial analysis / metadata
      expect([ProcessingStatus.PARTIALLY_ANALYZED, ProcessingStatus.METADATA_ONLY]).toContain(
        res.body.item.status
      );
      // Item was safely persisted without crashing
      expect(res.body.item.title).toBe('Corrupt Video Demo');
    } finally {
      try {
        fs.unlinkSync(invalidVideo);
      } catch {}
    }
  });

  it('6. Re-analysis via POST /api/items/:id/analyze preserves previous evidence without duplicates', async () => {
    // Create existing item in MongoDB with saved transcript
    const existing = await Item.create({
      url: 'https://www.youtube.com/shorts/reanalyze1',
      normalizedUrl: 'https://www.youtube.com/shorts/reanalyze1',
      platform: Platform.YOUTUBE,
      contentType: ContentType.SHORT,
      status: ProcessingStatus.PARTIALLY_ANALYZED,
      title: 'Python Generators',
      rawEvidence: {
        transcript: 'Generators yield values one at a time using the yield keyword.',
        transcriptSegments: [
          { start: 1.0, duration: 3.0, text: 'Generators yield values one at a time using the yield keyword.' },
        ],
      },
    });

    const mockLlm = new MockLlmProvider({
      customResponse: {
        summary: 'Overview of Python generator expressions and yield mechanics.',
        keyPoints: ['Generators yield values one at a time using the yield keyword.'],
        tags: ['python'],
        resources: [],
      },
    });
    setStructuringService(new StructuringService(mockLlm));

    const res = await request(app)
      .post(`/api/items/${existing._id}/analyze`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe(ProcessingStatus.FULLY_ANALYZED);
    expect(res.body.item.summary).toContain('Python generator');
    // Ensure previous transcript was preserved without data loss
    expect(res.body.item.rawEvidence.transcript).toBe(
      'Generators yield values one at a time using the yield keyword.'
    );
    expect(res.body.item.rawEvidence.evidenceAttributions.length).toBeGreaterThanOrEqual(1);
    const kpAttr = res.body.item.rawEvidence.evidenceAttributions.find(
      (a: any) => a.targetType === 'keyPoint'
    );
    expect(kpAttr).toBeDefined();
    expect(kpAttr.sourceType).toBe('transcript');
  });

  it('7. SSRF defense: rejects remote URLs supplied in mediaFilePath without executing FFmpeg', async () => {
    const res = await request(app)
      .post('/api/items')
      .send({
        url: 'https://www.youtube.com/shorts/ssrfcheck123',
        mediaFilePath: 'http://169.254.169.254/latest/meta-data',
      });

    expect(res.status).toBe(201);
    // Remote media file is safely dropped by KeyframeSampler; item remains safely persisted as metadata only
    expect(res.body.item.rawEvidence?.ocrObservations || []).toHaveLength(0);
  });
});
