import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronUpIcon, ChevronDownIcon,
  PencilIcon, TrashIcon,
  ChevronDoubleUpIcon, ChevronDoubleDownIcon,
} from "@heroicons/react/24/outline";
import type { Sentence } from "../../lib/api";
import { api } from "../../lib/api";

interface Props {
  sentence: Sentence;
  topicId: string;
  versionId: string;
  onReorderUp: () => void;
  onReorderDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function SentenceRow({ sentence, topicId, versionId, onReorderUp, onReorderDown, isFirst, isLast }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);


  const [editText, setEditText] = useState(sentence.text);
  const [editTranslation, setEditTranslation] = useState(sentence.translation ?? "");
  const [editNotes, setEditNotes] = useState(sentence.notes ?? "");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["topic", topicId] });

  const updateMutation = useMutation({
    mutationFn: () => api.updateSentence(sentence.id, {
      text: editText.trim(),
      translation: editTranslation.trim() || undefined,
      notes: editNotes.trim() || undefined,
    }),
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
    setEditTranslation(sentence.translation ?? "");
    setEditNotes(sentence.notes ?? "");
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
          placeholder="Sentence text"
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          value={editTranslation}
          onChange={(e) => setEditTranslation(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Translation (optional)"
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Notes (optional)"
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={cancelEdit} className="px-3 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={saveEdit}
            disabled={updateMutation.isPending}
            className="px-3 py-1 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-60"
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Position number */}
      <span className="flex-shrink-0 w-6 text-center text-xs font-mono text-gray-400 dark:text-gray-600 pt-0.5">
        {sentence.position + 1}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">{sentence.text}</p>

        {/* Translation toggle */}
        {sentence.translation && (
          <div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowTranslation((v) => !v); }}
              className="cursor-pointer inline-flex items-center gap-0.5 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors mt-0.5"
            >
              {showTranslation
                ? <><ChevronUpIcon className="w-3 h-3" /> hide</>
                : <><ChevronDownIcon className="w-3 h-3" /> translation</>}
            </button>
            {showTranslation && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{sentence.translation}</p>
            )}
          </div>
        )}

        {/* Notes toggle */}
        {sentence.notes && (
          <div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowNotes((v) => !v); }}
              className="cursor-pointer inline-flex items-center gap-0.5 text-xs text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors mt-0.5"
            >
              {showNotes
                ? <><ChevronUpIcon className="w-3 h-3" /> hide note</>
                : <><ChevronDownIcon className="w-3 h-3" /> note</>}
            </button>
            {showNotes && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2 py-1.5 leading-relaxed">{sentence.notes}</p>
            )}
          </div>
        )}
      </div>

      {/* Attempt count badge (US-7.4) */}
      <div className="flex-shrink-0 self-center">
        {sentence.attempt_count === undefined || sentence.attempt_count === 0 ? (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-medium">
            New
          </span>
        ) : (
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            (sentence.attempt_count ?? 0) >= 3
              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
              : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
          }`}>
            {sentence.attempt_count}×
          </span>
        )}
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Reorder */}
        <button
          onClick={onReorderUp}
          disabled={isFirst}
          className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 transition-colors"
          title="Move up"
        >
          <ChevronDoubleUpIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onReorderDown}
          disabled={isLast}
          className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 transition-colors"
          title="Move down"
        >
          <ChevronDoubleDownIcon className="w-3.5 h-3.5" />
        </button>

        {/* Edit */}
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          title="Edit"
        >
          <PencilIcon className="w-3.5 h-3.5" />
        </button>

        {/* Delete */}
        {showDeleteConfirm ? (
          <span className="flex items-center gap-1">
            <span className="text-xs text-red-500">Delete?</span>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-xs px-2 py-0.5 rounded bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              No
            </button>
          </span>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
            title="Delete"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
