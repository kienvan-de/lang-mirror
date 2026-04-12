import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "./useAuth";

export interface UserLanguageConfig {
  nativeLanguage: string | null;
  learningLanguages: string[];
  /** true if at least nativeLanguage is set */
  hasConfig: boolean;
  /** all required language codes: [native, ...learning] */
  requiredLanguages: string[];
  /** true while the settings query is still in-flight */
  isLoadingConfig: boolean;
}

export function useUserLanguages(): UserLanguageConfig {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const userId = user?.id ?? "";

  const { data: settings, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["settings", userId],
    queryFn: api.getSettings,
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  const nativeLanguage = settings?.["user.nativeLanguage"] ?? null;
  const learningLanguages: string[] = (() => {
    try {
      const raw = settings?.["user.learningLanguages"];
      if (!raw) return [];
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  })();

  // Sync i18n to native language setting — also persist to localStorage
  // so i18n detector picks it up on next page load before settings fetch resolves
  useEffect(() => {
    if (nativeLanguage && i18n.language !== nativeLanguage) {
      i18n.changeLanguage(nativeLanguage);
      localStorage.setItem("lang-mirror-lang", nativeLanguage);
    }
  }, [nativeLanguage, i18n]);

  const hasConfig = !!nativeLanguage;
  // Exclude native language from learning languages in case the user accidentally saved it in both
  const filteredLearningLanguages = learningLanguages.filter(l => l !== nativeLanguage);
  const requiredLanguages = hasConfig
    ? [nativeLanguage!, ...filteredLearningLanguages]
    : [];

  return { nativeLanguage, learningLanguages, hasConfig, requiredLanguages, isLoadingConfig };
}
