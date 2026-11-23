import { Outlet } from "@tanstack/react-router";

export function AppLayout() {
  return <main className="min-h-dvh min-w-80 bg-zinc-900 text-zinc-100 antialiased selection:bg-blue-500/35"><Outlet /></main>;
}
