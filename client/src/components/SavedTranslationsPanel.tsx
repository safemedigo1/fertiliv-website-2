/**
 * SavedTranslationsPanel
 *
 * A reusable component that:
 * - Loads saved translations for a given leadDocumentId
 * - Shows language badges for each SUCCESSFUL (completed) saved translation only
 * - Allows extracting new languages (calls translateLeadDocument)
 * - Allows editing and deleting saved translations
 * - Supports readOnly prop: hides Extract button, language selector, Cancel, and edit/delete controls
 *
 * State machine:
 *   Idle → Extracting → Success (badge shown)
 *   Idle → Extracting → Failed (no badge, no DB row, error toast, panel closes)
 *
 * Usage:
 *   <SavedTranslationsPanel
 *     leadDocumentId={doc.id}
 *     fileUrl={doc.url}
 *     fileName={doc.filename}
 *     mimeType={doc.mimeType}
 *     patientId={patientId}  // 0 for leads
 *     readOnly={true}        // optional: hides all edit controls
 *   />
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Edit2, Trash2, Check, X, ChevronDown, ChevronUp, Globe } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "tr", label: "Turkish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese" },
];

const LANG_LABELS: Record<string, string> = {
  en: "EN", ar: "AR", tr: "TR", fr: "FR", de: "DE", es: "ES", ru: "RU", zh: "ZH",
};

/** Returns true only for file types that can be AI-translated.
 * Radiology image attachments and DICOM files are not translatable.
 * All other files (including images in non-radiology sections) are translatable. */
function isTranslatableSection(intakeSection?: string): boolean {
  if (!intakeSection) return true;
  return intakeSection !== "radiologyImages" && intakeSection !== "radiologyDicom";
}

interface Props {
  leadDocumentId: number;
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  patientId?: number; // 0 for leads
  intakeSection?: string; // e.g. "radiologyImages", "radiologyDicom", "semenAnalysis", etc.
  /** When true: hides Extract button, language selector, Cancel, and edit/delete controls.
   *  Only successfully completed translations are shown. */
  readOnly?: boolean;
}

