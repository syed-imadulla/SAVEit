import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import {
  SampledFrame,
  KeyframeOptions,
  KeyframeSamplerError,
} from './types';

const MAX_ALLOWABLE_FILE_SIZE = 50 * 1024 * 1024; // 50MB safety limit

/**
 * Checks whether an image buffer is essentially identical to another image buffer.
 * Performs a fast sample-byte comparison to detect static/frozen video frames.
 */
function isVisuallyRedundant(bufA: Buffer, bufB: Buffer): boolean {
  if (bufA.length === bufB.length && bufA.equals(bufB)) {
    return true;
  }
  // If sizes are within 1% and sample bytes match across 5 checkpoints, treat as static scene
  const sizeDiff = Math.abs(bufA.length - bufB.length) / Math.max(bufA.length, bufB.length);
  if (sizeDiff < 0.01) {
    const checkpoints = [0.1, 0.25, 0.5, 0.75, 0.9];
    let matches = 0;
    for (const cp of checkpoints) {
      const idxA = Math.floor(bufA.length * cp);
      const idxB = Math.floor(bufB.length * cp);
      if (Math.abs(bufA[idxA] - bufB[idxB]) < 5) {
        matches++;
      }
    }
    if (matches === checkpoints.length) {
      return true;
    }
  }
  return false;
}

/**
 * Bounded Keyframe Sampler using FFmpeg.
 *
 * Extracts informative keyframes from verified local media files with strict limits
 * on execution time, frame count, file size, and resource consumption.
 */
export class KeyframeSampler {
  private ffmpegPath: string;

  constructor(options?: { ffmpegPath?: string }) {
    this.ffmpegPath = options?.ffmpegPath || 'ffmpeg';
  }

  /**
   * Samples keyframes from a local media file.
   *
   * @param localFilePath Absolute path to a verified local video file.
   * @param options Configurable bounds and interval settings.
   */
  async sampleKeyframes(localFilePath: string, options?: KeyframeOptions): Promise<SampledFrame[]> {
    // 1. Strict Input Validation & SSRF Guard
    if (!localFilePath || typeof localFilePath !== 'string') {
      throw new KeyframeSamplerError('A valid local file path must be provided.', 'INVALID_INPUT');
    }

    // Explicitly reject network protocols and arbitrary URLs
    const forbiddenProtocols = ['http:', 'https:', 'ftp:', 'data:', 'concat:', 'subfile:', 'pipe:'];
    const lower = localFilePath.trim().toLowerCase();
    if (forbiddenProtocols.some((p) => lower.startsWith(p))) {
      throw new KeyframeSamplerError(
        'Direct URLs and dangerous protocols are not permitted as FFmpeg input.',
        'INVALID_INPUT'
      );
    }

    // Verify file exists on local filesystem and is a regular file
    if (!fs.existsSync(localFilePath)) {
      throw new KeyframeSamplerError(`Local file does not exist: ${localFilePath}`, 'INVALID_INPUT');
    }

    const stat = fs.statSync(localFilePath);
    if (!stat.isFile()) {
      throw new KeyframeSamplerError(`Path is not a regular file: ${localFilePath}`, 'INVALID_INPUT');
    }

    if (stat.size > MAX_ALLOWABLE_FILE_SIZE) {
      throw new KeyframeSamplerError(
        `File size (${(stat.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum safe limit of 50MB.`,
        'LIMIT_EXCEEDED'
      );
    }

    if (stat.size === 0) {
      throw new KeyframeSamplerError('Supplied video file is empty (0 bytes).', 'INVALID_INPUT');
    }

    // 2. Configure Execution Bounds
    const intervalSeconds = Math.max(0.5, options?.intervalSeconds || 3.0);
    const maxFrames = Math.min(20, Math.max(1, options?.maxFrames || 10));
    const timeoutMs = Math.min(30000, Math.max(1000, options?.timeoutMs || 10000));
    const dropRedundant = options?.dropRedundant !== false;

    // 3. Prepare Isolated Temporary Output Directory
    const tempDir = path.join(os.tmpdir(), `saveit-sampler-${randomUUID()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // 4. Execute FFmpeg with Bounded Parameters
      // Filter: fps=1/interval, scale to max 1280x720, output jpeg
      const outputPattern = path.join(tempDir, 'frame_%03d.jpg');
      const fpsFilter = `fps=1/${intervalSeconds},scale='min(1280,iw)':-2`;

      const args = [
        '-y',
        '-ss',
        '0',
        '-t',
        (options?.maxDurationSeconds || 60).toString(),
        '-i',
        localFilePath,
        '-vf',
        fpsFilter,
        '-vframes',
        maxFrames.toString(),
        '-q:v',
        '3',
        outputPattern,
      ];

      await this.runProcess(this.ffmpegPath, args, timeoutMs);

      // 5. Read Sampled Frames & Calculate Accurate Timestamps
      const files = fs
        .readdirSync(tempDir)
        .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
        .sort();

      const frames: SampledFrame[] = [];
      let prevBuffer: Buffer | null = null;

      for (let i = 0; i < files.length; i++) {
        const framePath = path.join(tempDir, files[i]);
        const imageBuffer = fs.readFileSync(framePath);

        // Filter redundant / duplicate consecutive frames
        if (dropRedundant && prevBuffer && isVisuallyRedundant(prevBuffer, imageBuffer)) {
          continue;
        }

        const timestampMs = Math.round(i * intervalSeconds * 1000);
        frames.push({
          index: frames.length,
          timestampMs,
          imageBuffer,
        });

        prevBuffer = imageBuffer;
        if (frames.length >= maxFrames) break;
      }

      return frames;
    } finally {
      // 6. Guaranteed Cleanup of Temporary Files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err: any) {
        console.warn(`[KeyframeSampler] Failed to clean temp directory ${tempDir}:`, err.message);
      }
    }
  }

  /**
   * Executes a child process with strict timeout and exit status inspection.
   */
  private runProcess(command: string, args: string[], timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let isSettled = false;

      const child = spawn(command, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderrOutput = '';
      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          stderrOutput += chunk.toString();
        });
      }

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          child.kill('SIGKILL');
          reject(new KeyframeSamplerError(`FFmpeg execution timed out after ${timeoutMs}ms.`, 'TIMEOUT'));
        }
      }, timeoutMs);

      child.on('error', (err: any) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          if (err.code === 'ENOENT') {
            reject(
              new KeyframeSamplerError(
                `FFmpeg binary was not found at "${command}". Ensure FFmpeg is installed.`,
                'FFMPEG_MISSING'
              )
            );
          } else {
            reject(new KeyframeSamplerError(`FFmpeg process error: ${err.message}`, 'EXECUTION_FAILED'));
          }
        }
      });

      child.on('close', (code) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          if (code === 0) {
            resolve();
          } else {
            reject(
              new KeyframeSamplerError(
                `FFmpeg exited with non-zero code ${code}: ${stderrOutput.slice(-300)}`,
                'EXECUTION_FAILED'
              )
            );
          }
        }
      });
    });
  }
}
