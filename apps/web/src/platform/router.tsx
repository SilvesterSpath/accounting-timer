import type { ReactNode } from "react";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { detectAppMode } from "./config";

/** HashRouter for desktop app:// loads; BrowserRouter for web. */
export function AppRouter({ children }: { children: ReactNode }) {
  if (detectAppMode() === "desktop") {
    return <HashRouter>{children}</HashRouter>;
  }
  return <BrowserRouter>{children}</BrowserRouter>;
}
