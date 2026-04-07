import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  PlayIcon, StopIcon, PauseIcon,
  ChevronLeftIcon, ChevronRightIcon,
  QuestionMarkCircleIcon, ForwardIcon,
  MicrophoneIcon, SpeakerWaveIcon,
  EyeIcon, DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { usePracticeStore, type PracticeMode } from "../../stores/practice.store";
import { useTTS, defaultVoiceForLang } from "../../hooks/useTTS";
import { useRecorder } from "../../hooks/useRecorder";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { WaveformVisualizer } from "../../components/practice/WaveformVisualizer";
import { MicPermissionBanner } from "../../components/practice/MicPermissionBanner";
import { ShortcutHelpOverlay } from "../../components/practice/ShortcutHelpOverlay";
import { langFlag, langLabel, langName } from "../../lib/lang";
import { api, type Version } from "../../lib/api";
import ReactMarkdown from "react-markdown";

// ── Font size mapping ──────────────────────────────────────────────────────────
const FONT_SIZES = {
  xs: "text-base",
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-3xl",
} as const;

const FONT_SIZE_ORDER: Array<keyof typeof FONT_SIZES> = ["xs", "sm", "md", "lg", "xl"];

// ── Countdown ring component ───────────────────────────────────────────────────
function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const progress = Math.max(0, remaining / total);
  const dash = circ * progress;

  return (
    <div className="relative inline-flex items-center justify-center w-20 h-20">
      <svg width="72" height="72" className="rotate-[-90deg]">
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor"
          className="text-gray-200 dark:text-gray-700" strokeWidth="4" />
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor"
          className="text-red-500" strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-sm font-mono font-bold text-red-500">
        {remaining.toFixed(1)}
      </span>
    </div>
  );
}

