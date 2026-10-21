import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { connectToDatabase, disconnectFromDatabase } from '../src/config/db';
import { Item, ProcessingStatus, Platform, ContentType } from '../src/models/Item';

const app = createApp();
const TEST_MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/saveit_test';

describe('Item Storage and CRUD Integration', () => {
  let isDbAvailable = false;
  let createdItemId: string;

  beforeAll(async () => {
    try {
      await connectToDatabase(TEST_MONGO_URI);
      isDbAvailable = true;
      await Item.deleteMany({}); // Clean test collection
    } catch (err) {
      console.warn('[Test] Local MongoDB not reachable. Skipping live DB integration suite.');
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      await Item.deleteMany({});
      await disconnectFromDatabase();
    }
  });

  it('POST /api/items captures a valid YouTube Short and persists with queued status', async () => {
    if (!isDbAvailable) return;

    const testUrl = 'https://www.youtube.com/shorts/dQw4w9WgXcQ?si=test1234';
    const res = await request(app).post('/api/items').send({ url: testUrl });

    expect(res.status).toBe(201);
    expect(res.body.isDuplicate).toBe(false);
    expect(res.body.item).toBeDefined();
    expect(res.body.item.platform).toBe(Platform.YOUTUBE);
    expect(res.body.item.contentType).toBe(ContentType.SHORT);
    expect(res.body.item.status).toBe(ProcessingStatus.QUEUED);
    expect(res.body.item.normalizedUrl).toBe('https://www.youtube.com/shorts/dQw4w9WgXcQ');

    createdItemId = res.body.item._id;
  });

  it('POST /api/items recognizes duplicate submissions gracefully', async () => {
    if (!isDbAvailable) return;

    // Same video with different tracking query
    const duplicateUrl = 'https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share';
    const res = await request(app).post('/api/items').send({ url: duplicateUrl });

    expect(res.status).toBe(200);
    expect(res.body.isDuplicate).toBe(true);
    expect(res.body.item._id).toBe(createdItemId);
  });

  it('GET /api/items lists saved items with pagination metadata', async () => {
    if (!isDbAvailable) return;

    const res = await request(app).get('/api/items');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]._id).toBe(createdItemId);
  });

  it('GET /api/items/:id retrieves a single item', async () => {
    if (!isDbAvailable) return;

    const res = await request(app).get(`/api/items/${createdItemId}`);

    expect(res.status).toBe(200);
    expect(res.body.item._id).toBe(createdItemId);
    expect(res.body.item.status).toBe(ProcessingStatus.QUEUED);
  });

  it('DELETE /api/items/:id removes the item', async () => {
    if (!isDbAvailable) return;

    const res = await request(app).delete(`/api/items/${createdItemId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it is gone
    const verifyRes = await request(app).get(`/api/items/${createdItemId}`);
    expect(verifyRes.status).toBe(404);
  });
});
