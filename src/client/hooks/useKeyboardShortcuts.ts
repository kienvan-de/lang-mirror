import { useEffect } from "react";

type ShortcutMap = Partial<Record<string, () => void>>;

interface UseKeyboardShortcutsOptions {
  shortcuts: ShortcutMap;
  enabled?: boolean;
}

/** Registers document-level keydown shortcuts that skip input/textarea/select targets. */
export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Don't fire inside text inputs
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      // Build a normalized key string: "shift+a", "arrowleft", "space", etc.
      let key = e.key.toLowerCase();
      if (key === " ") key = "space";
      if (e.shiftKey && key !== "shift") key = `shift+${key}`;

      const action = shortcuts[key];
      if (action) {
        e.preventDefault();
        action();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts, enabled]);
}
