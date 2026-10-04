import { useEffect } from "react";

/**
 * Shows the native browser "Leave site? Changes you made may not be saved."
 * dialog when the user tries to close/refresh the tab or navigate away,
 * but only when `isDirty` is true.
 *
 * Usage:
 *   useBeforeUnload(isEditing && hasChanges);
 */
export function useBeforeUnload(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers require returnValue to be set (even to empty string)
      // to trigger the native confirmation dialog.
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
