import { describe, it, expect, vi } from 'vitest';
import { Platform, ProcessingStatus, ContentType } from '../src/models/Item';
import { YouTubeAdapter, parseTimedTextXml } from '../src/services/retrieval/youtubeAdapter';

describe('YouTubeAdapter', () => {
  describe('canHandle', () => {
    const adapter = new YouTubeAdapter();

    it('returns true for valid YouTube Shorts URLs', () => {
      expect(adapter.canHandle('https://www.youtube.com/shorts/q1qKv5TBaOA')).toBe(true);
      expect(adapter.canHandle('https://youtube.com/shorts/0e3GPea1Tyg?feature=share')).toBe(true);
      expect(adapter.canHandle('https://youtu.be/q1qKv5TBaOA')).toBe(true);
    });

    it('returns false for Instagram Reels and other platforms', () => {
      expect(adapter.canHandle('https://www.instagram.com/reel/C8qLqL-A0B1/')).toBe(false);
      expect(adapter.canHandle('https://tiktok.com/@user/video/12345')).toBe(false);
    });

    it('returns false for invalid inputs or empty strings', () => {
      expect(adapter.canHandle('')).toBe(false);
      expect(adapter.canHandle('not-a-url')).toBe(false);
      expect(adapter.canHandle('http://localhost:3000')).toBe(false);
    });
  });

  describe('parseTimedTextXml helper', () => {
    it('parses standard <text> elements with start and duration', () => {
      const xml = `
        <transcript>
          <text start="1.5" dur="2.25">Hello &amp; welcome to SAVEit</text>
          <text start="3.75" dur="1.5">A modern knowledge &lt;base&gt;</text>
        </transcript>
      `;
      const segments = parseTimedTextXml(xml);
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        start: 1.5,
        duration: 2.25,
        text: 'Hello & welcome to SAVEit',
      });
      expect(segments[1]).toEqual({
        start: 3.75,
        duration: 1.5,
        text: 'A modern knowledge <base>',
      });
    });

    it('parses paragraph <p> format with millisecond attributes', () => {
      const xml = `
        <timedtext>
          <body>
            <p t="1200" d="2400">First line</p>
            <p t="3600" d="1800">Second line</p>
          </body>
        </timedtext>
      `;
      const segments = parseTimedTextXml(xml);
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ start: 1.2, duration: 2.4, text: 'First line' });
      expect(segments[1]).toEqual({ start: 3.6, duration: 1.8, text: 'Second line' });
    });

    it('handles empty or malformed XML gracefully', () => {
      expect(parseTimedTextXml('')).toEqual([]);
      expect(parseTimedTextXml('<xml>No captions</xml>')).toEqual([]);
    });
  });

  describe('retrieve', () => {
    it('1. Successfully extracts oEmbed metadata when captions are absent', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('youtube.com/oembed')) {
          return new Response(
            JSON.stringify({
              title: 'Clean Architecture Explained',
              author_name: 'Tech Lead',
              author_url: 'https://youtube.com/@techlead',
              thumbnail_url: 'https://i.ytimg.com/vi/q1qKv5TBaOA/hqdefault.jpg',
              provider_name: 'YouTube',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        // Watch page has no captions
        return new Response('<html><body>No captions here</body></html>', { status: 200 });
      });

      const adapter = new YouTubeAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.youtube.com/shorts/q1qKv5TBaOA');

      expect(report.platform).toBe(Platform.YOUTUBE);
      expect(report.contentType).toBe(ContentType.SHORT);
      expect(report.accessLevel).toBe('metadata_only');
      expect(report.status).toBe(ProcessingStatus.METADATA_ONLY);
      expect(report.metadata.title).toBe('Clean Architecture Explained');
      expect(report.metadata.author).toBe('Tech Lead');
      expect(report.metadata.thumbnailUrl).toBe('https://i.ytimg.com/vi/q1qKv5TBaOA/hqdefault.jpg');
      expect(report.transcript).toBeUndefined();
      expect(report.rawEvidence.metadataAccessible).toBe(true);
      expect(report.rawEvidence.captionsDetected).toBe(false);
    });

    it('2. Extracts both metadata and valid timestamped transcript segments', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('youtube.com/oembed')) {
          return new Response(
            JSON.stringify({
              title: 'Fast TypeScript Tips',
              author_name: 'DevChannel',
              thumbnail_url: 'https://i.ytimg.com/vi/q1qKv5TBaOA/thumb.jpg',
            }),
            { status: 200 }
          );
        }
        if (url.includes('watch?v=')) {
          return new Response(
            `<html><script>ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=test&lang=en","name":{"simpleText":"English"},"languageCode":"en"}]}}};</script></html>`,
            { status: 200 }
          );
        }
        if (url.includes('api/timedtext')) {
          return new Response(
            `<transcript><text start="0.0" dur="2.5">Tip one: Use strict null checks</text><text start="2.5" dur="3.0">Tip two: Leverage discriminated unions</text></transcript>`,
            { status: 200 }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new YouTubeAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.youtube.com/shorts/q1qKv5TBaOA');

      expect(report.accessLevel).toBe('full');
      expect(report.status).toBe(ProcessingStatus.PARTIALLY_ANALYZED);
      expect(report.metadata.title).toBe('Fast TypeScript Tips');
      expect(report.transcript).toBeDefined();
      expect(report.transcript?.language).toBe('en');
      expect(report.transcript?.segments).toHaveLength(2);
      expect(report.transcript?.segments[0].text).toBe('Tip one: Use strict null checks');
      expect(report.transcript?.text).toBe(
        'Tip one: Use strict null checks Tip two: Leverage discriminated unions'
      );
      expect(report.rawEvidence.rawStreamAccessible).toBe(true);
      expect(report.rawEvidence.captionsDetected).toBe(true);
    });

    it('3. Honest fallback when caption tracks are detected but timedtext stream is signature-protected/empty', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('youtube.com/oembed')) {
          return new Response(
            JSON.stringify({
              title: 'Educational Short',
              author_name: 'Educator',
            }),
            { status: 200 }
          );
        }
        if (url.includes('watch?v=')) {
          return new Response(
            `<html>"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?sig=test","name":{"simpleText":"English"},"languageCode":"en"}]</html>`,
            { status: 200 }
          );
        }
        if (url.includes('api/timedtext')) {
          // YouTube returns 200 with empty body due to signature verification
          return new Response('', { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new YouTubeAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.youtube.com/shorts/q1qKv5TBaOA');

      expect(report.accessLevel).toBe('metadata_only');
      expect(report.status).toBe(ProcessingStatus.METADATA_ONLY);
      expect(report.transcript).toBeUndefined();
      expect(report.rawEvidence.captionsDetected).toBe(true);
      expect(report.rawEvidence.rawStreamAccessible).toBe(false);
      expect(report.rawEvidence.notes).toContain('Caption tracks detected');
      expect(report.rawEvidence.notes).toContain('signature-protected');
    });

    it('4. Handles deleted, private, or 404 videos gracefully', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response('Not Found', { status: 404 });
      });

      const adapter = new YouTubeAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.youtube.com/shorts/00000000000');

      expect(report.accessLevel).toBe('inaccessible');
      expect(report.status).toBe(ProcessingStatus.UNSUPPORTED_INACCESSIBLE);
      expect(report.rawEvidence.metadataAccessible).toBe(false);
      expect(report.rawEvidence.httpStatusCode).toBe(404);
      expect(report.rawEvidence.failureReason).toBe('HTTP_404_UNAVAILABLE');
    });

    it('5. Handles request timeout with RETRYABLE_FAILURE status', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        throw new Error('The operation was aborted due to timeout');
      });

      const adapter = new YouTubeAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.youtube.com/shorts/q1qKv5TBaOA');

      expect(report.accessLevel).toBe('inaccessible');
      expect(report.status).toBe(ProcessingStatus.RETRYABLE_FAILURE);
      expect(report.rawEvidence.failureReason).toBe('REQUEST_TIMEOUT');
    });

    it('6. Handles malformed non-JSON oEmbed response without throwing', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response('<!DOCTYPE html><html><body>Error</body></html>', { status: 200 });
      });

      const adapter = new YouTubeAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.youtube.com/shorts/q1qKv5TBaOA');

      expect(report.accessLevel).toBe('inaccessible');
      expect(report.status).toBe(ProcessingStatus.UNSUPPORTED_INACCESSIBLE);
      expect(report.rawEvidence.metadataAccessible).toBe(false);
    });

    it('7. Enforces SSRF defense on private IP targets with zero network packets dispatched', async () => {
      const mockFetch = vi.fn();
      const adapter = new YouTubeAdapter({ fetchFn: mockFetch });

      const report = await adapter.retrieve('http://127.0.0.1:27017/shorts/exploit');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(report.accessLevel).toBe('inaccessible');
      expect(report.status).toBe(ProcessingStatus.UNSUPPORTED_INACCESSIBLE);
      expect(report.rawEvidence.failureReason).toBe('SSRF_BLOCKED');
    });

    it('8. Enforces SSRF defense on malicious HTTP redirect hops', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('youtube.com/oembed')) {
          return new Response(null, {
            status: 302,
            headers: { location: 'http://169.254.169.254/latest/meta-data' },
          });
        }
        return new Response('Should not reach here', { status: 200 });
      });

      const adapter = new YouTubeAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve('https://www.youtube.com/shorts/q1qKv5TBaOA');

      expect(report.accessLevel).toBe('inaccessible');
      expect(report.rawEvidence.failureReason).toBe('SSRF_BLOCKED_HOST');
    });

    it('9. Faithfully preserves the original source URL and generates normalized canonical URL', async () => {
      const inputUrl = 'https://youtube.com/shorts/q1qKv5TBaOA?feature=share&si=abc1234&utm_source=test';
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({ title: 'Canonical Test', author_name: 'Author' }),
          { status: 200 }
        );
      });

      const adapter = new YouTubeAdapter({ fetchFn: mockFetch });
      const report = await adapter.retrieve(inputUrl);

      expect(report.originalUrl).toBe(inputUrl);
      expect(report.normalizedUrl).toBe('https://www.youtube.com/shorts/q1qKv5TBaOA');
      expect(report.platformId).toBe('q1qKv5TBaOA');
    });
  });
});
