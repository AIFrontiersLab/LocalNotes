# Local Notes

**Privacy-first notes on your Mac.** Everything stays on your machine—no cloud, no account, no sync.

A desktop app built with **Tauri 2** (Rust) and **React + TypeScript**, storing notes and images locally with a fast, searchable index.

---

## Interface overview

The app uses a **three-panel layout** with a light, minimal theme.

### Main window

- **Header** — Window title “Local Notes”, **View** menu, calendar (e.g. today’s date), and **New** button with dropdown for creating notes (including from templates).
- **Left sidebar**
  - **Search** — “Search in content…” for full-text search across notes.
  - **Filters** — Tag and Date dropdowns, plus an Attachments checkbox.
  - **STARRED** — “No starred notes” when empty; shows starred notes when present.
  - **TASKS** — “All” dropdown and list of tasks (e.g. “Meeting 2026-02-20”) with star icons.
  - **DAILY** — Today’s date and “Today” for the daily note.
  - **TAGS** — All tags (e.g. `#2026-02-20`, `#meeting-2026-02-20`, `#myfirstone`, `#testing`, `#welcome`); click to filter.
  - **NOTEBOOKS** — **UNFILED** and other notebooks (e.g. “MyFirstOne”, “Welcome”) with star icons.
- **Central panel** — When no note is selected: “Select a note from the sidebar or create a new one,” plus shortcuts: **⌘N** new note, **⌘S** save, **⌘K** command palette, **⌘⇧F** focus mode.
- **Right panel** — Note details; shows “Select a note to see details” until a note is selected.

### Custom templates modal

Opened from **New ▾ → Manage templates…** (or equivalent). Used to define and manage reusable note templates.

- **Add template**
  - **Template name** — Text field (e.g. “custom template”).
  - **Template body** — Multi-line area with hint: “Template body (use {{date}} and {{title}} as placeholders)”.
  - **Add template** — Button to save the new template.
- **Your templates** — List of existing templates (e.g. “Daily Log”, “daily log”) each with a **Delete** button.
- **Close** — “X” in the top-right to dismiss the modal.

---

## Features

### Notes & editing
- **Create and edit notes** — Plain-text `.txt` files with auto-save (300ms debounce)
- **Rich formatting** — Toolbar for bold, headings, lists, code; Markdown in body
- **Note linking** — `[[Note Title]]` creates links; backlinks shown in the inspector
- **Image attachments** — Drag & drop or Attach button; thumbnails, Open/Remove; stored in app data
- **Version history** — Restore previous versions; last 30 per note; timeline in inspector

### Tags (clickable & smart)
- **Tag input in note header** — Add or remove tags via chips and an “Add tag…” field
- **Click to filter** — Click any tag in the sidebar or inspector to filter notes
- **Auto-suggestions** — Dropdown suggests existing tags and “Create #tagname” for new ones
- **Smart tags** — `#tag` in the body plus an auto slug from the note title (e.g. “Project Alpha” → `project-alpha`)
- **Sidebar Tags section** — All tags listed; click to filter; hint when empty

### Search & organization
- **Full-text search** — 150ms debounce; operators: `tag:xyz`, `is:starred`, `date:today`; match highlight
- **Starred notes** — Mark important; “Important” section in sidebar
- **Daily notes** — ⌘⇧D opens or creates today’s note (YYYY-MM-DD), auto-tagged `#daily`
- **Notebooks** — Group notes into notebooks; expandable sidebar section
- **Tasks** — Filter by `has:tasks`, `is:completed`, `is:uncompleted`

### Templates
- **New from template** — “New ▾” dropdown: Blank note, Daily journal, Meeting notes, Project planning, or custom
- **Custom templates** — Add templates with `{{date}}` and `{{title}}` placeholders; manage in “Manage templates…”

### UI & shortcuts
- **Resizable sidebar** — Important, Tags, All Notes, Recently Edited, Notebooks; state persisted
- **Inline rename** — Double-click a note title in the sidebar to edit (Enter / Esc)
- **Focus mode** — ⌘⇧F hides sidebar and toolbar; centered editor (max 720px)
- **Command palette** — ⌘K: new note, from template, jump to note, focus mode, search
- **Inspector** — Word count, reading time, last edited, tags (clickable), backlinks, attachments; toggle in toolbar
- **View density** — Compact, Comfortable, Spacious (persisted)

### Data & security
- **Local only** — All data under `~/Library/Application Support/LocalPrivateNotes/`
- **Safe storage** — Sanitized filenames, no directory traversal, atomic metadata writes

---

## Storage layout

```
~/Library/Application Support/LocalPrivateNotes/
├── notes/
│   └── <noteId>.txt
├── versions/
│   └── <noteId>/
│       └── <timestamp>.json   # last 30 per note
├── meta/
│   └── index.json
└── images/
    └── <noteId>/
        └── <timestamp>-<filename>.<ext>
```

---

## Prerequisites (macOS)

| Requirement | How to get it |
|-------------|----------------|
| **Node.js** (v18 or v20 LTS) | [nodejs.org](https://nodejs.org/) or `brew install node` |
| **Rust** | [rustup.rs](https://rustup.rs/): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Tauri / system** | Xcode Command Line Tools: `xcode-select --install` |

---

## Quick start

```bash
# Clone and enter the project
cd LocalNotes

# Install dependencies
npm install

# Run in development (Vite + Tauri window)
npm run tauri dev

# Build production app
npm run tauri build
```

The built app is in `src-tauri/target/release/` (and the `.app` bundle on macOS).

### First-time build: icons

If the build complains about missing icons:

```bash
# Use a 1024×1024 PNG as app icon
npm run tauri icon app-icon.png
```

This generates `src-tauri/icons/` and updates the bundle.

---

## Scripts

| Command | Description |
|---------|--------------|
| `npm run dev` | Vite dev server only (no Tauri window) |
| `npm run build` | TypeScript + Vite build |
| `npm run tauri dev` | Full dev: Rust + frontend with hot reload |
| `npm run tauri build` | Production Tauri build |
| `npm test` | Run frontend tests (Vitest) |
| `npm run lint` | ESLint |

**Rust tests:** `cd src-tauri && cargo test`

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| **⌘N** | New note |
| **⌘S** | Manual save (auto-save also runs with debounce) |
| **⌘K** | Command palette |
| **⌘⇧F** | Toggle focus mode |
| **⌘⇧D** | Open or create today’s daily note |

---

## Tech stack

| Layer | Tech |
|-------|------|
| **Desktop** | Tauri 2 |
| **Backend** | Rust (storage, search, commands) |
| **Frontend** | Vite, React 18, TypeScript |
| **Styling** | Tailwind CSS |
| **Plugins** | `tauri-plugin-dialog` (file picker), `tauri-plugin-opener` (open files in system apps) |

---

## License

MIT (or your choice).
