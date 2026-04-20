import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";

export function PrivacyPage() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-12">
        {/* Back link */}
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-8 transition-colors"
        >
          ← {t("common.back")}
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30">
            <ShieldCheckIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t("privacy.title")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("privacy.lastUpdated", { year })}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t("privacy.section1Title")}
            </h2>
            <p>{t("privacy.section1Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t("privacy.section2Title")}
            </h2>
            <p>{t("privacy.section2Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t("privacy.section3Title")}
            </h2>
            <p>{t("privacy.section3Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t("privacy.section4Title")}
            </h2>
            <p>{t("privacy.section4Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t("privacy.section5Title")}
            </h2>
            <p>{t("privacy.section5Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t("privacy.section6Title")}
            </h2>
            <p>{t("privacy.section6Body")}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t("privacy.section7Title")}
            </h2>
            <p>
              {t("privacy.section7Body")}{" "}
              <a
                href="mailto:support@langmirror.today"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@langmirror.today
              </a>
            </p>
          </section>

        </div>
      </div>

    </div>
  );
}
