import { describe, it, expect, vi } from 'vitest';
import {
  MockLlmProvider,
  GeminiLlmProvider,
  GroqLlmProvider,
  getDefaultLlmProvider,
} from '../src/services/intelligence/llmProvider';
import { LlmPromptContext } from '../src/services/intelligence/types';

describe('MockLlmProvider', () => {
  const sampleContext: LlmPromptContext = {
    title: 'Docker in 60 Seconds',
    platform: 'youtube',
    text: 'Docker lets you build, run, and share containerized applications.',
  };

  it('generates deterministic structured knowledge from context', async () => {
    const provider = new MockLlmProvider();
    const result = await provider.generateStructured(sampleContext);

    expect(result.summary).toContain('Docker in 60 Seconds');
    expect(result.keyPoints.length).toBeGreaterThanOrEqual(3);
    expect(result.tags).toContain('docker');
    expect(result.tags).toContain('youtube');
    expect(result.resources.length).toBeGreaterThanOrEqual(1);
  });

  it('allows injecting custom structured responses', async () => {
    const provider = new MockLlmProvider();
    provider.setCustomResponse({
      summary: 'Custom summary',
      keyPoints: ['Custom point 1'],
      tags: ['custom'],
      resources: [],
    });

    const result = await provider.generateStructured(sampleContext);
    expect(result.summary).toBe('Custom summary');
    expect(result.keyPoints).toEqual(['Custom point 1']);
  });

  it('simulates failures when configured', async () => {
    const provider = new MockLlmProvider({ shouldFail: true, failureError: 'Simulated API Quota Error' });
    await expect(provider.generateStructured(sampleContext)).rejects.toThrow('Simulated API Quota Error');
  });
});

describe('GeminiLlmProvider', () => {
  const sampleContext: LlmPromptContext = {
    title: 'FastAPI Tutorial',
    author: 'Tech Guy',
    platform: 'youtube',
    text: 'Today we use FastAPI to build a performant Python REST API with Pydantic.',
  };

  it('throws an error if GEMINI_API_KEY is missing with MISSING_API_KEY code', async () => {
    const provider = new GeminiLlmProvider({ apiKey: '' });
    try {
      await provider.generateStructured(sampleContext);
      expect.fail('Should have thrown LlmProviderError');
    } catch (err: any) {
      expect(err.code).toBe('MISSING_API_KEY');
      expect(err.message).toContain('GEMINI_API_KEY is not configured');
    }
  });

  it('formats request correctly and parses valid JSON response', async () => {
    const mockJson = {
      summary: 'Build high-performance REST APIs using FastAPI and Pydantic.',
      keyPoints: [
        'Initialize FastAPI app',
        'Define typed models with Pydantic',
        'Automatic OpenAPI interactive docs',
      ],
      tags: ['fastapi', 'python', 'api'],
      resources: [
        {
          title: 'FastAPI',
          url: 'https://fastapi.tiangolo.com',
          type: 'tool',
          status: 'unverified_mention',
          description: 'Python web framework',
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(mockJson) }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = new GeminiLlmProvider({
      apiKey: 'test-fake-key',
      fetchFn: mockFetch,
    });

    const result = await provider.generateStructured(sampleContext);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('https://generativelanguage.googleapis.com');
    expect(calledUrl).toContain('key=test-fake-key');

    expect(result.summary).toBe('Build high-performance REST APIs using FastAPI and Pydantic.');
    expect(result.keyPoints).toHaveLength(3);
    expect(result.tags).toEqual(['fastapi', 'python', 'api']);
    expect(result.resources[0].title).toBe('FastAPI');
  });

  it('cleans markdown code fences before parsing JSON', async () => {
    const fencedOutput = `\`\`\`json
{
  "summary": "Fenced summary output",
  "keyPoints": ["Point 1"],
  "tags": ["FENCED", "TEST"],
  "resources": []
}
\`\`\``;

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: fencedOutput }],
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const provider = new GeminiLlmProvider({
      apiKey: 'test-fake-key',
      fetchFn: mockFetch,
    });

    const result = await provider.generateStructured(sampleContext);
    expect(result.summary).toBe('Fenced summary output');
    expect(result.tags).toEqual(['fenced', 'test']);
  });

  it('handles HTTP 429 quota exhaustion with QUOTA_EXHAUSTED code', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('Resource has been exhausted (quota limit).', { status: 429 })
    );

    const provider = new GeminiLlmProvider({
      apiKey: 'test-fake-key',
      fetchFn: mockFetch,
    });

    try {
      await provider.generateStructured(sampleContext);
      expect.fail('Should have thrown LlmProviderError');
    } catch (err: any) {
      expect(err.code).toBe('QUOTA_EXHAUSTED');
      expect(err.status).toBe(429);
      expect(err.message).toContain('quota limit reached');
    }
  });

  it('handles invalid API key HTTP 403 with INVALID_API_KEY code', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('API key not valid. Please pass a valid API key.', { status: 403 })
    );

    const provider = new GeminiLlmProvider({
      apiKey: 'test-invalid-key',
      fetchFn: mockFetch,
    });

    try {
      await provider.generateStructured(sampleContext);
      expect.fail('Should have thrown LlmProviderError');
    } catch (err: any) {
      expect(err.code).toBe('INVALID_API_KEY');
      expect(err.status).toBe(403);
    }
  });
});

