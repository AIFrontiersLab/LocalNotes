import React, { createContext, useCallback, useContext, useState } from "react";
import {
  getStoredAiPanelOpen,
  getStoredDensity,
  getStoredSidebarSections,
  getStoredSidebarWidth,
  getStoredTasksFilter,
  setStoredAiPanelOpen,
  setStoredDensity,
  setStoredSidebarSections,
  setStoredSidebarWidth,
  setStoredTasksFilter,
  type Density,
  type SidebarSections,
  type TasksCompletedFilter,
} from "./store";

interface AppContextValue {
  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;
  sidebarSections: SidebarSections;
  setSidebarSection: (key: keyof SidebarSections, open: boolean) => void;
  density: Density;
  setDensity: (d: Density) => void;
  focusMode: boolean;
  setFocusMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (v: boolean) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  tagFilter: string | null;
  setTagFilter: (tag: string | null) => void;
  tasksCompletedFilter: TasksCompletedFilter;
  setTasksCompletedFilter: (f: TasksCompletedFilter) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;
  aiPanelOpen: boolean;
  setAiPanelOpen: (v: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidthState] = useState(getStoredSidebarWidth());
  const [sidebarSections, setSidebarSectionsState] = useState(getStoredSidebarSections());
  const [density, setDensityState] = useState<Density>(getStoredDensity());
  const [focusMode, setFocusMode] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tasksCompletedFilter, setTasksCompletedFilterState] = useState<TasksCompletedFilter>(getStoredTasksFilter());
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpenState] = useState(getStoredAiPanelOpen());

  const setTasksCompletedFilter = useCallback((f: TasksCompletedFilter) => {
    setTasksCompletedFilterState(f);
    setStoredTasksFilter(f);
  }, []);

  const setSidebarWidth = useCallback((w: number) => {
    const v = Math.min(400, Math.max(180, w));
    setSidebarWidthState(v);
    setStoredSidebarWidth(v);
  }, []);

  const setSidebarSection = useCallback((key: keyof SidebarSections, open: boolean) => {
    setSidebarSectionsState((s) => {
      const next = { ...s, [key]: open };
      setStoredSidebarSections(next);
      return next;
    });
  }, []);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    setStoredDensity(d);
  }, []);

  const setSelectedIdsFn = useCallback((ids: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setSelectedIds((prev) => (typeof ids === "function" ? ids(prev) : new Set(ids)));
  }, []);

  const setAiPanelOpen = useCallback((v: boolean) => {
    setAiPanelOpenState(v);
    setStoredAiPanelOpen(v);
  }, []);

  const value: AppContextValue = {
    sidebarWidth,
    setSidebarWidth,
    sidebarSections,
    setSidebarSection,
    density,
    setDensity,
    focusMode,
    setFocusMode,
    inspectorOpen,
    setInspectorOpen,
    selectedIds,
    setSelectedIds: setSelectedIdsFn,
    tagFilter,
    setTagFilter,
    tasksCompletedFilter,
    setTasksCompletedFilter,
    commandPaletteOpen,
    setCommandPaletteOpen,
    aiPanelOpen,
    setAiPanelOpen,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
