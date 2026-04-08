# lang-mirror — Planning Overview

## What is lang-mirror?

A desktop-oriented language **shadowing practice** app. Users listen to TTS-generated sentences,
record themselves repeating the sentence, then play back their own recording to compare.
Supports multi-language practice per topic (e.g., "Shopping" in Japanese, Spanish, and French).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun (latest) |
| Backend | `Bun.serve()` HTTP server |
| Database | SQLite via `bun:sqlite` |
| Frontend | React 18 + Vite + Tailwind CSS |
| Routing | TanStack Router (fully typed) |
| State | Zustand + TanStack Query |
| TTS | `node-edge-tts` (Microsoft Edge TTS, free) |
| Audio Recording | Web Audio API + MediaRecorder |
| Audio Formats | Chrome: `audio/webm;codecs=opus` / Firefox: `audio/ogg;codecs=opus` |
| Language | TypeScript throughout |

---

## Story Files

### Desktop Track (Bun + SQLite + filesystem)

| File | Epic | Stories | Phase |
|------|------|---------|-------|
| [epic-1-setup.md](./epic-1-setup.md) | Project Setup & Infrastructure | 7 | **Phase 1** |
| [epic-2-topics.md](./epic-2-topics.md) | Topic & Lesson Management | 7 | **Phase 2** |
| [epic-3-tts.md](./epic-3-tts.md) | TTS Integration & Caching | 7 | **Phase 3** |
| [epic-4-practice.md](./epic-4-practice.md) | Practice Session | 9 | **Phase 4** |
| [epic-5-recording.md](./epic-5-recording.md) | Recording & Playback | 5 | **Phase 3** |
| [epic-6-multilanguage.md](./epic-6-multilanguage.md) | Multi-language Support | 4 | **Phase 5** |
| [epic-7-tracking.md](./epic-7-tracking.md) | Practice Tracking & Dashboard | 5 | **Phase 6** |
| [epic-8-settings.md](./epic-8-settings.md) | Settings & Configuration | 6 | **Phase 7** |
| [epic-9-import-export.md](./epic-9-import-export.md) | Import / Export | 5 | **Phase 2+7** |
| epic-10-*.md *(TBD)* | *(Epic 10 — TBD)* | TBD | **TBD** |
| **Desktop Total** | | **55+ stories** | |

### Cloudflare Track (Workers + D1 + R2)

| File | Epic | Stories | Phase |
|------|------|---------|-------|
| [epic-11-cloudflare.md](./epic-11-cloudflare.md) | Cloudflare Deployment Target | 8 | **CF-1 → CF-4** |
| **CF Total** | | **8 stories** | |

---

## Implementation Phases

```
────────── DESKTOP TRACK ──────────

Phase 1 — Working Shell
  Epic 1: Project setup, Bun server, Vite+React SPA, SQLite init, dev tooling
  Stories: US-1.1 → US-1.7

Phase 2 — Content Management
  Epic 2: Topics & language versions CRUD (backend + frontend)
  Epic 9 (partial): Import JSON/YAML lessons (US-9.1, US-9.2, US-9.3, US-9.4)
  Stories: US-2.1 → US-2.7, US-9.1 → US-9.4

Phase 3 — Audio Core
  Epic 3: TTS integration + cache system
  Epic 5: Recording (MediaRecorder), upload, playback
  ⚠️  START WITH US-3.1 (node-edge-tts under Bun — highest risk item)
  Stories: US-3.1 → US-3.7, US-5.1 → US-5.5

Phase 4 — Practice Loop
  Epic 4: Core shadowing UX — auto + manual modes, navigation, drill mode
  Stories: US-4.1 → US-4.9

Phase 5 — Multi-language
  Epic 6: Tab switching, interleaved drill
  Stories: US-6.1 → US-6.4

Phase 6 — Tracking
  Epic 7: Attempt logging, streak calendar, progress %
  Stories: US-7.1 → US-7.5

Phase 7 — Polish
  Epic 8: Settings (voice, speed/pitch, practice mode, cache management)
  Epic 9 (remainder): Export per-topic JSON
  Stories: US-8.1 → US-8.6, US-9.5

Phase 8 — TBD (Epic 10)
  Details TBD

────────── CLOUDFLARE TRACK ──────────

CF-1 — Scaffold & Database
  Epic 11: Wrangler setup, D1 schema, CF resource provisioning
  Stories: US-11.1, US-11.2

CF-2 — Core API + Storage
  Epic 11: Port routes (topics/versions/sentences), Azure TTS + R2 cache, R2 recordings
  Stories: US-11.3, US-11.4, US-11.5

CF-3 — Import & Deploy
  Epic 11: Import route, GitHub Actions CI/CD pipeline
  Stories: US-11.6, US-11.7

CF-4 — Auth & Multi-user
  Epic 11: Cloudflare Access or JWT auth, per-user data scoping
  Stories: US-11.8
```

---

## Data Storage

```
~/.lang-mirror/
├── db.sqlite              # All relational data
├── cache/
│   └── tts/               # TTS audio (named by hash, e.g., abc123ef.mp3)
├── recordings/
│   └── {topicId}/
│       └── {langCode}/
│           └── sentence-{id}.webm  (or .ogg for Firefox)
└── voices.json            # Refreshed voice list cache
```

---

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| Practice mode | **Auto** (auto-record after TTS) by default; configurable |
| Recording duration | Fixed: `TTS duration × 1.5` with countdown |
| Recording storage | Latest only (overwrite on new attempt) |
| TTS caching | Forever (invalidate on text/voice/speed/pitch change) |
| TTS cache key | `SHA256(text + lang + voice + speed + pitch)` |
| Multi-language | Topic-based: one topic → multiple language versions |
| Import format | Both per-language JSON and per-topic JSON (auto-detected) |
| Export format | Per-topic JSON with all language versions |
| Voice list | Bundled fallback + background network refresh |
| Practice attempt logged | After full cycle: TTS played + recording uploaded |
| Progress | `sentences practiced today / total × 100%` |

---

## Technical Risks

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | **node-edge-tts under Bun** (HIGH) | Prototype US-3.1 first before building around it |
| 2 | **MediaRecorder codec** (MEDIUM) | Runtime detection with `isTypeSupported`, fallback ogg |
| 3 | **TTS duration for countdown** (MEDIUM) | Preload `<Audio>` element, read `.duration` before countdown starts |
| 4 | **SQLite concurrent writes** (LOW) | Enable WAL mode on DB open |
| 5 | **Large lesson import** (LOW) | Background TTS pre-cache with SSE progress |
