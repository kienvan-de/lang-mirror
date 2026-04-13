import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ChevronUpIcon, ChevronDownIcon,
  PencilIcon, TrashIcon,
  ChevronDoubleUpIcon, ChevronDoubleDownIcon,
  DocumentTextIcon, SpeakerWaveIcon, StopIcon,
} from "@heroicons/react/24/outline";
import type { Sentence, Version } from "../../lib/api";
import { api } from "../../lib/api";
import { NotesDialog } from "./NotesDialog";
import { langFlag, langLabel } from "../../lib/lang";

interface Props {
  canEdit?: boolean;
  isNative?: boolean;
  sentence: Sentence;
  topicId: string;
  versionId: string;
  /** Versions of this topic other than the active one — used for sibling sentence display */
  siblingVersions: Version[];
  onReorderUp: () => void;
  onReorderDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function SentenceRow({ sentence, topicId, versionId, siblingVersions, onReorderUp, onReorderDown, isFirst, isLast, canEdit = false, isNative = false }: Props) {
  const { t, i18n } = useTranslation();
  const uiLang = i18n.language.split("-")[0]!;
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showSiblings, setShowSiblings] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [editText, setEditText] = useState(sentence.text);
  // Edit only the UI-language slot; other language notes are preserved on save
  const [editNotes, setEditNotes] = useState(sentence.notes?.[uiLang] ?? "");
  const editRef = useRef<HTMLInputElement>(null);

  // ── Recording playback ────────────────────────────────────────────────────
  const [playingRecording, setPlayingRecording] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayRecording = () => {
    // If already playing, stop it
    if (playingRecording && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingRecording(false);
      return;
    }
    const audio = new Audio(api.getRecordingUrl(sentence.id));
    audioRef.current = audio;
    setPlayingRecording(true);
    audio.play().catch(() => setPlayingRecording(false)); // 404 = no recording, silent fail
    audio.onended = () => { audioRef.current = null; setPlayingRecording(false); };
    audio.onerror = () => { audioRef.current = null; setPlayingRecording(false); };
  };

