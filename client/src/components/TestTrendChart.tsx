/**
 * TestTrendChart
 *
 * Inline trend chart for a single lab test showing all historical values over time.
 * Features:
 *  - Line chart with circular data points sorted oldest → newest
 *  - Reference range band (green shaded area between refLow and refHigh)
 *  - Color-coded points: green (Normal), red (High), amber (Low), gray (unknown)
 *  - Hover tooltip showing date + value + unit + interpretation
 *  - X-axis: dates in dd/mm/yyyy
 *  - AUTO UNIT CONVERSION: if data points have mixed units, converts all to the
 *    Turkish standard default unit using labUnits.ts, and shows a notice.
 */

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { fmtDate } from "@/lib/dateFormat";
import { findTestDef, convertUnit } from "@/lib/labUnits";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawEntry {
  result: string;
  collectionDate?: string;
  unit?: string;
  interpretation?: string;
  referenceRange?: string;
}

interface DataPoint {
  dateRaw: string;
  dateLabel: string;
  value: number;
  originalValue: number;
  originalUnit?: string;
  displayUnit: string;
  interpretation?: string;
  referenceRange?: string;
  refLow?: number;
  refHigh?: number;
  wasConverted: boolean;
}

interface Props {
  testName: string;
  unit?: string;
  mainResult: string;
  mainDate?: string;
  mainInterpretation?: string;
  mainReferenceRange?: string;
  history?: RawEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse reference range string like "2.0-10.5", "<5", ">2" */
function parseRefRange(ref?: string): { low?: number; high?: number } {
  if (!ref) return {};
  const rangeMatch = ref.match(/^([\d.]+)\s*[-–]\s*([\d.]+)$/);
  if (rangeMatch) return { low: parseFloat(rangeMatch[1]), high: parseFloat(rangeMatch[2]) };
  const ltMatch = ref.match(/^[<≤]\s*([\d.]+)$/);
  if (ltMatch) return { high: parseFloat(ltMatch[1]) };
  const gtMatch = ref.match(/^[>≥]\s*([\d.]+)$/);
  if (gtMatch) return { low: parseFloat(gtMatch[1]) };
  return {};
}

/** Normalise a date string to yyyy-mm-dd */
function normDate(d?: string): string {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{4}-\d{2}$/.test(d)) return d + "-01";
  return d;
}

/** Dot color based on interpretation */
function dotColor(interp?: string): string {
  if (!interp) return "#94a3b8";
  const l = interp.toLowerCase();
  if (l.includes("high") || l.includes("positive") || l.includes("reactive") || l.includes("abnormal")) return "#ef4444";
  if (l.includes("low")) return "#f59e0b";
  if (l.includes("normal") || l.includes("negative") || l.includes("non-reactive")) return "#22c55e";
  return "#94a3b8";
}

/** Custom dot renderer */
const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  const color = dotColor(payload.interpretation);
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />;
};

