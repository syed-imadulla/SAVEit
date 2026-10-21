# Requirements: SAVEit

**Defined:** 2026-10-21
**Core Value:** Turn saved short-form videos into dependable, searchable knowledge items while preserving the original source and honestly presenting what content was legitimately accessible.

## v1 Requirements

Requirements for initial release, broken down into roadmap phases.

### Phase 1: Core Foundation & URL Capture (Milestone 1)

- [ ] **FND-01**: Monorepo root workspace configured with `client/` (React, TypeScript, Tailwind CSS, Vite) and `server/` (Node.js, Express, TypeScript).
- [ ] **FND-02**: Docker Compose configuration for local MongoDB persistence with health checks and volume mapping.
- [ ] **CAP-01**: Backend endpoint `POST /api/items` accepts a video URL, performs validation, extracts platform info (Instagram Reel / YouTube Short), and persists a record immediately.
- [ ] **CAP-02**: SSRF protection and strict URL parser rejecting non-HTTP(S), private IP ranges (127.0.0.1, 10.0.0.0/8, 192.168.0.0/16, etc.), and unsupported hostnames.
- [ ] **CAP-03**: Backend endpoint `GET /api/items` lists saved items with pagination, sorting by capture date, and status filtering.
- [ ] **CAP-04**: Backend endpoint `DELETE /api/items/:id` enables item deletion and data removal.
- [ ] **UI-01**: Responsive modern application shell with clean branding, navigation, and intuitive layout.
- [ ] **UI-02**: URL Capture Bar component with instant client-side URL syntax feedback, loading state, and error handling.
- [ ] **UI-03**: Library Feed component displaying saved items with platform badges (Instagram / YouTube), timestamps, original URLs, and status indicators.
- [ ] **UI-04**: Visual indicator showing honest processing states (`queued`, `full_analyzed`, `partially_analyzed`, `metadata_only`, `needs_user_input`, `retryable_failure`, `unsupported_inaccessible`).
- [ ] **TEST-01**: Automated unit tests for URL validator, platform detector, and core API routes.

### Phase 2: Retrieval Feasibility & Adapters

- [ ] **RET-01**: Retrieval test suite benchmarking representative public Reels and Shorts (speech-heavy, text-heavy, captioned, inaccessible).
- [ ] **RET-02**: Modular retrieval adapter interface (`RetrievalAdapter`) returning standardized evidence payloads (`EvidenceReport`).
- [ ] **RET-03**: YouTube adapter extracting legitimate metadata, available captions/transcripts, and reporting access level.
- [ ] **RET-04**: Instagram adapter extracting legitimate oEmbed/public metadata and reporting access level.
- [ ] **RET-05**: Graceful fallback ensuring metadata-only records are created when full media/audio is inaccessible.

### Phase 3: Text-First Intelligence & Structuring

- [ ] **AI-01**: Text processing pipeline for accessible transcripts and captions.
- [ ] **AI-02**: LLM structuring service generating concise summary, actionable takeaways, and relevant tags.
- [ ] **AI-03**: Mentioned resource extractor identifying tools, libraries, websites, and GitHub repos.
- [ ] **AI-04**: Resource link verification checker checking candidate links and labeling them as verified, unverified mention, or broken.

### Phase 4: Multimodal Analysis (STT & OCR)

- [x] **MM-01**: Speech-to-text benchmark and integration for accessible media audio with timestamp preservation.
- [x] **MM-02**: Frame sampler selecting informative keyframes from accessible video streams.
- [x] **MM-03**: OCR engine reading on-screen code snippets, terminal commands, and visible URLs from sampled frames.
- [x] **MM-04**: Evidence attribution linking extracted knowledge to transcript or OCR timestamps.

### Phase 5: Search & Knowledge Discovery

- [x] **SCH-01**: Full-text search endpoint querying summaries, tags, titles, and extracted resources.
- [x] **SCH-02**: Search UI bar supporting natural search queries and category/platform filtering.
- [x] **SCH-03**: Dedicated Item Detail View showing structured knowledge, verified links, and raw evidence inspection.

### Phase 6: Background Processing & Queuing

- [ ] **JOB-01**: Redis & BullMQ integration for asynchronous job execution.
- [ ] **JOB-02**: Job retry policy with exponential backoff for transient network issues.
- [ ] **JOB-03**: Real-time status update delivery (SSE or lightweight polling) on the client.

### Phase 7: Hardening, Security & Export

- [ ] **SEC-01**: API rate limiting, payload size constraints, and request timeouts.
- [ ] **SEC-02**: Data retention controls and full export functionality (JSON / Markdown).
- [ ] **PWA-01**: PWA manifest and share-target support for mobile browser sharing.

## v2 Requirements

Deferred to future releases:
- Vector search & semantic embeddings with hybrid ranking.
- User authentication and per-user isolated libraries.
- Browser extension for 1-click reel saving.
- Native Android app for system share-sheet integration.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Bypassing login / paywalls / anti-bot mechanisms | Unsustainable, legally risky, and violates platform terms; unsupported videos are marked `unsupported_inaccessible` |
| Video hosting / CDN re-streaming | Costly and legally fraught; SAVEit stores extracted knowledge and points back to the original source URL |
| Complex social features (following, likes, comments) | SAVEit is a personal knowledge tool, not a social network |
