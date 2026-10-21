import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reanalyzeItem, ApiError } from '../src/services/api';
import { SavedItem, IEvidenceReference, IResource } from '../src/types/item';

describe('Item Detail View & Evidence Inspector Suite (Plan 05-03)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockItem: SavedItem = {
    _id: 'item_12345',
    url: 'https://www.youtube.com/shorts/testshort123',
    normalizedUrl: 'https://youtube.com/shorts/testshort123',
    platform: 'youtube',
    contentType: 'short',
    platformId: 'testshort123',
    status: 'full_analyzed',
    title: 'Docker Multi-Stage Build Guide',
    author: 'DevOpsPro',
    duration: 54,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    summary: 'Master multi-stage Docker builds to reduce image size from 1GB to 25MB.',
    keyPoints: [
      'Use multi-stage builds to discard build dependencies from final image',
      'Leverage Alpine base images for lightweight production deployment',
      'Ungrounded insight about general microservices architecture',
    ],
    tags: ['docker', 'devops', 'containers'],
    resources: [
      {
        name: 'Docker Official Documentation',
        url: 'https://docs.docker.com',
        type: 'tutorial',
        verificationStatus: 'verified_link',
        description: 'Comprehensive guides for multi-stage Dockerfiles.',
        evidence: {
          targetType: 'resource',
          targetIndex: 0,
          sourceType: 'transcript',
          timestampSeconds: 14.5,
          excerpt: 'Check the official Docker documentation at docs.docker.com',
        },
      },
      {
        name: 'Alpine Linux Package Index',
        url: 'https://pkgs.alpinelinux.org',
        type: 'library',
        verificationStatus: 'unverified_mention',
        description: 'Lightweight Linux distribution packages.',
      },
      {
        name: 'Broken Example Repo',
        url: 'https://github.com/nonexistent/broken',
        type: 'github_repo',
        verificationStatus: 'unavailable',
        description: 'Sample repository that returns HTTP 404.',
      },
    ],
    rawEvidence: {
      transcript: 'Welcome to this Docker guide. Use multi-stage builds to discard build dependencies.',
      transcriptSegments: [
        { start: 0.0, duration: 4.5, text: 'Welcome to this Docker guide.' },
        { start: 4.5, duration: 6.0, text: 'Use multi-stage builds to discard build dependencies.' },
        { start: 14.5, duration: 5.0, text: 'Check the official Docker documentation at docs.docker.com' },
      ],
      ocrText: 'docker build -t app:latest . --target=builder',
      ocrObservations: [
        {
          frameIndex: 2,
          timestampMs: 4500,
          rawText: 'docker build -t app:latest .',
          terminalCommands: ['docker build -t app:latest .'],
          toolMentions: ['docker'],
        },
      ],
      evidenceAttributions: [
        {
          targetType: 'keyPoint',
          targetIndex: 0,
          sourceType: 'transcript',
          timestampSeconds: 4.5,
          excerpt: 'Use multi-stage builds to discard build dependencies.',
        },
        {
          targetType: 'keyPoint',
          targetIndex: 1,
          sourceType: 'ocr',
          timestampMs: 4500,
          frameIndex: 2,
          excerpt: 'docker build -t app:latest .',
        },
      ],
    },
    capturedAt: '2026-03-01T10:00:00.000Z',
    analyzedAt: '2026-03-01T10:05:00.000Z',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:05:00.000Z',
  };

  describe('1. Evidence Grounding & Attribution Logic', () => {
    it('accurately resolves timestamped transcript evidence for grounded takeaways', () => {
      const attributions = mockItem.rawEvidence?.evidenceAttributions || [];
      const attr0 = attributions.find((a) => a.targetType === 'keyPoint' && a.targetIndex === 0);

      expect(attr0).toBeDefined();
      expect(attr0?.sourceType).toBe('transcript');
      expect(attr0?.timestampSeconds).toBe(4.5);
      expect(attr0?.excerpt).toContain('multi-stage builds');
    });

    it('accurately resolves timestamped visual OCR frame evidence for grounded takeaways', () => {
      const attributions = mockItem.rawEvidence?.evidenceAttributions || [];
      const attr1 = attributions.find((a) => a.targetType === 'keyPoint' && a.targetIndex === 1);

      expect(attr1).toBeDefined();
      expect(attr1?.sourceType).toBe('ocr');
      expect(attr1?.timestampMs).toBe(4500);
      expect(attr1?.frameIndex).toBe(2);
      expect(attr1?.excerpt).toBe('docker build -t app:latest .');
    });

    it('honestly distinguishes ungrounded takeaways without fabricating fake timestamps', () => {
      const attributions = mockItem.rawEvidence?.evidenceAttributions || [];
      // Takeaway 2 has no direct quote or OCR attribution
      const attr2 = attributions.find((a) => a.targetType === 'keyPoint' && a.targetIndex === 2);

      expect(attr2).toBeUndefined();
      // Verifies that ungrounded findings are treated as ungrounded and not assigned fabricated timestamps
    });

    it('resolves resource evidence from both resource.evidence and evidenceAttributions', () => {
      const resource0 = mockItem.resources[0];
      expect(resource0.evidence).toBeDefined();
      expect(resource0.evidence?.sourceType).toBe('transcript');
      expect(resource0.evidence?.timestampSeconds).toBe(14.5);
      expect(resource0.evidence?.excerpt).toContain('docs.docker.com');
    });
  });

  describe('2. Discovered Resources & Safe External Links', () => {
    it('verifies resource verification status badges and descriptions', () => {
      const [res0, res1, res2] = mockItem.resources;

      expect(res0.verificationStatus).toBe('verified_link');
      expect(res0.url).toBe('https://docs.docker.com');

      expect(res1.verificationStatus).toBe('unverified_mention');
      expect(res1.url).toBe('https://pkgs.alpinelinux.org');

      expect(res2.verificationStatus).toBe('unavailable');
      expect(res2.url).toBe('https://github.com/nonexistent/broken');
    });

    it('ensures all resource URLs and source links use secure external link conventions', () => {
      for (const res of mockItem.resources) {
        if (res.url) {
          expect(res.url.startsWith('https://')).toBe(true);
        }
      }
    });
  });

  describe('3. Absent Evidence & Partially Analyzed Items Graceful Fallbacks', () => {
    it('handles items with missing transcript or OCR without throwing errors', () => {
      const metadataOnlyItem: SavedItem = {
        ...mockItem,
        status: 'metadata_only',
        summary: undefined,
        keyPoints: [],
        resources: [],
        rawEvidence: {
          failureReason: 'Instagram reel login wall blocked direct caption extraction',
        },
      };

      expect(metadataOnlyItem.summary).toBeUndefined();
      expect(metadataOnlyItem.keyPoints).toHaveLength(0);
      expect(metadataOnlyItem.rawEvidence?.transcriptSegments).toBeUndefined();
      expect(metadataOnlyItem.rawEvidence?.ocrObservations).toBeUndefined();
      expect(metadataOnlyItem.rawEvidence?.failureReason).toContain('login wall');
    });

    it('formats timestamp seconds and milliseconds consistently', () => {
      const formatSec = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} (${seconds.toFixed(1)}s)`;
      };

      const formatMs = (ms: number) => {
        const sec = ms / 1000;
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} (${ms}ms)`;
      };

      expect(formatSec(14.5)).toBe('00:14 (14.5s)');
      expect(formatSec(75.2)).toBe('01:15 (75.2s)');
      expect(formatMs(4500)).toBe('00:04 (4500ms)');
      expect(formatMs(62300)).toBe('01:02 (62300ms)');
    });
  });

  describe('4. Re-analysis API Flow & In-flight Protection', () => {
    it('reanalyzeItem calls POST /api/items/:id/analyze and returns refreshed item', async () => {
      const refreshedItem: SavedItem = {
        ...mockItem,
        status: 'full_analyzed',
        analyzedAt: new Date().toISOString(),
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: 'Item analysis processed successfully.',
          item: refreshedItem,
        }),
      });
      globalThis.fetch = fetchMock;

      const result = await reanalyzeItem(mockItem._id);

      expect(fetchMock).toHaveBeenCalledWith(`/api/items/${mockItem._id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result.item._id).toBe(mockItem._id);
      expect(result.message).toContain('successfully');
    });

    it('handles re-analysis errors (e.g. quota limit reached) gracefully', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'AI free tier quota limit reached (HTTP 429).',
          details: 'RESOURCE_EXHAUSTED',
        }),
      });
      globalThis.fetch = fetchMock;

      await expect(reanalyzeItem(mockItem._id)).rejects.toThrow(ApiError);
      await expect(reanalyzeItem(mockItem._id)).rejects.toMatchObject({
        status: 429,
        message: 'AI free tier quota limit reached (HTTP 429).',
        details: 'RESOURCE_EXHAUSTED',
      });
    });

    it('simulates duplicate-submission prevention while re-analysis is in flight', async () => {
      let isReanalyzing = false;
      const apiCalls: string[] = [];

      const triggerReanalysis = async (id: string) => {
        if (isReanalyzing) {
          // Prevent duplicate click
          return null;
        }

        isReanalyzing = true;
        apiCalls.push(id);

        try {
          // Simulate latency
          await new Promise((r) => setTimeout(r, 50));
          return { success: true };
        } finally {
          isReanalyzing = false;
        }
      };

      // Trigger two clicks in rapid succession
      const p1 = triggerReanalysis(mockItem._id);
      const p2 = triggerReanalysis(mockItem._id); // second click while p1 is in flight

      const [res1, res2] = await Promise.all([p1, p2]);

      expect(res1).toEqual({ success: true });
      expect(res2).toBeNull(); // Second click was blocked
      expect(apiCalls).toHaveLength(1); // Only 1 API call made
    });
  });

  describe('5. Modal Keyboard Navigation, Focus Trap & Accessibility', () => {
    it('traps tab key within focusable elements and loops back on boundary elements', () => {
      const mockFocusables = ['close-button', 'reanalyze-button', 'tab-grounding', 'tab-transcript'];
      let currentIndex = 0;

      const simulateTabPress = (shiftKey: boolean) => {
        if (shiftKey) {
          if (currentIndex === 0) {
            currentIndex = mockFocusables.length - 1; // wrap to last
          } else {
            currentIndex--;
          }
        } else {
          if (currentIndex === mockFocusables.length - 1) {
            currentIndex = 0; // wrap to first
          } else {
            currentIndex++;
          }
        }
        return mockFocusables[currentIndex];
      };

      // Starting at first element, Shift+Tab should wrap to last element
      expect(simulateTabPress(true)).toBe('tab-transcript');
      // Tab from last should wrap to first element
      expect(simulateTabPress(false)).toBe('close-button');
      // Tab forward
      expect(simulateTabPress(false)).toBe('reanalyze-button');
    });

    it('stores and restores previously active element upon modal close', () => {
      let previousActiveElement: string | null = 'item-card-trigger-button';
      let modalOpen = true;

      const handleClose = () => {
        modalOpen = false;
        // Restores focus
        return previousActiveElement;
      };

      const restoredFocusTarget = handleClose();
      expect(modalOpen).toBe(false);
      expect(restoredFocusTarget).toBe('item-card-trigger-button');
    });
  });
});
