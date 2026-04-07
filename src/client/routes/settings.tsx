import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, type Voice } from "../lib/api";
import { langFlag, langName } from "../lib/lang";
import { defaultVoiceForLang } from "../hooks/useTTS";

// ── Reusable save feedback hook ───────────────────────────────────────────────

function useSaveFeedback() {
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSaved = useCallback((key: string) => {
    setSavedKey(key);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSavedKey(null), 2000);
  }, []);

  return { savedKey, showSaved };
}

function SavedBadge({ show }: { show: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={`text-xs font-medium text-green-600 dark:text-green-400 transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}>
      {t("settings.saved")}
    </span>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm scroll-mt-8">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">{title}</h2>
      {children}
    </div>
  );
}

// ── Slider component ──────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step, format,
  onChange, onPreview,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onPreview?: () => void;
}) {
  const { t } = useTranslation();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100 w-14 text-right">{format(value)}</span>
          {onPreview && (
            <button
              onClick={onPreview}
              className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 transition-colors"
              title={t("settings.preview")}
            >▶ {t("settings.preview")}</button>
          )}
        </div>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute left-0 right-0 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute left-0 right-0 w-full opacity-0 h-5 cursor-pointer"
        />
      </div>
    </div>
  );
}

// ── Sample phrases for TTS preview ───────────────────────────────────────────

const SAMPLE_PHRASES: Record<string, string> = {
  ja: "こんにちは、元気ですか？",
  es: "Hola, ¿cómo estás?",
  fr: "Bonjour, comment allez-vous ?",
  de: "Guten Tag, wie geht es Ihnen?",
  zh: "你好，你好吗？",
  ko: "안녕하세요, 잘 지내세요?",
  pt: "Olá, como você está?",
  it: "Ciao, come stai?",
  ru: "Привет, как дела?",
  en: "Hello, how are you doing today?",
};

function sampleForLang(langCode: string): string {
  const base = langCode.split("-")[0]!.toLowerCase();
  return SAMPLE_PHRASES[base] ?? SAMPLE_PHRASES["en"]!;
}

function playPreview(text: string, voice: string, speed: number, pitch: number) {
  const params = new URLSearchParams({ text, voice, speed: String(speed), pitch: String(pitch) });
  const audio = new Audio(`/api/tts?${params}`);
  audio.play().catch(() => {});
}

// ── Main Settings Page ────────────────────────────────────────────────────────

export function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { savedKey, showSaved } = useSaveFeedback();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const { data: topics } = useQuery({
    queryKey: ["topics"],
    queryFn: api.getTopics,
  });

  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [practiceMode, setPracticeMode] = useState<"auto" | "manual">("auto");
  const [recordingMultiplier, setRecordingMultiplier] = useState(1.5);
  const [drillPause, setDrillPause] = useState(1);
  const [autoPlayback, setAutoPlayback] = useState(true);
  const [defaultFontSize, setDefaultFontSize] = useState<"xs" | "sm" | "md" | "lg" | "xl">("lg");
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!settings) return;
    setSpeed(parseFloat(settings["tts.global.speed"] ?? "1.0"));
    setPitch(parseInt(settings["tts.global.pitch"] ?? "0", 10));
    setPracticeMode((settings["practice.mode"] as "auto" | "manual") ?? "auto");
    setRecordingMultiplier(parseFloat(settings["practice.recordingMultiplier"] ?? "1.5"));
    setDrillPause(parseFloat(settings["practice.drillPause"] ?? "1"));
    setAutoPlayback((settings["practice.autoPlayback"] ?? "true") === "true");
    setDefaultFontSize((settings["display.fontSize"] as typeof defaultFontSize) ?? "lg");
    try {
      const saved = JSON.parse(settings["tts.voices"] ?? "{}");
      setVoiceMap(saved);
    } catch { setVoiceMap({}); }
  }, [settings]);

  const saveSetting = useCallback(async (key: string, value: string, feedbackKey: string) => {
    await api.setSetting(key, value);
    qc.invalidateQueries({ queryKey: ["settings"] });
    showSaved(feedbackKey);
  }, [qc, showSaved]);

  const langCodesInUse = Array.from(new Set(
    (topics ?? []).flatMap((t) => (t.versions ?? []).map((v) => v.language_code.split("-")[0]!.toLowerCase()))
  )).sort();

  const { data: cacheStats, refetch: refetchCache } = useQuery({
    queryKey: ["cache", "stats"],
    queryFn: () => api.getCacheStats(),
    staleTime: 10_000,
  });

  const clearCacheMutation = useMutation({
    mutationFn: api.clearTTSCache,
    onSuccess: () => { refetchCache(); showSaved("cache"); },
  });

  const clearRecordingsMutation = useMutation({
    mutationFn: api.deleteAllRecordings,
    onSuccess: () => showSaved("recordings"),
  });

  const [exporting, setExporting] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const { data: dataPath } = useQuery({ queryKey: ["dataPath"], queryFn: api.getDataPath });

  const sections = [
    { id: "playback", label: t("settings.sectionPlayback") },
    { id: "voices", label: t("settings.sectionVoices") },
    { id: "practice", label: t("settings.sectionPractice") },
    { id: "display", label: t("settings.sectionDisplay") },
    { id: "data", label: t("settings.sectionData") },
  ];

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 animate-pulse space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("settings.title")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("settings.subtitle")}</p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar nav */}
        <nav className="hidden md:flex flex-col gap-1 w-40 flex-shrink-0 sticky top-8 self-start">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Main content */}
        <div className="flex-1 space-y-6 min-w-0">

          {/* ── Playback ──────────────────────────────────────────────── */}
          <Section id="playback" title={t("settings.sectionPlayback")}>
            <div className="space-y-6">
              <div className="space-y-3">
                <Slider
                  label={t("settings.globalSpeed")}
                  value={speed}
                  min={0.5} max={2.0} step={0.05}
                  format={(v) => `${v.toFixed(2)}×`}
                  onChange={setSpeed}
                  onPreview={() => playPreview("Hello, this is a preview.", "en-US-JennyNeural", speed, pitch)}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        Math.abs(speed - s) < 0.01
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >{s}×</button>
                  ))}
                </div>
              </div>

              <Slider
                label={t("settings.globalPitch")}
                value={pitch}
                min={-10} max={10} step={1}
                format={(v) => v === 0
                  ? t("settings.pitchDefault", { value: 0 })
                  : t("settings.pitchValue", { value: `${v > 0 ? "+" : ""}${v}` })}
                onChange={(v) => setPitch(Math.round(v))}
              />

              <p className="text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                ⚠️ {t("settings.cacheWarning")}
              </p>

              <div className="flex items-center gap-3 justify-end">
                <SavedBadge show={savedKey === "playback"} />
                <button
                  onClick={async () => {
                    await api.setSetting("tts.global.speed", speed.toFixed(2));
                    await api.setSetting("tts.global.pitch", String(Math.round(pitch)));
                    qc.invalidateQueries({ queryKey: ["settings"] });
                    showSaved("playback");
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
                >{t("common.save")}</button>
              </div>
            </div>
          </Section>

          {/* ── Voices ────────────────────────────────────────────────── */}
          <Section id="voices" title={t("settings.sectionVoices")}>
            {langCodesInUse.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("settings.noVoicesYet")}
              </p>
            ) : (
              <div className="space-y-5">
                {langCodesInUse.map((lang) => (
                  <VoicePicker
                    key={lang}
                    langCode={lang}
                    selectedVoice={voiceMap[lang] ?? defaultVoiceForLang(lang)}
                    speed={speed}
                    pitch={pitch}
                    onSelect={(v) => setVoiceMap((m) => ({ ...m, [lang]: v }))}
                  />
                ))}
                <div className="flex items-center gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-800">
                  <SavedBadge show={savedKey === "voices"} />
                  <button
                    onClick={async () => {
                      await api.setSetting("tts.voices", JSON.stringify(voiceMap));
                      qc.invalidateQueries({ queryKey: ["settings"] });
                      showSaved("voices");
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
                  >{t("settings.saveVoices")}</button>
                </div>
              </div>
            )}
          </Section>

          {/* ── Practice ──────────────────────────────────────────────── */}
          <Section id="practice" title={t("settings.sectionPractice")}>
            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t("settings.practiceMode")}</label>
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
                  {(["auto", "manual"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPracticeMode(m)}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                        practiceMode === m
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >{m}</button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  {t("settings.practiceModeHint")}
                </p>
              </div>

              <Slider
                label={t("settings.autoWindow")}
                value={recordingMultiplier}
                min={1.2} max={2.5} step={0.1}
                format={(v) => `${v.toFixed(1)}× TTS duration`}
                onChange={setRecordingMultiplier}
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
                {t("settings.autoWindowHint")}
              </p>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t("settings.drillPause")}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[0.5, 1, 2, 3].map((p) => (
                    <button
                      key={p}
                      onClick={() => setDrillPause(p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        drillPause === p
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >{p}s</button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.autoPlayback")}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t("settings.autoPlaybackHint")}</p>
                </div>
                <button
                  onClick={() => setAutoPlayback((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoPlayback ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoPlayback ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              <div className="flex items-center gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-800">
                <SavedBadge show={savedKey === "practice"} />
                <button
                  onClick={async () => {
                    await api.setSetting("practice.mode", practiceMode);
                    await api.setSetting("practice.recordingMultiplier", recordingMultiplier.toFixed(1));
                    await api.setSetting("practice.drillPause", String(drillPause));
                    await api.setSetting("practice.autoPlayback", String(autoPlayback));
                    qc.invalidateQueries({ queryKey: ["settings"] });
                    showSaved("practice");
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
                >{t("common.save")}</button>
              </div>
            </div>
          </Section>

          {/* ── Display ───────────────────────────────────────────────── */}
          <Section id="display" title={t("settings.sectionDisplay")}>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t("settings.fontSizeLabel")}</label>
                <div className="flex items-center gap-2">
                  {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setDefaultFontSize(size)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        defaultFontSize === size
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >{size.toUpperCase()}</button>
                  ))}
                </div>
                <p className={`mt-3 font-medium text-gray-900 dark:text-gray-100 ${{
                  xs: "text-base", sm: "text-lg", md: "text-xl", lg: "text-2xl", xl: "text-3xl"
                }[defaultFontSize]}`}>
                  {t("settings.fontPreview")}
                </p>
              </div>
              <div className="flex items-center gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-800">
                <SavedBadge show={savedKey === "display"} />
                <button
                  onClick={() => saveSetting("display.fontSize", defaultFontSize, "display")}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
                >{t("common.save")}</button>
              </div>
            </div>
          </Section>

          {/* ── Data Management ───────────────────────────────────────── */}
          <Section id="data" title={t("settings.sectionData")}>
            <div className="space-y-5">
              {/* Cache stats */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.cacheSizeLabel")}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {cacheStats
                      ? t("settings.cacheSize", { mb: cacheStats.totalMB, count: cacheStats.fileCount })
                      : t("common.loading")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <SavedBadge show={savedKey === "cache"} />
                  <button
                    onClick={() => {
                      if (confirm("Delete all cached TTS audio? Audio will regenerate on next play.")) {
                        clearCacheMutation.mutate();
                      }
                    }}
                    disabled={clearCacheMutation.isPending || (cacheStats?.fileCount ?? 0) === 0}
                    className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 text-sm font-medium transition-colors disabled:opacity-40 border border-red-200 dark:border-red-800"
                  >
                    {clearCacheMutation.isPending ? t("settings.clearingCache") : t("settings.clearCache")}
                  </button>
                </div>
              </div>

              {/* Clear recordings */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.recordingsLabel")}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t("settings.recordingsHint")}
                  </p>
                  {clearRecordingsMutation.isSuccess && clearRecordingsMutation.data && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {t("settings.deletedFiles", {
                        count: clearRecordingsMutation.data.deletedFiles,
                        mb: (clearRecordingsMutation.data.bytesFreed / 1_048_576).toFixed(2),
                      })}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (confirm(t("settings.clearRecordingsConfirm"))) {
                      clearRecordingsMutation.mutate();
                    }
                  }}
                  disabled={clearRecordingsMutation.isPending}
                  className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 text-sm font-medium transition-colors disabled:opacity-40 border border-red-200 dark:border-red-800"
                >
                  {clearRecordingsMutation.isPending ? t("settings.deletingRecordings") : t("settings.clearRecordings")}
                </button>
              </div>

              {/* Export all data */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.exportAll")}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t("settings.exportAllHint")}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    setExporting(true);
                    try { await api.exportAll(); }
                    catch { alert("Export failed. Please try again."); }
                    finally { setExporting(false); }
                  }}
                  disabled={exporting}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-sm font-medium transition-colors disabled:opacity-40 border border-blue-200 dark:border-blue-800"
                >
                  {exporting ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-blue-400/40 border-t-blue-500 animate-spin" />
                      {t("settings.exportingZip")}
                    </span>
                  ) : t("settings.exportZip")}
                </button>
              </div>

              {/* Data path */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.dataLocation")}</p>
                  <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5 break-all">
                    {dataPath?.path ?? t("common.loading")}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {t("settings.dataLocationHint")}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (dataPath?.path) {
                      await navigator.clipboard.writeText(dataPath.path);
                      setCopiedPath(true);
                      setTimeout(() => setCopiedPath(false), 2000);
                    }
                  }}
                  disabled={!dataPath}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-colors disabled:opacity-40 border border-gray-200 dark:border-gray-700 ml-4"
                >
                  {copiedPath ? t("settings.copiedPath") : t("settings.copyPath")}
                </button>
              </div>
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}

// ── Voice Picker component ────────────────────────────────────────────────────

function VoicePicker({
  langCode, selectedVoice, speed, pitch, onSelect,
}: {
  langCode: string;
  selectedVoice: string;
  speed: number;
  pitch: number;
  onSelect: (voice: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: voices, isLoading } = useQuery({
    queryKey: ["voices", langCode],
    queryFn: () => api.getVoices(langCode),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const filtered = (voices ?? []).filter((v) =>
    v.shortName.toLowerCase().includes(search.toLowerCase()) ||
    v.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const byGender: Record<string, Voice[]> = {};
  for (const v of filtered) {
    const g = v.gender || "Other";
    if (!byGender[g]) byGender[g] = [];
    byGender[g]!.push(v);
  }

  const selectedDisplay = voices?.find((v) => v.name === selectedVoice)?.shortName ?? selectedVoice.split("-").slice(2).join("-");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{langFlag(langCode)}</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{langName(langCode)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => playPreview(sampleForLang(langCode), selectedVoice, speed, pitch)}
            className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 transition-colors"
            title={`Preview "${sampleForLang(langCode)}"`}
          >▶ {t("settings.preview")}</button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:border-blue-400 transition-colors flex items-center gap-2 min-w-[180px] justify-between"
          >
            <span className="truncate">{selectedDisplay}</span>
            <span className="text-gray-400 flex-shrink-0">{open ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>

      {open && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <input
              autoFocus
              type="text"
              placeholder={t("settings.searchVoices")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-sm text-gray-400 dark:text-gray-500 text-center">{t("settings.loadingVoices")}</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-gray-400 dark:text-gray-500 text-center">{t("settings.noVoicesFound")}</p>
            ) : (
              Object.entries(byGender).map(([gender, gVoices]) => (
                <div key={gender}>
                  <p className="px-3 py-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50">{gender}</p>
                  {gVoices.map((v) => (
                    <button
                      key={v.name}
                      onClick={() => { onSelect(v.name); setOpen(false); setSearch(""); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${
                        v.name === selectedVoice ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium" : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {v.shortName.split("-").slice(2).join("-")}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
