import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SIDEBAR_MIN = 260;
export const SIDEBAR_DEFAULT = 380;

/** The sidebar may take up to half of the viewport. */
export function maxSidebarWidth(): number {
  return Math.max(SIDEBAR_MIN, Math.floor(window.innerWidth / 2));
}

export function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(maxSidebarWidth(), width));
}

interface UiState {
  mirror: boolean;
  showCandidates: boolean;
  keepPose: boolean;
  sidebarWidth: number;
  setMirror(value: boolean): void;
  setShowCandidates(value: boolean): void;
  setKeepPose(value: boolean): void;
  setSidebarWidth(value: number): void;
}

export const useUiStore = create<UiState>()(persist((set) => ({
  mirror: false,
  showCandidates: true,
  keepPose: false,
  sidebarWidth: SIDEBAR_DEFAULT,
  setMirror: (mirror) => set({ mirror }),
  setShowCandidates: (showCandidates) => set({ showCandidates }),
  setKeepPose: (keepPose) => set({ keepPose }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: clampSidebarWidth(sidebarWidth) }),
}), { name: "camosaic-ui" }));
