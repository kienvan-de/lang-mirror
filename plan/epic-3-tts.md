# Epic 3 — TTS Integration & Caching

**Phase:** 3
**Goal:** Reliable TTS audio generation via node-edge-tts with a persistent disk cache.
**⚠️ HIGHEST RISK EPIC — start with US-3.1 to verify node-edge-tts works under Bun before building everything else around it.**
**Depends on:** Epic 1 complete

---

## US-3.1 — node-edge-tts Basic Integration ⚠️ PROTOTYPE FIRST

**As a** developer,
**I want** to verify that node-edge-tts works correctly under the Bun runtime,
**So that** the entire TTS stack doesn't need to be replaced after other features are built.

### Why This Is High Risk
`node-edge-tts` is a Node.js library. Bun has Node.js compatibility but not 100% parity.
Potential failure points: `net` module usage, stream APIs, native bindings, `child_process`.
Must be validated before any other TTS-dependent story begins.

### Tasks
- Install `node-edge-tts`: `bun add node-edge-tts`
- Create `src/server/services/tts.service.ts`:
  ```typescript
  import EdgeTTS from 'node-edge-tts'

  interface TTSOptions {
    text: string
    voice: string    // e.g., "ja-JP-NanamiNeural"
    speed?: number   // 0.5 to 2.0 (default 1.0)
    pitch?: number   // -10 to +10 semitones (default 0)
  }

  export async function generateTTS(opts: TTSOptions): Promise<Buffer>
  ```
- Map `speed` (float) to Edge TTS `rate` format: `+20%` for 1.2×, `-20%` for 0.8×
- Map `pitch` (semitones) to Edge TTS `pitch` format: `+2st`, `-2st`
- Write a minimal standalone test script `scripts/test-tts.ts`:
  ```
  bun run scripts/test-tts.ts
  → generates test audio and saves to /tmp/test.mp3
  → plays or logs "Success: 45231 bytes"
  ```
- Document any Bun compatibility workarounds found

### Acceptance Criteria
- [ ] `bun run scripts/test-tts.ts` produces a valid MP3 file
- [ ] Japanese, Spanish, and English voices all work
- [ ] Speed and pitch parameters affect output (audibly different)
- [ ] No runtime errors or unhandled exceptions under Bun

---

## US-3.2 — TTS Disk Cache

**As a** user,
**I want** TTS audio to be cached after first generation,
**So that** repeated playback of the same sentence is instant and works offline.

### Tasks
- Extend `src/server/services/tts.service.ts`:
  - Import `crypto` for SHA256: `Bun.hash` or Node `crypto.createHash`
  - `function getCacheKey(text, voice, speed, pitch): string`:
    ```
    SHA256(`${text}|${voice}|${speed}|${pitch}`).hex().slice(0, 16) + ".mp3"
    ```
  - `function getCachedAudio(key): Buffer | null`:
    - Check if `~/.lang-mirror/cache/tts/{key}` exists → read + return Buffer
    - Return null if not found
  - `function writeCacheAudio(key, buffer: Buffer): void`:
    - Write to `~/.lang-mirror/cache/tts/{key}`
  - Update `generateTTS` to check cache first, write to cache after generation
- Add `X-Cache: HIT` response header when served from cache
- Add `X-Cache: MISS` when freshly generated

### Acceptance Criteria
- [ ] First request: generates audio, writes to `~/.lang-mirror/cache/tts/`
- [ ] Second identical request: response header `X-Cache: HIT`
- [ ] Cache files have `.mp3` extension and are valid audio
- [ ] Cache key is deterministic (same params → same key)

---

## US-3.3 — TTS HTTP Endpoint

**As a** client,
**I want** an HTTP endpoint to retrieve TTS audio for any text/voice combination,
**So that** the React frontend can play TTS in an `<audio>` element.

### Tasks
- Implement `src/server/routes/tts.ts`:
  - `GET /api/tts?text=...&voice=...&speed=...&pitch=...`
  - Query param validation:
    - `text`: required, non-empty, max 2000 chars
    - `voice`: required, must match pattern `xx-XX-XxxxxNeural` (basic validation)
    - `speed`: optional float, clamped to 0.5–2.0, default 1.0
    - `pitch`: optional int, clamped to -10–+10, default 0
  - Call `generateTTS()` (uses cache automatically)
  - Return audio buffer as response:
    ```
    Content-Type: audio/mpeg
    Cache-Control: public, max-age=86400
    X-Cache: HIT | MISS
    ```
  - Return 400 JSON for missing/invalid params

### Acceptance Criteria
- [ ] `curl "http://localhost:7842/api/tts?text=hello&voice=en-US-JennyNeural&speed=1.0&pitch=0"` returns audio/mpeg
- [ ] Response plays correctly when loaded in `<audio>` element
- [ ] Missing `text` → 400 `{ "error": "text is required" }`
- [ ] X-Cache header present on all responses

---

## US-3.4 — Pre-Cache TTS for All Sentences

