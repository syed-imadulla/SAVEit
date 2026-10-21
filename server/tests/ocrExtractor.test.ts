import { describe, it, expect } from 'vitest';
import {
  MockOcrProvider,
  UnavailableOcrProvider,
  OcrExtractor,
  normalizeOcrText,
  extractCodeSnippets,
  extractTerminalCommands,
  SampledFrame,
} from '../src/services/multimodal';

describe('OCR Providers & Extractor', () => {
  const dummyBuffer = Buffer.from('fake_image_bytes');

  describe('MockOcrProvider & UnavailableOcrProvider', () => {
    it('MockOcrProvider returns configured text and reports available', async () => {
      const provider = new MockOcrProvider({
        defaultText: 'const greeting = "Hello World";',
        defaultConfidence: 98,
      });

      expect(await provider.isAvailable()).toBe(true);
      const res = await provider.recognizeText(dummyBuffer);
      expect(res.text).toBe('const greeting = "Hello World";');
      expect(res.confidence).toBe(98);
    });

    it('UnavailableOcrProvider reports unavailable and returns empty string', async () => {
      const provider = new UnavailableOcrProvider();
      expect(await provider.isAvailable()).toBe(false);
      const res = await provider.recognizeText(dummyBuffer);
      expect(res.text).toBe('');
      expect(res.confidence).toBe(0);
    });
  });

  describe('Text Normalization & Code/Command Extraction Utilities', () => {
    it('normalizeOcrText trims line whitespace and collapses consecutive blank lines', () => {
      const raw = '   Line 1   \r\n\r\n\r\n   Line 2   \n\n   Line 3   ';
      const normalized = normalizeOcrText(raw);
      expect(normalized).toBe('Line 1\n\n   Line 2\n\n   Line 3');
    });

    it('extractCodeSnippets detects TypeScript, JavaScript, and Python code constructs', () => {
      const text = `
Here is how to set up the controller:
import { Request, Response } from 'express';
const handleRequest = async (req: Request, res: Response) => {
  return res.json({ ok: true });
};
And then run the server.
      `.trim();

      const snippets = extractCodeSnippets(text);
      expect(snippets.length).toBeGreaterThan(0);
      expect(snippets[0]).toContain("import { Request, Response } from 'express'");
      expect(snippets[0]).toContain('handleRequest = async');
    });

    it('extractTerminalCommands isolates CLI commands from prompt characters ($ and #)', () => {
      const text = `
To install dependencies, run:
$ npm install -D tailwindcss postcss autoprefixer
# npx tailwindcss init -p
Also you can clone the repository:
git clone https://github.com/facebook/react.git
And spin up the container:
docker run -d -p 6379:6379 redis:alpine
      `.trim();

      const commands = extractTerminalCommands(text);
      expect(commands).toContain('npm install -D tailwindcss postcss autoprefixer');
      expect(commands).toContain('npx tailwindcss init -p');
      expect(commands.some((c) => c.includes('git clone'))).toBe(true);
      expect(commands.some((c) => c.includes('docker run'))).toBe(true);
    });
  });

  describe('OcrExtractor End-to-End Frame Processing', () => {
    it('extracts observations and attributes them to exact frame timestamps and indexes', async () => {
      const mockProvider = new MockOcrProvider({
        defaultText: '$ npm install redis\nimport { createClient } from "redis";\nhttps://redis.io/docs',
        defaultConfidence: 94,
      });

      const extractor = new OcrExtractor(mockProvider);
      const frames: SampledFrame[] = [
        {
          index: 0,
          timestampMs: 0,
          imageBuffer: Buffer.from('frame_0'),
        },
        {
          index: 1,
          timestampMs: 3000,
          imageBuffer: Buffer.from('frame_1'),
        },
      ];

      const result = await extractor.extractFromFrames(frames);

      expect(result.providerName).toBe('mock-ocr');
      expect(result.framesSampled).toBe(2);
      // Because frame 1 and frame 2 returned identical text, consecutive duplicate deduplication keeps 1 observation
      expect(result.observations).toHaveLength(1);
      expect(result.observations[0].frameIndex).toBe(0);
      expect(result.observations[0].timestampMs).toBe(0);
      expect(result.observations[0].confidenceScore).toBe(94);

      // Verify command, URL, and tool detection
      expect(result.uniqueTerminalCommands).toContain('npm install redis');
      expect(result.uniqueUrls).toContain('https://redis.io/docs');
      expect(result.uniqueTools).toContain('redis');
    });

    it('handles distinct frames and deduplicates cumulative tools and commands', async () => {
      let callCount = 0;
      const dynamicProvider = {
        name: 'dynamic-mock',
        isAvailable: async () => true,
        recognizeText: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              text: '$ docker run -p 5432:5432 postgres\nhttps://github.com/docker/compose',
              confidence: 90,
            };
          }
          return {
            text: '$ kubectl apply -f deployment.yaml\nconst k8s = require("k8s");',
            confidence: 95,
          };
        },
      };

      const extractor = new OcrExtractor(dynamicProvider);
      const frames: SampledFrame[] = [
        { index: 0, timestampMs: 0, imageBuffer: Buffer.from('frame_0') },
        { index: 1, timestampMs: 4000, imageBuffer: Buffer.from('frame_1') },
      ];

      const result = await extractor.extractFromFrames(frames);

      expect(result.observations).toHaveLength(2);
      expect(result.observations[0].timestampMs).toBe(0);
      expect(result.observations[1].timestampMs).toBe(4000);

      expect(result.uniqueTerminalCommands.some((c) => c.includes('docker run'))).toBe(true);
      expect(result.uniqueTerminalCommands.some((c) => c.includes('kubectl apply'))).toBe(true);
      expect(result.uniqueUrls).toContain('https://github.com/docker/compose');
      expect(result.uniqueTools).toContain('docker');
      expect(result.uniqueTools).toContain('postgres');
    });

    it('handles empty frames and non-text slides gracefully without error', async () => {
      const emptyProvider = new MockOcrProvider({ defaultText: '' });
      const extractor = new OcrExtractor(emptyProvider);

      const frames: SampledFrame[] = [
        { index: 0, timestampMs: 0, imageBuffer: Buffer.from('blank_frame') },
      ];

      const result = await extractor.extractFromFrames(frames);
      expect(result.observations).toHaveLength(0);
      expect(result.fullOcrText).toBe('');
      expect(result.framesSampled).toBe(1);
      expect(result.framesWithText).toBe(0);
    });
  });
});
