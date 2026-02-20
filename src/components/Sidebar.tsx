import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  batchDeleteNotes,
  batchToggleImportant,
  addTagToNotes,
  duplicateNote,
  mergeNotes,
  updateNoteTitle,
  getOrCreateDailyNote,
  listTags,
  listTemplates,
  createNotebook,
  moveNoteToNotebook,
  archiveNotebook,
  updateNotebookName,
} from "../api";
import type { NoteMeta, Notebook, NoteTemplate } from "../types";
import { useApp } from "../AppContext";
import type { Density, TasksCompletedFilter } from "../store";
import { SyncBackup } from "./SyncBackup";

function ViewMenu() {
  const { density, setDensity } = useApp();
  const [open, setOpen] = useState(false);
  const options: { value: Density; label: string }[] = [
    { value: "compact", label: "Compact" },
    { value: "comfortable", label: "Comfortable" },
    { value: "spacious", label: "Spacious" },
  ];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded text-stone-500 hover:bg-stone-100 hover:text-stone-700 text-sm"
        title="View density"
      >
        View
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full mt-1 z-40 py-1 min-w-[120px] bg-white border border-stone-200 rounded-lg shadow-lg">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setDensity(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm ${
                  density === opt.value ? "bg-amber-50 text-amber-900" : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type SearchDateFilter = "" | "today" | "week" | "month";

interface SidebarProps {
  notes: NoteMeta[];
  notebooks: Notebook[];
  selectedId: string | null;
  selectedIds: Set<string>;
  onSelect: (id: string | null) => void;
  onSelectMulti: (id: string, shift: boolean, meta: boolean) => void;
  onNewNote: () => void;
  onNewNoteFromTemplate?: (templateId: string) => Promise<void>;
  onManageTemplates?: () => void;
  searchContent: string;
  onSearchContentChange: (q: string) => void;
  searchTag: string | null;
  onSearchTagChange: (tag: string | null) => void;
  searchDate: SearchDateFilter;
  onSearchDateChange: (d: SearchDateFilter) => void;
  searchAttachments: boolean;
  onSearchAttachmentsChange: (v: boolean) => void;
  tagFilter: string | null;
  onTagFilter: (tag: string | null) => void;
  taskNotes: NoteMeta[];
  tasksCompletedFilter: TasksCompletedFilter;
  onTasksCompletedFilterChange: (f: TasksCompletedFilter) => void;
  onRefresh: () => void;
  /** Current note for Sync & Backup export options */
  currentNoteId?: string | null;
  currentNoteTitle?: string;
  currentNoteBody?: string;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const q = query.trim().toLowerCase();
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-amber-200 dark:bg-amber-800 rounded px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

const UNFILED_ID = "__unfiled__";

export function Sidebar({
  notes,
  notebooks,
  selectedId,
  selectedIds,
  onSelect,
  onSelectMulti,
  onNewNote,
  onNewNoteFromTemplate,
  onManageTemplates,
  searchContent,
  onSearchContentChange,
  searchTag,
  onSearchTagChange,
  searchDate,
  onSearchDateChange,
  searchAttachments,
  onSearchAttachmentsChange,
  tagFilter,
  onTagFilter,
  taskNotes,
  tasksCompletedFilter,
  onTasksCompletedFilterChange,
  onRefresh,
  currentNoteId,
  currentNoteTitle,
  currentNoteBody,
}: SidebarProps) {
  const { sidebarSections, setSidebarSection, density } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteIds: string[] } | null>(null);
  const [notebookContextMenu, setNotebookContextMenu] = useState<{ x: number; y: number; notebook: Notebook } | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(() => new Set());
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const [newDropdownRect, setNewDropdownRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (newDropdownOpen) {
      listTemplates().then(setTemplates).catch(() => setTemplates([]));
      setNewDropdownRect(newButtonRef.current?.getBoundingClientRect() ?? null);
    } else {
      setNewDropdownRect(null);
    }
  }, [newDropdownOpen]);


  const handleCreateFromTemplate = useCallback(
    async (templateId: string) => {
      if (!onNewNoteFromTemplate) return;
      try {
        await onNewNoteFromTemplate(templateId);
        onRefresh();
        setNewDropdownOpen(false);
      } catch {
        // error handled by parent
      }
    },
    [onNewNoteFromTemplate, onRefresh]
  );

  React.useEffect(() => {
    listTags().then(setTags).catch(() => []);
  }, [notes]);

  const starredNotes = useMemo(() => notes.filter((n) => n.important), [notes]);
  const unfiledNotes = useMemo(
    () => notes.filter((n) => !n.notebookId || n.notebookId === ""),
    [notes]
  );
  const activeNotebooks = useMemo(() => notebooks.filter((nb) => !nb.archived), [notebooks]);
  const archivedNotebooks = useMemo(() => notebooks.filter((nb) => nb.archived), [notebooks]);
  const notesByNotebook = useMemo(() => {
    const map = new Map<string, NoteMeta[]>();
    for (const n of notes) {
      const key = n.notebookId ?? UNFILED_ID;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    }
    return map;
  }, [notes]);

  const toggleNotebookExpanded = useCallback((id: string) => {
    setExpandedNotebooks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleNoteDragStart = useCallback((e: React.DragEvent, noteId: string) => {
    e.dataTransfer.setData("application/x-localnotes-note-id", noteId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDropTargetDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(targetId);
  }, []);

  const handleDropTargetDragLeave = useCallback(() => setDragOverId(null), []);

  const handleDropTargetDrop = useCallback(
    async (e: React.DragEvent, targetNotebookId: string | null) => {
      e.preventDefault();
      setDragOverId(null);
      const noteId = e.dataTransfer.getData("application/x-localnotes-note-id");
      if (!noteId) return;
      const target = targetNotebookId === UNFILED_ID ? null : targetNotebookId;
      try {
        await moveNoteToNotebook(noteId, target);
        onRefresh();
      } catch {}
    },
    [onRefresh]
  );

  const recentlyEdited = useMemo(
    () =>
      [...notes]
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
        .slice(0, 15)
        .sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0)),
    [notes]
  );

  const rowClass = density === "compact" ? "px-2 py-1.5 text-xs" : density === "spacious" ? "px-3 py-3 text-base" : "px-3 py-2 text-sm";

  const handleDoubleClick = useCallback((e: React.MouseEvent, note: NoteMeta) => {
    e.stopPropagation();
    setEditingId(note.id);
    setEditTitle(note.title || "Untitled");
  }, []);

  const handleTitleSubmit = useCallback(
    async (id: string) => {
      const t = editTitle.trim() || "Untitled";
      setEditingId(null);
      try {
        await updateNoteTitle(id, t);
        onRefresh();
      } catch {}
    },
    [editTitle, onRefresh]
  );

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTitleSubmit(id);
      }
      if (e.key === "Escape") {
        setEditingId(null);
        setEditTitle("");
      }
    },
    [handleTitleSubmit]
  );

  const handleOpenDaily = useCallback(async () => {
    try {
      const meta = await getOrCreateDailyNote();
      onSelect(meta.id);
      onRefresh();
    } catch {}
  }, [onSelect, onRefresh]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, noteId: string) => {
      e.preventDefault();
      const ids = selectedIds.has(noteId) ? [...selectedIds] : [noteId];
      setContextMenu({ x: e.clientX, y: e.clientY, noteIds: ids });
    },
    [selectedIds]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const runBatch = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        onRefresh();
        closeContextMenu();
      } catch {}
    },
    [onRefresh, closeContextMenu]
  );

  const section = (
    label: string,
    open: boolean,
    onToggle: () => void,
    content: React.ReactNode
  ) => (
    <section className="border-b border-stone-100 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-stone-500 uppercase tracking-wider hover:bg-stone-50 transition-colors duration-[120ms] ease-in-out"
      >
        {label}
        <span className="transition-transform duration-[120ms] ease-in-out" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
          ▾
        </span>
      </button>
      {open && (
        <div className="overflow-hidden" style={{ animation: "slideDown 0.12s ease-out" }}>
          {content}
        </div>
      )}
    </section>
  );

  const noteButton = (n: NoteMeta) => {
    const isSelected = selectedId === n.id || selectedIds.has(n.id);
    const isEditing = editingId === n.id;
    return (
      <li key={n.id}>
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => handleTitleSubmit(n.id)}
            onKeyDown={(e) => handleTitleKeyDown(e, n.id)}
            className={`w-full ${rowClass} border border-amber-500 rounded focus:outline-none focus:ring-1 focus:ring-amber-500`}
            autoFocus
          />
        ) : (
          <div
            draggable
            onDragStart={(e) => handleNoteDragStart(e, n.id)}
            className={`rounded flex items-center gap-1 transition-colors duration-120 ${
              isSelected ? "bg-amber-100 text-amber-900" : "hover:bg-stone-100 text-stone-700"
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                runBatch(() => batchToggleImportant([n.id], !n.important));
              }}
              title={n.important ? "Unstar" : "Star (⌘⇧S)"}
              className={`shrink-0 w-6 h-6 flex items-center justify-center rounded opacity-70 hover:opacity-100 transition-opacity ${
                n.important ? "text-amber-500" : "text-stone-400 hover:text-amber-500"
              }`}
              aria-label={n.important ? "Unstar" : "Star"}
            >
              {n.important ? "★" : "☆"}
            </button>
            <button
              type="button"
              onClick={(e) => onSelectMulti(n.id, e.shiftKey, e.metaKey || e.ctrlKey)}
              onDoubleClick={(e) => handleDoubleClick(e, n)}
              onContextMenu={(e) => handleContextMenu(e, n.id)}
              className={`flex-1 min-w-0 text-left truncate ${rowClass}`}
            >
              <span className="min-w-0 truncate block">{highlightMatch(n.title || "Untitled", searchContent ?? "")}</span>
            </button>
          </div>
        )}
      </li>
    );
  };

  const dropTargetClass = (targetId: string) =>
    `rounded px-1 min-h-[24px] flex items-center ${dragOverId === targetId ? "bg-amber-100 ring-1 ring-amber-300" : ""}`;

  const renderNotebookOrUnfiled = (id: string, label: string, noteList: NoteMeta[]) => {
    const isUnfiled = id === UNFILED_ID;
    const isExpanded = isUnfiled || expandedNotebooks.has(id);
    const notebook = !isUnfiled ? notebooks.find((nb) => nb.id === id) : null;
    const toggle = () => !isUnfiled && toggleNotebookExpanded(id);
    return (
      <div key={id} className="space-y-0.5">
        <div
          className={`group ${dropTargetClass(id)}`}
          onDragOver={(e) => handleDropTargetDragOver(e, id)}
          onDragLeave={handleDropTargetDragLeave}
          onDrop={(e) => handleDropTargetDrop(e, isUnfiled ? null : id)}
        >
          {!isUnfiled && (
            <button
              type="button"
              onClick={toggle}
              className="shrink-0 p-0.5 text-stone-400 hover:text-stone-600"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              <span style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", display: "inline-block" }}>▾</span>
            </button>
          )}
          <span
            className={`flex-1 truncate text-xs font-medium text-stone-500 uppercase tracking-wider ${!isUnfiled ? "cursor-pointer" : ""}`}
            onClick={!isUnfiled ? toggle : undefined}
          >
            {label}
          </span>
          {notebook && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setNotebookContextMenu({ x: e.clientX, y: e.clientY, notebook });
              }}
              className="shrink-0 p-0.5 text-stone-400 hover:text-stone-600 rounded hover:bg-stone-100"
              aria-label="Notebook options"
            >
              ⋮
            </button>
          )}
        </div>
        {(isUnfiled || isExpanded) && (
          <ul className="space-y-0.5 pl-2 pb-1">
            {noteList.map((n) => noteButton(n))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <aside className="flex flex-col h-full min-w-0">
      <div className="p-2 border-b border-stone-200 flex items-center justify-between gap-2 shrink-0">
        <h1 className="font-semibold text-stone-800 text-lg tracking-tight truncate">Local Notes</h1>
        <div className="flex items-center gap-1 shrink-0">
          <ViewMenu />
          <button
            type="button"
            onClick={handleOpenDaily}
            title="Daily note (⌘⇧D)"
            className="p-1.5 rounded text-stone-500 hover:bg-stone-100 hover:text-stone-700"
          >
            📅
          </button>
          <div className="relative">
            <button
              ref={newButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setNewDropdownOpen((o) => !o);
              }}
              className="p-2 rounded bg-stone-800 text-white text-sm font-medium hover:bg-stone-900"
            >
              New ▾
            </button>
            {newDropdownOpen &&
              newDropdownRect &&
              createPortal(
                <>
                  <div
                    className="fixed inset-0 bg-transparent"
                    style={{ zIndex: 9998 }}
                    onClick={() => setNewDropdownOpen(false)}
                    aria-hidden
                  />
                  <div
                    role="menu"
                    className="fixed py-1 min-w-[200px] bg-white border border-stone-200 rounded-lg shadow-lg cursor-default"
                    style={{
                      zIndex: 9999,
                      top: newDropdownRect.bottom + 4,
                      right: typeof window !== "undefined" ? window.innerWidth - newDropdownRect.right : 0,
                      pointerEvents: "auto",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewNote();
                        setNewDropdownOpen(false);
                      }}
                    >
                      Blank note
                    </button>
                    <div className="border-t border-stone-100 my-1" />
                    {templates.filter((t) => !t.isCustom).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="menuitem"
                        className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateFromTemplate(t.id);
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                    {templates.filter((t) => t.isCustom).length > 0 && (
                      <>
                        <div className="border-t border-stone-100 my-1" />
                        {templates.filter((t) => t.isCustom).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            role="menuitem"
                            className="w-full text-left px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateFromTemplate(t.id);
                            }}
                          >
                            {t.name}
                          </button>
                        ))}
                      </>
                    )}
                    <div className="border-t border-stone-100 my-1" />
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full text-left px-3 py-2 text-sm text-stone-500 hover:bg-stone-100 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onManageTemplates?.();
                        setNewDropdownOpen(false);
                      }}
                    >
                      Manage templates…
                    </button>
                  </div>
                </>,
                document.body
              )}
          </div>
        </div>
      </div>

      <div className="px-2 pb-2 border-b border-stone-100 space-y-2">
        <input
          type="search"
          placeholder="Search in content…"
          value={searchContent}
          onChange={(e) => onSearchContentChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500"
        />
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-stone-400 mr-0.5">Filters:</span>
          <select
            value={searchTag ?? ""}
            onChange={(e) => onSearchTagChange(e.target.value ? e.target.value : null)}
            className="px-2 py-1 border border-stone-200 rounded bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            title="Filter by tag"
          >
            <option value="">Tag</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>#{tag}</option>
            ))}
          </select>
          <select
            value={searchDate}
            onChange={(e) => onSearchDateChange((e.target.value || "") as SearchDateFilter)}
            className="px-2 py-1 border border-stone-200 rounded bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            title="Filter by date"
          >
            <option value="">Date</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
          <label className="flex items-center gap-1 text-stone-600 cursor-pointer">
            <input
              type="checkbox"
              checked={searchAttachments}
              onChange={(e) => onSearchAttachmentsChange(e.target.checked)}
              className="rounded border-stone-300 text-amber-600 focus:ring-amber-500/50"
            />
            <span title="Only notes with attachments">Attachments</span>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {section(
          "Starred",
          sidebarSections.important,
          () => setSidebarSection("important", !sidebarSections.important),
          starredNotes.length === 0 ? (
            <p className="text-stone-400 text-xs px-2 py-1.5">No starred notes</p>
          ) : (
            <ul className="space-y-0.5 px-2 pb-2">
              {starredNotes.map((n) => noteButton(n))}
            </ul>
          )
        )}

        {section(
          "Tasks",
          sidebarSections.tasks,
          () => setSidebarSection("tasks", !sidebarSections.tasks),
          <div className="px-2 pb-2 space-y-1">
            <div className="flex items-center gap-1 py-1">
              <select
                value={tasksCompletedFilter}
                onChange={(e) => onTasksCompletedFilterChange(e.target.value as TasksCompletedFilter)}
                className="text-xs border border-stone-200 rounded px-2 py-1 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              >
                <option value="all">All</option>
                <option value="uncompleted">Uncompleted</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            {taskNotes.length === 0 ? (
              <p className="text-stone-400 text-xs py-1.5">No task notes. Use <code className="bg-stone-100 px-0.5 rounded">- [ ]</code> in a note.</p>
            ) : (
              <ul className="space-y-0.5">
                {taskNotes.map((n) => noteButton(n))}
              </ul>
            )}
          </div>
        )}

        <section className="border-b border-stone-100">
          <div className="px-2 py-1.5 text-xs font-medium text-stone-500 uppercase tracking-wider">Daily</div>
          <ul className="space-y-0.5 px-2 pb-2">
            <li>
              <button
                type="button"
                onClick={handleOpenDaily}
                className={`w-full text-left rounded flex items-center gap-2 ${rowClass} text-stone-700 hover:bg-stone-100 transition-colors duration-120`}
              >
                📅 Today
              </button>
            </li>
          </ul>
        </section>

        {section(
          "Tags",
          sidebarSections.tags,
          () => setSidebarSection("tags", !sidebarSections.tags),
          tags.length === 0 ? (
            <p className="text-stone-400 text-xs px-2 py-1.5">
              No tags yet. Add tags in the note header—they’ll appear here. Click a tag to filter notes.
            </p>
          ) : (
            <ul className="space-y-0.5 px-2 pb-2">
              {tags.map((tag) => (
                <li key={tag}>
                  <button
                    type="button"
                    onClick={() => onTagFilter(tagFilter === tag ? null : tag)}
                    className={`w-full text-left rounded ${rowClass} ${
                      tagFilter === tag ? "bg-amber-100 text-amber-900" : "text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    #{tag}
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        {section(
          "Notebooks",
          sidebarSections.allNotes,
          () => setSidebarSection("allNotes", !sidebarSections.allNotes),
          <div className="px-2 pb-2 space-y-1">
            {renderNotebookOrUnfiled(UNFILED_ID, "Unfiled", unfiledNotes)}
            {activeNotebooks.map((nb) =>
              renderNotebookOrUnfiled(nb.id, nb.name, notesByNotebook.get(nb.id) ?? [])
            )}
            <button
              type="button"
              onClick={async () => {
                const name = window.prompt("Notebook name:");
                if (name != null && name.trim()) {
                  try {
                    await createNotebook(name.trim());
                    onRefresh();
                  } catch {}
                }
              }}
              className={`w-full text-left ${rowClass} text-stone-500 hover:bg-stone-100 rounded`}
            >
              + New notebook
            </button>
            {archivedNotebooks.length > 0 && (
              <>
                <div className="pt-1 mt-1 border-t border-stone-100 text-xs font-medium text-stone-400 uppercase tracking-wider px-1">
                  Archived
                </div>
                {archivedNotebooks.map((nb) =>
                  renderNotebookOrUnfiled(nb.id, nb.name, notesByNotebook.get(nb.id) ?? [])
                )}
              </>
            )}
          </div>
        )}

        {section(
          "Recently Edited",
          sidebarSections.recentlyEdited,
          () => setSidebarSection("recentlyEdited", !sidebarSections.recentlyEdited),
          <ul className="space-y-0.5 px-2 pb-2">
            {recentlyEdited.map((n) => noteButton(n))}
          </ul>
        )}

        <SyncBackup
          onRefresh={onRefresh}
          currentNoteId={currentNoteId}
          currentNoteTitle={currentNoteTitle}
          currentNoteBody={currentNoteBody}
        />
      </div>

      {notebookContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNotebookContextMenu(null)} aria-hidden />
          <div
            className="fixed z-50 py-1 min-w-[160px] bg-white border border-stone-200 rounded-lg shadow-lg"
            style={{ left: notebookContextMenu.x, top: notebookContextMenu.y }}
          >
            <button
              type="button"
              onClick={async () => {
                const newName = window.prompt("Rename notebook:", notebookContextMenu.notebook.name);
                if (newName != null && newName.trim()) {
                  try {
                    await updateNotebookName(notebookContextMenu.notebook.id, newName.trim());
                    onRefresh();
                  } catch {}
                  setNotebookContextMenu(null);
                }
              }}
              className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
            >
              Rename
            </button>
            {notebookContextMenu.notebook.archived ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await archiveNotebook(notebookContextMenu.notebook.id, false);
                    onRefresh();
                  } catch {}
                  setNotebookContextMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
              >
                Unarchive
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await archiveNotebook(notebookContextMenu.notebook.id, true);
                    onRefresh();
                  } catch {}
                  setNotebookContextMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
              >
                Archive notebook
              </button>
            )}
          </div>
        </>
      )}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} aria-hidden />
          <div
            className="fixed z-50 py-1 min-w-[160px] bg-white border border-stone-200 rounded-lg shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={() => runBatch(() => batchToggleImportant(contextMenu.noteIds, true))}
              className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
            >
              Star
            </button>
            <button
              type="button"
              onClick={() => runBatch(() => batchToggleImportant(contextMenu.noteIds, false))}
              className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
            >
              Unstar
            </button>
            <button
              type="button"
              onClick={() => {
                const tag = window.prompt("Tag name (without #):");
                if (tag != null && tag.trim()) runBatch(() => addTagToNotes(contextMenu.noteIds, tag.trim()));
              }}
              className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
            >
              Add tag…
            </button>
            {contextMenu.noteIds.length === 1 && (
              <>
                <div className="border-t border-stone-100 my-1" />
                <div className="px-2 py-1 text-xs font-medium text-stone-400 uppercase">Move to notebook</div>
                <button
                  type="button"
                  onClick={() => runBatch(() => moveNoteToNotebook(contextMenu.noteIds[0], null))}
                  className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
                >
                  Unfiled
                </button>
                {activeNotebooks.map((nb) => (
                  <button
                    key={nb.id}
                    type="button"
                    onClick={() => runBatch(() => moveNoteToNotebook(contextMenu.noteIds[0], nb.id))}
                    className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
                  >
                    {nb.name}
                  </button>
                ))}
                <div className="border-t border-stone-100 my-1" />
              </>
            )}
            {contextMenu.noteIds.length === 1 && (
              <button
                type="button"
                onClick={() => runBatch(() => duplicateNote(contextMenu.noteIds[0]).then((m) => onSelect(m.id)))}
                className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
              >
                Duplicate
              </button>
            )}
            {contextMenu.noteIds.length > 1 && (
              <button
                type="button"
                onClick={() => runBatch(() => mergeNotes(contextMenu.noteIds))}
                className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
              >
                Merge
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                runBatch(async () => {
                  await batchDeleteNotes(contextMenu.noteIds);
                  if (contextMenu.noteIds.includes(selectedId || "")) onSelect(null);
                })
              }
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
