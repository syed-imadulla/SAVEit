import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MockSttProvider,
  GroqWhisperSttProvider,
  GeminiSttProvider,
  getDefaultSttProvider,
  SttProviderError,
} from '../src/services/multimodal';

describe('Speech-to-Text (STT) Providers', () => {
  const dummyAudio = Buffer.from('RIFF....WAVEfmt ....data....');

  describe('MockSttProvider', () => {
    it('returns deterministic transcription with timestamped segments', async () => {
      const provider = new MockSttProvider();
      const result = await provider.transcribe(dummyAudio);

      expect(result.providerName).toBe('mock');
      expect(result.text).toContain('Principled software engineers');
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].start).toBe(0.0);
      expect(result.segments[0].duration).toBe(3.5);
      expect(result.segments[0].text).toContain('Principled software engineers');
    });

    it('rejects empty audio buffer with INVALID_AUDIO error', async () => {
      const provider = new MockSttProvider();
      await expect(provider.transcribe(Buffer.alloc(0))).rejects.toThrowError(SttProviderError);
      await expect(provider.transcribe(Buffer.alloc(0))).rejects.toMatchObject({
        code: 'INVALID_AUDIO',
      });
    });

    it('supports custom mock responses for specific test scenarios', async () => {
      const provider = new MockSttProvider({
        customResponse: {
          text: 'Custom speech sample',
          segments: [{ start: 1.0, duration: 4.0, text: 'Custom speech sample' }],
        },
      });

      const result = await provider.transcribe(dummyAudio);
      expect(result.text).toBe('Custom speech sample');
      expect(result.segments[0].start).toBe(1.0);
      expect(result.segments[0].duration).toBe(4.0);
    });
  });

  describe('GroqWhisperSttProvider', () => {
    it('throws MISSING_API_KEY when initialized without an API key', async () => {
      const provider = new GroqWhisperSttProvider({ apiKey: '' });
      await expect(provider.transcribe(dummyAudio)).rejects.toThrowError(SttProviderError);
      await expect(provider.transcribe(dummyAudio)).rejects.toMatchObject({
        code: 'MISSING_API_KEY',
      });
    });

    it('parses verbose_json segments with start, duration, and text correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: 'Containerize with Docker and run with Kubernetes.',
          language: 'en',
          duration: 4.5,
          segments: [
            { id: 0, start: 0.0, end: 2.1, text: 'Containerize with Docker' },
            { id: 1, start: 2.1, end: 4.5, text: 'and run with Kubernetes.' },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = new GroqWhisperSttProvider({ apiKey: 'gsk_mock_test_key' });
      const result = await provider.transcribe(dummyAudio);

      expect(result.providerName).toBe('groq-whisper');
      expect(result.text).toBe('Containerize with Docker and run with Kubernetes.');
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].start).toBe(0.0);
      expect(result.segments[0].duration).toBe(2.1);
      expect(result.segments[1].start).toBe(2.1);
      expect(result.segments[1].duration).toBe(2.4);

      vi.unstubAllGlobals();
    });

    it('handles HTTP 429 quota exhaustion gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded for model whisper-large-v3-turbo',
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = new GroqWhisperSttProvider({ apiKey: 'gsk_mock_test_key' });
      await expect(provider.transcribe(dummyAudio)).rejects.toMatchObject({
        code: 'QUOTA_EXHAUSTED',
        statusCode: 429,
      });

      vi.unstubAllGlobals();
    });
  });

  describe('GeminiSttProvider', () => {
    it('throws MISSING_API_KEY when initialized without an API key', async () => {
      const provider = new GeminiSttProvider({ apiKey: '' });
      await expect(provider.transcribe(dummyAudio)).rejects.toMatchObject({
        code: 'MISSING_API_KEY',
      });
    });

    it('parses structured JSON output with segments from candidate response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      transcript: 'Hello world from audio.',
                      segments: [{ start: 0.5, end: 2.5, text: 'Hello world from audio.' }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = new GeminiSttProvider({ apiKey: 'gemini_mock_test_key' });
      const result = await provider.transcribe(dummyAudio);

      expect(result.providerName).toBe('gemini-audio');
      expect(result.text).toBe('Hello world from audio.');
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].start).toBe(0.5);
      expect(result.segments[0].duration).toBe(2.0);

      vi.unstubAllGlobals();
    });

    it('handles HTTP 429 quota exhaustion gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Resource has been exhausted',
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = new GeminiSttProvider({ apiKey: 'gemini_mock_test_key' });
      await expect(provider.transcribe(dummyAudio)).rejects.toMatchObject({
        code: 'QUOTA_EXHAUSTED',
        statusCode: 429,
      });

      vi.unstubAllGlobals();
    });
  });

  describe('getDefaultSttProvider factory', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.GROQ_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.STT_PROVIDER;
    });

    it('falls back to MockSttProvider when no API keys are configured', () => {
      const provider = getDefaultSttProvider();
      expect(provider.name).toBe('mock');
    });

    it('selects GroqWhisperSttProvider when GROQ_API_KEY is present', () => {
      process.env.GROQ_API_KEY = 'gsk_test';
      const provider = getDefaultSttProvider();
      expect(provider.name).toBe('groq-whisper');
    });

    it('selects GeminiSttProvider when GEMINI_API_KEY is present and GROQ is absent', () => {
      process.env.GEMINI_API_KEY = 'gemini_test';
      const provider = getDefaultSttProvider();
      expect(provider.name).toBe('gemini-audio');
    });
  });
});