// ── Drill start modal ──────────────────────────────────────────────────────────
function DrillStartModal({
  versionCount,
  onStart,
  onCancel,
}: {
  versionCount: number;
  onStart: (interleaved: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [interleaved, setInterleaved] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t("practice.drillModal.title")}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t("practice.drillModal.subtitle")}
        </p>
        {versionCount >= 2 && (
          <label className="flex items-start gap-3 cursor-pointer mb-4 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <input
              type="checkbox"
              checked={interleaved}
              onChange={(e) => setInterleaved(e.target.checked)}
              className="mt-0.5 accent-purple-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t("practice.drillModal.interleaved")}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t("practice.drillModal.interleavedHint", { count: versionCount })}
              </p>
            </div>
          </label>
        )}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => onStart(interleaved)}
            className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <ForwardIcon className="w-4 h-4" /> {t("practice.drillModal.start")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main practice page ────────────────────────────────────────────────────────
export function PracticePage() {
  const { t } = useTranslation();
  const { topicId, langCode } = useParams({ strict: false }) as { topicId: string; langCode: string };
  const navigate = useNavigate();

  const store = usePracticeStore();
  const tts = useTTS();
  const recorder = useRecorder();
  const qc = useQueryClient();

  const [countdownRemaining, setCountdownRemaining] = useState(0);
  const [countdownTotal, setCountdownTotal] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showDrillModal, setShowDrillModal] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    staleTime: 60_000,
  });

  const { data: topic, isLoading: topicLoading } = useQuery({
    queryKey: ["topic", topicId],
    queryFn: () => api.getTopic(topicId),
  });

  const version = topic?.versions?.find((v) => v.language_code === langCode);
  const allVersions: Version[] = topic?.versions ?? [];

  const prevVersionIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!version || !topic) return;
    const mode = (settings?.["practice.mode"] as PracticeMode) ?? "auto";
    const preserveIndex = prevVersionIdRef.current !== undefined && prevVersionIdRef.current !== version.id;
    prevVersionIdRef.current = version.id;
    store.init({
      topicId,
      langCode,
      versionId: version.id,
      sentences: version.sentences ?? [],
      practiceMode: mode,
      preserveIndex,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id, settings]);

  useEffect(() => {
    return () => {
      store.resetSession();
      tts.stop();
      if (recorder.isRecording) recorder.stop();
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (drillTimerRef.current) clearTimeout(drillTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    sentences, currentIndex, phase, practiceMode, isDrillMode, isDrillPaused,
    isDrillInterleaved, drillLanguageIndex,
    showTranslation, showNotes, fontSize, showShortcutHelp, hasRecording,
  } = store;
  const sentence = sentences[currentIndex];
  const voice = version?.voice_name ?? defaultVoiceForLang(langCode);
  const speed = version?.speed ?? parseFloat(settings?.["tts.global.speed"] ?? "1.0");
  const pitch = version?.pitch ?? parseInt(settings?.["tts.global.pitch"] ?? "0", 10);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  const playRecordingBack = useCallback(async (sentenceId: string): Promise<void> => {
    store.setPhase("playingBack");
    return new Promise((resolve) => {
      const audio = new Audio(`/api/recordings/${sentenceId}?t=${Date.now()}`);
      playbackAudioRef.current = audio;
      audio.onended = () => { store.setPhase("done"); resolve(); };
      audio.onerror = () => { store.setPhase("done"); resolve(); };
      audio.play().catch(() => { store.setPhase("done"); resolve(); });
    });
  }, [store]);

  const logAttempt = useCallback(async () => {
    if (!sentence || !version) return;
    try {
      await api.logAttempt({ sentence_id: sentence.id, version_id: version.id, topic_id: topicId });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["topic", topicId] });
    } catch { /* non-fatal */ }
  }, [sentence, version, topicId, qc]);

  const runAutoMode = useCallback(async () => {
    if (!sentence) return;
    store.setPhase("playing");

    let ttsDur: number;
    try {
      ttsDur = await tts.play({ text: sentence.text, voice, speed, pitch });
    } catch { store.setPhase("idle"); return; }

    const recordDur = Math.max(3, ttsDur * 1.5);

    store.setPhase("recording");
    await recorder.start();

    setCountdownTotal(recordDur);
    setCountdownRemaining(recordDur);
    store.setTTSDuration(ttsDur);

    await new Promise<void>((resolve) => {
      let remaining = recordDur;
      countdownRef.current = setInterval(() => {
        remaining -= 0.1;
        setCountdownRemaining(Math.max(0, remaining));
        if (remaining <= 0) {
          stopCountdown();
          resolve();
        }
      }, 100);
    });

    recorder.stop();
    store.setPhase("uploading");
  }, [sentence, voice, speed, pitch, tts, recorder, store, stopCountdown]);

  useEffect(() => {
    if (!recorder.recordingBlob || !sentence) return;
    if (phase !== "uploading") return;

    (async () => {
      try {
        await api.uploadRecording(sentence.id, recorder.recordingBlob!);
        store.setHasRecording(true);
        await playRecordingBack(sentence.id);
        await logAttempt();
      } catch { store.setPhase("idle"); }

      if (isDrillMode && !isDrillPaused) {
        if (isDrillInterleaved && allVersions.length > 1) {
          const sentenceAdvanced = store.nextDrillLanguage(allVersions.length);
          if (!sentenceAdvanced || store.currentIndex < sentences.length - 1) {
            const nextLangIdx = store.drillLanguageIndex;
            const nextVersion = allVersions[nextLangIdx];
            if (nextVersion) {
              drillTimerRef.current = setTimeout(() => {
                navigate({ to: "/practice/$topicId/$langCode", params: { topicId, langCode: nextVersion.language_code } });
              }, 800);
            }
          } else {
            store.stopDrill();
          }
        } else {
          if (currentIndex < sentences.length - 1) {
            drillTimerRef.current = setTimeout(() => { store.nextSentence(); }, 1000);
          } else {
            store.stopDrill();
          }
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.recordingBlob]);

  const handlePlay = useCallback(() => {
    if (practiceMode === "auto") {
      runAutoMode();
    } else {
      if (!sentence) return;
      store.setPhase("playing");
      tts.play({ text: sentence.text, voice, speed, pitch })
        .then((dur) => { store.setTTSDuration(dur); store.setPhase("idle"); })
        .catch(() => store.setPhase("idle"));
    }
  }, [practiceMode, sentence, voice, speed, pitch, tts, store, runAutoMode]);

  const handleRecord = useCallback(async () => {
    if (phase === "recording") {
      recorder.stop();
      store.setPhase("uploading");
    } else {
      store.setPhase("recording");
      await recorder.start();
    }
  }, [phase, recorder, store]);

  useEffect(() => {
    if (!recorder.recordingBlob || !sentence) return;
    if (phase !== "uploading") return;
    if (practiceMode !== "manual") return;

    (async () => {
      try {
        await api.uploadRecording(sentence.id, recorder.recordingBlob!);
        store.setHasRecording(true);
      } catch { /* non-fatal */ }
      store.setPhase("idle");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.recordingBlob]);

  const handlePlayback = useCallback(async () => {
    if (!sentence || !hasRecording) return;
    await playRecordingBack(sentence.id);
    await logAttempt();
  }, [sentence, hasRecording, playRecordingBack, logAttempt]);

  const handleModeToggle = useCallback((mode: PracticeMode) => {
    if (recorder.isRecording) recorder.stop();
    tts.stop();
    stopCountdown();
    store.setPracticeMode(mode);
    api.setSetting("practice.mode", mode).catch(() => {});
  }, [recorder, tts, stopCountdown, store]);

  const handleLangSwitch = useCallback((newLangCode: string) => {
    if (newLangCode === langCode) return;
    if (recorder.isRecording) recorder.stop();
    tts.stop();
    stopCountdown();
    if (drillTimerRef.current) clearTimeout(drillTimerRef.current);
    navigate({ to: "/practice/$topicId/$langCode", params: { topicId, langCode: newLangCode } });
  }, [langCode, topicId, recorder, tts, stopCountdown, navigate]);

  const canNavigate = phase === "idle" || phase === "done";

  useKeyboardShortcuts({
    shortcuts: {
      space: () => { if (phase === "idle" || phase === "done") handlePlay(); },
      r: () => { if (practiceMode === "manual" && (phase === "idle" || phase === "recording")) handleRecord(); },
      p: () => { if (hasRecording && phase !== "recording") handlePlayback(); },
      arrowright: () => { if (canNavigate) store.nextSentence(); },
      l: () => { if (canNavigate) store.nextSentence(); },
      arrowleft: () => { if (canNavigate) store.prevSentence(); },
      h: () => { if (canNavigate) store.prevSentence(); },
      t: () => store.toggleTranslation(),
      "shift+?": () => store.toggleShortcutHelp(),
    },
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && showShortcutHelp) store.toggleShortcutHelp(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showShortcutHelp, store]);

  useEffect(() => {
    if (!topicLoading && topic && !version) {
      navigate({ to: "/topics/$topicId", params: { topicId } });
    }
  }, [topicLoading, topic, version, navigate, topicId]);

  useEffect(() => {
    if (isDrillMode && !isDrillPaused && phase === "idle" && sentence) {
      runAutoMode();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrillMode, currentIndex, drillLanguageIndex]);

  if (topicLoading || !topic || (sentences.length === 0 && !version)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 dark:text-gray-600 animate-pulse text-lg">{t("practice.loading")}</div>
      </div>
    );
  }

  if (!sentence && sentences.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{t("practice.noSentences")}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {t("practice.noSentencesSubtitle")}
        </p>
        <Link to="/topics/$topicId" params={{ topicId }}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
          {t("practice.backToTopic")}
        </Link>
      </div>
    );
  }

  const phaseLabel = {
    idle: t("practice.phaseIdle"),
    playing: t("practice.phasePlaying"),
    countdown: "",
    recording: t("practice.phaseRecording"),
    uploading: t("practice.phaseUploading"),
    playingBack: t("practice.phasePlayingBack"),
    done: t("practice.phaseDone"),
  }[phase];

  const isIdle = phase === "idle" || phase === "done";

  const interleavedLang = isDrillInterleaved ? allVersions[drillLanguageIndex] : null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center gap-3 flex-wrap shadow-sm">
        <Link to="/topics/$topicId" params={{ topicId }}
          className="text-sm text-gray-400 hover:text-blue-500 transition-colors flex items-center gap-1 shrink-0">
          <ChevronLeftIcon className="w-4 h-4" /> {topic.title}
        </Link>

        <div className="flex-1" />

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {(["auto", "manual"] as PracticeMode[]).map((m) => (
            <button key={m}
              onClick={() => handleModeToggle(m)}
              className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                practiceMode === m
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >{m}</button>
          ))}
        </div>

        {/* Drill button */}
        {!isDrillMode ? (
          <button
            onClick={() => setShowDrillModal(true)}
            disabled={sentences.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-xs font-semibold text-white transition-colors"
          ><ForwardIcon className="w-4 h-4" /> {t("practice.drill")}</button>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={() => store.pauseDrill()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-xs font-semibold text-white transition-colors">
              {isDrillPaused
                ? <><PlayIcon className="w-3.5 h-3.5" /> {t("practice.drillResume")}</>
                : <><PauseIcon className="w-3.5 h-3.5" /> {t("practice.drillPause")}</>}
            </button>
            <button onClick={() => { store.stopDrill(); tts.stop(); stopCountdown(); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-xs font-semibold text-white transition-colors">
              <StopIcon className="w-3.5 h-3.5" /> {t("practice.drillStop")}
            </button>
          </div>
        )}

        {/* Help button */}
        <button onClick={() => store.toggleShortcutHelp()}
          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 transition-colors"
          title={t("practice.shortcutsTitle")}>
          <QuestionMarkCircleIcon className="w-4 h-4" />
        </button>
      </div>

      {/* ── Language tabs ──────────────────────────────────────────────────── */}
      {allVersions.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 flex items-center gap-0 overflow-x-auto">
          {allVersions.map((v) => {
            const isActive = v.language_code === langCode;
            const isInterleaveActive = isDrillInterleaved && interleavedLang?.id === v.id;
            return (
              <button
                key={v.id}
                onClick={() => handleLangSwitch(v.language_code)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
                title={langName(v.language_code)}
              >
                <span>{langFlag(v.language_code)}</span>
                <span>{langLabel(v.language_code)}</span>
                {isInterleaveActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" title={t("practice.interleavedActive")} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Drill progress bar ─────────────────────────────────────────────── */}
      {isDrillMode && (
        <div className="h-1.5 bg-gray-200 dark:bg-gray-800">
          <div
            className="h-full bg-purple-500 transition-all duration-300"
            style={{
              width: isDrillInterleaved && allVersions.length > 1
                ? `${((currentIndex * allVersions.length + drillLanguageIndex + 1) / (sentences.length * allVersions.length)) * 100}%`
                : `${((currentIndex + 1) / sentences.length) * 100}%`
            }}
          />
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto w-full">

        {/* Mic permission */}
        {(recorder.permissionState === "denied" || recorder.permissionState === "unavailable") && (
          <div className="w-full mb-6">
            <MicPermissionBanner permissionState={recorder.permissionState} />
          </div>
        )}

        {/* Sentence counter + progress dots */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-mono text-gray-400 dark:text-gray-500">
            {currentIndex + 1} / {sentences.length}
          </span>
          {isDrillInterleaved && allVersions.length > 1 && (
            <span className="text-xs text-purple-500 dark:text-purple-400 font-medium">
              · {langFlag(allVersions[drillLanguageIndex]?.language_code ?? langCode)} {langLabel(allVersions[drillLanguageIndex]?.language_code ?? langCode)} ({drillLanguageIndex + 1}/{allVersions.length})
            </span>
          )}
          <div className="flex gap-1">
            {sentences.map((_, i) => (
              <button key={i}
                onClick={() => { if (canNavigate) store.setCurrentIndex(i); }}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentIndex ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-700 hover:bg-gray-400"
                }`}
                aria-label={t("practice.goToSentence", { n: i + 1 })}
              />
            ))}
          </div>
        </div>

        {/* Current language badge */}
        <div className="mb-4">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            {langFlag(langCode)} {langName(langCode)}
          </span>
        </div>

        {/* Sentence card */}
        {sentence && (
          <div className="w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm mb-6">

            {/* Display toolbar */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <button onClick={() => store.toggleTranslation()}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  showTranslation
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300"
                }`}>
                <EyeIcon className="w-3.5 h-3.5" /> {t("practice.translation")}
              </button>
              <button onClick={() => store.toggleNotes()}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  showNotes
                    ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-amber-300"
                }`}>
                <DocumentTextIcon className="w-3.5 h-3.5" /> {t("practice.notes")}
              </button>
              <div className="flex-1" />
              {/* Font size */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const idx = FONT_SIZE_ORDER.indexOf(fontSize);
                    if (idx > 0) store.setFontSize(FONT_SIZE_ORDER[idx - 1]!);
                  }}
                  disabled={fontSize === "xs"}
                  className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-30 text-sm"
                  title={t("practice.fontSmaller")}>A−</button>
                <button
                  onClick={() => {
                    const idx = FONT_SIZE_ORDER.indexOf(fontSize);
                    if (idx < FONT_SIZE_ORDER.length - 1) store.setFontSize(FONT_SIZE_ORDER[idx + 1]!);
                  }}
                  disabled={fontSize === "xl"}
                  className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-30 text-base"
                  title={t("practice.fontLarger")}>A+</button>
              </div>
            </div>

            {/* Sentence text */}
            <p className={`${FONT_SIZES[fontSize]} font-medium text-gray-900 dark:text-gray-100 leading-relaxed mb-3`}>
              {sentence.text}
            </p>

            {/* Attempt count */}
            {sentence.attempt_count !== undefined && (
              <div className="mb-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  (sentence.attempt_count ?? 0) === 0
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                    : (sentence.attempt_count ?? 0) >= 3
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                      : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                }`}>
                  {(sentence.attempt_count ?? 0) === 0
                    ? t("practice.sentenceNew")
                    : t("practice.sentencePracticed", { count: sentence.attempt_count })}
                </span>
              </div>
            )}

            {/* Sibling sentences (other-language versions at same position) */}
            {showTranslation && (() => {
              const siblingVersions = allVersions.filter((v) => v.language_code !== langCode);
              const siblings = siblingVersions
                .map((v) => ({
                  langCode: v.language_code,
                  text: v.sentences?.find((s) => s.position === sentence.position)?.text ?? null,
                }))
                .filter((s) => s.text !== null) as { langCode: string; text: string }[];
              return siblings.length > 0 ? (
                <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-3 space-y-1">
                  {siblings.map(({ langCode: lc, text }) => (
                    <p key={lc} className="text-sm text-gray-500 dark:text-gray-400 italic flex items-center gap-1.5">
                      <span className="not-italic">{langFlag(lc)}</span>
                      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 not-italic uppercase">{langLabel(lc)}</span>
                      {text}
                    </p>
                  ))}
                </div>
              ) : null;
            })()}

            {/* Notes — markdown rendered */}
            {showNotes && sentence.notes && (
              <div className="text-xs text-amber-700 dark:text-amber-400 mt-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 border-t border-gray-100 dark:border-gray-800 prose prose-xs prose-amber dark:prose-invert max-w-none [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mb-1 [&_p]:my-0.5 [&_ul]:my-0.5 [&_li]:my-0">
                📝 <ReactMarkdown>{sentence.notes}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Phase status */}
        <div className="mb-4 flex flex-col items-center gap-3 min-h-[5rem]">
          {phase === "recording" && (
            <CountdownRing remaining={countdownRemaining} total={countdownTotal || 1} />
          )}
          {phaseLabel && phase !== "recording" && (
            <p className={`text-sm font-medium ${
              phase === "playing" ? "text-blue-600 dark:text-blue-400" :
              phase === "playingBack" ? "text-green-600 dark:text-green-400" :
              phase === "done" ? "text-green-600 dark:text-green-400" :
              "text-gray-500 dark:text-gray-400"
            }`}>{phaseLabel}</p>
          )}

          {/* Waveform */}
          {phase === "recording" && (
            <div className="w-full max-w-sm">
              <WaveformVisualizer stream={recorder.mediaStream} isActive={recorder.isRecording} />
            </div>
          )}
        </div>

        {/* ── Controls ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap justify-center">

          {/* Prev */}
          <button onClick={() => store.prevSentence()} disabled={currentIndex === 0 || !canNavigate}
            className="w-10 h-10 rounded-full flex items-center justify-center border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
            title={t("practice.prevTitle")}><ChevronLeftIcon className="w-5 h-5" /></button>

          {/* Play TTS */}
          <button
            onClick={handlePlay}
            disabled={!isIdle || tts.isLoading || tts.isPlaying}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold transition-colors shadow-sm"
            title={t("practice.playTitle")}
          >
            {tts.isLoading ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : <PlayIcon className="w-5 h-5" />}
            {t("practice.play")}
            <kbd className="hidden sm:inline text-[10px] px-1 py-0.5 rounded bg-white/20 font-mono">Space</kbd>
          </button>

          {/* Manual mode controls */}
          {practiceMode === "manual" && (
            <>
              {phase !== "recording" ? (
                <button
                  onClick={handleRecord}
                  disabled={phase === "playing" || phase === "uploading" || phase === "playingBack"}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-semibold transition-colors shadow-sm"
                  title={t("practice.recordTitle")}
                >
                  <MicrophoneIcon className="w-5 h-5" /> {t("practice.record")}
                  <kbd className="hidden sm:inline text-[10px] px-1 py-0.5 rounded bg-white/20 font-mono">R</kbd>
                </button>
              ) : (
                <button
                  onClick={handleRecord}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 text-white font-semibold shadow-sm animate-pulse"
                  title={t("practice.stopTitle")}
                >
                  <StopIcon className="w-5 h-5" /> {t("practice.stop")}
                </button>
              )}

              <button
                onClick={handlePlayback}
                disabled={!hasRecording || phase === "recording" || phase === "playingBack"}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold transition-colors shadow-sm"
                title={t("practice.playbackTitle")}
              >
                <SpeakerWaveIcon className="w-5 h-5" /> {t("practice.playback")}
                <kbd className="hidden sm:inline text-[10px] px-1 py-0.5 rounded bg-white/20 font-mono">P</kbd>
              </button>
            </>
          )}

          {/* Next */}
          <button onClick={() => store.nextSentence()} disabled={currentIndex === sentences.length - 1 || !canNavigate}
            className="w-10 h-10 rounded-full flex items-center justify-center border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
            title={t("practice.nextTitle")}><ChevronRightIcon className="w-5 h-5" /></button>
        </div>

        {/* TTS error */}
        {tts.error && (
          <p className="mt-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{tts.error}</p>
        )}
        {recorder.error && (
          <p className="mt-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{recorder.error}</p>
        )}
      </div>

      {/* Shortcut help overlay */}
      {showShortcutHelp && <ShortcutHelpOverlay onClose={() => store.toggleShortcutHelp()} />}

      {/* Drill start modal */}
      {showDrillModal && (
        <DrillStartModal
          versionCount={allVersions.length}
          onStart={(interleaved) => {
            setShowDrillModal(false);
            store.startDrill(interleaved);
          }}
          onCancel={() => setShowDrillModal(false)}
        />
      )}
    </div>
  );
}
