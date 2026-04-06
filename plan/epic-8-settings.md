# Epic 8 — Settings & Configuration

**Phase:** 7
**Goal:** User-configurable voice selection, speed/pitch, practice mode, and data management.
**Depends on:** Epic 3 (TTS), Epic 4 (practice)

---

## US-8.1 — Settings Page Layout

**As a** user,
**I want** a well-organized Settings page,
**So that** I can find and adjust any app configuration without hunting.

### Tasks
- Create `src/client/routes/settings.tsx`
- Section layout with anchored sidebar navigation:
  ```
  [Playback]         ← TTS speed/pitch
  [Voices]           ← per-language voice selection
  [Practice]         ← mode, drill pause duration
  [Display]          ← font size (also accessible from practice view)
  [Data Management]  ← cache, recordings, export all
  ```
- Each section is a `<Card>` with a heading
- Save buttons within each section (or auto-save with debounce)
- Show "Saved ✓" feedback on successful save
- Fetch all settings on load: `GET /api/settings`

### Acceptance Criteria
- [ ] All 5 sections visible and scrollable
- [ ] Settings load on page open
- [ ] "Saved ✓" shown after each change
- [ ] Sidebar navigation scrolls to correct section

---

## US-8.2 — Voice Selection Per Language

**As a** user,
**I want** to choose a specific TTS voice for each language I practice,
**So that** I hear the accent and style I prefer.

### Tasks
- In Settings > Voices section:
  - List of language codes currently in use (from existing versions)
  - For each language: searchable dropdown of voices
    - Fetch: `GET /api/tts/voices?lang={code}`
    - Display: voice short name + gender badge (e.g., "NanamiNeural · Female")
    - Group by gender (Female / Male / Neutral)
  - [▶ Preview] button: plays a short sample phrase in the selected voice
    - Sample phrase per language (e.g., Japanese: "こんにちは", Spanish: "Hola, ¿cómo estás?")
    - Calls `GET /api/tts?text=...&voice=...&speed=1.0&pitch=0`
  - [Save] button: `PUT /api/settings/tts.voices` with full map `{ ja: "ja-JP-NanamiNeural", ... }`
- Voice lookup priority (used everywhere TTS is called):
  1. Language version override (`topic_language_versions.voice_name`)
  2. Global setting (`settings["tts.voices"][langCode]`)
  3. First available neural voice for that language (auto-select from voices list)

### Acceptance Criteria
- [ ] Dropdowns populated with correct voices for each language
- [ ] Preview plays sample audio in selected voice
- [ ] Saved voice used on next TTS request
- [ ] If selected voice is removed from Edge TTS, fall back gracefully

---

## US-8.3 — Global Speed/Pitch Settings

**As a** user,
**I want** to set a global TTS speed and pitch,
**So that** I can slow down speech for learning or speed it up as I improve.

### Tasks
- In Settings > Playback section:
  - Speed slider:
    - Range: 0.5× to 2.0× in 0.1 steps
    - Preset buttons: [0.5×] [0.75×] [1.0×] [1.25×] [1.5×] [2.0×]
    - Current value displayed: "1.2×"
  - Pitch slider:
    - Range: -10 to +10 semitones
    - Center mark at 0
    - Current value: "+2 st" or "0 (default)"
  - [▶ Preview] button (after each slider): plays sample audio
  - [Save] → `PUT /api/settings/tts.global.speed` and `PUT /api/settings/tts.global.pitch`
- Note shown: "Changing these settings will not affect cached audio. Clear cache to regenerate."

### Acceptance Criteria
- [ ] Sliders move smoothly and show correct values
- [ ] Preview reflects current slider position (not yet saved)
- [ ] After save, new TTS requests use updated speed
- [ ] "Clear cache" note is visible

---

## US-8.4 — Per-language Version Speed/Pitch Override

**As a** user,
**I want** to set a different speed for specific language versions,
**So that** I can slow down Japanese (harder) while keeping Spanish at normal speed.

### Tasks
- Add gear icon (⚙️) button to each language tab in topic detail
- Opens `<VersionSettingsPopover>` or `<VersionSettingsModal>`:
  - Title: "Japanese (ja-JP) Settings"
  - Speed slider (same as global, but shows "Global: 1.0×" as context)
  - Pitch slider (same)
  - [Clear Override] button: sets `speed = NULL, pitch = NULL` (use global)
  - [Save] → `PUT /api/versions/:id { speed, pitch }`
- When override is set: tab shows a ⚙️ indicator
- When NULL: tab shows nothing (using global)
- TTS endpoint resolution: `version.speed ?? globalSpeed`

### Acceptance Criteria
- [ ] Per-version speed overrides global when set
- [ ] "Clear override" resets to global setting
- [ ] Tab indicator shows when override is active
- [ ] TTS request uses correct speed/pitch combination

---

## US-8.5 — Practice Mode & Drill Settings

**As a** user,
**I want** to configure default practice mode and drill behavior,
**So that** the app behaves the way I prefer out of the box.

### Tasks
- In Settings > Practice section:
  - Practice mode: `[Auto] [Manual]` pill toggle (default: Auto)
    - `PUT /api/settings/practice.mode`
  - Auto-recording duration multiplier:
    - Slider: 1.2× to 2.5× of TTS duration (default 1.5×)
    - Shown as: "Recording window = 1.5× TTS duration (e.g., 3.2s TTS → 4.8s recording)"
    - `PUT /api/settings/practice.recordingMultiplier`
  - Drill auto-advance pause:
    - Options: [0.5s] [1s] [2s] [3s] (default 1s)
    - `PUT /api/settings/practice.drillPause`
  - Auto-play back recording after capture: toggle (default: on)
    - `PUT /api/settings/practice.autoPlayback`

### Acceptance Criteria
- [ ] All settings persist and are applied on next practice session
- [ ] Recording duration multiplier visible in auto-mode countdown
- [ ] Drill pause duration respected between sentences

---

## US-8.6 — Data Management

**As a** user,
**I want** tools to manage my cached data and export my content,
**So that** I can free up disk space and back up my lessons.

### Tasks
- In Settings > Data Management section:
  - **Cache stats**: "TTS Cache: 48 MB (142 files)" — from `GET /api/tts/cache/stats`
  - **[Clear TTS Cache]** button:
    - Confirmation dialog: "This will delete all cached audio. Audio will regenerate on next play."
    - Call `DELETE /api/tts/cache`
    - Show result: "✓ Deleted 142 files, freed 48 MB"
  - **[Clear All Recordings]** button:
    - Confirmation: "This will delete all your recorded audio. Practice history is kept."
    - Call `DELETE /api/recordings` (new endpoint)
    - Show result: "✓ Deleted 89 recordings"
  - **[Export All Data]** button:
    - Call `GET /api/export/all` → ZIP file download containing one JSON per topic
    - Button shows "Exporting..." spinner while processing
  - **[Copy Data Path]** button:
    - Copies `~/.lang-mirror` (expanded) to clipboard
    - Shows: "Copied to clipboard ✓"
    - Tooltip: "Cannot open Finder from browser — paste in Terminal or Finder 'Go to Folder'"

### New API endpoints needed:
```
DELETE /api/recordings              → delete all files in recordings/, return { deletedFiles, bytesFreed }
GET    /api/export/all              → ZIP of all topics as JSON files
GET    /api/settings/data-path      → { path: "/Users/name/.lang-mirror" }
```

### Acceptance Criteria
- [ ] Cache size shown accurately before clearing
- [ ] Clear operations require confirmation
- [ ] Export downloads a valid ZIP file
- [ ] Copying data path works in browser
