/**
 * MonitoringAgent — runs silently on staff/manager devices.
 *
 * Uses SSE (Server-Sent Events) for real-time signal delivery instead of polling.
 * - Connects to /api/monitoring/events/:userId?deviceId=xxx
 * - When admin sends a "request" signal: silently captures media and sends WebRTC offer back.
 * - NO toasts, NO notifications, NO visible UI shown to the employee.
 * - Employee already accepted company policy at login — no further prompts.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

type MonitoringType = "camera" | "microphone" | "screen";

interface ActiveSession {
  sessionKey: string;
  adminUserId: number;
  adminDeviceId: string;
  type: MonitoringType;
  pc: RTCPeerConnection;
  stream: MediaStream;
}

function getDeviceId(): string {
  const key = "fertiliv_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

/**
 * Reorder SDP codecs to prefer H264 — required for iOS Safari compatibility.
 * iOS Safari only supports H264 for WebRTC video; VP8/VP9 produce a black screen.
 */
function preferH264(sdp: string): string {
  return sdp
    .split("\r\n")
    .reduce((lines: string[], line) => {
      // Find m=video line and reorder payload types to put H264 first
      if (line.startsWith("m=video")) {
        const parts = line.split(" ");
        const header = parts.slice(0, 3); // m=video <port> <proto>
        const payloads = parts.slice(3);
        // Find H264 payload types from rtpmap lines already collected
        const h264Payloads: string[] = [];
        const otherPayloads: string[] = [];
        // We'll do a two-pass: first collect H264 pt from rtpmap, then reorder
        // Simple approach: just move any payload whose rtpmap contains H264 to front
        // Since we don't have rtpmap yet, we do a full-string scan approach:
        const fullSdp = lines.join("\r\n");
        payloads.forEach(pt => {
          if (fullSdp.includes(`a=rtpmap:${pt} H264`) || fullSdp.includes(`a=rtpmap:${pt} h264`)) {
            h264Payloads.push(pt);
          } else {
            otherPayloads.push(pt);
          }
        });
        const reordered = [...h264Payloads, ...otherPayloads];
        lines.push([...header, ...reordered].join(" "));
      } else {
        lines.push(line);
      }
      return lines;
    }, [])
    .join("\r\n");
}

function hasConsent(): boolean {
  const stored = localStorage.getItem("fertiliv_monitoring_consent_v1");
  if (!stored) return false;
  // Banner stores JSON: { userId, consentedAt, permissions }
  // Legacy: may be stored as the string "granted"
  if (stored === "granted") return true;
  try { const parsed = JSON.parse(stored); return !!parsed?.consentedAt; } catch { return false; }
}

