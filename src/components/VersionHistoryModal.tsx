import { useEffect, useState } from "react";
import { listNoteVersions, restoreNoteVersion } from "../api";
import type { NoteVersionItem } from "../types";

interface VersionHistoryModalProps {
  noteId: string;
  noteTitle: string;
  onClose: () => void;
  onRestored: () => void;
}

function formatVersionDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function VersionHistoryModal({
  noteId,
  noteTitle,
  onClose,
  onRestored,
}: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<NoteVersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listNoteVersions(noteId)
      .then((list) => {
        if (!cancelled) setVersions(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const handleRestore = async (savedAt: string) => {
    if (!confirm("Restore this version? Current content will be replaced and saved.")) return;
    setRestoring(savedAt);
    setError(null);
    try {
      await restoreNoteVersion(noteId, savedAt);
      onRestored();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-history-title"
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-lg shadow-xl border border-stone-200 dark:border-stone-700 w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between shrink-0">
          <h2 id="version-history-title" className="text-lg font-semibold text-stone-800 dark:text-stone-200">
            Version history
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-700 dark:hover:text-stone-300"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="px-4 pb-2 text-sm text-stone-500 dark:text-stone-400 truncate" title={noteTitle}>
          {noteTitle || "Untitled"}
        </p>
        {error && (
          <div className="mx-4 mb-2 px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-stone-500 dark:text-stone-400 text-sm">Loading versions…</p>
          ) : versions.length === 0 ? (
            <p className="text-stone-500 dark:text-stone-400 text-sm">
              No previous versions. Edits are saved as you type; future changes will appear here.
            </p>
          ) : (
            <ul className="space-y-3">
              {versions.map((v) => (
                <li
                  key={v.savedAt}
                  className="border border-stone-200 dark:border-stone-700 rounded-lg p-3 bg-stone-50/50 dark:bg-stone-800/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                        {formatVersionDate(v.savedAt)}
                      </div>
                      {v.title && v.title !== (noteTitle || "Untitled") && (
                        <div className="text-sm text-stone-700 dark:text-stone-300 mt-0.5 truncate" title={v.title}>
                          {v.title}
                        </div>
                      )}
                      {v.bodyPreview && (
                        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400 line-clamp-2 break-words">
                          {v.bodyPreview}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestore(v.savedAt)}
                      disabled={restoring !== null}
                      className="shrink-0 px-3 py-1.5 text-sm font-medium rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {restoring === v.savedAt ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
