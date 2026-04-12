import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { DATA_DIR } from "../lib/data-dir";
import { dbAdapter } from "../lib/context";
import { SettingsService } from "../../core/services/settings.service";

export interface Voice {
  name: string;       // "ja-JP-NanamiNeural"
  shortName: string;  // "NanamiNeural"
  locale: string;     // "ja-JP"
  langCode: string;   // "ja"
  gender: string;     // "Female"
  displayName: string;
}

const VOICES_CACHE_PATH = join(DATA_DIR, "voices.json");
const FALLBACK_PATH = new URL("../data/voices-fallback.json", import.meta.url).pathname;

// In-memory voice list
let voiceList: Voice[] = [];

function loadFallback(): Voice[] {
  try {
    return JSON.parse(readFileSync(FALLBACK_PATH, "utf-8")) as Voice[];
  } catch {
    return [];
  }
}

function loadFromDisk(): Voice[] {
  try {
    if (existsSync(VOICES_CACHE_PATH)) {
      return JSON.parse(readFileSync(VOICES_CACHE_PATH, "utf-8")) as Voice[];
    }
  } catch {
    // ignore corrupt file
  }
  return [];
}

export function getVoices(): Voice[] {
  return voiceList;
}

export async function refreshVoices(): Promise<Voice[]> {
  try {
    // Resolve volatile constants from DB settings — no deploy needed to update them
    const { token, chromiumVersion } = await new SettingsService(dbAdapter).getEdgeTTSConfig();
    const major = chromiumVersion.split(".")[0]!;

    const res = await fetch(
      `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${token}`,
      {
        headers: {
          Authority: "speech.platform.bing.com",
          "Sec-MS-GEC-Version": `1-${chromiumVersion}`,
          "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
        },
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = (await res.json()) as Array<{
      ShortName: string;
      Locale: string;
      Gender: string;
      FriendlyName: string;
    }>;

    const mapped: Voice[] = raw.map((v) => ({
      name: v.ShortName,
      shortName: v.ShortName.split("-").slice(2).join("-"),
      locale: v.Locale,
      langCode: v.Locale.split("-")[0]!,
      gender: v.Gender,
      displayName: v.FriendlyName.replace("Microsoft ", "").replace(/ Online \(Natural\)/g, ""),
    }));

    voiceList = mapped;
    writeFileSync(VOICES_CACHE_PATH, JSON.stringify(mapped, null, 2));
    console.log(`✓ Voice list refreshed: ${mapped.length} voices`);
    return mapped;
  } catch (err) {
    console.warn(`⚠ Voice list refresh failed: ${err}`);
    return voiceList;
  }
}

/** Called on server startup — loads from disk or fallback, then refreshes in background. */
export function initVoices(): void {
  const fromDisk = loadFromDisk();
  voiceList = fromDisk.length > 0 ? fromDisk : loadFallback();
  console.log(`✓ Voices loaded: ${voiceList.length} (${fromDisk.length > 0 ? "from cache" : "from fallback"})`);
  // Background refresh — don't await
  refreshVoices().catch(() => {});
}
