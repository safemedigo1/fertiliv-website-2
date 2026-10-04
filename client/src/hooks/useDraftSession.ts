/**
 * useDraftSession — manages a draft session for a Health Record edit.
 *
 * Phase 2 Final Correction:
 * - On edit-open, calls `initDraftSession` to get a SERVER-ISSUED `activeWriterToken`.
 *   The token is INDEPENDENT of `draftSessionId` — it is a separate UUID generated
 *   and owned by the server.
 * - All draft mutations (Upload, Remove, AI, Touch, Save, Cancel) receive BOTH
 *   `draftSessionId` and `activeWriterToken`.
 * - On Takeover, calls `takeoverDraftSession` which atomically rotates the token
 *   on the server. The old token is immediately revoked (overwritten with REVOKED-*).
 * - `initDraftSession` rejects terminal states (saved/cancelled/expired) — client
 *   must generate a new `draftSessionId` (crypto.randomUUID()) for a new session.
 * - BroadcastChannel cross-tab lock: only one tab may be write-active at a time.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const LOCK_CHANNEL_PREFIX = "intake-draft-lock";
const SESSION_KEY_PREFIX = "draft-session";

/** Minimum interval between touchDraftSession server calls (5 minutes) */
const TOUCH_THROTTLE_MS = 5 * 60 * 1000;

export type DraftSessionState = {
  /** Stable UUID for this edit session. Null until initialized. */
  draftSessionId: string | null;
  /**
   * Server-issued writer token. INDEPENDENT of draftSessionId.
   * Null until initDraftSession completes.
   * Must be passed to every draft mutation.
   */
  activeWriterToken: string | null;
  /** True if this tab currently holds the write lock AND has a valid server token. */
  isWriteActive: boolean;
  /** True while initDraftSession or takeoverDraftSession is in flight. */
  isInitializing: boolean;
  /**
   * True once the lock negotiation has completed (either this tab won or was denied).
   * False during the initial 150ms negotiation window.
   * Use this to suppress the "Another tab" warning during startup — only show the
   * warning when lockDecisionMade=true AND isWriteActive=false.
   */
  lockDecisionMade: boolean;
  /** Call to explicitly release the lock (e.g. on Cancel or Save). */
  releaseLock: () => void;
  /**
   * Take over the lock from another tab (admin override).
   * Calls takeoverDraftSession on the server to rotate the token.
   */
  takeLock: () => void;
  /**
   * Call when meaningful activity occurs (field change, file upload).
   * Throttled to at most once per 5 minutes — renews the 24h expiry window.
   */
  touchSession: () => void;
};

