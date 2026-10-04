/**
 * DicomViewerPage — Full-page DICOM viewer using dicom-parser + Canvas 2D.
 *
 * URL params:
 *   ?url=<encoded_absolute_url>   — the DICOM file URL (must be absolute for fetch)
 *   ?name=<encoded_label>         — display label / filename
 *
 * This page does NOT use Cornerstone (which has complex init requirements and
 * black-screen issues). Instead it uses the same dicom-parser + Canvas 2D
 * approach as DicomViewer.tsx component, which is proven to work.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as dicomParser from "dicom-parser";
import {
  ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2,
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Layers, Download, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

// ─── Transfer Syntax UID constants ───────────────────────────────────────────
const JPEG_TS = new Set([
  "1.2.840.10008.1.2.4.50",
  "1.2.840.10008.1.2.4.51",
  "1.2.840.10008.1.2.4.57",
  "1.2.840.10008.1.2.4.70",
]);
const JPEG2000_TS = new Set([
  "1.2.840.10008.1.2.4.90",
  "1.2.840.10008.1.2.4.91",
]);
const JPEG_LS_TS = new Set([
  "1.2.840.10008.1.2.4.80",
  "1.2.840.10008.1.2.4.81",
]);

function extractAllFrames(dataSet: dicomParser.DataSet): Uint8Array[] {
  const pde = dataSet.elements["x7fe00010"];
  if (!pde?.encapsulatedPixelData || !pde.fragments) return [];
  const ba = dataSet.byteArray;
  const frames: Uint8Array[] = [];
  for (const frag of pde.fragments) {
    if (frag.length === 0) continue;
    const slice = ba.slice(frag.position, frag.position + frag.length) as Uint8Array;
    const isOffsetTable = slice.every(b => b === 0);
    if (isOffsetTable && frames.length === 0) continue;
    frames.push(slice);
  }
  return frames;
}

async function decodeJpegFrame(frameBytes: Uint8Array): Promise<ImageBitmap> {
  const buf = frameBytes.buffer.slice(frameBytes.byteOffset, frameBytes.byteOffset + frameBytes.byteLength) as ArrayBuffer;
  return createImageBitmap(new Blob([buf], { type: "image/jpeg" }));
}

async function decodeJpeg2000Frame(frameBytes: Uint8Array): Promise<ImageBitmap> {
  const buf = frameBytes.buffer.slice(frameBytes.byteOffset, frameBytes.byteOffset + frameBytes.byteLength) as ArrayBuffer;
  for (const mime of ["image/jp2", "image/jpeg2000", "image/jpx"]) {
    try { return await createImageBitmap(new Blob([buf], { type: mime })); } catch { /* try next */ }
  }
  throw new Error("JPEG 2000 decoding not supported in this browser.");
}

