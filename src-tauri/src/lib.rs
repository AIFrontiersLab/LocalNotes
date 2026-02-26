mod commands;
mod models;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::init_storage,
            commands::list_notes,
            commands::read_note,
            commands::save_note,
            commands::toggle_important,
            commands::attach_images,
            commands::attach_image_from_clipboard,
            commands::delete_note,
            commands::resolve_image_path,
            commands::update_note_title,
            commands::list_tags,
            commands::notes_by_tag,
            commands::add_tag_to_notes,
            commands::remove_tag_from_note,
            commands::batch_delete_notes,
            commands::batch_toggle_important,
            commands::duplicate_note,
            commands::merge_notes,
            commands::export_note,
            commands::get_or_create_daily_note,
            commands::get_backlinks,
            commands::remove_attachment,
            commands::rename_attachment,
            commands::search_notes,
            commands::list_note_versions,
            commands::get_note_version,
            commands::restore_note_version,
            commands::list_notebooks,
            commands::create_notebook,
            commands::move_note_to_notebook,
            commands::archive_notebook,
            commands::update_notebook_name,
            commands::list_templates,
            commands::create_note_from_template,
            commands::save_custom_template,
            commands::delete_custom_template,
            commands::export_note_as_markdown,
            commands::write_text_file,
            commands::get_sync_folder,
            commands::set_sync_folder,
            commands::export_backup,
            commands::import_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
