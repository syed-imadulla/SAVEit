# Phase 2 Context: Retrieval Feasibility & Adapters

## Phase Overview
- **Phase Number:** 02
- **Phase Name:** Retrieval Feasibility & Adapters
- **Requirements Covered:** RET-01, RET-02, RET-03, RET-04, RET-05
- **Goal:** Empirically evaluate and implement modular retrieval mechanisms for Instagram Reels and YouTube Shorts, establishing honest data capture boundaries and graceful degradation.

---

## Decisions Made During Discussion

### 1. Feasibility Benchmark Test Corpus (RET-01)
- **Decision:** Curated reproducible test fixture with 4 distinct categories.
- **Corpus Structure:**
  1. **Speech-heavy video:** Clear spoken audio, minimal background music, conversational/explainer style (test audio/transcription accessibility).
  2. **Code/Text-heavy video:** Terminal demos, IDE walkthroughs, tutorial reels where descriptions, tool names, and code snippets are featured.
  3. **Official Closed-Captioned video:** Includes platform captions/subtitles (test auto-timed subtitle extraction).
  4. **Inaccessible / Restricted video:** Private, deleted, geo-blocked, or 404 URL (test honest fallback and failure handling).
- **Execution:** Automated benchmark test script in `server/scripts/retrievalBenchmark.ts` that runs against live or mock fixture URLs and outputs a markdown audit report (`.planning/phases/02-retrieval-feasibility-adapters/BENCHMARK_REPORT.md`).

### 2. YouTube Shorts Retrieval Mechanics (RET-03, RET-05)
- **Decision:** Layered zero-auth retrieval architecture (zero mandatory API keys).
- **Mechanism:**
  1. **Level 1 (Zero-auth Metadata):** Official YouTube oEmbed endpoint (`https://www.youtube.com/oembed?url=...&format=json`) provides immediate, rate-limit resilient title, author/channel name, provider, and thumbnail without requiring an API key.
  2. **Level 2 (Captions & Transcripts):** Public timedtext / caption extraction via dedicated lightweight parser (e.g. `youtube-transcript` or direct timedtext XML parser), capturing text segments with start timestamps and durations.
  3. **Level 3 (Graceful Fallback):** If captions are disabled or unavailable, degrade gracefully to `metadata_only` status with honest diagnostics, rather than failing.

### 3. Instagram Reels Retrieval & Anti-Bot Protection (RET-04, RET-05)
- **Decision:** Honest tiered fallback respecting platform terms (no anti-bot evasion).
- **Mechanism:**
  1. **Public Metadata Probe:** Attempt public oEmbed / OpenGraph metadata extraction (`og:title`, `og:description`, `og:image`).
  2. **Restricted Access Boundary:** If Meta/Instagram redirects to a login wall (`/accounts/login/`) or restricts scraping, capture what is available (or mark as `metadata_only` / `unsupported_inaccessible`).
  3. **Data Integrity:** Always preserve the original source URL. Never attempt brittle cookie injection, captcha circumvention, or unauthorized proxy rotators. Record diagnostic reasons honestly.

### 4. Modular Adapter Architecture & Backend Integration (RET-02, RET-05)
- **Decision:** Implement a modular `RetrievalAdapter` registry returning a structured `EvidenceReport` and wire it into the backend API.
- **Contract:**
  - Interface `RetrievalAdapter`:
    ```typescript
    export interface RetrievalAdapter {
      readonly platform: Platform;
      canHandle(url: string): boolean;
      retrieve(url: string): Promise<EvidenceReport>;
    }
    ```
  - Type `EvidenceReport`:
    ```typescript
    export interface EvidenceReport {
      url: string;
      platform: Platform;
      contentType: ContentType;
      accessLevel: 'full' | 'transcript_only' | 'metadata_only' | 'inaccessible';
      status: ProcessingStatus;
      metadata: {
        title?: string;
        author?: string;
        description?: string;
        thumbnailUrl?: string;
        durationSeconds?: number;
      };
      transcript?: {
        text: string;
        segments?: Array<{ start: number; duration: number; text: string }>;
        language?: string;
        source: 'closed_captions' | 'auto_generated' | 'none';
      };
      rawEvidence: {
        hasCaptions: boolean;
        metadataAccessible: boolean;
        httpStatusCode?: number;
        reason?: string;
      };
      retrievedAt: Date;
    }
    ```
  - **Backend Integration:** Update `itemController.ts` so that when `POST /api/items` is called, the URL is not only stored as `queued`, but the adapter retrieves real metadata and transcript evidence, updating the item's `status` to `metadata_only` or `partially_analyzed` / `full_analyzed` (or `unsupported_inaccessible`).

---

## Architectural Guardrails
1. **SSRF Guard:** Reuse `urlValidator.ts`'s `isPrivateOrLoopbackHost` before dispatching any external HTTP request inside adapters.
2. **Honesty Contract:** Never report `full_analyzed` when only a title or oEmbed payload was retrieved.
3. **No External Heavy Runtimes:** Keep server lightweight in Node.js/TypeScript without mandatory Python `yt-dlp` daemons.
