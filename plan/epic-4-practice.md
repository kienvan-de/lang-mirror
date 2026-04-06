# Epic 4 — Practice Session

**Phase:** 4
**Goal:** The core shadowing UX — playing TTS, recording, playback, navigation, drill mode.
**Depends on:** Epic 3 (TTS), Epic 5 (Recording)

---

## US-4.1 — Practice Page Route and Layout

**As a** user,
**I want** a dedicated practice page for a specific topic + language,
**So that** I can focus on shadowing without distractions.

### Tasks
- Create `src/client/routes/practice/$topicId.$langCode.tsx`
  - Route params: `topicId: string`, `langCode: string`
- Fetch sentences: `GET /api/versions/:versionId/sentences`
  - First resolve versionId by finding version where `topic_id = topicId AND language_code = langCode`
- Layout:
  - Top bar: topic title, language badge (🇯🇵 JA), mode toggle (Auto/Manual), "Back to topic" link
  - Main area: sentence display (large font), translation (toggle), notes (toggle)
  - Bottom bar: practice controls (Play, Record, Playback)
  - Sentence counter: "3 / 12" + progress dots
  - Prev / Next navigation buttons
- Navigate to first sentence on load
- Handle: no sentences → "No sentences yet — add some in the topic detail"
- Handle: version not found → redirect to `/topics/:topicId`

### Acceptance Criteria
- [ ] Route `/practice/abc123/ja` loads correctly
- [ ] Sentence text displayed in large, readable font
- [ ] Counter shows correct position
- [ ] Back link returns to topic detail

---

## US-4.2 — TTS Playback in Practice

**As a** user,
**I want** to click Play and hear the TTS audio for the current sentence,
**So that** I know how the sentence should sound.

### Tasks
- Create `src/client/hooks/useTTS.ts`:
  - Accept: `{ text, voice, speed, pitch }`
  - Build URL: `/api/tts?text=...&voice=...&speed=...&pitch=...`
  - `play()`: create `new Audio(url)`, play, return Promise that resolves when `ended`
  - Track: `isLoading` (fetching), `isPlaying` (playing), `duration` (seconds, from `audio.duration`)
  - `stop()`: pause + reset
  - Return `{ play, stop, isLoading, isPlaying, duration }`
- Resolve voice/speed/pitch: version override → global settings → language default voice
  - Fetch settings from `/api/settings` (cached by TanStack Query)
- [▶ Play] button in practice view:
  - Shows spinner while `isLoading`
  - Disabled while `isLoading` or `isPlaying`
  - On click: call `play()`
  - After `play()` resolves: trigger next step (auto-record if AUTO mode)

### Acceptance Criteria
- [ ] Clicking Play fetches and plays TTS audio
- [ ] Button disabled during playback; re-enabled after audio ends
- [ ] Loading spinner shows while audio is being fetched
- [ ] `duration` correctly reflects audio length (needed for countdown in US-4.3)

---

## US-4.3 — AUTO Mode: Auto-Record After TTS

**As a** user,
**I want** recording to start automatically after the TTS finishes playing,
**So that** I can practice in a hands-free flow — just click Play and speak.

### Tasks
- In practice view, when `practiceMode === 'auto'`:
  - After `play()` resolves (TTS ended):
    1. Start recording (call `recorder.start()`)
    2. Show countdown: `duration × 1.5` seconds (minimum 3s)
    3. Show visual countdown ring (CSS animation) + "🔴 Recording..." label
    4. When countdown reaches 0: call `recorder.stop()`
    5. Upload recording blob to server (call `uploadRecording()`)
    6. Auto-play back the recording via `<audio src="/api/recordings/:sentenceId">`
    7. Log practice attempt: `POST /api/practice/attempts { sentence_id }`
  - Countdown implementation:
    - Use `setInterval` or `requestAnimationFrame`
    - Show remaining seconds (e.g., "3.2s")
    - Visual: circular progress ring (SVG or CSS conic-gradient)
- Show full state flow in UI:
  - "Click Play to start" → "▶ Playing TTS..." → "🔴 Recording (4.8s)" → "⏵ Playing back..." → "✓ Done"

### Acceptance Criteria
- [ ] Full cycle completes without any clicks after initial [▶ Play]
- [ ] Countdown duration = TTS duration × 1.5 (minimum 3s)
- [ ] Recording stops exactly when countdown reaches 0
- [ ] Playback starts automatically after recording
- [ ] Practice attempt logged in DB

---

## US-4.4 — MANUAL Mode: Manual Record Controls

**As a** user,
**I want** explicit buttons to start/stop recording and play back,
**So that** I have full control over each step of the practice cycle.

### Tasks
- In practice view, when `practiceMode === 'manual'`:
  - Show buttons in sequence:
    - [▶ Play] → TTS plays (same as auto mode)
    - [● Record] → starts recording (button turns red, pulsing)
    - [■ Stop] → stops recording and uploads
    - [▶ Playback] → plays back the recording
  - Button states:
    - [● Record]: disabled until TTS has played at least once this sentence
    - [■ Stop]: only shown while recording
    - [▶ Playback]: disabled until recording exists
  - After [▶ Playback] completes: log practice attempt
- All buttons clearly labeled with icons + text
- "Redo" option: [● Record] again after playback (replaces previous recording)

### Acceptance Criteria
- [ ] Each button only enabled at the correct step
- [ ] Recording button is red + pulsing while recording
- [ ] Playback plays the most recently uploaded recording
- [ ] Practice attempt logged after playback completes

---

## US-4.5 — Practice Mode Toggle

**As a** user,
**I want** to switch between Auto and Manual practice modes,
**So that** I can choose my preferred practice style.

