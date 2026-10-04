/**
 * useDraftForm — auto-saves form state to localStorage as the user types.
 *
 * Usage:
 *   const { form, setForm, hasDraft, clearDraft, DraftBanner } = useDraftForm({
 *     key: "lead_edit_123",
 *     initialData: serverData ?? {},
 *   });
 *
 * - `form` / `setForm` replace your normal useState pair
 * - Every setForm call auto-saves to localStorage
 * - On mount, if a draft exists it is restored and `hasDraft` is true
 * - Call `clearDraft()` on successful save or cancel
 * - `DraftBanner` is a ready-made amber banner component to show when hasDraft && !editing
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface UseDraftFormOptions<T> {
  /** Unique localStorage key — include the record id to avoid cross-record bleed */
  key: string;
  /** The initial/server data to fall back to when no draft exists */
  initialData: T | null | undefined;
  /** Optional predicate for forms whose persisted empty state is not a real draft. */
  isMeaningfulDraft?: (data: T) => boolean;
  /** If true, skip draft logic entirely (e.g. readOnly views) */
  disabled?: boolean;
}

interface UseDraftFormReturn<T> {
  form: T;
  setForm: React.Dispatch<React.SetStateAction<T>>;
  hasDraft: boolean;
  /** True after localStorage has been checked for the active key. */
  isReady: boolean;
  clearDraft: () => void;
  /** Call this when the server data has loaded so the form is initialised */
  initFromServer: (data: T) => void;
}

export function useDraftForm<T extends object>({
  key,
  initialData,
  isMeaningfulDraft,
  disabled = false,
}: UseDraftFormOptions<T>): UseDraftFormReturn<T> {
  const [form, setFormRaw] = useState<T>((initialData ?? {}) as T);
  const [hasDraft, setHasDraft] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const draftRestoredRef = useRef(false);
  const activeKeyRef = useRef(key);

  // A record/scope key can change while a reusable form component remains
  // mounted. Reset only the hook lifecycle for that new identity so a prior
  // record's draft is never retained or restored under the new key.
  useEffect(() => {
    if (activeKeyRef.current === key) return;
    activeKeyRef.current = key;
    draftRestoredRef.current = false;
    setHasDraft(false);
    setIsReady(false);
    setFormRaw((initialData ?? {}) as T);
  }, [key, initialData]);

  // On mount: restore draft if one exists
  useEffect(() => {
    if (disabled) {
      setIsReady(false);
      return;
    }
    if (draftRestoredRef.current) {
      setIsReady(true);
      return;
    }
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as T;
        if (isMeaningfulDraft && !isMeaningfulDraft(parsed)) {
          localStorage.removeItem(key);
        } else {
          setFormRaw(parsed);
          setHasDraft(true);
          draftRestoredRef.current = true;
          toast.info("Unsaved draft restored.", {
            description: "Your previous changes have been restored. Save when ready.",
          });
        }
      }
    } catch {} finally {
      setIsReady(true);
    }
  }, [key, disabled, isMeaningfulDraft]);

  // setForm wrapper that also writes to localStorage
  const setForm = useCallback(
    (updater: React.SetStateAction<T>) => {
      setFormRaw((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (prev: T) => T)(prev)
            : updater;
        if (!disabled) {
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch {}
        }
        return next;
      });
    },
    [key, disabled]
  );

  // Initialise from server data (call when query data arrives, if no draft)
  const initFromServer = useCallback(
    (data: T) => {
      if (draftRestoredRef.current) return; // draft takes priority
      setFormRaw(data);
      draftRestoredRef.current = true;
    },
    []
  );

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {}
    setHasDraft(false);
    draftRestoredRef.current = false;
  }, [key]);

  return { form, setForm, hasDraft, isReady, clearDraft, initFromServer };
}

/** Amber banner shown when a draft exists but the form is not open */
export function DraftBanner({
  hasDraft,
  onDiscard,
  onResume,
}: {
  hasDraft: boolean;
  onDiscard: () => void;
  onResume?: () => void;
}) {
  if (!hasDraft) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300 text-xs">
      <span>You have unsaved changes from a previous session.</span>
      <div className="flex items-center gap-3 shrink-0">
        {onResume && (
          <button
            type="button"
            onClick={onResume}
            className="font-medium underline hover:no-underline"
          >
            Resume editing
          </button>
        )}
        <button
          type="button"
          onClick={onDiscard}
          className="underline hover:no-underline"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
