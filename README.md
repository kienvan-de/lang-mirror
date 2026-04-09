# 🪞 lang-mirror

A desktop-oriented **language shadowing practice app** — listen to TTS-generated sentences, record yourself repeating them, and compare your pronunciation to the model. Built for polyglot learners who want structured, self-paced speaking practice.

---

## ✨ What It Does

- 🎧 **Shadow any sentence** — plays TTS audio via Microsoft Edge TTS (free, 300+ voices)
- 🎙️ **Record yourself** — captures your voice directly in the browser using MediaRecorder
- 🔁 **Compare side-by-side** — auto-plays your recording back immediately after TTS
- 📚 **Multi-language topics** — one topic can have versions in Japanese, German, Vietnamese, English, and more
- 🌐 **UI in 4 languages** — the app interface itself supports EN / DE / JA / VI
- 📝 **Grammar & vocabulary notes** — every sentence includes language-specific grammar explanations and vocabulary breakdowns in all 4 UI languages
- 📈 **Progress tracking** — streak calendar, attempt counts, daily progress per topic
- 📥 **Import / Export** — load lesson files as JSON or YAML; export topics for backup or sharing
- 🤖 **Drill mode** — auto-advances through all sentences hands-free; supports interleaved multi-language drill

---

## 🗂️ Content — Lessons

14 pre-built lessons covering workplace and software development scenarios, each with 4 language versions (**EN / DE / JA / VI**):

| # | Lesson | Theme |
|---|--------|-------|
| 01 | The Workspace | Setting up and describing your workspace |
| 02 | Ordering at a Café | Coffee shop small talk |
| 03 | A Technical Bug | Diagnosing a software bug |
| 04 | Public Transport | Commuting and directions |
| 05 | Grocery Shopping | Shopping vocabulary |
| 06 | Weekend Plans | Making plans and suggestions |
| 07 | Language Learning Journey | Talking about learning languages |
| 08 | The Daily Stand-up | Agile stand-up meeting language |
| 09 | Code Review Feedback | Giving and receiving code review |
| 10 | Troubleshooting an API | Debugging API issues |
| 11 | Deployment to Production | Release and deployment workflow |
| 12 | Refactoring Legacy Code | Code quality and technical debt |
| 13 | Documentation and Specs | Writing technical documentation |
| 14 | Team Collaboration | Mentoring, brainstorming, teamwork |

Each sentence has **grammar notes + vocabulary** written in all 4 UI languages (English, Deutsch, 日本語, Tiếng Việt), including:
- Key grammar patterns explained in the reader's own language
- 4–5 vocabulary entries with definitions and context
- Furigana readings for Japanese kanji
- Language-specific metalanguage (e.g. German grammar notes written in German)

---

## 🛠️ Tech Stack

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
| UI Language | i18next (EN / DE / JA / VI) |
| Icons | Heroicons |
| Language | TypeScript throughout |

---

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh) v1.0+
- A modern browser (Chrome or Firefox recommended for recording)

### Install & Run

```bash
# Install dependencies
bun install

# Run in development (Vite + Bun server in parallel)
bun run dev

# Build for production
bun run build

# Run production server
bun run start
```

The app runs at **http://localhost:7842** by default.

### Data Directory

All user data is stored in `~/.lang-mirror/`:

```
~/.lang-mirror/
├── db.sqlite              # All relational data
├── cache/
│   └── tts/               # TTS audio cache (named by content hash)
├── recordings/
│   └── {topicId}/
│       └── {langCode}/
│           └── sentence-{id}.webm
└── voices.json            # Cached voice list
```

---

## 📦 Import Lessons

Import lesson files from the **Import** page in the app, or via API:

```bash
curl -X POST http://localhost:7842/api/import \
  -F "file=@lessons/day-13-documentation-and-specs.json"
```

### Supported Formats

