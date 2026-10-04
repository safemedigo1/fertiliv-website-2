/**
 * ResultTypeFields — renders the appropriate input fields
 * based on the result type of a lab test.
 *
 * Supports:
 *   Quantitative        → value (number), unit, referenceRange, interpretation
 *   Qualitative         → qualResult (Positive/Negative/Reactive/etc.), interpretation
 *   Molecular/PCR       → value (viral load), unit, ctValue, detected (bool), genotype, interpretation
 *   Genetic             → genotype, zygosity, interpretation
 *   Microbiology Culture→ growth (bool), organism, antibiogram (textarea), interpretation
 *   Microscopy/Parasitology → seen (bool), organism, count, interpretation
 *   Panel/Profile       → notes (textarea)
 *   Pathology/Biopsy    → macroscopic (textarea), microscopic (textarea), diagnosis, interpretation
 *   Semen Analysis      → handled by dedicated module
 *   Semen DNA           → handled by dedicated module
 *   Therapeutic Drug Monitoring → value (number), unit, therapeuticRange, toxic (bool), interpretation
 *   Descriptive/Report  → report (textarea), conclusion, interpretation
 */

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RESULT_TYPE_COLORS, type ResultType } from "./LabTestAutocomplete";

export interface ResultFields {
  // Quantitative
  value?: string;
  unit?: string;
  referenceRange?: string;
  // Qualitative
  qualResult?: string;
  // PCR
  ctValue?: string;
  detected?: boolean;
  genotype?: string;
  // Genetic
  zygosity?: string;
  // Culture
  growth?: boolean;
  organism?: string;
  antibiogram?: string;
  // Microscopy
  seen?: boolean;
  count?: string;
  // Pathology
  macroscopic?: string;
  microscopic?: string;
  diagnosis?: string;
  // TDM
  therapeuticRange?: string;
  toxic?: boolean;
  // Descriptive
  report?: string;
  conclusion?: string;
  // Shared
  interpretation?: string;
  notes?: string;
}

const PCR_VL_UNITS = ["IU/mL", "copies/mL", "log IU/mL", "log copies/mL", "copies/µL", "IU/µL"];

interface Props {
  resultType: ResultType;
  fields: ResultFields;
  onChange: (fields: ResultFields) => void;
  commonUnits?: string | null;
  /** Explicit list of unit options for dropdown. When provided, shows a Select instead of free-text Input. */
  unitOptions?: string[];
  disabled?: boolean;
}

const QUALITATIVE_OPTIONS = [
  "Positive",
  "Negative",
  "Reactive",
  "Non-Reactive",
  "Detected",
  "Not Detected",
  "Equivocal",
  "Indeterminate",
  "Borderline",
  "Weakly Positive",
  "Strongly Positive",
];

const INTERPRETATION_OPTIONS = [
  "Normal",
  "Abnormal",
  "High",
  "Low",
  "Critical High",
  "Critical Low",
  "Borderline",
  "Pending",
];