describe('GroqLlmProvider', () => {
  const sampleContext: LlmPromptContext = {
    title: 'TypeScript Generics in 60s',
    platform: 'youtube',
    text: 'Generics allow you to create reusable code components that work with multiple types.',
  };

  it('throws an error if GROQ_API_KEY is missing with MISSING_API_KEY code', async () => {
    const provider = new GroqLlmProvider({ apiKey: '' });
    try {
      await provider.generateStructured(sampleContext);
      expect.fail('Should have thrown LlmProviderError');
    } catch (err: any) {
      expect(err.code).toBe('MISSING_API_KEY');
      expect(err.message).toContain('GROQ_API_KEY is not configured');
    }
  });

  it('formats request to OpenAI-compatible endpoint and parses JSON content', async () => {
    const mockJson = {
      summary: 'TypeScript generics enable reusable, type-safe data structures.',
      keyPoints: ['Generics act as type variables', 'Ensure compile-time safety'],
      tags: ['typescript', 'generics'],
      resources: [],
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(mockJson) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = new GroqLlmProvider({
      apiKey: 'gsk-test-key',
      fetchFn: mockFetch,
    });

    const result = await provider.generateStructured(sampleContext);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toBe('https://api.groq.com/openai/v1/chat/completions');

    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers['Authorization']).toBe('Bearer gsk-test-key');

    expect(result.summary).toBe('TypeScript generics enable reusable, type-safe data structures.');
    expect(result.tags).toEqual(['typescript', 'generics']);
  });

  it('handles HTTP 429 quota exhaustion with QUOTA_EXHAUSTED code', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('Rate limit reached', { status: 429 })
    );

    const provider = new GroqLlmProvider({
      apiKey: 'gsk-test-key',
      fetchFn: mockFetch,
    });

    try {
      await provider.generateStructured(sampleContext);
      expect.fail('Should have thrown LlmProviderError');
    } catch (err: any) {
      expect(err.code).toBe('QUOTA_EXHAUSTED');
      expect(err.status).toBe(429);
    }
  });
});

describe('getDefaultLlmProvider', () => {
  it('returns MockLlmProvider when no API keys are configured', () => {
    const origGemini = process.env.GEMINI_API_KEY;
    const origGroq = process.env.GROQ_API_KEY;
    const origProvider = process.env.LLM_PROVIDER;

    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.LLM_PROVIDER;

    const provider = getDefaultLlmProvider();
    expect(provider.name).toBe('MockLlmProvider');

    if (origGemini) process.env.GEMINI_API_KEY = origGemini;
    if (origGroq) process.env.GROQ_API_KEY = origGroq;
    if (origProvider) process.env.LLM_PROVIDER = origProvider;
  });

  it('selects GroqLlmProvider when LLM_PROVIDER is set to groq', () => {
    const origGemini = process.env.GEMINI_API_KEY;
    const origGroq = process.env.GROQ_API_KEY;
    const origProvider = process.env.LLM_PROVIDER;

    process.env.GROQ_API_KEY = 'gsk-dummy';
    process.env.LLM_PROVIDER = 'groq';

    const provider = getDefaultLlmProvider();
    expect(provider.name).toBe('GroqLlmProvider');

    if (origGemini) process.env.GEMINI_API_KEY = origGemini; else delete process.env.GEMINI_API_KEY;
    if (origGroq) process.env.GROQ_API_KEY = origGroq; else delete process.env.GROQ_API_KEY;
    if (origProvider) process.env.LLM_PROVIDER = origProvider; else delete process.env.LLM_PROVIDER;
  });
});
