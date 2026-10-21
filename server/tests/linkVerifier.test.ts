import { describe, it, expect, vi } from 'vitest';
import { LinkVerifier } from '../src/services/intelligence/linkVerifier';
import { ExtractedResource } from '../src/services/intelligence/types';

describe('LinkVerifier', () => {
  it('marks reachable HTTP 200 URLs as verified', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const verifier = new LinkVerifier({ fetchFn: mockFetch });

    const resource: ExtractedResource = {
      title: 'Vite',
      url: 'https://vite.dev',
      type: 'tool',
      status: 'unverified_mention',
    };

    const result = await verifier.verifyResource(resource);
    expect(result.status).toBe('verified');
  });

  it('marks HTTP 404 broken URLs as broken', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));
    const verifier = new LinkVerifier({ fetchFn: mockFetch });

    const resource: ExtractedResource = {
      title: 'Dead Link',
      url: 'https://example.com/does-not-exist',
      type: 'website',
      status: 'unverified_mention',
    };

    const result = await verifier.verifyResource(resource);
    expect(result.status).toBe('broken');
  });

  it('strictly blocks SSRF loopback and private IP links without firing network requests', async () => {
    const mockFetch = vi.fn();
    const verifier = new LinkVerifier({ fetchFn: mockFetch });

    const ssrfResources: ExtractedResource[] = [
      { title: 'Localhost', url: 'http://localhost:5001/api', type: 'website', status: 'unverified_mention' },
      { title: 'Loopback IP', url: 'http://127.0.0.1:27017', type: 'website', status: 'unverified_mention' },
      { title: 'Cloud Metadata', url: 'http://169.254.169.254/latest/meta-data', type: 'website', status: 'unverified_mention' },
      { title: 'Private Subnet', url: 'http://192.168.1.1', type: 'website', status: 'unverified_mention' },
    ];

    for (const res of ssrfResources) {
      const result = await verifier.verifyResource(res);
      expect(result.status).toBe('broken');
    }

    // Crucial: No external HTTP calls should have been dispatched to internal IPs
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('intercepts malicious redirects targeting internal IP addresses', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      })
    );

    const verifier = new LinkVerifier({ fetchFn: mockFetch });
    const resource: ExtractedResource = {
      title: 'Malicious Shortener',
      url: 'https://short.link/evil',
      type: 'website',
      status: 'unverified_mention',
    };

    const result = await verifier.verifyResource(resource);
    expect(result.status).toBe('broken');
    // First call was to public shortener; second hop to 169.254.169.254 was intercepted before dispatch
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps status as unverified_mention when no URL is present', async () => {
    const verifier = new LinkVerifier();
    const resource: ExtractedResource = {
      title: 'Docker',
      type: 'tool',
      status: 'unverified_mention',
    };

    const result = await verifier.verifyResource(resource);
    expect(result.status).toBe('unverified_mention');
  });

  it('handles network timeouts by marking the link as broken', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('The operation was aborted due to timeout'));
    const verifier = new LinkVerifier({ fetchFn: mockFetch });

    const resource: ExtractedResource = {
      title: 'Slow Server',
      url: 'https://slow-site.com',
      type: 'website',
      status: 'unverified_mention',
    };

    const result = await verifier.verifyResource(resource);
    expect(result.status).toBe('broken');
  });
});
