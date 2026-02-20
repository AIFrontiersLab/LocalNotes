import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initStorage, listNotes, listNotebooks, searchNotes, getBacklinks, getOrCreateDailyNote, batchToggleImportant, createNoteFromTemplate } from "./api";
import type { NoteMeta, Notebook } from "./types";
import { AppProvider, useApp } from "./AppContext";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { CommandPalette } from "./components/CommandPalette";
import { Inspector } from "./components/Inspector";
import { AIAssistantPanel } from "./components/AIAssistantPanel";
import { TemplatesModal } from "./components/TemplatesModal";

export type SearchDateFilter = "" | "today" | "week" | "month";

function AppContent() {
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [searchContent, setSearchContent] = useState("");
  const [searchTag, setSearchTag] = useState<string | null>(null);
  const [searchDate, setSearchDate] = useState<SearchDateFilter>("");
  const [searchAttachments, setSearchAttachments] = useState(false);
  const [searchResults, setSearchResults] = useState<NoteMeta[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | "" | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backlinks, setBacklinks] = useState<NoteMeta[]>([]);
  const [currentBody, setCurrentBody] = useState("");
  const [editorRefreshKey, setEditorRefreshKey] = useState(0);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);

  const {
    sidebarWidth,
    setSidebarWidth,
    focusMode,
    setFocusMode,
    inspectorOpen,
    setInspectorOpen,
    selectedIds,
    setSelectedIds,
    tagFilter,
    setTagFilter,
    tasksCompletedFilter,
    setTasksCompletedFilter,
    commandPaletteOpen,
    setCommandPaletteOpen,
    aiPanelOpen,
    setAiPanelOpen,
  } = useApp();

  const [taskNotes, setTaskNotes] = useState<NoteMeta[]>([]);

  const refreshNotes = useCallback(async () => {
    try {
      const [list, nbList] = await Promise.all([listNotes(), listNotebooks()]);
      setNotes(list);
      setNotebooks(nbList);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshTaskNotes = useCallback(async () => {
    try {
      const q =
        tasksCompletedFilter === "completed"
          ? "has:tasks is:completed"
          : tasksCompletedFilter === "uncompleted"
            ? "has:tasks is:uncompleted"
            : "has:tasks";
      const list = await searchNotes(q);
      setTaskNotes(list);
    } catch {
      setTaskNotes([]);
    }
  }, [tasksCompletedFilter]);

  useEffect(() => {
    refreshTaskNotes();
  }, [refreshTaskNotes]);

  useEffect(() => {
    (async () => {
      try {
        await initStorage();
        await refreshNotes();
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [refreshNotes]);

  const searchQuery = useMemo(() => {
    const parts: string[] = [];
    if (searchContent.trim()) parts.push(searchContent.trim());
    if (searchTag) parts.push(`tag:${searchTag}`);
    if (searchDate) parts.push(`date:${searchDate}`);
    if (searchAttachments) parts.push("has:attachments");
    return parts.join(" ").trim();
  }, [searchContent, searchTag, searchDate, searchAttachments]);

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const results = await searchNotes(searchQuery);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const notesToShow = useMemo(() => {
    const base = searchResults !== null ? searchResults : notes;
    return tagFilter ? base.filter((n) => n.tags?.includes(tagFilter)) : base;
  }, [searchResults, notes, tagFilter]);

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id ?? null);
      setSelectedIds(new Set());
    },
    [setSelectedIds]
  );

  const handleSelectMulti = useCallback(
    (id: string, shift: boolean, meta: boolean) => {
      if (shift) {
        const idx = notes.findIndex((n) => n.id === id);
        if (idx === -1) return;
        const lastId = selectedIds.size === 1 ? [...selectedIds][0] : null;
        const lastIdx = lastId ? notes.findIndex((n) => n.id === lastId) : -1;
        const from = lastIdx >= 0 ? Math.min(lastIdx, idx) : idx;
        const to = lastIdx >= 0 ? Math.max(lastIdx, idx) : idx;
        const range = notes.slice(from, to + 1).map((n) => n.id);
        setSelectedIds(new Set(range));
        setSelectedId(id);
        return;
      }
      if (meta) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        setSelectedId(id);
        return;
      }
      setSelectedIds(new Set());
      setSelectedId(id);
    },
    [notes, selectedIds, setSelectedIds]
  );

  useEffect(() => {
    if (!selectedId || selectedId === "") return;
    getBacklinks(selectedId).then(setBacklinks).catch(() => setBacklinks([]));
  }, [selectedId]);

  const handleToggleStar = useCallback(() => {
    const id = selectedId && selectedId !== "" ? selectedId : null;
    if (!id) return;
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    batchToggleImportant([id], !note.important).then(refreshNotes).catch(() => {});
  }, [selectedId, notes, refreshNotes]);

  const handleNewNoteFromTemplate = useCallback(
    async (templateId: string) => {
      const meta = await createNoteFromTemplate(templateId);
      handleSelect(meta.id);
      refreshNotes();
    },
    [handleSelect, refreshNotes]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (e.key === "f" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setFocusMode((v: boolean) => !v);
      }
      if (e.key === "d" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        getOrCreateDailyNote().then((meta) => {
          handleSelect(meta.id);
          refreshNotes();
        }).catch(() => {});
      }
      if (e.key === "s" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleToggleStar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCommandPaletteOpen, setFocusMode, handleToggleStar]);

  const sidebarDragRef = useRef(false);
  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    sidebarDragRef.current = true;
  }, []);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!sidebarDragRef.current) return;
      setSidebarWidth(e.clientX);
    };
    const up = () => {
      sidebarDragRef.current = false;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [setSidebarWidth]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-100 text-red-600">
        <p>{error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-100 text-stone-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full bg-stone-50 text-stone-900">
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        notes={notes}
        onSelectNote={handleSelect}
        onNewNote={() => handleSelect("")}
        onNewNoteFromTemplate={handleNewNoteFromTemplate}
        onManageTemplates={() => setManageTemplatesOpen(true)}
        onFocusMode={() => setFocusMode(true)}
        onToggleStar={handleToggleStar}
        onAction={() => {}}
      />

      <TemplatesModal
        open={manageTemplatesOpen}
        onClose={() => setManageTemplatesOpen(false)}
      />

      {!focusMode && (
        <>
          <div
            className="shrink-0 flex flex-col border-r border-stone-200 bg-white transition-[width] duration-150 ease-in-out relative"
            style={{ width: sidebarWidth }}
          >
          <Sidebar
            notes={notesToShow}
            notebooks={notebooks}
            taskNotes={taskNotes}
            tasksCompletedFilter={tasksCompletedFilter}
            onTasksCompletedFilterChange={setTasksCompletedFilter}
            selectedId={selectedId === "" ? null : selectedId}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onSelectMulti={handleSelectMulti}
            onNewNote={() => handleSelect("")}
            onNewNoteFromTemplate={handleNewNoteFromTemplate}
            onManageTemplates={() => setManageTemplatesOpen(true)}
            searchContent={searchContent}
            onSearchContentChange={setSearchContent}
            searchTag={searchTag}
            onSearchTagChange={setSearchTag}
            searchDate={searchDate}
            onSearchDateChange={setSearchDate}
            searchAttachments={searchAttachments}
            onSearchAttachmentsChange={setSearchAttachments}
            tagFilter={tagFilter}
            onTagFilter={setTagFilter}
            onRefresh={() => {
              refreshNotes();
              refreshTaskNotes();
            }}
            currentNoteId={selectedId === "" ? null : selectedId}
            currentNoteTitle={selectedId ? notes.find((n) => n.id === selectedId)?.title : undefined}
            currentNoteBody={currentBody}
          />
          </div>
          <div
            className="shrink-0 w-1 cursor-col-resize hover:bg-amber-500/20 transition-colors self-stretch"
            onMouseDown={handleSidebarMouseDown}
            aria-hidden
          />
        </>
      )}

      <main
        className={`flex-1 min-w-0 flex flex-col transition-all duration-150 ease-in-out ${
          focusMode ? "max-w-[720px] mx-auto bg-white/95 rounded-lg shadow-lg my-4" : ""
        }`}
      >
        <Editor
          noteId={selectedId === "" ? null : selectedId}
          isNewNote={selectedId === ""}
          onSaved={() => {
          refreshNotes();
          refreshTaskNotes();
        }}
          onSelectNote={setSelectedId}
          onDeleted={() => {
            handleSelect(null);
            refreshNotes();
            refreshTaskNotes();
          }}
          onBodyChange={setCurrentBody}
          focusMode={focusMode}
          onToggleFocusMode={() => setFocusMode(false)}
          onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
          inspectorOpen={inspectorOpen}
          onToggleAIPanel={() => setAiPanelOpen(!aiPanelOpen)}
          aiPanelOpen={aiPanelOpen}
          searchHighlight={searchContent.trim() || undefined}
          refreshTrigger={editorRefreshKey}
        />
      </main>

      {!focusMode && inspectorOpen && (
        <Inspector
          note={selectedId && selectedId !== "" ? notes.find((n) => n.id === selectedId) ?? null : null}
          body={currentBody}
          backlinks={backlinks}
          onOpenNote={handleSelect}
          onRestoreVersion={() => {
            refreshNotes();
            setEditorRefreshKey((k) => k + 1);
          }}
        />
      )}

      {!focusMode && aiPanelOpen && (
        <AIAssistantPanel
          title={
            selectedId && selectedId !== ""
              ? notes.find((n) => n.id === selectedId)?.title ?? ""
              : ""
          }
          body={currentBody}
          hasNote={selectedId !== null}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
