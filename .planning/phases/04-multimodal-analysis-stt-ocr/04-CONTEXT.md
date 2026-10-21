# Phase 4 Context: Multimodal Analysis (STT & OCR)

## Phase Overview
- **Phase Number:** 04
- **Phase Name:** Multimodal Analysis (STT & OCR)
- **Requirements Covered:** MM-01, MM-02, MM-03, MM-04
- **Goal:** Extract knowledge from spoken audio and visual frames when media streams are legitimately accessible, linking takeaways and discovered resources to verifiable timestamps and visual evidence without faking or hallucinating data.

---

## Architectural Decisions & Guardrails

### 1. Media Accessibility Boundaries (Honest Processing)
- **YouTube Shorts:**
  - Zero-auth metadata via oEmbed is 100% reliable (<100ms).
  - Native timedtext captions are preferred as primary text evidence when available (zero audio transcoding/transcription overhead).
  - Raw audio/video stream downloads for YouTube are signature-cipher protected. Third-party scraping wrappers (e.g. `yt-dlp`) suffer frequent bot-check breakages and rate limits.
  - SAVEit will not bypass platform bot guards or signature algorithms. When native captions are absent and media streams cannot be legitimately fetched, SAVEit honestly marks items as `metadata_only` with diagnostic reason `captions_unavailable`.
- **Instagram Reels:**
  - Unauthenticated requests encounter client-side login app shells (302 redirects) with no media stream access.
  - SAVEit strictly preserves the item in MongoDB as `unsupported_inaccessible` or `metadata_only` without scraping evasion.
- **Direct / User-Provided Media:**
  - When direct media URLs or user-uploaded audio/video streams are available, SAVEit feeds the media to the multimodal pipeline.

### 2. Speech-to-Text (STT) Strategy (MM-01)
- **Primary Cloud Provider (Free Tier):** Groq `whisper-large-v3-turbo` via OpenAI-compatible `/audio/transcriptions` endpoint.
  - Generous free-tier quota (20 RPM, 7,200 audio seconds/hour).
  - Extremely fast execution (< 1.5 seconds for 60-second audio clip).
  - Rich word- and segment-level timestamps (`start`, `end`, `text`).
- **Secondary Cloud Provider (Free Tier):** Google Gemini (`gemini-3.5-flash-lite` / `gemini-3.8-flash`) via multimodal audio inline input.
  - Handles up to 20MB inline audio without paid billing.
- **Local Fallback:** `whisper.cpp` (lightweight quantized GGML models like `ggml-tiny.bin` ~75MB or `ggml-base.bin` ~140MB).
  - Completely offline and private, but requires ~200-500MB RAM and 100% CPU during transcription.
- **Testing Isolation:** `MockSttProvider` returning deterministic segment timestamp data for CI and offline unit testing without network or credentials.

### 3. Media Processing Engine (FFmpeg)
- Native `ffmpeg` v8.0.1 is available on the host system.
- Converts raw audio to 16kHz 16-bit mono WAV or compressed MP3 in <50ms.
- Extracts keyframes (1 frame per 2-5 seconds) for OCR processing without saving unneeded video frames.

### 4. Evidence Attribution Model (MM-04)
- Extracted takeaways and resource mentions must reference their origin:
  - `source`: `'transcript'` | `'ocr'` | `'metadata'`
  - `timestamp`: start time in seconds (e.g. `14.5s`)
  - `evidenceSnippet`: exact spoken sentence or OCR text excerpt.

---

## Phase Plan Breakdown

- **Plan 04-01:** Media Accessibility & STT Feasibility Benchmark (empirical probe, provider contracts, Groq/Gemini/Mock providers, benchmark report).
- **Plan 04-02:** Keyframe Sampling Engine & On-Screen OCR (FFmpeg keyframe sampler, lightweight OCR filter, code/text cleaning).
- **Plan 04-03:** Multimodal Pipeline Integration & Evidence Grounding (wire STT/OCR into item controller, timestamp attribution, end-to-end tests).
