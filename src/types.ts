export interface ImageRef {
  name: string;
  path: string;
  addedAt: string;
  /** File size in bytes, if known. */
  size?: number;
}

export interface NoteMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  important: boolean;
  filename: string;
  images: ImageRef[];
  tags?: string[];
  linksTo?: string[];
  isDaily?: boolean;
  notebookId?: string | null;
}

export interface Notebook {
  id: string;
  name: string;
  archived?: boolean;
  createdAt: string;
}

export interface NoteContent {
  meta: NoteMeta;
  body: string;
}

export interface NoteVersionItem {
  savedAt: string;
  title: string;
  bodyPreview: string;
}

export interface NoteVersionContent {
  savedAt: string;
  title: string;
  body: string;
}

export interface NoteTemplate {
  id: string;
  name: string;
  body: string;
  defaultTitlePattern?: string;
  isCustom?: boolean;
}
