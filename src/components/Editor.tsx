import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  readNote,
  saveNote,
  toggleImportant,
  attachImages,
  deleteNote,
  resolveImagePath,
  removeAttachment,
  renameAttachment,
  listTags,
  addTagToNotes,
  removeTagFromNote,
} from "../api";
import type { NoteContent, ImageRef } from "../types";
import { useApp } from "../AppContext";
import { useAIAssistantEvents } from "./AIAssistantPanel";

type ViewMode = "write" | "preview";

function applyToSelection(
  text: string,
  start: number,
  end: number,
  wrap: { before: string; after: string }
): { newText: string; newStart: number; newEnd: number } {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const newText = before + wrap.before + selected + wrap.after + after;
  const newStart = start + wrap.before.length;
  const newEnd = newStart + selected.length;
  return { newText, newStart, newEnd };
}

function insertLinePrefix(text: string, cursor: number, prefix: string): { newText: string; newCursor: number } {
  const lineStart = text.slice(0, cursor).lastIndexOf("\n") + 1;
  const newText = text.slice(0, lineStart) + prefix + text.slice(lineStart);
  return { newText, newCursor: cursor + prefix.length };
}

/** Toggle a single task line in body: find line with [ ] or [x] and same label, flip it. */
function toggleTaskLine(body: string, label: string): string {
  const lines = body.split("\n");
  const trimmedLabel = label.trim();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const unchecked = /^(\s*)([-*])\s+\[ \]\s+(.*)$/.exec(line);
    const checked = /^(\s*)([-*])\s+\[[xX]\]\s+(.*)$/.exec(line);
    const rest = unchecked?.[3] ?? checked?.[3];
    if (rest !== undefined && rest.trim() === trimmedLabel) {
      const prefix = (unchecked ?? checked)![1];
      const marker = (unchecked ?? checked)![2];
      if (unchecked) {
        lines[i] = `${prefix}${marker} [x] ${rest}`;
      } else {
        lines[i] = `${prefix}${marker} [ ] ${rest}`;
      }
      return lines.join("\n");
    }
  }
  return body;
}

function TaskCheckbox(
  props: React.InputHTMLAttributes<HTMLInputElement> & { body: string; onToggle: (newBody: string) => void; node?: unknown }
) {
  const { body, onToggle, node: _node, ...inputProps } = props;
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const li = (e.target as HTMLInputElement).closest("li");
      const label = li?.textContent?.replace(/^\s*/, "").trim() ?? "";
      const newBody = toggleTaskLine(body, label);
      if (newBody !== body) onToggle(newBody);
    },
    [body, onToggle]
  );
  return <input {...inputProps} type="checkbox" onChange={handleChange} />;
}

interface EditorProps {
  noteId: string | null;
  isNewNote: boolean;
  onSaved: () => void;
  onSelectNote: (id: string | null | "") => void;
  onDeleted: () => void;
  onBodyChange?: (body: string) => void;
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  onToggleInspector?: () => void;
  inspectorOpen?: boolean;
  onToggleAIPanel?: () => void;
  aiPanelOpen?: boolean;
  /** Increment to force reload current note (e.g. after restoring a version). */
  refreshTrigger?: number;
  /** When set, highlight this search phrase in the body (read-only overlay). */
  searchHighlight?: string;
}

const SAVE_DEBOUNCE_MS = 300;
const SAVED_INDICATOR_MS = 1200;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isImagePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext);
}

function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

