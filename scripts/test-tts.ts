/**
 * US-3.1 Spike — validates node-edge-tts works under Bun.
 * Run with: bun run scripts/test-tts.ts
 */
import { generateTTS } from "../src/server/services/tts.service";
import { ensureDataDirs } from "../src/server/lib/data-dir";
import { writeFileSync } from "fs";

ensureDataDirs();

const tests = [
  { text: "Hello, world! How are you today?", voice: "en-US-JennyNeural", speed: 1.0, pitch: 0, label: "English (default)" },
  { text: "こんにちは、お元気ですか？", voice: "ja-JP-NanamiNeural", speed: 1.0, pitch: 0, label: "Japanese" },
  { text: "Hola, ¿cómo estás hoy?", voice: "es-ES-ElviraNeural", speed: 1.0, pitch: 0, label: "Spanish" },
  { text: "Hello, testing faster speed.", voice: "en-US-JennyNeural", speed: 1.5, pitch: 0, label: "English fast (1.5×)" },
  { text: "Hello, testing higher pitch.", voice: "en-US-JennyNeural", speed: 1.0, pitch: 3, label: "English high pitch (+3st)" },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  process.stdout.write(`  Testing ${test.label}... `);
  try {
    const result = await generateTTS(test);
    if (result.audio.length < 1000) {
      throw new Error(`Audio too small: ${result.audio.length} bytes`);
    }
    console.log(`✓ ${result.audio.length.toLocaleString()} bytes (cache ${result.cacheHit ? "HIT" : "MISS"})`);
    passed++;
  } catch (err) {
    console.log(`✗ FAILED: ${err}`);
    failed++;
  }
}

// Save last result to /tmp for manual listening
try {
  const { audio } = await generateTTS({ text: "This is a test of the lang-mirror TTS system.", voice: "en-US-JennyNeural" });
  writeFileSync("/tmp/test-tts.mp3", audio);
  console.log("\n✓ Saved sample to /tmp/test-tts.mp3");
} catch (err) {
  console.log(`\n⚠ Could not save sample: ${err}`);
}

console.log(`\nResults: ${passed}/${tests.length} passed${failed > 0 ? `, ${failed} failed` : ""}`);
if (failed > 0) process.exit(1);
