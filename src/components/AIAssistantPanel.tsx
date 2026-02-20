import { useState, useCallback, useEffect } from "react";

const AI_APPLY_TITLE = "localnotes-ai-apply-title";
const AI_INSERT_TEXT = "localnotes-ai-insert-text";

export interface AIAssistantPanelProps {
  title: string;
  body: string;
  hasNote: boolean;
}

function summarizeNote(body: string, maxSentences = 3): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= maxSentences) return trimmed;
  return sentences.slice(0, maxSentences).join(" ") + (sentences.length > maxSentences ? "…" : "");
}

function suggestTitle(body: string, currentTitle: string): string {
  const trimmed = body.trim();
  if (!trimmed) return currentTitle || "Untitled";
  const firstLine = trimmed.split(/\n/)[0].trim();
  if (firstLine.length > 60) return firstLine.slice(0, 57) + "…";
  return firstLine || currentTitle || "Untitled";
}

function extractTasks(body: string): { text: string; done: boolean }[] {
  const tasks: { text: string; done: boolean }[] = [];
  const lines = body.split(/\n/);
  for (const line of lines) {
    const t = line.trim();
    const unchecked = t.match(/^[-*]\s+\[\s*\]\s*(.*)$/);
    const checked = t.match(/^[-*]\s+\[[xX]\]\s*(.*)$/);
    if (unchecked) tasks.push({ text: unchecked[1].trim(), done: false });
    else if (checked) tasks.push({ text: checked[1].trim(), done: true });
    else if (/^[-*]\s+/.test(t)) tasks.push({ text: t.replace(/^[-*]\s+/, "").trim(), done: false });
  }
  return tasks;
}

