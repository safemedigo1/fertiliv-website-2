export const LINKED_DEVICE_ACTIVE_SESSION_STATES = [
  "creating_session",
  "waiting_for_qr",
  "qr_ready",
  "linking",
  "connected",
  "reconnecting",
] as const;

export function isLinkedDeviceSessionActive(state: string | null | undefined): boolean {
  return state !== null
    && state !== undefined
    && (LINKED_DEVICE_ACTIVE_SESSION_STATES as readonly string[]).includes(state);
}

export function isLinkedDeviceLineDeletable(
  lifecycleState: string | null | undefined,
  sessionState: string | null | undefined,
): boolean {
  return !isLinkedDeviceSessionActive(lifecycleState) && !isLinkedDeviceSessionActive(sessionState);
}