async function loadAllFrames(
  dataSet: dicomParser.DataSet,
  transferSyntax: string
): Promise<{ bitmaps: ImageBitmap[]; width: number; height: number }> {
  const rows = dataSet.uint16("x00280010") ?? 512;
  const cols = dataSet.uint16("x00280011") ?? 512;

  if (JPEG_TS.has(transferSyntax)) {
    const frameBytes = extractAllFrames(dataSet);
    if (frameBytes.length === 0) throw new Error("No JPEG frames found in pixel data.");
    const bitmaps = await Promise.all(frameBytes.map(decodeJpegFrame));
    return { bitmaps, width: bitmaps[0].width, height: bitmaps[0].height };
  }

  if (JPEG2000_TS.has(transferSyntax)) {
    const frameBytes = extractAllFrames(dataSet);
    if (frameBytes.length === 0) throw new Error("No JPEG 2000 frames found.");
    const bitmaps = await Promise.all(frameBytes.map(decodeJpeg2000Frame));
    return { bitmaps, width: bitmaps[0].width, height: bitmaps[0].height };
  }

  if (JPEG_LS_TS.has(transferSyntax)) {
    throw new Error("JPEG-LS compressed DICOM is not supported in browser rendering.");
  }

  // Uncompressed raw pixel data
  const pde = dataSet.elements["x7fe00010"];
  if (!pde) throw new Error("No pixel data found in this DICOM file.");
  const bitsAllocated = dataSet.uint16("x00280100") ?? 8;
  const pixelRep = dataSet.uint16("x00280103") ?? 0;
  const spp = dataSet.uint16("x00280002") ?? 1;
  const ba = dataSet.byteArray;
  const off = pde.dataOffset;
  const total = rows * cols * spp;

  let px: number[];
  if (bitsAllocated === 16) {
    px = new Array(total);
    for (let i = 0; i < total; i++) {
      let v = (ba[off + i * 2 + 1] << 8) | ba[off + i * 2];
      if (pixelRep === 1 && v >= 32768) v -= 65536;
      px[i] = v;
    }
  } else {
    px = new Array(total);
    for (let i = 0; i < total; i++) px[i] = ba[off + i];
  }

  // Apply window/level from DICOM tags if present, otherwise auto-scale
  const wcTag = dataSet.string("x00281050");
  const wwTag = dataSet.string("x00281051");
  let mn: number, mx: number;

  if (wcTag && wwTag) {
    // Use DICOM window center/width
    const wc = parseFloat(wcTag.split("\\")[0]);
    const ww = parseFloat(wwTag.split("\\")[0]);
    mn = wc - ww / 2;
    mx = wc + ww / 2;
  } else {
    // Auto-scale: find min/max
    mn = px[0]; mx = px[0];
    for (let i = 1; i < px.length; i++) {
      if (px[i] < mn) mn = px[i];
      if (px[i] > mx) mx = px[i];
    }
  }
  const rng = mx - mn || 1;

  const imgData = new ImageData(cols, rows);
  if (spp === 1) {
    for (let i = 0; i < rows * cols; i++) {
      const n = Math.min(255, Math.max(0, Math.round(((px[i] - mn) / rng) * 255)));
      imgData.data[i * 4] = n;
      imgData.data[i * 4 + 1] = n;
      imgData.data[i * 4 + 2] = n;
      imgData.data[i * 4 + 3] = 255;
    }
  } else {
    for (let i = 0; i < rows * cols; i++) {
      imgData.data[i * 4]     = Math.min(255, Math.max(0, Math.round(((px[i * 3]     - mn) / rng) * 255)));
      imgData.data[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(((px[i * 3 + 1] - mn) / rng) * 255)));
      imgData.data[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(((px[i * 3 + 2] - mn) / rng) * 255)));
      imgData.data[i * 4 + 3] = 255;
    }
  }
  const bitmap = await createImageBitmap(imgData);
  return { bitmaps: [bitmap], width: cols, height: rows };
}

const WL_PRESETS = [
  { label: "Abdomen", center: 60, width: 400 },
  { label: "Bone", center: 400, width: 1800 },
  { label: "Brain", center: 40, width: 80 },
  { label: "Chest", center: -600, width: 1500 },
  { label: "Liver", center: 60, width: 160 },
  { label: "Lung", center: -600, width: 1600 },
  { label: "Pelvis", center: 40, width: 400 },
  { label: "Spine", center: 400, width: 1000 },
];

