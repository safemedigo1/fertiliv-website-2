/**
 * MonitoringPage — Admin-only remote monitoring dashboard.
 *
 * SSE-based WebRTC signaling flow:
 * 1. Admin connects to SSE at /api/monitoring/events/:adminId?deviceId=<adminDeviceId>
 * 2. Admin clicks Camera/Mic/Screen for an employee device.
 * 3. Admin sends "request" signal to employee via POST /api/monitoring/signal.
 * 4. Employee's MonitoringAgent captures media, sends "offer" SDP back to admin.
 * 5. Admin receives offer via SSE → creates RTCPeerConnection → sends "answer".
 * 6. ICE candidates exchanged via SSE → stream arrives via ontrack.
 * 7. StreamVideoPlayer binds the stream to a <video> element via useEffect.
 *
 * Device selector: shows per-employee device picker when employee has
 * multiple devices (laptop + mobile) connected simultaneously.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { fmtDateTime } from "@/lib/dateFormat";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Monitor, Camera, Mic, Shield, Clock, Settings, Eye, AlertTriangle,
  Laptop, Smartphone, Wifi, WifiOff, RefreshCw, StopCircle, ScreenShare,
} from "lucide-react";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

type MonitoringType = "camera" | "microphone" | "screen";

// ─── Device info from /api/monitoring/devices ─────────────────────────────────
interface DeviceInfo {
  userId: number;
  userName: string;
  userRole: string;
  deviceId: string;
  deviceInfo: string;
  browser: string;
  os: string;
  isMobile: boolean;
  connectedAt: number;
  isLive: boolean;  // true = active SSE; false = grace period (recently seen)
}

// ─── Active stream entry ───────────────────────────────────────────────────────
interface ActiveStream {
  /** Key: `${employeeId}-${employeeDeviceId}-${type}` */
  streamKey: string;
  employeeId: number;
  employeeName: string;
  employeeDeviceId: string;
  deviceInfo: string;
  type: MonitoringType;
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  status: "waiting" | "streaming" | "error";
}

// ─── H264 codec preference ───────────────────────────────────────────────────
// iOS Safari only supports H264 for WebRTC video. Reorder SDP payloads so
// H264 is listed first — this ensures iOS can decode the incoming stream.
function preferH264(sdp: string): string {
  const lines = sdp.split("\r\n");
  const h264Pts: string[] = [];
  lines.forEach(line => {
    const m = line.match(/^a=rtpmap:(\d+) [Hh]264/);
    if (m) h264Pts.push(m[1]);
  });
  return lines
    .map(line => {
      if (!line.startsWith("m=video")) return line;
      const parts = line.split(" ");
      const header = parts.slice(0, 3);
      const payloads = parts.slice(3);
      const h264 = payloads.filter(p => h264Pts.includes(p));
      const rest = payloads.filter(p => !h264Pts.includes(p));
      return [...header, ...h264, ...rest].join(" ");
    })
    .join("\r\n");
}

