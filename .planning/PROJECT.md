# SAVEit

## What This Is

SAVEit is an AI-powered personal knowledge library that converts shared Instagram Reels and YouTube Shorts into structured, searchable knowledge and verified resource links. It allows users to capture educational and technical video content effortlessly, extracting takeaways, code, tools, and transcripts so they can easily find them later in seconds.

## Core Value

Turn saved short-form videos into dependable, searchable knowledge items while preserving the original source and honestly presenting what content was legitimately accessible.

## Context

Users frequently save educational, technical, and productivity short-form videos (Instagram Reels, YouTube Shorts), but saved feeds become crowded and unsearchable. Vital information is scattered across spoken audio, captions, on-screen code/text, and links in descriptions or comments. Manual note-taking adds friction, so users rarely document what they watch.

Key architectural and technical requirements:
- Monorepo architecture containing `client/` (React + TypeScript + Tailwind CSS + Vite) and `server/` (Node.js + Express + TypeScript).
- Persistent storage using MongoDB (managed locally via Docker Compose).
- Modular extraction pipeline (metadata, transcripts, OCR, vision, LLM structuring).
- Resilient capture: the submitted URL is always persisted even if retrieval or downstream AI analysis encounters limitations.
- Honest status tracking: clear distinction between full analysis, caption-only, metadata-only, retryable errors, and unsupported/inaccessible content.
- Respectful operation: no bypassing authentication or platform anti-bot measures; SSRF defenses against private network probing.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **CAPTURE-01**: User can submit an Instagram Reel or YouTube Short URL via a clean, responsive input form.
- [ ] **CAPTURE-02**: System validates URL domain, protocol, and format, defending against malformed inputs and SSRF attacks.
- [ ] **STORAGE-01**: Source URL, capture timestamp, platform, and processing status are persisted immediately upon capture.
- [ ] **STATUS-01**: System maintains distinct, honest processing states (`queued`, `full_analyzed`, `partially_analyzed`, `metadata_only`, `needs_user_input`, `retryable_failure`, `unsupported_inaccessible`).
- [ ] **LIBRARY-01**: User can view a responsive list/grid of saved items showing platform badge, original URL, capture time, and status.
- [ ] **API-01**: RESTful backend endpoints for URL creation, listing, status query, item deletion, and detail retrieval.
- [ ] **RETRIEVAL-01**: Modular retrieval adapter architecture to test and fetch accessible metadata, captions, and media without violating platform terms.
- [ ] **AI-01**: Structured extraction of summaries, key points, tags, and mentioned resources (GitHub repositories, websites, tools) from accessible evidence.
- [ ] **SEARCH-01**: Keyword and full-text search across saved video summaries, tags, titles, and extracted resources.

### Out of Scope

- **Bypassing platform login walls or anti-bot protections** — Violates platform terms and is unsustainable; inaccessible videos are honestly labeled as `unsupported_inaccessible`.
- **Complex multi-tenant billing/subscription system in v1** — Focus is on building the core personal knowledge engine first.
- **Native mobile apps in Phase 1** — Mobile responsiveness and future PWA share-target will be validated before dedicated mobile builds.

## Constraints

- **Platform Terms & Copyright**: Never attempt unauthorized scraping, credential spoofing, or bypassing security controls.
- **Security**: Strict URL parsing and private IP/SSRF filtering on all user-submitted URLs.
- **Data Minimization**: Avoid permanent storage of heavy media files if extracted text and metadata suffice.
- **Local Dev Simplicity**: Docker Compose for local MongoDB/Redis to keep developer setup lightweight and reproducible.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Monorepo (`client/` + `server/`) | Keeps frontend and backend synchronized in one git repo with shared root scripts and unified CI/local dev | — Accepted |
| Docker Compose for MongoDB & Redis | Standardizes database runtime across environments without requiring host-level service installation | — Accepted |
| Incremental & Educational Development | Paced, well-documented steps explaining software engineering design patterns and trade-offs | — Accepted |
| Honest Processing Statuses | Essential for user trust; prevents false claims when only metadata or captions are available | — Accepted |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-21 after initialization*
