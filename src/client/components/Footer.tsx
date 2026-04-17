import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto py-6 px-4 border-t border-gray-200 dark:border-gray-800">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs text-gray-400 dark:text-gray-500">
        <span>© {year} kienvan.de. {t("footer.allRightsReserved")}</span>
        <span className="hidden sm:inline text-gray-300 dark:text-gray-700">·</span>
        <Link
          to="/privacy"
          className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors underline underline-offset-2"
        >
          {t("footer.privacyPolicy")}
        </Link>
        <span className="hidden sm:inline text-gray-300 dark:text-gray-700">·</span>
        <Link
          to="/terms"
          className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors underline underline-offset-2"
        >
          {t("footer.termsOfService")}
        </Link>
      </div>
    </footer>
  );
}
