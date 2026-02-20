import { useCallback, useEffect, useState } from "react";
import {
  listTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
} from "../api";
import type { NoteTemplate } from "../types";

interface TemplatesModalProps {
  open: boolean;
  onClose: () => void;
}

export function TemplatesModal({ open, onClose }: TemplatesModalProps) {
  const [customTemplates, setCustomTemplates] = useState<NoteTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addBody, setAddBody] = useState("");
  const [adding, setAdding] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await listTemplates();
      setCustomTemplates(all.filter((t) => t.isCustom));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadTemplates();
  }, [open, loadTemplates]);

  const handleAdd = async () => {
    const name = addName.trim() || "Untitled template";
    setAdding(true);
    setError(null);
    try {
      await saveCustomTemplate(name, addBody.trim());
      setAddName("");
      setAddBody("");
      await loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this template?")) return;
    setError(null);
    try {
      await deleteCustomTemplate(id);
      await loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (open && e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
      role="dialog"
      aria-label="Manage templates"
    >
      <div
        className="bg-white rounded-lg shadow-xl border border-stone-200 w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <h2 className="text-lg font-semibold text-stone-800">Custom templates</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-stone-500 hover:bg-stone-100 hover:text-stone-700"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-2 px-3 py-2 bg-red-100 text-red-800 text-sm rounded">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <p className="text-stone-500 text-sm">Loading…</p>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-medium text-stone-600 mb-2">Add template</h3>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Template name"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500/50 mb-2"
                />
                <textarea
                  value={addBody}
                  onChange={(e) => setAddBody(e.target.value)}
                  placeholder="Template body (use {{date}} and {{title}} as placeholders)"
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500/50 font-mono"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={adding}
                  className="mt-2 px-3 py-1.5 rounded bg-stone-800 text-white text-sm hover:bg-stone-900 disabled:opacity-50"
                >
                  {adding ? "Adding…" : "Add template"}
                </button>
              </div>

              <div>
                <h3 className="text-sm font-medium text-stone-600 mb-2">Your templates</h3>
                {customTemplates.length === 0 ? (
                  <p className="text-stone-400 text-sm">No custom templates yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {customTemplates.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 py-2 px-3 rounded border border-stone-100 bg-stone-50/50"
                      >
                        <span className="text-sm font-medium text-stone-800 truncate">
                          {t.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(t.id)}
                          className="shrink-0 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
