import {
  SttProvider,
  SttOptions,
  SttResult,
  SttProviderError,
  TranscriptSegment,
} from './types';

/**
 * Deterministic Mock STT Provider for offline CI and test suites.
 */
export class MockSttProvider implements SttProvider {
  readonly name = 'mock';
  private customResponse?: Partial<SttResult>;
  private shouldFailWith?: SttProviderError;

  constructor(options?: { customResponse?: Partial<SttResult>; shouldFailWith?: SttProviderError }) {
    this.customResponse = options?.customResponse;
    this.shouldFailWith = options?.shouldFailWith;
  }

  async transcribe(audioBuffer: Buffer, options?: SttOptions): Promise<SttResult> {
    if (this.shouldFailWith) {
      throw this.shouldFailWith;
    }

    if (audioBuffer.length === 0) {
      throw new SttProviderError('Audio buffer cannot be empty', 'INVALID_AUDIO');
    }

    if (this.customResponse?.text) {
      return {
        text: this.customResponse.text,
        segments: this.customResponse.segments || [
          { start: 0.0, duration: 2.0, text: this.customResponse.text },
        ],
        language: this.customResponse.language || 'en',
        durationSeconds: this.customResponse.durationSeconds || 2.0,
        providerName: this.name,
      };
    }

    return {
      text: 'Principled software engineers build modular software with clean architecture and clear interfaces.',
      segments: [
        {
          start: 0.0,
          duration: 3.5,
          text: 'Principled software engineers build modular software with clean architecture and clear interfaces.',
        },
      ],
      language: options?.language || 'en',
      durationSeconds: 3.5,
      providerName: this.name,
    };
  }
}

/**
 * Groq Whisper STT Provider using whisper-large-v3-turbo.
 *
 * Provides sub-second transcription with word/segment level timestamps on the free tier.
 */
export class GroqWhisperSttProvider implements SttProvider {
  readonly name = 'groq-whisper';
  private apiKey?: string;
  private model: string;
  private endpoint: string;

  constructor(options?: { apiKey?: string; model?: string; endpoint?: string }) {
    this.apiKey = options?.apiKey || process.env.GROQ_API_KEY;
    this.model = options?.model || 'whisper-large-v3-turbo';
    this.endpoint = options?.endpoint || 'https://api.groq.com/openai/v1/audio/transcriptions';
  }