function tasksToMarkdown(tasks: { text: string; done: boolean }[]): string {
  return tasks.map((t) => (t.done ? `- [x] ${t.text}` : `- [ ] ${t.text}`)).join("\n");
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function dispatchApplyTitle(title: string) {
  window.dispatchEvent(new CustomEvent(AI_APPLY_TITLE, { detail: { title } }));
}

function dispatchInsertText(text: string, where: "cursor" | "end" = "end") {
  window.dispatchEvent(new CustomEvent(AI_INSERT_TEXT, { detail: { text, where } }));
}

export function AIAssistantPanel({ title, body, hasNote }: AIAssistantPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [promptType, setPromptType] = useState<"improve" | "blog" | null>(null);

  const handleCopy = useCallback(
    (id: string, text: string) => {
      copyToClipboard(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    },
    []
  );

  if (!hasNote) {
    return (
      <aside className="w-64 shrink-0 border-l border-stone-200 bg-stone-50/50 flex flex-col items-center justify-center text-stone-500 text-sm p-4">
        Select a note to use AI actions.
      </aside>
    );
  }

  const summary = summarizeNote(body);
  const suggestedTitle = suggestTitle(body, title);
  const tasks = extractTasks(body);
  const tasksMarkdown = tasksToMarkdown(tasks);

  const improvePrompt = `Improve the following text for clarity and style. Keep the same structure and length roughly. Return only the improved text.\n\n---\n\n${body}`;
  const blogPrompt = `Convert this note into a short blog post (2–3 paragraphs). Keep the same ideas, make it engaging.\n\n---\n\n${body}`;
  const emailPrompt = `Convert this note into a concise email. Use a clear subject line and a brief body.\n\n---\n\n${body}`;

  return (
    <aside className="w-64 shrink-0 border-l border-stone-200 bg-stone-50/50 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-stone-200">
        <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wider">AI Assistant</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-sm">
        {/* Summarize note */}
        <div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">
            Summarize note
          </div>
          <p className="text-stone-700 mb-2 line-clamp-4">{summary || "—"}</p>
          {summary && (
            <button
              type="button"
              onClick={() => handleCopy("summary", summary)}
              className="text-xs px-2 py-1 rounded border border-stone-200 hover:bg-stone-100"
            >
              {copiedId === "summary" ? "Copied" : "Copy"}
            </button>
          )}
        </div>

        {/* Generate title */}
        <div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">
            Generate title
          </div>
          <p className="text-stone-700 mb-2 truncate" title={suggestedTitle}>
            {suggestedTitle || "—"}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => dispatchApplyTitle(suggestedTitle)}
              className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => handleCopy("title", suggestedTitle)}
              className="text-xs px-2 py-1 rounded border border-stone-200 hover:bg-stone-100"
            >
              {copiedId === "title" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Improve writing */}
        <div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">
            Improve writing
          </div>
          <p className="text-stone-600 mb-2 text-xs">
            Copy the prompt below and paste into your preferred AI tool.
          </p>
          {promptType !== "improve" ? (
            <button
              type="button"
              onClick={() => setPromptType("improve")}
              className="text-xs px-2 py-1 rounded border border-stone-200 hover:bg-stone-100"
            >
              Show prompt
            </button>
          ) : (
            <div className="space-y-1">
              <pre className="text-xs bg-white border border-stone-200 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                {improvePrompt}
              </pre>
              <button
                type="button"
                onClick={() => handleCopy("improve", improvePrompt)}
                className="text-xs px-2 py-1 rounded border border-stone-200 hover:bg-stone-100"
              >
                {copiedId === "improve" ? "Copied" : "Copy prompt"}
              </button>
              <button
                type="button"
                onClick={() => setPromptType(null)}
                className="text-xs px-2 py-1 text-stone-500"
              >
                Hide
              </button>
            </div>
          )}
        </div>

        {/* Extract tasks */}
        <div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">
            Extract tasks
          </div>
          {tasks.length === 0 ? (
            <p className="text-stone-500 text-xs">No checklist items found in this note.</p>
          ) : (
            <>
              <ul className="text-stone-700 mb-2 space-y-0.5 list-none">
                {tasks.slice(0, 8).map((t, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className={t.done ? "text-stone-400" : ""}>
                      {t.done ? "☑" : "☐"} {t.text}
                    </span>
                  </li>
                ))}
                {tasks.length > 8 && (
                  <li className="text-stone-500 text-xs">+{tasks.length - 8} more</li>
                )}
              </ul>
              <button
                type="button"
                onClick={() => dispatchInsertText("\n\n## Tasks\n\n" + tasksMarkdown + "\n", "end")}
                className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                Insert into note
              </button>
            </>
          )}
        </div>

        {/* Convert to blog/email */}
        <div>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">
            Convert to blog / email
          </div>
          <p className="text-stone-600 mb-2 text-xs">
            Use these prompts in your AI tool, then paste the result back.
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setPromptType(promptType === "blog" ? null : "blog")}
              className="text-xs px-2 py-1 rounded border border-stone-200 hover:bg-stone-100"
            >
              Blog prompt
            </button>
            <button
              type="button"
              onClick={() => handleCopy("blog", blogPrompt)}
              className="text-xs px-2 py-1 rounded border border-stone-200 hover:bg-stone-100"
            >
              {copiedId === "blog" ? "Copied" : "Copy blog"}
            </button>
            <button
              type="button"
              onClick={() => handleCopy("email", emailPrompt)}
              className="text-xs px-2 py-1 rounded border border-stone-200 hover:bg-stone-100"
            >
              {copiedId === "email" ? "Copied" : "Copy email"}
            </button>
          </div>
          {promptType === "blog" && (
            <pre className="mt-2 text-xs bg-white border border-stone-200 rounded p-2 overflow-x-auto max-h-28 overflow-y-auto whitespace-pre-wrap">
              {blogPrompt}
            </pre>
          )}
        </div>
      </div>
    </aside>
  );
}

export function useAIAssistantEvents(
  setTitle: (t: string) => void,
  setBody: React.Dispatch<React.SetStateAction<string>>,
  bodyRef: React.RefObject<HTMLTextAreaElement | null>
) {
  useEffect(() => {
    const onApplyTitle = (e: Event) => {
      setTitle((e as CustomEvent<{ title: string }>).detail.title);
    };
    const onInsertText = (e: Event) => {
      const { text, where } = (e as CustomEvent<{ text: string; where: "cursor" | "end" }>).detail;
      const ta = bodyRef.current;
      if (where === "end") {
        setBody((prev: string) => prev + text);
      } else if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const val = ta.value ?? "";
        setBody(val.slice(0, start) + text + val.slice(end));
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(start + text.length, start + text.length);
        });
      }
    };
    window.addEventListener(AI_APPLY_TITLE, onApplyTitle);
    window.addEventListener(AI_INSERT_TEXT, onInsertText);
    return () => {
      window.removeEventListener(AI_APPLY_TITLE, onApplyTitle);
      window.removeEventListener(AI_INSERT_TEXT, onInsertText);
    };
  }, [setTitle, setBody]);
}
