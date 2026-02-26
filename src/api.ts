import { invoke } from "@tauri-apps/api/core";
import type { NoteMeta, NoteContent, Notebook, NoteTemplate, NoteVersionItem, NoteVersionContent } from "./types";

export async function initStorage(): Promise<void> {
  await invoke("init_storage");
}

export async function listNotes(): Promise<NoteMeta[]> {
  return invoke("list_notes");
}

export async function readNote(noteId: string): Promise<NoteContent> {
  return invoke("read_note", { noteId });
}

export async function saveNote(
  noteId: string | null,
  title: string,
  body: string
): Promise<NoteMeta> {
  return invoke("save_note", {
    noteId: noteId ?? undefined,
    title,
    body,
  });
}

export async function toggleImportant(
  noteId: string,
  important: boolean
): Promise<NoteMeta> {
  return invoke("toggle_important", { noteId, important });
}

export async function attachImages(
  noteId: string,
  filePaths: string[]
): Promise<NoteMeta> {
  return invoke("attach_images", { noteId, filePaths });
}

export async function attachImageFromClipboard(
  noteId: string,
  base64Data: string,
  suggestedName: string
): Promise<NoteMeta> {
  return invoke("attach_image_from_clipboard", {
    noteId,
    base64Data,
    suggestedName,
  });
}

export async function deleteNote(noteId: string): Promise<void> {
  return invoke("delete_note", { noteId });
}

export async function resolveImagePath(relativePath: string): Promise<string> {
  return invoke("resolve_image_path", { relativePath });
}

export async function updateNoteTitle(noteId: string, newTitle: string): Promise<NoteMeta> {
  return invoke("update_note_title", { noteId, newTitle });
}

export async function listTags(): Promise<string[]> {
  return invoke("list_tags");
}

export async function notesByTag(tag: string): Promise<NoteMeta[]> {
  return invoke("notes_by_tag", { tag });
}

export async function addTagToNotes(noteIds: string[], tag: string): Promise<NoteMeta[]> {
  return invoke("add_tag_to_notes", { noteIds, tag });
}

export async function removeTagFromNote(noteId: string, tag: string): Promise<NoteMeta> {
  return invoke("remove_tag_from_note", { noteId, tag });
}

export async function batchDeleteNotes(noteIds: string[]): Promise<void> {
  return invoke("batch_delete_notes", { noteIds });
}

export async function batchToggleImportant(noteIds: string[], important: boolean): Promise<NoteMeta[]> {
  return invoke("batch_toggle_important", { noteIds, important });
}

export async function duplicateNote(noteId: string): Promise<NoteMeta> {
  return invoke("duplicate_note", { noteId });
}

export async function mergeNotes(noteIds: string[]): Promise<NoteMeta> {
  return invoke("merge_notes", { noteIds });
}

export async function exportNote(noteId: string): Promise<string> {
  return invoke("export_note", { noteId });
}

export async function getOrCreateDailyNote(): Promise<NoteMeta> {
  return invoke("get_or_create_daily_note");
}

export async function getBacklinks(noteId: string): Promise<NoteMeta[]> {
  return invoke("get_backlinks", { noteId });
}

export async function removeAttachment(noteId: string, relativePath: string): Promise<NoteMeta> {
  return invoke("remove_attachment", { noteId, relativePath });
}

export async function renameAttachment(
  noteId: string,
  relativePath: string,
  newName: string
): Promise<NoteMeta> {
  return invoke("rename_attachment", { noteId, relativePath, newName });
}

export async function searchNotes(query: string): Promise<NoteMeta[]> {
  return invoke("search_notes", { query });
}

export async function listNoteVersions(noteId: string): Promise<NoteVersionItem[]> {
  return invoke("list_note_versions", { noteId });
}

export async function getNoteVersion(noteId: string, savedAt: string): Promise<NoteVersionContent> {
  return invoke("get_note_version", { noteId, savedAt });
}

export async function restoreNoteVersion(noteId: string, savedAt: string): Promise<NoteMeta> {
  return invoke("restore_note_version", { noteId, savedAt });
}

export async function listTemplates(): Promise<NoteTemplate[]> {
  return invoke("list_templates");
}

export async function createNoteFromTemplate(
  templateId: string,
  titleOverride?: string
): Promise<NoteMeta> {
  return invoke("create_note_from_template", {
    template_id: templateId,
    title_override: titleOverride ?? undefined,
  });
}

export async function saveCustomTemplate(
  name: string,
  body: string
): Promise<NoteTemplate> {
  return invoke("save_custom_template", { name, body });
}

export async function deleteCustomTemplate(templateId: string): Promise<void> {
  return invoke("delete_custom_template", { templateId });
}

export async function listNotebooks(): Promise<Notebook[]> {
  return invoke("list_notebooks");
}

export async function createNotebook(name: string): Promise<Notebook> {
  return invoke("create_notebook", { name });
}

export async function moveNoteToNotebook(noteId: string, notebookId: string | null): Promise<NoteMeta> {
  return invoke("move_note_to_notebook", { noteId, notebookId: notebookId ?? undefined });
}

export async function archiveNotebook(notebookId: string, archived: boolean): Promise<Notebook> {
  return invoke("archive_notebook", { notebookId, archived });
}

export async function updateNotebookName(notebookId: string, newName: string): Promise<Notebook> {
  return invoke("update_notebook_name", { notebookId, newName });
}

// --- Export & Sync ---

export async function exportNoteAsMarkdown(noteId: string): Promise<string> {
  return invoke("export_note_as_markdown", { noteId });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  return invoke("write_text_file", { path, content });
}

export async function getSyncFolder(): Promise<string | null> {
  return invoke("get_sync_folder");
}

export async function setSyncFolder(path: string | null): Promise<void> {
  return invoke("set_sync_folder", { path: path ?? undefined });
}

export async function exportBackup(targetDir: string): Promise<void> {
  return invoke("export_backup", { targetDir });
}

export async function importBackup(sourceDir: string): Promise<void> {
  return invoke("import_backup", { sourceDir });
}
