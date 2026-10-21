import { describe, it, expect } from 'vitest';
import {
  validateAndParseVideoUrl,
  isPrivateOrLoopbackHost,
} from '../src/utils/urlValidator';
import { Platform, ContentType } from '../src/models/Item';

describe('isPrivateOrLoopbackHost', () => {
  it('detects localhost and standard loopbacks', () => {
    expect(isPrivateOrLoopbackHost('localhost')).toBe(true);
    expect(isPrivateOrLoopbackHost('127.0.0.1')).toBe(true);
    expect(isPrivateOrLoopbackHost('127.10.20.30')).toBe(true);
    expect(isPrivateOrLoopbackHost('0.0.0.0')).toBe(true);
    expect(isPrivateOrLoopbackHost('::1')).toBe(true);
    expect(isPrivateOrLoopbackHost('[::1]')).toBe(true);
  });

  it('detects RFC 1918 private IP ranges', () => {
    expect(isPrivateOrLoopbackHost('10.0.0.1')).toBe(true);
    expect(isPrivateOrLoopbackHost('172.16.0.1')).toBe(true);
    expect(isPrivateOrLoopbackHost('172.31.255.255')).toBe(true);
    expect(isPrivateOrLoopbackHost('192.168.1.100')).toBe(true);
  });

  it('detects cloud metadata link-local address', () => {
    expect(isPrivateOrLoopbackHost('169.254.169.254')).toBe(true);
  });

  it('permits public domain names', () => {
    expect(isPrivateOrLoopbackHost('instagram.com')).toBe(false);
    expect(isPrivateOrLoopbackHost('www.youtube.com')).toBe(false);
    expect(isPrivateOrLoopbackHost('github.com')).toBe(false);
  });
});

describe('validateAndParseVideoUrl', () => {
  it('validates and normalizes Instagram Reel URLs with tracking queries', () => {
    const input = 'https://www.instagram.com/reel/C8q_123xyz/?igsh=NzBmMjdhZWRiYQ==';
    const result = validateAndParseVideoUrl(input);

    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.platform).toBe(Platform.INSTAGRAM);
      expect(result.contentType).toBe(ContentType.REEL);
      expect(result.platformId).toBe('C8q_123xyz');
      expect(result.normalizedUrl).toBe('https://www.instagram.com/reel/C8q_123xyz/');
    }
  });

  it('validates Instagram post URLs', () => {
    const input = 'https://instagram.com/p/DF12345abc/';
    const result = validateAndParseVideoUrl(input);

    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.platform).toBe(Platform.INSTAGRAM);
      expect(result.platformId).toBe('DF12345abc');
    }
  });

  it('validates and normalizes YouTube Shorts URLs', () => {
    const input = 'https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share&si=abc';
    const result = validateAndParseVideoUrl(input);

    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.platform).toBe(Platform.YOUTUBE);
      expect(result.contentType).toBe(ContentType.SHORT);
      expect(result.platformId).toBe('dQw4w9WgXcQ');
      expect(result.normalizedUrl).toBe('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    }
  });

  it('validates youtu.be shortlinks', () => {
    const input = 'https://youtu.be/dQw4w9WgXcQ';
    const result = validateAndParseVideoUrl(input);

    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.platform).toBe(Platform.YOUTUBE);
      expect(result.platformId).toBe('dQw4w9WgXcQ');
      expect(result.normalizedUrl).toBe('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    }
  });

  it('validates youtube.com/watch URLs', () => {
    const input = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const result = validateAndParseVideoUrl(input);

    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.platform).toBe(Platform.YOUTUBE);
      expect(result.platformId).toBe('dQw4w9WgXcQ');
    }
  });

  it('blocks SSRF attempts targeting private IPs or localhost', () => {
    const targets = [
      'http://localhost:3000/api',
      'http://127.0.0.1:8080/admin',
      'http://10.0.0.5/secret',
      'http://192.168.1.1/router',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]:5000/',
    ];

    for (const target of targets) {
      const result = validateAndParseVideoUrl(target);
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toContain('security');
      }
    }
  });

  it('rejects unsupported protocols', () => {
    const result = validateAndParseVideoUrl('ftp://www.youtube.com/shorts/123');
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.error).toContain('Unsupported protocol');
    }
  });

  it('rejects unsupported external platforms', () => {
    const result = validateAndParseVideoUrl('https://tiktok.com/@user/video/12345');
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.error).toContain('Unsupported platform');
    }
  });

  it('rejects malformed inputs and empty strings', () => {
    expect(validateAndParseVideoUrl('').isValid).toBe(false);
    expect(validateAndParseVideoUrl('not-a-url').isValid).toBe(false);
  });
});
