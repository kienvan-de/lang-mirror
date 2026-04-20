import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ChevronRightIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { api } from "../lib/api";
import { langFlag, langName } from "../lib/lang";
import { SUPPORTED_LANGS } from "../lib/supported-langs";

const LANG_MIRROR_LANG_KEY = "lang-mirror-lang";



type Step = 1 | 2 | 3 | 4;

export function OnboardingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>(1);
  const [native, setNative] = useState<string | null>(null);

  const selectNative = (code: string) => {
    setNative(code);
    // Switch UI language immediately so the rest of the wizard
    // renders in the user's chosen language
    i18n.changeLanguage(code);
    localStorage.setItem(LANG_MIRROR_LANG_KEY, code);
  };
  const [learning, setLearning] = useState<string[]>([]);
  const [uploadRecordings, setUploadRecordings] = useState(true);
  const [saving, setSaving] = useState(false);

  const toggleLearning = (code: string) => {
    setLearning(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleFinish = async () => {
    if (!native) return;
    setSaving(true);
    try {
      await Promise.all([
        api.setSetting("user.nativeLanguage", native),
        api.setSetting("user.learningLanguages", JSON.stringify(learning)),
        api.setSetting("privacy.uploadRecordings", String(uploadRecordings)),
      ]);
      // Invalidate settings cache so useUserLanguages re-fetches and
      // hasConfig becomes true before we navigate — prevents redirect loop
      await qc.invalidateQueries({ queryKey: ["settings"] });
      setStep(4);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">

          {/* Logo / branding */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t("onboarding.welcome")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t("onboarding.subtitle")}
            </p>
          </div>

          {/* Step indicator — only show for steps 1–3 */}
          {step !== 4 && (
            <div className="flex items-center justify-center gap-2 mb-8">
              {([1, 2, 3] as number[]).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    step > s
                      ? "bg-green-500 text-white"
                      : step === s
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-400"
                  }`}>
                    {step > s ? <CheckIcon className="w-3.5 h-3.5" /> : s}
                  </div>
                  {s < 3 && (
                    <div className={`w-8 h-0.5 rounded ${step > s ? "bg-green-400" : "bg-gray-200 dark:bg-gray-700"}`} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 shadow-xl p-6 space-y-5">

            {/* Step 1 — Native language */}
            {step === 1 && (
              <>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {t("onboarding.step1Title")}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {t("onboarding.step1Hint")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_LANGS.map((code) => (
                    <button
                      key={code}
                      onClick={() => selectNative(code)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        native === code
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
                      }`}
                    >
                      <span>{langFlag(code)}</span>
                      <span>{langName(code)}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep(2)}
                  disabled={!native}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t("common.next")} <ChevronRightIcon className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Step 2 — Learning languages */}
            {step === 2 && (
              <>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {t("onboarding.step2Title")}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {t("onboarding.step2Hint")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_LANGS.filter(c => c !== native).map((code) => (
                    <button
                      key={code}
                      onClick={() => toggleLearning(code)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        learning.includes(code)
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
                      }`}
                    >
                      <span>{langFlag(code)}</span>
                      <span>{langName(code)}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {t("common.back")}
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                  >
                    {t("common.next")} <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* Step 3 — Recording privacy */}
            {step === 3 && (
              <>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {t("onboarding.step3Title")}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {t("onboarding.step3Hint")}
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Save recordings option */}
                  <button
                    onClick={() => setUploadRecordings(true)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                      uploadRecordings
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-300 dark:border-gray-600 hover:border-gray-400"
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      uploadRecordings ? "border-blue-600 bg-blue-600" : "border-gray-400"
                    }`}>
                      {uploadRecordings && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {t("onboarding.recordingOptionSave")}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {t("onboarding.recordingOptionSaveHint")}
                      </p>
                    </div>
                  </button>

                  {/* Don't save option */}
                  <button
                    onClick={() => setUploadRecordings(false)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                      !uploadRecordings
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-300 dark:border-gray-600 hover:border-gray-400"
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      !uploadRecordings ? "border-blue-600 bg-blue-600" : "border-gray-400"
                    }`}>
                      {!uploadRecordings && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {t("onboarding.recordingOptionSkip")}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {t("onboarding.recordingOptionSkipHint")}
                      </p>
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <ShieldCheckIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{t("onboarding.privacyNote")}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {t("common.back")}
                  </button>
                  <button
                    onClick={handleFinish}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {saving
                      ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      : <><CheckIcon className="w-4 h-4" /> {t("onboarding.finish")}</>
                    }
                  </button>
                </div>
              </>
            )}

            {/* Step 4 — Success */}
            {step === 4 && (
              <div className="text-center space-y-5 py-4">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {t("onboarding.successTitle")}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {t("onboarding.successHint")}
                  </p>
                </div>
                <button
                  onClick={() => navigate({ to: "/" })}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
                >
                  {t("onboarding.practiceNow")}
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
