import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExclamationTriangleIcon, PlayIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { api, type Voice } from "../lib/api";
import { langFlag, langName } from "../lib/lang";
import { defaultVoiceForLang } from "../hooks/useTTS";
import { useAuth } from "../hooks/useAuth";
import { useUserLanguages } from "../hooks/useUserLanguages";
import { Footer } from "../components/Footer";

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
    <div id={id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 p-6 shadow-sm scroll-mt-8">
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
            >
              <PlayIcon className="w-3 h-3 inline-block mr-0.5" />{t("settings.preview")}</button>
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
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const userId = user?.id ?? "";
  const { nativeLanguage, learningLanguages } = useUserLanguages();

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
  const [uploadRecordings, setUploadRecordings] = useState(true);
  const [showPrivacyConfirm, setShowPrivacyConfirm] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSpeed(parseFloat(settings["tts.global.speed"] ?? "1.0"));
    setPitch(parseInt(settings["tts.global.pitch"] ?? "0", 10));
    setPracticeMode((settings["practice.mode"] as "auto" | "manual") ?? "auto");
    setRecordingMultiplier(parseFloat(settings["practice.recordingMultiplier"] ?? "1.5"));
    setDrillPause(parseFloat(settings["practice.drillPause"] ?? "1"));
    setAutoPlayback((settings["practice.autoPlayback"] ?? "true") === "true");
    setDefaultFontSize((settings["display.fontSize"] as typeof defaultFontSize) ?? "lg");
    setUploadRecordings((settings["privacy.uploadRecordings"] ?? "true") === "true");
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

  const sections = [
    { id: "user", label: t("settings.sectionUser") }, // "Profile"
    { id: "playback", label: t("settings.sectionPlayback") },
    { id: "voices", label: t("settings.sectionVoices") },
    { id: "practice", label: t("settings.sectionPractice") },
    { id: "display", label: t("settings.sectionDisplay") },
  ];

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 animate-pulse space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
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
          {/* ── User ──────────────────────────────────────────────────────── */}
          <UserLanguageSection
            nativeLanguage={nativeLanguage}
            learningLanguages={learningLanguages}
            onSaved={() => qc.invalidateQueries({ queryKey: ["settings", userId] })}
            uploadRecordings={uploadRecordings}
            onUploadRecordingsChange={(val) => {
              if (!val) {
                // Turning OFF → show confirmation first
                setShowPrivacyConfirm(true);
              } else {
                // Turning ON → save immediately, no confirmation needed
                setUploadRecordings(true);
                api.setSetting("privacy.uploadRecordings", "true")
                  .then(() => qc.invalidateQueries({ queryKey: ["settings"] }));
              }
            }}
          />

          {/* Privacy confirmation modal */}
          {showPrivacyConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <ShieldCheckIcon className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {t("settings.privacyConfirmTitle")}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                      {t("settings.privacyConfirmBody")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => setShowPrivacyConfirm(false)}
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={() => {
                      setShowPrivacyConfirm(false);
                      setUploadRecordings(false);
                      api.setSetting("privacy.uploadRecordings", "false")
                        .then(() => qc.invalidateQueries({ queryKey: ["settings"] }));
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                  >
                    {t("settings.privacyConfirmOk")}
                  </button>
                </div>
              </div>
            </div>
          )}

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

              <p className="text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg flex items-start gap-1.5">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{t("settings.cacheWarning")}</span>
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
                <div className="flex items-center gap-3 justify-end pt-2 border-t border-gray-200 dark:border-gray-800">
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

              <div className="flex items-center gap-3 justify-end pt-2 border-t border-gray-200 dark:border-gray-800">
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
              <div className="flex items-center gap-3 justify-end pt-2 border-t border-gray-200 dark:border-gray-800">
                <SavedBadge show={savedKey === "display"} />
                <button
                  onClick={() => saveSetting("display.fontSize", defaultFontSize, "display")}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
                >{t("common.save")}</button>
              </div>
            </div>
          </Section>

        </div>
      </div>
    </div>
    <Footer />
    </div>
  );
}

// ── Voice Picker component ────────────────────────────────────────────────────

// ── User Language Section ─────────────────────────────────────────────────────

