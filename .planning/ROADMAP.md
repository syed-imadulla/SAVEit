# Roadmap: SAVEit

## Overview

SAVEit transforms ephemeral short-form video feeds into an organized personal knowledge base. The roadmap is structured incrementally: establishing a clean, tested capture foundation first, validating real retrieval feasibility on actual platforms next, layering text and multimodal AI extraction, and finishing with robust discovery, background queuing, and hardening.

## Phases

- [ ] **Phase 1: Core Foundation & URL Capture** - Full monorepo setup, Docker MongoDB, resilient URL capture API, honest status model, responsive UI shell, and saved-items library.
- [ ] **Phase 2: Retrieval Feasibility & Adapters** - Benchmark representative public Reels/Shorts, modular retrieval interface, graceful fallback to metadata.
- [ ] **Phase 3: Text-First Intelligence & Structuring** - Summaries, key takeaways, resource mention extraction, and link verification for accessible transcripts.
- [ ] **Phase 4: Multimodal Analysis (STT & OCR)** - Speech-to-text, frame sampling, on-screen text/code OCR, and evidence attribution.
- [ ] **Phase 5: Search & Knowledge Discovery** - Full-text search across summaries/tools/tags, filtering, and comprehensive detail view.
- [ ] **Phase 6: Background Processing & Queues** - Redis + BullMQ asynchronous queues, job retries, and live client updates.
- [ ] **Phase 7: Hardening, Security & Export** - Rate limits, SSRF hardening, data retention controls, and PWA share target.

## Phase Details

### Phase 1: Core Foundation & URL Capture (Milestone 1)
**Goal**: Deliver the minimal, robust end-to-end working loop: submit a URL, validate it safely, persist it immediately with metadata, view it in a clean library feed with honest statuses, and delete it if desired.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, CAP-01, CAP-02, CAP-03, CAP-04, UI-01, UI-02, UI-03, UI-04, TEST-01
**Success Criteria** (what must be TRUE):
  1. A developer can spin up the full stack (`npm run dev` and `docker compose up -d`) in minutes with clear documentation.
  2. Submitting a valid Instagram Reel or YouTube Short URL stores the record in MongoDB and displays it in the UI with the proper platform icon, timestamp, and status.
  3. Submitting invalid, private/internal IP, or non-video URLs produces immediate, clear validation feedback without crashing.
  4. Items can be listed and removed with persistent updates.
  5. Automated tests verify URL validation, SSRF security guards, and API responses.
**Plans**: 4 plans

Plans:
- [ ] 01-01: Monorepo workspace scaffolding (`client/`, `server/`, shared configs, Docker Compose for MongoDB).
- [ ] 01-02: Backend API layer (Mongoose schema, URL validator with SSRF protection, CRUD routes, error handling).
- [ ] 01-03: Frontend application shell (Vite, React, TypeScript, Tailwind CSS, URL capture form, library feed, honest status badges).
- [ ] 01-04: Integration, automated tests, end-to-end verification, and developer guide.

### Phase 2: Retrieval Feasibility & Adapters
**Goal**: Empirically evaluate and implement modular retrieval mechanisms for Instagram and YouTube content, establishing honest data capture boundaries.
**Depends on**: Phase 1
**Requirements**: RET-01, RET-02, RET-03, RET-04, RET-05
**Success Criteria**:
  1. Systematic benchmark report documenting accessibility rates for captions, audio, video, and metadata across test URLs.
  2. Standardized `RetrievalAdapter` interface handling both YouTube and Instagram with graceful degradation to metadata-only when restricted.
  3. Processing states update accurately based on actual retrieval outcomes.
**Plans**: TBD

### Phase 3: Text-First Intelligence & Structuring
**Goal**: Transform accessible video captions and transcripts into concise, actionable summaries, tagged concepts, and verified resource links.
**Depends on**: Phase 2
**Requirements**: AI-01, AI-02, AI-03, AI-04
**Success Criteria**:
  1. Accessible transcripts are structured into bulleted takeaways and topic tags via LLM extraction.
  2. Mentioned GitHub repos, documentation links, and tools are extracted and probed for HTTP validity.
  3. Unverified or ambiguous mentions are clearly marked to prevent hallucinations.
**Plans**: TBD

### Phase 4: Multimodal Analysis (STT & OCR)
**Goal**: Extract knowledge from audio and visual video streams when full media is accessible.
**Depends on**: Phase 3
**Requirements**: MM-01, MM-02, MM-03, MM-04
**Success Criteria**:
  1. Spoken audio transcribed with timestamps using an efficient open-source or API STT engine.
  2. Informative keyframes sampled and scanned with OCR to capture on-screen terminal commands and code.
  3. User can inspect the exact evidence (timestamp, frame snippet, or text excerpt) supporting each takeaway.
**Plans**: TBD

### Phase 5: Search & Knowledge Discovery
**Goal**: Enable users to quickly retrieve saved knowledge using keywords, tools, or natural language.
**Depends on**: Phase 4
**Requirements**: SCH-01, SCH-02, SCH-03
**Success Criteria**:
  1. Search bar finds videos by mentioned tools (e.g. "Docker", "FastAPI"), topics, or summaries even if title is forgotten.
  2. Rich detail view reveals the structured breakdown, key takeaways, and verified links.
**Plans**: TBD

### Phase 6: Background Processing & Queues
**Goal**: Scale analysis asynchronously using Redis and BullMQ, handling long-running extraction jobs resiliently.
**Depends on**: Phase 5
**Requirements**: JOB-01, JOB-02, JOB-03
**Success Criteria**:
  1. URL submission returns instantly while processing executes in background workers.
  2. Transient network failures trigger exponential backoff retries without data duplication.
**Plans**: TBD

### Phase 7: Hardening, Security & Export
**Goal**: Production-ready security, privacy controls, rate limiting, and export options.
**Depends on**: Phase 6
**Requirements**: SEC-01, SEC-02, PWA-01
**Success Criteria**:
  1. Robust rate limiting and payload guards protect backend services.
  2. Users can export their entire library as JSON/Markdown or delete all records.
  3. PWA share-target allows sharing directly from mobile browsers.
**Plans**: TBD
