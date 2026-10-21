---
phase: 02-retrieval-feasibility-adapters
plan: 02
subsystem: "youtube-adapter"
tags: [retrieval, adapter, youtube, captions, oembed, ssrf, vitest]
provides:
  - modular RetrievalAdapter and EvidenceReport contracts
  - production-ready YouTubeAdapter with layered zero-auth metadata and captions extraction
  - XML timedtext parser supporting standard text and millisecond paragraph formats
  - automated unit test suite with 15 mocked test cases covering all 9 required verification points
affects: [server, retrieval-adapters]
tech-stack:
  added: []
  patterns: [adapter-pattern, dependency-injection, ssrf-hop-defense, honest-status-mapping]
key-files:
  created:
    - server/src/services/retrieval/types.ts
    - server/src/services/retrieval/youtubeAdapter.ts
    - server/tests/youtubeAdapter.test.ts
  modified: []
key-decisions:
  - Strongly typed EvidenceReport contract explicitly represents 4 access levels ('full' | 'transcript_only' | 'metadata_only' | 'inaccessible')
  - Separate caption-track detection from raw transcript stream access; never claim a transcript exists merely because tracks were enumerated
  - Support dependency injection for fetchFn in YouTubeAdapter constructor for deterministic, offline testing
  - Hop-by-hop SSRF validation prevents redirect attacks targeting private or cloud metadata IPs
duration: "18min"
completed: 2026-10-21
---

# Phase 2 Plan 02: Modular Retrieval Interface & YouTube Adapter Summary

**Defined standardized `RetrievalAdapter` and `EvidenceReport` contracts, implemented `YouTubeAdapter` with layered zero-auth metadata and caption extraction, and verified with 15 comprehensive unit tests.**

## Performance

- **Duration:** 18min
- **Tasks:** 3 completed
- **Files created:** 3
- **Files modified:** 0

## Accomplishments

- Created [`server/src/services/retrieval/types.ts`](file:///home/syed-imadulla/Desktop/SAVEit/server/src/services/retrieval/types.ts) with strict TypeScript interfaces for `RetrievalAdapter`, `EvidenceReport`, `RetrievalMetadata`, `TranscriptData`, `TranscriptSegment`, and `RawEvidence`.
- Implemented [`server/src/services/retrieval/youtubeAdapter.ts`](file:///home/syed-imadulla/Desktop/SAVEit/server/src/services/retrieval/youtubeAdapter.ts):
  - Fast platform identification via `canHandle()`.
  - Zero-auth public metadata extraction via YouTube oEmbed.
  - Subtitle track discovery via player initialization data.
  - TimedText XML parser decoding both `<text start="..." dur="...">` and `<p t="..." d="...">` subtitle formats with HTML entity decoding.
  - Hop-by-hop SSRF redirect checking defending against loopback and cloud metadata targets (`169.254.169.254`).
  - Graceful degradation: assigns `metadata_only` when captions are signature-protected, and `unsupported_inaccessible` on 404/deleted videos.
- Created [`server/tests/youtubeAdapter.test.ts`](file:///home/syed-imadulla/Desktop/SAVEit/server/tests/youtubeAdapter.test.ts) with 15 unit tests covering:
  1. oEmbed metadata extraction
  2. Timestamped transcript parsing
  3. Caption tracks detected but stream empty/protected
  4. Missing captions with `metadata_only` fallback
  5. 404/deleted video handling
  6. Request timeout with `retryable_failure`
  7. Malformed non-JSON responses
  8. SSRF defense for private IPs (0 network packets sent)
  9. SSRF defense for malicious HTTP redirect hops
  10. Source URL and canonical normalized URL preservation
- Ran full test suite: **41/41 tests passing** across 4 test suites.
- Refreshed Graphify knowledge graph (282 nodes, 446 edges, 12 communities) confirming that `YouTubeAdapter` implements `RetrievalAdapter` and links to `urlValidator.ts`.

## Files Created/Modified

- [`server/src/services/retrieval/types.ts`](file:///home/syed-imadulla/Desktop/SAVEit/server/src/services/retrieval/types.ts) — Formalized retrieval interfaces and EvidenceReport payload.
- [`server/src/services/retrieval/youtubeAdapter.ts`](file:///home/syed-imadulla/Desktop/SAVEit/server/src/services/retrieval/youtubeAdapter.ts) — Production YouTubeAdapter implementation.
- [`server/tests/youtubeAdapter.test.ts`](file:///home/syed-imadulla/Desktop/SAVEit/server/tests/youtubeAdapter.test.ts) — Deterministic unit tests with mocked HTTP responses.

## Next Step Readiness

Plan 02-02 is complete; unblocked **Plan 02-03: Instagram Adapter, Registry & Backend API Pipeline Integration**.
