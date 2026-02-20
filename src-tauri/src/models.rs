use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRef {
    pub name: String,
    pub path: String,
    #[serde(rename = "addedAt")]
    pub added_at: String,
    /// File size in bytes, if known.
    #[serde(default)]
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub important: bool,
    pub filename: String,
    pub images: Vec<ImageRef>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default, rename = "linksTo")]
    pub links_to: Vec<String>,
    #[serde(default, rename = "isDaily")]
    pub is_daily: bool,
    #[serde(default, rename = "notebookId")]
    pub notebook_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notebook {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub archived: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexFile {
    pub notes: Vec<NoteMeta>,
    #[serde(default)]
    pub notebooks: Vec<Notebook>,
}

impl Default for IndexFile {
    fn default() -> Self {
        Self {
            notes: vec![],
            notebooks: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteContent {
    pub meta: NoteMeta,
    pub body: String,
}

/// Single version entry in the edit timeline (for listing).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteVersionItem {
    #[serde(rename = "savedAt")]
    pub saved_at: String,
    pub title: String,
    #[serde(rename = "bodyPreview")]
    pub body_preview: String,
}

/// Full content of a past version (for preview/restore).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteVersionContent {
    #[serde(rename = "savedAt")]
    pub saved_at: String,
    pub title: String,
    pub body: String,
}

/// Stored version file format (saved_at, title, body).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionSnapshot {
    #[serde(rename = "savedAt")]
    pub saved_at: String,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteTemplate {
    pub id: String,
    pub name: String,
    pub body: String,
    #[serde(default, rename = "defaultTitlePattern")]
    pub default_title_pattern: Option<String>,
    /// true for user-created templates
    #[serde(default, rename = "isCustom")]
    pub is_custom: bool,
}
