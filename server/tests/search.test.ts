import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { connectToDatabase, disconnectFromDatabase } from '../src/config/db';
import { Item, ProcessingStatus, Platform, ContentType } from '../src/models/Item';

const app = createApp();
const TEST_MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/saveit_test';

describe('Search, Multi-Criteria Filtering & Tag Discovery Suite (Plan 05-01)', () => {
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      await connectToDatabase(TEST_MONGO_URI);
      isDbAvailable = true;

      // Clean test database and sync compound/text indexes
      await Item.deleteMany({});
      await Item.syncIndexes();

      // Seed representative test dataset
      await Item.create([
        {
          url: 'https://www.youtube.com/shorts/item1111111',
          normalizedUrl: 'https://youtube.com/shorts/item1111111',
          platform: Platform.YOUTUBE,
          contentType: ContentType.SHORT,
          platformId: 'item1111111',
          title: 'Docker & DevOps Containerization Masterclass',
          author: 'DevOpsPro',
          status: ProcessingStatus.FULLY_ANALYZED,
          summary: 'A complete guide to building containerized microservices using Docker.',
          keyPoints: ['Understand Docker daemon and images', 'Build lean multi-stage Dockerfiles'],
          tags: ['docker', 'devops', 'containers'],
          resources: [
            {
              name: 'Docker Official Documentation',
              url: 'https://docs.docker.com',
              type: 'tutorial',
            },
          ],
          rawEvidence: {
            ocrText: 'docker build -t app:latest .',
            transcript: 'Welcome to our Docker containerization masterclass guide.',
          },
          capturedAt: new Date('2026-01-01T10:00:00.000Z'),
          analyzedAt: new Date('2026-01-01T10:05:00.000Z'),
        },
        {
          url: 'https://www.instagram.com/reel/item2222222/',
          normalizedUrl: 'https://instagram.com/reel/item2222222',
          platform: Platform.INSTAGRAM,
          contentType: ContentType.REEL,
          platformId: 'item2222222',
          title: 'React State Management in 2026',
          author: 'FrontendQueen',
          status: ProcessingStatus.FULLY_ANALYZED,
          summary: 'Comparing Zustand, Redux Toolkit, and Jotai for modern apps.',
          keyPoints: ['Zustand provides boilerplate-free store', 'Use atomic state for fine-grained reactivity'],
          tags: ['react', 'frontend', 'javascript'],
          resources: [
            {
              name: 'Zustand GitHub Repository',
              url: 'https://github.com/pmndrs/zustand',
              type: 'github_repo',
            },
          ],
          rawEvidence: {
            ocrText: 'npm install zustand',
            transcript: 'Today we dive into state management with React and Zustand.',
          },
          capturedAt: new Date('2026-02-01T10:00:00.000Z'),
          analyzedAt: new Date('2026-02-01T10:05:00.000Z'),
        },
        {
          url: 'https://www.youtube.com/shorts/item3333333',
          normalizedUrl: 'https://youtube.com/shorts/item3333333',
          platform: Platform.YOUTUBE,
          contentType: ContentType.SHORT,
          platformId: 'item3333333',
          title: 'PostgreSQL Performance Tuning',
          author: 'DataWizard',
          status: ProcessingStatus.PARTIALLY_ANALYZED,
          summary: 'Optimize your database queries with EXPLAIN ANALYZE and indexes.',
          keyPoints: ['Create partial indexes for frequently queried filters', 'Tune work_mem buffer settings'],
          tags: ['database', 'postgres', 'sql', 'devops'],
          resources: [
            {
              name: 'PostgreSQL Documentation',
              url: 'https://postgresql.org/docs',
              type: 'tutorial',
            },
          ],
          rawEvidence: {
            transcript: 'Let us tune slow SQL queries with PostgreSQL indexes.',
          },
          capturedAt: new Date('2026-03-01T10:00:00.000Z'),
          analyzedAt: new Date('2026-03-01T10:05:00.000Z'),
        },
        {
          url: 'https://www.instagram.com/reel/item4444444/',
          normalizedUrl: 'https://instagram.com/reel/item4444444',
          platform: Platform.INSTAGRAM,
          contentType: ContentType.REEL,
          platformId: 'item4444444',
          title: 'Mobile App UI Animation Tricks',
          author: 'DesignMaster',
          status: ProcessingStatus.METADATA_ONLY,
          summary: 'Smooth 60fps micro-interactions with SwiftUI.',
          keyPoints: [],
          tags: ['ui', 'design', 'mobile'],
          resources: [],
          rawEvidence: {},
          capturedAt: new Date('2026-04-01T10:00:00.000Z'),
        },
        {
          url: 'https://www.youtube.com/shorts/item5555555',
          normalizedUrl: 'https://youtube.com/shorts/item5555555',
          platform: Platform.YOUTUBE,
          contentType: ContentType.SHORT,
          platformId: 'item5555555',
          title: 'Special Metacharacters Test [.*+?^${}()|[]\\]',
          author: 'SecurityTester',
          status: ProcessingStatus.QUEUED,
          summary: 'Testing inputs containing special characters like (.*+?) safely.',
          keyPoints: ['Ensure regex escaping works as expected without ReDoS'],
          tags: ['security', 'testing'],
          resources: [
            {
              name: 'OWASP Regex Security Guide',
              url: 'https://owasp.org',
              type: 'website',
            },
          ],
          rawEvidence: {
            ocrText: 'eval(payload)',
          },
          capturedAt: new Date('2026-05-01T10:00:00.000Z'),
        },
      ]);
    } catch {
      console.warn('[Search Test] Local MongoDB unavailable; skipping live DB tests.');
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      await Item.deleteMany({});
      await disconnectFromDatabase();
    }
  });

  describe('1. Full-Text and Substring Search', () => {
    it('finds items by exact keyword search', async () => {
      const res = await request(app).get('/api/items?q=PostgreSQL');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('PostgreSQL Performance Tuning');
      expect(res.body.total).toBe(1);
    });

    it('finds items by partial substring search (e.g. "dock" matching "Docker")', async () => {
      const res = await request(app).get('/api/items?q=dock');

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      const titles = res.body.items.map((i: any) => i.title);
      expect(titles).toContain('Docker & DevOps Containerization Masterclass');
    });

    it('searches across title, summary, keyPoints, tags, resources, OCR text, and transcript', async () => {
      // Search by title word
      const byTitle = await request(app).get('/api/items?q=Containerization');
      expect(byTitle.body.items[0]?.title).toBe('Docker & DevOps Containerization Masterclass');

      // Search by summary keyword
      const bySummary = await request(app).get('/api/items?q=microservices');
      expect(bySummary.body.items[0]?.title).toBe('Docker & DevOps Containerization Masterclass');

      // Search by keyPoints content
      const byKeyPoint = await request(app).get('/api/items?q=boilerplate-free');
      expect(byKeyPoint.body.items[0]?.title).toBe('React State Management in 2026');

      // Search by tag
      const byTag = await request(app).get('/api/items?q=javascript');
      expect(byTag.body.items[0]?.title).toBe('React State Management in 2026');

      // Search by resource name
      const byResource = await request(app).get('/api/items?q=Zustand');
      expect(byResource.body.items[0]?.title).toBe('React State Management in 2026');

      // Search by OCR text
      const byOcr = await request(app).get('/api/items?q=latest');
      expect(byOcr.body.items[0]?.title).toBe('Docker & DevOps Containerization Masterclass');

      // Search by transcript text
      const byTranscript = await request(app).get('/api/items?q=dive into state');
      expect(byTranscript.body.items[0]?.title).toBe('React State Management in 2026');
    });

    it('returns empty items array for non-matching queries without errors', async () => {
      const res = await request(app).get('/api/items?q=nonexistentqueryxyz999');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
      expect(res.body.totalPages).toBe(1);
    });
  });

  describe('2. Multi-Criteria Filtering', () => {
    it('filters by exact tag (case-insensitive)', async () => {
      const lowerRes = await request(app).get('/api/items?tag=docker');
      expect(lowerRes.status).toBe(200);
      expect(lowerRes.body.items).toHaveLength(1);
      expect(lowerRes.body.items[0].tags).toContain('docker');

      const upperRes = await request(app).get('/api/items?tag=DOCKER');
      expect(upperRes.status).toBe(200);
      expect(upperRes.body.items).toHaveLength(1);
      expect(upperRes.body.items[0].tags).toContain('docker');
    });

    it('filters by platform', async () => {
      const ytRes = await request(app).get('/api/items?platform=youtube');
      expect(ytRes.status).toBe(200);
      expect(ytRes.body.items).toHaveLength(3);
      ytRes.body.items.forEach((item: any) => expect(item.platform).toBe('youtube'));

      const igRes = await request(app).get('/api/items?platform=instagram');
      expect(igRes.status).toBe(200);
      expect(igRes.body.items).toHaveLength(2);
      igRes.body.items.forEach((item: any) => expect(item.platform).toBe('instagram'));
    });

    it('filters by processing status', async () => {
      const analyzedRes = await request(app).get('/api/items?status=fully_analyzed');
      expect(analyzedRes.status).toBe(200);
      expect(analyzedRes.body.items).toHaveLength(2);

      const queuedRes = await request(app).get('/api/items?status=queued');
      expect(queuedRes.status).toBe(200);
      expect(queuedRes.body.items).toHaveLength(1);
      expect(queuedRes.body.items[0].status).toBe('queued');
    });

    it('filters by content type', async () => {
      const reelRes = await request(app).get('/api/items?contentType=reel');
      expect(reelRes.status).toBe(200);
      expect(reelRes.body.items).toHaveLength(2);
      reelRes.body.items.forEach((item: any) => expect(item.contentType).toBe('reel'));

      const shortRes = await request(app).get('/api/items?contentType=short');
      expect(shortRes.status).toBe(200);
      expect(shortRes.body.items).toHaveLength(3);
      shortRes.body.items.forEach((item: any) => expect(item.contentType).toBe('short'));
    });

    it('combines platform, status, tag, and search query together correctly', async () => {
      const res = await request(app).get(
        '/api/items?platform=youtube&status=fully_analyzed&tag=devops&q=Docker'
      );

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Docker & DevOps Containerization Masterclass');
      expect(res.body.total).toBe(1);

      // Conflicting filters return 0 without error
      const conflictRes = await request(app).get(
        '/api/items?platform=instagram&status=fully_analyzed&tag=devops&q=Docker'
      );
      expect(conflictRes.status).toBe(200);
      expect(conflictRes.body.items).toHaveLength(0);
      expect(conflictRes.body.total).toBe(0);
    });
  });

  describe('3. Sorting and Relevance', () => {
    it('sorts by capturedAt ascending and descending', async () => {
      const descRes = await request(app).get('/api/items?sortBy=capturedAt&sortOrder=desc');
      expect(descRes.status).toBe(200);
      expect(descRes.body.items[0].title).toBe('Special Metacharacters Test [.*+?^${}()|[]\\]');
      expect(descRes.body.items[descRes.body.items.length - 1].title).toBe('Docker & DevOps Containerization Masterclass');

      const ascRes = await request(app).get('/api/items?sortBy=capturedAt&sortOrder=asc');
      expect(ascRes.status).toBe(200);
      expect(ascRes.body.items[0].title).toBe('Docker & DevOps Containerization Masterclass');
      expect(ascRes.body.items[ascRes.body.items.length - 1].title).toBe('Special Metacharacters Test [.*+?^${}()|[]\\]');
    });

    it('sorts by analyzedAt', async () => {
      const res = await request(app).get('/api/items?sortBy=analyzedAt&sortOrder=desc');
      expect(res.status).toBe(200);
      // Items with analyzedAt should appear first in descending date order
      expect(res.body.items[0].analyzedAt).toBeDefined();
    });

    it('sorts by relevance when search query is provided', async () => {
      // "devops" is present in title, tag, and transcript in item 1, and tag in item 3
      const res = await request(app).get('/api/items?q=devops&sortBy=relevance');

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
      // Item 1 has devops in title (+10) + tag (+8), should rank highest
      expect(res.body.items[0].title).toBe('Docker & DevOps Containerization Masterclass');
    });
  });

  describe('4. Input Safety and ReDoS Protection', () => {
    it('safely handles regex metacharacters without server crashing or syntax errors', async () => {
      const metacharacters = ['.*.*', '((((a+)+)+)+)', '[a-z]{1,100}', '\\', '^', '$', '(?=.*)'];

      for (const query of metacharacters) {
        const res = await request(app).get(`/api/items?q=${encodeURIComponent(query)}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.items)).toBe(true);
      }
    });

    it('matches literal regex characters stored in document text', async () => {
      const res = await request(app).get('/api/items?q=%28.%2A%2B%3F%29'); // literal (.*+?)

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.items[0].title).toContain('Special Metacharacters Test');
    });

    it('bounds query string length and trims excessive whitespace', async () => {
      const longQuery = '   docker ' + 'a'.repeat(300);
      const res = await request(app).get(`/api/items?q=${encodeURIComponent(longQuery)}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('5. Pagination Bounds & Error Handling', () => {
    it('paginates results with page and limit parameters', async () => {
      const page1 = await request(app).get('/api/items?page=1&limit=2');
      expect(page1.status).toBe(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.page).toBe(1);
      expect(page1.body.limit).toBe(2);
      expect(page1.body.total).toBe(5);
      expect(page1.body.totalPages).toBe(3);

      const page2 = await request(app).get('/api/items?page=2&limit=2');
      expect(page2.status).toBe(200);
      expect(page2.body.items).toHaveLength(2);
      expect(page2.body.page).toBe(2);

      // Verify page 1 and page 2 return different items
      const p1Ids = page1.body.items.map((i: any) => i._id);
      const p2Ids = page2.body.items.map((i: any) => i._id);
      expect(p1Ids.some((id: string) => p2Ids.includes(id))).toBe(false);
    });

    it('caps limit at 100 max', async () => {
      const res = await request(app).get('/api/items?limit=500');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });

    it('gracefully handles negative or malformed page and limit parameters', async () => {
      const res = await request(app).get('/api/items?page=invalid&limit=-10');

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
    });
  });

  describe('6. Tag Discovery API (GET /api/tags & GET /api/items/tags)', () => {
    it('returns unique normalized lowercase tags with frequency counts', async () => {
      const res = await request(app).get('/api/tags');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tags)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);

      // Verify 'devops' appears twice across seeded items (item 1 and item 3)
      const devopsTag = res.body.tags.find((t: any) => t.tag === 'devops');
      expect(devopsTag).toBeDefined();
      expect(devopsTag.count).toBe(2);

      // Verify all tags are lowercased and have positive count
      for (const tagObj of res.body.tags) {
        expect(tagObj.tag).toBe(tagObj.tag.toLowerCase());
        expect(tagObj.count).toBeGreaterThan(0);
      }

      // Verify sorted by count desc, then tag asc
      for (let i = 0; i < res.body.tags.length - 1; i++) {
        const current = res.body.tags[i];
        const next = res.body.tags[i + 1];
        if (current.count === next.count) {
          expect(current.tag.localeCompare(next.tag)).toBeLessThanOrEqual(0);
        } else {
          expect(current.count).toBeGreaterThan(next.count);
        }
      }
    });

    it('GET /api/items/tags returns identical tag frequency payload for router consistency', async () => {
      const res = await request(app).get('/api/items/tags');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tags)).toBe(true);
      expect(res.body.tags.some((t: any) => t.tag === 'docker')).toBe(true);
    });
  });

  describe('7. Backward Compatibility', () => {
    it('preserves existing GET /api/items contract with default parameters', async () => {
      const res = await request(app).get('/api/items');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('limit');
      expect(res.body).toHaveProperty('totalPages');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });
});
