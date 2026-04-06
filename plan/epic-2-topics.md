# Epic 2 — Topic & Lesson Management

**Phase:** 2
**Goal:** Full CRUD for Topics, Language Versions, and Sentences — both backend API and frontend UI.
**Depends on:** Epic 1 complete

---

## US-2.1 — Topics CRUD API

**As a** user,
**I want** to create, read, update, and delete topics,
**So that** I can organize my language practice content.

### Tasks
- Implement `src/server/routes/topics.ts`:
  - `GET /api/topics` → list all topics with version count per topic
    ```sql
    SELECT t.*, COUNT(v.id) as version_count
    FROM topics t
    LEFT JOIN topic_language_versions v ON v.topic_id = t.id
    GROUP BY t.id
    ORDER BY t.updated_at DESC
    ```
  - `POST /api/topics` body `{ title, description? }` → insert + return new topic
  - `GET /api/topics/:id` → topic row + all versions (nested)
  - `PUT /api/topics/:id` body `{ title?, description? }` → update + return updated
  - `DELETE /api/topics/:id` → delete (CASCADE handles versions/sentences)
- Validate: `title` required, non-empty string, max 200 chars
- Return 404 for unknown topic IDs
- Return 400 for validation failures with `{ error: "...", field: "..." }`

### Acceptance Criteria
- [ ] `POST /api/topics { "title": "Shopping" }` → 201 with topic object including `id`
- [ ] `GET /api/topics` → array with `version_count` field on each topic
- [ ] `DELETE /api/topics/:id` cascades — versions and sentences also deleted
- [ ] `GET /api/topics/nonexistent` → 404

---

## US-2.2 — Topic List Page (Frontend)

**As a** user,
**I want** to see all my topics in a visual list with key info at a glance,
**So that** I can quickly find and navigate to the topic I want to practice.

