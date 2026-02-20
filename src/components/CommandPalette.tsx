import { useCallback, useEffect, useMemo, useState } from "react";
import { listTemplates } from "../api";
import type { NoteMeta, NoteTemplate } from "../types";

function fuzzyMatch(query: string, str: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  let i = 0;
  const s = str.toLowerCase();
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (s[j] === q[i]) i++;
  }
  return i === q.length;
}

type Action =
  | { type: "create-note" }
  | { type: "create-from-template"; templateId: string }
  | { type: "manage-templates" }
  | { type: "jump"; note: NoteMeta }
  | { type: "focus-mode" }
  | { type: "toggle-theme" }
  | { type: "pin" }
  | { type: "search" }
  | { type: "toggle-star" };

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  notes: NoteMeta[];
  onSelectNote: (id: string | null) => void;
  onNewNote: () => void;
  onNewNoteFromTemplate?: (templateId: string) => Promise<void>;
  onManageTemplates?: () => void;
  onFocusMode: () => void;
  onToggleStar?: () => void;
  onAction: (action: Action) => void;
}

export function CommandPalette({
  open,
  onClose,
  notes,
  onSelectNote,
  onNewNote,
  onNewNoteFromTemplate,
  onManageTemplates,
  onFocusMode,
  onToggleStar,
  onAction,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);

  useEffect(() => {
    if (open) {
      listTemplates().then(setTemplates).catch(() => setTemplates([]));
    }
  }, [open]);

  const items = useMemo(() => {
    const actions: { label: string; action: Action }[] = [
      { label: "Create note", action: { type: "create-note" } },
      ...templates.map((t) => ({
        label: `New from template: ${t.name}`,
        action: { type: "create-from-template" as const, templateId: t.id },
      })),
      ...(onManageTemplates ? [{ label: "Manage templates", action: { type: "manage-templates" as const } }] : []),
      { label: "Toggle focus mode", action: { type: "focus-mode" } },
      { label: "Toggle star (⌘⇧S)", action: { type: "toggle-star" } },
      { label: "Search in notes", action: { type: "search" } },
    ];
    const filteredNotes = query.trim()
      ? notes.filter((n) => fuzzyMatch(query, n.title || "Untitled"))
      : notes.slice(0, 20);
    const noteItems = filteredNotes.map((note) => ({
      label: note.title || "Untitled",
      action: { type: "jump" as const, note },
    }));
    const q = query.toLowerCase().trim();
    const filteredActions = q
      ? actions.filter((a) => fuzzyMatch(q, a.label))
      : actions;
    return [...filteredActions, ...noteItems];
  }, [query, notes, templates, onManageTemplates]);

  const clampedIndex = Math.min(Math.max(0, selectedIndex), Math.max(0, items.length - 1));

  const run = useCallback(
    (item: (typeof items)[0]) => {
      const a = item.action;
      if (a.type === "create-note") {
        onNewNote();
        onClose();
      } else if (a.type === "create-from-template") {
        onNewNoteFromTemplate?.(a.templateId)?.then(() => onClose());
        if (!onNewNoteFromTemplate) onClose();
      } else if (a.type === "manage-templates") {
        onManageTemplates?.();
        onClose();
      } else if (a.type === "jump") {
        onSelectNote(a.note.id);
        onClose();
      } else if (a.type === "focus-mode") {
        onFocusMode();
        onClose();
      } else if (a.type === "toggle-star") {
        onToggleStar?.();
        onClose();
      } else {
        onAction(a);
        onClose();
      }
    },
    [onNewNote, onNewNoteFromTemplate, onManageTemplates, onSelectNote, onClose, onFocusMode, onToggleStar, onAction]
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = items[clampedIndex];
        if (item) run(item);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, items, clampedIndex, run, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/30 transition-opacity duration-150"
      onClick={onClose}
      role="dialog"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-stone-900 rounded-lg shadow-xl border border-stone-200 dark:border-stone-700 overflow-hidden animate-[fadeScale_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-200 dark:border-stone-700">
          <span className="text-stone-400" aria-hidden>⌘K</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or run a command…"
            className="flex-1 min-w-0 px-2 py-2 bg-transparent border-0 focus:outline-none focus:ring-0 text-stone-900 dark:text-stone-100 placeholder-stone-400"
            autoFocus
            autoComplete="off"
          />
        </div>
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <li className="px-4 py-3 text-sm text-stone-500">No results</li>
          ) : (
            items.map((item, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => run(item)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors duration-120 ${
                    i === clampedIndex
                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100"
                      : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
