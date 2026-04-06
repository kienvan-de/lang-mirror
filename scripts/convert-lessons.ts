/**
 * scripts/convert-lessons.ts
 *
 * Converts ../lessons.md into per-day JSON files importable by lang-mirror.
 *
 * Output format: Format B (per-topic / multi-language), one file per day.
 * Each day becomes one topic with 4 language versions:
 *   - en (English B1)
 *   - de (German A1)
 *   - ja (Japanese N4)
 *   - vi (Vietnamese Native)
 *
 * Each sentence has:
 *   - text:        the sentence in that language
 *   - translation: the matching Vietnamese sentence (native reference)
 *   - notes:       auto-generated grammar hint for the language level
 *
 * Usage:
 *   bun run scripts/convert-lessons.ts
 *
 * Output:
 *   lessons/day-01-the-workspace.json
 *   lessons/day-02-ordering-at-a-cafe.json
 *   ... (14 files total)
 */

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const LESSONS_MD = join(PROJECT_ROOT, "../lessons.md");
const OUT_DIR = join(PROJECT_ROOT, "lessons");

// ── Language config ───────────────────────────────────────────────────────────

const LANG_CONFIG: Record<string, {
  code: string;
  level: string;
  voice: string;
  speed: number;
}> = {
  "English": { code: "en", level: "B1", voice: "en-US-JennyNeural", speed: 0.9 },
  "German":  { code: "de", level: "A1", voice: "de-DE-KatjaNeural",  speed: 0.85 },
  "Japanese":{ code: "ja", level: "N4", voice: "ja-JP-NanamiNeural", speed: 0.8 },
  "Vietnamese":{ code: "vi", level: "Native", voice: "vi-VN-HoaiMyNeural", speed: 1.0 },
};

// ── Grammar notes per language level ─────────────────────────────────────────
// These are brief, per-sentence grammar cues based on the level.
// The note generator inspects each sentence for common patterns.

function grammarNote(lang: string, sentence: string, index: number): string | undefined {
  const s = sentence.trim();

  if (lang === "en") {
    // B1 English — flag conditionals, present continuous, modal verbs
    if (/\bif\b/i.test(s) && /,/.test(s)) return "Conditional: 'If + present simple, … will/can…'";
    if (/\bam\b|\bis\b|\bare\b.+ing\b/i.test(s)) return "Present continuous: subject + am/is/are + verb-ing";
    if (/\bwould\b|\bcould\b|\bmight\b/i.test(s)) return "Modal verb expressing possibility or politeness";
    if (/\bso that\b/i.test(s)) return "Purpose clause: 'so that + subject + can/will…'";
    if (/\bwhile\b/i.test(s)) return "Subordinate clause with 'while' (simultaneous actions)";
    if (/\beven if\b/i.test(s)) return "Concession: 'even if' = regardless of the condition";
    if (/\bby\b.*ing\b/i.test(s)) return "Gerund phrase: 'By + verb-ing' expresses means/method";
    return undefined;
  }

  if (lang === "de") {
    // A1 German — flag verb-second, modal verbs, conjunctions that cause verb-end
    if (/\bdann\b/i.test(s)) return "Word order: 'dann' (then) causes verb-second position";
    if (/\bwenn\b/i.test(s)) return "Subordinate clause: 'wenn' sends verb to the end";
    if (/\bdamit\b/i.test(s)) return "Purpose clause: 'damit' + subject + verb-at-end";
    if (/\bdeshalb\b|\bdenn\b/i.test(s)) return "Connective: 'deshalb/denn' (therefore/because) — note word order";
    if (/\bich\s+\w+e\b/i.test(s) && index === 0) return "Present tense: regular verbs → ich + stem + -e";
    if (/\btrage\b|\bfahre\b|\bgehe\b|\barbeite\b|\bbleibe\b|\bhabe\b/i.test(s)) return "Regular verb conjugation (1st person singular)";
    if (/\bkann\b|\bmuss\b|\bwill\b|\bdarf\b/i.test(s)) return "Modal verb: infinitive goes to end of clause";
    if (/\bnie\b|\bnicht\b|\bkein/i.test(s)) return "Negation: 'nicht' (verb/adj) vs 'kein' (noun)";
    if (/\bim\b|\bam\b|\bzum\b/i.test(s)) return "Contracted preposition: im=in dem, am=an dem, zum=zu dem";
    return undefined;
  }

  if (lang === "ja") {
    // N4 Japanese — flag て-form, たり〜たり, conditional, potential, causative patterns
    if (/たり.+たり/.test(s)) return "〜たり〜たりします: listing actions (do things like X and Y)";
    if (/ために/.test(s)) return "〜ために: purpose 'in order to / for the sake of'";
    if (/ように/.test(s)) return "〜ように: purpose/manner 'so that / in a way that'";
    if (/ながら/.test(s)) return "〜ながら: simultaneous actions 'while doing…'";
    if (/かもしれません|かもしれない/.test(s)) return "〜かもしれません: possibility 'might / may'";
    if (/つもり/.test(s)) return "〜つもりです: intention 'I plan to / I intend to'";
    if (/ば|たら|なら/.test(s)) return "Conditional form: たら (if/when completed), ば (hypothetical)";
    if (/てい/.test(s)) return "〜ています: ongoing state or habitual action";
    if (/くれ|もらい|あげ/.test(s)) return "Giving/receiving verbs: direction of benefit matters";
    if (/（.+）/.test(s)) return "Furigana reading shown in （）for N4 kanji";
    return "Review verb form / politeness level (ます/です)";
  }

  // Vietnamese — native level, no grammar notes needed
  return undefined;
}