// ─── Admin device ID ───────────────────────────────────────────────────────────
function getAdminDeviceId(): string {
  const key = "fertiliv_admin_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "admin-" + crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

// ─── StreamVideoPlayer ────────────────────────────────────────────────────────
// iOS/Safari rules:
// 1. <video> MUST have muted=true for autoplay to work (iOS policy)
// 2. <video> MUST have playsInline to avoid fullscreen takeover
// 3. Never toggle muted after play() — breaks video rendering on iOS
// 4. <audio> for mic: must be in DOM (not display:none), use opacity:0
function StreamVideoPlayer({ stream, type }: { stream: MediaStream | null; type: MonitoringType }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    if (type === "microphone") {
      const el = audioRef.current;
      if (!el || !stream) return;
      el.srcObject = stream;
      el.volume = 1.0;
      // Do NOT set muted — audio must play unmuted
      el.play()
        .then(() => setAudioUnlocked(true))
        .catch(() => setAudioUnlocked(false));
    } else {
      const el = videoRef.current;
      if (!el || !stream) return;
      // Assign srcObject only if changed to avoid re-render flicker
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      // muted stays true (set via JSX attribute) — required for iOS autoplay
      el.play().catch(() => {});
    }
  }, [stream, type]);

  function unlockAudio() {
    const el = audioRef.current;
    if (!el) return;
    el.play().then(() => setAudioUnlocked(true)).catch(() => {});
  }

  if (type === "microphone") {
    return (
      <div className="w-full h-48 bg-gray-900 rounded flex flex-col items-center justify-center gap-3">
        <div className="flex items-end gap-1 h-10">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="w-2 bg-green-400 rounded-sm animate-pulse"
              style={{ height: `${20 + (i % 5) * 15}%`, animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
        <p className="text-green-400 text-sm font-mono">🎙 Audio stream active</p>
        {!audioUnlocked && stream && (
          <button
            onClick={unlockAudio}
            className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
          >
            Click to enable audio
          </button>
        )}
        {/* opacity:0 keeps element in DOM — required for browser autoplay policy */}
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
        />
      </div>
    );
  }

  // Video (camera or screen)
  // muted=true is REQUIRED for iOS autoplay — do not remove
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full rounded bg-gray-900"
      style={{ minHeight: "200px", maxHeight: "400px", objectFit: "contain" }}
    />
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (user && user.role !== "admin") navigate("/");
  }, [user, navigate]);

  // Admin's persistent device ID
  const adminDeviceId = useRef<string>(getAdminDeviceId());

  // Active WebRTC streams: streamKey → ActiveStream
  const activeStreamsRef = useRef<Map<string, ActiveStream>>(new Map());
  const [activeStreams, setActiveStreams] = useState<Map<string, ActiveStream>>(new Map());

  // Online employee devices from /api/monitoring/devices
  const [onlineDevices, setOnlineDevices] = useState<DeviceInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  // Per-employee selected device: userId → deviceId
  const [selectedDevices, setSelectedDevices] = useState<Map<number, string>>(new Map());

  // SSE connection ref
  const sseRef = useRef<EventSource | null>(null);

  // tRPC queries
  const { data: settings, refetch: refetchSettings } = trpc.monitoring.getSettings.useQuery();
  const { data: auditLog = [] } = trpc.monitoring.getAuditLog.useQuery({ limit: 50 });
  const updateSettingsMutation = trpc.monitoring.updateSettings.useMutation({
    onSuccess: () => { refetchSettings(); toast.success("Settings updated"); },
    onError: () => toast.error("Failed to update settings"),
  });
  const startSessionMutation = trpc.monitoring.startSession.useMutation();
  const endSessionMutation = trpc.monitoring.endSession.useMutation();

  // ─── Fetch online devices ────────────────────────────────────────────────────
  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const res = await fetch("/api/monitoring/devices");
      if (res.ok) {
        const data = await res.json();
        setOnlineDevices(data.devices ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    // Poll every 3s (was 10s) — faster detection of online/offline state changes
    const interval = setInterval(fetchDevices, 3000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  // ─── Send signal to a device ─────────────────────────────────────────────────
  const sendSignal = useCallback(async (toUserId: number, toDeviceId: string, signal: object) => {
    try {
      await fetch("/api/monitoring/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId, toDeviceId, signal }),
      });
    } catch {
      toast.error("Failed to send signal");
    }
  }, []);

  // ─── Update stream state ─────────────────────────────────────────────────────
  const updateStream = useCallback((streamKey: string, updates: Partial<ActiveStream>) => {
    const existing = activeStreamsRef.current.get(streamKey);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    activeStreamsRef.current.set(streamKey, updated);
    setActiveStreams(new Map(activeStreamsRef.current));
  }, []);

  // ─── Stop a stream ───────────────────────────────────────────────────────────
  const stopStream = useCallback(async (streamKey: string) => {
    const s = activeStreamsRef.current.get(streamKey);
    if (!s) return;

    // Tell employee to stop
    await sendSignal(s.employeeId, s.employeeDeviceId, {
      type: "stop",
      monitorType: s.type,
      adminDeviceId: adminDeviceId.current,
    });

    // Close peer connection
    try { s.pc.close(); } catch {}

    activeStreamsRef.current.delete(streamKey);
    setActiveStreams(new Map(activeStreamsRef.current));
  }, [sendSignal]);

  // ─── SSE connection for admin ────────────────────────────────────────────────
  useEffect(() => {
    if (!user || user.role !== "admin") return;

    const adminId = user.id;
    const dId = adminDeviceId.current;

    function connect() {
      const sse = new EventSource(
        `/api/monitoring/events/${adminId}?deviceId=${encodeURIComponent(dId)}`
      );
      sseRef.current = sse;

      sse.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type !== "signal" || !msg.signal) return;

          const sig = msg.signal;
          const fromUserId: number = msg.fromUserId;
          const fromDeviceId: string = sig.fromDeviceId || "default";
          const monitorType: MonitoringType = sig.monitorType;
          const streamKey = `${fromUserId}-${fromDeviceId}-${monitorType}`;

          if (sig.type === "offer" && sig.sdp && sig.sdpType) {
            // Employee sent WebRTC offer → create answer
            const existingStream = activeStreamsRef.current.get(streamKey);
            if (!existingStream) return; // Ignore offers for sessions we didn't start

            const pc = existingStream.pc;

            await pc.setRemoteDescription(
              new RTCSessionDescription({ sdp: sig.sdp, type: sig.sdpType as RTCSdpType })
            );
            const answer = await pc.createAnswer();
            // Apply H264 preference in answer for iOS Safari compatibility
            const h264Answer = new RTCSessionDescription({
              type: answer.type,
              sdp: preferH264(answer.sdp ?? ""),
            });
            await pc.setLocalDescription(h264Answer);

            // Send answer back to employee
            await sendSignal(fromUserId, fromDeviceId, {
              type: "answer",
              monitorType,
              sdp: h264Answer.sdp,
              sdpType: h264Answer.type,
              adminDeviceId: dId,
            });

          } else if (sig.type === "ice-candidate" && sig.candidate) {
            const existingStream = activeStreamsRef.current.get(streamKey);
            if (existingStream) {
              try {
                await existingStream.pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
              } catch {}
            }
          }
        } catch {
          // Silent
        }
      };

      sse.onerror = () => {
        sse.close();
        sseRef.current = null;
        setTimeout(() => { if (sseRef.current === null) connect(); }, 5000);
      };
    }

    connect();

    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [user, sendSignal]);

  // ─── Start monitoring ────────────────────────────────────────────────────────
  const startMonitoring = useCallback(async (device: DeviceInfo, type: MonitoringType) => {
    const streamKey = `${device.userId}-${device.deviceId}-${type}`;

    if (activeStreamsRef.current.has(streamKey)) {
      toast.info("Already monitoring this stream");
      return;
    }

    // Log session in DB
    let dbSessionId: number | null = null;
    try {
      const result = await startSessionMutation.mutateAsync({
        employeeId: device.userId,
        monitoringType: type,
      });
      dbSessionId = result.sessionId;
    } catch (err: any) {
      toast.error("Failed to start session: " + (err?.message ?? "Unknown error"));
      return;
    }

    // Create peer connection
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Accumulate all incoming tracks into one MediaStream.
    // ontrack fires once per track — event.streams[0] may be undefined on mobile.
    // Building our own stream guarantees all tracks (audio+video) are present.
    const incomingStream = new MediaStream();
    pc.ontrack = (event) => {
      incomingStream.addTrack(event.track);
      updateStream(streamKey, { stream: incomingStream, status: "streaming" });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(device.userId, device.deviceId, {
          type: "ice-candidate",
          monitorType: type,
          candidate: event.candidate.toJSON(),
          adminDeviceId: adminDeviceId.current,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "disconnected" || state === "failed" || state === "closed") {
        updateStream(streamKey, { status: "error" });
        if (dbSessionId) endSessionMutation.mutate({ sessionId: dbSessionId });
        activeStreamsRef.current.delete(streamKey);
        setActiveStreams(new Map(activeStreamsRef.current));
      }
    };

    const newStream: ActiveStream = {
      streamKey,
      employeeId: device.userId,
      employeeName: device.userName,
      employeeDeviceId: device.deviceId,
      deviceInfo: device.deviceInfo,
      type,
      pc,
      stream: null,
      status: "waiting",
    };

    activeStreamsRef.current.set(streamKey, newStream);
    setActiveStreams(new Map(activeStreamsRef.current));

    // Send request to employee device — they will respond with an offer
    await sendSignal(device.userId, device.deviceId, {
      type: "request",
      monitorType: type,
      adminDeviceId: adminDeviceId.current,
    });
  }, [startSessionMutation, endSessionMutation, sendSignal, updateStream]);

  // ─── Group devices by user ───────────────────────────────────────────────────
  const devicesByUser = onlineDevices.reduce((acc, device) => {
    if (!acc[device.userId]) acc[device.userId] = [];
    acc[device.userId].push(device);
    return acc;
  }, {} as Record<number, DeviceInfo[]>);

  const streamList = Array.from(activeStreams.values());

  if (!user || user.role !== "admin") return null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <Shield className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Remote Monitoring</h1>
            <p className="text-sm text-muted-foreground">Admin-only — Company device monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {streamList.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              {streamList.length} Active Session{streamList.length > 1 ? "s" : ""}
            </Badge>
          )}
          <Badge variant="outline" className="gap-1">
            <Wifi className="h-3 w-3 text-green-500" />
            {onlineDevices.length} device{onlineDevices.length !== 1 ? "s" : ""} online
          </Badge>
        </div>
      </div>

      {/* Policy notice */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800">
          <strong>Company Policy:</strong> Monitoring is for company-owned devices only. All sessions are logged.
          Doctors and patients are excluded. Only Staff and Manager accounts can be monitored.
        </div>
      </div>

      <Tabs defaultValue="monitor">
        <TabsList>
          <TabsTrigger value="monitor" className="gap-2">
            <Eye className="h-4 w-4" /> Live Monitor
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" /> Settings
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <Clock className="h-4 w-4" /> Audit Log
          </TabsTrigger>
        </TabsList>

        {/* ── Live Monitor ── */}
        <TabsContent value="monitor" className="space-y-6 mt-4">

          {/* Active streams */}
          {streamList.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Active Streams</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {streamList.map(s => (
                  <Card key={s.streamKey} className="border-red-200 overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            s.status === "streaming" ? "bg-green-500 animate-pulse" :
                            s.status === "error" ? "bg-red-500" : "bg-yellow-500 animate-pulse"
                          }`} />
                          <CardTitle className="text-sm">{s.employeeName}</CardTitle>
                          <Badge variant="outline" className="text-xs capitalize">{s.type}</Badge>
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]">{s.deviceInfo}</span>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => stopStream(s.streamKey)}
                        >
                          <StopCircle className="h-3 w-3 mr-1" />Stop
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {s.status === "waiting" ? (
                        <div className="w-full h-48 bg-gray-900 flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="h-6 w-6 text-white/50 animate-spin" />
                          <p className="text-white/50 text-sm">Waiting for stream from employee...</p>
                        </div>
                      ) : s.status === "error" ? (
                        <div className="w-full h-48 bg-gray-900 flex items-center justify-center">
                          <p className="text-red-400 text-sm">Connection failed</p>
                        </div>
                      ) : (
                        <StreamVideoPlayer stream={s.stream} type={s.type} />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Employee list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Employees (Staff &amp; Manager)</h2>
              <Button variant="outline" size="sm" onClick={fetchDevices} disabled={loadingDevices}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingDevices ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {onlineDevices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <WifiOff className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No employees currently online</p>
                <p className="text-xs mt-1">Employees must be logged in and have accepted the company policy</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(devicesByUser).map(([userIdStr, devices]) => {
                  const userId = parseInt(userIdStr);
                  const firstDevice = devices[0];
                  const selectedDeviceId = selectedDevices.get(userId) || devices[0]?.deviceId;
                  const selectedDevice = devices.find(d => d.deviceId === selectedDeviceId) || devices[0];

                  // A user card is "fully live" only if ALL selected device(s) have isLive=true.
                  // If any device is in grace period, show yellow indicator.
                  const cardIsLive = selectedDevice?.isLive ?? false;

                  return (
                    <Card key={userId} className={`border-l-4 ${cardIsLive ? "border-l-green-500" : "border-l-yellow-400"}`}>
                      <CardContent className="pt-4">
                        {/* Employee header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {/* Status dot: green = live SSE, yellow = grace period */}
                            <div
                              title={cardIsLive ? "Active — live connection" : "Recently active — reconnecting..."}
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                cardIsLive
                                  ? "bg-green-500 animate-pulse"
                                  : "bg-yellow-400 animate-pulse"
                              }`}
                            />
                            <div>
                              <p className="font-medium text-sm">{firstDevice.userName}</p>
                              <Badge variant="secondary" className="text-xs mt-1 capitalize">{firstDevice.userRole}</Badge>
                            </div>
                          </div>
                          <div className={`flex items-center gap-1 text-xs ${cardIsLive ? "text-green-600" : "text-yellow-600"}`}>
                            {cardIsLive ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                            {devices.length} device{devices.length > 1 ? "s" : ""}
                          </div>
                        </div>

                        {/* Device selector (shown when employee has multiple devices) */}
                        {devices.length > 1 ? (
                          <div className="mb-3">
                            <Label className="text-xs text-muted-foreground mb-1 block">Select device:</Label>
                            <Select
                              value={selectedDeviceId}
                              onValueChange={(val) =>
                                setSelectedDevices(prev => new Map(prev).set(userId, val))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {devices.map(d => (
                                  <SelectItem key={d.deviceId} value={d.deviceId}>
                                    <div className="flex items-center gap-2">
                                      {d.isMobile
                                        ? <Smartphone className="h-3 w-3 shrink-0" />
                                        : <Laptop className="h-3 w-3 shrink-0" />
                                      }
                                      <span className="truncate">{d.deviceInfo}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mb-3">
                            {firstDevice.isMobile
                              ? <Smartphone className="h-3 w-3 text-muted-foreground" />
                              : <Laptop className="h-3 w-3 text-muted-foreground" />
                            }
                            <span className="text-xs text-muted-foreground truncate">{firstDevice.deviceInfo}</span>
                          </div>
                        )}

                        {/* Monitor buttons */}
                        <div className="flex flex-wrap gap-2">
                          {(!settings || settings.cameraEnabled) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs h-8"
                              onClick={() => selectedDevice && startMonitoring(selectedDevice, "camera")}
                              disabled={!selectedDevice}
                            >
                              <Camera className="h-3 w-3" /> Camera
                            </Button>
                          )}
                          {(!settings || settings.microphoneEnabled) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs h-8"
                              onClick={() => selectedDevice && startMonitoring(selectedDevice, "microphone")}
                              disabled={!selectedDevice}
                            >
                              <Mic className="h-3 w-3" /> Mic
                            </Button>
                          )}
                          {(!settings || settings.screenEnabled) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs h-8"
                              onClick={() => selectedDevice && startMonitoring(selectedDevice, "screen")}
                              disabled={!selectedDevice}
                            >
                              <ScreenShare className="h-3 w-3" /> Screen
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Settings ── */}
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Monitoring Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "screenEnabled", label: "Screen Monitoring", description: "Allow live screen sharing from employee devices", icon: Monitor },
                { key: "screenshotEnabled", label: "Periodic Screenshots", description: "Capture screenshots at regular intervals", icon: Monitor },
                { key: "cameraEnabled", label: "Camera Access", description: "Allow remote camera access from employee devices", icon: Camera },
                { key: "microphoneEnabled", label: "Microphone Access", description: "Allow remote microphone access from employee devices", icon: Mic },
              ].map(({ key, label, description, icon: Icon }) => (
                <div key={key} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label className="text-sm font-medium">{label}</Label>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!settings?.[key as keyof typeof settings]}
                    onCheckedChange={(v) => updateSettingsMutation.mutate({ [key]: v } as any)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Audit Log ── */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Session Audit Log</CardTitle>
            </CardHeader>
            <CardContent>
              {auditLog.length === 0 ? (
                <p className="text-muted-foreground text-sm">No monitoring sessions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="capitalize">{entry.monitoringType}</Badge>
                        <span className="font-medium">{entry.employeeName}</span>
                        <span className="text-muted-foreground text-xs">by {entry.adminName ?? `Admin #${entry.adminId}`}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground text-xs">
                        {entry.durationSeconds != null && (
                          <span>{Math.floor(entry.durationSeconds / 60)}m {entry.durationSeconds % 60}s</span>
                        )}
                        <span>{fmtDateTime(entry.startTime)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
