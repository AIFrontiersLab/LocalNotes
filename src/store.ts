export type Density = "compact" | "comfortable" | "spacious";

const SIDEBAR_WIDTH_KEY = "localnotes-sidebar-width";
const SIDEBAR_SECTIONS_KEY = "localnotes-sidebar-sections";
const DENSITY_KEY = "localnotes-density";
const AI_PANEL_OPEN_KEY = "localnotes-ai-panel-open";

export const defaultSections = {
  important: true,
  tasks: true,
  allNotes: true,
  tags: true,
  recentlyEdited: true,
};

export type TasksCompletedFilter = "all" | "uncompleted" | "completed";
const TASKS_FILTER_KEY = "localnotes-tasks-filter";

export function getStoredTasksFilter(): TasksCompletedFilter {
  try {
    const v = localStorage.getItem(TASKS_FILTER_KEY);
    if (v === "uncompleted" || v === "completed") return v;
    return "all";
  } catch {
    return "all";
  }
}

export function setStoredTasksFilter(f: TasksCompletedFilter) {
  try {
    localStorage.setItem(TASKS_FILTER_KEY, f);
  } catch {}
}

export type SidebarSections = typeof defaultSections;

export function getStoredSidebarWidth(): number {
  try {
    const w = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return w ? Math.min(400, Math.max(180, Number(w))) : 256;
  } catch {
    return 256;
  }
}

export function setStoredSidebarWidth(w: number) {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.min(400, Math.max(180, w))));
  } catch {}
}

export function getStoredSidebarSections(): SidebarSections {
  try {
    const s = localStorage.getItem(SIDEBAR_SECTIONS_KEY);
    if (!s) return defaultSections;
    const parsed = JSON.parse(s) as Partial<SidebarSections>;
    return { ...defaultSections, ...parsed };
  } catch {
    return defaultSections;
  }
}

export function setStoredSidebarSections(s: SidebarSections) {
  try {
    localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(s));
  } catch {}
}

export function getStoredDensity(): Density {
  try {
    const d = localStorage.getItem(DENSITY_KEY) as Density | null;
    return d === "compact" || d === "spacious" ? d : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function setStoredDensity(d: Density) {
  try {
    localStorage.setItem(DENSITY_KEY, d);
  } catch {}
}

export function getStoredAiPanelOpen(): boolean {
  try {
    const v = localStorage.getItem(AI_PANEL_OPEN_KEY);
    return v === "true";
  } catch {
    return false;
  }
}

export function setStoredAiPanelOpen(open: boolean) {
  try {
    localStorage.setItem(AI_PANEL_OPEN_KEY, String(open));
  } catch {}
}
