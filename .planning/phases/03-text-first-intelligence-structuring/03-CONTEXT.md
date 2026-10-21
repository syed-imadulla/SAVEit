# Phase 3 Context: Text-First Intelligence & Structuring

## Phase Overview
- **Phase Number:** 03
- **Phase Name:** Text-First Intelligence & Structuring
- **Requirements Covered:** AI-01, AI-02, AI-03, AI-04
- **Goal:** Transform accessible video captions, transcripts, and metadata into concise summaries, structured takeaways, relevant tags, and verified resource links (GitHub repos, tools, documentation).

---

## Decisions Made During Discussion

### 1. LLM Provider Architecture (AI-01, AI-02)
- **Primary Provider:** Google Gemini API (`@google/genai` or direct Google AI Studio API) using `process.env.GEMINI_API_KEY`.
- **Offline / Test Isolation:** Pluggable `LlmProvider` contract with a deterministic `MockLlmProvider` for automated test suites, offline development, and zero-auth runs.
- **Graceful Degradation:** When `GEMINI_API_KEY` is omitted, invalid, or quota is exhausted, system logs diagnostic errors and preserves items without crashing or blocking capture. Status remains `metadata_only` or degrades safely to `partially_analyzed`.

### 2. Execution & Trigger Strategy (AI-02, AI-03)
- **Automatic Pipeline Trigger:** When `POST /api/items` captures an item and extracts text evidence (captions or transcripts), structuring is automatically triggered as the final stage of capture.
- **Manual Re-Analysis Endpoint:** A dedicated `POST /api/items/:id/analyze` endpoint allows on-demand re-structuring (e.g. after adding an API key, retrying a transient failure, or user request).

### 3. Structured Output & Taxonomy (AI-02, AI-03)
- **Summary:** Concise 1-2 sentence high-level overview focused on technical value.
- **Key Takeaways (`keyPoints`):** 3-5 bulleted actionable items or technical steps extracted from the text.
- **Tags:** 3-7 normalized lowercase technical tags (e.g. `docker`, `react`, `typescript`, `devops`).
- **Mentioned Resources (`resources`):** Extracted references with:
  - `title`: Name of the tool, package, library, or repository.
  - `url`: Candidate or resolved link.
  - `type`: `'github_repo' | 'documentation' | 'tool' | 'website' | 'article' | 'other'`.
  - `status`: `'verified' | 'unverified_mention' | 'broken'`.
  - `description`: Contextual note of why this tool/repo was mentioned.

### 4. Resource Link Verification (AI-04, SEC-01)
- **SSRF Defense:** All candidate links pass through `isPrivateOrLoopbackHost()` before dispatch.
- **Lightweight Probing:** Uses bounded `HEAD` (or fallback `GET`) requests with 3s timeout to check HTTP response (2xx/3xx -> `'verified'`, 4xx/5xx/timeout -> `'broken'`).
- **Unverified Mentions:** If a tool or repository name is spoken but lacks an explicit valid URL, it is categorized as `'unverified_mention'` to prevent AI hallucinations.

---

## Phase Plan Breakdown

- **Plan 03-01:** Text Preprocessing Pipeline, Structuring Contracts & Gemini/Mock LLM Provider
- **Plan 03-02:** Structured Knowledge Extraction Engine & Resource Mention Parser
- **Plan 03-03:** SSRF-Guarded Link Verification Service, Mongoose Schema Updates & API Integration
