# Phase 5 Context: Search & Knowledge Discovery

## Phase Overview
- **Phase Number:** 05
- **Phase Name:** Search & Knowledge Discovery
- **Requirements Covered:** SCH-01, SCH-02, SCH-03
- **Goal:** Enable users to rapidly discover, query, and inspect their saved knowledge library through indexed full-text search, multi-criteria filtering, and an interactive item detail view that transparently exposes structured takeaways, verified resources, and timestamped evidence.

---

## Architectural Decisions & Guardrails

### 1. Search Engine Strategy (SCH-01)
- **MongoDB Text Search & Compound Indexes:**
  - Standard MongoDB text indexes on `title`, `summary`, `keyPoints`, `tags`, `resources.name`, and `resources.description`.
  - Weighted relevance scoring: title (weight 10), tags (weight 8), resources.name (weight 6), summary (weight 4), keyPoints (weight 3).
  - Regex fallback support for partial substring matching (e.g. searching "dock" finds "docker", "fast" finds "fastapi") because MongoDB full-text index tokenizes on whitespace/delimiters and doesn't do prefix wildcard matching natively.
  - No external heavyweight search cluster (Elasticsearch, Meilisearch, Pinecone) required for v1. Keeps deployment lightweight, local, free, and self-contained within MongoDB.
- **Server-Side Pagination & Safety:**
  - Paginated search via `GET /api/items` with query parameters: `q`, `tag`, `platform`, `status`, `contentType`, `sortBy` (`capturedAt`, `analyzedAt`, `relevance`), `sortOrder` (`asc`, `desc`), `page`, `limit`.
  - Max limit capped at 100 to prevent DOS / memory bloat.
  - Sanitization of regex special characters (`[.*+?^${}()|[\]\\]`) to prevent ReDoS attacks.

### 2. Search & Filtering User Experience (SCH-02)
- **Interactive Search Bar:**
  - Debounced input (300ms) with instant clear action (`ESC` or clear icon).
  - Quick filter chips for popular tags and platforms (YouTube Shorts, Instagram Reels).
  - Status filter pill (All, Analyzed, Metadata Only, Processing, Inaccessible).
  - Distinct UI feedback:
    - Loading skeleton during network search.
    - Zero-results state with suggestions ("Try searching for a tool name like Docker or FastAPI").
    - Empty library state when no videos are saved yet.

### 3. Dedicated Item Detail View & Evidence Inspector (SCH-03)
- **Structured Knowledge Breakdown:**
  - High-level technical summary.
  - Actionable takeaways (`keyPoints`) rendered clearly with evidence indicator badges.
  - Extracted resources categorized into GitHub repositories, tools, documentation, and websites, with verified HTTP status badges (`verified_link`, `unverified_mention`, `unavailable`).
- **Evidence Transparency & Provenance:**
  - Display exact timestamp attribution chips: `[Transcript @ 4.5s]`, `[Frame OCR @ 6200ms]`.
  - Expandable Raw Evidence tabs:
    - **Spoken Transcript:** Timestamped segments with start time and duration.
    - **On-Screen Visual OCR:** Sequential sampled frames with detected terminal commands (`$ docker run ...`), code blocks, tool names, and URLs.
    - **Audit & Diagnostics:** Platform access level, capture timestamp, and failure diagnostics.
  - Strict Honesty: Never fabricate an attribution chip if evidence is ungrounded.

---

## Phase Plan Breakdown

- **Plan 05-01: Full-Text Search & Multi-Criteria Filtering Backend (SCH-01)**
  - MongoDB text index and weights on `title`, `summary`, `keyPoints`, `tags`, `resources.name`.
  - Enhanced `GET /api/items` supporting `q`, `tag`, `contentType`, `sortBy`, `sortOrder`, with sanitization and pagination.
  - Comprehensive unit and integration test suite (`searchController.test.ts`).

- **Plan 05-02: Search & Discovery UI Componentry (SCH-02)**
  - Search bar with debounced input and clear button.
  - Multi-criteria filter drawer/bar (Platform, Status, Tags).
  - Responsive layout integrating search with the Library Feed.

- **Plan 05-03: Rich Item Detail View & Evidence Inspector (SCH-03)**
  - Modal/drawer detail component showing structured takeaways and verified resource links.
  - Evidence Inspector displaying transcript timestamps, OCR frame observations, and terminal commands.
  - "Re-analyze" action with live feedback.
