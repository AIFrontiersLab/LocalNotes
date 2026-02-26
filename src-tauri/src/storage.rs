use crate::models::{ImageRef, IndexFile, NoteMeta, NoteTemplate, Notebook, NoteVersionContent, NoteVersionItem, VersionSnapshot};
use chrono::Utc;
use serde_json;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;
use uuid::Uuid;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

/// Extract #tag tokens from text (alphanumeric + underscore after #).
fn extract_tags_from_body(body: &str) -> Vec<String> {
    let mut tags: HashSet<String> = HashSet::new();
    let mut chars = body.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '#' {
            let mut tag = String::new();
            while let Some(&p) = chars.peek() {
                if p.is_alphanumeric() || p == '_' || p == '-' {
                    tag.push(chars.next().unwrap());
                } else {
                    break;
                }
            }
            if !tag.is_empty() {
                tags.insert(tag);
            }
        }
    }
    let mut v: Vec<String> = tags.into_iter().collect();
    v.sort();
    v
}

/// Smart tags: derive a slug from the title (e.g. "Project Alpha" -> "project-alpha").
fn extract_tags_from_title(title: &str) -> Vec<String> {
    let slug: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .map(|s| s.to_lowercase())
        .collect::<Vec<_>>()
        .join("-");
    if slug.len() >= 2 && slug.chars().any(|c| c.is_alphanumeric()) {
        vec![slug]
    } else {
        vec![]
    }
}

/// Extract [[Title]] from text and resolve to note ids using index (title match, case-insensitive).
fn extract_links_from_body(body: &str, notes: &[NoteMeta], exclude_id: &str) -> Vec<String> {
    let mut ids: HashSet<String> = HashSet::new();
    let mut chars = body.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '[' && chars.peek() == Some(&'[') {
            chars.next();
            let mut title = String::new();
            while let Some(&p) = chars.peek() {
                if p == ']' {
                    chars.next();
                    if chars.peek() == Some(&']') {
                        chars.next();
                        break;
                    }
                    title.push(']');
                    title.push(chars.next().unwrap());
                } else {
                    title.push(chars.next().unwrap());
                }
            }
            let title = title.trim();
            if !title.is_empty() {
                let lower = title.to_lowercase();
                for n in notes {
                    if n.id != exclude_id && n.title.to_lowercase() == lower {
                        ids.insert(n.id.clone());
                        break;
                    }
                }
            }
        }
    }
    let mut v: Vec<String> = ids.into_iter().collect();
    v.sort();
    v
}

/// Sanitize a filename: remove path separators and other dangerous chars.
pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
        .chars()
        .take(200)
        .collect()
}

/// Validate that a note id is a single path component (no directory traversal).
pub fn validate_note_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Note id cannot be empty".into());
    }
    if id.contains('/') || id.contains('\\') || id == "." || id == ".." {
        return Err("Invalid note id".into());
    }
    if id.chars().any(|c| c.is_control()) {
        return Err("Invalid note id".into());
    }
    Ok(())
}

/// Get the app storage root: ~/Library/Application Support/LocalPrivateNotes
pub fn storage_root(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data: PathBuf = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let parent = app_data.parent().ok_or("No parent for app data dir")?;
    let root = parent.join("LocalPrivateNotes");
    Ok(root)
}

fn notes_dir(root: &Path) -> PathBuf {
    root.join("notes")
}

fn meta_dir(root: &Path) -> PathBuf {
    root.join("meta")
}

fn index_path(root: &Path) -> PathBuf {
    meta_dir(root).join("index.json")
}

fn templates_path(root: &Path) -> PathBuf {
    meta_dir(root).join("templates.json")
}

fn images_dir(root: &Path, note_id: &str) -> PathBuf {
    root.join("images").join(sanitize_filename(note_id))
}

fn versions_dir(root: &Path, note_id: &str) -> PathBuf {
    root.join("versions").join(sanitize_filename(note_id))
}

/// Max number of version snapshots to keep per note.
const MAX_VERSIONS_PER_NOTE: usize = 30;

/// Sanitize timestamp for use as filename (replace ':' with '-').
fn version_filename(saved_at: &str) -> String {
    format!("{}.json", saved_at.replace(':', "-"))
}

/// Ensure all directories exist and index.json exists.
pub fn init_storage(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let root = storage_root(app_handle)?;
    fs::create_dir_all(notes_dir(&root)).map_err(|e| e.to_string())?;
    fs::create_dir_all(meta_dir(&root)).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("images")).map_err(|e| e.to_string())?;

    let idx = index_path(&root);
    if !idx.exists() {
        let empty = IndexFile::default();
        write_index(&root, &empty)?;
    }
    Ok(())
}

