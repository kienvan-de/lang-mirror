# Epic 9 — Import / Export

**Phase:** 2 (US-9.1–9.4) and Phase 7 (US-9.5)
**Goal:** Import lessons from JSON/YAML files and export topics back to JSON.
**Depends on:** Epic 1, Epic 2

---

## Import File Formats

The app auto-detects which format is used based on the root keys.

> **Note**: The `translation` field was removed in a refactor (see `git log`). The `notes` field
> evolved from a plain string to a `Record<uiLang, markdown>` object keyed by UI language code
> (`"en"`, `"de"`, `"ja"`, `"vi"`). Both old and new shapes are accepted during import.

### Format A: Per-language (single version)
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
        "en": "## Grammar\n**Polite greeting form** ...\n\n## Vocabulary\n- **いらっしゃいませ**: Welcome",
        "de": "## Grammatik\n...",
        "ja": "## 文法\n...",
        "vi": "## Ngữ pháp\n..."
      }
    },
    { "text": "これはいくらですか？" }
  ]
}
```
Detection: root has `"language"` field (string).

### Format B: Per-topic (multiple versions) — matches `lessons/*.json`
```json
{
  "title": "Day 13: Documentation and Specs",
  "description": "Polyglot Mastery — Week 2: Software Development Communication",
  "versions": [
    {
      "language": "en",
      "title": "Documentation and Specs",
      "description": "Week 4: Collaboration & Growth",
      "voice_name": "en-US-JennyNeural",
      "speed": 0.9,
      "sentences": [
        {
          "text": "I am writing the documentation for the new API endpoints today.",
          "notes": {
            "en": "## Grammar\n**Present continuous tense** ...",
            "de": "## Grammatik\n...",
            "ja": "## 文法\n...",
            "vi": "## Ngữ pháp\n..."
          }
        }
      ]
    },
    {
      "language": "de",
      "title": "Dokumentation und Spezifikationen",
      "voice_name": "de-DE-KatjaNeural",
      "speed": 0.85,
      "sentences": [
        { "text": "Ich schreibe heute die Dokumentation für die API.", "notes": { "en": "...", "de": "...", "ja": "...", "vi": "..." } }
      ]
    }
  ]
}
```
Detection: root has `"versions"` array.

### Sentence `notes` field
`notes` is a **`Record<uiLang, markdown>`** — an object mapping UI language codes to markdown strings:

```json
"notes": {
  "en": "## Grammar\n...\n\n## Vocabulary\n- **word**: definition",
  "de": "## Grammatik\n...\n\n## Wortschatz\n- **Wort**: Bedeutung",
  "ja": "## 文法\n...\n\n## 語彙\n- **語**: 意味",
  "vi": "## Ngữ pháp\n...\n\n## Từ vựng\n- **từ**: nghĩa"
}
```

The app displays only the note matching the current UI language. `notes` is optional — sentences without notes are valid.

---

## US-9.1 — Import API (Per-language Format)

**As a** user,
**I want** to import a single-language lesson file,
**So that** I can add pre-made lesson content without typing each sentence.

### Tasks
- Implement `src/server/services/import.service.ts`:
  - `function detectFormat(data: unknown): 'single' | 'topic' | 'invalid'`
  - `function validateSingle(data: unknown): LessonImportSingle | null` (with error messages)
  - `function validateTopic(data: unknown): LessonImportTopic | null`
- Implement `src/server/routes/import.ts`:
  - `POST /api/import` — `multipart/form-data`:
    - Fields: `file` (the JSON/YAML file), `topic_id` (optional, existing topic to attach to)
    - Parse file content (detect JSON vs YAML by extension)
    - Detect format (single vs topic)
    - For single format:
      - If `topic_id` given: add language version to existing topic
        - Error if language already exists on that topic (409)
      - If no `topic_id`: create new topic with `title` from file
      - Create language version with `language_code` from file
      - Insert all sentences with correct positions (0-indexed)
    - Return:
      ```typescript
      interface ImportResult {
        topic: Topic
        versions: Array<{ version: LanguageVersion, sentenceCount: number }>
        totalSentences: number
      }
      ```
- Validation rules:
  - `title`: required, non-empty string, max 200 chars
  - `language`: required, non-empty, max 10 chars, basic format check
  - `sentences`: required array, min 1 item, max 500 items
  - Each sentence: `text` required and non-empty
  - `translation` and `notes`: optional strings, max 500 chars each
- Error format: `{ error: "Validation failed", details: [{ field: "sentences[2].text", message: "Text is required" }] }`

### Acceptance Criteria
- [ ] Single-language JSON imports create topic + version + sentences in DB
- [ ] `topic_id` provided → sentences added to existing topic as new language version
- [ ] Duplicate language on existing topic → 409 with clear message
- [ ] Missing `title` → 400 with validation details
- [ ] All 500 sentences import correctly (boundary test)

---

## US-9.2 — Import API (Per-topic Format)

**As a** user,
**I want** to import a multi-language lesson file,
**So that** I can add a complete topic with multiple language versions in one operation.

### Tasks
- Extend import service for topic format:
  - Parse `versions` array
  - Create topic (from `title` + `description`)
  - For each version in order:
    - Create `topic_language_versions` row (set `position = index`)
    - Insert all sentences for that version
  - All operations in a single SQLite transaction (rollback all if any fail)
- If `topic_id` provided with a per-topic format file:
  - Skip creating a new topic
  - Merge versions into existing topic
  - Skip any `language` that already exists (or error — configurable via `?onDuplicate=skip|error`)
- Return same `ImportResult` shape as US-9.1

### Acceptance Criteria
- [ ] Per-topic file creates one topic + all N language versions
- [ ] All done in a transaction (partial failure rolls back everything)
- [ ] Version positions set by order in `versions` array
- [ ] Merging into existing topic adds only new languages (skips existing)

---

## US-9.3 — Import UI

**As a** user,
**I want** a guided import wizard in the app,
**So that** I can visually preview and control how a file is imported.

### Tasks
- Create `src/client/routes/import.tsx` (3-step wizard):

**Step 1 — Upload File**
- Drag-and-drop zone: accepts `.json`, `.yaml`, `.yml`
- Or: file picker button
- On file selection:
  - Send to `POST /api/import/preview` (new preview-only endpoint, no DB writes)
  - Show parsed preview:
    - Format detected: "Per-language" or "Per-topic"
    - Title: "Shopping in Tokyo"
    - Languages: 🇯🇵 JA (12 sentences), 🇪🇸 ES (12 sentences)
    - Any validation errors shown in red
  - If parse error: "❌ Could not parse file: unexpected token at line 5"

**Step 2 — Choose Target Topic**
- Radio options:
  - `○ Create new topic` (default if no topics exist)
  - `○ Add to existing topic: [searchable dropdown]`
- If "Add to existing": warn if any languages already exist there

**Step 3 — Confirm & Import**
- Summary: "Will import 2 languages, 24 total sentences into 'Shopping'"
- [Import] button → calls `POST /api/import` with `file` + `topic_id`
- Progress indicator (for large files with TTS preloading)
- On success: "✓ Imported 24 sentences" + [View Topic] link

### New API endpoint:
```
POST /api/import/preview     multipart: { file }
→ { format, title, versions: [{ language, sentenceCount }], errors: string[] }
(no DB writes)
```

### Acceptance Criteria
- [ ] Drag-and-drop works (not just file picker)
- [ ] Preview shows correct info before committing
- [ ] Invalid file shows error at step 1 (never reaches step 2)
- [ ] Import completes and shows success state with link to topic

---

## US-9.4 — YAML Import Support

**As a** user,
**I want** to import YAML-format lesson files as well as JSON,
**So that** I can use whichever format is more convenient to write.

### Tasks
- Add `js-yaml` dependency: `bun add js-yaml @types/js-yaml`
- In `import.service.ts`:
  - Detect by file extension: `.yaml` or `.yml` → parse with `js-yaml.load()`
  - `.json` → use `JSON.parse()`
  - Unknown extension → check if content looks like YAML or JSON
- Same validation and schema as JSON format
- YAML example:
  ```yaml
  title: Shopping in Tokyo
  language: ja
  sentences:
    - text: いらっしゃいませ
      translation: Welcome
      notes: Polite greeting
    - text: これはいくらですか？
      translation: How much is this?
  ```

### Acceptance Criteria
- [ ] `.yaml` file with correct structure imports successfully
- [ ] `.yml` extension also works
- [ ] Invalid YAML returns `{ error: "YAML parse error: ..." }` with 400
- [ ] YAML multi-line strings handled correctly (no mangled text)

---

## US-9.5 — Export Per-topic JSON

**As a** user,
**I want** to export a topic as a JSON file,
**So that** I can back up my lessons or share them with others.

### Tasks
- Implement `src/server/routes/export.ts`:
  - `GET /api/export/:topicId`:
    - Fetch topic + all versions + all sentences per version
    - Build per-topic format:
      ```typescript
      {
        title: string,
        description?: string,
        versions: Array<{
          language: string,
          voice_name?: string,
          sentences: Array<{
            text: string,
            translation?: string,
            notes?: string
          }>
        }>
      }
      ```
    - Return as file download:
      ```
      Content-Type: application/json
      Content-Disposition: attachment; filename="shopping-in-tokyo.json"
      ```
    - Filename: slugified topic title (spaces → hyphens, lowercase)
  - `GET /api/export/all`:
    - Export all topics
    - Use JSZip (add `jszip` dependency) to create a ZIP
    - Each topic as its own `{slug}.json` file in the ZIP
    - Return as `application/zip`

### Acceptance Criteria
- [ ] Exported file is valid JSON that can be re-imported via import API
- [ ] Filename is topic title slugified
- [ ] Export does NOT include practice_attempts data (clean content only)
- [ ] Re-importing exported file produces identical content
- [ ] `GET /api/export/all` returns a ZIP with one file per topic
