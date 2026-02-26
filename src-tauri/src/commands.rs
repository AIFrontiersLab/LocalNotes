use crate::storage;
use crate::models::NoteContent;

#[tauri::command]
pub fn init_storage(app: tauri::AppHandle) -> Result<(), String> {
    storage::init_storage(&app)
}

#[tauri::command]
pub fn list_notes(app: tauri::AppHandle) -> Result<Vec<crate::models::NoteMeta>, String> {
    storage::list_notes(&app)
}

#[tauri::command]
pub fn read_note(app: tauri::AppHandle, note_id: String) -> Result<NoteContent, String> {
    storage::read_note(&app, &note_id)
}

#[tauri::command]
pub fn save_note(
    app: tauri::AppHandle,
    note_id: Option<String>,
    title: String,
    body: String,
) -> Result<crate::models::NoteMeta, String> {
    storage::save_note(&app, note_id.as_deref(), &title, &body)
}

#[tauri::command]
pub fn toggle_important(
    app: tauri::AppHandle,
    note_id: String,
    important: bool,
) -> Result<crate::models::NoteMeta, String> {
    storage::toggle_important(&app, &note_id, important)
}

#[tauri::command]
pub fn attach_images(
    app: tauri::AppHandle,
    note_id: String,
    file_paths: Vec<String>,
) -> Result<crate::models::NoteMeta, String> {
    storage::attach_images(&app, &note_id, &file_paths)
}

#[tauri::command]
pub fn attach_image_from_clipboard(
    app: tauri::AppHandle,
    note_id: String,
    base64_data: String,
    suggested_name: String,
) -> Result<crate::models::NoteMeta, String> {
    storage::attach_image_from_clipboard(&app, &note_id, &base64_data, &suggested_name)
}

#[tauri::command]
pub fn delete_note(app: tauri::AppHandle, note_id: String) -> Result<(), String> {
    storage::delete_note(&app, &note_id)
}

#[tauri::command]
pub fn resolve_image_path(app: tauri::AppHandle, relative_path: String) -> Result<String, String> {
    let path = storage::resolve_image_path(&app, &relative_path)?;
    path.into_os_string()
        .into_string()
        .map_err(|_| "Invalid path".into())
}

#[tauri::command]
pub fn update_note_title(app: tauri::AppHandle, note_id: String, new_title: String) -> Result<crate::models::NoteMeta, String> {
    storage::update_note_title(&app, &note_id, &new_title)
}

#[tauri::command]
pub fn list_tags(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    storage::list_tags(&app)
}

#[tauri::command]
pub fn notes_by_tag(app: tauri::AppHandle, tag: String) -> Result<Vec<crate::models::NoteMeta>, String> {
    storage::notes_by_tag(&app, &tag)
}

#[tauri::command]
pub fn add_tag_to_notes(app: tauri::AppHandle, note_ids: Vec<String>, tag: String) -> Result<Vec<crate::models::NoteMeta>, String> {
    storage::add_tag_to_notes(&app, &note_ids, &tag)
}

#[tauri::command]
pub fn remove_tag_from_note(app: tauri::AppHandle, note_id: String, tag: String) -> Result<crate::models::NoteMeta, String> {
    storage::remove_tag_from_note(&app, &note_id, &tag)
}

#[tauri::command]
pub fn batch_delete_notes(app: tauri::AppHandle, note_ids: Vec<String>) -> Result<(), String> {
    storage::batch_delete_notes(&app, &note_ids)
}

#[tauri::command]
pub fn batch_toggle_important(app: tauri::AppHandle, note_ids: Vec<String>, important: bool) -> Result<Vec<crate::models::NoteMeta>, String> {
    storage::batch_toggle_important(&app, &note_ids, important)
}

#[tauri::command]
pub fn duplicate_note(app: tauri::AppHandle, note_id: String) -> Result<crate::models::NoteMeta, String> {
    storage::duplicate_note(&app, &note_id)
}

#[tauri::command]
pub fn merge_notes(app: tauri::AppHandle, note_ids: Vec<String>) -> Result<crate::models::NoteMeta, String> {
    storage::merge_notes(&app, &note_ids)
}

#[tauri::command]
pub fn export_note(app: tauri::AppHandle, note_id: String) -> Result<String, String> {
    storage::export_note(&app, &note_id)
}

#[tauri::command]
pub fn get_or_create_daily_note(app: tauri::AppHandle) -> Result<crate::models::NoteMeta, String> {
    storage::get_or_create_daily_note(&app)
}