### Tasks
- Add mode toggle in practice page top bar: `[Auto] [Manual]` pill toggle
- Also in Settings page (US-8.5)
- On toggle: update Zustand `practice.store.ts` + `PUT /api/settings/practice.mode`
- Read initial mode from settings on page load
- Toggle is always visible regardless of current state (resets current cycle if mid-flow)
- If switching mid-cycle: cancel current recording if active, reset state

### Acceptance Criteria
- [ ] Toggle switches mode immediately
- [ ] Mode persists across page refresh
- [ ] Switching mode mid-cycle gracefully cancels current recording

---

## US-4.6 — Drill Mode (Auto-advance)

**As a** user,
**I want** an automatic drill that runs through all sentences without me clicking Next,
**So that** I can do a full lesson practice session hands-free.

### Tasks
- Add [▶ Start Drill] button in:
  - Topic detail page (language tab header)
  - Practice page top bar
- Drill mode behavior:
  1. Navigate to sentence 1 (or current sentence)
  2. Run full practice cycle (TTS → record → playback)
  3. Wait 1 second (configurable pause)
  4. Auto-advance to next sentence
  5. Repeat until last sentence
  6. Show "Drill complete! 🎉" toast + return to topic detail
- [⏸ Pause Drill] button: stops after current cycle completes (not mid-recording)
- [⏹ Stop Drill] button: stops immediately, stays on current sentence
- Progress bar at top showing drill position (N/M sentences + estimated time remaining)
- Drill respects current practice mode (auto/manual) — but in manual mode, drill auto-advances only (user still clicks record/stop manually)

### Acceptance Criteria
- [ ] Drill runs all sentences without user navigation
- [ ] Pause stops after current sentence cycle
- [ ] "Drill complete" shown after last sentence
- [ ] Progress bar updates correctly

---

## US-4.7 — Sentence Text Display Options

**As a** user,
**I want** to control how sentence text is displayed,
**So that** I can challenge myself (hide translation) or get help (show notes).

### Tasks
- Add display controls toolbar in practice view:
  - [👁 Translation] toggle: show/hide translation below sentence
    - Default: hidden (challenge yourself)
    - Per-session (not persisted)
  - [📝 Notes] toggle: show/hide notes field
    - Default: hidden
    - Per-session
  - [A-] [A+] font size controls:
    - 5 sizes: xs, sm, md (default), lg, xl mapped to Tailwind text sizes
    - Persisted to settings: `PUT /api/settings/display.fontSize`
- Sentence text rendered with the selected font size class
- Translation shown in subdued color below main text
- Notes shown in italics, even more subdued

### Acceptance Criteria
- [ ] Translation hidden by default; toggle shows/hides correctly
- [ ] Font size persists across page refresh
- [ ] Notes only shown when toggle is on

---

## US-4.8 — Keyboard Shortcuts in Practice

**As a** user,
**I want** keyboard shortcuts for common actions in practice mode,
**So that** I can keep my hands free and practice efficiently.

### Shortcuts
| Key | Action | Condition |
|-----|--------|-----------|
| `Space` | Play TTS | Not playing/recording |
| `R` | Start/stop recording | Manual mode only |
| `P` | Play back recording | Recording exists |
| `→` or `L` | Next sentence | Not recording |
| `←` or `H` | Previous sentence | Not recording |
| `T` | Toggle translation | Always |
| `?` | Show shortcut help | Always |
| `Escape` | Close help overlay | Help open |

### Tasks
- Create `src/client/hooks/useKeyboardShortcuts.ts`:
  - Register `keydown` listeners on `document`
  - Guard: do NOT fire if `event.target` is an `input`, `textarea`, or `select`
  - Map keys to actions based on current state
- Add `?` key → show help overlay modal listing all shortcuts
- Shortcuts only active when on the practice page (unmount hook on route change)
- Show small keyboard hint badges on buttons (e.g., `[Space]` next to Play button)

### Acceptance Criteria
- [ ] `Space` plays TTS when idle
- [ ] `→` navigates to next sentence
- [ ] Shortcuts do NOT fire when typing in an input
- [ ] `?` shows help overlay with all shortcuts listed

---

## US-4.9 — Practice Session State (Zustand)

**As a** developer,
**I want** a well-defined Zustand store for the current practice session,
**So that** state is predictable and components don't conflict with each other.

### Store Definition
```typescript
// src/client/stores/practice.store.ts
interface PracticeState {
  // Current position
  currentSentenceIndex: number
  sentences: Sentence[]

  // Audio state
  isPlayingTTS: boolean
  ttsDuration: number | null    // seconds
  isRecording: boolean
  recordingBlob: Blob | null
  isPlayingBack: boolean

  // Mode
  practiceMode: 'auto' | 'manual'

  // Drill
  isDrillMode: boolean
  isDrillPaused: boolean

  // Actions
  setCurrentIndex: (i: number) => void
  nextSentence: () => void
  prevSentence: () => void
  setTTSPlaying: (playing: boolean, duration?: number) => void
  setRecording: (recording: boolean) => void
  setRecordingBlob: (blob: Blob | null) => void
  setPlayingBack: (playing: boolean) => void
  setPracticeMode: (mode: 'auto' | 'manual') => void
  startDrill: () => void
  pauseDrill: () => void
  stopDrill: () => void
  resetSession: () => void  // called on route unmount
}
```

### Tasks
- Create `src/client/stores/practice.store.ts` with all state + actions above
- Reset store state when navigating away from practice route (use TanStack Router lifecycle)
- Connect all practice components to this store
- Ensure no race conditions between auto-record and manual mode state transitions

### Acceptance Criteria
- [ ] State transitions correctly through the full cycle in both modes
- [ ] Store resets when navigating away (no stale state on return)
- [ ] Concurrent state changes (e.g., clicking Play while recording) handled gracefully
