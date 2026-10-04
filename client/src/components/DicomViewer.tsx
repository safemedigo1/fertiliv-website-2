import { useEffect, useRef, useState, useCallback } from "react";
import * as dicomParser from "dicom-parser";
import {
  ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2,
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface DicomViewerProps { fileUrl: string; className?: string; }

// ─── Transfer Syntax UID constants ───────────────────────────────────────────
const JPEG_TS = new Set([
  "1.2.840.10008.1.2.4.50", // JPEG Baseline
  "1.2.840.10008.1.2.4.51", // JPEG Extended
  "1.2.840.10008.1.2.4.57", // JPEG Lossless P14
  "1.2.840.10008.1.2.4.70", // JPEG Lossless SV1
]);
const JPEG2000_TS = new Set([
  "1.2.840.10008.1.2.4.90", // JPEG 2000 Lossless
  "1.2.840.10008.1.2.4.91", // JPEG 2000
]);
const JPEG_LS_TS = new Set([
  "1.2.840.10008.1.2.4.80",
  "1.2.840.10008.1.2.4.81",
]);

// ─── Extract all JPEG frames from encapsulated pixel data ─────────────────────
// In encapsulated pixel data, each non-empty fragment is one frame.
// The first fragment may be the Basic Offset Table (skip if empty or all-zero).
function extractAllFrames(dataSet: dicomParser.DataSet): Uint8Array[] {
  const pde = dataSet.elements["x7fe00010"];
  if (!pde?.encapsulatedPixelData || !pde.fragments) return [];

  const ba = dataSet.byteArray;
  const frames: Uint8Array[] = [];

  for (const frag of pde.fragments) {
    if (frag.length === 0) continue;
    // Check if this is the Basic Offset Table (all zeros) — skip it
    const slice = ba.slice(frag.position, frag.position + frag.length) as Uint8Array;
    const isOffsetTable = slice.every(b => b === 0);
    if (isOffsetTable && frames.length === 0) continue;
    frames.push(slice);
  }
  return frames;
}

// ─── Decode a single JPEG frame bytes → ImageBitmap ──────────────────────────
async function decodeJpegFrame(frameBytes: Uint8Array): Promise<ImageBitmap> {
  const buf = frameBytes.buffer.slice(
    frameBytes.byteOffset,
    frameBytes.byteOffset + frameBytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([buf], { type: "image/jpeg" });
  return createImageBitmap(blob);
}

// ─── Decode a single JPEG 2000 frame bytes → ImageBitmap ─────────────────────
async function decodeJpeg2000Frame(frameBytes: Uint8Array): Promise<ImageBitmap> {
  const buf = frameBytes.buffer.slice(
    frameBytes.byteOffset,
    frameBytes.byteOffset + frameBytes.byteLength
  ) as ArrayBuffer;
  for (const mime of ["image/jp2", "image/jpeg2000", "image/jpx"]) {
    try {
      const blob = new Blob([buf], { type: mime });
      return await createImageBitmap(blob);
    } catch { /* try next */ }
  }
  throw new Error("JPEG 2000 decoding not supported in this browser.");
}

// ─── Render uncompressed raw pixel data → ImageBitmap ────────────────────────
function decodeRawFrame(dataSet: dicomParser.DataSet): ImageBitmap | null {
  const pde = dataSet.elements["x7fe00010"];
  if (!pde) return null;
  const rows = dataSet.uint16("x00280010") ?? 512;
  const cols = dataSet.uint16("x00280011") ?? 512;
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

  let mn = px[0], mx = px[0];
  for (let i = 1; i < px.length; i++) {
    if (px[i] < mn) mn = px[i];
    if (px[i] > mx) mx = px[i];
  }
  const rng = mx - mn || 1;

  const imgData = new ImageData(cols, rows);
  if (spp === 1) {
    for (let i = 0; i < rows * cols; i++) {
      const n = Math.round(((px[i] - mn) / rng) * 255);
      imgData.data[i * 4] = n;
      imgData.data[i * 4 + 1] = n;
      imgData.data[i * 4 + 2] = n;
      imgData.data[i * 4 + 3] = 255;
    }
  } else {
    for (let i = 0; i < rows * cols; i++) {
      imgData.data[i * 4]     = Math.round(((px[i * 3]     - mn) / rng) * 255);
      imgData.data[i * 4 + 1] = Math.round(((px[i * 3 + 1] - mn) / rng) * 255);
      imgData.data[i * 4 + 2] = Math.round(((px[i * 3 + 2] - mn) / rng) * 255);
      imgData.data[i * 4 + 3] = 255;
    }
  }
  // createImageBitmap from ImageData is synchronous-ish but returns a promise
  return null; // handled separately below
}

// ─── Load all frames from a DICOM dataset ────────────────────────────────────
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

  // Uncompressed — single frame via ImageData
  const pde = dataSet.elements["x7fe00010"];
  if (!pde) throw new Error("No pixel data found.");
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

  let mn = px[0], mx = px[0];
  for (let i = 1; i < px.length; i++) {
    if (px[i] < mn) mn = px[i];
    if (px[i] > mx) mx = px[i];
  }
  const rng = mx - mn || 1;

  const imgData = new ImageData(cols, rows);
  if (spp === 1) {
    for (let i = 0; i < rows * cols; i++) {
      const n = Math.round(((px[i] - mn) / rng) * 255);
      imgData.data[i * 4] = n;
      imgData.data[i * 4 + 1] = n;
      imgData.data[i * 4 + 2] = n;
      imgData.data[i * 4 + 3] = 255;
    }
  } else {
    for (let i = 0; i < rows * cols; i++) {
      imgData.data[i * 4]     = Math.round(((px[i * 3]     - mn) / rng) * 255);
      imgData.data[i * 4 + 1] = Math.round(((px[i * 3 + 1] - mn) / rng) * 255);
      imgData.data[i * 4 + 2] = Math.round(((px[i * 3 + 2] - mn) / rng) * 255);
      imgData.data[i * 4 + 3] = 255;
    }
  }
  const bitmap = await createImageBitmap(imgData);
  return { bitmaps: [bitmap], width: cols, height: rows };
}

// ─── React component ──────────────────────────────────────────────────────────
export function DicomViewer({ fileUrl, className }: DicomViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const [bitmaps, setBitmaps] = useState<ImageBitmap[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(15);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    modality?: string; studyDate?: string; patientName?: string;
    rows?: number; cols?: number; frameCount?: number;
  } | null>(null);

  // ── Draw current frame to canvas ──────────────────────────────────────────
  const drawFrame = useCallback((idx: number, frames: ImageBitmap[]) => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    const bm = frames[idx];
    if (!bm) return;
    canvas.width = bm.width;
    canvas.height = bm.height;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(bm, 0, 0);
  }, []);

  // ── Redraw whenever frameIndex or bitmaps change ──────────────────────────
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
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [playing, fps, bitmaps.length]);

  // ── Load DICOM file ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setFrameIndex(0);
    setBitmaps([]); setPlaying(false); setLoadProgress(0);

    async function load() {
      try {
        setLoadProgress(10);
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const buf = await res.arrayBuffer();
        setLoadProgress(40);

        const ds = dicomParser.parseDicom(new Uint8Array(buf));
        if (cancelled) return;

        const ts = (ds.string("x00020010") ?? "").trim();
        const rows = ds.uint16("x00280010");
        const cols = ds.uint16("x00280011");

        setLoadProgress(60);
        const { bitmaps: frames, width, height } = await loadAllFrames(ds, ts);
        if (cancelled) return;

        setLoadProgress(90);
        setMeta({
          modality: ds.string("x00080060"),
          studyDate: ds.string("x00080020"),
          patientName: ds.string("x00100010"),
          rows, cols,
          frameCount: frames.length,
        });
        setBitmaps(frames);
        // Auto-play if multi-frame
        if (frames.length > 1) setPlaying(true);
        setLoadProgress(100);
        setLoading(false);
        // Draw first frame
        setTimeout(() => drawFrame(0, frames), 0);
      } catch (e: unknown) {
        if (!cancelled) {
          const m = e instanceof Error ? e.message : String(e);
          let friendly = "DICOM error: " + m;
          if (m.includes("No pixel")) friendly = "No pixel data — this may be a structured report (no image).";
          else if (m.includes("HTTP")) friendly = "Could not load DICOM file (" + m + ").";
          else if (m.includes("JPEG-LS")) friendly = m;
          else if (m.includes("not supported")) friendly = m;
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

  const goTo = (idx: number) => {
    const clamped = Math.max(0, Math.min(frameCount - 1, idx));
    setFrameIndex(clamped);
  };

  const togglePlay = () => setPlaying(p => !p);

  // ── Container classes ─────────────────────────────────────────────────────
  // When className contains 'h-full', the parent controls height — don't set minHeight
  const hasExplicitHeight = (className ?? "").includes("h-full") || (className ?? "").includes("h-[");
  const containerClass = expanded
    ? "fixed inset-0 z-50 bg-black flex flex-col"
    : `relative bg-black rounded-xl overflow-hidden flex flex-col ${className ?? "w-full"}`;

  return (
    <div
      className={containerClass}
      style={expanded ? {} : hasExplicitHeight ? {} : { minHeight: 420 }}
    >

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">DICOM</span>
          {meta?.modality && (
            <span className="text-white/70 text-xs font-mono">{meta.modality}</span>
          )}
          {isMultiFrame && (
            <span className="flex items-center gap-1 text-white/50 text-[10px]">
              <Layers className="h-3 w-3" />
              {frameCount} frames
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setZoom(z => Math.min(z + 0.25, 5))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setZoom(1)}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setExpanded(e => !e)}>
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div className="flex-1 overflow-auto flex items-center justify-center bg-black min-h-0">
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-white text-sm animate-pulse">Loading DICOM…</div>
            <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
            <div className="text-white/40 text-xs">{loadProgress}%</div>
          </div>
        )}
        {error && (
          <div className="text-red-400 text-xs text-center px-6 max-w-sm leading-relaxed">
            {error}
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
            maxHeight: expanded
              ? "calc(100vh - 130px)"
              : hasExplicitHeight
                ? "calc(100% - 0px)"
                : "380px",
            objectFit: "contain",
          }}
        />
      </div>

      {/* ── Controls bar (only shown when loaded) ── */}
      {!loading && !error && (
        <div className="shrink-0 bg-black/90 border-t border-white/10 px-3 py-2 space-y-2">

          {/* Frame scrubber */}
          {isMultiFrame && (
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-[10px] w-5 text-right shrink-0">1</span>
              <Slider
                min={0}
                max={frameCount - 1}
                step={1}
                value={[frameIndex]}
                onValueChange={([v]) => { setPlaying(false); goTo(v); }}
                className="flex-1 [&_[role=slider]]:bg-blue-500 [&_[role=slider]]:border-blue-400"
              />
              <span className="text-white/40 text-[10px] w-8 shrink-0">{frameCount}</span>
            </div>
          )}

          {/* Playback controls row */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: frame nav */}
            <div className="flex items-center gap-1">
              {isMultiFrame && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
                    onClick={() => { setPlaying(false); goTo(0); }}>
                    <SkipBack className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
                    onClick={() => { setPlaying(false); goTo(frameIndex - 1); }}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-white hover:bg-white/10 bg-white/5 rounded-full"
                    onClick={togglePlay}>
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
                    onClick={() => { setPlaying(false); goTo(frameIndex + 1); }}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
                    onClick={() => { setPlaying(false); goTo(frameCount - 1); }}>
                    <SkipForward className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>

            {/* Center: frame counter */}
            <div className="text-white/60 text-xs font-mono tabular-nums">
              {isMultiFrame
                ? `Frame ${frameIndex + 1} / ${frameCount}`
                : meta?.rows && meta?.cols
                  ? `${meta.cols} × ${meta.rows} px`
                  : "1 frame"}
            </div>

            {/* Right: FPS control */}
            {isMultiFrame && (
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-[10px]">FPS</span>
                <div className="flex gap-1">
                  {[5, 10, 15, 24, 30].map(f => (
                    <button
                      key={f}
                      onClick={() => setFps(f)}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                        fps === f
                          ? "bg-blue-600 text-white"
                          : "text-white/40 hover:text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom meta row */}
          {meta && (
            <div className="flex gap-3 text-white/30 text-[10px] font-mono truncate pt-0.5 border-t border-white/5">
              {meta.patientName && <span>Patient: {meta.patientName}</span>}
              {meta.studyDate && <span>Date: {meta.studyDate}</span>}
              {meta.modality && <span>Modality: {meta.modality}</span>}
              {meta.cols && meta.rows && <span>{meta.cols}×{meta.rows}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