export default function SavedTranslationsPanel({
  leadDocumentId,
  fileUrl,
  fileName,
  mimeType,
  patientId = 0,
  intakeSection,
  readOnly = false,
}: Props) {
  const utils = trpc.useUtils();

  // Load existing translations for this document
  const { data: rawTranslations = [], isLoading } = trpc.translations.listByLeadDocument.useQuery(
    { leadDocumentId },
    { enabled: !!leadDocumentId }
  );

  // Only show completed translations — failed/processing rows are filtered out.
  // (Server-side: translateLeadDocument now deletes the record on failure, so no
  // failed rows should exist for new extractions. This filter handles any legacy
  // rows that may have been created before the fix.)
  const translations = rawTranslations.filter((t) => t.status === "completed");

  // Which translation is currently expanded
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Which translation is being edited
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  // New extraction UI
  const [showExtractPanel, setShowExtractPanel] = useState(false);
  const [selectedLang, setSelectedLang] = useState("en");

  // Mutations
  const translateMut = trpc.translations.translateLeadDocument.useMutation({
    onSuccess: (data) => {
      utils.translations.listByLeadDocument.invalidate({ leadDocumentId });
      toast.success("Extraction complete");
      setShowExtractPanel(false);
      // Auto-expand the new translation
      setExpandedId(data.id ?? null);
    },
    onError: (err) => {
      // On failure: close the extract panel, restore the language selector
      setShowExtractPanel(false);
      toast.error(err.message ?? "Extraction failed");
    },
  });

  const updateMut = trpc.translations.updateText.useMutation({
    onSuccess: () => {
      utils.translations.listByLeadDocument.invalidate({ leadDocumentId });
      setEditingId(null);
      toast.success("Translation updated");
    },
    onError: (err) => toast.error(err.message ?? "Update failed"),
  });

  const deleteMut = trpc.translations.delete.useMutation({
    onSuccess: () => {
      utils.translations.listByLeadDocument.invalidate({ leadDocumentId });
      toast.success("Translation deleted");
      setExpandedId(null);
    },
    onError: (err) => toast.error(err.message ?? "Delete failed"),
  });

  // Languages that already have a saved (completed) translation
  const savedLangs = new Set(translations.map((t) => t.targetLanguage));

  // Available languages for new extraction (not yet extracted)
  const availableLangs = LANGUAGES.filter((l) => !savedLangs.has(l.code));

  // Whether this file type/section supports AI translation
  const canTranslate = isTranslatableSection(intakeSection);

  const handleExtract = () => {
    if (!selectedLang) return;
    // Guard: prevent duplicate extraction for same language
    if (savedLangs.has(selectedLang)) {
      toast.error(`${LANGUAGES.find(l => l.code === selectedLang)?.label ?? selectedLang} translation already exists. Delete it first to re-extract.`);
      return;
    }
    translateMut.mutate({
      leadDocumentId,
      fileUrl,
      fileName,
      mimeType,
      targetLanguage: selectedLang,
      patientId,
    });
  };

  const handleEdit = (id: number, currentText: string) => {
    setEditingId(id);
    setEditText(currentText ?? "");
    setExpandedId(id);
  };

  const handleSaveEdit = () => {
    if (editingId === null) return;
    updateMut.mutate({ id: editingId, translatedText: editText });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this translation?")) return;
    deleteMut.mutate({ id });
  };

  if (isLoading) return null;

  // In read-only mode with no translations, show nothing (no empty state)
  if (readOnly && translations.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* Saved language badges row */}
      <div className="flex flex-wrap items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {translations.length === 0 && !readOnly && (
          <span className="text-xs text-muted-foreground">No saved translations yet</span>
        )}
        {translations.map((t) => {
          const isExpanded = expandedId === t.id;
          const langLabel = LANG_LABELS[t.targetLanguage ?? "en"] ?? (t.targetLanguage ?? "?").toUpperCase();
          return (
            <button
              key={t.id}
              onClick={() => setExpandedId(isExpanded ? null : t.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
            >
              {langLabel}
              <Check className="h-2.5 w-2.5" />
              {isExpanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            </button>
          );
        })}

        {/* Extract new language button — only for translatable file types, not in read-only mode */}
        {!readOnly && canTranslate && (
          <>
            {availableLangs.length > 0 && !translateMut.isPending && (
              <button
                onClick={() => setShowExtractPanel(!showExtractPanel)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border border-dashed border-primary/40 text-primary hover:bg-primary/10 transition-colors"
              >
                <Sparkles className="h-2.5 w-2.5" />
                {showExtractPanel ? "Cancel" : "+ Extract"}
              </button>
            )}
            {translateMut.isPending && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border border-primary/30 text-primary bg-primary/5 animate-pulse">
                <Sparkles className="h-2.5 w-2.5" />
                Extracting…
              </span>
            )}
            {availableLangs.length === 0 && translations.length > 0 && (
              <span className="text-xs text-muted-foreground">All languages extracted</span>
            )}
          </>
        )}
        {!readOnly && !canTranslate && (
          <span className="text-xs text-muted-foreground italic">AI translation not available for radiology images / DICOM files</span>
        )}
      </div>

      {/* Extract new language panel — hidden in read-only mode and while extracting */}
      {!readOnly && showExtractPanel && !translateMut.isPending && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-dashed border-primary/30">
          <Select value={selectedLang} onValueChange={setSelectedLang}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableLangs.map((l) => (
                <SelectItem key={l.code} value={l.code} className="text-xs">
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleExtract}
            disabled={translateMut.isPending}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            Extract
          </Button>
        </div>
      )}

      {/* Expanded translation panel */}
      {expandedId !== null && (() => {
        const t = translations.find((x) => x.id === expandedId);
        if (!t) return null;
        const langName = LANGUAGES.find((l) => l.code === t.targetLanguage)?.label ?? t.targetLanguage ?? "Unknown";
        return (
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">{langName} Translation</span>
              </div>
              <div className="flex items-center gap-1">
                {!readOnly && editingId !== t.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleEdit(t.id, t.translatedText ?? "")}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                )}
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(t.id)}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setExpandedId(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="p-3">
              {!readOnly && editingId === t.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="min-h-[160px] text-sm font-mono"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleSaveEdit}
                      disabled={updateMut.isPending}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      {updateMut.isPending ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none max-h-64 overflow-y-auto">
                  {t.translatedText ? (
                    <Streamdown>{t.translatedText}</Streamdown>
                  ) : (
                    <span className="text-muted-foreground italic text-xs">No content available</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
