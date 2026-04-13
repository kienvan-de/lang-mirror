import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ChevronLeftIcon, ChevronRightIcon,
  SpeakerWaveIcon, MicrophoneIcon, StopIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { PlayIcon } from "@heroicons/react/24/solid";
import { usePracticeStore } from "../../stores/practice.store";
import { useTTS } from "../../hooks/useTTS";
import { langFlag, langLabel, langName } from "../../lib/lang";
import { api } from "../../lib/api";
import ReactMarkdown from "react-markdown";

// ── Font size mapping (mirrors practice page) ─────────────────────────────────
const FONT_SIZES = {
  xs: "text-base",
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-3xl",
} as const;

// ── Main Review page ──────────────────────────────────────────────────────────
export function ReviewPage() {
  const { t, i18n } = useTranslation();
  const uiLang = i18n.language.split("-")[0]!;
  const { topicId, langCode } = useParams({ strict: false }) as { topicId: string; langCode: string };

  // Read fontSize from practice store (read-only)
  const { fontSize } = usePracticeStore();

  // ── TTS ──────────────────────────────────────────────────────────────────
  const tts = useTTS();

  // ── Recording playback state ──────────────────────────────────────────────
  const [recPlaying, setRecPlaying] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState(false);
  const recAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── Current sentence index ────────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);

  // ── Notes accordion ───────────────────────────────────────────────────────
  const [showNotes, setShowNotes] = useState(false);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: topic, isLoading: topicLoading } = useQuery({
    queryKey: ["topic", topicId],
    queryFn: () => api.getTopic(topicId),
  });

  const activeVersion = topic?.versions?.find((v) => v.language_code === langCode);
  const versionId = activeVersion?.id;
  const sentences = activeVersion?.sentences ?? [];

  const { data: recordingsCheck } = useQuery({
    queryKey: ["recordings-check", versionId],
    queryFn: () => api.checkRecordings(versionId!),
    enabled: !!versionId,
  });
  const recordedSentenceIds = new Set<string>(recordingsCheck?.sentenceIds ?? []);

  const sentence = sentences[currentIndex];

  // ── Derived display title (uiLang-matched) ────────────────────────────────
  const allTopicVersions = topic?.versions ?? [];
  const matchedVersion = allTopicVersions.find((v) => v.language_code.split("-")[0] === uiLang);
  const displayTitle = matchedVersion?.title ?? allTopicVersions[0]?.title ?? topic?.title ?? "";

  // ── Navigation helpers ────────────────────────────────────────────────────
  const stopBothAudio = () => {
    tts.stop();
    if (recAudioRef.current) {
      recAudioRef.current.pause();
      recAudioRef.current.currentTime = 0;
      recAudioRef.current = null;
    }
    setRecPlaying(false);
    setRecLoading(false);
  };

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= sentences.length) return;
    stopBothAudio();
    setRecError(false);
    setShowNotes(false);
    setCurrentIndex(idx);
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case "ArrowLeft":
          goTo(currentIndex - 1);
          break;
        case "ArrowRight":
          goTo(currentIndex + 1);
          break;
        case "t":
          if (sentence) handlePlayTTS();
          break;
        case "r":
          if (sentence) handlePlayRecording();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, sentences.length, sentence]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => { stopBothAudio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── TTS handler ───────────────────────────────────────────────────────────
  const handlePlayTTS = () => {
    if (!sentence) return;
    if (tts.isPlaying || tts.isLoading) {
      tts.stop();
      return;
    }
    // Stop recording playback first
    if (recAudioRef.current) {
      recAudioRef.current.pause();
      recAudioRef.current.currentTime = 0;
      recAudioRef.current = null;
      setRecPlaying(false);
      setRecLoading(false);
    }
    tts.play({ sentenceId: sentence.id }).catch(() => {});
  };

  // ── Recording playback handler ────────────────────────────────────────────
  const handlePlayRecording = () => {
    if (!sentence) return;
    const hasRec = recordedSentenceIds.has(sentence.id);
    if (!hasRec || recError) return;

    if (recPlaying) {
      if (recAudioRef.current) {
        recAudioRef.current.pause();
        recAudioRef.current.currentTime = 0;
        recAudioRef.current = null;
      }
      setRecPlaying(false);
      setRecLoading(false);
      return;
    }

    // Stop TTS first
    tts.stop();

    setRecLoading(true);
    setRecError(false);
    const url = api.getRecordingUrl(sentence.id);
    const audio = new Audio(url);
    recAudioRef.current = audio;

    audio.addEventListener("canplaythrough", () => {
      setRecLoading(false);
      setRecPlaying(true);
      audio.play().catch(() => {
        setRecPlaying(false);
        setRecError(true);
        recAudioRef.current = null;
      });
    }, { once: true });

    audio.addEventListener("ended", () => {
      setRecPlaying(false);
      recAudioRef.current = null;
    }, { once: true });

    audio.addEventListener("error", () => {
      setRecLoading(false);
      setRecPlaying(false);
      setRecError(true);
      recAudioRef.current = null;
    }, { once: true });

    audio.load();
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (topicLoading || !topic) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-gray-950">
        <div className="text-gray-400 animate-pulse text-lg">{t("practice.loading")}</div>
      </div>
    );
  }

  // ── No sentences state ────────────────────────────────────────────────────
  if (sentences.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="max-w-xl mx-auto text-center">
          <div className="text-5xl mb-4">📭</div>
          <h2 className="text-lg font-semibold text-gray-300 mb-2">{t("practice.noSentences")}</h2>
          <p className="text-sm text-gray-500 mb-6">{t("practice.noSentencesSubtitle")}</p>
          <Link
            to="/topics/$topicId"
            params={{ topicId }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            {t("practice.backToTopic")}
          </Link>
        </div>
      </div>
    );
  }

  const hasRecForSentence = sentence ? recordedSentenceIds.has(sentence.id) : false;
  const ttsActive = tts.isPlaying || tts.isLoading;
  const recActive = recPlaying || recLoading;

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">

      {/* ── Sticky top bar ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 shadow-md">
        <Link
          to="/topics/$topicId"
          params={{ topicId }}
          search={{ from: "topic" } as Record<string, string>}
          className="text-sm text-gray-400 hover:text-blue-400 transition-colors flex items-center gap-1 shrink-0"
        >
          <ChevronLeftIcon className="w-4 h-4" /> {displayTitle}
        </Link>

        <div className="flex-1" />

        {/* Language badge */}
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-900/40 text-blue-300 border border-blue-800">
          {langFlag(langCode)} {langName(langCode)}
        </span>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 w-full">
        <div className="max-w-2xl mx-auto w-full">

          {/* Sentence counter */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-sm font-mono text-gray-500">
              {t("review.sentenceOf", { current: currentIndex + 1, total: sentences.length })}
            </span>
            {/* Progress dots */}
            <div className="flex gap-1 ml-2">
              {sentences.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentIndex ? "bg-blue-500" : "bg-gray-700 hover:bg-gray-500"
                  }`}
                  aria-label={`Go to sentence ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {/* ── Sentence card ─────────────────────────────────────────────── */}
          {sentence && (
            <div className="w-full bg-gray-900 rounded-2xl border border-gray-800 p-6 shadow-lg mb-6">

              {/* Sentence text */}
              <p className={`${FONT_SIZES[fontSize]} font-medium text-gray-100 leading-relaxed text-center mb-6`}>
                {sentence.text}
              </p>

              {/* TTS + Recording cards */}
              <div className="grid grid-cols-2 gap-4 mb-4">

                {/* TTS card */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col items-center gap-3">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                    <SpeakerWaveIcon className="w-3.5 h-3.5" /> {langLabel(langCode)}
                  </span>
                  <button
                    onClick={handlePlayTTS}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full justify-center ${
                      ttsActive
                        ? "bg-blue-700 hover:bg-blue-800 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {tts.isLoading ? (
                      <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    ) : tts.isPlaying ? (
                      <StopIcon className="w-4 h-4" />
                    ) : (
                      <PlayIcon className="w-4 h-4" />
                    )}
                    {tts.isPlaying ? t("review.stop") : t("review.playTTS")}
                  </button>
                </div>

                {/* Recording card */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col items-center gap-3">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                    <MicrophoneIcon className="w-3.5 h-3.5" /> {t("review.playRecording")}
                  </span>
                  {!hasRecForSentence || recError ? (
                    <button
                      disabled
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium w-full justify-center bg-gray-700 text-gray-500 cursor-not-allowed opacity-60"
                    >
                      <MicrophoneIcon className="w-4 h-4" />
                      {t("review.noRecording")}
                    </button>
                  ) : (
                    <button
                      onClick={handlePlayRecording}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full justify-center ${
                        recActive
                          ? "bg-green-700 hover:bg-green-800 text-white"
                          : "bg-green-600 hover:bg-green-700 text-white"
                      }`}
                    >
                      {recLoading ? (
                        <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      ) : recPlaying ? (
                        <StopIcon className="w-4 h-4" />
                      ) : (
                        <PlayIcon className="w-4 h-4" />
                      )}
                      {recPlaying ? t("review.stop") : t("review.playRecording")}
                    </button>
                  )}
                </div>
              </div>

              {/* Notes — inline accordion */}
              {sentence.notes?.[uiLang] && (
                <div className="border-t border-gray-800 pt-3 mt-2">
                  <button
                    onClick={() => setShowNotes((prev) => !prev)}
                    className="flex items-center gap-1.5 text-xs font-medium text-amber-500 hover:text-amber-400 transition-colors"
                  >
                    <DocumentTextIcon className="w-3.5 h-3.5" />
                    {showNotes ? t("review.hideNotes") : t("review.notes")}
                  </button>
                  {showNotes && (
                    <div className="mt-2 bg-amber-900/20 rounded-lg px-3 py-2 border border-amber-800/40">
                      <div className="text-xs text-amber-300 prose prose-xs prose-invert max-w-none [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mb-1 [&_p]:my-0.5 [&_ul]:my-0.5 [&_li]:my-0">
                        <ReactMarkdown>{sentence.notes[uiLang]}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Navigation ────────────────────────────────────────────────── */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="w-10 h-10 rounded-full flex items-center justify-center border border-gray-700 text-gray-400 hover:bg-gray-800 disabled:opacity-30 transition-colors"
              title="Previous (←)"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <span className="text-xs text-gray-600 font-mono">
              {currentIndex + 1} / {sentences.length}
            </span>
            <button
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex === sentences.length - 1}
              className="w-10 h-10 rounded-full flex items-center justify-center border border-gray-700 text-gray-400 hover:bg-gray-800 disabled:opacity-30 transition-colors"
              title="Next (→)"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom bar ─────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-800 bg-gray-900 px-4 py-3 flex items-center justify-between gap-4">
        <Link
          to="/topics/$topicId"
          params={{ topicId }}
          className="text-sm text-gray-400 hover:text-blue-400 transition-colors flex items-center gap-1"
        >
          <ChevronLeftIcon className="w-4 h-4" /> {t("review.backToTopic")}
        </Link>
        <Link
          to="/practice/$topicId/$langCode"
          params={{ topicId, langCode }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
        >
          <PlayIcon className="w-4 h-4" /> {t("review.practiceThis")}
        </Link>
      </div>
    </div>
  );
}