function UserLanguageSection({
  nativeLanguage, learningLanguages, onSaved, uploadRecordings, onUploadRecordingsChange,
}: {
  nativeLanguage: string | null;
  learningLanguages: string[];
  onSaved: () => void;
  uploadRecordings: boolean;
  onUploadRecordingsChange: (val: boolean) => void;
}) {
  const { t } = useTranslation();
  // Supported UI languages — intentionally limited to the languages
  // the app is translated into and tested against.
  const availableLangs = ["en", "vi", "ja", "de", "fr", "zh", "ko"].map(code => ({ langCode: code }));

  const [native, setNative] = useState<string>(nativeLanguage ?? "");
  const [learning, setLearning] = useState<string[]>(learningLanguages);
  const [saved, setSaved] = useState(false);

  // Sync when settings load
  useEffect(() => {
    setNative(nativeLanguage ?? "");
    setLearning(learningLanguages);
  }, [nativeLanguage, learningLanguages.join(",")]);

  const { i18n } = useTranslation();

  const handleSave = async () => {
    if (native) {
      await api.setSetting("user.nativeLanguage", native);
      // Persist to localStorage so i18n detector picks it up on next load
      localStorage.setItem("lang-mirror-lang", native);
      if (i18n.language !== native) i18n.changeLanguage(native);
    }
    // Always strip native from learning list before saving — guards against stale data
    const cleanLearning = learning.filter(c => c !== native);
    await api.setSetting("user.learningLanguages", JSON.stringify(cleanLearning));
    onSaved();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // When native changes, remove it from learning state immediately
  useEffect(() => {
    if (native) setLearning(prev => prev.filter(c => c !== native));
  }, [native]);

  const toggleLearning = (code: string) => {
    setLearning(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  return (
    <Section id="user" title={t("settings.sectionUser")}>
      <div className="space-y-5">
        {/* Native language */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
            {t("settings.nativeLanguage")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {availableLangs.map(({ langCode }) => (
              <button
                key={langCode}
                type="button"
                onClick={() => setNative(langCode)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                  native === langCode
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400"
                }`}
              >
                {langFlag(langCode)} {langName(langCode)}
              </button>
            ))}
          </div>
        </div>

        {/* Learning languages */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
            {t("settings.learningLanguages")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {availableLangs.filter(({ langCode }) => langCode !== native).map(({ langCode }) => {
              const active = learning.includes(langCode);
              return (
                <button
                  key={langCode}
                  type="button"
                  onClick={() => toggleLearning(langCode)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                    active
                      ? "bg-green-600 border-green-600 text-white"
                      : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-green-400"
                  }`}
                >
                  {langFlag(langCode)} {langName(langCode)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Privacy — recording upload toggle */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <ShieldCheckIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                {t("settings.uploadRecordingsLabel")}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                {uploadRecordings
                  ? t("settings.uploadRecordingsHintOn")
                  : t("settings.uploadRecordingsHintOff")}
              </p>
            </div>
            {/* Toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={uploadRecordings}
              onClick={() => onUploadRecordingsChange(!uploadRecordings)}
              className={`relative flex-shrink-0 mt-0.5 inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                uploadRecordings ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                uploadRecordings ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
          {!uploadRecordings && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
              <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {t("settings.uploadRecordingsOffWarning")}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-800">
          <span className={`text-xs font-medium text-green-600 dark:text-green-400 transition-opacity duration-300 ${saved ? "opacity-100" : "opacity-0"}`}>
            {t("settings.saved")}
          </span>
          <button
            onClick={handleSave}
            disabled={!native}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors disabled:opacity-40"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </Section>
  );
}

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
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setSearch(""); } };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

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
    <div ref={containerRef} className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{langFlag(langCode)}</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{langName(langCode)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => playPreview(sampleForLang(langCode), selectedVoice, speed, pitch)}
            className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 transition-colors flex-shrink-0"
            title={`Preview "${sampleForLang(langCode)}"`}
          >▶ {t("settings.preview")}</button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex-1 sm:flex-none sm:min-w-[180px] px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:border-blue-400 transition-colors flex items-center gap-2 justify-between min-w-0"
          >
            <span className="truncate">{selectedDisplay}</span>
            <span className="text-gray-400 flex-shrink-0">{open ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>

      {open && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-200 dark:border-gray-800">
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
                      {v.shortName}
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