  // Stop audio when component unmounts
  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["topic", topicId] });

  const updateMutation = useMutation({
    mutationFn: () => {
      // Merge edited UI-language note back into the map; remove key if empty
      const existing = sentence.notes ?? {};
      const merged: Record<string, string> = { ...existing };
      if (editNotes.trim()) {
        merged[uiLang] = editNotes.trim();
      } else {
        delete merged[uiLang];
      }
      return api.updateSentence(sentence.id, {
        text: editText.trim(),
        notes: Object.keys(merged).length > 0 ? merged : undefined,
      });
    },
    onSuccess: () => { setEditing(false); invalidate(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSentence(sentence.id),
    onSuccess: () => { setShowDeleteConfirm(false); invalidate(); },
  });

  const saveEdit = () => {
    if (!editText.trim()) return;
    updateMutation.mutate();
  };

  const cancelEdit = () => {
    setEditText(sentence.text);
    setEditNotes(sentence.notes?.[uiLang] ?? "");
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") cancelEdit();
  };

  if (editing) {
    return (
      <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
        <input
          ref={editRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("sentenceRow.textPlaceholder")}
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
          <DocumentTextIcon className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          <span>{t("sentenceRow.notesPlaceholder")}</span>
          <span className="ml-auto px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium uppercase text-[10px]">{uiLang}</span>
        </div>
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          placeholder={t("sentenceRow.notesPlaceholder")}
          rows={4}
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={cancelEdit} className="px-3 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            {t("common.cancel")}
          </button>
          <button
            onClick={saveEdit}
            disabled={updateMutation.isPending}
            className="px-3 py-1 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-60"
          >
            {updateMutation.isPending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    );
  }

  // Sibling sentences at the same position (one per other-language version)
  const siblings = siblingVersions
    .map((v) => ({
      langCode: v.language_code,
      text: v.sentences?.find((s) => s.position === sentence.position)?.text ?? null,
    }))
    .filter((s) => s.text !== null) as { langCode: string; text: string }[];

  return (
    <>
      <div className="group flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        {/* Position number */}
        <span className="flex-shrink-0 w-6 text-center text-xs font-mono text-gray-400 dark:text-gray-600 pt-0.5">
          {sentence.position + 1}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">{sentence.text}</p>

          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {/* Sibling languages toggle — hidden on native language tab */}
            {!isNative && siblings.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowSiblings((v) => !v); }}
                className="cursor-pointer inline-flex items-center gap-0.5 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                {showSiblings
                  ? <><ChevronUpIcon className="w-3 h-3" /> {t("sentenceRow.hideTranslation")}</>
                  : <><ChevronDownIcon className="w-3 h-3" /> {t("sentenceRow.showTranslation")}</>}
              </button>
            )}

            {/* Notes button — hidden on native language tab */}
            {!isNative && sentence.notes?.[uiLang] && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowNotesDialog(true); }}
                className="cursor-pointer inline-flex items-center gap-0.5 text-xs text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              >
                <DocumentTextIcon className="w-3 h-3" /> {t("sentenceRow.showNote")}
              </button>
            )}

            {/* Recording playback button — plays the user's latest recorded audio */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handlePlayRecording(); }}
              title={playingRecording ? t("sentenceRow.stopRecording") : t("sentenceRow.playRecording")}
              className={`cursor-pointer inline-flex items-center gap-0.5 text-xs transition-colors ${
                playingRecording
                  ? "text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                  : "text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-300"
              }`}
            >
              {playingRecording
                ? <><StopIcon className="w-3 h-3" /> {t("sentenceRow.stopRecording")}</>
                : <><SpeakerWaveIcon className="w-3 h-3" /> {t("sentenceRow.playRecording")}</>
              }
            </button>
          </div>

          {/* Sibling sentences — hidden on native language tab */}
          {!isNative && showSiblings && siblings.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {siblings.map(({ langCode, text }) => (
                <p key={langCode} className="text-xs text-gray-500 dark:text-gray-400 italic flex items-center gap-1.5">
                  <span className="not-italic">{langFlag(langCode)}</span>
                  <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 not-italic uppercase">{langLabel(langCode)}</span>
                  {text}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Attempt count badge */}
        <div className="flex-shrink-0 self-center">
          {sentence.attempt_count === undefined || sentence.attempt_count === 0 ? (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-medium">
              {t("sentenceRow.new")}
            </span>
          ) : (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              (sentence.attempt_count ?? 0) >= 3
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
            }`}>
              {t("sentenceRow.practicedCount", { count: sentence.attempt_count })}
            </span>
          )}
        </div>

        {/* Actions (visible on hover, owner/admin only) */}
        {canEdit && (
          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Reorder */}
            <button
              onClick={onReorderUp}
              disabled={isFirst}
              className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 transition-colors"
              title={t("common.moveUp")}
            >
              <ChevronDoubleUpIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onReorderDown}
              disabled={isLast}
              className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 transition-colors"
              title={t("common.moveDown")}
            >
              <ChevronDoubleDownIcon className="w-3.5 h-3.5" />
            </button>

            {/* Edit */}
            <button
              onClick={() => setEditing(true)}
              className="p-1 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title={t("common.edit")}
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>

            {/* Delete */}
            {showDeleteConfirm ? (
              <span className="flex items-center gap-1">
                <span className="text-xs text-red-500">{t("sentenceRow.deleteConfirm")}</span>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="text-xs px-2 py-0.5 rounded bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                >
                  {t("common.yes")}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {t("common.no")}
                </button>
              </span>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
                title={t("common.delete")}
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Notes modal */}
      {showNotesDialog && sentence.notes?.[uiLang] && (
        <NotesDialog
          notes={sentence.notes}
          uiLang={uiLang}
          sentenceText={sentence.text}
          onClose={() => setShowNotesDialog(false)}
        />
      )}
    </>
  );
}
