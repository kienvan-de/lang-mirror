# Epic 6 — Multi-language Support

**Phase:** 5
**Goal:** Tab-based language switching in practice and interleaved drill mode.
**Depends on:** Epic 2 (topics), Epic 4 (practice)

---

## US-6.1 — Language Version Tabs in Topic Detail

**As a** user,
**I want** to see all language versions of a topic as tabs,
**So that** I can easily switch between languages and view their sentences.

### Tasks
- In `src/client/routes/topics/$topicId.tsx`:
  - Render tabs from `topic.versions` array (ordered by `position`)
  - Tab label: `{flagEmoji} {langCode.toUpperCase()}` (e.g., 🇯🇵 JA)
  - Flag emoji lookup: map BCP-47 lang code to country flag
    ```typescript
    // src/client/lib/lang-flags.ts
    const LANG_FLAGS: Record<string, string> = {
      'ja': '🇯🇵', 'es': '🇪🇸', 'fr': '🇫🇷', 'en': '🇺🇸',
      'de': '🇩🇪', 'zh': '🇨🇳', 'ko': '🇰🇷', 'pt': '🇧🇷',
      // ... extend as needed
    }
    ```
  - Active tab: highlighted border + filled background
  - Tab shows badge: sentence count (e.g., "12") + today's progress dot (green if >0)
  - "+" tab button at end → triggers `<AddLanguageModal>`
  - Tab click: sets active version in component state → renders that version's sentences below

### Acceptance Criteria
- [ ] All language versions shown as tabs
- [ ] Switching tabs loads correct sentences (via TanStack Query with `versionId` as key)
- [ ] "+" tab opens add language modal
- [ ] Flag emojis display correctly for common languages

---

## US-6.2 — Practice Language Tab Switching

**As a** user,
**I want** to switch between practice languages without leaving the practice page,
**So that** I can compare how a sentence sounds in different languages during practice.

### Tasks
- In practice page (`/practice/$topicId.$langCode`):
  - Fetch all versions for the topic: `GET /api/topics/:topicId` → `.versions`
  - Render language tabs at top of practice view (same design as topic detail tabs)
  - Active tab = current `langCode` from route
  - Clicking a tab: navigate to `/practice/$topicId/$newLangCode`
    - **Preserve** `currentSentenceIndex` when switching (pass as search param or Zustand state)
    - Reset audio state (stop any playing TTS/recording)
  - Inactive tabs show that language's TTS voice will be used

### Acceptance Criteria
- [ ] Language tabs visible in practice view
- [ ] Clicking tab navigates to correct URL `/practice/:topicId/:langCode`
- [ ] Sentence index preserved when switching (user stays at same sentence position)
- [ ] Any in-progress recording is cancelled gracefully on tab switch

---

## US-6.3 — Interleaved Multi-language Drill

**As a** user,
**I want** a drill mode that practices all languages per sentence before moving on,
**So that** I can compare how each sentence sounds across languages in sequence.

### Tasks
- Add "Interleaved" toggle to Drill mode options (checkbox/toggle)
  - Shown when starting drill if topic has 2+ language versions
- Interleaved drill sequence:
  ```
  Sentence 1:
    → Practice in Language 1 (full cycle: TTS → record → playback)
    → Practice in Language 2 (full cycle)
    → Practice in Language 3 (full cycle)
  Sentence 2:
    → Practice in Language 1
    → ...
  ```
- Language order: by `position` column on `topic_language_versions`
- In Zustand: extend drill state:
  ```typescript
  isDrillInterleaved: boolean
  drillLanguageIndex: number  // which language in the sequence
  ```
- Progress bar shows: "Sentence 2/10 · Language 2/3 (Spanish)"
- Pause/Stop behavior same as regular drill

### Acceptance Criteria
- [ ] Interleaved drill visits all languages for each sentence position
- [ ] Progress indicator shows both sentence and language position
- [ ] Language order matches tab order (by `position`)
- [ ] Single-language topics do not show the Interleaved option

---

## US-6.4 — Language Version Reordering

**As a** user,
**I want** to reorder the language tabs to define my preferred practice order,
**So that** interleaved drill uses my preferred language sequence.

### Tasks
- Add `position` column to `topic_language_versions` table in DB schema:
  ```sql
  ALTER TABLE topic_language_versions ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
  ```
  (Or include in initial schema from the start)
- Add `POST /api/topics/:id/versions/reorder` endpoint:
  - Body: `{ ids: string[] }` (ordered array of version IDs)
  - Update `position` for each based on array index
- In topic detail, language tabs are drag-reorderable:
  - Same drag-and-drop approach as sentence reorder (HTML5 DnD or ↑↓ buttons)
  - On drop: call reorder endpoint
  - Optimistic update in TanStack Query cache
- Order also reflected in practice view language tabs

### Acceptance Criteria
- [ ] Language tabs can be reordered by drag
- [ ] New order persists after page refresh
- [ ] Interleaved drill respects the new order