export function ResultTypeFields({ resultType, fields, onChange, commonUnits, unitOptions, disabled }: Props) {
  const set = (key: keyof ResultFields, val: string | boolean | undefined) =>
    onChange({ ...fields, [key]: val });

  const fieldClass = "space-y-1.5";
  const labelClass = "text-xs font-medium text-muted-foreground";

  // ── Quantitative ────────────────────────────────────────────────────────────
  if (resultType === "Quantitative" || resultType === "Therapeutic Drug Monitoring") {
    const units = unitOptions ?? (commonUnits ? commonUnits.split(/[,/]/).map(u => u.trim()).filter(Boolean) : []);
    // Ensure current value is always in the list so Select shows it correctly
    const currentUnit = fields.unit ?? "";
    const unitsWithCurrent = units.length > 0 && currentUnit && !units.includes(currentUnit)
      ? [currentUnit, ...units]
      : units;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className={fieldClass}>
            <Label className={labelClass}>Result Value</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 5.2"
              value={fields.value ?? ""}
              onChange={(e) => set("value", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className={fieldClass}>
            <Label className={labelClass}>Unit</Label>
            {unitsWithCurrent.length > 1 ? (
              <Select value={currentUnit} onValueChange={v => set("unit", v)} disabled={disabled}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit…" />
                </SelectTrigger>
                <SelectContent>
                  {unitsWithCurrent.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder={units[0] || commonUnits || "e.g. mIU/L"}
                value={currentUnit}
                onChange={(e) => set("unit", e.target.value)}
                disabled={disabled}
              />
            )}
          </div>
        </div>
        <div className={fieldClass}>
          <Label className={labelClass}>Reference Range</Label>
          <Input
            placeholder="e.g. 0.4 – 4.0 mIU/L"
            value={fields.referenceRange ?? ""}
            onChange={(e) => set("referenceRange", e.target.value)}
            disabled={disabled}
          />
        </div>
        {resultType === "Therapeutic Drug Monitoring" && (
          <div className="grid grid-cols-2 gap-3">
            <div className={fieldClass}>
              <Label className={labelClass}>Therapeutic Range</Label>
              <Input
                placeholder="e.g. 10 – 20 ug/mL"
                value={fields.therapeuticRange ?? ""}
                onChange={(e) => set("therapeuticRange", e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className={cn(fieldClass, "flex items-end gap-2")}>
              <Switch
                checked={fields.toxic ?? false}
                onCheckedChange={(v) => set("toxic", v)}
                disabled={disabled}
              />
              <Label className={labelClass}>Toxic Level</Label>
            </div>
          </div>
        )}
        <InterpretationField fields={fields} set={set} disabled={disabled} />
      </div>
    );
  }

  // ── Qualitative ─────────────────────────────────────────────────────────────
  if (resultType === "Qualitative") {
    return (
      <div className="space-y-3">
        <div className={fieldClass}>
          <Label className={labelClass}>Result</Label>
          <Select
            value={fields.qualResult ?? ""}
            onValueChange={(v) => set("qualResult", v)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select result..." />
            </SelectTrigger>
            <SelectContent>
              {QUALITATIVE_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <InterpretationField fields={fields} set={set} disabled={disabled} />
      </div>
    );
  }

  // ── Molecular/PCR ────────────────────────────────────────────────────────────
  if (resultType === "Molecular/PCR") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className={cn(fieldClass, "flex items-end gap-2")}>
            <Switch
              checked={fields.detected ?? false}
              onCheckedChange={(v) => set("detected", v)}
              disabled={disabled}
            />
            <Label className={labelClass}>Detected</Label>
          </div>
          <div className={fieldClass}>
            <Label className={labelClass}>Ct Value</Label>
            <Input
              placeholder="e.g. 28.5"
              value={fields.ctValue ?? ""}
              onChange={(e) => set("ctValue", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className={fieldClass}>
            <Label className={labelClass}>Viral Load / Copies</Label>
            <Input
              placeholder="e.g. 1,200"
              value={fields.value ?? ""}
              onChange={(e) => set("value", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className={fieldClass}>
            <Label className={labelClass}>Viral Load Unit</Label>
            <Select value={fields.unit ?? ""} onValueChange={v => set("unit", v)} disabled={disabled}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit…" />
              </SelectTrigger>
              <SelectContent>
                {PCR_VL_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className={fieldClass}>
            <Label className={labelClass}>Genotype</Label>
            <Input
              placeholder="e.g. 1a, 3b"
              value={fields.genotype ?? ""}
              onChange={(e) => set("genotype", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
        <InterpretationField fields={fields} set={set} disabled={disabled} />
      </div>
    );
  }

  // ── Genetic ──────────────────────────────────────────────────────────────────
  if (resultType === "Genetic") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className={fieldClass}>
            <Label className={labelClass}>Genotype / Result</Label>
            <Input
              placeholder="e.g. Heterozygous, Homozygous, Wild-type"
              value={fields.genotype ?? ""}
              onChange={(e) => set("genotype", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className={fieldClass}>
            <Label className={labelClass}>Zygosity</Label>
            <Select
              value={fields.zygosity ?? ""}
              onValueChange={(v) => set("zygosity", v)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Heterozygous">Heterozygous</SelectItem>
                <SelectItem value="Homozygous">Homozygous</SelectItem>
                <SelectItem value="Wild-type">Wild-type (Normal)</SelectItem>
                <SelectItem value="Compound Heterozygous">Compound Heterozygous</SelectItem>
                <SelectItem value="Hemizygous">Hemizygous</SelectItem>
                <SelectItem value="Not Detected">Not Detected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <InterpretationField fields={fields} set={set} disabled={disabled} />
      </div>
    );
  }

  // ── Microbiology Culture ──────────────────────────────────────────────────────
  if (resultType === "Microbiology Culture") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className={cn(fieldClass, "flex items-end gap-2")}>
            <Switch
              checked={fields.growth ?? false}
              onCheckedChange={(v) => set("growth", v)}
              disabled={disabled}
            />
            <Label className={labelClass}>Growth</Label>
          </div>
          <div className={fieldClass}>
            <Label className={labelClass}>Organism Isolated</Label>
            <Input
              placeholder="e.g. E. coli, Staph aureus"
              value={fields.organism ?? ""}
              onChange={(e) => set("organism", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
        <div className={fieldClass}>
          <Label className={labelClass}>Antibiogram / Sensitivity</Label>
          <Textarea
            placeholder="List sensitive and resistant antibiotics..."
            value={fields.antibiogram ?? ""}
            onChange={(e) => set("antibiogram", e.target.value)}
            disabled={disabled}
            rows={3}
          />
        </div>
        <InterpretationField fields={fields} set={set} disabled={disabled} />
      </div>
    );
  }

  // ── Microscopy/Parasitology ───────────────────────────────────────────────────
  if (resultType === "Microscopy/Parasitology") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className={cn(fieldClass, "flex items-end gap-2")}>
            <Switch
              checked={fields.seen ?? false}
              onCheckedChange={(v) => set("seen", v)}
              disabled={disabled}
            />
            <Label className={labelClass}>Organism Seen</Label>
          </div>
          <div className={fieldClass}>
            <Label className={labelClass}>Organism / Finding</Label>
            <Input
              placeholder="e.g. Giardia lamblia, RBCs"
              value={fields.organism ?? ""}
              onChange={(e) => set("organism", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
        <div className={fieldClass}>
          <Label className={labelClass}>Count / Density</Label>
          <Input
            placeholder="e.g. 3-5 per HPF, Heavy"
            value={fields.count ?? ""}
            onChange={(e) => set("count", e.target.value)}
            disabled={disabled}
          />
        </div>
        <InterpretationField fields={fields} set={set} disabled={disabled} />
      </div>
    );
  }

  // ── Panel/Profile ─────────────────────────────────────────────────────────────
  if (resultType === "Panel/Profile") {
    return (
      <div className="space-y-3">
        <div className={fieldClass}>
          <Label className={labelClass}>Panel Notes / Summary</Label>
          <Textarea
            placeholder="Enter individual test results or overall summary..."
            value={fields.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            disabled={disabled}
            rows={4}
          />
        </div>
        <InterpretationField fields={fields} set={set} disabled={disabled} />
      </div>
    );
  }

  // ── Pathology/Biopsy ──────────────────────────────────────────────────────────
  if (resultType === "Pathology/Biopsy") {
    return (
      <div className="space-y-3">
        <div className={fieldClass}>
          <Label className={labelClass}>Macroscopic Description</Label>
          <Textarea
            placeholder="Macroscopic findings..."
            value={fields.macroscopic ?? ""}
            onChange={(e) => set("macroscopic", e.target.value)}
            disabled={disabled}
            rows={2}
          />
        </div>
        <div className={fieldClass}>
          <Label className={labelClass}>Microscopic Description</Label>
          <Textarea
            placeholder="Microscopic findings..."
            value={fields.microscopic ?? ""}
            onChange={(e) => set("microscopic", e.target.value)}
            disabled={disabled}
            rows={3}
          />
        </div>
        <div className={fieldClass}>
          <Label className={labelClass}>Diagnosis / Conclusion</Label>
          <Input
            placeholder="e.g. Chronic active hepatitis, Grade 2"
            value={fields.diagnosis ?? ""}
            onChange={(e) => set("diagnosis", e.target.value)}
            disabled={disabled}
          />
        </div>
        <InterpretationField fields={fields} set={set} disabled={disabled} />
      </div>
    );
  }

  // ── Descriptive/Report ────────────────────────────────────────────────────────
  if (resultType === "Descriptive/Report") {
    return (
      <div className="space-y-3">
        <div className={fieldClass}>
          <Label className={labelClass}>Report / Findings</Label>
          <Textarea
            placeholder="Enter full report text..."
            value={fields.report ?? ""}
            onChange={(e) => set("report", e.target.value)}
            disabled={disabled}
            rows={4}
          />
        </div>
        <div className={fieldClass}>
          <Label className={labelClass}>Conclusion</Label>
          <Input
            placeholder="Brief conclusion..."
            value={fields.conclusion ?? ""}
            onChange={(e) => set("conclusion", e.target.value)}
            disabled={disabled}
          />
        </div>
        <InterpretationField fields={fields} set={set} disabled={disabled} />
      </div>
    );
  }

  // ── Semen Analysis / Semen DNA ────────────────────────────────────────────────
  if (resultType === "Semen Analysis" || resultType === "Semen DNA") {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground text-center">
        This test type is handled by the dedicated{" "}
        <strong>{resultType === "Semen Analysis" ? "Semen Analysis" : "Semen DNA"}</strong>{" "}
        module. Please use that module to enter results.
      </div>
    );
  }

  // ── Fallback ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className={fieldClass}>
        <Label className={labelClass}>Result</Label>
        <Input
          placeholder="Enter result..."
          value={fields.value ?? ""}
          onChange={(e) => set("value", e.target.value)}
          disabled={disabled}
        />
      </div>
      <InterpretationField fields={fields} set={set} disabled={disabled} />
    </div>
  );
}

// ── Shared Interpretation Field ───────────────────────────────────────────────
function InterpretationField({
  fields,
  set,
  disabled,
}: {
  fields: ResultFields;
  set: (k: keyof ResultFields, v: string | boolean | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        Interpretation / Comment
      </Label>
      <Select
        value={fields.interpretation ?? ""}
        onValueChange={(v) => set("interpretation", v)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select interpretation..." />
        </SelectTrigger>
        <SelectContent>
          {INTERPRETATION_OPTIONS.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Result Type Badge ─────────────────────────────────────────────────────────
export function ResultTypeBadge({ resultType }: { resultType: ResultType | string }) {
  const colorClass =
    RESULT_TYPE_COLORS[resultType as ResultType] ?? "bg-gray-100 text-gray-700";
  return (
    <Badge variant="secondary" className={cn("text-xs", colorClass)}>
      {resultType}
    </Badge>
  );
}
