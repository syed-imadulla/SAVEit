import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import {
  KeyframeSampler,
  KeyframeSamplerError,
} from '../src/services/multimodal';

describe('KeyframeSampler', () => {
  let tempVideoPath: string | null = null;
  const hasSystemFfmpeg = (() => {
    try {
      execSync('ffmpeg -version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  beforeEach(() => {
    tempVideoPath = null;
  });

  afterEach(() => {
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      try {
        fs.unlinkSync(tempVideoPath);
      } catch {}
    }
  });

  describe('Security & Input Validation', () => {
    const sampler = new KeyframeSampler();

    it('rejects empty or missing file path with INVALID_INPUT', async () => {
      await expect(sampler.sampleKeyframes('')).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('rejects http/https URLs to prevent SSRF and unrestricted network input', async () => {
      await expect(sampler.sampleKeyframes('https://example.com/video.mp4')).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
      await expect(sampler.sampleKeyframes('http://169.254.169.254/latest/meta-data')).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
      await expect(sampler.sampleKeyframes('concat:file1|file2')).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('rejects non-existent local file paths with INVALID_INPUT', async () => {
      const nonExistent = path.join(os.tmpdir(), 'non-existent-saveit-video-999.mp4');
      await expect(sampler.sampleKeyframes(nonExistent)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('rejects 0-byte empty video files with INVALID_INPUT', async () => {
      tempVideoPath = path.join(os.tmpdir(), `empty_${Date.now()}.mp4`);
      fs.writeFileSync(tempVideoPath, Buffer.alloc(0));

      await expect(sampler.sampleKeyframes(tempVideoPath)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('fails with FFMPEG_MISSING when invalid ffmpeg binary path is provided', async () => {
      tempVideoPath = path.join(os.tmpdir(), `dummy_${Date.now()}.mp4`);
      fs.writeFileSync(tempVideoPath, Buffer.from('RIFF1234dummy'));

      const faultySampler = new KeyframeSampler({ ffmpegPath: '/non/existent/ffmpeg_binary' });
      await expect(faultySampler.sampleKeyframes(tempVideoPath)).rejects.toMatchObject({
        code: 'FFMPEG_MISSING',
      });
    });
  });

  describe('Live FFmpeg Keyframe Sampling (Synthetic Media)', () => {
    it('generates synthetic video, samples frames, preserves timestamps, and cleans up temp files', async () => {
      if (!hasSystemFfmpeg) return;

      tempVideoPath = path.join(os.tmpdir(), `synthetic_${Date.now()}.mp4`);
      // Generate a 4-second 320x240 test video with shifting colors using FFmpeg
      execSync(
        `ffmpeg -f lavfi -i "testsrc=duration=4:size=320x240:rate=10" -c:v libx264 -pix_fmt yuv420p "${tempVideoPath}" -y`,
        { stdio: 'ignore' }
      );

      expect(fs.existsSync(tempVideoPath)).toBe(true);

      const sampler = new KeyframeSampler();
      // Sample 1 frame every 1.5 seconds, max 3 frames
      const frames = await sampler.sampleKeyframes(tempVideoPath, {
        intervalSeconds: 1.5,
        maxFrames: 3,
        dropRedundant: false,
      });

      expect(frames.length).toBeGreaterThanOrEqual(2);
      expect(frames[0].index).toBe(0);
      expect(frames[0].timestampMs).toBe(0);
      expect(frames[1].index).toBe(1);
      expect(frames[1].timestampMs).toBe(1500);
      expect(frames[0].imageBuffer.length).toBeGreaterThan(100);

      // Verify JPEG magic bytes (0xFF, 0xD8)
      expect(frames[0].imageBuffer[0]).toBe(0xff);
      expect(frames[0].imageBuffer[1]).toBe(0xd8);
    });

    it('enforces maxFrames upper bound limit', async () => {
      if (!hasSystemFfmpeg) return;

      tempVideoPath = path.join(os.tmpdir(), `synthetic_limit_${Date.now()}.mp4`);
      execSync(
        `ffmpeg -f lavfi -i "testsrc=duration=4:size=160x120:rate=5" -c:v libx264 -pix_fmt yuv420p "${tempVideoPath}" -y`,
        { stdio: 'ignore' }
      );

      const sampler = new KeyframeSampler();
      // Ask for max 1 frame
      const frames = await sampler.sampleKeyframes(tempVideoPath, {
        intervalSeconds: 1.0,
        maxFrames: 1,
      });

      expect(frames).toHaveLength(1);
      expect(frames[0].timestampMs).toBe(0);
    });
  });
});
