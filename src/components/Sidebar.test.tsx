import React from "react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./Sidebar";
import { AppProvider } from "../AppContext";

const defaultProps = {
  notes: [],
  notebooks: [],
  selectedId: null,
  selectedIds: new Set<string>(),
  onSelect: vi.fn(),
  onSelectMulti: vi.fn(),
  onNewNote: vi.fn(),
  searchContent: "",
  onSearchContentChange: vi.fn(),
  searchTag: null,
  onSearchTagChange: vi.fn(),
  searchDate: "" as "" | "today" | "week" | "month",
  onSearchDateChange: vi.fn(),
  searchAttachments: false,
  onSearchAttachmentsChange: vi.fn(),
  tagFilter: null,
  onTagFilter: vi.fn(),
  taskNotes: [],
  tasksCompletedFilter: "all" as const,
  onTasksCompletedFilterChange: vi.fn(),
  onRefresh: vi.fn(),
};

function renderWithProvider(ui: React.ReactElement) {
  return render(<AppProvider>{ui}</AppProvider>);
}

describe("Sidebar", () => {
  it("renders app title and Starred / Tasks sections", () => {
    renderWithProvider(<Sidebar {...defaultProps} />);
    expect(screen.getByText("Local Notes")).toBeInTheDocument();
    expect(screen.getByText("Starred")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });

  it("shows New button and calls onNewNote when clicked", async () => {
    const onNewNote = vi.fn();
    renderWithProvider(<Sidebar {...defaultProps} onNewNote={onNewNote} />);
    const newDropdownBtn = screen.getByRole("button", { name: /new\s*▾/i });
    await userEvent.click(newDropdownBtn);
    const blankNoteBtn = screen.getByRole("button", { name: "Blank note" });
    await userEvent.click(blankNoteBtn);
    expect(onNewNote).toHaveBeenCalledTimes(1);
  });

  it("shows important and normal notes in the list", () => {
    const notes = [
      {
        id: "1",
        title: "Important one",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        important: true,
        filename: "1.txt",
        images: [],
      },
      {
        id: "2",
        title: "Normal one",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        important: false,
        filename: "2.txt",
        images: [],
      },
    ];
    renderWithProvider(<Sidebar {...defaultProps} notes={notes} />);
    expect(screen.getAllByText("Important one").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Normal one").length).toBeGreaterThan(0);
  });
});
