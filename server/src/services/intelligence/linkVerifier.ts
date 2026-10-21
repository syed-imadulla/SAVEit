import { ExtractedResource, ResourceStatus } from './types';
import { isPrivateOrLoopbackHost } from '../../utils/urlValidator';

export const DEFAULT_LINK_TIMEOUT_MS = 3000;
export const DEFAULT_USER_AGENT = 'SAVEit-LinkVerifier/0.1.0';

export interface LinkVerifierOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * SSRF-Guarded link verification service.
 *
 * Validates candidate URLs found in descriptions or transcripts:
 * 1. Blocks private, loopback, and cloud metadata addresses (SSRF defense).
 * 2. Checks HTTP reachability using bounded HEAD/GET requests.
 * 3. Enforces hop-by-hop redirect validation so public URLs cannot redirect internally.
 */
export class LinkVerifier {
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: LinkVerifierOptions = {}) {
    this.timeoutMs = options.timeoutMs || DEFAULT_LINK_TIMEOUT_MS;
    this.fetchFn = options.fetchFn || fetch;
  }

  /**
   * Probes an individual URL for reachability while strictly preventing SSRF.
   */
  async probeUrl(targetUrl: string, maxRedirects = 2): Promise<{ reachable: boolean; status?: number; error?: string }> {
    let currentUrl = targetUrl;
    let redirectsCount = 0;

    while (redirectsCount <= maxRedirects) {
      let parsed: URL;
      try {
        parsed = new URL(currentUrl);
      } catch {
        return { reachable: false, error: 'INVALID_URL' };
      }

      // Reject non-web protocols (file:, ftp:, javascript:)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { reachable: false, error: 'UNSUPPORTED_PROTOCOL' };
      }

      // Intercept private subnets, cloud metadata, and loopback (SSRF defense)
      if (isPrivateOrLoopbackHost(parsed.hostname)) {
        return { reachable: false, error: 'SSRF_BLOCKED_HOST' };
      }

      try {
        // Try HEAD first for minimal bandwidth, fallback to GET if 405 Method Not Allowed
        let response = await this.fetchFn(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { 'User-Agent': DEFAULT_USER_AGENT },
        });

        if (response.status === 405) {
          response = await this.fetchFn(currentUrl, {
            method: 'GET',
            redirect: 'manual',
            signal: AbortSignal.timeout(this.timeoutMs),
            headers: { 'User-Agent': DEFAULT_USER_AGENT },
          });
        }

        // Hop-by-hop redirect verification
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            return { reachable: true, status: response.status };
          }
          currentUrl = new URL(location, currentUrl).toString();
          redirectsCount++;
          continue;
        }

        return {
          reachable: response.status >= 200 && response.status < 400,
          status: response.status,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { reachable: false, error: msg };
      }
    }

    return { reachable: false, error: 'MAX_REDIRECTS_EXCEEDED' };
  }

  /**
   * Verifies an individual extracted resource.
   */
  async verifyResource(resource: ExtractedResource): Promise<ExtractedResource> {
    if (!resource.url) {
      return {
        ...resource,
        status: 'unverified_mention',
      };
    }

    const probe = await this.probeUrl(resource.url);

    let status: ResourceStatus = 'broken';
    if (probe.reachable) {
      status = 'verified';
    } else if (probe.error === 'SSRF_BLOCKED_HOST') {
      status = 'broken';
    }

    return {
      ...resource,
      status,
    };
  }

  /**
   * Verifies an array of resources concurrently with bounded parallelism.
   */
  async verifyResources(resources: ExtractedResource[]): Promise<ExtractedResource[]> {
    if (!Array.isArray(resources) || resources.length === 0) {
      return [];
    }

    const verified = await Promise.all(resources.map((r) => this.verifyResource(r)));
    return verified;
  }
}

export const defaultLinkVerifier = new LinkVerifier();
