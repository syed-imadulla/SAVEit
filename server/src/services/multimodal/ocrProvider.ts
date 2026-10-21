import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import {
  OcrProvider,
  OcrOptions,
  OcrRecognitionResult,
} from './types';

/**
 * Deterministic Mock OCR Provider for isolated unit and integration test suites.
 */
export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock-ocr';
  private defaultText?: string;
  private defaultConfidence?: number;
  private available: boolean;

  constructor(options?: { defaultText?: string; defaultConfidence?: number; available?: boolean }) {
    this.defaultText = options?.defaultText;
    this.defaultConfidence = options?.defaultConfidence ?? 95;
    this.available = options?.available ?? true;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async recognizeText(imageBuffer: Buffer, _options?: OcrOptions): Promise<OcrRecognitionResult> {
    if (!this.available) {
      return { text: '', confidence: 0 };
    }

    if (imageBuffer.length === 0) {
      return { text: '', confidence: 0 };
    }

    if (this.defaultText !== undefined) {
      return { text: this.defaultText, confidence: this.defaultConfidence };
    }

    // Default realistic coding slide text
    return {
      text: '$ npm install -D tailwindcss\nimport { useState } from "react";\nhttps://github.com/tailwindlabs/tailwindcss',
      confidence: 95,
    };
  }
}

/**
 * Local System Tesseract CLI Provider.
 *
 * Invokes the system `tesseract` binary if present on host PATH.
 */
export class TesseractCliOcrProvider implements OcrProvider {
  readonly name = 'tesseract-cli';
  private binaryPath: string;
  private cachedAvailability?: boolean;

  constructor(options?: { binaryPath?: string }) {
    this.binaryPath = options?.binaryPath || 'tesseract';
  }

  async isAvailable(): Promise<boolean> {
    if (this.cachedAvailability !== undefined) {
      return this.cachedAvailability;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        execFile(this.binaryPath, ['--version'], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.cachedAvailability = true;
    } catch {
      this.cachedAvailability = false;
    }

    return this.cachedAvailability;
  }

  async recognizeText(imageBuffer: Buffer, options?: OcrOptions): Promise<OcrRecognitionResult> {
    const available = await this.isAvailable();
    if (!available) {
      return { text: '', confidence: 0 };
    }

    if (imageBuffer.length === 0) {
      return { text: '', confidence: 0 };
    }

    const tempImgPath = path.join(os.tmpdir(), `saveit-ocr-${randomUUID()}.jpg`);
    fs.writeFileSync(tempImgPath, imageBuffer);

    const timeoutMs = options?.timeoutMs || 5000;
    const lang = options?.language || 'eng';

    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = execFile(
          this.binaryPath,
          [tempImgPath, 'stdout', '-l', lang],
          { timeout: timeoutMs },
          (err, out) => {
            if (err) reject(err);
            else resolve(out);
          }
        );
      });

      return {
        text: stdout.trim(),
        confidence: 85,
      };
    } catch (err: any) {
      console.warn('[TesseractCliOcrProvider] Recognition failed:', err.message);
      return { text: '', confidence: 0 };
    } finally {
      try {
        fs.unlinkSync(tempImgPath);
      } catch {}
    }
  }
}

/**
 * Honest Null/Unavailable Provider when no OCR system binary exists.
 */
export class UnavailableOcrProvider implements OcrProvider {
  readonly name = 'unavailable-ocr';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async recognizeText(_imageBuffer: Buffer, _options?: OcrOptions): Promise<OcrRecognitionResult> {
    return {
      text: '',
      confidence: 0,
    };
  }
}

/**
 * Returns the default OCR provider for the current environment.
 *
 * In tests or when Tesseract is absent, provides a clean fallback without crashing.
 */
export async function getDefaultOcrProvider(): Promise<OcrProvider> {
  if (process.env.NODE_ENV === 'test') {
    return new MockOcrProvider();
  }

  const tesseract = new TesseractCliOcrProvider();
  if (await tesseract.isAvailable()) {
    return tesseract;
  }

  return new UnavailableOcrProvider();
}
