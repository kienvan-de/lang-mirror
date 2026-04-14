import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ExclamationTriangleIcon, XCircleIcon, CheckCircleIcon, XMarkIcon, ArrowUpTrayIcon,
  DocumentTextIcon, MapPinIcon, TagIcon, PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { api } from "../lib/api";
import { langFlag, langLabel } from "../lib/lang";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewResult {
  ok: boolean;
  parseError: string | null;
  errors: Array<{ field: string; message: string }>;
  format: "single" | "topic" | null;
  title: string | null;
  description: string | null;
  tags?: string[];
  versions: Array<{ language: string; sentenceCount: number }>;
}

type Step = 1 | 2 | 3;
type Target = "new" | "existing";

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const { t } = useTranslation();
  const steps = [
    { n: 1 as Step, label: t("import.step1") },
    { n: 2 as Step, label: t("import.step2") },
    { n: 3 as Step, label: t("import.step3") },
  ];
  return (
    <div className="flex items-center mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              current === s.n
                ? "bg-blue-600 text-white"
                : current > s.n
                  ? "bg-green-500 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600"
            }`}>
              {current > s.n ? "✓" : s.n}
            </div>
            <span className={`text-[11px] sm:text-xs text-center leading-tight ${
              current === s.n ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-400 dark:text-gray-600"
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 flex-1 mx-2 mb-5 transition-colors ${
              current > s.n ? "bg-green-400" : "bg-gray-200 dark:bg-gray-700"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ImportPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [target, setTarget] = useState<Target>("new");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [topicSearch, setTopicSearch] = useState("");

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    topicId: string;
    topicTitle: string;
    totalSentences: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const { data: topics } = useQuery({
    queryKey: ["topics"],
    queryFn: api.getTopics,
  });

  const { data: allTags } = useQuery({
    queryKey: ["tags"],
    queryFn: api.getTags,
  });

  const filteredTopics = (topics ?? []).filter((t) =>
    t.title.toLowerCase().includes(topicSearch.toLowerCase())
  );

  const processFile = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["json"].includes(ext)) {
      setPreview({
        ok: false,
        parseError: t("import.unsupportedType", { ext }),
        errors: [],
        format: null,
        title: null,
        description: null,
        versions: [],
      });
      setFile(f);
      return;
    }
    setFile(f);
    setPreviewing(true);
    try {
      const result = await api.importPreview(f);
      setPreview(result);
      if (result.ok) {
        if (!topics || topics.length === 0) setTarget("new");
        setStep(2);
      }
    } catch (e) {
      setPreview({
        ok: false,
        parseError: (e as Error).message,
        errors: [],
        format: null,
        title: null,
        description: null,
        versions: [],
      });
    } finally {
      setPreviewing(false);
    }
  }, [topics, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) processFile(dropped);
  }, [processFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) processFile(picked);
    e.target.value = "";
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setPreview(null);
    setTarget("new");
    setSelectedTopicId("");
    setTopicSearch("");
    setImportResult(null);
    setImportError(null);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const topicId = target === "existing" && selectedTopicId ? selectedTopicId : undefined;
      const result = await api.importFile(file, topicId, "skip");
      setImportResult({
        topicId: result.topic.id,
        topicTitle: result.topic.title,
        totalSentences: result.totalSentences,
      });
      qc.invalidateQueries({ queryKey: ["topics"] });
      setStep(3);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const getConflicts = (): string[] => {
    if (target !== "existing" || !selectedTopicId || !preview?.versions) return [];
    const selected = topics?.find((t) => t.id === selectedTopicId);
    if (!selected) return [];
    const existingLangs = new Set(
      (selected.versions ?? []).map((v) => v.language_code.split("-")[0]!.toLowerCase())
    );
    return preview.versions
      .filter((v) => existingLangs.has(v.language.split("-")[0]!.toLowerCase()))
      .map((v) => v.language);
  };

  const conflicts = getConflicts();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("import.title")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {t("import.subtitle")}
        </p>
      </div>

      <StepIndicator current={step} />

      {/* ── Step 1: Upload ── */}
      {step === 1 && (
        <div className="space-y-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-3 min-h-[200px] rounded-2xl border-2 border-dashed transition-colors cursor-pointer select-none ${
              dragOver
                ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-700 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 bg-white dark:bg-gray-900"
            }`}
          >
            {previewing ? (
              <>
                <span className="w-8 h-8 rounded-full border-2 border-blue-400/40 border-t-blue-500 animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("import.parsing")}</p>
              </>
            ) : (
              <>
                <ArrowUpTrayIcon className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("import.dropZone")}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {t("import.dropZoneFormats")}
                  </p>
                </div>
                {file && !previewing && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-600 dark:text-gray-400">
                    <DocumentTextIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="font-mono">{file.name}</span>
                  </div>
                )}
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="sr-only"
            />
          </div>

          {preview && !preview.ok && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-2">
              {preview.parseError && (
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  <XCircleIcon className="w-4 h-4 inline-block mr-1 align-middle" />{preview.parseError}
                </p>
              )}
              {preview.errors.map((e, i) => (
                <div key={i} className="text-sm text-red-600 dark:text-red-400">
                  <span className="font-mono text-xs bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded mr-2">{e.field}</span>
                  {e.message}
                </div>
              ))}
              <p className="text-xs text-red-500 dark:text-red-500 mt-1">{t("import.fixAndRetry")}</p>
            </div>
          )}

          <details className="group">
            <summary className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none">
              ▸ {t("import.formatGuide")}
            </summary>
            <div className="mt-3 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{t("import.formatA")}</p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto text-gray-700 dark:text-gray-300">{`{
  "title": "Shopping in Tokyo",
  "description": "Everyday shopping vocabulary",
  "language": "ja",
  "tags": ["ja", "B1"],
  "voice_name": "ja-JP-NanamiNeural",
  "speed": 0.9,
  "sentences": [
    {
      "text": "いらっしゃいませ",
      "notes": {
        "en": "## Grammar\\n...",
        "de": "## Grammatik\\n...",
        "ja": "## 文法\\n...",
        "vi": "## Ngữ pháp\\n..."
      }
    },
    { "text": "これはいくらですか？" }
  ]
}`}</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{t("import.formatB")}</p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto text-gray-700 dark:text-gray-300">{`{
  "title": "My Lesson",
  "description": "Optional description",
  "tags": ["vi", "B2"],
  "versions": [
    {
      "language": "en",
      "title": "My Lesson",
      "voice_name": "en-US-JennyNeural",
      "speed": 0.9,
      "sentences": [
        {
          "text": "Hello, how are you?",
          "notes": {
            "en": "## Grammar\\n...",
            "vi": "## Ngữ pháp\\n..."
          }
        }
      ]
    },
    {
      "language": "vi",
      "title": "Bài học của tôi",
      "voice_name": "vi-VN-HoaiMyNeural",
      "speed": 1.0,
      "sentences": [
        { "text": "Xin chào, bạn có khỏe không?" }
      ]
    }
  ]
}`}</pre>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* ── Step 2: Choose Target ── */}
      {step === 2 && preview && (
        <div className="space-y-5">
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">
                  {t("import.parsedSuccess", {
                    format: preview.format === "single" ? "Single-language" : "Multi-language",
                  })}
                </p>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">{preview.title}</p>
                {preview.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{preview.description}</p>
                )}
              </div>
              <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 inline-flex items-center gap-0.5">
                <XMarkIcon className="w-3 h-3" /> {t("common.change")}
              </button>
            </div>
            {/* Tag badges (from detected tags in file) */}
            {preview.tags && preview.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {preview.tags.map(tagName => {
                  const tag = allTags?.find(t => t.name === tagName);
                  return tag ? (
                    <span key={tagName} className="px-2.5 py-0.5 rounded-full text-xs font-semibold border"
                      style={{ backgroundColor: tag.color + "20", borderColor: tag.color, color: tag.color }}>
                      {tag.name}
                    </span>
                  ) : (
                    <span key={tagName} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                      {tagName}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {preview.versions.map((v) => {
                  const tag = allTags?.find(t => t.name === v.language.split("-")[0]!.toLowerCase());
                  return tag ? (
                    <span key={v.language} className="px-2.5 py-0.5 rounded-full text-xs font-semibold border"
                      style={{ backgroundColor: tag.color + "20", borderColor: tag.color, color: tag.color }}>
                      {tag.name}
                    </span>
                  ) : (
                    <span key={v.language} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                      {v.language}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t("import.whereImport")}</p>
            <div className="space-y-2">
              <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                target === "new"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}>
                <input
                  type="radio"
                  name="target"
                  value="new"
                  checked={target === "new"}
                  onChange={() => setTarget("new")}
                  className="accent-blue-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t("import.createNew")}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("import.createNewHint", { title: preview.title ?? "" })}
                  </p>
                </div>
              </label>

              {topics && topics.length > 0 && (
                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  target === "existing"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}>
                  <input
                    type="radio"
                    name="target"
                    value="existing"
                    checked={target === "existing"}
                    onChange={() => setTarget("existing")}
                    className="accent-blue-600 mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t("import.addToExisting")}</p>
                    {target === "existing" && (
                      <div className="mt-2">
                        <input
                          type="text"
                          placeholder={t("import.searchTopics")}
                          value={topicSearch}
                          onChange={(e) => setTopicSearch(e.target.value)}
                          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {filteredTopics.map((t) => (
                            <button
                              key={t.id}
                              onClick={(e) => { e.preventDefault(); setSelectedTopicId(t.id); }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                selectedTopicId === t.id
                                  ? "bg-blue-600 text-white"
                                  : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400"
                              }`}
                            >
                              <span className="font-medium">{t.title}</span>
                              {(t.versions ?? []).length > 0 && (
                                <span className="ml-2 text-xs opacity-70">
                                  {(t.versions ?? []).map((v) => langFlag(v.language_code)).join(" ")}
                                </span>
                              )}
                            </button>
                          ))}
                          {filteredTopics.length === 0 && (
                            <p className="text-xs text-gray-400 dark:text-gray-600 px-2 py-2">{t("import.noTopicsMatch")}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              )}
            </div>
          </div>

          {conflicts.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                <ExclamationTriangleIcon className="w-4 h-4 inline-block mr-1 align-middle" />{t("import.conflictWarning", { langs: conflicts.map((c) => langLabel(c)).join(", ") })}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                {t("import.conflictHint")}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={reset}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >← {t("common.back")}</button>
            <button
              onClick={() => setStep(3)}
              disabled={target === "existing" && !selectedTopicId}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors disabled:opacity-40"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Confirm & Import ── */}
      {step === 3 && preview && !importResult && (
        <div className="space-y-5">
          <div className="rounded-xl border border-gray-300 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("import.importSummary")}</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <DocumentTextIcon className="w-4 h-4 opacity-60 flex-shrink-0" />
                <span>{t("import.fileLabel")} <span className="font-medium text-gray-800 dark:text-gray-200">{file?.name}</span></span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <MapPinIcon className="w-4 h-4 opacity-60 flex-shrink-0" />
                <span>
                  {t("import.topicLabel")}{" "}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {target === "new"
                      ? `Create "${preview.title}"`
                      : `Add to "${topics?.find((t) => t.id === selectedTopicId)?.title ?? selectedTopicId}"`}
                  </span>
                </span>
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <TagIcon className="w-4 h-4 opacity-60 flex-shrink-0 mt-0.5" />
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set([
                    ...(preview.tags ?? []),
                    ...preview.versions.map(v => v.language.split("-")[0]!.toLowerCase()),
                  ])].map(tagName => {
                    const tag = allTags?.find(t => t.name === tagName);
                    return tag ? (
                      <span key={tagName} className="px-2.5 py-0.5 rounded-full text-xs font-semibold border"
                        style={{ backgroundColor: tag.color + "20", borderColor: tag.color, color: tag.color }}>
                        {tag.name}
                      </span>
                    ) : (
                      <span key={tagName} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                        {tagName}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <PencilSquareIcon className="w-4 h-4 opacity-60 flex-shrink-0" />
                <span>
                  {t("import.totalLabel")}{" "}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {(() => {
                      const total = preview.versions.reduce((s, v) => s + v.sentenceCount, 0);
                      return `${total} ${t("dashboard.sentences", { count: total })}`;
                    })()}
                  </span>
                </span>
              </div>
              {conflicts.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{t("import.willBeSkipped", { langs: conflicts.map((c) => langLabel(c)).join(", ") })}</span>
                </div>
              )}
            </div>
          </div>

          {importError && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium"><XCircleIcon className="w-4 h-4 inline-block mr-1 align-middle" />{importError}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setStep(2)}
              disabled={importing}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-40"
            >← {t("common.back")}</button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {importing && (
                <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              )}
              {importing ? t("import.importing") : t("import.importBtn")}
            </button>
          </div>
        </div>
      )}

      {/* ── Success state ── */}
      {importResult && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6 text-center">
            <div className="flex justify-center mb-3">
              <CheckCircleIcon className="w-12 h-12 text-green-500 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
              {t("import.successTitle")}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("import.successSubtitle", {
                count: importResult.totalSentences,
                title: importResult.topicTitle,
              })}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/topics/$topicId"
              params={{ topicId: importResult.topicId }}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
            >
              {t("import.viewTopic")} →
            </Link>
            <button
              onClick={reset}
              className="px-5 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t("import.importAnother")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImportPage;
