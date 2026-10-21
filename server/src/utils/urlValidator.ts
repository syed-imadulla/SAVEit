import { Platform, ContentType } from '../models/Item';

export interface ValidatedUrlResult {
  isValid: true;
  originalUrl: string;
  normalizedUrl: string;
  platform: Platform;
  contentType: ContentType;
  platformId?: string;
}

export interface InvalidUrlResult {
  isValid: false;
  error: string;
}

export type UrlValidationResult = ValidatedUrlResult | InvalidUrlResult;

// Private/loopback IPv4 and IPv6 patterns to defend against SSRF
const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/, // Loopback 127.0.0.0/8
  /^10\.\d+\.\d+\.\d+$/, // RFC 1918 Private Class A
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // RFC 1918 Private Class B (172.16.0.0 - 172.31.255.255)
  /^192\.168\.\d+\.\d+$/, // RFC 1918 Private Class C
  /^169\.254\.\d+\.\d+$/, // Link-local / Cloud metadata (e.g., 169.254.169.254)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/, // Carrier-grade NAT (100.64.0.0/10)
  /^0\.0\.0\.0$/,
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 Unique Local Address
  /^fe80:/i, // IPv6 Link-Local
];

// Allowed platform domain suffixes
const ALLOWED_INSTAGRAM_HOSTS = ['instagram.com', 'instagr.am'];
const ALLOWED_YOUTUBE_HOSTS = ['youtube.com', 'youtu.be'];

/**
 * Checks whether a given hostname is an internal, private, or loopback network address.
 */
export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().trim();

  // Strip brackets from IPv6 hostnames like [::1]
  const cleanHost = normalized.replace(/^\[|\]$/g, '');

  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(cleanHost)) {
      return true;
    }
  }

  // Check for decimal integer IP representations (e.g. 2130706433 = 127.0.0.1)
  if (/^\d+$/.test(cleanHost)) {
    return true;
  }

  return false;
}

/**
 * Validates, checks SSRF safety, and extracts platform metadata from a submitted URL.
 */
export function validateAndParseVideoUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'URL must be a non-empty string' };
  }

  const trimmed = rawUrl.trim();

  // Basic URL constructor parse
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }

  // Enforce HTTP / HTTPS protocol
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      isValid: false,
      error: `Unsupported protocol: "${parsed.protocol}". Only HTTP and HTTPS are permitted.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // SSRF defense: block private, loopback, and metadata endpoints
  if (isPrivateOrLoopbackHost(hostname)) {
    return {
      isValid: false,
      error: 'Access to private or internal network addresses is blocked for security.',
    };
  }

  // Check Instagram
  const isInstagram = ALLOWED_INSTAGRAM_HOSTS.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`)
  );

  if (isInstagram) {
    return parseInstagramUrl(parsed, trimmed);
  }

  // Check YouTube
  const isYouTube = ALLOWED_YOUTUBE_HOSTS.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`)
  );

  if (isYouTube) {
    return parseYouTubeUrl(parsed, trimmed);
  }

  return {
    isValid: false,
    error:
      'Unsupported platform. SAVEit currently supports Instagram Reels and YouTube Shorts URLs.',
  };
}

/**
 * Parses and canonicalizes an Instagram URL.
 */
function parseInstagramUrl(parsed: URL, originalUrl: string): UrlValidationResult {
  const pathname = parsed.pathname.replace(/\/+$/, ''); // Remove trailing slashes
  const parts = pathname.split('/').filter(Boolean);

  // Expected patterns:
  // /reel/:id
  // /reels/:id
  // /p/:id (post, often video reel)
  if (parts.length >= 2) {
    const section = parts[0].toLowerCase();
    const id = parts[1];

    if (['reel', 'reels', 'p'].includes(section)) {
      const contentType = section.startsWith('reel') ? ContentType.REEL : ContentType.REEL;
      const normalizedUrl = `https://www.instagram.com/reel/${id}/`;

      return {
        isValid: true,
        originalUrl,
        normalizedUrl,
        platform: Platform.INSTAGRAM,
        contentType,
        platformId: id,
      };
    }
  }

  return {
    isValid: false,
    error: 'Invalid Instagram URL. Please provide a link to a specific Reel (e.g. https://www.instagram.com/reel/ID/).',
  };
}

/**
 * Parses and canonicalizes a YouTube URL.
 */
function parseYouTubeUrl(parsed: URL, originalUrl: string): UrlValidationResult {
  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.replace(/\/+$/, '');
  const parts = pathname.split('/').filter(Boolean);

  // Case 1: youtu.be/:id
  if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
    if (parts.length >= 1 && parts[0]) {
      const id = parts[0];
      return {
        isValid: true,
        originalUrl,
        normalizedUrl: `https://www.youtube.com/shorts/${id}`,
        platform: Platform.YOUTUBE,
        contentType: ContentType.SHORT,
        platformId: id,
      };
    }
  }

  // Case 2: youtube.com/shorts/:id
  if (parts.length >= 2 && parts[0].toLowerCase() === 'shorts') {
    const id = parts[1];
    return {
      isValid: true,
      originalUrl,
      normalizedUrl: `https://www.youtube.com/shorts/${id}`,
      platform: Platform.YOUTUBE,
      contentType: ContentType.SHORT,
      platformId: id,
    };
  }

  // Case 3: youtube.com/watch?v=:id
  if (pathname.toLowerCase() === '/watch') {
    const id = parsed.searchParams.get('v');
    if (id) {
      return {
        isValid: true,
        originalUrl,
        normalizedUrl: `https://www.youtube.com/watch?v=${id}`,
        platform: Platform.YOUTUBE,
        contentType: ContentType.SHORT,
        platformId: id,
      };
    }
  }

  return {
    isValid: false,
    error: 'Invalid YouTube URL. Please provide a link to a YouTube Short or video (e.g. https://www.youtube.com/shorts/ID).',
  };
}
