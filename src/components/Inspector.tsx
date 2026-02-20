import { useState } from "react";
import type { NoteMeta } from "../types";
import { useApp } from "../AppContext";
import { VersionHistoryModal } from "./VersionHistoryModal";

interface InspectorProps {
  note: NoteMeta | null;
  body: string;
  backlinks: NoteMeta[];
  onOpenNote: (id: string) => void;
  onRestoreVersion?: () => void;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function readingTimeMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / 200));
}

export function Inspector({ note, body, backlinks, onOpenNote, onRestoreVersion }: InspectorProps) {
  const { tagFilter, setTagFilter } = useApp();
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  if (!note) {
    return (
      <aside className="w-56 shrink-0 border-l border-stone-200 bg-stone-50/50 flex flex-col items-center justify-center text-stone-500 text-sm p-4">
        Select a note to see details.
      </aside>
    );
  }

  const words = wordCount(body);
  const readMin = readingTimeMinutes(words);
  const dateStr = note.updatedAt ? new Date(note.updatedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }) : "—";

  return (
    <aside className="w-56 shrink-0 border-l border-stone-200 bg-stone-50/50 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-stone-200">
        <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Details</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-sm">
        <div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Word count</div>
          <div className="text-stone-800 dark:text-stone-200">{words}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Reading time</div>
          <div className="text-stone-800 dark:text-stone-200">~{readMin} min</div>
        </div>
        <div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Last edited</div>
          <div className="text-stone-800 dark:text-stone-200">{dateStr}</div>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setVersionHistoryOpen(true)}
            className="text-sm text-amber-700 dark:text-amber-400 hover:underline"
          >
            Version history · Restore previous versions
          </button>
        </div>
        {versionHistoryOpen && note && (
          <VersionHistoryModal
            noteId={note.id}
            noteTitle={note.title || "Untitled"}
            onClose={() => setVersionHistoryOpen(false)}
            onRestored={() => {
              onRestoreVersion?.();
              setVersionHistoryOpen(false);
            }}
          />
        )}
        {note.tags && note.tags.length > 0 && (
          <div>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Tags</div>
            <div className="flex flex-wrap gap-1">
              {note.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  className={`inline-flex px-2 py-0.5 rounded text-xs transition-colors ${
                    tagFilter === t
                      ? "bg-amber-200 text-amber-900 dark:bg-amber-600 dark:text-amber-100"
                      : "bg-stone-200 dark:bg-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-500"
                  }`}
                >
                  #{t}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Backlinks</div>
          {backlinks.length > 0 ? (
            <ul className="space-y-1">
              {backlinks.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onOpenNote(n.id)}
                    className="text-amber-700 dark:text-amber-400 hover:underline truncate block w-full text-left"
                  >
                    {n.title || "Untitled"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-stone-500 dark:text-stone-400 text-xs">Notes linking here with [[This Note]] will appear here.</p>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Attachments</div>
          <div className="text-stone-800 dark:text-stone-200">
            {note.images?.length ?? 0}
          </div>
        </div>
      </div>
    </aside>
  );
}
