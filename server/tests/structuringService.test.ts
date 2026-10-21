import { describe, it, expect, vi } from 'vitest';
import { StructuringService } from '../src/services/intelligence/structuringService';
import { MockLlmProvider } from '../src/services/intelligence/llmProvider';
import { LlmProviderError } from '../src/services/intelligence/types';

describe('StructuringService', () => {
  it('handles insufficient text gracefully without calling LLM', async () => {
    const mockProvider = new MockLlmProvider();
    const generateSpy = vi.spyOn(mockProvider, 'generateStructured');

    const service = new StructuringService(mockProvider);
    const result = await service.structure({
      platform: 'youtube',
      title: 'Short Teaser',
      rawText: 'Thanks for watching!',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_TEXT');
    expect(result.knowledge.summary).toContain('Transcript text is unavailable or insufficient');
    expect(result.knowledge.keyPoints).toHaveLength(0);
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('structures substantial text and combines LLM and heuristic resources', async () => {
    const mockProvider = new MockLlmProvider({
      customResponse: {
        summary: 'Detailed walkthrough of setting up Docker containers with Node.js.',
        keyPoints: [
          'Create a lightweight Dockerfile',
          'Use multi-stage builds for optimization',
          'Mount local volumes during development',
        ],
        tags: ['docker', 'nodejs', 'containers'],
        resources: [
          {
            title: 'Docker Documentation',
            url: 'https://docs.docker.com',
            type: 'documentation',
            status: 'unverified_mention',
            description: 'Official Docker guides',
          },
        ],
      },
    });

    const service = new StructuringService(mockProvider);
    const result = await service.structure({
      platform: 'youtube',
      title: 'Dockerize Node.js in 60s',
      author: 'DevTips',
      rawText: 'In this video we look at docker containers and connect with redis at https://redis.io/docs and check github owner/repo',
    });

    expect(result.success).toBe(true);
    expect(result.knowledge.summary).toContain('Detailed walkthrough');
    expect(result.knowledge.keyPoints).toHaveLength(3);
    expect(result.knowledge.tags).toContain('docker');

    // Heuristically discovered resources should be merged cleanly
    const titles = result.knowledge.resources.map((r) => r.title.toLowerCase());
    expect(titles).toContain('docker documentation');
    expect(titles).toContain('redis.io documentation');
  });

  it('handles quota exhaustion (HTTP 429) gracefully without throwing', async () => {
    const failingProvider = new MockLlmProvider();
    vi.spyOn(failingProvider, 'generateStructured').mockRejectedValue(
      new LlmProviderError('Gemini free tier quota limit reached (HTTP 429).', 'QUOTA_EXHAUSTED', 429)
    );

    const service = new StructuringService(failingProvider);
    const result = await service.structure({
      platform: 'youtube',
      title: 'Kubernetes Crash Course',
      rawText: 'Today we discuss Kubernetes pods, replica sets, and deployments for containerized apps.',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('QUOTA_EXHAUSTED');
    expect(result.knowledge.summary).toContain('AI analysis pending or quota limit reached');
    expect(result.knowledge.keyPoints).toHaveLength(0);
    // Preserves heuristically discovered tools
    expect(result.knowledge.resources.some((r) => r.title.toLowerCase() === 'kubernetes')).toBe(true);
  });

  it('handles missing API keys gracefully', async () => {
    const failingProvider = new MockLlmProvider();
    vi.spyOn(failingProvider, 'generateStructured').mockRejectedValue(
      new LlmProviderError('GEMINI_API_KEY is not configured.', 'MISSING_API_KEY')
    );

    const service = new StructuringService(failingProvider);
    const result = await service.structure({
      platform: 'youtube',
      title: 'Python Tips',
      rawText: 'Write clean Python code using list comprehensions and generators for high performance.',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('MISSING_API_KEY');
    expect(result.error).toContain('GEMINI_API_KEY is not configured');
  });

  it('allows swapping the LLM provider at runtime', () => {
    const mock1 = new MockLlmProvider();
    const service = new StructuringService(mock1);
    expect(service.getProviderName()).toBe('MockLlmProvider');

    const mock2 = new MockLlmProvider();
    service.setProvider(mock2);
    expect(service.getProviderName()).toBe('MockLlmProvider');
  });
});
