"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";

const KEY = "rframe.panelCollapsed";

// localStorage can throw (private mode, blocked site data): the panel then just
// keeps its state for the session.
function readStored(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "true" ? true : v === "false" ? false : null;
  } catch {
    return null;
  }
}

/** Collapsed state of the context panel; defaults to expanded, except on the video review route. */
export function usePanelCollapsed(): [boolean, (v: boolean) => void] {
  const pathname = usePathname();
  const [stored, setStored] = useState<boolean | null>(readStored);

  const setCollapsed = useCallback((v: boolean) => {
    setStored(v);
    try {
      window.localStorage.setItem(KEY, String(v));
    } catch {
      // session-only
    }
  }, []);

  const onVideoReview = /\/projects\/[^/]+\/videos\//.test(pathname);
  return [stored ?? onVideoReview, setCollapsed];
}
