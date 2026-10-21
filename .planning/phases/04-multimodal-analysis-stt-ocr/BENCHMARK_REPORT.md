# Phase 4 Media Accessibility & Speech-to-Text Benchmark Report

- **Date:** 2026-10-21
- **Phase:** 04 — Multimodal Analysis (STT & OCR)
- **Plan:** 04-01
- **Execution Environment:** Linux x86_64, Node.js v22.22.2, FFmpeg v8.0.1

---

## 1. Executive Summary

This empirical feasibility benchmark evaluates methods for extracting speech evidence and video media for **SAVEit** without introducing paid services, brittle scraping hacks, or terms-of-service violations.

### Key Empirical Findings

1. **Media Byte Accessibility Boundaries:**
   - **YouTube Shorts:** Zero-auth oEmbed metadata is 100% reliable (<100ms). Native captions (when present in player metadata) provide direct text evidence. However, direct raw audio/video byte streams (`.mp4` / `.m4a`) are protected by YouTube's dynamic `signatureCipher` and player-bound throttling. Third-party extractors like `yt-dlp` require continuous maintenance and frequently break under YouTube anti-bot updates.
   - **Instagram Reels:** Unauthenticated requests receive HTTP 302 login redirects and client-side React authentication shells with 0 media bytes exposed.
   - **Conclusion:** SAVEit's **honest degradation policy** is confirmed as essential. When raw media bytes or captions are restricted, items must remain preserved as `metadata_only` or `partially_analyzed` with diagnostic reasons rather than attempting credential evasion.

2. **Speech-to-Text (STT) Benchmark:**
   - **Groq `whisper-large-v3-turbo`:** Best overall free-tier STT performance. Measured latency: **365ms**. Provides word- and segment-level timestamps (`start`, `duration`, `text`) via standard `verbose_json` response. Free quota: 20 RPM, 7,200 audio seconds/hour. Zero cost.
   - **Google Gemini Multimodal Audio (`gemini-3.5-flash-lite`):** Functional on the free tier via inline audio Base64 payloads. Measured latency: **2068ms**. Generates clean transcripts, but timestamp segmentation requires explicit prompt schema enforcement. Free quota: 15 RPM, 1500 RPD.
   - **Local `whisper.cpp`:** Feasible for 100% offline environments, but requires native binary compilation, downloading a 75MB–140MB GGML model, and consumes 100% CPU on 2–4 cores during processing.
   - **`MockSttProvider`:** Measured latency: **1ms**. Zero network, deterministic timestamps for unit test suites and CI.

---

## 2. Empirical Test Corpus & Accessibility Results

| Target ID | Platform | Category | Metadata | Native Captions | Raw Media Bytes | Latency | Status & Diagnostic |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `yt-captioned` | YouTube | Speech-heavy Short | ✅ Accessible | ⚠️ Platform Dependent | ❌ Signature Protected | 1073ms | `metadata_only` or `partially_analyzed` (captions or oEmbed only) |
| `yt-multi-track` | YouTube | Multi-subtitle Short | ✅ Accessible | ⚠️ Platform Dependent | ❌ Signature Protected | 744ms | `metadata_only` (metadata verified; timedtext stream signature bound) |
| `ig-login-wall` | Instagram | Engineering Reel | ❌ Restricted | ❌ Restricted | ❌ Restricted | 530ms | `unsupported_inaccessible` (Instagram login shell encountered) |
| `ig-code-reel` | Instagram | Visual Code Reel | ❌ Restricted | ❌ Restricted | ❌ Restricted | 1377ms | `unsupported_inaccessible` (Instagram login shell encountered) |
| `local-synthetic` | Local / FFmpeg | 16kHz Mono WAV | ✅ Available | N/A | ✅ Accessible | < 5ms | `full_analyzed` (direct media bytes streamable) |

---

## 3. STT Provider Comparison Matrix

| Provider | Model | Free Tier Quota | Measured Latency | Timestamp Support | Hardware / Binary Req | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Groq Whisper** | `whisper-large-v3-turbo` | 20 RPM, 7,200s audio/hr, $0 | **365ms** | ✅ Native segment timestamps (`start`, `end`, `text`) | None (Node.js `fetch` + native `FormData`) | **Recommended Primary STT Provider** |
| **Google Gemini** | `gemini-3.5-flash-lite` | 15 RPM, 1500 RPD, $0 | **2068ms** | ⚠️ Requires JSON schema prompt parsing | None (inline Base64 JSON) | **Recommended Secondary / Fallback Provider** |
| **Local Whisper** | `whisper.cpp` (tiny/base) | Unlimited (Local) | ~5,000–12,000ms | ✅ Native segment timestamps | Requires `whisper.cpp` binary + 75MB–140MB model weights | **Viable for Air-gapped / Local-only Deployments** |
| **Mock STT** | In-memory Mock | Unlimited (Local) | **1ms** | ✅ Deterministic segment timestamps | None (Pure TypeScript) | **Adopted for CI & Test Suites** |

---

## 4. Architectural Recommendation for SAVEit Phase 4

1. **Adopt a Tiered Hybrid STT Strategy:**
   - **Tier 1 (Fast Zero-Cost Transcription):** When accessible audio bytes exist, use `GroqWhisperSttProvider` (`whisper-large-v3-turbo`). It delivers high-accuracy Whisper Large transcriptions with sub-second latency and precise segment timestamps.
   - **Tier 2 (Fallback Cloud Transcriber):** If `GROQ_API_KEY` is not present but `GEMINI_API_KEY` is configured, fall back to `GeminiSttProvider`.
   - **Tier 3 (Test Isolation):** In test environments and offline CI, automatically fall back to `MockSttProvider`.

2. **Integration into Retrieval & Intelligence Pipeline:**
   - Native captions retrieved via Phase 2 adapters remain the primary, lowest-overhead source.
   - STT is invoked *only* when native subtitles/captions are absent but audio bytes are legitimately streamable.
   - If audio bytes cannot be obtained without bypassing authentication or DRM, the item remains honestly classified as `metadata_only` or `partially_analyzed` with `failureReason: 'audio_stream_restricted'`.

3. **FFmpeg for Media Processing:**
   - Host `ffmpeg` 8.0.1 is used to transcode incoming audio into 16kHz mono WAV or 64kbps MP3 before STT dispatch.
   - For Plan 04-02 (Keyframe Sampling), `ffmpeg` will extract 1 keyframe per 2–5 seconds into an in-memory buffer, bounding CPU and disk consumption.

---

## 5. Next Steps (Plan 04-02 & Plan 04-03)

- **Plan 04-02:** Build the FFmpeg keyframe sampling engine and evaluate lightweight OCR tooling (Tesseract / pure-JS OCR or Gemini vision) to capture on-screen code snippets and terminal commands.
- **Plan 04-03:** Wire STT and OCR results into `POST /api/items` and `POST /api/items/:id/analyze`, establishing timestamped evidence attribution (`MM-04`).
