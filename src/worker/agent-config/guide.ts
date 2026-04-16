/**
 * App usage guide for the AI assistant.
 *
 * Returned by the getAppGuide tool when users ask "how do I…?" questions.
 * Keep this file updated when UI changes — the assistant relies on it
 * to give accurate navigation instructions.
 */

const GUIDE_SECTIONS: Record<string, string> = {

  overview: `# Lang Mirror Today — Quick Guide

Lang Mirror Today is a language learning app where you practice by **listening** to sentences via TTS (text-to-speech), then **recording** yourself repeating them to compare.

## Main Pages
- **Dashboard** (/) — Today's practice stats, streak calendar, and recent topics
- **Topics** (/topics) — Browse, create, and manage your topics
- **Path** (/path) — Your ordered learning path
- **Import** (/import) — Import topics from JSON files
- **Settings** (/settings) — Language, TTS, practice, assistant preferences

## Core Workflow
1. Create or import a topic with sentences in one or more languages
2. Add the topic to your learning path (optional, for ordered study)
3. Practice: listen to TTS → record yourself → compare your recording with the original
4. Track your streak and daily stats on the Dashboard

You can also ask me to create topics, check your stats, or find topics to practice!`,

  dashboard: `# Dashboard

The Dashboard (/) is your home page. It shows:

- **Today's Stats** — Total practice attempts today, unique sentences practiced, topics covered
- **Streak** — Your current consecutive practice days and longest streak
- **Streak Calendar** — A heatmap showing your practice activity over the past weeks (darker = more practice)
- **Recent Topics** — Quick access to topics you've recently worked on

The stats refresh automatically every 30 seconds.`,

  topics: `# Topics

## Browsing Topics (/topics)
- See all your topics in a card grid with language flags, sentence counts, and tags
- Filter by tags (CEFR levels like A1–C2, JLPT levels N5–N1, or language tags)
- Paginated — use the page controls at the bottom

## Creating a Topic
You have three ways to create a topic:
1. **Topics page** — Click the "+" button → enter title and description → add language versions and sentences
2. **Import page** (/import) — Upload a JSON file with full topic data
3. **Ask me** — Tell me what topic you want and I'll create it with the createTopic tool

## Topic Detail (/topics/{id})
- View all language versions as tabs (click a flag to switch)
- Each version shows its sentences with text and optional notes
- Edit sentences inline, reorder them, or add new ones
- Configure TTS voice, speed, and pitch per version (gear icon)
- Export the topic as JSON for sharing

## Publishing
Topics are **private** by default (only you can see them). To share:
1. Click "Submit for Review" on the topic detail page
2. Add an optional note for the reviewer
3. An admin reviews and approves or rejects your request
4. Approved topics become visible to all users

You can check the status on your topic: private → pending → approved (or rejected with a note).`,

  practice: `# Practice

## Starting a Practice Session
1. Go to a topic detail page (/topics/{id})
2. Click "Practice" on a language version
3. This opens the practice view (/practice/{topicId}/{langCode})

## Practice Flow
Each sentence goes through this cycle:
1. **Playing** — TTS reads the sentence aloud
2. **Countdown** — Brief pause before recording starts (configurable in Settings)
3. **Recording** — Your microphone captures your attempt
4. **Uploading** — Recording is saved (if privacy setting allows)
5. **Playing Back** — Your recording plays so you can compare
6. **Done** — Move to the next sentence

## Practice Modes
- **Auto mode** — Advances through the cycle automatically. Recording window = TTS duration × multiplier (configurable in Settings, default 1.5×)
- **Manual mode** — You control when to start/stop recording and move to the next step

## Drill Mode
Drill mode cycles through **multiple language versions** of the same sentences. For example, if a topic has English and Vietnamese versions, drill mode will alternate:
- Sentence 1 in English → Sentence 1 in Vietnamese → Sentence 2 in English → …

Start drill mode from the practice view controls.

## Review (/practice/review)
After practicing, the Review page shows every sentence with:
- The original TTS audio (play button)
- Your recorded audio (play button)
- Side-by-side comparison so you can hear the difference

## Keyboard Shortcuts
Press "?" during practice to see available keyboard shortcuts.`,

  path: `# Learning Path

The Path page (/path) is your **ordered study plan**.

## Using Your Path
- Topics appear in the order you set — work through them top to bottom
- Click a topic to go to its detail page, or click "Practice" to start directly
- Your path is personal — other users have their own

## Managing Your Path
- **Add topics** — Click "Add Topic", search for topics, and add them
- **Reorder** — Use the up/down arrows to change the order
- **Remove** — Click the trash icon to remove a topic from your path (the topic itself isn't deleted)
- **Rename** — Click the pencil icon next to "My Learning Path" to rename it

You can also ask me to add topics to your path!`,

  import: `# Import

The Import page (/import) lets you create topics from JSON files.

## Steps
1. **Upload** — Drop a JSON file or click to browse. The file is validated and previewed.
2. **Configure** — Choose to create a new topic or add to an existing one. If a language version already exists, choose to skip or report an error.
3. **Confirm** — Review the preview (title, languages, sentence counts, tags) and click Import.

## JSON Format
Two formats are supported:

### Single Language
\`\`\`json
{
  "format": "single",
  "title": "Greetings",
  "language": "en",
  "sentences": [
    { "text": "Hello!", "notes": { "vi": "Xin chào!" } }
  ],
  "tags": ["A1"]
}
\`\`\`

### Multi-Language (Topic)
\`\`\`json
{
  "format": "topic",
  "title": "Greetings",
  "versions": [
    {
      "language": "en",
      "sentences": [
        { "text": "Hello!", "notes": { "vi": "Xin chào!" } }
      ]
    },
    {
      "language": "vi",
      "sentences": [
        { "text": "Xin chào!", "notes": { "en": "Hello!" } }
      ]
    }
  ],
  "tags": ["A1", "conversation"]
}
\`\`\`

Notes are optional translation hints keyed by language code.`,

  settings: `# Settings

The Settings page (/settings) has these sections:

## User
- **Native language** — Your UI language and the language the assistant will prefer
- **Learning languages** — Languages you're studying (used for filtering topics)
- **Upload recordings** — Privacy toggle for whether recordings are saved to the cloud

## Assistant
- **Assistant name** — Customize what the AI assistant calls itself (e.g. "Luna", "Sensei")

## Playback
- **Global speed** — TTS playback speed (0.5× to 2.0×)
- **Global pitch** — TTS pitch adjustment (-10 to +10)
- Speed and pitch changes may require clearing the TTS cache to take effect

## Voices
- Choose a specific TTS voice for each language you use
- Preview voices with the play button
- Search voices by name

## Practice
- **Practice mode** — Auto (hands-free) or Manual (you control each step)
- **Recording window** — How long to record relative to TTS duration (auto mode)
- **Drill pause** — Seconds between drill steps
- **Auto playback** — Automatically play back your recording after recording

## Display
- **Font size** — Text size for sentences during practice (XS to XL)

## Account
- **Delete account** — Permanently deletes all your data (requires typing "DELETE" to confirm)`,

  admin: `# Admin

Admin pages are only visible to users with the admin role.

## Users (/admin/users)
- View all registered users with stats (topics, attempts, last active)
- Change user roles (user, admin, readonly)
- Activate/deactivate users
- Delete users

## Topics (/admin/topics)
- View all topics across all users
- Manage approval requests (approve/reject with notes)

## Tags (/admin/tags)
- Create, edit, and delete tags
- Tags have a type (level, language, custom), name, and color
- Default tags include CEFR levels (A1–C2), JLPT levels (N5–N1), and language tags`,
};