  async transcribe(audioBuffer: Buffer, options?: SttOptions): Promise<SttResult> {
    if (!this.apiKey) {
      throw new SttProviderError(
        'GROQ_API_KEY is not configured in server environment.',
        'MISSING_API_KEY'
      );
    }

    if (audioBuffer.length === 0) {
      throw new SttProviderError('Audio buffer cannot be empty.', 'INVALID_AUDIO');
    }

    const timeoutMs = options?.timeoutMs || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const mime = options?.mimeType || 'audio/wav';
      const extension = mime.includes('mp3') ? 'mp3' : mime.includes('m4a') ? 'm4a' : 'wav';
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: mime });

      const formData = new FormData();
      formData.append('file', blob, `audio.${extension}`);
      formData.append('model', this.model);
      formData.append('response_format', 'verbose_json');
      if (options?.language) formData.append('language', options.language);
      if (options?.prompt) formData.append('prompt', options.prompt);
      if (options?.temperature !== undefined) formData.append('temperature', options.temperature.toString());

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new SttProviderError(
            'Groq STT quota limit reached (HTTP 429).',
            'QUOTA_EXHAUSTED',
            429
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new SttProviderError(
            'Invalid or unauthorized Groq API key.',
            'MISSING_API_KEY',
            response.status
          );
        }
        throw new SttProviderError(
          `Groq STT API returned HTTP ${response.status}: ${errorText}`,
          'NETWORK_ERROR',
          response.status
        );
      }

      const rawData = await response.json();
      const text = typeof rawData.text === 'string' ? rawData.text.trim() : '';

      const segments: TranscriptSegment[] = Array.isArray(rawData.segments)
        ? rawData.segments.map((s: any) => {
            const start = typeof s.start === 'number' ? Math.max(0, s.start) : 0;
            const end = typeof s.end === 'number' ? Math.max(start, s.end) : start;
            const duration = parseFloat((end - start).toFixed(2));
            return {
              start: parseFloat(start.toFixed(2)),
              duration,
              text: typeof s.text === 'string' ? s.text.trim() : '',
            };
          })
        : [{ start: 0, duration: typeof rawData.duration === 'number' ? rawData.duration : 0, text }];

      return {
        text,
        segments,
        language: typeof rawData.language === 'string' ? rawData.language : options?.language,
        durationSeconds: typeof rawData.duration === 'number' ? rawData.duration : undefined,
        providerName: this.name,
      };
    } catch (err: any) {
      if (err instanceof SttProviderError) throw err;
      if (err.name === 'AbortError') {
        throw new SttProviderError(`Groq STT request timed out after ${timeoutMs}ms.`, 'TIMEOUT');
      }
      throw new SttProviderError(`Groq STT failed: ${err.message}`, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Google Gemini STT Provider using inline multimodal audio on the free tier.
 */
export class GeminiSttProvider implements SttProvider {
  readonly name = 'gemini-audio';
  private apiKey?: string;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey || process.env.GEMINI_API_KEY;
    this.model = options?.model || 'gemini-3.5-flash-lite';
  }

  async transcribe(audioBuffer: Buffer, options?: SttOptions): Promise<SttResult> {
    if (!this.apiKey) {
      throw new SttProviderError(
        'GEMINI_API_KEY is not configured in server environment.',
        'MISSING_API_KEY'
      );
    }

    if (audioBuffer.length === 0) {
      throw new SttProviderError('Audio buffer cannot be empty.', 'INVALID_AUDIO');
    }

    const timeoutMs = options?.timeoutMs || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const mime = options?.mimeType || 'audio/wav';
      const base64Audio = audioBuffer.toString('base64');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

      const promptText =
        'You are an expert audio transcription system. Transcribe all spoken audio accurately. Output a JSON object with this exact schema: {"transcript": string, "segments": [{"start": number, "end": number, "text": string}]}';

      const payload = {
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: mime,
                  data: base64Audio,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: options?.temperature !== undefined ? options.temperature : 0.0,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new SttProviderError(
            'Gemini free tier quota limit reached (HTTP 429).',
            'QUOTA_EXHAUSTED',
            429
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new SttProviderError(
            'Invalid or unauthorized Gemini API key.',
            'MISSING_API_KEY',
            response.status
          );
        }
        throw new SttProviderError(
          `Gemini API returned HTTP ${response.status}: ${errorText}`,
          'NETWORK_ERROR',
          response.status
        );
      }

      const rawData = await response.json();
      const candidateText = rawData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!candidateText || typeof candidateText !== 'string') {
        throw new SttProviderError('Gemini API returned an empty candidate response.', 'INVALID_AUDIO');
      }

      const parsed = JSON.parse(
        candidateText.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      );

      const transcript = typeof parsed.transcript === 'string' ? parsed.transcript.trim() : '';
      const segments: TranscriptSegment[] = Array.isArray(parsed.segments)
        ? parsed.segments.map((s: any) => {
            const start = typeof s.start === 'number' ? Math.max(0, s.start) : 0;
            const end = typeof s.end === 'number' ? Math.max(start, s.end) : start;
            return {
              start: parseFloat(start.toFixed(2)),
              duration: parseFloat((end - start).toFixed(2)),
              text: typeof s.text === 'string' ? s.text.trim() : '',
            };
          })
        : [{ start: 0, duration: 0, text: transcript }];

      return {
        text: transcript,
        segments,
        providerName: this.name,
      };
    } catch (err: any) {
      if (err instanceof SttProviderError) throw err;
      if (err.name === 'AbortError') {
        throw new SttProviderError(`Gemini STT request timed out after ${timeoutMs}ms.`, 'TIMEOUT');
      }
      throw new SttProviderError(`Gemini STT failed: ${err.message}`, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Returns the default STT provider based on configuration.
 *
 * Prefers Groq Whisper if GROQ_API_KEY is present (specialized, fast Whisper Large),
 * followed by Gemini multimodal audio, falling back to MockSttProvider if no keys exist.
 */
export function getDefaultSttProvider(): SttProvider {
  const preferred = (process.env.STT_PROVIDER || '').toLowerCase().trim();
  if (preferred === 'groq' && process.env.GROQ_API_KEY) {
    return new GroqWhisperSttProvider();
  }
  if (preferred === 'gemini' && process.env.GEMINI_API_KEY) {
    return new GeminiSttProvider();
  }
  if (process.env.GROQ_API_KEY) {
    return new GroqWhisperSttProvider();
  }
  if (process.env.GEMINI_API_KEY) {
    return new GeminiSttProvider();
  }
  return new MockSttProvider();
}