#[tauri::command]
pub fn get_backlinks(app: tauri::AppHandle, note_id: String) -> Result<Vec<crate::models::NoteMeta>, String> {
    storage::get_backlinks(&app, &note_id)
}

#[tauri::command]
pub fn remove_attachment(app: tauri::AppHandle, note_id: String, relative_path: String) -> Result<crate::models::NoteMeta, String> {
    storage::remove_attachment(&app, &note_id, &relative_path)
}

#[tauri::command]
pub fn rename_attachment(
    app: tauri::AppHandle,
    note_id: String,
    relative_path: String,
    new_name: String,
) -> Result<crate::models::NoteMeta, String> {
    storage::rename_attachment(&app, &note_id, &relative_path, &new_name)
}

#[tauri::command]
pub fn search_notes(app: tauri::AppHandle, query: String) -> Result<Vec<crate::models::NoteMeta>, String> {
    storage::search_notes(&app, &query)
}

#[tauri::command]
pub fn list_note_versions(app: tauri::AppHandle, note_id: String) -> Result<Vec<crate::models::NoteVersionItem>, String> {
    storage::list_note_versions(&app, &note_id)
}

#[tauri::command]
pub fn get_note_version(
    app: tauri::AppHandle,
    note_id: String,
    saved_at: String,
) -> Result<crate::models::NoteVersionContent, String> {
    storage::get_note_version(&app, &note_id, &saved_at)
}

#[tauri::command]
pub fn restore_note_version(
    app: tauri::AppHandle,
    note_id: String,
    saved_at: String,
) -> Result<crate::models::NoteMeta, String> {
    storage::restore_note_version(&app, &note_id, &saved_at)
}

#[tauri::command]
pub fn list_templates(app: tauri::AppHandle) -> Result<Vec<crate::models::NoteTemplate>, String> {
    storage::list_templates(&app)
}

#[tauri::command]
pub fn create_note_from_template(
    app: tauri::AppHandle,
    template_id: String,
    title_override: Option<String>,
) -> Result<crate::models::NoteMeta, String> {
    storage::create_note_from_template(&app, &template_id, title_override.as_deref())
}

#[tauri::command]
pub fn save_custom_template(
    app: tauri::AppHandle,
    name: String,
    body: String,
) -> Result<crate::models::NoteTemplate, String> {
    storage::save_custom_template(&app, &name, &body)
}

#[tauri::command]
pub fn delete_custom_template(app: tauri::AppHandle, template_id: String) -> Result<(), String> {
    storage::delete_custom_template(&app, &template_id)
}

#[tauri::command]
pub fn list_notebooks(app: tauri::AppHandle) -> Result<Vec<crate::models::Notebook>, String> {
    storage::list_notebooks(&app)
}

#[tauri::command]
pub fn create_notebook(app: tauri::AppHandle, name: String) -> Result<crate::models::Notebook, String> {
    storage::create_notebook(&app, &name)
}

#[tauri::command]
pub fn move_note_to_notebook(
    app: tauri::AppHandle,
    note_id: String,
    notebook_id: Option<String>,
) -> Result<crate::models::NoteMeta, String> {
    storage::move_note_to_notebook(&app, &note_id, notebook_id.as_deref())
}

#[tauri::command]
pub fn archive_notebook(
    app: tauri::AppHandle,
    notebook_id: String,
    archived: bool,
) -> Result<crate::models::Notebook, String> {
    storage::archive_notebook(&app, &notebook_id, archived)
}

#[tauri::command]
pub fn update_notebook_name(
    app: tauri::AppHandle,
    notebook_id: String,
    new_name: String,
) -> Result<crate::models::Notebook, String> {
    storage::update_notebook_name(&app, &notebook_id, &new_name)
}

// --- Export & Sync ---

#[tauri::command]
pub fn export_note_as_markdown(app: tauri::AppHandle, note_id: String) -> Result<String, String> {
    storage::export_note_as_markdown(&app, &note_id)
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    storage::write_text_file(&path, &content)
}

#[tauri::command]
pub fn get_sync_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    storage::get_sync_folder(&app)
}

#[tauri::command]
pub fn set_sync_folder(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    storage::set_sync_folder(&app, path)
}

#[tauri::command]
pub fn export_backup(app: tauri::AppHandle, target_dir: String) -> Result<(), String> {
    storage::export_backup(&app, &target_dir)
}

#[tauri::command]
pub fn import_backup(app: tauri::AppHandle, source_dir: String) -> Result<(), String> {
    storage::import_backup(&app, &source_dir)
}