/// Atomic write: write to temp file then rename.
pub fn write_index(root: &Path, index: &IndexFile) -> Result<(), String> {
    let path = index_path(root);
    let temp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    let mut f = fs::File::create(&temp_path).map_err(|e| e.to_string())?;
    f.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    drop(f);
    fs::rename(&temp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_index(root: &Path) -> Result<IndexFile, String> {
    let path = index_path(root);
    if !path.exists() {
        return Ok(IndexFile::default());
    }
    let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut s = String::new();
    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

fn note_path(root: &Path, note_id: &str) -> PathBuf {
    notes_dir(root).join(format!("{}.txt", sanitize_filename(note_id)))
}

/// List all notes from index.
pub fn list_notes(app_handle: &tauri::AppHandle) -> Result<Vec<NoteMeta>, String> {
    let root = storage_root(app_handle)?;
    let index = read_index(&root)?;
    Ok(index.notes)
}

/// Read note body and metadata.
pub fn read_note(app_handle: &tauri::AppHandle, note_id: &str) -> Result<crate::models::NoteContent, String> {
    validate_note_id(note_id)?;
    let root = storage_root(app_handle)?;
    let index = read_index(&root)?;
    let meta = index
        .notes
        .into_iter()
        .find(|n| n.id == note_id)
        .ok_or_else(|| "Note not found".to_string())?;
    let path = note_path(&root, note_id);
    let body = if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    Ok(crate::models::NoteContent { meta, body })
}

/// Create or update a note. If note_id is None, create new.
pub fn save_note(
    app_handle: &tauri::AppHandle,
    note_id: Option<&str>,
    title: &str,
    body: &str,
) -> Result<NoteMeta, String> {
    let root = storage_root(app_handle)?;
    let now = Utc::now().to_rfc3339();
    let mut index = read_index(&root)?;

    let body_tags = extract_tags_from_body(body);
    let title_tags = extract_tags_from_title(title);
    let mut tags: HashSet<String> = body_tags.into_iter().collect();
    for t in title_tags {
        tags.insert(t);
    }
    let mut tags: Vec<String> = tags.into_iter().collect();
    tags.sort();
    let links_to = extract_links_from_body(body, &index.notes, note_id.unwrap_or(""));

    let (id, meta) = if let Some(id) = note_id {
        validate_note_id(id)?;
        let pos = index.notes.iter().position(|n| n.id == id);
        match pos {
            Some(i) => {
                let n = index.notes.get_mut(i).unwrap();
                // Save current content as a version before overwriting (if note already has body on disk)
                let path = note_path(&root, id);
                if path.exists() {
                    if let Ok(current_body) = fs::read_to_string(&path) {
                        let v_dir = versions_dir(&root, id);
                        let _ = fs::create_dir_all(&v_dir);
                        let snapshot = VersionSnapshot {
                            saved_at: n.updated_at.clone(),
                            title: n.title.clone(),
                            body: current_body,
                        };
                        let v_name = version_filename(&snapshot.saved_at);
                        let v_path = v_dir.join(&v_name);
                        if let Ok(json) = serde_json::to_string_pretty(&snapshot) {
                            let _ = fs::write(&v_path, json);
                        }
                        // Keep only the last MAX_VERSIONS_PER_NOTE
                        if let Ok(entries) = fs::read_dir(&v_dir) {
                            let mut names: Vec<String> = entries
                                .filter_map(|e| e.ok())
                                .filter_map(|e| e.file_name().into_string().ok())
                                .filter(|s| s.ends_with(".json"))
                                .collect();
                            names.sort_by(|a, b| b.cmp(a));
                            for name in names.into_iter().skip(MAX_VERSIONS_PER_NOTE) {
                                let _ = fs::remove_file(v_dir.join(&name));
                            }
                        }
                    }
                }
                n.title = title.to_string();
                n.updated_at = now.clone();
                n.tags = tags.clone();
                n.links_to = links_to.clone();
                (id.to_string(), n.clone())
            }
            None => {
                let id = id.to_string();
                let filename = format!("{}.txt", id);
                let meta = NoteMeta {
                    id: id.clone(),
                    title: title.to_string(),
                    created_at: now.clone(),
                    updated_at: now.clone(),
                    important: false,
                    filename: filename.clone(),
                    images: vec![],
                    tags: tags.clone(),
                    links_to: links_to.clone(),
                    is_daily: false,
                    notebook_id: None,
                };
                index.notes.push(meta.clone());
                (id, meta)
            }
        }
    } else {
        let id = Uuid::new_v4().to_string();
        let filename = format!("{}.txt", id);
        let meta = NoteMeta {
            id: id.clone(),
            title: title.to_string(),
            created_at: now.clone(),
            updated_at: now,
            important: false,
            filename,
            images: vec![],
            tags,
            links_to,
            is_daily: false,
            notebook_id: None,
        };
        index.notes.push(meta.clone());
        (id, meta)
    };

    let path = note_path(&root, &id);
    fs::write(&path, body).map_err(|e| e.to_string())?;
    write_index(&root, &index)?;
    Ok(meta)
}

/// Toggle important flag.
pub fn toggle_important(app_handle: &tauri::AppHandle, note_id: &str, important: bool) -> Result<NoteMeta, String> {
    validate_note_id(note_id)?;
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let n = index.notes.iter_mut().find(|n| n.id == note_id).ok_or("Note not found")?;
    n.important = important;
    n.updated_at = Utc::now().to_rfc3339();
    let meta = n.clone();
    write_index(&root, &index)?;
    Ok(meta)
}

/// Copy image files into images/<noteId>/ and update note metadata.
pub fn attach_images(
    app_handle: &tauri::AppHandle,
    note_id: &str,
    file_paths: &[String],
) -> Result<NoteMeta, String> {
    validate_note_id(note_id)?;
    let root = storage_root(app_handle)?;
    let img_dir = images_dir(&root, note_id);
    fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;

    let mut index = read_index(&root)?;
    let note = index.notes.iter_mut().find(|n| n.id == note_id).ok_or("Note not found")?;
    let added_at = Utc::now().to_rfc3339();

    for path_str in file_paths {
        let src = Path::new(path_str);
        if !src.is_file() {
            continue;
        }
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("");
        let safe_name = sanitize_filename(stem);
        let stored_name = if ext.is_empty() {
            format!("{}-{}", chrono::Utc::now().timestamp_millis(), safe_name)
        } else {
            format!("{}-{}.{}", chrono::Utc::now().timestamp_millis(), safe_name, ext)
        };
        let dest = img_dir.join(&stored_name);
        fs::copy(src, &dest).map_err(|e| e.to_string())?;
        let size = fs::metadata(&dest).ok().map(|m| m.len());
        let relative_path = format!("images/{}/{}", note_id, stored_name);
        note.images.push(ImageRef {
            name: src.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string(),
            path: relative_path,
            added_at: added_at.clone(),
            size,
        });
    }
    note.updated_at = Utc::now().to_rfc3339();
    let meta = note.clone();
    write_index(&root, &index)?;
    Ok(meta)
}

/// Attach a single image from clipboard (base64-encoded bytes) to a note.
pub fn attach_image_from_clipboard(
    app_handle: &tauri::AppHandle,
    note_id: &str,
    base64_data: &str,
    suggested_name: &str,
) -> Result<NoteMeta, String> {
    validate_note_id(note_id)?;
    let data = BASE64
        .decode(base64_data.trim())
        .map_err(|e| format!("Invalid base64 image: {}", e))?;
    if data.is_empty() {
        return Err("Image data is empty".into());
    }
    let root = storage_root(app_handle)?;
    let img_dir = images_dir(&root, note_id);
    fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;

    let path = Path::new(suggested_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("paste");
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| !e.is_empty())
        .unwrap_or("png");
    let safe_stem = sanitize_filename(stem);
    let stored_name = format!(
        "{}-{}.{}",
        chrono::Utc::now().timestamp_millis(),
        safe_stem,
        ext.to_lowercase()
    );
    let dest = img_dir.join(&stored_name);
    fs::write(&dest, &data).map_err(|e| e.to_string())?;
    // Also save a copy to the default user Images folder (~/Images)
    if let Some(default_dir) = default_images_folder() {
        let _ = fs::create_dir_all(&default_dir);
        let timestamp = Utc::now().format("%Y-%m-%d-%H%M%S");
        let default_name = format!("paste-{}.{}", timestamp, ext.to_lowercase());
        let default_path = default_dir.join(&default_name);
        let _ = fs::write(&default_path, &data);
    }
    let size = data.len() as u64;
    let relative_path = format!("images/{}/{}", note_id, stored_name);
    let display_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("paste")
        .to_string();

    let mut index = read_index(&root)?;
    let note = index
        .notes
        .iter_mut()
        .find(|n| n.id == note_id)
        .ok_or("Note not found")?;
    let added_at = Utc::now().to_rfc3339();
    note.images.push(ImageRef {
        name: display_name,
        path: relative_path,
        added_at,
        size: Some(size),
    });
    note.updated_at = Utc::now().to_rfc3339();
    let meta = note.clone();
    write_index(&root, &index)?;
    Ok(meta)
}

/// Default folder for saving clipboard-pasted images: ~/Images (or $USERPROFILE/Images on Windows).
fn default_images_folder() -> Option<PathBuf> {
    let home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)?;
    Some(home.join("Images"))
}

/// Delete a note: remove from index, delete .txt, image folder, and versions.
pub fn delete_note(app_handle: &tauri::AppHandle, note_id: &str) -> Result<(), String> {
    validate_note_id(note_id)?;
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let pos = index.notes.iter().position(|n| n.id == note_id).ok_or("Note not found")?;
    index.notes.remove(pos);
    write_index(&root, &index)?;
    let path = note_path(&root, note_id);
    let _ = fs::remove_file(&path);
    let img_dir = images_dir(&root, note_id);
    let _ = fs::remove_dir_all(&img_dir);
    let v_dir = versions_dir(&root, note_id);
    let _ = fs::remove_dir_all(&v_dir);
    Ok(())
}

/// Resolve full filesystem path for an image (relative path under storage root).
pub fn resolve_image_path(app_handle: &tauri::AppHandle, relative_path: &str) -> Result<PathBuf, String> {
    if relative_path.contains("..") || relative_path.starts_with('/') {
        return Err("Invalid path".into());
    }
    let root = storage_root(app_handle)?;
    let full = root.join(relative_path);
    if !full.starts_with(&root) {
        return Err("Invalid path".into());
    }
    Ok(full)
}

/// Update only the title of a note (for sidebar inline edit).
pub fn update_note_title(app_handle: &tauri::AppHandle, note_id: &str, new_title: &str) -> Result<NoteMeta, String> {
    validate_note_id(note_id)?;
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let n = index.notes.iter_mut().find(|n| n.id == note_id).ok_or("Note not found")?;
    n.title = new_title.to_string();
    n.updated_at = Utc::now().to_rfc3339();
    let meta = n.clone();
    write_index(&root, &index)?;
    Ok(meta)
}

/// List all unique tags across notes, sorted.
pub fn list_tags(app_handle: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let root = storage_root(app_handle)?;
    let index = read_index(&root)?;
    let mut tags: HashSet<String> = HashSet::new();
    for n in &index.notes {
        for t in &n.tags {
            tags.insert(t.clone());
        }
    }
    let mut v: Vec<String> = tags.into_iter().collect();
    v.sort();
    Ok(v)
}

/// List notes that have the given tag.
pub fn notes_by_tag(app_handle: &tauri::AppHandle, tag: &str) -> Result<Vec<NoteMeta>, String> {
    let root = storage_root(app_handle)?;
    let index = read_index(&root)?;
    Ok(index
        .notes
        .into_iter()
        .filter(|n| n.tags.iter().any(|t| t == tag))
        .collect())
}

/// Add a tag to multiple notes (merge with existing).
pub fn add_tag_to_notes(
    app_handle: &tauri::AppHandle,
    note_ids: &[String],
    tag: &str,
) -> Result<Vec<NoteMeta>, String> {
    if note_ids.is_empty() || tag.trim().is_empty() {
        return Ok(vec![]);
    }
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let tag = tag.trim().to_string();
    let mut updated = vec![];
    for n in index.notes.iter_mut() {
        if note_ids.contains(&n.id) && !n.tags.contains(&tag) {
            n.tags.push(tag.clone());
            n.updated_at = Utc::now().to_rfc3339();
            updated.push(n.clone());
        }
    }
    write_index(&root, &index)?;
    Ok(updated)
}

/// Remove a tag from a note.
pub fn remove_tag_from_note(app_handle: &tauri::AppHandle, note_id: &str, tag: &str) -> Result<NoteMeta, String> {
    validate_note_id(note_id)?;
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let n = index.notes.iter_mut().find(|n| n.id == note_id).ok_or("Note not found")?;
    n.tags.retain(|t| t != tag);
    n.updated_at = Utc::now().to_rfc3339();
    let meta = n.clone();
    write_index(&root, &index)?;
    Ok(meta)
}

/// Delete multiple notes in one index write.
pub fn batch_delete_notes(app_handle: &tauri::AppHandle, note_ids: &[String]) -> Result<(), String> {
    if note_ids.is_empty() {
        return Ok(());
    }
    for id in note_ids {
        validate_note_id(id)?;
    }
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let ids_set: HashSet<&str> = note_ids.iter().map(|s| s.as_str()).collect();
    index.notes.retain(|n| !ids_set.contains(n.id.as_str()));
    write_index(&root, &index)?;
    for id in note_ids {
        let path = note_path(&root, id);
        let _ = fs::remove_file(&path);
        let img_dir = images_dir(&root, id);
        let _ = fs::remove_dir_all(&img_dir);
        let v_dir = versions_dir(&root, id);
        let _ = fs::remove_dir_all(&v_dir);
    }
    Ok(())
}

/// Set important flag on multiple notes.
pub fn batch_toggle_important(
    app_handle: &tauri::AppHandle,
    note_ids: &[String],
    important: bool,
) -> Result<Vec<NoteMeta>, String> {
    if note_ids.is_empty() {
        return Ok(vec![]);
    }
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let now = Utc::now().to_rfc3339();
    let ids_set: HashSet<&str> = note_ids.iter().map(|s| s.as_str()).collect();
    let mut updated = vec![];
    for n in index.notes.iter_mut() {
        if ids_set.contains(n.id.as_str()) {
            n.important = important;
            n.updated_at = now.clone();
            updated.push(n.clone());
        }
    }
    write_index(&root, &index)?;
    Ok(updated)
}

/// Duplicate a note (new id, same title + " (copy)", same body and images).
pub fn duplicate_note(app_handle: &tauri::AppHandle, note_id: &str) -> Result<NoteMeta, String> {
    let content = read_note(app_handle, note_id)?;
    let new_title = format!("{} (copy)", content.meta.title.trim());
    let meta = save_note(app_handle, None, &new_title, &content.body)?;
    if !content.meta.images.is_empty() {
        let root = storage_root(app_handle)?;
        let src_dir = images_dir(&root, note_id);
        let dest_dir = images_dir(&root, &meta.id);
        if src_dir.exists() {
            fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
            for entry in fs::read_dir(&src_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if path.is_file() {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
                    let dest = dest_dir.join(name);
                    fs::copy(&path, &dest).map_err(|e| e.to_string())?;
                }
            }
            let mut index = read_index(&root)?;
            let note = index.notes.iter_mut().find(|n| n.id == meta.id).ok_or("Note not found")?;
            let added_at = Utc::now().to_rfc3339();
            for img in &content.meta.images {
                let stored_name = Path::new(&img.path).file_name().and_then(|n| n.to_str()).unwrap_or("image");
                let relative_path = format!("images/{}/{}", meta.id, stored_name);
                note.images.push(ImageRef {
                    name: img.name.clone(),
                    path: relative_path,
                    added_at: added_at.clone(),
                    size: img.size,
                });
            }
            note.updated_at = Utc::now().to_rfc3339();
            write_index(&root, &index)?;
        }
    }
    read_note(app_handle, &meta.id).map(|c| c.meta)
}

/// Merge multiple notes: concatenate bodies (oldest first by updated_at), delete others, return merged note meta.
pub fn merge_notes(app_handle: &tauri::AppHandle, note_ids: &[String]) -> Result<NoteMeta, String> {
    if note_ids.is_empty() {
        return Err("No notes to merge".into());
    }
    if note_ids.len() == 1 {
        let root = storage_root(app_handle)?;
        let index = read_index(&root)?;
        return index
            .notes
            .into_iter()
            .find(|n| n.id == note_ids[0])
            .ok_or_else(|| "Note not found".to_string());
    }
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let mut to_merge: Vec<(String, String, String)> = vec![];
    for id in note_ids {
        let meta = index.notes.iter().find(|n| n.id == *id).ok_or("Note not found")?;
        let body = fs::read_to_string(note_path(&root, id)).unwrap_or_default();
        to_merge.push((meta.updated_at.clone(), meta.title.clone(), body));
    }
    to_merge.sort_by(|a, b| a.0.cmp(&b.0));
    let merged_title = to_merge[0].1.clone();
    let merged_body: String = to_merge
        .iter()
        .map(|(_, t, b)| format!("## {}\n\n{}\n\n", t, b))
        .collect();
    let keep_id = note_ids[0].clone();
    let remove_ids: Vec<&str> = note_ids[1..].iter().map(|s| s.as_str()).collect();
    fs::write(note_path(&root, &keep_id), merged_body.trim()).map_err(|e| e.to_string())?;
    let n = index.notes.iter_mut().find(|n| n.id == keep_id).ok_or("Note not found")?;
    n.title = merged_title;
    n.updated_at = Utc::now().to_rfc3339();
    let meta = n.clone();
    index.notes.retain(|n| !remove_ids.contains(&n.id.as_str()));
    write_index(&root, &index)?;
    for id in &note_ids[1..] {
        let _ = fs::remove_file(note_path(&root, id));
        let _ = fs::remove_dir_all(images_dir(&root, id));
    }
    Ok(meta)
}

/// Export note as plain text (title + body).
pub fn export_note(app_handle: &tauri::AppHandle, note_id: &str) -> Result<String, String> {
    let content = read_note(app_handle, note_id)?;
    Ok(format!("{}\n\n{}\n", content.meta.title, content.body))
}

/// Export note as Markdown: YAML frontmatter (optional) + # title + body. [[Title]] left as-is for compatibility.
pub fn export_note_as_markdown(app_handle: &tauri::AppHandle, note_id: &str) -> Result<String, String> {
    let content = read_note(app_handle, note_id)?;
    let mut md = String::new();
    if !content.meta.tags.is_empty() || content.meta.created_at != content.meta.updated_at {
        md.push_str("---\n");
        if !content.meta.tags.is_empty() {
            md.push_str("tags:\n");
            for t in &content.meta.tags {
                md.push_str(&format!("  - {}\n", t));
            }
        }
        md.push_str(&format!("created: {}\n", content.meta.created_at));
        md.push_str(&format!("updated: {}\n", content.meta.updated_at));
        md.push_str("---\n\n");
    }
    md.push_str(&format!("# {}\n\n", content.meta.title));
    md.push_str(&content.body);
    if !content.body.ends_with('\n') {
        md.push('\n');
    }
    Ok(md)
}

/// Write text to a file at the given path (e.g. user-chosen save path from dialog).
pub fn write_text_file(path: &str, content: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.exists() && p.is_dir() {
        return Err("Path is a directory".into());
    }
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(p, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Built-in note templates.
fn builtin_templates() -> Vec<NoteTemplate> {
    vec![
        NoteTemplate {
            id: "daily-journal".to_string(),
            name: "Daily journal".to_string(),
            body: "# Daily Journal — {{date}}\n\n## What happened today\n- \n\n## Thoughts & reflections\n- \n\n## Tomorrow\n- \n".to_string(),
            default_title_pattern: Some("Journal {{date}}".to_string()),
            is_custom: false,
        },
        NoteTemplate {
            id: "meeting-notes".to_string(),
            name: "Meeting notes".to_string(),
            body: "# Meeting: {{title}}\n\n**Date:** {{date}}\n**Attendees:** \n**Agenda:**\n- \n\n**Notes:**\n- \n\n**Action items:**\n- [ ] \n- [ ] \n".to_string(),
            default_title_pattern: Some("Meeting {{date}}".to_string()),
            is_custom: false,
        },
        NoteTemplate {
            id: "project-planning".to_string(),
            name: "Project planning".to_string(),
            body: "# Project: {{title}}\n\n## Overview\n- **Goal:** \n- **Timeline:** \n\n## Tasks\n- [ ] \n- [ ] \n\n## Notes\n- \n".to_string(),
            default_title_pattern: Some("Project".to_string()),
            is_custom: false,
        },
    ]
}

fn read_custom_templates(root: &Path) -> Result<Vec<NoteTemplate>, String> {
    let path = templates_path(root);
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut s = String::new();
    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

fn write_custom_templates(root: &Path, templates: &[NoteTemplate]) -> Result<(), String> {
    let path = templates_path(root);
    let temp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(templates).map_err(|e| e.to_string())?;
    let mut f = fs::File::create(&temp_path).map_err(|e| e.to_string())?;
    f.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    drop(f);
    fs::rename(&temp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Replace {{date}} and {{title}} in template body/title.
fn apply_template_placeholders(body: &str, title: &str) -> (String, String) {
    let now = Utc::now();
    let date = now.format("%Y-%m-%d").to_string();
    let body_out = body
        .replace("{{date}}", &date)
        .replace("{{title}}", title);
    let title_out = title
        .replace("{{date}}", &date)
        .replace("{{title}}", title);
    (body_out, title_out)
}

/// List all templates (built-in + custom).
pub fn list_templates(app_handle: &tauri::AppHandle) -> Result<Vec<NoteTemplate>, String> {
    let root = storage_root(app_handle)?;
    let custom = read_custom_templates(&root)?;
    let mut out = builtin_templates();
    out.extend(custom);
    Ok(out)
}

/// Create a new note from a template. title_override: if provided, use it; else use template default with placeholders.
pub fn create_note_from_template(
    app_handle: &tauri::AppHandle,
    template_id: &str,
    title_override: Option<&str>,
) -> Result<NoteMeta, String> {
    let root = storage_root(app_handle)?;
    let builtin = builtin_templates();
    let custom = read_custom_templates(&root)?;
    let template = builtin
        .into_iter()
        .chain(custom.into_iter())
        .find(|t| t.id == template_id)
        .ok_or_else(|| "Template not found".to_string())?;

    let default_title = template
        .default_title_pattern
        .as_deref()
        .unwrap_or("Untitled");
    let title_input = title_override.unwrap_or(default_title).trim();
    let title_input = if title_input.is_empty() { "Untitled" } else { title_input };
    let (body, title) = apply_template_placeholders(&template.body, title_input);
    save_note(app_handle, None, &title, &body)
}

/// Save a custom template (creates new with id custom-<uuid>).
pub fn save_custom_template(
    app_handle: &tauri::AppHandle,
    name: &str,
    body: &str,
) -> Result<NoteTemplate, String> {
    let root = storage_root(app_handle)?;
    let mut custom = read_custom_templates(&root)?;
    let id = format!("custom-{}", Uuid::new_v4());
    let t = NoteTemplate {
        id: id.clone(),
        name: name.to_string(),
        body: body.to_string(),
        default_title_pattern: Some(name.to_string()),
        is_custom: true,
    };
    custom.push(t.clone());
    write_custom_templates(&root, &custom)?;
    Ok(t)
}

/// Delete a custom template by id.
pub fn delete_custom_template(app_handle: &tauri::AppHandle, template_id: &str) -> Result<(), String> {
    if !template_id.starts_with("custom-") {
        return Err("Can only delete custom templates".into());
    }
    let root = storage_root(app_handle)?;
    let mut custom = read_custom_templates(&root)?;
    let len_before = custom.len();
    custom.retain(|t| t.id != template_id);
    if custom.len() == len_before {
        return Err("Template not found".into());
    }
    write_custom_templates(&root, &custom)?;
    Ok(())
}

/// Get or create today's daily note (YYYY-MM-DD), tag #daily.
pub fn get_or_create_daily_note(app_handle: &tauri::AppHandle) -> Result<NoteMeta, String> {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    if let Some(n) = index.notes.iter().find(|n| n.is_daily && n.title == today) {
        return Ok(n.clone());
    }
    let id = Uuid::new_v4().to_string();
    let filename = format!("{}.txt", id);
    let now = Utc::now().to_rfc3339();
    let meta = NoteMeta {
        id: id.clone(),
        title: today.clone(),
        created_at: now.clone(),
        updated_at: now,
        important: false,
        filename: filename.clone(),
        images: vec![],
        tags: vec!["daily".to_string()],
        links_to: vec![],
        is_daily: true,
        notebook_id: None,
    };
    index.notes.push(meta.clone());
    write_index(&root, &index)?;
    let path = note_path(&root, &id);
    fs::write(&path, "# daily\n").map_err(|e| e.to_string())?;
    Ok(meta)
}

/// Notes that link to this note (backlinks).
pub fn get_backlinks(app_handle: &tauri::AppHandle, note_id: &str) -> Result<Vec<NoteMeta>, String> {
    validate_note_id(note_id)?;
    let root = storage_root(app_handle)?;
    let index = read_index(&root)?;
    Ok(index
        .notes
        .into_iter()
        .filter(|n| n.links_to.contains(&note_id.to_string()))
        .collect())
}

/// Remove one attachment from a note.
pub fn remove_attachment(
    app_handle: &tauri::AppHandle,
    note_id: &str,
    relative_path: &str,
) -> Result<NoteMeta, String> {
    validate_note_id(note_id)?;
    if relative_path.contains("..") || relative_path.starts_with('/') {
        return Err("Invalid path".into());
    }
    let root = storage_root(app_handle)?;
    let full = root.join(relative_path);
    if full.exists() {
        let _ = fs::remove_file(&full);
    }
    let mut index = read_index(&root)?;
    let n = index.notes.iter_mut().find(|n| n.id == note_id).ok_or("Note not found")?;
    n.images.retain(|img| img.path != relative_path);
    n.updated_at = Utc::now().to_rfc3339();
    let meta = n.clone();
    write_index(&root, &index)?;
    Ok(meta)
}

/// Rename an attachment (display name only; file on disk is unchanged).
pub fn rename_attachment(
    app_handle: &tauri::AppHandle,
    note_id: &str,
    relative_path: &str,
    new_name: &str,
) -> Result<NoteMeta, String> {
    validate_note_id(note_id)?;
    if relative_path.contains("..") || relative_path.starts_with('/') {
        return Err("Invalid path".into());
    }
    let new_name = sanitize_filename(new_name.trim());
    if new_name.is_empty() {
        return Err("Name cannot be empty".into());
    }
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let n = index.notes.iter_mut().find(|n| n.id == note_id).ok_or("Note not found")?;
    if let Some(img) = n.images.iter_mut().find(|img| img.path == relative_path) {
        img.name = new_name;
    } else {
        return Err("Attachment not found".into());
    }
    n.updated_at = Utc::now().to_rfc3339();
    let meta = n.clone();
    write_index(&root, &index)?;
    Ok(meta)
}

/// GFM task list: detect lines like "- [ ]" or "- [x]" (or "*").
fn body_has_task_lines(body: &str) -> (bool, bool) {
    let mut has_unchecked = false;
    let mut has_checked = false;
    for line in body.lines() {
        let t = line.trim();
        if t.starts_with("- [ ]") || t.starts_with("* [ ]") {
            has_unchecked = true;
        }
        if t.starts_with("- [x]") || t.starts_with("- [X]") || t.starts_with("* [x]") || t.starts_with("* [X]") {
            has_checked = true;
        }
        if has_unchecked && has_checked {
            break;
        }
    }
    (has_unchecked, has_checked)
}

/// Search notes: full-text (title + body), operators tag: is:starred date:today|week|month has:attachments has:tasks is:completed is:uncompleted.
pub fn search_notes(
    app_handle: &tauri::AppHandle,
    query: &str,
) -> Result<Vec<NoteMeta>, String> {
    let root = storage_root(app_handle)?;
    let index = read_index(&root)?;
    let q = query.trim();
    if q.is_empty() {
        return Ok(index.notes);
    }
    let now = Utc::now();
    let today = now.format("%Y-%m-%d").to_string();
    let week_start = (now - chrono::Duration::days(7)).format("%Y-%m-%d").to_string();
    let month_start = (now - chrono::Duration::days(30)).format("%Y-%m-%d").to_string();
    let mut tag_filter: Option<String> = None;
    let mut starred_only = false;
    let mut date_filter: Option<String> = None; // "today" | "week" | "month"
    let mut has_attachments_only = false;
    let mut has_tasks_only = false;
    let mut task_filter: Option<bool> = None; // Some(true) = completed only, Some(false) = uncompleted only
    let mut text_parts: Vec<String> = vec![];
    for part in q.split_whitespace() {
        let part_lower = part.to_lowercase();
        if part_lower.starts_with("tag:") {
            let tag = part_lower[4..].trim().to_string();
            if !tag.is_empty() {
                tag_filter = Some(tag);
            }
        } else if part_lower == "is:starred" {
            starred_only = true;
        } else if part_lower == "date:today" {
            date_filter = Some("today".into());
        } else if part_lower == "date:week" {
            date_filter = Some("week".into());
        } else if part_lower == "date:month" {
            date_filter = Some("month".into());
        } else if part_lower == "has:attachments" {
            has_attachments_only = true;
        } else if part_lower == "has:tasks" {
            has_tasks_only = true;
        } else if part_lower == "is:completed" {
            task_filter = Some(true);
        } else if part_lower == "is:uncompleted" {
            task_filter = Some(false);
        } else {
            text_parts.push(part_lower);
        }
    }
    let mut out: Vec<NoteMeta> = index.notes.into_iter().filter(|n| {
        if let Some(ref tag) = tag_filter {
            if !n.tags.iter().any(|t| t.to_lowercase() == *tag) {
                return false;
            }
        }
        if starred_only && !n.important {
            return false;
        }
        if let Some(ref date_kind) = date_filter {
            let note_date: String = n.updated_at.chars().take(10).collect();
            let ok = match date_kind.as_str() {
                "today" => note_date == today,
                "week" => note_date >= week_start,
                "month" => note_date >= month_start,
                _ => true,
            };
            if !ok {
                return false;
            }
        }
        if has_attachments_only && n.images.is_empty() {
            return false;
        }
        if has_tasks_only || task_filter.is_some() {
            let body_path = note_path(&root, &n.id);
            let body = fs::read_to_string(&body_path).unwrap_or_default();
            let (has_unchecked, has_checked) = body_has_task_lines(&body);
            if has_tasks_only && !has_unchecked && !has_checked {
                return false;
            }
            if let Some(completed_only) = task_filter {
                if completed_only && !has_checked {
                    return false;
                }
                if !completed_only && !has_unchecked {
                    return false;
                }
            }
        }
        if text_parts.is_empty() {
            return true;
        }
        let title_lower = n.title.to_lowercase();
        let body_path = note_path(&root, &n.id);
        let body = fs::read_to_string(&body_path).unwrap_or_default().to_lowercase();
        text_parts.iter().all(|term| title_lower.contains(term) || body.contains(term))
    }).collect();
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

fn validate_notebook_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Notebook id cannot be empty".into());
    }
    if id.contains('/') || id.contains('\\') || id == "." || id == ".." {
        return Err("Invalid notebook id".into());
    }
    if id.chars().any(|c| c.is_control()) {
        return Err("Invalid notebook id".into());
    }
    Ok(())
}

/// List all notebooks (non-archived first, then archived), sorted by created_at.
pub fn list_notebooks(app_handle: &tauri::AppHandle) -> Result<Vec<Notebook>, String> {
    let root = storage_root(app_handle)?;
    let index = read_index(&root)?;
    let mut notebooks = index.notebooks.clone();
    notebooks.sort_by(|a, b| {
        let a_archived = a.archived as u8;
        let b_archived = b.archived as u8;
        a_archived.cmp(&b_archived).then_with(|| a.created_at.cmp(&b.created_at))
    });
    Ok(notebooks)
}

/// Create a new notebook. Name must be non-empty.
pub fn create_notebook(app_handle: &tauri::AppHandle, name: &str) -> Result<Notebook, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Notebook name cannot be empty".into());
    }
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let id = Uuid::new_v4().to_string();
    validate_notebook_id(&id)?;
    let now = Utc::now().to_rfc3339();
    let notebook = Notebook {
        id: id.clone(),
        name: name.to_string(),
        archived: false,
        created_at: now.clone(),
    };
    index.notebooks.push(notebook.clone());
    write_index(&root, &index)?;
    Ok(notebook)
}

/// Move a note into a notebook. Use None to move to unfiled.
pub fn move_note_to_notebook(
    app_handle: &tauri::AppHandle,
    note_id: &str,
    notebook_id: Option<&str>,
) -> Result<NoteMeta, String> {
    validate_note_id(note_id)?;
    if let Some(nid) = notebook_id {
        validate_notebook_id(nid)?;
    }
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    if let Some(nid) = notebook_id {
        if !index.notebooks.iter().any(|nb| nb.id == nid) {
            return Err("Notebook not found".into());
        }
    }
    let n = index.notes.iter_mut().find(|n| n.id == note_id).ok_or("Note not found")?;
    n.notebook_id = notebook_id.map(String::from);
    n.updated_at = Utc::now().to_rfc3339();
    let meta = n.clone();
    write_index(&root, &index)?;
    Ok(meta)
}

/// Archive or unarchive a notebook.
pub fn archive_notebook(
    app_handle: &tauri::AppHandle,
    notebook_id: &str,
    archived: bool,
) -> Result<Notebook, String> {
    validate_notebook_id(notebook_id)?;
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let nb = index.notebooks.iter_mut().find(|n| n.id == notebook_id).ok_or("Notebook not found")?;
    nb.archived = archived;
    let notebook = nb.clone();
    write_index(&root, &index)?;
    Ok(notebook)
}

/// Rename a notebook.
pub fn update_notebook_name(
    app_handle: &tauri::AppHandle,
    notebook_id: &str,
    new_name: &str,
) -> Result<Notebook, String> {
    let new_name = new_name.trim();
    if new_name.is_empty() {
        return Err("Notebook name cannot be empty".into());
    }
    validate_notebook_id(notebook_id)?;
    let root = storage_root(app_handle)?;
    let mut index = read_index(&root)?;
    let nb = index.notebooks.iter_mut().find(|n| n.id == notebook_id).ok_or("Notebook not found")?;
    nb.name = new_name.to_string();
    let notebook = nb.clone();
    write_index(&root, &index)?;
    Ok(notebook)
}

// --- Sync & Backup ---

fn sync_config_path(root: &Path) -> PathBuf {
    meta_dir(root).join("sync_config.json")
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct SyncConfig {
    #[serde(rename = "syncFolder")]
    sync_folder: Option<String>,
}

fn read_sync_config(root: &Path) -> SyncConfig {
    let path = sync_config_path(root);
    if !path.exists() {
        return SyncConfig::default();
    }
    let s = fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&s).unwrap_or_default()
}

fn write_sync_config(root: &Path, config: &SyncConfig) -> Result<(), String> {
    let path = sync_config_path(root);
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Get the configured sync folder (e.g. iCloud Drive or Dropbox path).
pub fn get_sync_folder(app_handle: &tauri::AppHandle) -> Result<Option<String>, String> {
    let root = storage_root(app_handle)?;
    Ok(read_sync_config(&root).sync_folder)
}

/// Set the sync folder. Pass None to clear.
pub fn set_sync_folder(app_handle: &tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    let root = storage_root(app_handle)?;
    let mut config = read_sync_config(&root);
    config.sync_folder = path;
    write_sync_config(&root, &config)
}

/// Copy a directory recursively into dest (creates dest if needed).
fn copy_dir_all(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let dest_path = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), &dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Export full backup to target_dir (notes/, meta/, images/). Target dir is created if needed.
pub fn export_backup(app_handle: &tauri::AppHandle, target_dir: &str) -> Result<(), String> {
    let root = storage_root(app_handle)?;
    let target = Path::new(target_dir);
    if !root.exists() {
        return Err("App storage does not exist".into());
    }
    let notes_src = notes_dir(&root);
    let meta_src = meta_dir(&root);
    let images_src = root.join("images");
    let notes_dest = target.join("notes");
    let meta_dest = target.join("meta");
    let images_dest = target.join("images");
    fs::create_dir_all(&notes_dest).map_err(|e| e.to_string())?;
    fs::create_dir_all(&meta_dest).map_err(|e| e.to_string())?;
    fs::create_dir_all(&images_dest).map_err(|e| e.to_string())?;
    if notes_src.exists() {
        copy_dir_all(&notes_src, &notes_dest)?;
    }
    if meta_src.exists() {
        copy_dir_all(&meta_src, &meta_dest)?;
    }
    if images_src.exists() {
        copy_dir_all(&images_src, &images_dest)?;
    }
    Ok(())
}

/// Import backup from source_dir (copies notes/, meta/, images/ into app storage; overwrites).
pub fn import_backup(app_handle: &tauri::AppHandle, source_dir: &str) -> Result<(), String> {
    let root = storage_root(app_handle)?;
    let source = Path::new(source_dir);
    if !source.exists() || !source.is_dir() {
        return Err("Source backup directory does not exist".into());
    }
    let notes_src = source.join("notes");
    let meta_src = source.join("meta");
    let images_src = source.join("images");
    let notes_dest = notes_dir(&root);
    let meta_dest = meta_dir(&root);
    let images_dest = root.join("images");
    fs::create_dir_all(&notes_dest).map_err(|e| e.to_string())?;
    fs::create_dir_all(&meta_dest).map_err(|e| e.to_string())?;
    fs::create_dir_all(&images_dest).map_err(|e| e.to_string())?;
    if notes_src.exists() {
        copy_dir_all(&notes_src, &notes_dest)?;
    }
    if meta_src.exists() {
        copy_dir_all(&meta_src, &meta_dest)?;
    }
    if images_src.exists() {
        copy_dir_all(&images_src, &images_dest)?;
    }
    Ok(())
}

/// List version history for a note (edit timeline), newest first.
pub fn list_note_versions(app_handle: &tauri::AppHandle, note_id: &str) -> Result<Vec<NoteVersionItem>, String> {
    validate_note_id(note_id)?;
    let root = storage_root(app_handle)?;
    let v_dir = versions_dir(&root, note_id);
    if !v_dir.exists() {
        return Ok(vec![]);
    }
    let mut items = vec![];
    for entry in fs::read_dir(&v_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let s = fs::read_to_string(&path).unwrap_or_default();
        if let Ok(snapshot) = serde_json::from_str::<VersionSnapshot>(&s) {
            let preview_len = 150;
            let body_preview = if snapshot.body.len() <= preview_len {
                snapshot.body.clone()
            } else {
                format!("{}…", &snapshot.body[..preview_len])
            };
            items.push(NoteVersionItem {
                saved_at: snapshot.saved_at,
                title: snapshot.title,
                body_preview,
            });
        }
    }
    items.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(items)
}

/// Get full content of a specific version (by its saved_at timestamp).
pub fn get_note_version(
    app_handle: &tauri::AppHandle,
    note_id: &str,
    saved_at: &str,
) -> Result<NoteVersionContent, String> {
    validate_note_id(note_id)?;
    let root = storage_root(app_handle)?;
    let v_dir = versions_dir(&root, note_id);
    let v_name = version_filename(saved_at);
    let v_path = v_dir.join(&v_name);
    if !v_path.exists() {
        return Err("Version not found".into());
    }
    let s = fs::read_to_string(&v_path).map_err(|e| e.to_string())?;
    let snapshot: VersionSnapshot = serde_json::from_str(&s).map_err(|e| e.to_string())?;
    Ok(NoteVersionContent {
        saved_at: snapshot.saved_at,
        title: snapshot.title,
        body: snapshot.body,
    })
}

/// Restore a note to a previous version (overwrites current content and saves).
pub fn restore_note_version(
    app_handle: &tauri::AppHandle,
    note_id: &str,
    saved_at: &str,
) -> Result<NoteMeta, String> {
    let content = get_note_version(app_handle, note_id, saved_at)?;
    save_note(app_handle, Some(note_id), &content.title, &content.body)
}
