---
phase: 04-multimodal-analysis-stt-ocr
plan: 02
subsystem: "multimodal-keyframe-ocr"
tags: [keyframe-sampling, ocr, ffmpeg, code-extraction, terminal-commands, evidence-attribution, multimodal]
provides:
  - Bounded KeyframeSampler extracting frames from verified local video files using FFmpeg
  - Strict SSRF / network URL blocking preventing arbitrary media protocol execution
  - Modular OcrProvider interface with MockOcrProvider, TesseractCliOcrProvider, and UnavailableOcrProvider
  - Visual OcrExtractor parsing code snippets, terminal commands, URLs, and tool mentions with frame timestamps
  - IOcrObservation schema extension in Mongoose Item model for persistent visual evidence
affects: [server, multimodal-pipeline, database]
tech-stack:
  added: []
  patterns: [resource-bounding, ssrf-guard, modular-provider, regex-extraction, timestamp-attribution]
key-files:
  created:
    - server/src/services/multimodal/keyframeSampler.ts
    - server/src/services/multimodal/ocrProvider.ts
    - server/src/services/multimodal/ocrExtractor.ts
    - server/tests/keyframeSampler.test.ts
    - server/tests/ocrExtractor.test.ts
    - .planning/phases/04-multimodal-analysis-stt-ocr/04-02-PLAN.md
  modified:
    - server/src/services/multimodal/types.ts
    - server/src/services/multimodal/index.ts
    - server/src/models/Item.ts
key-decisions:
  - Enforce strict local-filepath validation in KeyframeSampler; reject any http/https/ftp/concat URLs to prevent FFmpeg SSRF exploits
  - Bound frame extraction to maximum 10 frames, 60 seconds duration, and 10,000ms process timeout
  - Detect and skip consecutive visually redundant frames to avoid wasteful duplicate OCR processing
  - Extract terminal commands ($ npm, docker run, git clone, kubectl) and syntax-delimited code blocks
  - Attribute all visual evidence to exact millisecond timestamps (timestampMs) and frame index
duration: "25min"
completed: 2026-10-21
---

# Phase 4 Plan 02: Keyframe Sampling & On-Screen OCR Engine Summary

**Built a bounded, SSRF-safe KeyframeSampler using host FFmpeg, implemented modular OCR providers, created the visual OcrExtractor for on-screen code and commands, and extended the Mongoose Item schema with timestamped visual observations.**

## Performance

- **Duration:** 25min
- **Tasks:** 3 completed
- **Files created:** 6
- **Files modified:** 3
- **Automated Tests:** 15 new tests added (125 / 125 tests passing across all 14 test suites)
- **Monorepo Build:** 0 errors across client and server

## Accomplishments

- **Bounded Keyframe Sampler ([keyframeSampler.ts](file:///home/syed-imadulla/Desktop/SAVEit/server/src/services/multimodal/keyframeSampler.ts)):**
  - Strictly requires verified local files; rejects remote URLs (`http:`, `https:`, `concat:`) to prevent SSRF and FFmpeg protocol injection.
  - Enforces resource limits: max 10 frames, max 60s media duration, max 50MB file size, and 10s process timeout (`SIGKILL` abort).
  - Isolates output in unique temp directories (`os.tmpdir()/saveit-sampler-<uuid>`) with guaranteed recursive cleanup in `finally` blocks.
  - Detects and drops visually redundant/frozen frames via sample-byte delta comparisons.
- **Modular OCR Providers ([ocrProvider.ts](file:///home/syed-imadulla/Desktop/SAVEit/server/src/services/multimodal/ocrProvider.ts)):**
  - `MockOcrProvider`: Fast, deterministic recognition with configurable responses and confidence for unit tests.
  - `TesseractCliOcrProvider`: Safe execution of system `tesseract` binary when installed.
  - `UnavailableOcrProvider`: Explicit, honest reporting when no local OCR engine is configured.
  - `getDefaultOcrProvider()`: Auto-selects based on environment and availability.
- **Visual Evidence & Code Extractor ([ocrExtractor.ts](file:///home/syed-imadulla/Desktop/SAVEit/server/src/services/multimodal/ocrExtractor.ts)):**
  - Normalizes OCR text and preserves code block indentation.
  - Identifies programming syntax (TypeScript, JavaScript, Python).
  - Captures terminal commands (`$ npm install`, `docker run`, `git clone`, `kubectl apply`, `curl`, `pip`).
  - Detects URLs, GitHub repositories, and developer tools visually displayed on screen.
  - Generates `OcrObservation` records preserving exact millisecond timestamps (`timestampMs`).
- **Data Model Extension ([Item.ts](file:///home/syed-imadulla/Desktop/SAVEit/server/src/models/Item.ts)):**
  - Extended `IRawEvidence` and `RawEvidenceSchema` with `ocrObservations: IOcrObservation[]`.
- **Automated Test Suites ([keyframeSampler.test.ts](file:///home/syed-imadulla/Desktop/SAVEit/server/tests/keyframeSampler.test.ts), [ocrExtractor.test.ts](file:///home/syed-imadulla/Desktop/SAVEit/server/tests/ocrExtractor.test.ts)):**
  - 15 new tests covering security checks, synthetic video generation/sampling with FFmpeg, timestamp preservation, code/command parsing, deduplication, and cleanup.