/** Custom tooltip */
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d: DataPoint = payload[0].payload;
  const color = dotColor(d.interpretation);
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5 min-w-[150px]">
      <div className="font-semibold text-foreground">{d.dateLabel}</div>
      <div className="flex items-center gap-1.5">
        <span className="text-base font-bold" style={{ color }}>{d.value}</span>
        <span className="text-muted-foreground">{d.displayUnit}</span>
      </div>
      {d.wasConverted && (
        <div className="text-[10px] text-amber-600">
          Original: {d.originalValue} {d.originalUnit}
        </div>
      )}
      {d.interpretation && (
        <div className="font-medium" style={{ color }}>{d.interpretation}</div>
      )}
      {d.referenceRange && (
        <div className="text-muted-foreground">Ref: {d.referenceRange}</div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TestTrendChart({
  testName,
  unit,
  mainResult,
  mainDate,
  mainInterpretation,
  mainReferenceRange,
  history = [],
}: Props) {

  const { points, displayUnit, convertedUnits, targetUnit, hasAmbiguousUnits, ambiguousUnitValues } = useMemo(() => {
    // Collect all raw entries: history (older) + main (latest)
    const allRaw: RawEntry[] = [
      ...history.map(h => ({
        result: h.result,
        collectionDate: h.collectionDate,
        unit: h.unit,
        interpretation: h.interpretation,
        referenceRange: h.referenceRange,
      })),
      {
        result: mainResult,
        collectionDate: mainDate,
        unit,
        interpretation: mainInterpretation,
        referenceRange: mainReferenceRange,
      },
    ];

    // Parse numeric values only
    const parsed: Array<{ raw: RawEntry; num: number; normDate: string }> = [];
    for (const e of allRaw) {
      const num = parseFloat(e.result?.replace(/[^0-9.\-]/g, "") ?? "");
      const nd = normDate(e.collectionDate);
      if (isNaN(num) || !nd) continue;
      parsed.push({ raw: e, num, normDate: nd });
    }

    if (parsed.length < 2) return { points: [], displayUnit: unit ?? "", convertedUnits: [], targetUnit: undefined, hasAmbiguousUnits: false, ambiguousUnitValues: [] as string[] };

    // Detect mixed units
    const unitSet = new Set(parsed.map(p => (p.raw.unit ?? "").trim().toLowerCase()).filter(Boolean));
    const testDef = findTestDef(testName);
    const target = testDef?.defaultUnit;

    // Detect ambiguous/unknown units ("unit", empty, or units that can't be converted)
    const AMBIGUOUS_UNITS = new Set(["unit", "units", "u", "", "unknown", "-", "—"]);
    const ambiguousUnitValues: string[] = [];
    Array.from(unitSet).forEach(u => {
      if (AMBIGUOUS_UNITS.has(u)) ambiguousUnitValues.push(u || "(empty)");
    });
    // Also flag if there are mixed units that cannot be auto-converted
    const hasUnconvertibleMix = unitSet.size > 1 && !target;

    // Determine which units were actually converted
    const convertedUnitsList: string[] = [];

    const pts: DataPoint[] = parsed.map(p => {
      const srcUnit = p.raw.unit ?? "";
      let value = p.num;
      let wasConverted = false;

      if (target && srcUnit && srcUnit !== target && testDef) {
        const converted = convertUnit(testName, p.num, srcUnit, target);
        if (converted !== p.num) {
          value = Math.round(converted * 10000) / 10000;
          wasConverted = true;
          if (!convertedUnitsList.includes(srcUnit)) convertedUnitsList.push(srcUnit);
        }
      }

      const { low, high } = parseRefRange(p.raw.referenceRange ?? mainReferenceRange);

      return {
        dateRaw: p.normDate,
        dateLabel: fmtDate(p.normDate),
        value,
        originalValue: p.num,
        originalUnit: srcUnit || undefined,
        displayUnit: target ?? srcUnit ?? unit ?? "",
        interpretation: p.raw.interpretation,
        referenceRange: p.raw.referenceRange ?? mainReferenceRange,
        refLow: low,
        refHigh: high,
        wasConverted,
      };
    });

    // Sort oldest → newest
    pts.sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));

    const finalUnit = target ?? (parsed[0]?.raw.unit ?? unit ?? "");
    const hasMixed = unitSet.size > 1;
    const hasAmbiguous = ambiguousUnitValues.length > 0 || hasUnconvertibleMix;

    return {
      points: pts,
      displayUnit: finalUnit,
      convertedUnits: hasMixed ? convertedUnitsList : [],
      targetUnit: target,
      hasAmbiguousUnits: hasAmbiguous,
      ambiguousUnitValues: hasUnconvertibleMix
        ? Array.from(unitSet)
        : ambiguousUnitValues,
    };
  }, [testName, unit, mainResult, mainDate, mainInterpretation, mainReferenceRange, history]);

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-12 text-xs text-muted-foreground italic">
        Need at least 2 numeric data points to show a trend chart.
      </div>
    );
  }

  // Reference range band
  const refLow = points.find(p => p.refLow !== undefined)?.refLow;
  const refHigh = points.find(p => p.refHigh !== undefined)?.refHigh;

  // Y-axis domain
  const values = points.map(p => p.value);
  const minVal = Math.min(...values, refLow ?? Infinity);
  const maxVal = Math.max(...values, refHigh ?? -Infinity);
  const padding = (maxVal - minVal) * 0.2 || 1;
  const yMin = Math.max(0, minVal - padding);
  const yMax = maxVal + padding;

  return (
    <div className="w-full bg-muted/20 rounded-lg border border-border/40 p-3 space-y-2">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground">{testName} — Trend</span>
        {displayUnit && <span className="text-xs text-muted-foreground">({displayUnit})</span>}

        {/* Unit conversion notice */}
        {convertedUnits.length > 0 && targetUnit && (
          <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
            ⚠️ Converted {convertedUnits.join(", ")} → {targetUnit} (Turkish standard)
          </span>
        )}
        {/* Ambiguous / mixed-unit warning */}
        {hasAmbiguousUnits && (
          <span className="flex items-center gap-1 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
            ⚠️ Mixed or unknown units detected — values may not be comparable. Please verify units in the test entries.
          </span>
        )}

        {/* Legend — only show if at least one data point has an interpretation */}
        {points.some(p => p.interpretation) && (
          <div className="flex items-center gap-3 ml-auto text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" /> Normal</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> High</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" /> Low</span>
            {(refLow !== undefined || refHigh !== undefined) && (
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-green-200 opacity-70" /> Ref range</span>
            )}
          </div>
        )}
        {/* Ref range legend when no interpretation colors */}
        {!points.some(p => p.interpretation) && (refLow !== undefined || refHigh !== undefined) && (
          <div className="flex items-center gap-2 ml-auto text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-green-200 opacity-70" /> Ref range</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />

          {/* Reference range band */}
          {refLow !== undefined && refHigh !== undefined && (
            <ReferenceArea y1={refLow} y2={refHigh} fill="#22c55e" fillOpacity={0.08} stroke="#22c55e" strokeOpacity={0.3} strokeDasharray="4 4" />
          )}
          {refLow !== undefined && refHigh === undefined && (
            <ReferenceLine y={refLow} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.6}
              label={{ value: `Min ${refLow}`, position: "insideTopLeft", fontSize: 10, fill: "#22c55e" }} />
          )}
          {refHigh !== undefined && refLow === undefined && (
            <ReferenceLine y={refHigh} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.6}
              label={{ value: `Max ${refHigh}`, position: "insideTopLeft", fontSize: 10, fill: "#22c55e" }} />
          )}

          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} />

          <Line
            type="monotone"
            dataKey="value"
            stroke="#1E0566"
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 7, stroke: "white", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Data points summary */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
        {points.map((p, idx) => (
          <div key={idx} className="flex items-center gap-1 text-[10px]">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: dotColor(p.interpretation) }} />
            <span className="text-muted-foreground">{p.dateLabel}:</span>
            <span className="font-semibold text-foreground">{p.value}{displayUnit ? ` ${displayUnit}` : ""}</span>
            {p.wasConverted && (
              <span className="text-amber-500 text-[9px]">(was {p.originalValue} {p.originalUnit})</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