export default function DicomViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const [bitmaps, setBitmaps] = useState<ImageBitmap[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(15);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    modality?: string; studyDate?: string; patientName?: string;
    rows?: number; cols?: number; frameCount?: number;
  } | null>(null);
  const [wl, setWl] = useState({ center: 400, width: 800 });
  const [inverted, setInverted] = useState(false);

  // Parse URL params — support both ?url= and decode properly
  const params = new URLSearchParams(window.location.search);
  const rawUrl = params.get("url") || "";
  const fileName = params.get("name") || params.get("label") || "DICOM File";

  // Decode the URL — it may be double-encoded in some call sites
  const fileUrl = (() => {
    try {
      const decoded = decodeURIComponent(rawUrl);
      // If it looks like it was double-encoded, decode again
      if (decoded.includes("%2F") || decoded.includes("%3A")) {
        return decodeURIComponent(decoded);
      }
      return decoded;
    } catch {
      return rawUrl;
    }
  })();

  // ── Draw current frame ─────────────────────────────────────────────────────
  const drawFrame = useCallback((idx: number, frames: ImageBitmap[]) => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    const bm = frames[idx];
    if (!bm) return;
    canvas.width = bm.width;
    canvas.height = bm.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (inverted) {
      ctx.filter = "invert(1)";
    } else {
      ctx.filter = "none";
    }
    ctx.drawImage(bm, 0, 0);
  }, [inverted]);

  // ── Redraw on frame/bitmap/invert change ──────────────────────────────────
  useEffect(() => {
    if (bitmaps.length > 0) drawFrame(frameIndex, bitmaps);
  }, [frameIndex, bitmaps, drawFrame]);

  // ── Cine loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || bitmaps.length <= 1) return;
    const interval = 1000 / fps;
    function tick(now: number) {
      if (now - lastFrameTimeRef.current >= interval) {
        lastFrameTimeRef.current = now;
        setFrameIndex(i => (i + 1) % bitmaps.length);
      }
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current !== null) cancelAnimationFrame(animRef.current); };
  }, [playing, fps, bitmaps.length]);

  // ── Load DICOM ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    setLoading(true); setError(null); setFrameIndex(0);
    setBitmaps([]); setPlaying(false); setLoadProgress(0);

    async function load() {
      try {
        setLoadProgress(10);
        const res = await fetch(fileUrl, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status} — could not fetch DICOM file.`);
        const buf = await res.arrayBuffer();
        setLoadProgress(40);

        const ds = dicomParser.parseDicom(new Uint8Array(buf));
        if (cancelled) return;

        const ts = (ds.string("x00020010") ?? "").trim();
        const rows = ds.uint16("x00280010");
        const cols = ds.uint16("x00280011");

        setLoadProgress(60);
        const { bitmaps: frames } = await loadAllFrames(ds, ts);
        if (cancelled) return;

        setLoadProgress(90);
        setMeta({
          modality: ds.string("x00080060"),
          studyDate: ds.string("x00080020"),
          patientName: ds.string("x00100010"),
          rows, cols,
          frameCount: frames.length,
        });

        // Update W/L state from DICOM tags
        const wcTag = ds.string("x00281050");
        const wwTag = ds.string("x00281051");
        if (wcTag && wwTag) {
          const wc = parseFloat(wcTag.split("\\")[0]);
          const ww = parseFloat(wwTag.split("\\")[0]);
          if (!isNaN(wc) && !isNaN(ww)) setWl({ center: Math.round(wc), width: Math.round(ww) });
        }

        setBitmaps(frames);
        if (frames.length > 1) setPlaying(true);
        setLoadProgress(100);
        setLoading(false);
        setTimeout(() => drawFrame(0, frames), 0);
      } catch (e: unknown) {
        if (!cancelled) {
          const m = e instanceof Error ? e.message : String(e);
          let friendly = "DICOM error: " + m;
          if (m.includes("No pixel")) friendly = "No pixel data — this may be a structured report with no image.";
          else if (m.includes("HTTP")) friendly = m;
          else if (m.includes("JPEG-LS")) friendly = m;
          else if (m.includes("not supported")) friendly = m;
          else if (m.includes("parseDicom") || m.includes("DICM")) friendly = "This file does not appear to be a valid DICOM file.";
          setError(friendly);
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [fileUrl, drawFrame]);

  const frameCount = bitmaps.length;
  const isMultiFrame = frameCount > 1;
  const goTo = (idx: number) => setFrameIndex(Math.max(0, Math.min(frameCount - 1, idx)));

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center">
          <p className="text-lg mb-2">No DICOM file URL provided.</p>
          <p className="text-sm text-gray-400">Use: /dicom-viewer?url=&lt;encoded_url&gt;&amp;name=&lt;label&gt;</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white select-none overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.close()}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">DICOM</span>
          <span className="text-sm font-semibold text-blue-400">Fertiliv DICOM Viewer</span>
          <span className="text-xs text-gray-400 truncate max-w-xs">{fileName}</span>
          {meta?.modality && <span className="text-xs text-gray-500 font-mono">{meta.modality}</span>}
          {isMultiFrame && (
            <span className="flex items-center gap-1 text-white/50 text-[10px]">
              <Layers className="h-3 w-3" />{frameCount} frames
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a href={fileUrl} download className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition flex items-center gap-1">
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          <button
            onClick={() => window.close()}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition"
          >
            ✕ Close
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <div className="flex flex-col gap-2 p-3 bg-gray-900 border-r border-gray-800 w-44 shrink-0 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Tools</p>

          <button
            onClick={() => setZoom(z => Math.min(z + 0.25, 5))}
            className="w-full text-left text-xs rounded px-2 py-2 transition border bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 flex items-center gap-1.5"
          >
            <ZoomIn className="h-3.5 w-3.5" /> Zoom In
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
            className="w-full text-left text-xs rounded px-2 py-2 transition border bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 flex items-center gap-1.5"
          >
            <ZoomOut className="h-3.5 w-3.5" /> Zoom Out
          </button>
          <button
            onClick={() => setZoom(1)}
            className="w-full text-left text-xs rounded px-2 py-2 transition border bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Zoom
          </button>
          <button
            onClick={() => setInverted(v => !v)}
            className={`w-full text-left text-xs rounded px-2 py-2 transition border flex items-center gap-1.5 ${
              inverted ? "bg-blue-700 border-blue-500 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            <Minimize2 className="h-3.5 w-3.5" /> Invert Colors
          </button>

          <div className="border-t border-gray-700 my-1" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Presets</p>
          {WL_PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => setWl({ center: preset.center, width: preset.width })}
              className="w-full text-left text-xs text-gray-300 hover:text-white hover:bg-gray-800 rounded px-2 py-1 transition"
            >
              {preset.label}
              <span className="text-gray-500 ml-1 text-[9px]">C:{preset.center}</span>
            </button>
          ))}

          {meta && (
            <>
              <div className="border-t border-gray-700 my-1" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Info</p>
              {meta.modality && <p className="text-[10px] text-gray-400">Modality: <span className="text-white">{meta.modality}</span></p>}
              {meta.studyDate && <p className="text-[10px] text-gray-400">Date: <span className="text-white">{meta.studyDate}</span></p>}
              {meta.cols && meta.rows && <p className="text-[10px] text-gray-400">Size: <span className="text-white">{meta.cols}×{meta.rows}</span></p>}
              {meta.frameCount && <p className="text-[10px] text-gray-400">Frames: <span className="text-white">{meta.frameCount}</span></p>}
            </>
          )}
        </div>

        {/* ── Viewport ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-black">
          <div className="flex-1 overflow-auto flex items-center justify-center bg-black min-h-0">
            {loading && (
              <div className="flex flex-col items-center gap-3">
                <div className="text-white text-sm animate-pulse">Loading DICOM…</div>
                <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${loadProgress}%` }} />
                </div>
                <div className="text-white/40 text-xs">{loadProgress}%</div>
              </div>
            )}
            {error && (
              <div className="text-center px-6 max-w-sm">
                <p className="text-red-400 text-sm mb-2">⚠ {error}</p>
                <p className="text-gray-500 text-xs">The file may not be a valid DICOM file, or it may require authentication.</p>
                <a href={fileUrl} download className="mt-3 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline">
                  <Download className="h-3 w-3" /> Try downloading the file instead
                </a>
              </div>
            )}
            <canvas
              ref={canvasRef}
              style={{
                display: loading || error ? "none" : "block",
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                imageRendering: "pixelated",
                maxWidth: "100%",
                maxHeight: "calc(100vh - 130px)",
                objectFit: "contain",
              }}
            />
          </div>

          {/* ── Controls ── */}
          {!loading && !error && (
            <div className="shrink-0 bg-black/90 border-t border-white/10 px-3 py-2 space-y-2">
              {isMultiFrame && (
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-[10px] w-5 text-right shrink-0">1</span>
                  <Slider
                    min={0} max={frameCount - 1} step={1} value={[frameIndex]}
                    onValueChange={([v]) => { setPlaying(false); goTo(v); }}
                    className="flex-1 [&_[role=slider]]:bg-blue-500 [&_[role=slider]]:border-blue-400"
                  />
                  <span className="text-white/40 text-[10px] w-8 shrink-0">{frameCount}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {isMultiFrame && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => { setPlaying(false); goTo(0); }}><SkipBack className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => { setPlaying(false); goTo(frameIndex - 1); }}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 bg-white/5 rounded-full" onClick={() => setPlaying(p => !p)}>
                        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => { setPlaying(false); goTo(frameIndex + 1); }}><ChevronRight className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => { setPlaying(false); goTo(frameCount - 1); }}><SkipForward className="h-3.5 w-3.5" /></Button>
                    </>
                  )}
                </div>
                <div className="text-white/60 text-xs font-mono tabular-nums">
                  {isMultiFrame ? `Frame ${frameIndex + 1} / ${frameCount}` : meta?.rows && meta?.cols ? `${meta.cols} × ${meta.rows} px` : "1 frame"}
                </div>
                {isMultiFrame && (
                  <div className="flex items-center gap-2">
                    <span className="text-white/40 text-[10px]">FPS</span>
                    <div className="flex gap-1">
                      {[5, 10, 15, 24, 30].map(f => (
                        <button key={f} onClick={() => setFps(f)} className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${fps === f ? "bg-blue-600 text-white" : "text-white/40 hover:text-white/70 hover:bg-white/10"}`}>{f}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {meta && (
                <div className="flex gap-3 text-white/30 text-[10px] font-mono truncate pt-0.5 border-t border-white/5">
                  {meta.patientName && <span>Patient: {meta.patientName}</span>}
                  {meta.studyDate && <span>Date: {meta.studyDate}</span>}
                  {meta.modality && <span>Modality: {meta.modality}</span>}
                  {meta.cols && meta.rows && <span>{meta.cols}×{meta.rows}</span>}
                  <span className="ml-auto text-gray-600">Zoom: {Math.round(zoom * 100)}%</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
