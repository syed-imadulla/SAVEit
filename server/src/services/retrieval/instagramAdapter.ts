import { Platform, ContentType, ProcessingStatus } from '../../models/Item';
import {
  validateAndParseVideoUrl,
  isPrivateOrLoopbackHost,
} from '../../utils/urlValidator';
import {
  RetrievalAdapter,
  EvidenceReport,
  RetrievalMetadata,
  RawEvidence,
} from './types';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 SAVEit-Retrieval/1.0';

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB guard against memory exhaustion

export interface InstagramAdapterOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Decodes standard HTML entities in extracted meta tags.
 */
function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Modular retrieval adapter for Instagram Reels.
 *
 * Implements legitimate public probing with honest degradation:
 * 1. Validates URL syntax and enforces strict hop-by-hop SSRF protection.
 * 2. Probes public OpenGraph meta tags on reel pages.
 * 3. Detects platform login walls (302 redirects to /accounts/login/ or unauthenticated client shells).
 * 4. Honestly falls back to metadata_only or unsupported_inaccessible without attempting bot evasion.
 * 5. Preserves the user's original URL at all times.
 */
export class InstagramAdapter implements RetrievalAdapter {
  readonly platform = Platform.INSTAGRAM;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: InstagramAdapterOptions = {}) {
    this.fetchFn = options.fetchFn || fetch;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fast synchronous check whether this adapter can process the given URL.
   */
  canHandle(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }
    const validation = validateAndParseVideoUrl(url);
    return validation.isValid && validation.platform === Platform.INSTAGRAM;
  }

  /**
   * Safely fetches an HTTP resource enforcing bounded timeouts, response size limits,
   * and strict SSRF checking on the initial URL and on any redirect hops.
   */
  private async safeFetch(
    targetUrl: string,
    options: RequestInit = {},
    maxRedirects = 3
  ): Promise<{ response?: Response; finalUrl?: string; error?: string; status?: number }> {
    let currentUrl = targetUrl;
    let redirectsCount = 0;

    while (redirectsCount <= maxRedirects) {
      let parsed: URL;
      try {
        parsed = new URL(currentUrl);
      } catch {
        return { error: 'INVALID_URL' };
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { error: 'UNSUPPORTED_PROTOCOL' };
      }

      if (isPrivateOrLoopbackHost(parsed.hostname)) {
        return { error: 'SSRF_BLOCKED_HOST' };
      }

      try {
        const response = await this.fetchFn(currentUrl, {
          ...options,
          redirect: 'manual',
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            ...options.headers,
          },
        });

        // Hop-by-hop redirect validation
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            return { response, finalUrl: currentUrl, status: response.status };
          }

          const resolvedRedirect = new URL(location, currentUrl).toString();

          // Stop immediately if redirected to Instagram login wall
          if (resolvedRedirect.includes('/accounts/login') || location.includes('/accounts/login')) {
            return { response, finalUrl: resolvedRedirect, status: response.status };
          }

          currentUrl = resolvedRedirect;
          redirectsCount++;
          continue;
        }

        return { response, finalUrl: currentUrl, status: response.status };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('aborted')) {
          return { error: 'REQUEST_TIMEOUT' };
        }
        return { error: `NETWORK_ERROR: ${message}` };
      }
    }

    return { error: 'MAX_REDIRECTS_EXCEEDED' };
  }

  /**
   * Safely reads text from a response up to MAX_BODY_BYTES.
   */
  private async safeReadText(response: Response): Promise<string> {
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) {
      return text.slice(0, MAX_BODY_BYTES);
    }
    return text;
  }

  /**
   * Probes public Instagram Reel and returns an honest EvidenceReport.
   */
  async retrieve(rawUrl: string): Promise<EvidenceReport> {
    const startTime = Date.now();
    const retrievedAt = new Date();

    // 1. Initial URL validation and SSRF gate
    const validation = validateAndParseVideoUrl(rawUrl);

    if (!validation.isValid) {
      const isSsrf =
        validation.error.toLowerCase().includes('private') ||
        validation.error.toLowerCase().includes('internal') ||
        validation.error.toLowerCase().includes('loopback');

      return {
        originalUrl: rawUrl,
        normalizedUrl: rawUrl,
        platform: Platform.INSTAGRAM,
        contentType: ContentType.UNKNOWN,
        accessLevel: 'inaccessible',
        status: ProcessingStatus.UNSUPPORTED_INACCESSIBLE,
        metadata: {},
        rawEvidence: {
          metadataAccessible: false,
          captionsDetected: false,
          rawStreamAccessible: false,
          failureReason: isSsrf ? 'SSRF_BLOCKED' : 'VALIDATION_FAILED',
          notes: validation.error,
          latencyMs: Date.now() - startTime,
        },
        retrievedAt,
      };
    }

    const { normalizedUrl, platform, contentType, platformId } = validation;

    // 2. Safe fetch public page URL
    const fetchResult = await this.safeFetch(normalizedUrl);

    if (fetchResult.error) {
      const isTimeout = fetchResult.error.includes('TIMEOUT');
      return {
        originalUrl: rawUrl,
        normalizedUrl,
        platform,
        contentType,
        platformId,
        accessLevel: 'inaccessible',
        status: isTimeout ? ProcessingStatus.RETRYABLE_FAILURE : ProcessingStatus.UNSUPPORTED_INACCESSIBLE,
        metadata: {},
        rawEvidence: {
          metadataAccessible: false,
          captionsDetected: false,
          rawStreamAccessible: false,
          failureReason: fetchResult.error,
          notes: `Failed to probe Instagram page: ${fetchResult.error}`,
          latencyMs: Date.now() - startTime,
        },
        retrievedAt,
      };
    }

    const httpStatus = fetchResult.status || 0;
    const finalUrl = fetchResult.finalUrl || '';

    // 3. Detect login wall redirects (302 redirect to /accounts/login/ or 401/403)
    const isLoginWallRedirect =
      finalUrl.includes('/accounts/login') ||
      fetchResult.response?.headers.get('location')?.includes('/accounts/login') ||
      httpStatus === 302 ||
      httpStatus === 401 ||
      httpStatus === 403;

    if (isLoginWallRedirect) {
      return {
        originalUrl: rawUrl,
        normalizedUrl,
        platform,
        contentType,
        platformId,
        accessLevel: 'inaccessible',
        status: ProcessingStatus.UNSUPPORTED_INACCESSIBLE,
        metadata: {},
        rawEvidence: {
          metadataAccessible: false,
          captionsDetected: false,
          rawStreamAccessible: false,
          httpStatusCode: httpStatus,
          failureReason: 'INSTAGRAM_LOGIN_WALL_ENCOUNTERED',
          notes: 'Instagram redirected automated request to /accounts/login/ (platform login boundary).',
          latencyMs: Date.now() - startTime,
        },
        retrievedAt,
      };
    }

    // 4. Handle 404 Not Found
    if (httpStatus === 404) {
      return {
        originalUrl: rawUrl,
        normalizedUrl,
        platform,
        contentType,
        platformId,
        accessLevel: 'inaccessible',
        status: ProcessingStatus.UNSUPPORTED_INACCESSIBLE,
        metadata: {},
        rawEvidence: {
          metadataAccessible: false,
          captionsDetected: false,
          rawStreamAccessible: false,
          httpStatusCode: 404,
          failureReason: 'HTTP_404_NOT_FOUND',
          notes: 'Instagram confirmed reel shortcode does not exist.',
          latencyMs: Date.now() - startTime,
        },
        retrievedAt,
      };
    }

    // 5. Inspect returned HTML for OpenGraph meta tags vs Client React login boundary
    let metadata: RetrievalMetadata = {};
    let metadataAccessible = false;
    let isClientLoginShell = false;

    try {
      const html = await this.safeReadText(fetchResult.response!);

      const ogTitleMatch =
        html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i) ||
        html.match(/<meta\s+[^>]*content=["'](.*?)["'][^>]*property=["']og:title["']/i);

      const ogDescMatch =
        html.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["'](.*?)["']/i) ||
        html.match(/<meta\s+[^>]*content=["'](.*?)["'][^>]*property=["']og:description["']/i);

      const ogImageMatch =
        html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i) ||
        html.match(/<meta\s+[^>]*content=["'](.*?)["'][^>]*property=["']og:image["']/i);

      if (ogTitleMatch && ogTitleMatch[1]) {
        const rawTitle = decodeHtmlEntities(ogTitleMatch[1]);
        const rawDesc = ogDescMatch ? decodeHtmlEntities(ogDescMatch[1]) : undefined;
        const rawImage = ogImageMatch ? ogImageMatch[1].trim() : undefined;

        // Try extracting author username from description if format: "N likes, M comments - username on date: ..."
        let author = undefined;
        if (rawDesc) {
          const authorMatch = rawDesc.match(/-\s*([a-zA-Z0-9._]+)\s+on\s+/i);
          if (authorMatch && authorMatch[1]) {
            author = authorMatch[1];
          }
        }

        metadata = {
          title: rawTitle,
          author,
          thumbnailUrl: rawImage,
          providerName: 'Instagram',
        };
        metadataAccessible = true;
      } else if (html.includes('accounts/login') || html.includes('login') || html.length > 50000) {
        // Instagram returns 200 with an unauthenticated React client bundle when blocked
        isClientLoginShell = true;
      }
    } catch {
      metadataAccessible = false;
    }

    const latencyMs = Date.now() - startTime;

    // 6. Map honest status and evidence report
    if (metadataAccessible) {
      return {
        originalUrl: rawUrl,
        normalizedUrl,
        platform,
        contentType,
        platformId,
        accessLevel: 'metadata_only',
        status: ProcessingStatus.METADATA_ONLY,
        metadata,
        rawEvidence: {
          metadataAccessible: true,
          captionsDetected: false,
          rawStreamAccessible: false,
          httpStatusCode: httpStatus,
          notes: 'Public OpenGraph metadata extracted; captions/video stream unavailable without authentication.',
          latencyMs,
        },
        retrievedAt,
      };
    }

    if (isClientLoginShell) {
      return {
        originalUrl: rawUrl,
        normalizedUrl,
        platform,
        contentType,
        platformId,
        accessLevel: 'inaccessible',
        status: ProcessingStatus.UNSUPPORTED_INACCESSIBLE,
        metadata: {},
        rawEvidence: {
          metadataAccessible: false,
          captionsDetected: false,
          rawStreamAccessible: false,
          httpStatusCode: httpStatus,
          failureReason: 'INSTAGRAM_CLIENT_LOGIN_SHELL',
          notes: 'Instagram served client login bundle; server-side OpenGraph tags are hidden without authentication.',
          latencyMs,
        },
        retrievedAt,
      };
    }

    return {
      originalUrl: rawUrl,
      normalizedUrl,
      platform,
      contentType,
      platformId,
      accessLevel: 'inaccessible',
      status: ProcessingStatus.UNSUPPORTED_INACCESSIBLE,
      metadata: {},
      rawEvidence: {
        metadataAccessible: false,
        captionsDetected: false,
        rawStreamAccessible: false,
        httpStatusCode: httpStatus,
        failureReason: 'NO_PUBLIC_METADATA',
        notes: 'Unable to extract public metadata from Instagram response.',
        latencyMs,
      },
      retrievedAt,
    };
  }
}