// ── Markdown parser ───────────────────────────────────────────────────────────

interface DayData {
  dayNum: number;
  title: string;
  languages: Array<{
    langKey: string;   // "English", "German", etc.
    sentences: string[];
  }>;
}

function parseSentences(dialogueLine: string): string[] {
  // Format: "1. Sentence one. 2. Sentence two. 3. ..."
  // Split on a number+period that follows any whitespace (works for all scripts)
  const raw = dialogueLine.replace(/^- \*\*Dialogue:\*\* /, "");
  // Split on whitespace followed by a digit and ". "
  return raw
    .split(/\s+(?=\d+\.\s)/)
    .map(s => s.replace(/^\d+\.\s*/, "").trim())
    .filter(s => s.length > 0);
}

function parseLessons(md: string): DayData[] {
  const days: DayData[] = [];
  const lines = md.split("\n");

  let currentDay: DayData | null = null;
  let currentLang: string | null = null;

  for (const line of lines) {
    // ### Day N: Title
    const dayMatch = line.match(/^### Day (\d+):\s*(.+)/);
    if (dayMatch) {
      if (currentDay) days.push(currentDay);
      currentDay = {
        dayNum: parseInt(dayMatch[1]!),
        title: dayMatch[2]!.trim(),
        languages: [],
      };
      currentLang = null;
      continue;
    }

    // **English (B1)** / **German (A1)** / etc.
    const langMatch = line.match(/^\*\*(English|German|Japanese|Vietnamese)\s*\([^)]+\)\*\*/);
    if (langMatch && currentDay) {
      currentLang = langMatch[1]!;
      continue;
    }

    // - **Dialogue:** 1. ...
    if (line.startsWith("- **Dialogue:**") && currentDay && currentLang) {
      const sentences = parseSentences(line);
      currentDay.languages.push({ langKey: currentLang, sentences });
      currentLang = null;
      continue;
    }
  }

  if (currentDay) days.push(currentDay);
  return days;
}

// ── JSON builder ──────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildTopicJson(day: DayData): object {
  // Find Vietnamese sentences to use as translation reference
  const viData = day.languages.find(l => l.langKey === "Vietnamese");
  const viSentences = viData?.sentences ?? [];

  const versions = day.languages
    .filter(l => l.langKey !== "Vietnamese") // VI is the translation, not a practice version
    .map(l => {
      const cfg = LANG_CONFIG[l.langKey]!;
      return {
        language: cfg.code,
        voice_name: cfg.voice,
        speed: cfg.speed,
        sentences: l.sentences.map((text, i) => {
          const entry: Record<string, string> = { text };
          // Use Vietnamese as translation for EN/DE/JA
          if (viSentences[i]) entry.translation = viSentences[i]!;
          const note = grammarNote(cfg.code, text, i);
          if (note) entry.notes = note;
          return entry;
        }),
      };
    });

  // Also include Vietnamese as its own practice version (native reading)
  if (viData) {
    const cfg = LANG_CONFIG["Vietnamese"]!;
    versions.push({
      language: cfg.code,
      voice_name: cfg.voice,
      speed: cfg.speed,
      sentences: viData.sentences.map((text) => ({ text })),
    });
  }

  return {
    title: `Day ${String(day.dayNum).padStart(2, "0")}: ${day.title}`,
    description: `Polyglot Mastery — Week ${day.dayNum <= 7 ? "1: Daily Life & Habits" : "2: Software Development Communication"}`,
    versions,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const md = readFileSync(LESSONS_MD, "utf-8");
  const days = parseLessons(md);

  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Parsed ${days.length} days from lessons.md`);

  for (const day of days) {
    const topic = buildTopicJson(day);
    const filename = `day-${String(day.dayNum).padStart(2, "0")}-${slugify(day.title)}.json`;
    const outPath = join(OUT_DIR, filename);
    writeFileSync(outPath, JSON.stringify(topic, null, 2), "utf-8");
    console.log(`  ✓ ${filename}`);
  }

  console.log(`\nDone! ${days.length} files written to lessons/`);
  console.log(`Import via: Settings → Data Management → Export, or drag each file into the Import page.`);
}

main();
