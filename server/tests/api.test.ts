import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('API Health and Routing', () => {
  it('GET /api/health returns 200 with service information', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('saveit-server');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('database');
  });

  it('returns 404 for unknown endpoints', async () => {
    const res = await request(app).get('/api/unknown-endpoint');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Route not found');
  });
});

describe('POST /api/items validation', () => {
  it('rejects missing url with 400', async () => {
    const res = await request(app).post('/api/items').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('valid "url" string');
  });

  it('rejects unsupported domains with 400', async () => {
    const res = await request(app)
      .post('/api/items')
      .send({ url: 'https://twitter.com/user/status/12345' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unsupported platform');
  });

  it('blocks private network SSRF attempts with 400', async () => {
    const res = await request(app)
      .post('/api/items')
      .send({ url: 'http://169.254.169.254/latest/meta-data/' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('security');
  });

  it('blocks loopback IP attempts with 400', async () => {
    const res = await request(app)
      .post('/api/items')
      .send({ url: 'http://127.0.0.1:27017' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('security');
  });
});

describe('GET /api/items/:id and DELETE /api/items/:id ID validation', () => {
  it('GET /api/items/:id rejects non-ObjectId string with 400', async () => {
    const res = await request(app).get('/api/items/invalid-id-123');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid item ID format');
  });

  it('DELETE /api/items/:id rejects non-ObjectId string with 400', async () => {
    const res = await request(app).delete('/api/items/invalid-id-123');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid item ID format');
  });
});