function ImageThumbnail({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    resolveImagePath(path)
      .then((p) => {
        if (!cancelled) setSrc(convertFileSrc(p));
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  const showPlaceholder = !src || loadFailed;
  if (showPlaceholder) {
    return (
      <span className="flex w-full h-full items-center justify-center bg-stone-200 dark:bg-stone-600 text-stone-500 dark:text-stone-400" title="Image">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-full h-full object-cover"
      onError={() => setLoadFailed(true)}
    />
  );
}

/** Split body by search phrase (case-insensitive) and wrap matches in <mark>. */
function highlightBodyWithSearch(body: string, searchPhrase: string): React.ReactNode {
  const q = searchPhrase.trim();
  if (!q) return body;
  const lower = body.toLowerCase();
  const qLower = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let pos = 0;
  while (pos < body.length) {
    const i = lower.indexOf(qLower, pos);
    if (i === -1) {
      parts.push(body.slice(pos));
      break;
    }
    parts.push(body.slice(pos, i));
    parts.push(<mark key={i} className="bg-amber-200 dark:bg-amber-800 rounded px-0.5">{body.slice(i, i + q.length)}</mark>);
    pos = i + q.length;
  }
  return <>{parts}</>;
}

export function Editor({
  noteId,
  isNewNote,
  onSaved,
  onSelectNote,
  onDeleted,
  onBodyChange,
  focusMode = false,
  onToggleFocusMode,
  onToggleInspector,
  inspectorOpen = true,
  onToggleAIPanel,
  aiPanelOpen = false,
  refreshTrigger,
  searchHighlight,
}: EditorProps) {
  const [content, setContent] = useState<NoteContent | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [savedVisible, setSavedVisible] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("write");
  const [tagInputValue, setTagInputValue] = useState("");
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [attachmentSearch, setAttachmentSearch] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<{ path: string; type: "image" | "pdf" } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(0);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout>>(0);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const { density } = useApp();

  useAIAssistantEvents(setTitle, setBody, bodyRef);

  useEffect(() => {
    listTags().then(setAllTags).catch(() => []);
  }, [content?.meta.tags]); // refresh when note's tags change (e.g. after add/remove)

  const loadNote = useCallback(async (id: string) => {
    setError(null);
    try {
      const data = await readNote(id);
      setContent(data);
      setTitle(data.meta.title);
      setBody(data.body);
      onBodyChange?.(data.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setContent(null);
      setTitle("");
      setBody("");
      onBodyChange?.("");
    }
  }, [onBodyChange]);

  useEffect(() => {
    if (noteId) {
      loadNote(noteId);
    } else {
      setContent(null);
      setTitle("");
      setBody("");
      setError(null);
      onBodyChange?.("");
    }
  }, [noteId, loadNote, onBodyChange, refreshTrigger]);

  useEffect(() => {
    onBodyChange?.(body);
  }, [body, onBodyChange]);

  const performSave = useCallback(async () => {
    if (!title.trim() && !body.trim()) return;
    setError(null);
    try {
      const meta = await saveNote(noteId, title.trim() || "Untitled", body);
      onSaved();
      if (!noteId) {
        onSelectNote(meta.id);
        loadNote(meta.id);
      }
      setSavedVisible(true);
      clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setSavedVisible(false), SAVED_INDICATOR_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [noteId, title, body, onSaved, onSelectNote, loadNote]);

  useEffect(() => {
    clearTimeout(saveTimeoutRef.current);
    if (!noteId && !title.trim() && !body.trim()) return;
    saveTimeoutRef.current = setTimeout(performSave, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimeoutRef.current);
  }, [noteId, title, body, performSave]);

  const handleSaveShortcut = useCallback(() => {
    performSave();
    setPulse(true);
    setTimeout(() => setPulse(false), 200);
  }, [performSave]);

  const handleToggleImportant = async () => {
    if (!noteId || !content) return;
    try {
      await toggleImportant(noteId, !content.meta.important);
      onSaved();
      setContent((c) =>
        c ? { ...c, meta: { ...c.meta, important: !c.meta.important } } : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAttachImages = async (paths?: string[]) => {
    if (!noteId) return;
    const toAdd =
      paths ??
      (await open({
        multiple: true,
        directory: false,
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] },
          { name: "PDFs", extensions: ["pdf"] },
          { name: "All files", extensions: ["*"] },
        ],
      }));
    if (toAdd) {
      const pathList = Array.isArray(toAdd) ? toAdd : [toAdd];
      try {
        const meta = await attachImages(noteId, pathList);
        setContent((c) => (c ? { ...c, meta } : null));
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (!noteId) return;
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) {
        const paths = files
          .map((f) => (f as unknown as { path?: string }).path)
          .filter(Boolean) as string[];
        if (paths.length) handleAttachImages(paths);
      }
    },
    [noteId]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleOpenImage = async (relativePath: string) => {
    try {
      const fullPath = await resolveImagePath(relativePath);
      await openPath(fullPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePreviewAttachment = useCallback(
    async (img: ImageRef) => {
      if (isImagePath(img.path)) {
        try {
          const fullPath = await resolveImagePath(img.path);
          setPreviewAttachment({ path: img.path, type: "image" });
          setPreviewUrl(convertFileSrc(fullPath));
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } else if (isPdfPath(img.path)) {
        try {
          const fullPath = await resolveImagePath(img.path);
          setPreviewAttachment({ path: img.path, type: "pdf" });
          setPreviewUrl(convertFileSrc(fullPath));
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } else {
        handleOpenImage(img.path);
      }
    },
    []
  );

  useEffect(() => {
    if (!previewAttachment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewAttachment(null);
        setPreviewUrl(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewAttachment]);

  const handleRenameAttachment = useCallback(
    async (relativePath: string, newName: string) => {
      if (!noteId || !newName.trim()) return;
      try {
        const meta = await renameAttachment(noteId, relativePath, newName.trim());
        setContent((c) => (c ? { ...c, meta } : null));
        onSaved();
        setRenamingPath(null);
        setRenamingName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [noteId, onSaved]
  );

  const normalizeTag = (raw: string) =>
    raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "");

  const handleAddTag = useCallback(
    async (tag: string) => {
      const t = normalizeTag(tag);
      if (!noteId || !t || content?.meta.tags?.includes(t)) return;
      try {
        const updated = await addTagToNotes([noteId], t);
        setContent((c) => (c && updated[0] ? { ...c, meta: updated[0] } : c));
        onSaved();
        setTagInputValue("");
        setTagSuggestionsOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [noteId, content?.meta.tags, onSaved]
  );

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!noteId) return;
      try {
        const updated = await removeTagFromNote(noteId, tag);
        setContent((c) => (c ? { ...c, meta: updated } : null));
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [noteId, onSaved]
  );

  const tagSuggestions = useMemo(() => {
    const current = content?.meta.tags ?? [];
    const value = tagInputValue.trim().toLowerCase();
    const fromList = allTags.filter(
      (t) => !current.includes(t) && (value === "" || t.toLowerCase().includes(value))
    );
    const createCandidate = value && !fromList.includes(value) ? normalizeTag(value) : null;
    if (createCandidate && !current.includes(createCandidate)) {
      return { list: fromList, create: createCandidate };
    }
    return { list: fromList, create: null };
  }, [allTags, content?.meta.tags, tagInputValue]);

  const handleRemoveAttachment = async (relativePath: string) => {
    if (!noteId) return;
    try {
      const meta = await removeAttachment(noteId, relativePath);
      setContent((c) => (c ? { ...c, meta } : null));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async () => {
    if (!noteId) return;
    const ok = window.confirm("Delete this note? This cannot be undone.");
    if (!ok) return;
    try {
      await deleteNote(noteId);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const applyFormat = useCallback((wrap: { before: string; after: string }) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const { newText, newStart, newEnd } = applyToSelection(body, start, end, wrap);
    setBody(newText);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newStart, newEnd);
    });
  }, [body]);

  const applyLineFormat = useCallback((prefix: string) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const { newText, newCursor } = insertLinePrefix(body, cursor, prefix);
    setBody(newText);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }, [body]);

  const applyBlock = useCallback((before: string, after: string, placeholder = "text") => {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    const newText = body.slice(0, start) + before + selected + after + body.slice(end);
    const newCursor = start + before.length + selected.length;
    setBody(newText);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }, [body]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "n") {
          e.preventDefault();
          onSelectNote("");
          setTitle("");
          setBody("");
          setContent(null);
        }
        if (e.key === "s") {
          e.preventDefault();
          handleSaveShortcut();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [noteId, onSelectNote, handleSaveShortcut]);

  const paddingClass = density === "compact" ? "p-2" : density === "spacious" ? "p-6" : "p-4";
  const inputPadding = density === "compact" ? "px-2 py-1.5 text-base" : density === "spacious" ? "px-4 py-3 text-lg" : "px-3 py-2 text-lg";

  if (!noteId && !isNewNote) {
    return (
      <div className="flex-1 flex items-center justify-center text-stone-500 p-8">
        <div className="text-center">
          <p className="text-lg">Select a note from the sidebar or create a new one.</p>
          <p className="text-sm mt-2">⌘N new note · ⌘S save · ⌘K command palette · ⌘⇧F focus mode</p>
        </div>
      </div>
    );
  }

  const isCreating = isNewNote && !noteId;

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${paddingClass} ${pulse ? "animate-[pulse_0.2s_ease-out]" : ""}`}>
      {error && (
        <div className="mb-2 px-3 py-2 bg-red-100 text-red-800 text-sm rounded">{error}</div>
      )}
      <div className={`flex items-center gap-2 flex-wrap border-b border-stone-200 pb-3 mb-3`}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className={`flex-1 min-w-[200px] border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500 ${inputPadding}`}
        />
        {!isCreating && (
          <button
            type="button"
            onClick={handleToggleImportant}
            title={content?.meta.important ? "Unstar" : "Star"}
            className={`p-1.5 rounded border border-transparent text-stone-500 hover:text-amber-500 hover:bg-stone-100 ${
              content?.meta.important ? "text-amber-500" : ""
            }`}
          >
            ★
          </button>
        )}
        {savedVisible && (
          <span className="text-emerald-600 text-sm flex items-center gap-1 animate-[fadeIn_0.12s_ease-out]">
            <span aria-hidden>✓</span> Saved
          </span>
        )}
        {!focusMode && onToggleFocusMode && (
          <button
            type="button"
            onClick={onToggleFocusMode}
            title="Focus mode (⌘⇧F)"
            className="p-1.5 rounded border border-stone-200 text-stone-500 hover:bg-stone-100 text-sm"
          >
            Focus
          </button>
        )}
        {focusMode && onToggleFocusMode && (
          <button
            type="button"
            onClick={onToggleFocusMode}
            title="Exit focus mode"
            className="p-1.5 rounded border border-stone-200 text-stone-500 hover:bg-stone-100 text-sm"
          >
            Exit focus
          </button>
        )}
        {onToggleInspector && (
          <button
            type="button"
            onClick={onToggleInspector}
            title={inspectorOpen ? "Hide inspector" : "Show inspector"}
            className={`p-1.5 rounded border text-sm ${inspectorOpen ? "border-amber-500 bg-amber-50 text-amber-800" : "border-stone-200 text-stone-500 hover:bg-stone-100"}`}
          >
            Info
          </button>
        )}
        {onToggleAIPanel && (
          <button
            type="button"
            onClick={onToggleAIPanel}
            title={aiPanelOpen ? "Hide AI Assistant" : "Show AI Assistant"}
            className={`p-1.5 rounded border text-sm ${aiPanelOpen ? "border-amber-500 bg-amber-50 text-amber-800" : "border-stone-200 text-stone-500 hover:bg-stone-100"}`}
          >
            AI
          </button>
        )}
        {!isCreating && (
          <>
            <button
              type="button"
              onClick={() => handleAttachImages()}
              className="p-1.5 rounded border border-stone-200 text-stone-600 hover:bg-stone-50 text-sm"
            >
              Attach
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 rounded border border-stone-200 text-stone-600 hover:bg-stone-50 hover:text-red-600 hover:border-red-200 text-sm"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {!isCreating && noteId && (
        <div className="flex flex-wrap items-center gap-1.5 pb-2 mb-2 border-b border-stone-100">
          {(content?.meta.tags ?? []).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-sm"
            >
              #{tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="hover:bg-amber-200/50 rounded p-0.5 leading-none"
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
          <div className="relative inline-flex">
            <input
              ref={tagInputRef}
              type="text"
              value={tagInputValue}
              onChange={(e) => {
                setTagInputValue(e.target.value);
                setTagSuggestionsOpen(true);
              }}
              onFocus={() => setTagSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setTagSuggestionsOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const { list, create } = tagSuggestions;
                  if (create) handleAddTag(create);
                  else if (list[0]) handleAddTag(list[0]);
                }
              }}
              placeholder="Add tag…"
              className="w-28 px-2 py-1 text-sm border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500"
            />
            {tagSuggestionsOpen && (tagSuggestions.list.length > 0 || tagSuggestions.create) && (
              <ul
                className="absolute left-0 top-full mt-0.5 min-w-[160px] max-h-40 overflow-y-auto py-1 bg-white border border-stone-200 rounded shadow-lg z-50 text-left"
                onMouseDown={(e) => e.preventDefault()}
              >
                {tagSuggestions.list.slice(0, 8).map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 text-sm text-stone-700 hover:bg-amber-50"
                      onClick={() => handleAddTag(t)}
                    >
                      #{t}
                    </button>
                  </li>
                ))}
                {tagSuggestions.create && (
                  <li className="border-t border-stone-100">
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 text-sm text-amber-700 hover:bg-amber-50 font-medium"
                      onClick={() => handleAddTag(tagSuggestions.create!)}
                    >
                      + Create #{tagSuggestions.create}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      {content && content.meta.images && content.meta.images.length > 0 && (() => {
        const searchLower = attachmentSearch.trim().toLowerCase();
        const filtered = searchLower
          ? content.meta.images.filter((img) => img.name.toLowerCase().includes(searchLower))
          : content.meta.images;
        return (
          <div className="pb-2 mb-2 border-b border-stone-100 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={attachmentSearch}
                onChange={(e) => setAttachmentSearch(e.target.value)}
                placeholder="Search attachments…"
                className="flex-1 min-w-0 text-sm px-2 py-1.5 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
              <span className="text-xs text-stone-500 shrink-0">
                {filtered.length}{content.meta.images.length !== filtered.length ? ` / ${content.meta.images.length}` : ""}
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto flex-wrap">
              {filtered.map((img) => (
                <div
                  key={img.path}
                  className="shrink-0 relative group flex flex-col items-center gap-0.5"
                >
                  {renamingPath === img.path ? (
                    <div className="w-24 flex flex-col gap-1">
                      <input
                        type="text"
                        value={renamingName}
                        onChange={(e) => setRenamingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameAttachment(img.path, renamingName);
                          if (e.key === "Escape") setRenamingPath(null);
                        }}
                        className="text-xs px-1.5 py-0.5 border rounded w-full"
                        autoFocus
                      />
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleRenameAttachment(img.path, renamingName)}
                          className="text-xs px-1.5 py-0.5 bg-amber-100 border border-amber-300 rounded"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingPath(null)}
                          className="text-xs px-1.5 py-0.5 border rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => (isImagePath(img.path) || isPdfPath(img.path)) ? handlePreviewAttachment(img) : handleOpenImage(img.path)}
                        className="w-20 h-20 rounded border border-stone-200 bg-stone-100 flex items-center justify-center text-stone-400 hover:border-amber-400 overflow-hidden"
                      >
                        {isImagePath(img.path) ? (
                          <ImageThumbnail path={img.path} />
                        ) : isPdfPath(img.path) ? (
                          <span className="text-2xl" title="PDF">📄</span>
                        ) : (
                          <span className="text-xl" title="File">📎</span>
                        )}
                      </button>
                      <span className="text-xs text-stone-500 truncate max-w-[100px]">{img.name}</span>
                      {img.size != null && (
                        <span className="text-xs text-stone-400">{formatBytes(img.size)}</span>
                      )}
                      <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 flex gap-0.5 flex-wrap justify-end max-w-[120px]">
                        {(isImagePath(img.path) || isPdfPath(img.path)) && (
                          <button
                            type="button"
                            onClick={() => handlePreviewAttachment(img)}
                            className="text-xs px-1 py-0.5 bg-white border rounded shadow"
                          >
                            Preview
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenImage(img.path)}
                          className="text-xs px-1 py-0.5 bg-white border rounded shadow"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRenamingPath(img.path); setRenamingName(img.name); }}
                          className="text-xs px-1 py-0.5 bg-white border rounded shadow"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(img.path)}
                          className="text-xs px-1 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded shadow"
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {previewAttachment && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => { setPreviewAttachment(null); setPreviewUrl(null); }}
          role="dialog"
          aria-modal="true"
          aria-label="Attachment preview"
        >
          <div
            className="bg-white dark:bg-stone-900 rounded-lg shadow-xl max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end p-1 border-b border-stone-200">
              <button
                type="button"
                onClick={() => { setPreviewAttachment(null); setPreviewUrl(null); }}
                className="p-2 text-stone-500 hover:text-stone-800"
                aria-label="Close preview"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto min-h-0 p-2">
              {previewAttachment.type === "image" && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-full max-h-[85vh] object-contain"
                />
              )}
              {previewAttachment.type === "pdf" && (
                <iframe
                  title="PDF preview"
                  src={previewUrl}
                  className="w-full h-[85vh] min-h-[500px] border-0 rounded"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 mb-2">
        <button
          type="button"
          onClick={() => setViewMode("write")}
          className={`px-2 py-1 text-sm rounded ${viewMode === "write" ? "bg-stone-200 font-medium" : "text-stone-500 hover:bg-stone-100"}`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setViewMode("preview")}
          className={`px-2 py-1 text-sm rounded ${viewMode === "preview" ? "bg-stone-200 font-medium" : "text-stone-500 hover:bg-stone-100"}`}
        >
          Preview
        </button>
        {viewMode === "write" && (
          <div className="flex items-center gap-0.5 ml-2 pl-2 border-l border-stone-200 flex-wrap">
            <button type="button" onClick={() => applyFormat({ before: "**", after: "**" })} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 font-bold text-sm" title="Bold (⌘B)">B</button>
            <button type="button" onClick={() => applyFormat({ before: "*", after: "*" })} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 italic text-sm" title="Italic">I</button>
            <button type="button" onClick={() => applyFormat({ before: "<u>", after: "</u>" })} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 text-sm underline" title="Underline">U</button>
            <span className="w-px h-4 bg-stone-200 mx-0.5" />
            <button type="button" onClick={() => applyLineFormat("# ")} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 text-sm" title="Heading 1">H1</button>
            <button type="button" onClick={() => applyLineFormat("## ")} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 text-sm" title="Heading 2">H2</button>
            <button type="button" onClick={() => applyLineFormat("### ")} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 text-sm" title="Heading 3">H3</button>
            <span className="w-px h-4 bg-stone-200 mx-0.5" />
            <button type="button" onClick={() => applyLineFormat("- ")} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 text-sm" title="Bullet list">•</button>
            <button type="button" onClick={() => applyLineFormat("- [ ] ")} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 text-sm" title="Task (checkbox)">☐</button>
            <button type="button" onClick={() => applyLineFormat("1. ")} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 text-sm" title="Numbered list">1.</button>
            <button type="button" onClick={() => applyLineFormat("> ")} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 text-sm" title="Block quote">&#8250;</button>
            <button type="button" onClick={() => applyBlock("```\n", "\n```", "code")} className="p-1.5 rounded hover:bg-stone-100 text-stone-600 text-sm font-mono" title="Code block">{"</>"}</button>
          </div>
        )}
      </div>

      <div
        className={`flex-1 flex flex-col min-h-0 rounded border border-stone-200 transition-colors ${
          dragOver ? "border-amber-400 bg-amber-50/50" : ""
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {viewMode === "write" ? (
          <>
            {searchHighlight && body && (
              <div
                className="shrink-0 max-h-[180px] overflow-y-auto w-full p-3 border-b border-stone-100 bg-amber-50/30 rounded-t font-mono text-sm whitespace-pre-wrap"
                aria-hidden
              >
                {highlightBodyWithSearch(body, searchHighlight)}
              </div>
            )}
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your note… Use #tag and [[Note Title]] for links. Use the toolbar for bold, headings, lists, code."
              className="flex-1 min-h-[120px] w-full p-3 border-0 rounded focus:outline-none resize-none font-mono text-sm"
            />
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 min-h-[120px] text-sm [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-4 [&_blockquote]:border-stone-300 [&_blockquote]:pl-3 [&_blockquote]:text-stone-600 [&_pre]:bg-stone-100 [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_code]:bg-stone-100 [&_code]:px-1 [&_code]:rounded [&_p]:mb-2">
            {body.trim() ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  input: (props) =>
                    props.type === "checkbox" ? (
                      <TaskCheckbox
                        {...props}
                        body={body}
                        onToggle={(newBody) => {
                          setBody(newBody);
                          if (noteId) {
                            saveNote(noteId, title.trim() || "Untitled", newBody)
                              .then(() => {
                                setSavedVisible(true);
                                savedTimeoutRef.current = window.setTimeout(() => setSavedVisible(false), SAVED_INDICATOR_MS);
                                onSaved();
                              })
                              .catch(() => {});
                          }
                        }}
                      />
                    ) : (
                      <input {...props} />
                    ),
                }}
              >
                {body}
              </ReactMarkdown>
            ) : (
              <p className="text-stone-400">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
