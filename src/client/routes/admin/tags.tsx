import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { api, type Tag } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

export function AdminTagsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: tags = [], refetch: refetchTags } = useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: api.getTags,
    enabled: user?.role === "admin",
  });

  const createTagMutation = useMutation({
    mutationFn: api.createTag,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      refetchTags();
      setNewTagName("");
      setNewTagType("custom");
      setNewTagColor("#6366f1");
      setTagError("");
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: api.deleteTag,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });

  const [newTagName, setNewTagName] = useState("");
  const [newTagType, setNewTagType] = useState("custom");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [tagError, setTagError] = useState("");

  if (user?.role !== "admin") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
          <p className="text-lg font-semibold text-red-700 dark:text-red-400">403 — Forbidden</p>
          <p className="text-sm text-red-500 dark:text-red-500 mt-1">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 mb-3 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          {t("admin.backToAdmin")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("admin.manageTags")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("admin.manageTagsHint")}</p>
      </div>

      {/* Tags card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 p-6 shadow-sm space-y-5">

        {/* Existing tags grouped by type */}
        {["level", "language", "custom"].map(type => {
          const typeTags = tags.filter(tag => tag.type === type);
          if (typeTags.length === 0) return null;
          return (
            <div key={type}>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                {type}
              </p>
              <div className="flex flex-wrap gap-2">
                {typeTags.map(tag => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium border"
                    style={{ backgroundColor: tag.color + "20", borderColor: tag.color, color: tag.color }}
                  >
                    <span>{tag.name}</span>
                    <button
                      onClick={() => {
                        if (confirm(`Delete tag "${tag.name}"?`)) {
                          deleteTagMutation.mutate(tag.id);
                        }
                      }}
                      className="ml-1 opacity-60 hover:opacity-100 transition-opacity text-xs leading-none"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {tags.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500">{t("admin.noTags")}</p>
        )}

        {/* Divider */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            {t("settings.addTag")}
          </p>
          <div className="flex items-start gap-2 flex-wrap">
            <input
              type="text"
              value={newTagName}
              onChange={e => { setNewTagName(e.target.value); setTagError(""); }}
              placeholder={t("settings.tagNamePlaceholder")}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-36"
            />
            <select
              value={newTagType}
              onChange={e => setNewTagType(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
            >
              <option value="level">level</option>
              <option value="language">language</option>
              <option value="custom">custom</option>
            </select>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={newTagColor}
                onChange={e => setNewTagColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
              />
              <span className="text-xs font-mono text-gray-500">{newTagColor}</span>
            </div>
            <button
              onClick={async () => {
                if (!newTagName.trim()) { setTagError(t("settings.tagNameRequired")); return; }
                await createTagMutation.mutateAsync({
                  name: newTagName.trim(),
                  type: newTagType,
                  color: newTagColor,
                });
              }}
              disabled={createTagMutation.isPending}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors disabled:opacity-60"
            >
              {createTagMutation.isPending ? t("common.saving") : t("settings.addTag")}
            </button>
          </div>
          {tagError && <p className="text-xs text-red-500 mt-1">{tagError}</p>}
        </div>
      </div>
    </div>
  );
}