export function MonitoringAgent() {
  const { user } = useAuth();
  const activeSessions = useRef<Map<string, ActiveSession>>(new Map());
  const sseRef = useRef<EventSource | null>(null);
  const deviceId = useRef<string>(getDeviceId());

  const sendSignal = useCallback(async (toUserId: number, toDeviceId: string, signal: object) => {
    try {
      await fetch("/api/monitoring/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId, toDeviceId, signal }),
      });
    } catch {
      // Silent
    }
  }, []);

  const stopSession = useCallback((sessionKey: string) => {
    const session = activeSessions.current.get(sessionKey);
    if (!session) return;
    try { session.stream.getTracks().forEach(t => t.stop()); } catch {}
    try { session.pc.close(); } catch {}
    activeSessions.current.delete(sessionKey);
  }, []);

  const handleRequest = useCallback(
    async (adminUserId: number, adminDeviceId: string, monitorType: MonitoringType) => {
      const sessionKey = `${adminUserId}-${adminDeviceId}-${monitorType}`;

      // Don't start duplicate sessions
      if (activeSessions.current.has(sessionKey)) return;

      let stream: MediaStream;
      try {
        if (monitorType === "camera") {
          // Request video with audio track included so admin can hear ambient sound.
          // On mobile, video constraints must be relaxed for compatibility.
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: true,
          }).catch(() =>
            // Fallback: video only if audio fails (some mobile browsers)
            navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
          );
        } else if (monitorType === "microphone") {
          stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
        } else if (monitorType === "screen") {
          if (!(navigator.mediaDevices as any).getDisplayMedia) return;
          // displaySurface: "monitor" pre-selects "Entire Screen" tab in the browser picker.
          // The user still sees the picker (browser security requirement) but needs
          // fewer clicks. Audio capture from screen is not requested (causes echo).
          stream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: { displaySurface: "monitor" },
            audio: false,
          });
        } else {
          return;
        }
      } catch {
        // Silently fail — do not notify employee
        return;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add all tracks to the peer connection
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Send ICE candidates to admin as they arrive
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(adminUserId, adminDeviceId, {
            type: "ice-candidate",
            monitorType,
            candidate: event.candidate.toJSON(),
            fromDeviceId: deviceId.current,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "disconnected" || state === "failed" || state === "closed") {
          stopSession(sessionKey);
        }
      };

      // Create offer — apply H264 preference for iOS Safari compatibility
      const offer = await pc.createOffer();
      const h264Offer = new RTCSessionDescription({
        type: offer.type,
        sdp: preferH264(offer.sdp ?? ""),
      });
      await pc.setLocalDescription(h264Offer);

      // Wait for ICE gathering with a longer timeout for mobile networks
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") { resolve(); return; }
        const timeout = setTimeout(resolve, 4000); // 4s for mobile
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === "complete") { clearTimeout(timeout); resolve(); }
        };
      });

      // Send offer to admin
      const finalOffer = pc.localDescription!;
      await sendSignal(adminUserId, adminDeviceId, {
        type: "offer",
        monitorType,
        sdp: finalOffer.sdp,
        sdpType: finalOffer.type,
        fromDeviceId: deviceId.current,
      });

      activeSessions.current.set(sessionKey, {
        sessionKey,
        adminUserId,
        adminDeviceId,
        type: monitorType,
        pc,
        stream,
      });
    },
    [sendSignal, stopSession],
  );

  const handleAnswer = useCallback(async (
    adminUserId: number,
    adminDeviceId: string,
    monitorType: string,
    sdp: string,
    sdpType: string
  ) => {
    const sessionKey = `${adminUserId}-${adminDeviceId}-${monitorType}`;
    const session = activeSessions.current.get(sessionKey);
    if (!session) return;
    try {
      await session.pc.setRemoteDescription(
        new RTCSessionDescription({ sdp, type: sdpType as RTCSdpType })
      );
    } catch {
      // Silent
    }
  }, []);

  const handleIceFromAdmin = useCallback(async (
    adminUserId: number,
    adminDeviceId: string,
    monitorType: string,
    candidate: RTCIceCandidateInit
  ) => {
    const sessionKey = `${adminUserId}-${adminDeviceId}-${monitorType}`;
    const session = activeSessions.current.get(sessionKey);
    if (!session) return;
    try {
      await session.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "staff" && user.role !== "manager") return;
    if (!hasConsent()) return;

    const userId = user.id;
    const dId = deviceId.current;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    function clearTimers() {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    }

    function connect() {
      // Clear any pending reconnect before opening a new connection
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

      const sse = new EventSource(`/api/monitoring/events/${userId}?deviceId=${encodeURIComponent(dId)}`);
      sseRef.current = sse;

      // ── Client-side ping every 20s ──────────────────────────────────────────
      // Keeps the SSE connection alive even when the tab is in the background.
      // Also acts as a presence heartbeat so the server knows the device is online.
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (sseRef.current?.readyState === EventSource.OPEN) {
          // Fire-and-forget ping — server just needs to see the connection is alive
          fetch(`/api/monitoring/ping?userId=${userId}&deviceId=${encodeURIComponent(dId)}`, {
            method: "GET",
            keepalive: true,
          }).catch(() => {});
        } else if (sseRef.current?.readyState === EventSource.CLOSED) {
          // SSE closed unexpectedly — reconnect
          connect();
        }
      }, 20000);

      sse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type !== "signal" || !msg.signal) return;
          if (msg.fromRole !== "admin") return;

          const sig = msg.signal;
          const adminUserId: number = msg.fromUserId;
          const adminDeviceId: string = sig.adminDeviceId || "admin";

          switch (sig.type) {
            case "request":
              if (sig.monitorType) {
                handleRequest(adminUserId, adminDeviceId, sig.monitorType as MonitoringType);
              }
              break;
            case "answer":
              if (sig.sdp && sig.sdpType && sig.monitorType) {
                handleAnswer(adminUserId, adminDeviceId, sig.monitorType, sig.sdp, sig.sdpType);
              }
              break;
            case "ice-candidate":
              if (sig.candidate && sig.monitorType) {
                handleIceFromAdmin(adminUserId, adminDeviceId, sig.monitorType, sig.candidate);
              }
              break;
            case "stop":
              if (sig.monitorType) {
                const key = `${adminUserId}-${adminDeviceId}-${sig.monitorType}`;
                stopSession(key);
              } else {
                for (const key of Array.from(activeSessions.current.keys())) {
                  if (key.startsWith(`${adminUserId}-${adminDeviceId}`)) {
                    stopSession(key);
                  }
                }
              }
              break;
          }
        } catch {
          // Silent
        }
      };

      sse.onerror = () => {
        sse.close();
        sseRef.current = null;
        // Fast reconnect: 1s (was 5s) — reduces offline appearance duration
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (sseRef.current === null) connect();
          }, 1000);
        }
      };
    }

    connect();

    // ── Page Visibility API ──────────────────────────────────────────────────
    // When user switches back to this tab, immediately reconnect if SSE dropped.
    // This is the main fix for "appears offline when working in another tab".
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (!sseRef.current || sseRef.current.readyState === EventSource.CLOSED) {
          connect();
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // ── Online event ─────────────────────────────────────────────────────────
    // Reconnect immediately when network comes back online.
    function handleOnline() {
      if (!sseRef.current || sseRef.current.readyState === EventSource.CLOSED) {
        connect();
      }
    }
    window.addEventListener("online", handleOnline);

    return () => {
      clearTimers();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      sseRef.current?.close();
      sseRef.current = null;
      for (const key of Array.from(activeSessions.current.keys())) {
        stopSession(key);
      }
    };
  }, [user, handleRequest, handleAnswer, handleIceFromAdmin, stopSession]);

  // Renders nothing — pure silent background agent
  return null;
}