/**
 * Return the guide section(s) matching the topic.
 * If no topic specified, returns the overview.
 */
export function getGuideContent(topic?: string): string {
  if (!topic) return GUIDE_SECTIONS.overview!;

  const key = topic.toLowerCase().trim();

  // Direct match
  if (GUIDE_SECTIONS[key]) return GUIDE_SECTIONS[key];

  // Fuzzy match by keyword
  const keywordMap: Record<string, string> = {
    home: "dashboard",
    stats: "dashboard",
    streak: "dashboard",
    calendar: "dashboard",
    topic: "topics",
    create: "topics",
    publish: "topics",
    share: "topics",
    review: "topics",
    approve: "topics",
    practice: "practice",
    record: "practice",
    recording: "practice",
    tts: "practice",
    drill: "practice",
    listen: "practice",
    path: "path",
    "learning path": "path",
    import: "import",
    json: "import",
    upload: "import",
    setting: "settings",
    voice: "settings",
    language: "settings",
    speed: "settings",
    pitch: "settings",
    assistant: "settings",
    "dark mode": "settings",
    admin: "admin",
    user: "admin",
    tag: "admin",
  };

  for (const [keyword, section] of Object.entries(keywordMap)) {
    if (key.includes(keyword)) return GUIDE_SECTIONS[section]!;
  }

  // No match — return full overview
  return GUIDE_SECTIONS.overview!;
}
