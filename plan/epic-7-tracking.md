# Epic 7 — Practice Tracking & Dashboard

**Phase:** 6
**Goal:** Log practice attempts, display progress, streak calendar, and dashboard overview.
**Depends on:** Epic 4 (practice), Epic 2 (topics)

---

## US-7.1 — Log Practice Attempt API

**As a** user,
**I want** each completed practice cycle to be recorded,
**So that** I can track my progress over time.

### Definition of "completed attempt"
One attempt = full cycle completed: **TTS played** AND **recording uploaded**.
Logged by the frontend at the end of each successful cycle.

### Tasks
- Implement in `src/server/routes/practice.ts`:
  - `POST /api/practice/attempts` body `{ sentence_id }`:
    - Validate: sentence must exist
    - Insert row: `{ id, sentence_id, attempted_at: now(), recording_path: null }`
      - `recording_path` can be populated optionally (for future use)
    - Return: created attempt object
  - Multiple calls allowed — each produces a new row (user can practice same sentence N times)
- Frontend: call this endpoint at end of cycle (after playback completes)
  - In AUTO mode: after auto-playback ends
  - In MANUAL mode: after [▶ Playback] audio ends

### Acceptance Criteria
- [ ] `POST /api/practice/attempts { "sentence_id": "abc" }` → 201 with attempt object
- [ ] Multiple attempts for same sentence all stored (not overwritten)
- [ ] Unknown sentence_id → 404
- [ ] `attempted_at` matches current server time

---

## US-7.2 — Dashboard Page

**As a** user,
**I want** a home dashboard showing my practice activity at a glance,
**So that** I'm motivated to practice and can quickly resume where I left off.

### Tasks
- Create `src/client/routes/index.tsx` (dashboard):
  - **Today's stats** card:
    - Sentence attempts today: "You practiced 24 sentences today"
    - Topics touched today (distinct)
  - **Streak** card:
    - Current streak: "🔥 5 days streak"
    - Longest streak
  - **Recent topics** (last 3 practiced):
    - Each shows: topic title, last practiced language + time ago ("2 hours ago")
    - [Continue Practice] button → resumes at last practiced sentence position (or sentence 1)
  - **All topics** shortcut: "View all topics →"
- Fetch from:
  - `GET /api/practice/stats/daily` → today's attempts + week chart
  - `GET /api/practice/stats/streak` → streak info
  - `GET /api/practice/stats/recent` → last 3 topic+language combinations practiced

### API endpoints to implement:
```
GET /api/practice/stats/daily
→ {
    today: { attempts: number, topics: number, sentences: number },
    week: Array<{ date: string, attempts: number }>  // last 7 days
  }

GET /api/practice/stats/streak
→ {
    currentStreak: number,
    longestStreak: number,
    lastPracticeDate: string | null
  }

GET /api/practice/stats/recent
→ Array<{
    topicId: string,
    topicTitle: string,
    langCode: string,
    lastAttemptAt: string,
    sentencesAttemptedToday: number,
    totalSentences: number
  }>
```

### Acceptance Criteria
- [ ] Dashboard loads correctly with real data from DB
- [ ] "Today" stats update after practice without page refresh (TanStack Query invalidation)
- [ ] [Continue Practice] navigates to `/practice/:topicId/:langCode`
- [ ] Streak shown as 0 on first use

---

## US-7.3 — Streak Calendar (Heatmap)

**As a** user,
**I want** a visual calendar showing my practice history,
**So that** I can see my consistency and feel motivated to maintain my streak.

### Tasks
- Create `src/client/components/tracking/StreakCalendar.tsx`:
  - GitHub-style contribution calendar: 12 weeks × 7 days grid
  - Each cell: a day, colored by intensity based on `attempts` count:
    - 0 → `bg-gray-100 dark:bg-gray-800` (empty)
    - 1–3 → light green
    - 4–9 → medium green
    - 10+ → dark green
  - Tooltip on hover: "Apr 5: 12 attempts"
  - Row labels: S M T W T F S
  - Column labels: month names (Jan, Feb, ...)
  - Bottom info: "Current streak: 5 days · Longest streak: 14 days"
- Fetch data: `GET /api/practice/stats/calendar?weeks=12`
  ```
  → Array<{ date: string, attempts: number }>
  ```
- Implement calendar stats endpoint:
  ```sql
  SELECT DATE(attempted_at) as date, COUNT(*) as attempts
  FROM practice_attempts
  WHERE attempted_at >= DATE('now', '-84 days')
  GROUP BY DATE(attempted_at)
  ```
- Streak calculation:
  - Query distinct practice dates descending
  - Count consecutive days from today backward

### Acceptance Criteria
- [ ] Calendar renders 12 weeks correctly
- [ ] Today's column highlighted or bordered
- [ ] Color intensity reflects attempt count
- [ ] Hover tooltip shows date + count
- [ ] Streak numbers accurate

---

## US-7.4 — Per-sentence Progress in Practice View

**As a** user,
**I want** to see how many times I've practiced each sentence,
**So that** I know which sentences I've mastered and which need more practice.

### Tasks
- Add attempt count to sentence data (extend API response):
  - `GET /api/versions/:id/sentences` → include `attempt_count` and `last_attempted_at` per sentence:
    ```sql
    SELECT s.*, COUNT(pa.id) as attempt_count, MAX(pa.attempted_at) as last_attempted_at
    FROM sentences s
    LEFT JOIN practice_attempts pa ON pa.sentence_id = s.id
    GROUP BY s.id
    ORDER BY s.position
    ```
- In `SentenceRow` component (topic detail):
  - Show attempt badge: `"5×"` (grey if 0, blue if >0, green if ≥3)
  - "New" label if 0 attempts
- In practice view:
  - Show attempt count for current sentence: "Practiced 5×" below sentence
  - Color: grey (0), blue (1-2), green (3+)
  - Show "Personal best: 5 attempts" on the sentence

### Acceptance Criteria
- [ ] Attempt count updates immediately after each practice cycle
- [ ] Correct counts shown in both topic detail and practice view
- [ ] "New" label shown for unstarted sentences

---

## US-7.5 — Lesson Progress Percentage

**As a** user,
**I want** to see how much of a lesson I've practiced today,
**So that** I can track whether I've covered all sentences.

### Definition
Progress = (number of distinct sentences with ≥1 attempt **today**) / total sentences × 100

### Tasks
- Add to API `GET /api/topics/:id` response: progress per version:
  ```typescript
  versions: Array<LanguageVersion & {
    totalSentences: number,
    practicedToday: number,   // sentences with ≥1 attempt today
    progressToday: number     // percentage 0-100
  }>
  ```
  ```sql
  SELECT COUNT(DISTINCT pa.sentence_id) as practiced_today
  FROM practice_attempts pa
  JOIN sentences s ON s.id = pa.sentence_id
  WHERE s.version_id = ? AND DATE(pa.attempted_at) = DATE('now')
  ```
- In topic detail: show progress bar per language tab
  - `<ProgressBar value={version.progressToday} />` (0-100%)
  - Color: grey (0%), blue (1-99%), green (100%)
  - Text: "8/12 today" next to bar
- In TopicCard on topics list: show progress for most-practiced language
- In practice view: show progress bar at top (how many sentences done in this session)

### Acceptance Criteria
- [ ] Progress is 0% for unstarted lessons
- [ ] Progress reaches 100% when all sentences practiced at least once today
- [ ] Progress resets to 0% the next day (based on date comparison)
- [ ] Updates immediately after each practice cycle
