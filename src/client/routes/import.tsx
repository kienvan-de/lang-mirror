import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
  versions: Array<{ language: string; sentenceCount: number }>;
}

type Step = 1 | 2 | 3;
type Target = "new" | "existing";

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { n: 1 as Step, label: "Upload File" },
    { n: 2 as Step, label: "Choose Topic" },
    { n: 3 as Step, label: "Confirm & Import" },
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              current === s.n
                ? "bg-blue-600 text-white"
                : current > s.n
                  ? "bg-green-500 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600"
            }`}>
              {current > s.n ? "✓" : s.n}
            </div>
            <span className={`text-xs whitespace-nowrap ${
              current === s.n ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-400 dark:text-gray-600"
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-16 mx-1 mb-5 transition-colors ${
              current > s.n ? "bg-green-400" : "bg-gray-200 dark:bg-gray-700"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Language badge ────────────────────────────────────────────────────────────

function LangBadge({ language, sentenceCount }: { language: string; sentenceCount: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <span className="text-base">{langFlag(language)}</span>
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{langLabel(language)}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{sentenceCount} sentence{sentenceCount !== 1 ? "s" : ""}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ImportPage() {
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

  const filteredTopics = (topics ?? []).filter((t) =>
    t.title.toLowerCase().includes(topicSearch.toLowerCase())
  );

  // ── File handling ────────────────────────────────────────────────────────

  const processFile = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["json", "yaml", "yml"].includes(ext)) {
      setPreview({
        ok: false,
        parseError: `Unsupported file type ".${ext}". Please upload a .json, .yaml, or .yml file.`,
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
        // Auto-select "new" target if no topics exist
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
  }, [topics]);

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

  // ── Import handler ───────────────────────────────────────────────────────

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

  // ── Conflict check for step 2 ────────────────────────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import Lesson</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Import topic content from a JSON or YAML file.
        </p>
      </div>

      <StepIndicator current={step} />

      {/* ── Step 1: Upload ── */}
      {step === 1 && (
        <div className="space-y-5">
          {/* Drop zone */}
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Parsing file…</p>
              </>
            ) : (
              <>
                <span className="text-4xl">📂</span>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Drop a file here, or click to browse
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Supports .json, .yaml, .yml
                  </p>
                </div>
                {file && !previewing && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-600 dark:text-gray-400">
                    <span>📄</span>
                    <span className="font-mono">{file.name}</span>
                  </div>
                )}
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.yaml,.yml"
              onChange={handleFileChange}
              className="sr-only"
            />
          </div>

          {/* Parse error or validation errors */}
          {preview && !preview.ok && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-2">
              {preview.parseError && (
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  ❌ {preview.parseError}
                </p>
              )}
              {preview.errors.map((e, i) => (
                <div key={i} className="text-sm text-red-600 dark:text-red-400">
                  <span className="font-mono text-xs bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded mr-2">{e.field}</span>
                  {e.message}
                </div>
              ))}
              <p className="text-xs text-red-500 dark:text-red-500 mt-1">Fix the file and try again.</p>
            </div>
          )}

          {/* Format guide */}
          <details className="group">
            <summary className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none">
              ▸ Expected file formats
            </summary>
            <div className="mt-3 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Format A — Single language</p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto text-gray-700 dark:text-gray-300">{`{
  "title": "Shopping in Tokyo",
  "language": "ja",
  "sentences": [
    { "text": "いらっしゃいませ", "translation": "Welcome" },
    { "text": "これはいくらですか？" }
  ]
}`}</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Format B — Multi-language topic</p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto text-gray-700 dark:text-gray-300">{`{
  "title": "Shopping",
  "versions": [
    {
      "language": "ja",
      "sentences": [{ "text": "いらっしゃいませ" }]
    },
    {
      "language": "es",
      "sentences": [{ "text": "Bienvenido" }]
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
          {/* Preview card */}
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">
                  ✓ File parsed successfully · {preview.format === "single" ? "Single-language" : "Multi-language"} format
                </p>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">{preview.title}</p>
                {preview.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{preview.description}</p>
                )}
              </div>
              <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
                ✕ Change
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.versions.map((v) => (
                <LangBadge key={v.language} language={v.language} sentenceCount={v.sentenceCount} />
              ))}
            </div>
          </div>

          {/* Target choice */}
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Where should this be imported?</p>
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
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Create new topic</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Creates "{preview.title}" as a new topic
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
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Add to existing topic</p>
                    {target === "existing" && (
                      <div className="mt-2">
                        <input
                          type="text"
                          placeholder="Search topics…"
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
                            <p className="text-xs text-gray-400 dark:text-gray-600 px-2 py-2">No topics match</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Conflict warning */}
          {conflicts.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                ⚠️ Language conflict: {conflicts.map((c) => langLabel(c)).join(", ")} already exist{conflicts.length === 1 ? "s" : ""} in this topic
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                Existing languages will be skipped; only new languages will be added.
              </p>
            </div>
          )}

          {/* Next button */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={reset}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >← Back</button>
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
          {/* Summary card */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Import Summary</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="opacity-60">📄</span>
                <span>File: <span className="font-medium text-gray-800 dark:text-gray-200">{file?.name}</span></span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="opacity-60">📌</span>
                <span>
                  Topic:{" "}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {target === "new"
                      ? `Create "${preview.title}"`
                      : `Add to "${topics?.find((t) => t.id === selectedTopicId)?.title ?? selectedTopicId}"`}
                  </span>
                </span>
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="opacity-60 mt-0.5">🌐</span>
                <div className="flex flex-wrap gap-1.5">
                  {preview.versions.map((v) => (
                    <LangBadge key={v.language} language={v.language} sentenceCount={v.sentenceCount} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="opacity-60">✏️</span>
                <span>
                  Total:{" "}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {preview.versions.reduce((s, v) => s + v.sentenceCount, 0)} sentences
                  </span>
                </span>
              </div>
              {conflicts.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <span>⚠️</span>
                  <span>{conflicts.map((c) => langLabel(c)).join(", ")} will be skipped (already exist)</span>
                </div>
              )}
            </div>
          </div>

          {importError && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">❌ {importError}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setStep(2)}
              disabled={importing}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-40"
            >← Back</button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {importing && (
                <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              )}
              {importing ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      )}

      {/* ── Success state ── */}
      {importResult && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6 text-center">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
              Import successful!
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Imported <span className="font-semibold">{importResult.totalSentences}</span> sentence{importResult.totalSentences !== 1 ? "s" : ""} into{" "}
              <span className="font-semibold">"{importResult.topicTitle}"</span>
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/topics/$topicId"
              params={{ topicId: importResult.topicId }}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
            >
              View Topic →
            </Link>
            <button
              onClick={reset}
              className="px-5 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Import Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export as default for compatibility with router stub reference
export default ImportPage;
