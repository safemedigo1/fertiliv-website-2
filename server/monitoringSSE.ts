/**
 * monitoringSSE.ts
 *
 * Real-time WebRTC signaling for Remote Monitoring via Server-Sent Events (SSE).
 *
 * Architecture:
 *   - Employee device connects to GET /api/monitoring/events/:userId?deviceId=xxx
 *     and keeps the SSE connection open. The server pushes signals to this connection.
 *   - Admin sends signals via POST /api/monitoring/signal
 *     The server routes the signal to the correct employee SSE connection.
 *   - Employee sends WebRTC answer/ICE back via POST /api/monitoring/signal
 *     The server routes back to the admin's SSE connection.
 *
 * Device sessions:
 *   - Each SSE connection registers a device session (userId, deviceId, deviceInfo)
 *   - Admin can query GET /api/monitoring/devices to see all active sessions
 */

import { Express, Request, Response } from "express";
import { resolveClinicUserFromRequest } from "./_core/clinicSession";

// ─── In-memory SSE connection registry ───────────────────────────────────────
// Map: userId -> Map: deviceId -> { res, deviceInfo, connectedAt }

interface DeviceSession {
  res: Response;
  deviceInfo: string;
  browser: string;
  os: string;
  isMobile: boolean;
  connectedAt: number;
  lastSeen: number;   // Updated on every ping — used for presence tolerance
  userId: number;
  userName: string;
  userRole: string;
}

// Separate lastSeen store for recently-disconnected devices.
// Keeps a device visible as "online" for up to 45s after SSE drops.
// Key: `${userId}:${deviceId}`
const recentlySeen = new Map<string, {
  userId: number;
  userName: string;
  userRole: string;
  deviceId: string;
  deviceInfo: string;
  browser: string;
  os: string;
  isMobile: boolean;
  connectedAt: number;
  lastSeen: number;
}>();

const PRESENCE_GRACE_MS = 45_000; // 45 seconds grace period

const connections = new Map<number, Map<string, DeviceSession>>();

function addConnection(userId: number, deviceId: string, session: DeviceSession) {
  if (!connections.has(userId)) connections.set(userId, new Map());
  connections.get(userId)!.set(deviceId, session);
  // Update recentlySeen so the device stays visible during reconnects
  recentlySeen.set(`${userId}:${deviceId}`, {
    userId, userName: session.userName, userRole: session.userRole,
    deviceId, deviceInfo: session.deviceInfo, browser: session.browser,
    os: session.os, isMobile: session.isMobile,
    connectedAt: session.connectedAt, lastSeen: session.lastSeen,
  });
}

function removeConnection(userId: number, deviceId: string) {
  const userMap = connections.get(userId);
  if (userMap) {
    userMap.delete(deviceId);
    if (userMap.size === 0) connections.delete(userId);
  }
  // Don't remove from recentlySeen — let it expire naturally via PRESENCE_GRACE_MS
}

function sendToDevice(userId: number, deviceId: string, data: object): boolean {
  const session = connections.get(userId)?.get(deviceId);
  if (!session) return false;
  try {
    session.res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    removeConnection(userId, deviceId);
    return false;
  }
}

function sendToAdmin(adminId: number, data: object): boolean {
  // Admin connects with deviceId = "admin"
  return sendToDevice(adminId, "admin", data);
}

// ─── Parse device info from User-Agent ───────────────────────────────────────
function parseDeviceInfo(ua: string): { browser: string; os: string; isMobile: boolean; deviceInfo: string } {
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  let browser = "Unknown Browser";
  if (/Edg\//.test(ua)) browser = "Microsoft Edge";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  else if (/OPR\/|Opera\//.test(ua)) browser = "Opera";

  let os = "Unknown OS";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) {
    const match = ua.match(/Android ([0-9.]+)/);
    os = match ? `Android ${match[1]}` : "Android";
  } else if (/iPhone|iPad/.test(ua)) {
    const match = ua.match(/OS ([0-9_]+)/);
    os = match ? `iOS ${match[1].replace(/_/g, ".")}` : "iOS";
  } else if (/Linux/.test(ua)) os = "Linux";

  const deviceType = isMobile ? "📱 Mobile" : "💻 Desktop";
  const deviceInfo = `${deviceType} — ${browser} on ${os}`;

  return { browser, os, isMobile, deviceInfo };
}

// ─── Auth helper ─────────────────────────────────────────────────────────────
async function getUserFromRequest(req: Request, res: Response): Promise<{ id: number; name: string; role: string } | null> {
  const found = await resolveClinicUserFromRequest(req, res);
  if (!found) return null;
  return { id: found.id, name: found.name || found.email || "Unknown", role: found.role };
}