**Per-language (single version):**
```json
{
  "title": "Shopping in Tokyo",
  "language": "ja",
  "voice_name": "ja-JP-NanamiNeural",
  "speed": 0.9,
  "sentences": [
    {
      "text": "いらっしゃいませ",
      "notes": {
        "en": "## Grammar\n**Polite greeting** ...\n\n## Vocabulary\n- **いらっしゃいませ**: Welcome",
        "de": "## Grammatik\n...",
        "ja": "## 文法\n...",
        "vi": "## Ngữ pháp\n..."
      }
    }
  ]
}
```

**Per-topic (multiple versions) — matches `lessons/*.json`:**
```json
{
  "title": "Day 13: Documentation and Specs",
  "description": "Polyglot Mastery — Week 2",
  "versions": [
    {
      "language": "en",
      "title": "Documentation and Specs",
      "voice_name": "en-US-JennyNeural",
      "speed": 0.9,
      "sentences": [
        {
          "text": "I am writing the documentation today.",
          "notes": {
            "en": "## Grammar\n...",
            "de": "## Grammatik\n...",
            "ja": "## 文法\n...",
            "vi": "## Ngữ pháp\n..."
          }
        }
      ]
    }
  ]
}
```

The `notes` field is a `Record<uiLang, markdown>` — one markdown string per UI language (`en`, `de`, `ja`, `vi`). It is optional; sentences without notes are valid.

> **Note**: YAML format is supported on the desktop version. The Cloudflare version accepts JSON only.

---

## 🗺️ Epics & Implementation Status

| Epic | Goal | Status |
|------|------|--------|
| [Epic 1 — Setup](plan/epic-1-setup.md) | Bun server, Vite SPA, SQLite init | ✅ Done |
| [Epic 2 — Topics](plan/epic-2-topics.md) | Topic & sentence CRUD, UI | ✅ Done |
| [Epic 3 — TTS](plan/epic-3-tts.md) | Edge TTS integration + disk cache | ✅ Done |
| [Epic 4 — Practice](plan/epic-4-practice.md) | Shadowing UX, auto/manual modes, drill | ✅ Done |
| [Epic 5 — Recording](plan/epic-5-recording.md) | MediaRecorder, upload, playback | ✅ Done |
| [Epic 6 — Multi-language](plan/epic-6-multilanguage.md) | Language tabs, interleaved drill | ✅ Done |
| [Epic 7 — Tracking](plan/epic-7-tracking.md) | Practice log, streak, dashboard | ✅ Done |
| [Epic 8 — Settings](plan/epic-8-settings.md) | Voice picker, speed/pitch, data mgmt | ✅ Done |
| [Epic 9 — Import/Export](plan/epic-9-import-export.md) | JSON/YAML import, export ZIP | ✅ Done |

---

## 📝 Lesson Notes Format

Each sentence in a lesson file can carry a `notes` object keyed by UI language code:

```json
{
  "text": "I am writing the documentation for the new API endpoints today.",
  "notes": {
    "en": "## Grammar\n**Present continuous**: *I am writing* — formed with *am* + present participle...\n\n## Vocabulary\n- **documentation**: written material explaining how something works",
    "de": "## Grammatik\n**Verlaufsform**: *I am writing* — gebildet aus *am* + Partizip Präsens...",
    "ja": "## 文法\n**現在進行形**: *I am writing* — *am* + 現在分詞...",
    "vi": "## Ngữ pháp\nTrợ từ **đang** chỉ hành động đang diễn ra..."
  }
}
```

The app displays the note in whichever language the user has set as their UI language.

---

## 🔑 Key Design Decisions

| Decision | Choice |
|----------|--------|
| Practice mode | **Auto** (auto-record after TTS) by default; switchable to Manual |
| Recording duration | `TTS duration × 1.5` with countdown timer |
| Recording storage | Latest only — new attempt overwrites previous |
| TTS caching | Forever; invalidated when sentence text changes |
| TTS cache key | `SHA256(text + voice + speed + pitch)` |
| Multi-language | Topic-based: one topic → multiple language versions |
| Notes | `Record<uiLang, markdown>` — per UI language, not per content language |
| Import format | Auto-detected: single-language or per-topic JSON/YAML |
| Export format | Per-topic JSON (re-importable) or ZIP of all topics |

---

## 📄 License

MIT — see [LICENSE](LICENSE)
