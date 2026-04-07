/**
 * copy-vi-notes.ts
 *
 * For each lesson JSON file, reads the Vietnamese version's sentence notes
 * and copies them (under the "vi" key) into matching sentences of all other
 * language versions (matched by position index).
 *
 * Run: bun scripts/copy-vi-notes.ts
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const LESSONS_DIR = join(import.meta.dir, "../lessons");

interface Sentence {
  text: string;
  notes?: Record<string, string>;
}

interface Version {
  language: string;
  title?: string;
  description?: string;
  voice_name?: string;
  speed?: number;
  pitch?: number;
  sentences: Sentence[];
}

interface Lesson {
  title: string;
  description?: string;
  versions: Version[];
}

async function main() {
  const files = (await readdir(LESSONS_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();

  let totalUpdated = 0;

  for (const filename of files) {
    const path = join(LESSONS_DIR, filename);
    const lesson: Lesson = JSON.parse(await Bun.file(path).text());

    // Find the VI version
    const viVersion = lesson.versions.find((v) => v.language === "vi");
    if (!viVersion) {
      console.log(`⏭  ${filename}: no vi version, skipping`);
      continue;
    }

    let fileModified = false;

    for (const version of lesson.versions) {
      if (version.language === "vi") continue; // skip the source

      for (let i = 0; i < version.sentences.length; i++) {
        const viSentence = viVersion.sentences[i];
        if (!viSentence?.notes?.["vi"]) continue; // no vi note at this position

        const sentence = version.sentences[i];
        if (!sentence) continue;

        // Already has a "vi" note — skip (don't overwrite manual edits)
        if (sentence.notes?.["vi"]) continue;

        if (!sentence.notes) {
          sentence.notes = {};
        }
        sentence.notes["vi"] = viSentence.notes["vi"];
        fileModified = true;
        totalUpdated++;
      }
    }

    if (fileModified) {
      await Bun.write(path, JSON.stringify(lesson, null, 2) + "\n");
      console.log(`✅ ${filename}: updated`);
    } else {
      console.log(`⏭  ${filename}: no changes needed`);
    }
  }

  console.log(`\nDone. ${totalUpdated} sentence notes copied.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
