import { Platform, ContentType, ProcessingStatus } from '../../models/Item';
import {
  validateAndParseVideoUrl,
  isPrivateOrLoopbackHost,
} from '../../utils/urlValidator';
import {
  RetrievalAdapter,
  EvidenceReport,
  RetrievalMetadata,
  TranscriptData,
  TranscriptSegment,
  RawEvidence,
} from './types';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 SAVEit-Retrieval/1.0';

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB guard against memory exhaustion

export interface YouTubeAdapterOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Decodes standard XML and HTML entities found in subtitle streams.
 */
function decodeXmlEntities(input: string): string {
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
 * Parses raw timedtext XML into structured timestamped transcript segments.
 */
export function parseTimedTextXml(xml: string): TranscriptSegment[] {
  if (!xml || typeof xml !== 'string') {
    return [];
  }

  const segments: TranscriptSegment[] = [];

  // Format 1: Standard YouTube timedtext: <text start="1.5" dur="2.1">Segment text</text>
  const textRegex = /<text\s+[^>]*start="([0-9.]+)"[^>]*dur="([0-9.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;

  while ((match = textRegex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    const rawText = match[3].replace(/<[^>]+>/g, ''); // strip inline formatting tags like <font>
    const decodedText = decodeXmlEntities(rawText);

    if (decodedText.length > 0) {
      segments.push({
        start: isNaN(start) ? 0 : start,
        duration: isNaN(duration) ? 0 : duration,
        text: decodedText,
      });
    }
  }

  if (segments.length > 0) {
    return segments;
  }

  // Format 2: SRV3 / Format 3 paragraph: <p t="1500" d="2100">Segment text</p> (milliseconds)
  const pRegex = /<p\s+[^>]*t="([0-9]+)"[^>]*d="([0-9]+)"[^>]*>([\s\S]*?)<\/p>/gi;
  while ((match = pRegex.exec(xml)) !== null) {
    const tMs = parseInt(match[1], 10);
    const dMs = parseInt(match[2], 10);
    const rawText = match[3].replace(/<[^>]+>/g, '');
    const decodedText = decodeXmlEntities(rawText);

    if (decodedText.length > 0) {
      segments.push({
        start: isNaN(tMs) ? 0 : tMs / 1000,
        duration: isNaN(dMs) ? 0 : dMs / 1000,
        text: decodedText,
      });
    }
  }

  return segments;
}

/**
 * Modular retrieval adapter for YouTube Shorts.
 *
 * Implements layered zero-auth retrieval:
 * 1. oEmbed for instant rate-limit resilient public metadata.
 * 2. Separate caption-track detection vs raw transcript extraction.
 * 3. Graceful degradation to metadata_only or unsupported_inaccessible.
 * 4. Strict hop-by-hop SSRF validation.
 */
export class YouTubeAdapter implements RetrievalAdapter {
  readonly platform = Platform.YOUTUBE;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: YouTubeAdapterOptions = {}) {
    this.fetchFn = options.fetchFn || fetch;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fast synchronous check whether this adapter can handle the provided URL.
   */
  canHandle(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }
    const validation = validateAndParseVideoUrl(url);
    return validation.isValid && validation.platform === Platform.YOUTUBE;
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
            Accept: 'application/json,text/html,application/xml,*/*;q=0.8',
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
   * Extracts evidence from a public YouTube Short URL.
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
        platform: Platform.YOUTUBE,
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

    // 2. Query YouTube oEmbed for zero-auth public metadata
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`;
    const oembedResult = await this.safeFetch(oEmbedUrl);

    if (oembedResult.error) {
      const isSsrf = oembedResult.error.includes('SSRF');
      const isTimeout = oembedResult.error.includes('TIMEOUT');

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
          failureReason: oembedResult.error,
          notes: `Failed to fetch YouTube oEmbed: ${oembedResult.error}`,
          latencyMs: Date.now() - startTime,
        },
        retrievedAt,
      };
    }

    const oembedStatus = oembedResult.status || 0;

    // Handle deleted, private, or non-existent videos
    if (oembedStatus === 404 || oembedStatus === 400 || oembedStatus === 401 || oembedStatus === 403) {
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
          httpStatusCode: oembedStatus,
          failureReason: `HTTP_${oembedStatus}_UNAVAILABLE`,
          notes: `YouTube oEmbed returned ${oembedStatus}. Video may be private, deleted, or invalid.`,
          latencyMs: Date.now() - startTime,
        },
        retrievedAt,
      };
    }

    // Parse oEmbed payload
    let metadata: RetrievalMetadata = {};
    let metadataAccessible = false;

    try {
      const oembedText = await this.safeReadText(oembedResult.response!);
      const json = JSON.parse(oembedText) as {
        title?: string;
        author_name?: string;
        author_url?: string;
        thumbnail_url?: string;
        provider_name?: string;
      };

      if (json && typeof json === 'object') {
        metadata = {
          title: json.title?.trim(),
          author: json.author_name?.trim(),
          authorUrl: json.author_url?.trim(),
          thumbnailUrl: json.thumbnail_url?.trim(),
          providerName: json.provider_name?.trim() || 'YouTube',
        };
        metadataAccessible = Boolean(metadata.title);
      }
    } catch {
      // Malformed oEmbed JSON
      metadataAccessible = false;
    }

    // 3. Investigate caption-track availability & attempt transcript extraction
    const rawEvidence: RawEvidence = {
      metadataAccessible,
      captionsDetected: false,
      captionTracksCount: 0,
      captionLanguages: [],
      rawStreamAccessible: false,
      httpStatusCode: oembedStatus,
      latencyMs: Date.now() - startTime,
    };

    let transcript: TranscriptData | undefined;

    if (platformId) {
      try {
        const watchUrl = `https://www.youtube.com/watch?v=${platformId}`;
        const watchResult = await this.safeFetch(watchUrl);

        if (watchResult.response && watchResult.response.status === 200) {
          const watchHtml = await this.safeReadText(watchResult.response);
          const tracksMatch = watchHtml.match(/"captionTracks":\s*(\[.*?\])/);

          if (tracksMatch && tracksMatch[1]) {
            const tracks = JSON.parse(tracksMatch[1]) as Array<{
              name?: { simpleText?: string };
              languageCode?: string;
              baseUrl?: string;
            }>;

            if (Array.isArray(tracks) && tracks.length > 0) {
              rawEvidence.captionsDetected = true;
              rawEvidence.captionTracksCount = tracks.length;
              rawEvidence.captionLanguages = tracks
                .map((t) => t.name?.simpleText || t.languageCode || '')
                .filter(Boolean)
                .slice(0, 10);

              // Select best candidate track (English preferred, else first track)
              const selectedTrack =
                tracks.find((t) => t.languageCode?.toLowerCase().startsWith('en')) || tracks[0];

              if (selectedTrack?.baseUrl) {
                const timedResult = await this.safeFetch(selectedTrack.baseUrl);

                if (timedResult.response && timedResult.response.status === 200) {
                  const timedXml = await this.safeReadText(timedResult.response);

                  if (timedXml.length > 0 && (timedXml.includes('<text') || timedXml.includes('<p '))) {
                    const segments = parseTimedTextXml(timedXml);

                    if (segments.length > 0) {
                      const fullText = segments.map((s) => s.text).join(' ');
                      rawEvidence.rawStreamAccessible = true;

                      transcript = {
                        text: fullText,
                        segments,
                        language: selectedTrack.languageCode || 'en',
                        source: 'timedtext',
                        trackName: selectedTrack.name?.simpleText || 'Captions',
                      };
                    }
                  }
                }
              }

              if (!rawEvidence.rawStreamAccessible) {
                rawEvidence.notes = `Caption tracks detected (${tracks.length} tracks), but raw timedtext stream was empty or signature-protected.`;
              }
            }
          }
        }
      } catch (err: unknown) {
        // Non-fatal caption probe failure
        rawEvidence.notes = `Caption probe error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    rawEvidence.latencyMs = Date.now() - startTime;

    // 4. Map honest access level and status
    let accessLevel: EvidenceReport['accessLevel'] = 'inaccessible';
    let status: ProcessingStatus = ProcessingStatus.UNSUPPORTED_INACCESSIBLE;

    if (transcript && transcript.text.length > 0) {
      if (metadataAccessible) {
        accessLevel = 'full';
        status = ProcessingStatus.PARTIALLY_ANALYZED; // ready for downstream text AI summarization
      } else {
        accessLevel = 'transcript_only';
        status = ProcessingStatus.PARTIALLY_ANALYZED;
      }
    } else if (metadataAccessible) {
      accessLevel = 'metadata_only';
      status = ProcessingStatus.METADATA_ONLY;
      if (!rawEvidence.notes) {
        rawEvidence.notes = 'Public metadata retrieved successfully; captions unavailable or protected.';
      }
    } else {
      accessLevel = 'inaccessible';
      status = ProcessingStatus.UNSUPPORTED_INACCESSIBLE;
      rawEvidence.failureReason = 'NO_DATA_RETRIEVABLE';
    }

    return {
      originalUrl: rawUrl,
      normalizedUrl,
      platform,
      contentType,
      platformId,
      accessLevel,
      status,
      metadata,
      transcript,
      rawEvidence,
      retrievedAt,
    };
  }
}