### Tasks
- Create `src/client/routes/topics/index.tsx`
- Use TanStack Query: `useQuery({ queryKey: ['topics'], queryFn: () => api.getTopics() })`
- Render `<TopicCard>` for each topic:
  - Title (large, bold)
  - Description (grey, truncated 2 lines)
  - Language badges (flag emoji + code, e.g., 🇯🇵 JA, 🇪🇸 ES)
  - Sentence count (e.g., "12 sentences")
  - Progress bar (today's progress %)
  - "Practice" button → navigates to `/topics/:id`
- "New Topic" button → opens `<CreateTopicModal>`
- Empty state: "No topics yet — import a lesson or create one" with import button
- Loading skeleton (3 placeholder cards)
- Create `src/client/components/topic/TopicCard.tsx`
- Create `src/client/components/topic/CreateTopicModal.tsx`:
  - Form: title (required), description (optional)
  - On submit: `useMutation` → `POST /api/topics` → close modal + invalidate query
  - Optimistic update

### Acceptance Criteria
- [ ] Topics list loads and displays correctly
- [ ] Creating a topic via modal → appears immediately in list
- [ ] Language badges show correct flags
- [ ] Empty state shows when no topics exist

---

## US-2.3 — Topic Detail Page (Frontend)

**As a** user,
**I want** to view all language versions of a topic with their sentence lists,
**So that** I can manage content and navigate to practice.

### Tasks
- Create `src/client/routes/topics/$topicId.tsx`
- Fetch: `GET /api/topics/:id` → topic with versions
- Top section: topic title (editable inline), description, "Practice" button, "Export" button
- Language version tabs:
  - One tab per language version, label: flag + code (e.g., 🇯🇵 JA)
  - "+" tab → "Add language" modal
  - Active tab highlighted
  - Tab shows sentence count badge + progress bar
- Sentence list (active tab's version):
  - Position number, text, translation (collapsed by default), notes icon
  - "Add sentence" form at bottom (inline)
  - Edit/Delete actions on hover
- "Practice this language" button → navigate to `/practice/:topicId/:langCode`
- Handle loading and error states

### Acceptance Criteria
- [ ] Topic detail loads with correct language tabs
- [ ] Switching tabs shows correct sentences for that language
- [ ] "Practice" button navigates to correct practice route
- [ ] Empty sentence list shows add-sentence prompt

---

## US-2.4 — Sentences CRUD API

**As a** user,
**I want** to create, edit, reorder, and delete sentences within a language version,
**So that** I can manage the content I practice.

### Tasks
- Implement `src/server/routes/sentences.ts` (and extend `versions.ts`):
  - `GET /api/versions/:id/sentences` → ordered by `position ASC`
  - `POST /api/versions/:id/sentences` body `{ text, translation?, notes?, position? }`:
    - If no `position`: auto-append (max position + 1)
    - If `position` given: insert and shift others
    - Return new sentence
  - `PUT /api/sentences/:id` body `{ text?, translation?, notes?, position? }`:
    - If `text` changed: set `tts_cache_key = NULL`, delete old cache file if it exists
    - Update `updated_at`
  - `DELETE /api/sentences/:id`:
    - Delete sentence
    - Reindex remaining positions (0, 1, 2, ... sequential)
  - `POST /api/versions/:id/sentences/reorder` body `{ ids: string[] }`:
    - Validate all IDs belong to this version
    - Update `position` for each ID based on array index
    - Use SQLite transaction

### Acceptance Criteria
- [ ] New sentence appended at end with correct position
- [ ] `text` edit clears `tts_cache_key`
- [ ] Reorder updates positions correctly (verified by GET after reorder)
- [ ] Delete reindexes remaining positions (0-based sequential)

---

## US-2.5 — Sentence Management UI

**As a** user,
**I want** to add, edit, reorder, and delete sentences directly in the topic detail view,
**So that** I can build and maintain lesson content without leaving the app.

### Tasks
- Create `src/client/components/topic/SentenceList.tsx`:
  - List of `<SentenceRow>` components
  - Each row: position number, text, translation toggle, notes badge, edit/delete actions
  - Hover reveals action buttons
- Create `src/client/components/topic/SentenceRow.tsx`:
  - View mode: text + translation (collapsible)
  - Edit mode (click pencil): inline form for text/translation/notes
  - Save on Enter or blur; cancel on Escape
  - Delete: confirmation popover ("Delete this sentence?")
- Drag-to-reorder: use HTML5 drag-and-drop API (or simple ↑↓ buttons as accessible fallback)
  - On drop: call `POST /api/versions/:id/sentences/reorder`
- Add sentence form (bottom of list):
  - Text input (required), translation input (optional), notes input (optional)
  - Submit with Enter or "Add" button
  - On success: append to list without full refetch (optimistic)
- Show attempt count badge per sentence (from tracking data, prefetched)

### Acceptance Criteria
- [ ] Adding sentence → appears immediately at bottom
- [ ] Editing sentence inline → saves on Enter, cancels on Escape
- [ ] Deleting sentence → confirmation → removed from list
- [ ] Reordering → persisted (verify by refresh)

---

## US-2.6 — Language Version CRUD API

**As a** user,
**I want** to add and remove language versions from a topic,
**So that** I can practice the same content in multiple languages.

### Tasks
- Implement `src/server/routes/versions.ts`:
  - `GET /api/topics/:id/versions` → list versions for topic
  - `POST /api/topics/:id/versions` body `{ language_code, voice_name?, speed?, pitch? }`:
    - Validate `language_code` is a 2-5 char BCP-47 code (e.g., `ja`, `es`, `fr-FR`)
    - Check UNIQUE constraint: if already exists return 409 `{ error: "Language 'ja' already exists for this topic" }`
    - Insert and return new version
  - `GET /api/versions/:id` → version row + sentences array
  - `PUT /api/versions/:id` body `{ voice_name?, speed?, pitch? }` → update overrides
  - `DELETE /api/versions/:id`:
    - Delete all recordings files for this version from disk
    - Delete version (CASCADE handles sentences + attempts)

### Acceptance Criteria
- [ ] Adding duplicate language → 409 with descriptive message
- [ ] Delete version → recordings folder `recordings/{topicId}/{langCode}/` deleted from disk
- [ ] `GET /api/versions/:id` includes sentences array

---

## US-2.7 — Add Language Version UI

**As a** user,
**I want** to add a new language version to a topic via a modal,
**So that** I can practice the same topic in different languages.

### Tasks
- Create `src/client/components/topic/AddLanguageModal.tsx`:
  - Language selector: searchable dropdown populated from `GET /api/tts/voices`
    - Group by language code, show: flag + language name (e.g., "🇯🇵 Japanese")
    - Deduplicated by language code
  - Optional: voice picker (shows voices for selected language)
  - Submit → `POST /api/topics/:id/versions`
  - On success: close modal + new tab appears
  - On 409: show inline error "This language already exists for this topic"
- Wire "+" tab in topic detail to open this modal
- After creation: optionally show "Import sentences for this language?" prompt

### Acceptance Criteria
- [ ] Language dropdown is searchable and shows all available languages
- [ ] Selecting a language + saving creates the version and new tab appears
- [ ] Duplicate language shows inline error (not page crash)
