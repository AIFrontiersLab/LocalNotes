import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  exportBackup,
  getSyncFolder,
  importBackup,
  setSyncFolder,
  writeTextFile,
  exportNoteAsMarkdown,
} from "../api";

interface SyncBackupProps {
  onRefresh: () => void;
  /** When provided, show "Export to Markdown" for current note and pass noteId for PDF export. */
  currentNoteId?: string | null;
  currentNoteTitle?: string;
  currentNoteBody?: string;
}

export function SyncBackup({
  onRefresh,
  currentNoteId,
  currentNoteTitle = "",
  currentNoteBody = "",
}: SyncBackupProps) {
  const [syncFolder, setSyncFolderState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const showMessage = useCallback((type: "ok" | "err", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  useEffect(() => {
    getSyncFolder()
      .then((path) => setSyncFolderState(path ?? null))
      .catch(() => setSyncFolderState(null));
  }, []);

  const handleBackupToFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose backup folder (e.g. iCloud Drive or Dropbox)",
    });
    if (!selected || typeof selected !== "string") return;
    setLoading(true);
    try {
      await exportBackup(selected);
      showMessage("ok", "Backup saved to folder.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  const handleRestoreFromFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose backup folder to restore from",
    });
    if (!selected || typeof selected !== "string") return;
    if (!window.confirm("Restore will overwrite current notes. Continue?")) return;
    setLoading(true);
    try {
      await importBackup(selected);
      onRefresh();
      showMessage("ok", "Restore complete.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onRefresh, showMessage]);

  const handleSetSyncFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose sync folder (e.g. iCloud Drive/LocalNotes or Dropbox/LocalNotes)",
    });
    if (!selected || typeof selected !== "string") return;
    try {
      await setSyncFolder(selected);
      setSyncFolderState(selected);
      showMessage("ok", "Sync folder set.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : String(e));
    }
  }, [showMessage]);

  const handleClearSyncFolder = useCallback(async () => {
    try {
      await setSyncFolder(null);
      setSyncFolderState(null);
      showMessage("ok", "Sync folder cleared.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : String(e));
    }
  }, [showMessage]);

  const handlePushToSync = useCallback(async () => {
    const folder = syncFolder;
    if (!folder) {
      showMessage("err", "Set a sync folder first (e.g. iCloud or Dropbox).");
      return;
    }
    setLoading(true);
    try {
      await exportBackup(folder);
      showMessage("ok", "Pushed to sync folder.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [syncFolder, showMessage]);

  const handlePullFromSync = useCallback(async () => {
    const folder = syncFolder;
    if (!folder) {
      showMessage("err", "Set a sync folder first.");
      return;
    }
    if (!window.confirm("Pull will overwrite local notes with sync folder. Continue?")) return;
    setLoading(true);
    try {
      await importBackup(folder);
      onRefresh();
      showMessage("ok", "Pulled from sync folder.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [syncFolder, onRefresh, showMessage]);

  const handleExportNoteMarkdown = useCallback(async () => {
    if (!currentNoteId) return;
    try {
      const md = await exportNoteAsMarkdown(currentNoteId);
      const path = await save({
        title: "Export note as Markdown",
        defaultPath: `${currentNoteTitle || "note"}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (path) {
        await writeTextFile(path, md);
        showMessage("ok", "Exported to Markdown.");
      }
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : String(e));
    }
  }, [currentNoteId, currentNoteTitle, showMessage]);

  return (
    <section className="border-b border-stone-100 last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-stone-500 uppercase tracking-wider hover:bg-stone-50 transition-colors duration-[120ms] ease-in-out"
      >
        Sync &amp; Backup
        <span className="transition-transform duration-[120ms] ease-in-out" style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>
          ▾
        </span>
      </button>
      {isOpen && (
        <div className="overflow-hidden px-2 pb-2 space-y-2" style={{ animation: "slideDown 0.12s ease-out" }}>
          {message && (
            <p className={`text-xs ${message.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}
          {currentNoteId && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-stone-500 uppercase tracking-wider">Export current note</div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={handleExportNoteMarkdown}
                  className="px-2 py-1.5 text-xs rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                >
                  Export to Markdown
                </button>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("localnotes-export-pdf", { detail: { title: currentNoteTitle, body: currentNoteBody } }))}
                  className="px-2 py-1.5 text-xs rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                >
                  Export to PDF
                </button>
              </div>
            </div>
          )}
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider">Backup</div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={handleBackupToFolder}
              disabled={loading}
              className="px-2 py-1.5 text-xs rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              Backup to folder…
            </button>
            <button
              type="button"
              onClick={handleRestoreFromFolder}
              disabled={loading}
              className="px-2 py-1.5 text-xs rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              Restore from folder…
            </button>
          </div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider">iCloud / Dropbox sync</div>
          {syncFolder ? (
            <p className="text-xs text-stone-500 truncate" title={syncFolder}>
              {syncFolder}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={handleSetSyncFolder}
              className="px-2 py-1.5 text-xs rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
            >
              {syncFolder ? "Change sync folder" : "Set sync folder…"}
            </button>
            {syncFolder && (
              <>
                <button
                  type="button"
                  onClick={handleClearSyncFolder}
                  className="px-2 py-1.5 text-xs rounded border border-stone-200 text-stone-500 hover:bg-stone-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handlePushToSync}
                  disabled={loading}
                  className="px-2 py-1.5 text-xs rounded border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  Push to sync
                </button>
                <button
                  type="button"
                  onClick={handlePullFromSync}
                  disabled={loading}
                  className="px-2 py-1.5 text-xs rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  Pull from sync
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
