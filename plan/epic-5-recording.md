# Epic 5 — Recording & Playback

**Phase:** 3 (alongside Epic 3)
**Goal:** Browser-based audio recording, upload to server, and playback.
**Depends on:** Epic 1 complete

---

## US-5.1 — MediaRecorder Hook

**As a** developer,
**I want** a clean React hook abstraction over the browser's MediaRecorder API,
**So that** recording logic is reusable and testable, not scattered across components.

### Tasks
- Create `src/client/hooks/useRecorder.ts`:
  ```typescript
  interface UseRecorderReturn {
    start: () => Promise<void>          // requests mic permission + starts recording
    stop: () => void                    // stops recording, populates recordingBlob
    recordingBlob: Blob | null
    mimeType: string                    // "audio/webm;codecs=opus" or "audio/ogg;codecs=opus"
    isRecording: boolean
    permissionState: 'unknown' | 'granted' | 'denied' | 'unavailable'
    error: string | null
  }
  ```
- Codec detection at hook initialization:
  ```typescript
  const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : null  // unsupported browser
  ```
- `start()` implementation:
  1. Call `navigator.mediaDevices.getUserMedia({ audio: true, video: false })`
  2. Handle `NotAllowedError` → set `permissionState = 'denied'`
  3. Handle `NotFoundError` → set `permissionState = 'unavailable'`
  4. Create `MediaRecorder(stream, { mimeType })`
  5. Collect `ondataavailable` chunks into array
  6. Start recording: `recorder.start(100)` (100ms timeslices)
  7. Set `isRecording = true`
- `stop()` implementation:
  1. Call `recorder.stop()`
  2. In `onstop`: `new Blob(chunks, { type: mimeType })` → set `recordingBlob`
  3. Stop all media stream tracks (release mic)
  4. Set `isRecording = false`
- Cleanup: stop stream tracks on component unmount

### Acceptance Criteria
- [ ] `start()` triggers browser mic permission prompt
- [ ] `recordingBlob` populated after `stop()` is called
- [ ] `mimeType` correctly reflects what the browser supports
- [ ] Hook cleans up media stream on unmount (mic light turns off)
- [ ] `permissionState` correctly set on all permission outcomes

---

## US-5.2 — Upload Recording to Server

**As a** developer,
**I want** to upload the recording blob to the server after each practice cycle,
**So that** the recording is persisted and can be played back at any time.

### Tasks
- Implement `src/server/routes/recordings.ts`:
  - `POST /api/recordings/:sentenceId`:
    - Read raw body as `ArrayBuffer`
    - Detect content type from `Content-Type` header
    - Determine extension: `audio/webm` → `.webm`, `audio/ogg` → `.ogg`
    - Look up sentence → get `version_id` → get `topic_id` and `language_code`
    - Save to: `~/.lang-mirror/recordings/{topicId}/{langCode}/sentence-{sentenceId}.{ext}`
    - Create directories if they don't exist
    - Return `201 { path: "recordings/..." }`
  - Handle: unknown sentence ID → 404
  - Handle: missing/wrong content type → 400
- Create `src/client/lib/api.ts` function:
  ```typescript
  async function uploadRecording(sentenceId: string, blob: Blob): Promise<void>
  ```
  - `fetch('/api/recordings/:sentenceId', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } })`

### Acceptance Criteria
- [ ] `POST /api/recordings/:id` with webm blob → 201, file saved on disk
- [ ] File path: `~/.lang-mirror/recordings/{topicId}/{langCode}/sentence-{id}.webm`
- [ ] Second upload for same sentence overwrites the file
- [ ] Directory created if it doesn't exist

---

## US-5.3 — Recording Playback

**As a** user,
**I want** to hear my own recording played back after each practice cycle,
**So that** I can compare my pronunciation to the TTS model.

### Tasks
- Implement in `src/server/routes/recordings.ts`:
  - `GET /api/recordings/:sentenceId`:
    - Look for file at `~/.lang-mirror/recordings/{topicId}/{langCode}/sentence-{sentenceId}.*`
    - Try `.webm` then `.ogg` (handle both extensions)
    - If found: stream file with correct `Content-Type`
    - If not found: return 404 `{ "error": "No recording for this sentence" }`
- Frontend playback:
  - After upload completes: set `<audio>` element `src` to `/api/recordings/:sentenceId`
  - Play the audio
  - Show "No recording yet" placeholder text when GET returns 404
  - Show waveform visualization if US-5.5 implemented
- `DELETE /api/recordings/:sentenceId`:
  - Delete the recording file
  - Return 204

### Acceptance Criteria
- [ ] `GET /api/recordings/:id` streams correct audio file
- [ ] Playback in `<audio>` element works in Chrome and Firefox
- [ ] 404 returned correctly when no recording exists
- [ ] After recording + upload, auto-playback plays correct audio

---

## US-5.4 — Microphone Permission Handling

**As a** user,
**I want** clear feedback when microphone access is unavailable or denied,
**So that** I understand what's wrong and how to fix it.

### Tasks
- Create `src/client/components/practice/MicPermissionBanner.tsx`:
  - Shown when `permissionState === 'denied'`:
    ```
    ⚠️ Microphone access denied
    To practice speaking, allow microphone access in your browser settings.
    [Show instructions]
    ```
  - Shown when `permissionState === 'unavailable'`:
    ```
    🎙️ No microphone detected
    Connect a microphone to use recording features.
    ```
  - Instructions modal: shows browser-specific steps to re-grant permission
    - Chrome: "Click the 🔒 icon in the address bar → Microphone → Allow"
    - Firefox: "Click the 🔒 icon → Remove Permission → Refresh"
- Check permission on practice page load using `navigator.permissions.query({ name: 'microphone' })`
- Listen for `permissionchange` events to update UI dynamically

### Acceptance Criteria
- [ ] Banner shows when permission denied
- [ ] Banner shows when no mic device
- [ ] Instructions are browser-specific (detect via `navigator.userAgent`)
- [ ] If permission granted mid-session, banner disappears without refresh

---

## US-5.5 — Waveform Visualization (Enhancement)

**As a** user,
**I want** to see an animated waveform while recording,
**So that** I get visual feedback that my microphone is working and picking up my voice.

### Tasks
- Create `src/client/components/practice/WaveformVisualizer.tsx`:
  - Props: `{ stream: MediaStream | null, isActive: boolean }`
  - Use Web Audio API:
    ```typescript
    const audioCtx = new AudioContext()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    const source = audioCtx.createMediaStreamSource(stream)
    source.connect(analyser)
    ```
  - Render with `<canvas>` element:
    - `requestAnimationFrame` loop while `isActive`
    - Draw frequency bars (fill with red/pink color during recording)
    - Show flat line when not recording
  - Clean up AudioContext on unmount
- Integrate in practice view below the sentence text
- Show during both auto and manual recording

### Acceptance Criteria
- [ ] Bars animate in response to voice input during recording
- [ ] Flat line shown when not recording
- [ ] Canvas scales responsively
- [ ] AudioContext closed cleanly on unmount (no memory leak)
