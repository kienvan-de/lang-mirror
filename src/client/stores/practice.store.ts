import { create } from "zustand";
import type { Sentence } from "../lib/api";

export type PracticeMode = "auto" | "manual";

export type CyclePhase =
  | "idle"        // nothing started yet
  | "playing"     // TTS playing
  | "countdown"   // auto-mode: countdown before recording stops
  | "recording"   // mic active
  | "uploading"   // sending blob to server
  | "playingBack" // playing own recording
  | "done";       // cycle complete for this sentence

interface PracticeState {
  // Session data
  topicId: string;
  langCode: string;
  versionId: string;
  sentences: Sentence[];
  currentIndex: number;

  // Audio state
  phase: CyclePhase;
  ttsDuration: number | null;
  recordingBlob: Blob | null;
  hasRecording: boolean;    // true after first successful upload for current sentence

  // Display options
  showTranslation: boolean;
  showNotes: boolean;
  fontSize: "xs" | "sm" | "md" | "lg" | "xl";

  // Mode
  practiceMode: PracticeMode;

  // Drill
  isDrillMode: boolean;
  isDrillPaused: boolean;
  isDrillInterleaved: boolean;   // US-6.3: cycle through all lang versions per sentence
  drillLanguageIndex: number;    // US-6.3: which language version we're currently on

  // Keyboard help overlay
  showShortcutHelp: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────
  init: (args: {
    topicId: string;
    langCode: string;
    versionId: string;
    sentences: Sentence[];
    practiceMode: PracticeMode;
    preserveIndex?: boolean;
  }) => void;
  setCurrentIndex: (i: number) => void;
  nextSentence: () => void;
  prevSentence: () => void;

  setPhase: (phase: CyclePhase) => void;
  setTTSDuration: (d: number | null) => void;
  setRecordingBlob: (blob: Blob | null) => void;
  setHasRecording: (v: boolean) => void;

  toggleTranslation: () => void;
  toggleNotes: () => void;
  setFontSize: (size: PracticeState["fontSize"]) => void;

  setPracticeMode: (mode: PracticeMode) => void;

  startDrill: (interleaved?: boolean) => void;
  pauseDrill: () => void;
  stopDrill: () => void;
  nextDrillLanguage: (totalLanguages: number) => boolean; // returns true if advanced to next sentence

  toggleShortcutHelp: () => void;
  resetSession: () => void;
}

const DEFAULT_FONT_SIZE: PracticeState["fontSize"] = "lg";

export const usePracticeStore = create<PracticeState>((set, get) => ({
  topicId: "",
  langCode: "",
  versionId: "",
  sentences: [],
  currentIndex: 0,

  phase: "idle",
  ttsDuration: null,
  recordingBlob: null,
  hasRecording: false,

  showTranslation: false,
  showNotes: false,
  fontSize: DEFAULT_FONT_SIZE,

  practiceMode: "auto",

  isDrillMode: false,
  isDrillPaused: false,
  isDrillInterleaved: false,
  drillLanguageIndex: 0,

  showShortcutHelp: false,

  // ── Actions ──────────────────────────────────────────────────────────────

  init: ({ topicId, langCode, versionId, sentences, practiceMode, preserveIndex }) => {
    const currentIndex = preserveIndex
      ? Math.min(get().currentIndex, Math.max(0, sentences.length - 1))
      : 0;
    set({
      topicId, langCode, versionId, sentences,
      currentIndex,
      phase: "idle",
      ttsDuration: null,
      recordingBlob: null,
      hasRecording: false,
      practiceMode,
      isDrillMode: false,
      isDrillPaused: false,
      isDrillInterleaved: false,
      drillLanguageIndex: 0,
    });
  },

  setCurrentIndex: (i) => {
    const { sentences } = get();
    if (i >= 0 && i < sentences.length) {
      set({ currentIndex: i, phase: "idle", recordingBlob: null, hasRecording: false, ttsDuration: null });
    }
  },

  nextSentence: () => {
    const { currentIndex, sentences } = get();
    if (currentIndex < sentences.length - 1) {
      set({ currentIndex: currentIndex + 1, phase: "idle", recordingBlob: null, hasRecording: false, ttsDuration: null });
    }
  },

  prevSentence: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1, phase: "idle", recordingBlob: null, hasRecording: false, ttsDuration: null });
    }
  },

  setPhase: (phase) => set({ phase }),
  setTTSDuration: (d) => set({ ttsDuration: d }),
  setRecordingBlob: (blob) => set({ recordingBlob: blob }),
  setHasRecording: (v) => set({ hasRecording: v }),

  toggleTranslation: () => set((s) => ({ showTranslation: !s.showTranslation })),
  toggleNotes: () => set((s) => ({ showNotes: !s.showNotes })),
  setFontSize: (fontSize) => set({ fontSize }),

  setPracticeMode: (mode) => {
    const { phase } = get();
    if (phase === "recording" || phase === "countdown") {
      set({ phase: "idle", recordingBlob: null });
    }
    set({ practiceMode: mode });
  },

  startDrill: (interleaved = false) =>
    set({ isDrillMode: true, isDrillPaused: false, isDrillInterleaved: interleaved, drillLanguageIndex: 0 }),

  pauseDrill: () => set((s) => ({ isDrillPaused: !s.isDrillPaused })),

  stopDrill: () => set({
    isDrillMode: false, isDrillPaused: false, phase: "idle",
    isDrillInterleaved: false, drillLanguageIndex: 0,
  }),

  // Advance language index; if wrapped around, also advance sentence. Returns true if sentence advanced.
  nextDrillLanguage: (totalLanguages) => {
    const { drillLanguageIndex, currentIndex, sentences } = get();
    const nextLangIdx = drillLanguageIndex + 1;
    if (nextLangIdx < totalLanguages) {
      // Stay on same sentence, move to next language
      set({ drillLanguageIndex: nextLangIdx, phase: "idle", recordingBlob: null, hasRecording: false, ttsDuration: null });
      return false;
    } else {
      // Exhausted all languages for this sentence — advance sentence
      set({ drillLanguageIndex: 0, phase: "idle", recordingBlob: null, hasRecording: false, ttsDuration: null });
      if (currentIndex < sentences.length - 1) {
        set((s) => ({ currentIndex: s.currentIndex + 1 }));
        return true;
      }
      return true; // end of drill
    }
  },

  toggleShortcutHelp: () => set((s) => ({ showShortcutHelp: !s.showShortcutHelp })),

  resetSession: () =>
    set({
      sentences: [],
      currentIndex: 0,
      phase: "idle",
      ttsDuration: null,
      recordingBlob: null,
      hasRecording: false,
      isDrillMode: false,
      isDrillPaused: false,
      isDrillInterleaved: false,
      drillLanguageIndex: 0,
      showShortcutHelp: false,
    }),
}));
