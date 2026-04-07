import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { XMarkIcon, GlobeAltIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { api, type Version } from "../../lib/api";
import { langFlag, langLabel } from "../../lib/lang";

// ── Slider (local, matches settings page style) ───────────────────────────────

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

// ── VersionSettingsModal ──────────────────────────────────────────────────────

interface Props {
  version: Version;
  onClose: () => void;
}

export function VersionSettingsModal({ version, onClose }: Props) {
  const qc = useQueryClient();

  // Fetch global settings for context display
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    staleTime: 30_000,
  });

  const globalSpeed = parseFloat(settings?.["tts.global.speed"] ?? "1.0");
  const globalPitch = parseInt(settings?.["tts.global.pitch"] ?? "0", 10);

  // Local editable state — starts from version's override or global value
  const [speed, setSpeed] = useState<number>(version.speed ?? globalSpeed);
  const [pitch, setPitch] = useState<number>(version.pitch ?? globalPitch);

  // Keep in sync if version prop changes (unlikely but safe)
  useEffect(() => {
    setSpeed(version.speed ?? globalSpeed);
    setPitch(version.pitch ?? globalPitch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version.id]);

  const hasOverride = version.speed !== null || version.pitch !== null;

  const updateMutation = useMutation({
    mutationFn: (body: { speed: number | null; pitch: number | null }) =>
      api.updateVersion(version.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topic"] });
      onClose();
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ speed, pitch });
  };

  const handleClear = () => {
    updateMutation.mutate({ speed: null, pitch: null });
  };

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
                {langLabel(version.language_code)} — Voice Settings
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Override global TTS settings for this language version
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6">
          {/* Global context hint */}
          <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <GlobeAltIcon className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
            <span>
              Global defaults: <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">{globalSpeed.toFixed(2)}×</span> speed,{" "}
              pitch <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">{globalPitch > 0 ? "+" : ""}{globalPitch} st</span>
              {hasOverride && (
                <span className="ml-2 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded font-semibold">
                  overridden
                </span>
              )}
            </span>
          </div>

          {/* Speed */}
          <div className="space-y-3">
            <Slider
              label="Speed"
              value={speed}
              min={0.5} max={2.0} step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={setSpeed}
            />
            {/* Speed presets */}
            <div className="flex items-center gap-2 flex-wrap">
              {speedPresets.map((s) => (
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
              <button
                onClick={() => setSpeed(globalSpeed)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  Math.abs(speed - globalSpeed) < 0.01
                    ? "bg-gray-500 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                title="Use global default"
              >global</button>
            </div>
          </div>

          {/* Pitch */}
          <div className="space-y-3">
            <Slider
              label="Pitch"
              value={pitch}
              min={-10} max={10} step={1}
              format={(v) => v === 0 ? "0 (default)" : `${v > 0 ? "+" : ""}${v} st`}
              onChange={(v) => setPitch(Math.round(v))}
            />
            <div className="flex items-center gap-2">
              {[-4, -2, 0, 2, 4].map((p) => (
                <button
                  key={p}
                  onClick={() => setPitch(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    pitch === p
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >{p > 0 ? `+${p}` : p}</button>
              ))}
              <button
                onClick={() => setPitch(globalPitch)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  pitch === globalPitch
                    ? "bg-gray-500 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                title="Use global default"
              >global</button>
            </div>
          </div>

          <p className="text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg flex items-start gap-2">
            <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Changing speed or pitch does not affect cached audio. Clear the TTS cache in Settings to regenerate.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
          <div>
            {hasOverride && (
              <button
                onClick={handleClear}
                disabled={updateMutation.isPending}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
              >
                Clear Override
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {updateMutation.isPending && (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              )}
              Save Override
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