// ─── Register routes ──────────────────────────────────────────────────────────
export function registerMonitoringSSE(app: Express) {

  /**
   * GET /api/monitoring/events/:userId?deviceId=xxx
   * Employee (or admin) connects here to receive real-time signals.
   * deviceId = "admin" for admin connections, UUID for employee devices.
   */
  app.get("/api/monitoring/events/:userId", async (req: Request, res: Response) => {
    const user = await getUserFromRequest(req, res);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const targetUserId = parseInt(req.params.userId);
    const deviceId = (req.query.deviceId as string) || "default";
    const ua = req.headers["user-agent"] || "";
    const { browser, os, isMobile, deviceInfo } = parseDeviceInfo(ua);

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Register connection
    const now = Date.now();
    const session: DeviceSession = {
      res,
      deviceInfo,
      browser,
      os,
      isMobile,
      connectedAt: now,
      lastSeen: now,
      userId: targetUserId,
      userName: user.name,
      userRole: user.role,
    };
    addConnection(targetUserId, deviceId, session);

    // Send initial connected event
    res.write(`data: ${JSON.stringify({ type: "connected", deviceId, deviceInfo })}\n\n`);

    // Heartbeat every 25s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      removeConnection(targetUserId, deviceId);
    });
  });

  /**
   * GET /api/monitoring/ping
   * Client keepalive ping — confirms the device is still online.
   * Called every 20s by MonitoringAgent even when tab is in background.
   * Also updates lastSeen so the device stays visible during brief SSE reconnects.
   */
  app.get("/api/monitoring/ping", async (req: Request, res: Response) => {
    const user = await getUserFromRequest(req, res);
    if (!user) { res.status(401).json({ ok: false }); return; }

    const deviceId = (req.query.deviceId as string) || "default";
    const now = Date.now();

    // Update lastSeen on the live SSE session if it exists
    const session = connections.get(user.id)?.get(deviceId);
    if (session) session.lastSeen = now;

    // Always update recentlySeen so the device stays visible even during reconnects
    const key = `${user.id}:${deviceId}`;
    const existing = recentlySeen.get(key);
    if (existing) {
      existing.lastSeen = now;
    } else {
      // First ping without an SSE session — create a minimal presence record
      const ua = req.headers["user-agent"] || "";
      const { browser, os, isMobile, deviceInfo } = parseDeviceInfo(ua);
      recentlySeen.set(key, {
        userId: user.id, userName: user.name, userRole: user.role,
        deviceId, deviceInfo, browser, os, isMobile,
        connectedAt: now, lastSeen: now,
      });
    }

    res.json({ ok: true, ts: now });
  });

  /**
   * POST /api/monitoring/signal
   * Send a WebRTC signal to a specific device.
   * Body: { toUserId, toDeviceId, signal: { type, data } }
   * Admin uses toDeviceId = "admin" when sending answer/ICE back to admin.
   */
  app.post("/api/monitoring/signal", async (req: Request, res: Response) => {
    const user = await getUserFromRequest(req, res);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { toUserId, toDeviceId, signal } = req.body;
    if (!toUserId || !toDeviceId || !signal) {
      res.status(400).json({ error: "Missing toUserId, toDeviceId, or signal" });
      return;
    }

    const delivered = sendToDevice(parseInt(toUserId), toDeviceId, {
      type: "signal",
      fromUserId: user.id,
      fromName: user.name,
      fromRole: user.role,
      signal,
    });

    res.json({ delivered });
  });

  /**
   * GET /api/monitoring/devices
   * Admin-only: returns all active device sessions for monitorable employees.
   */
  app.get("/api/monitoring/devices", async (req: Request, res: Response) => {
    const user = await getUserFromRequest(req, res);
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const devices: Array<{
      userId: number;
      userName: string;
      userRole: string;
      deviceId: string;
      deviceInfo: string;
      browser: string;
      os: string;
      isMobile: boolean;
      connectedAt: number;
      isLive: boolean;   // true = active SSE connection; false = grace period only
    }> = [];

    const now = Date.now();
    const seen = new Set<string>(); // Track which userId:deviceId we've already added

    // 1. Add all live SSE connections
    for (const [userId, deviceMap] of Array.from(connections.entries())) {
      for (const [deviceId, session] of Array.from(deviceMap.entries())) {
        if (deviceId === "admin") continue;
        if (session.userRole !== "staff" && session.userRole !== "manager") continue;
        const k = `${userId}:${deviceId}`;
        seen.add(k);
        devices.push({
          userId,
          userName: session.userName,
          userRole: session.userRole,
          deviceId,
          deviceInfo: session.deviceInfo,
          browser: session.browser,
          os: session.os,
          isMobile: session.isMobile,
          connectedAt: session.connectedAt,
          isLive: true,  // Active SSE connection
        });
      }
    }

    // 2. Add recently-seen devices (within grace period) that aren't in live connections.
    //    This keeps devices visible during brief SSE reconnects (e.g., page navigation).
    for (const [key, entry] of Array.from(recentlySeen.entries())) {
      if (seen.has(key)) continue; // Already included from live connections
      if (entry.deviceId === "admin") continue;
      if (entry.userRole !== "staff" && entry.userRole !== "manager") continue;
      if (now - entry.lastSeen > PRESENCE_GRACE_MS) {
        recentlySeen.delete(key); // Expired — clean up
        continue;
      }
      devices.push({
        userId: entry.userId,
        userName: entry.userName,
        userRole: entry.userRole,
        deviceId: entry.deviceId,
        deviceInfo: entry.deviceInfo,
        browser: entry.browser,
        os: entry.os,
        isMobile: entry.isMobile,
        connectedAt: entry.connectedAt,
        isLive: false,  // Grace period — recently seen but SSE not currently open
      });
    }

    res.json({ devices });
  });
}
