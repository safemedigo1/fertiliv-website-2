import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportModule = "leads" | "patients" | "tasks" | "notes" | "appointments" | "invoices" | "labResults" | "documents" | "services" | "users" | "medicalIntake";
type ParentModule = "lead" | "patient" | "none";
type ConflictStrategy = "update" | "skip" | "create";

const MODULE_LABELS: Record<ExportModule, string> = {
  leads: "Leads",
  patients: "Patients",
  tasks: "Tasks",
  notes: "Notes (Sales Notes)",
  appointments: "Appointments",
  invoices: "Invoices",
  labResults: "Lab Results (read-only)",
  documents: "Documents",
  services: "Services",
  users: "Users (read-only)",
  medicalIntake: "Medical Intake",
};

const MODULES_WITH_PARENT: ExportModule[] = ["tasks", "notes", "appointments", "invoices", "documents", "medicalIntake"];
const READONLY_MODULES: ExportModule[] = ["labResults", "users"];

const IMPORT_ORDER: ExportModule[] = [
  "services", "users", "leads", "patients", "medicalIntake",
  "appointments", "invoices", "tasks", "notes", "labResults", "documents",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DataIOPage() {
  // Export state
  const [exportModule, setExportModule] = useState<ExportModule>("leads");
  const [exportParentModule, setExportParentModule] = useState<ParentModule>("none");
  const [exportParentId, setExportParentId] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);

  // Import state
  const [importModule, setImportModule] = useState<ExportModule>("leads");
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>("skip");
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[] | null>(null);
  const [previewData, setPreviewData] = useState<{
    totalRows: number;
    preview: Record<string, unknown>[];
    columns: string[];
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // tRPC
  const utils = trpc.useUtils();

  const exportQuery = trpc.dataIO.export.useQuery(
    {
      module: exportModule,
      parentModule: exportParentModule === "none" ? undefined : exportParentModule,
      parentId: exportParentId ? Number(exportParentId) : undefined,
    },
    { enabled: false, retry: false }
  );

  const importMutation = trpc.dataIO.import.useMutation();
  const previewMutation = trpc.dataIO.preview.useMutation();

  // ─── Export ───────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await utils.dataIO.export.fetch({
        module: exportModule,
        parentModule: exportParentModule === "none" ? undefined : exportParentModule,
        parentId: exportParentId ? Number(exportParentId) : undefined,
      });

      if (!result || result.rows.length === 0) {
        toast.info("No data found for the selected module.");
        return;
      }

      // Convert to XLSX using SheetJS
      const ws = XLSX.utils.json_to_sheet(result.rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, result.module);

      // Add metadata sheet
      const metaWs = XLSX.utils.json_to_sheet([{
        fertiliv_module: result.module,
        parent_module: result.parentModule,
        exported_at: new Date().toISOString(),
        row_count: result.count,
      }]);
      XLSX.utils.book_append_sheet(wb, metaWs, "__meta");

      const filename = `fertiliv_${result.module}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);

      toast.success(`Exported ${result.count} rows to ${filename}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(`Export failed: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  }, [exportModule, exportParentModule, exportParentId, utils]);

  // ─── File parse ───────────────────────────────────────────────────────────

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });

      // Find the first non-meta sheet
      const sheetName = wb.SheetNames.find((n) => n !== "__meta") ?? wb.SheetNames[0];
      if (!sheetName) {
        toast.error("No data sheet found in the file.");
        return;
      }

      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      if (rows.length === 0) {
        toast.error("The file contains no data rows.");
        return;
      }

      // Try to auto-detect module from __meta sheet
      const metaSheet = wb.Sheets["__meta"];
      if (metaSheet) {
        const meta = XLSX.utils.sheet_to_json<Record<string, unknown>>(metaSheet)[0];
        if (meta?.fertiliv_module) {
          const detectedModule = meta.fertiliv_module as ExportModule;
          if (MODULE_LABELS[detectedModule]) {
            setImportModule(detectedModule);
            toast.info(`Auto-detected module: ${MODULE_LABELS[detectedModule]}`);
          }
        }
      }

      setParsedRows(rows);
      setPreviewData(null);
      setImportResult(null);
      toast.success(`Loaded ${rows.length} rows from ${file.name}`);
    } catch (err) {
      toast.error("Failed to parse file. Please upload a valid CSV or XLSX file.");
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ─── Preview ─────────────────────────────────────────────────────────────

  const handlePreview = useCallback(async () => {
    if (!parsedRows || parsedRows.length === 0) {
      toast.error("Please upload a file first.");
      return;
    }

    setIsPreviewing(true);
    try {
      const result = await previewMutation.mutateAsync({
        module: importModule,
        rows: parsedRows,
      });
      setPreviewData(result);
      toast.success(`Preview ready: ${result.totalRows} rows, ${result.columns.length} columns`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview failed";
      toast.error(`Preview failed: ${msg}`);
    } finally {
      setIsPreviewing(false);
    }
  }, [parsedRows, importModule, previewMutation]);

  // ─── Import ───────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!parsedRows || parsedRows.length === 0) {
      toast.error("Please upload a file first.");
      return;
    }

    if (READONLY_MODULES.includes(importModule)) {
      toast.error(`Module "${MODULE_LABELS[importModule]}" is read-only and cannot be imported.`);
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    try {
      const result = await importMutation.mutateAsync({
        module: importModule,
        conflictStrategy,
        rows: parsedRows,
      });
      setImportResult(result);

      if (result.failed === 0) {
        toast.success(`Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
      } else {
        toast.warning(`Import finished with ${result.failed} failures. See details below.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast.error(`Import failed: ${msg}`);
    } finally {
      setIsImporting(false);
    }
  }, [parsedRows, importModule, conflictStrategy, importMutation]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const showParentFilter = MODULES_WITH_PARENT.includes(exportModule);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Export / Import</h1>
        <p className="text-muted-foreground mt-1">
          Export data to Excel or import from CSV/XLSX files. Use the recommended import order for full backups.
        </p>
      </div>

      {/* Import order hint */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Recommended Import Order (Full Backup)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {IMPORT_ORDER.map((mod, i) => (
              <div key={mod} className="flex items-center gap-1">
                <Badge variant={READONLY_MODULES.includes(mod) ? "secondary" : "outline"} className="text-xs">
                  {i + 1}. {MODULE_LABELS[mod]}
                </Badge>
                {i < IMPORT_ORDER.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Modules marked as <Badge variant="secondary" className="text-xs">read-only</Badge> can be exported but not imported.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Export Card ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-green-600">↓</span> Export
            </CardTitle>
            <CardDescription>Download data as an Excel file (.xlsx)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Module selector */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Module</label>
              <Select value={exportModule} onValueChange={(v) => setExportModule(v as ExportModule)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODULE_LABELS) as ExportModule[]).map((mod) => (
                    <SelectItem key={mod} value={mod}>
                      {MODULE_LABELS[mod]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parent module filter (optional) */}
            {showParentFilter && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Filter by Parent (optional)</label>
                <Select value={exportParentModule} onValueChange={(v) => setExportParentModule(v as ParentModule)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All (no filter)</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="patient">Patient</SelectItem>
                  </SelectContent>
                </Select>
                {exportParentModule !== "none" && (
                  <input
                    type="number"
                    placeholder={`${exportParentModule === "lead" ? "Lead" : "Patient"} ID`}
                    value={exportParentId}
                    onChange={(e) => setExportParentId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
              </div>
            )}

            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full"
            >
              {isExporting ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  Exporting...
                </span>
              ) : (
                "Export to Excel"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* ── Import Card ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-blue-600">↑</span> Import
            </CardTitle>
            <CardDescription>Upload a CSV or XLSX file to import data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Module selector */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Module</label>
              <Select value={importModule} onValueChange={(v) => setImportModule(v as ExportModule)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODULE_LABELS) as ExportModule[]).map((mod) => (
                    <SelectItem key={mod} value={mod} disabled={READONLY_MODULES.includes(mod)}>
                      {MODULE_LABELS[mod]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {READONLY_MODULES.includes(importModule) && (
                <p className="text-xs text-amber-600 mt-1">This module is read-only — import is not supported.</p>
              )}
            </div>

            {/* Conflict strategy */}
            <div className="space-y-1">
              <label className="text-sm font-medium">When ID already exists</label>
              <Select value={conflictStrategy} onValueChange={(v) => setConflictStrategy(v as ConflictStrategy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip (keep existing)</SelectItem>
                  <SelectItem value="update">Update (overwrite existing)</SelectItem>
                  <SelectItem value="create">Create New (ignore ID)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* File upload */}
            <div className="space-y-1">
              <label className="text-sm font-medium">File (CSV or XLSX)</label>
              <div
                className="border-2 border-dashed border-input rounded-md p-4 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {parsedRows ? (
                  <p className="text-sm text-green-600 font-medium">
                    ✓ {parsedRows.length} rows loaded
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to upload CSV or XLSX</p>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={!parsedRows || isPreviewing}
                className="flex-1"
              >
                {isPreviewing ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    Loading...
                  </span>
                ) : "Preview"}
              </Button>
              <Button
                onClick={handleImport}
                disabled={!parsedRows || isImporting || READONLY_MODULES.includes(importModule)}
                className="flex-1"
              >
                {isImporting ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    Importing...
                  </span>
                ) : "Import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Preview Table ── */}
      {previewData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Preview — {previewData.totalRows} total rows
              {previewData.totalRows > 10 && (
                <span className="text-muted-foreground font-normal text-sm ml-2">(showing first 10)</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    {previewData.columns.slice(0, 12).map((col) => (
                      <th key={col} className="text-left py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                    {previewData.columns.length > 12 && (
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        +{previewData.columns.length - 12} more
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewData.preview.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      {previewData.columns.slice(0, 12).map((col) => (
                        <td key={col} className="py-2 px-3 whitespace-nowrap max-w-[160px] truncate">
                          {String(row[col] ?? "")}
                        </td>
                      ))}
                      {previewData.columns.length > 12 && <td className="py-2 px-3 text-muted-foreground">...</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Import Result ── */}
      {importResult && (
        <Card className={importResult.failed > 0 ? "border-amber-400" : "border-green-400"}>
          <CardHeader>
            <CardTitle className="text-base">Import Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{importResult.created}</p>
                <p className="text-xs text-muted-foreground">Created</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                <p className="text-xs text-muted-foreground">Updated</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-muted-foreground">{importResult.skipped}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-amber-700 mb-2">Errors ({importResult.errors.length})</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded">
                        {err}
                      </p>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
