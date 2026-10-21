import { describe, it, expect, vi } from 'vitest';
import { Platform, ProcessingStatus, ContentType } from '../src/models/Item';
import { InstagramAdapter } from '../src/services/retrieval/instagramAdapter';

describe('InstagramAdapter', () => {
  describe('canHandle', () => {
    const adapter = new InstagramAdapter();

    it('returns true for valid Instagram Reel URLs', () => {
      expect(adapter.canHandle('https://www.instagram.com/reel/C8qLqL-A0B1/')).toBe(true);
      expect(adapter.canHandle('https://instagram.com/reel/C3_V_v7LqK8?igsh=123')).toBe(true);
      expect(adapter.canHandle('https://instagr.am/reel/abc12345/')).toBe(true);
    });

    it('returns false for YouTube Shorts and other platforms', () => {
      expect(adapter.canHandle('https://www.youtube.com/shorts/q1qKv5TBaOA')).toBe(false);
      expect(adapter.canHandle('https://tiktok.com/@user/video/123')).toBe(false);
    });

    it('returns false for empty or non-URL inputs', () => {
      expect(adapter.canHandle('')).toBe(false);
      expect(adapter.canHandle('not-a-url')).toBe(false);
      expect(adapter.canHandle('http://localhost:3000')).toBe(false);
    });
  });

  describe('retrieve', () => {
    it('1. Successfully extracts public OpenGraph metadata when rendered server-side', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta property="og:title" content="Awesome Coding Tips &amp; Tricks" />
            <meta property="og:description" content="1,200 likes, 45 comments - code_mentor on June 12: Best practices for clean TypeScript code." />
            <meta property="og:image" content="https://instagram.com/thumbs/reel123.jpg" />
          </head>
        </html>
      `;

      const mockFetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
      const adapter = new InstagramAdapter({ fetchFn: mockFetch });

      const report = await adapter.retrieve('https://www.instagram.com/reel/C8qLqL-A0B1/');

      expect(report.platform).toBe(Platform.INSTAGRAM);
      expect(report.contentType).toBe(ContentType.REEL);
      expect(report.accessLevel).toBe('metadata_only');
      expect(report.status).toBe(ProcessingStatus.METADATA_ONLY);
      expect(report.metadata.title).toBe('Awesome Coding Tips & Tricks');
      expect(report.metadata.author).toBe('code_mentor');
      expect(report.metadata.thumbnailUrl).toBe('https://instagram.com/thumbs/reel123.jpg');
      expect(report.rawEvidence.metadataAccessible).toBe(true);
    });

    it('2. Detects HTTP 302 login wall redirect and degrades honestly without crashing', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'https://www.instagram.com/accounts/login/?next=/reel/C8qLqL-A0B1/' },
        })
      );

      const adapter = new InstagramAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.instagram.com/reel/C8qLqL-A0B1/');

      expect(report.accessLevel).toBe('inaccessible');
      expect(report.status).toBe(ProcessingStatus.UNSUPPORTED_INACCESSIBLE);
      expect(report.rawEvidence.failureReason).toBe('INSTAGRAM_LOGIN_WALL_ENCOUNTERED');
      expect(report.rawEvidence.notes).toContain('login');
    });

    it('3. Detects client-side React login shell and records diagnostic boundary', async () => {
      const clientSpaHtml = `
        <!DOCTYPE html>
        <html class="_9dls">
          <head><title>Instagram</title></head>
          <body>
            <script src="/static/login_bundle.js"></script>
            <div>Log in to see photos and videos from friends.</div>
          </body>
        </html>
      `;

      const mockFetch = vi.fn().mockResolvedValue(new Response(clientSpaHtml, { status: 200 }));
      const adapter = new InstagramAdapter({ fetchFn: mockFetch });

      const report = await adapter.retrieve('https://www.instagram.com/reel/C8qLqL-A0B1/');

      expect(report.accessLevel).toBe('inaccessible');
      expect(report.status).toBe(ProcessingStatus.UNSUPPORTED_INACCESSIBLE);
      expect(report.rawEvidence.failureReason).toBe('INSTAGRAM_CLIENT_LOGIN_SHELL');
      expect(report.rawEvidence.metadataAccessible).toBe(false);
    });

    it('4. Handles 404 Not Found reel shortcodes gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));

      const adapter = new InstagramAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.instagram.com/reel/ZZZZZZZZZZZ/');

      expect(report.accessLevel).toBe('inaccessible');
      expect(report.status).toBe(ProcessingStatus.UNSUPPORTED_INACCESSIBLE);
      expect(report.rawEvidence.httpStatusCode).toBe(404);
      expect(report.rawEvidence.failureReason).toBe('HTTP_404_NOT_FOUND');
    });

    it('5. Handles request timeout with RETRYABLE_FAILURE status', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('The operation was aborted due to timeout'));

      const adapter = new InstagramAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.instagram.com/reel/C8qLqL-A0B1/');

      expect(report.accessLevel).toBe('inaccessible');
      expect(report.status).toBe(ProcessingStatus.RETRYABLE_FAILURE);
      expect(report.rawEvidence.failureReason).toBe('REQUEST_TIMEOUT');
    });

    it('6. Blocks local private SSRF target with zero network calls dispatched', async () => {
      const mockFetch = vi.fn();
      const adapter = new InstagramAdapter({ fetchFn: mockFetch });

      const report = await adapter.retrieve('http://127.0.0.1:27017/reel/exploit');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(report.accessLevel).toBe('inaccessible');
      expect(report.status).toBe(ProcessingStatus.UNSUPPORTED_INACCESSIBLE);
      expect(report.rawEvidence.failureReason).toBe('SSRF_BLOCKED');
    });

    it('7. Intercepts malicious HTTP redirect hops to private subnets', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 301,
          headers: { location: 'http://169.254.169.254/latest/meta-data' },
        })
      );

      const adapter = new InstagramAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.instagram.com/reel/C8qLqL-A0B1/');

      expect(report.accessLevel).toBe('inaccessible');
      expect(report.rawEvidence.failureReason).toBe('SSRF_BLOCKED_HOST');
    });

    it('8. Faithfully preserves original submitted URL while creating normalized canonical URL', async () => {
      const rawUrl = 'https://instagram.com/reel/C8qLqL-A0B1/?igsh=abc1234&utm_source=share';
      const html = `<meta property="og:title" content="Title" />`;
      const mockFetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));

      const adapter = new InstagramAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve(rawUrl);

      expect(report.originalUrl).toBe(rawUrl);
      expect(report.normalizedUrl).toBe('https://www.instagram.com/reel/C8qLqL-A0B1/');
      expect(report.platformId).toBe('C8qLqL-A0B1');
    });
  });
});