**As a** user,
**I want** TTS audio to be generated in the background when I create a language version or import a lesson,
**So that** sentences play instantly without a delay on first click.

### Tasks
- Create `src/server/services/tts-preload.service.ts`:
  - `async function preloadVersionTTS(versionId: string): Promise<void>`
  - Fetch all sentences for version
  - For each sentence:
    - Resolve voice (version override → global setting → language default)
    - Resolve speed, pitch
    - Compute cache key
    - If no cache file: generate TTS + save
    - Update `sentences.tts_cache_key` in DB
  - Run sentences sequentially (avoid overwhelming Edge TTS API)
- Wire to:
  - `POST /api/topics/:id/versions` → start preload in background (don't await)
  - `POST /api/import` → start preload for all imported versions
- Expose progress via SSE endpoint `GET /api/tts/preload-status/:versionId`:
  - Stream `data: { done: 3, total: 10 }\n\n` events
  - Close when complete

### Acceptance Criteria
- [ ] After creating a language version with sentences, cache files appear in `~/.lang-mirror/cache/tts/`
- [ ] `tts_cache_key` column populated on all sentences after preload
- [ ] Progress SSE stream sends incremental updates
- [ ] If preload fails for one sentence (e.g., network error), others continue

---

## US-3.5 — Voice List API

**As a** frontend,
**I want** a list of all available TTS voices,
**So that** users can pick voices in settings and language selectors.

### Tasks
- Create `src/server/services/voices.service.ts`:
  - Load bundled fallback: `src/server/data/voices-fallback.json`
    - Generate this file by running the Edge TTS voices list once and committing it
    - Format: `Array<{ Name: string, ShortName: string, Locale: string, Gender: string }>`
  - On server startup: trigger background refresh `refreshVoices()`
  - `refreshVoices()`:
    - Call node-edge-tts voices list API
    - Save to `~/.lang-mirror/voices.json`
    - Update in-memory cache
  - `getVoices(): Voice[]`: return in-memory list (populated from file or bundle)
- Implement routes:
  - `GET /api/tts/voices` → full voice list (filtered by `?lang=ja` optional query)
  - `POST /api/tts/voices/refresh` → force refresh, return updated list
- Voice object shape:
  ```typescript
  interface Voice {
    name: string        // "ja-JP-NanamiNeural"
    shortName: string   // "NanamiNeural"
    locale: string      // "ja-JP"
    langCode: string    // "ja"
    gender: string      // "Female"
    displayName: string // "Nanami (Japanese)"
  }
  ```

### Acceptance Criteria
- [ ] `GET /api/tts/voices` returns 300+ voices immediately on first request
- [ ] After `POST /api/tts/voices/refresh`, list is updated
- [ ] `GET /api/tts/voices?lang=ja` returns only Japanese voices
- [ ] App starts even if network is unavailable (falls back to bundled list)

---

## US-3.6 — TTS Cache Invalidation on Sentence Edit

**As a** user,
**I want** TTS audio to be regenerated when I edit a sentence's text,
**So that** I always hear the correct audio and not a stale cached version.

### Tasks
- In `PUT /api/sentences/:id` handler (in `sentences.ts`):
  - Compare incoming `text` with current `text` from DB
  - If text changed:
    1. Look up current `tts_cache_key`
    2. If cache key exists: delete the file `~/.lang-mirror/cache/tts/{key}`
    3. Set `tts_cache_key = NULL` in DB
  - Update sentence (text, translation, notes, updated_at)
- Next TTS request for this sentence will generate fresh audio and set new key

### Acceptance Criteria
- [ ] Edit sentence text → `tts_cache_key` becomes NULL in DB
- [ ] Old cache file deleted from disk
- [ ] Next `GET /api/tts?...` for edited sentence returns `X-Cache: MISS` and fresh audio
- [ ] Editing only translation/notes does NOT clear cache

---

## US-3.7 — Cache Management API

**As a** user,
**I want** to clear the TTS cache from the Settings page,
**So that** I can free up disk space or force regeneration of all audio.

### Tasks
- Add to `src/server/routes/tts.ts`:
  - `DELETE /api/tts/cache`:
    - Read all files in `~/.lang-mirror/cache/tts/`
    - Sum total bytes, count files
    - Delete all `.mp3` files
    - Run `UPDATE sentences SET tts_cache_key = NULL`
    - Return `{ deletedFiles: number, bytesFreed: number }`
  - `GET /api/tts/cache/stats`:
    - Return `{ fileCount: number, totalBytes: number, totalMB: string }`
    - Used by Settings page to show "Cache size: 48 MB (142 files)"

### Acceptance Criteria
- [ ] `DELETE /api/tts/cache` clears all files + resets DB keys
- [ ] Returns accurate `deletedFiles` and `bytesFreed`
- [ ] After clearing, next TTS request regenerates audio (X-Cache: MISS)
- [ ] `GET /api/tts/cache/stats` reflects current state