export function useDraftSession(
  mode: "lead" | "patient",
  id: number | null | undefined
): DraftSessionState {
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);
  const [activeWriterToken, setActiveWriterToken] = useState<string | null>(null);
  const [isWriteActive, setIsWriteActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  /**
   * Starts false; set to true once the BroadcastChannel lock negotiation resolves
   * (either this tab wins the lock or is denied by another tab).
   * Prevents the "Another tab is editing" banner from flashing during the 150ms
   * negotiation window when no real competing tab exists.
   */
  const [lockDecisionMade, setLockDecisionMade] = useState(false);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const writerTokenRef = useRef<string | null>(null);
  const lastTouchRef = useRef<number>(0);
  const isWriteActiveRef = useRef<boolean>(false);

  const channelName = mode && id ? `${LOCK_CHANNEL_PREFIX}-${mode}-${id}` : null;
  const storageKey = mode && id ? `${SESSION_KEY_PREFIX}-${mode}-${id}` : null;

  // tRPC mutations
  const initMutation = mode === "lead"
    ? trpc.leads.initDraftSession.useMutation()
    : trpc.patients.initDraftSession.useMutation();

  const takeoverMutation = mode === "lead"
    ? trpc.leads.takeoverDraftSession.useMutation()
    : trpc.patients.takeoverDraftSession.useMutation();

  const touchMutation = mode === "lead"
    ? trpc.leads.touchDraftSession.useMutation()
    : trpc.patients.touchDraftSession.useMutation();

  /**
   * Call initDraftSession on the server to get a server-issued activeWriterToken.
   * This is called once when this tab acquires the write lock.
   */
  const initSession = useCallback(async (sid: string) => {
    setIsInitializing(true);
    try {
      const result = await initMutation.mutateAsync({
        draftSessionId: sid,
        ...(mode === "lead" ? { leadId: id ?? undefined } : { patientId: id ?? undefined }),
      } as any);
      const token = result.activeWriterToken;
      writerTokenRef.current = token;
      setActiveWriterToken(token);
    } catch (err: any) {
      // Terminal session — clear stored ID so next open generates a fresh one
      if (storageKey) localStorage.removeItem(storageKey);
      toast.error(err?.message ?? "Your draft session has expired. Please refresh to start a new edit.");
      setIsWriteActive(false);
      isWriteActiveRef.current = false;
    } finally {
      setIsInitializing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, id, storageKey]);

  const releaseLock = useCallback(() => {
    if (channelRef.current && sessionIdRef.current) {
      try {
        channelRef.current.postMessage({ type: "release", sessionId: sessionIdRef.current });
      } catch {
        // Channel may be closed
      }
    }
    setIsWriteActive(false);
    isWriteActiveRef.current = false;
  }, []);

  /**
   * Take over the write lock from another tab.
   * Calls takeoverDraftSession on the server to atomically rotate the token.
   * The old token is immediately revoked (REVOKED-* prefix written to DB).
   */
  const takeLock = useCallback(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    if (channelRef.current) {
      try {
        channelRef.current.postMessage({ type: "takeover", sessionId: sid });
      } catch {
        // Channel may be closed
      }
    }
    isWriteActiveRef.current = true;
    setIsWriteActive(true);
    setLockDecisionMade(true);

    // Rotate the server token — old token is immediately revoked
    setIsInitializing(true);
    takeoverMutation.mutateAsync({ draftSessionId: sid })
      .then((result) => {
        const newToken = result.activeWriterToken;
        writerTokenRef.current = newToken;
        setActiveWriterToken(newToken);
      })
      .catch((err: any) => {
        toast.error(err?.message ?? "Could not take over the session. Please refresh.");
        setIsWriteActive(false);
        isWriteActiveRef.current = false;
      })
      .finally(() => setIsInitializing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Renew the 24h expiry window on the server.
   * Throttled: at most once per 5 minutes per tab.
   * Only fires when this tab holds the write lock and has a valid server token.
   */
  const touchSession = useCallback(() => {
    const sid = sessionIdRef.current;
    const token = writerTokenRef.current;
    if (!sid || !token || !isWriteActiveRef.current) return;
    const now = Date.now();
    if (now - lastTouchRef.current < TOUCH_THROTTLE_MS) return;
    lastTouchRef.current = now;
    touchMutation.mutate({ draftSessionId: sid, activeWriterToken: token });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!channelName || !storageKey || !id) return;

    // Restore or generate session ID
    let sid = localStorage.getItem(storageKey);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(storageKey, sid);
    }
    sessionIdRef.current = sid;
    setDraftSessionId(sid);

    // Set up BroadcastChannel for cross-tab coordination
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(channelName);
      channelRef.current = channel;
    } catch {
      // BroadcastChannel not supported — fall back to single-tab mode
      isWriteActiveRef.current = true;
      setIsWriteActive(true);
      setLockDecisionMade(true);
      // Initialize session immediately in single-tab mode
      initSession(sid);
      return;
    }

    // Announce this tab wants the lock
    let lockGranted = false;
    const lockRequestTimeout = setTimeout(() => {
      // No other tab responded — we have the lock
      if (!lockGranted) {
        lockGranted = true;
        isWriteActiveRef.current = true;
        setIsWriteActive(true);
        setLockDecisionMade(true);
        channel?.postMessage({ type: "lock-acquired", sessionId: sid });
        // Call initDraftSession to get the server-issued token
        initSession(sid!);
      }
    }, 150);

    channel.postMessage({ type: "lock-request", sessionId: sid });

    channel.onmessage = (event) => {
      const { type, sessionId } = event.data ?? {};

      if (type === "lock-request" && sessionId !== sid) {
        // Another tab is requesting the lock — if we hold it, deny it
        if (lockGranted) {
          channel?.postMessage({ type: "lock-denied", sessionId });
        }
      }

      if (type === "lock-denied" && sessionId === sid) {
        // Our lock request was denied — another tab holds the lock
        clearTimeout(lockRequestTimeout);
        lockGranted = false;
        isWriteActiveRef.current = false;
        setIsWriteActive(false);
        setLockDecisionMade(true);
      }

      if (type === "lock-acquired" && sessionId !== sid) {
        // Another tab acquired the lock — we lose write access
        clearTimeout(lockRequestTimeout);
        lockGranted = false;
        isWriteActiveRef.current = false;
        setIsWriteActive(false);
        setLockDecisionMade(true);
      }

      if (type === "release" && sessionId !== sid) {
        // The lock-holding tab released — we can now try to acquire
        setTimeout(() => {
          if (!lockGranted) {
            lockGranted = true;
            isWriteActiveRef.current = true;
            setIsWriteActive(true);
            setLockDecisionMade(true);
            channel?.postMessage({ type: "lock-acquired", sessionId: sid });
            // Get a fresh server token for this tab
            initSession(sid!);
          }
        }, 50 + Math.random() * 100); // small jitter to avoid race
      }

      if (type === "takeover") {
        // Another tab is forcibly taking over — yield immediately
        lockGranted = false;
        isWriteActiveRef.current = false;
        setIsWriteActive(false);
        setLockDecisionMade(true);
        // Revoke our local token — server has already rotated it
        writerTokenRef.current = null;
        setActiveWriterToken(null);
      }
    };

    return () => {
      clearTimeout(lockRequestTimeout);
      if (lockGranted) {
        try {
          channel?.postMessage({ type: "release", sessionId: sid });
        } catch {
          // ignore
        }
      }
      try {
        channel?.close();
      } catch {
        // ignore
      }
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, storageKey, id]);

  return { draftSessionId, activeWriterToken, isWriteActive, isInitializing, lockDecisionMade, releaseLock, takeLock, touchSession };
}

/**
 * Clear the stored draft session ID for a given Health Record.
 * Call after a successful Save or explicit Cancel.
 * The next edit open will generate a new draftSessionId.
 */
export function clearDraftSession(mode: "lead" | "patient", id: number) {
  const storageKey = `${SESSION_KEY_PREFIX}-${mode}-${id}`;
  localStorage.removeItem(storageKey);
}
