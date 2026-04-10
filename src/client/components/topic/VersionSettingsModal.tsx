import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { XMarkIcon, GlobeAltIcon, ExclamationTriangleIcon, PlayIcon } from "@heroicons/react/24/outline";
import { api, type Version } from "../../lib/api";
import { langFlag, langLabel } from "../../lib/lang";
import { defaultVoiceForLang } from "../../hooks/useTTS";

// ── Slider ────────────────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step, format, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        <span className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100 w-28 text-right">{format(value)}</span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute left-0 right-0 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute left-0 right-0 w-full opacity-0 h-5 cursor-pointer"
        />
      </div>
    </div>
  );
}

// ── VersionSettingsModal ──────────────────────────────────────────────────────

interface Props {
  version: Version;
  onClose: () => void;
}

export function VersionSettingsModal({ version, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const langCode = version.language_code.split("-")[0]!.toLowerCase();

  const [voiceOpen, setVoiceOpen] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    staleTime: 30_000,
  });

  const { data: voices, isLoading: voicesLoading } = useQuery({
    queryKey: ["voices", langCode],
    queryFn: () => api.getVoices(langCode),
    staleTime: 5 * 60_000,
    enabled: voiceOpen,
  });

  const globalSpeed = parseFloat(settings?.["tts.global.speed"] ?? "1.0");
  const globalPitch = parseInt(settings?.["tts.global.pitch"] ?? "0", 10);
  const globalVoice = defaultVoiceForLang(version.language_code);

  const [voice, setVoice] = useState<string>(version.voice_name ?? globalVoice);
  const [speed, setSpeed] = useState<number>(version.speed ?? globalSpeed);
  const [pitch, setPitch] = useState<number>(version.pitch ?? globalPitch);

  useEffect(() => {
    setVoice(version.voice_name ?? globalVoice);
    setSpeed(version.speed ?? globalSpeed);
    setPitch(version.pitch ?? globalPitch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version.id]);

  const hasOverride = version.speed !== null || version.pitch !== null || version.voice_name !== null;

  const updateMutation = useMutation({
    mutationFn: (body: { voice_name: string | null; speed: number | null; pitch: number | null }) =>
      api.updateVersion(version.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topic"] });
      onClose();
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ voice_name: voice !== globalVoice ? voice : null, speed, pitch });
  };

  const handleClear = () => {
    updateMutation.mutate({ voice_name: null, speed: null, pitch: null });
    setVoice(globalVoice);
    setSpeed(globalSpeed);
    setPitch(globalPitch);
  };

  const byGender: Record<string, Voice[]> = {};
  for (const v of voices ?? []) {
    const g = v.gender || "Other";
    if (!byGender[g]) byGender[g] = [];
    byGender[g]!.push(v);
  }

  const speedPresets = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">{langFlag(version.language_code)}</span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {t("versionSettings.title", { lang: langLabel(version.language_code) })}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("versionSettings.subtitle")}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label={t("common.close")}>
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Global context hint */}
          <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <GlobeAltIcon className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
            <span>
              {t("versionSettings.globalDefaults", {
                speed: globalSpeed.toFixed(2),
                pitch: `${globalPitch > 0 ? "+" : ""}${globalPitch}`,
              })}
              {hasOverride && (
                <span className="ml-2 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded font-semibold">
                  {t("versionSettings.overridden")}
                </span>
              )}
            </span>
          </div>

          {/* Voice */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("versionSettings.voiceLabel")}</label>
              <button
                onClick={() => {
                  const params = new URLSearchParams({ text: "Hello, this is a preview.", voice, speed: String(speed), pitch: String(pitch) });
                  new Audio(`/api/tts?${params}`).play().catch(() => {});
                }}
                className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 transition-colors flex items-center gap-1"
              >
                <PlayIcon className="w-3 h-3" /> {t("settings.preview")}
              </button>
            </div>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              onFocus={() => setVoiceOpen(true)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {voicesLoading ? (
                <option disabled>{t("settings.loadingVoices")}</option>
              ) : (voices ?? []).length === 0 ? (
                <option disabled>{t("settings.noVoicesFound")}</option>
              ) : (
                Object.entries(byGender).map(([gender, gVoices]) => (
                  <optgroup key={gender} label={gender}>
                    {gVoices.map(v => (
                      <option key={v.name} value={v.name}>
                        {v.shortName} — {v.locale}
                      </option>
                    ))}
                  </optgroup>
                ))
              )}
            </select>
          </div>

          {/* Speed */}
          <div className="space-y-3">
            <Slider
              label={t("versionSettings.speedLabel")}
              value={speed} min={0.5} max={2.0} step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={setSpeed}
            />
            <div className="flex items-center gap-2 flex-wrap">
              {speedPresets.map((s) => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    Math.abs(speed - s) < 0.01 ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >{s}×</button>
              ))}
              <button onClick={() => setSpeed(globalSpeed)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  Math.abs(speed - globalSpeed) < 0.01 ? "bg-gray-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >{t("versionSettings.global")}</button>
            </div>
          </div>

          {/* Pitch */}
          <div className="space-y-3">
            <Slider
              label={t("versionSettings.pitchLabel")}
              value={pitch} min={-10} max={10} step={1}
              format={(v) => v === 0 ? t("versionSettings.pitchDefault", { value: 0 }) : t("versionSettings.pitchValue", { value: `${v > 0 ? "+" : ""}${v}` })}
              onChange={(v) => setPitch(Math.round(v))}
            />
            <div className="flex items-center gap-2">
              {[-4, -2, 0, 2, 4].map((p) => (
                <button key={p} onClick={() => setPitch(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    pitch === p ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >{p > 0 ? `+${p}` : p}</button>
              ))}
              <button onClick={() => setPitch(globalPitch)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  pitch === globalPitch ? "bg-gray-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >{t("versionSettings.global")}</button>
            </div>
          </div>

          <p className="text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg flex items-start gap-2">
            <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {t("versionSettings.cacheWarning")}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
          <div>
            {hasOverride && (
              <button onClick={handleClear} disabled={updateMutation.isPending}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
              >
                {t("versionSettings.clearOverride")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              {t("common.cancel")}
            </button>
            <button onClick={handleSave} disabled={updateMutation.isPending}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {updateMutation.isPending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {t("versionSettings.saveOverride")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
