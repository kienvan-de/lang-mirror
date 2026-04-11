import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Sentence, Version } from "../../lib/api";
import { api } from "../../lib/api";
import { SentenceRow } from "./SentenceRow";

interface Props {
  sentences: Sentence[];
  versionId: string;
  topicId: string;
  /** All versions of this topic (including the active one) — used for cross-language sibling display */
  allVersions: Version[];
  /** The language_code of the currently-active version */
  activeLangCode: string;
  /** Whether the current user can edit this topic (owner or admin) */
  canEdit?: boolean;
  isNative?: boolean;
}

export function SentenceList({ sentences, versionId, topicId, allVersions, activeLangCode, canEdit = false, isNative = false }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [newText, setNewText] = useState("");
  const [addError, setAddError] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["topic", topicId] });

  const addMutation = useMutation({
    mutationFn: () =>
      api.createSentence(versionId, {
        text: newText.trim(),
      }),
    onSuccess: () => {
      setNewText("");
      setAddError("");
      invalidate();
    },
    onError: (err: Error & { data?: { error?: string } }) => {
      setAddError(err.data?.error ?? t("sentenceList.textRequired"));
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => api.reorderSentences(versionId, ids),
    onSuccess: invalidate,
  });

  const moveUp = (index: number) => {
    if (index === 0) return;
    const ids = sentences.map((s) => s.id);
    [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
    reorderMutation.mutate(ids);
  };

  const moveDown = (index: number) => {
    if (index === sentences.length - 1) return;
    const ids = sentences.map((s) => s.id);
    [ids[index + 1], ids[index]] = [ids[index]!, ids[index + 1]!];
    reorderMutation.mutate(ids);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!newText.trim()) { setAddError(t("sentenceList.textRequired")); return; }
    addMutation.mutate();
  };

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddSubmit(e as unknown as React.FormEvent); }
  };

  // Build a map: langCode → sentences array (for sibling lookup by position)
  const siblingVersions = allVersions.filter((v) => v.language_code !== activeLangCode);

  return (
    <div className="space-y-1">
      {/* Sentence rows */}
      {sentences.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-600">
          {t("sentenceList.empty")}
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {sentences.map((sentence, index) => (
            <SentenceRow
              key={sentence.id}
              sentence={sentence}
              versionId={versionId}
              topicId={topicId}
              siblingVersions={siblingVersions}
              onReorderUp={() => moveUp(index)}
              onReorderDown={() => moveDown(index)}
              isFirst={index === 0}
              isLast={index === sentences.length - 1}
              canEdit={canEdit}
              isNative={isNative}
            />
          ))}
        </div>
      )}

      {/* Add sentence form (owner/admin only) */}
      {canEdit && <form
        onSubmit={handleAddSubmit}
        className="mt-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 space-y-2 bg-gray-50/50 dark:bg-gray-800/30"
      >
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t("sentenceList.addHeading")}</p>
        <input
          type="text"
          value={newText}
          onChange={(e) => { setNewText(e.target.value); setAddError(""); }}
          onKeyDown={handleAddKeyDown}
          placeholder={t("sentenceList.textPlaceholder")}
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        />
{addError && <p className="text-xs text-red-500">{addError}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-colors disabled:opacity-60"
          >
            {addMutation.isPending ? t("sentenceList.adding") : t("sentenceList.add")}
          </button>
        </div>
      </form>}
    </div>
  );
}
