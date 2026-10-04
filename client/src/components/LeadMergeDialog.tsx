import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Merge, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface LeadMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  survivingLead: {
    id: number;
    firstName: string;
    lastName: string;
    email?: string | null;
    secondaryEmail?: string | null;
    phone?: string | null;
    secondaryPhone?: string | null;
    nationality?: string | null;
    country?: string | null;
    city?: string | null;
    gender?: string | null;
    leadStatus?: string | null;
    rating?: string | null;
    leadSource?: string | null;
    brand?: string | null;
    assignedStaffId?: number | null;
    preferredLanguages?: unknown;
    preferredContactMethod?: string | null;
    budgetRange?: string | null;
    decisionTimeline?: string | null;
    travelReadiness?: string | null;
    ivfExperience?: string | null;
    mainMedicalInterest?: unknown;
    fertilityDiagnosis?: unknown;
    tags?: unknown;
    notes?: string | null;
  };
}

type FieldKey = keyof LeadMergeDialogProps["survivingLead"];

const MERGE_FIELDS: { key: FieldKey; label: string; format?: (v: any) => string }[] = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "secondaryEmail", label: "Secondary Email" },
  { key: "phone", label: "Phone" },
  { key: "secondaryPhone", label: "Secondary Phone" },
  { key: "nationality", label: "Nationality" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "gender", label: "Gender" },
  { key: "leadStatus", label: "Status", format: (v) => v?.replace(/-/g, " ") },
  { key: "rating", label: "Rating" },
  { key: "leadSource", label: "Source", format: (v) => v?.replace(/-/g, " ") },
  { key: "brand", label: "Brand" },
  { key: "preferredLanguages", label: "Language", format: (v) => Array.isArray(v) ? v.join(", ") : v },
  { key: "preferredContactMethod", label: "Contact Method" },
  { key: "budgetRange", label: "Budget Range" },
  { key: "decisionTimeline", label: "Decision Timeline", format: (v) => v?.replace(/-/g, " ") },
  { key: "travelReadiness", label: "Travel Readiness", format: (v) => v?.replace(/-/g, " ") },
  { key: "ivfExperience", label: "IVF Experience", format: (v) => v?.replace(/-/g, " ") },
  { key: "mainMedicalInterest", label: "Main Medical Interest" },
  { key: "fertilityDiagnosis", label: "Fertility Diagnosis", format: (v) => Array.isArray(v) ? v.join(", ") : v },
  { key: "tags", label: "Tags" },
  { key: "notes", label: "Notes" },
];

function displayVal(val: any, format?: (v: any) => string): string {
  if (val === null || val === undefined || val === "") return "—";
  if (format) return format(val) || "—";
  if (Array.isArray(val)) return val.join(", ") || "—";
  return String(val);
}

function valuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return String(a ?? "") === String(b ?? "");
}

export function LeadMergeDialog({ open, onOpenChange, survivingLead }: LeadMergeDialogProps) {
  const [step, setStep] = useState<"search" | "compare" | "confirm">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDuplicate, setSelectedDuplicate] = useState<any>(null);
  // choices: "A" = surviving, "B" = duplicate
  const [choices, setChoices] = useState<Record<string, "A" | "B">>({});
  const [, navigate] = useLocation();

  const searchResults = trpc.leads.list.useQuery(
    { search: searchQuery, pageSize: 10 },
    { enabled: searchQuery.length >= 2 }
  );

  const mergeMutation = trpc.leads.merge.useMutation({
    onSuccess: () => {
      toast.success("Leads merged successfully", { description: "The duplicate lead has been merged into this lead." });
      onOpenChange(false);
      // Refresh the page
      window.location.reload();
    },
    onError: (err) => {
      toast.error("Merge failed", { description: err.message });
    },
  });

  function handleSelectDuplicate(lead: any) {
    if (lead.id === survivingLead.id) {
      toast.error("Cannot merge a lead with itself");
      return;
    }
    setSelectedDuplicate(lead);
    // Default all choices to "A" (surviving lead)
    const defaultChoices: Record<string, "A" | "B"> = {};
    for (const f of MERGE_FIELDS) {
      defaultChoices[f.key] = "A";
    }
    setChoices(defaultChoices);
    setStep("compare");
  }

  function handleMerge() {
    if (!selectedDuplicate) return;
    const chosenFields: Record<string, any> = {};
    for (const f of MERGE_FIELDS) {
      const source = choices[f.key] === "A" ? survivingLead : selectedDuplicate;
      const val = (source as any)[f.key];
      if (val !== null && val !== undefined && val !== "") {
        chosenFields[f.key] = val;
      }
    }
    // Auto-preserve secondary phone: if both leads have different phones,
    // the non-chosen phone goes to secondaryPhone (if not already filled)
    const phoneA = survivingLead.phone;
    const phoneB = selectedDuplicate.phone;
    if (phoneA && phoneB && phoneA !== phoneB) {
      const chosenPhone = choices["phone"] === "A" ? phoneA : phoneB;
      const otherPhone = choices["phone"] === "A" ? phoneB : phoneA;
      chosenFields["phone"] = chosenPhone;
      // Only set secondaryPhone if not already chosen explicitly
      if (!chosenFields["secondaryPhone"]) {
        chosenFields["secondaryPhone"] = otherPhone;
      }
    }
    // Auto-preserve secondary email: same logic
    const emailA = survivingLead.email;
    const emailB = selectedDuplicate.email;
    if (emailA && emailB && emailA !== emailB) {
      const chosenEmail = choices["email"] === "A" ? emailA : emailB;
      const otherEmail = choices["email"] === "A" ? emailB : emailA;
      chosenFields["email"] = chosenEmail;
      if (!chosenFields["secondaryEmail"]) {
        chosenFields["secondaryEmail"] = otherEmail;
      }
    }
    mergeMutation.mutate({
      survivingLeadId: survivingLead.id,
      duplicateLeadId: selectedDuplicate.id,
      chosenFields,
    });
  }

  function handleClose() {
    setStep("search");
    setSearchQuery("");
    setSelectedDuplicate(null);
    setChoices({});
    onOpenChange(false);
  }

  const diffFields = MERGE_FIELDS.filter(
    (f) => !valuesEqual((survivingLead as any)[f.key], selectedDuplicate?.[f.key])
  );
  const sameFields = MERGE_FIELDS.filter(
    (f) => valuesEqual((survivingLead as any)[f.key], selectedDuplicate?.[f.key])
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5 text-primary" />
            Merge Duplicate Lead
          </DialogTitle>
          <DialogDescription>
            {step === "search" && "Search for the duplicate lead to merge into this one."}
            {step === "compare" && "Choose which values to keep. Notes, tasks, and communications from both leads will be combined."}
            {step === "confirm" && "Review and confirm the merge. This action cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Search */}
        {step === "search" && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
            {searchQuery.length >= 2 && (
              <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                {searchResults.isLoading && (
                  <div className="p-4 text-sm text-muted-foreground text-center">Searching...</div>
                )}
                {!searchResults.isLoading && (!searchResults.data?.data || searchResults.data.data.length === 0) && (
                  <div className="p-4 text-sm text-muted-foreground text-center">No leads found</div>
                )}
                {searchResults.data?.data?.filter((l: any) => l.id !== survivingLead.id).map((lead: any) => (
                  <button
                    key={lead.id}
                    className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                    onClick={() => handleSelectDuplicate(lead)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{lead.displayFirstName ?? lead.firstName} {lead.displayLastName ?? lead.lastName}</div>
                        <div className="text-xs text-muted-foreground">{lead.email || lead.phone || "No contact info"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {lead.leadStatus && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {lead.leadStatus.replace(/-/g, " ")}
                          </Badge>
                        )}
                        {lead.nationality && (
                          <span className="text-xs text-muted-foreground">{lead.nationality}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Compare */}
        {step === "compare" && selectedDuplicate && (
          <div className="space-y-4">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 text-sm font-medium">
              <div className="text-muted-foreground">Field</div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-primary/20 border-2 border-primary flex-shrink-0" />
                <span className="truncate">
                  {(survivingLead as any).displayFirstName ?? survivingLead.firstName} {(survivingLead as any).displayLastName ?? survivingLead.lastName}
                  <span className="text-xs text-muted-foreground ml-1">(this lead)</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-orange-100 border-2 border-orange-400 flex-shrink-0" />
                <span className="truncate">
                  {(selectedDuplicate as any).displayFirstName ?? selectedDuplicate.firstName} {(selectedDuplicate as any).displayLastName ?? selectedDuplicate.lastName}
                  <span className="text-xs text-muted-foreground ml-1">(duplicate)</span>
                </span>
              </div>
            </div>

            {/* Conflicting fields */}
            {diffFields.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  {diffFields.length} conflicting field{diffFields.length !== 1 ? "s" : ""} — click to choose
                </div>
                {diffFields.map((f) => {
                  const aVal = displayVal((survivingLead as any)[f.key], f.format);
                  const bVal = displayVal(selectedDuplicate[f.key], f.format);
                  const choiceA = choices[f.key] === "A";
                  const choiceB = choices[f.key] === "B";
                  return (
                    <div key={f.key} className="grid grid-cols-[1fr_1fr_1fr] gap-3 items-center py-1.5 border-b last:border-0">
                      <div className="text-xs text-muted-foreground font-medium">{f.label}</div>
                      <button
                        className={`text-left text-sm px-3 py-2 rounded-md border-2 transition-all ${choiceA ? "border-primary bg-primary/5 font-medium" : "border-transparent hover:border-muted-foreground/30 hover:bg-muted/30"}`}
                        onClick={() => setChoices((c) => ({ ...c, [f.key]: "A" }))}
                      >
                        {choiceA && <CheckCircle2 className="h-3 w-3 text-primary inline mr-1" />}
                        <span className={aVal === "—" ? "text-muted-foreground italic" : ""}>{aVal}</span>
                      </button>
                      <button
                        className={`text-left text-sm px-3 py-2 rounded-md border-2 transition-all ${choiceB ? "border-orange-400 bg-orange-50 font-medium" : "border-transparent hover:border-muted-foreground/30 hover:bg-muted/30"}`}
                        onClick={() => setChoices((c) => ({ ...c, [f.key]: "B" }))}
                      >
                        {choiceB && <CheckCircle2 className="h-3 w-3 text-orange-400 inline mr-1" />}
                        <span className={bVal === "—" ? "text-muted-foreground italic" : ""}>{bVal}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Identical fields */}
            {sameFields.length > 0 && (
              <details className="group">
                <summary className="text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer flex items-center gap-1 select-none">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  {sameFields.length} identical field{sameFields.length !== 1 ? "s" : ""} (auto-merged)
                </summary>
                <div className="mt-2 space-y-1">
                  {sameFields.map((f) => (
                    <div key={f.key} className="grid grid-cols-[1fr_2fr] gap-3 py-1 text-sm">
                      <span className="text-xs text-muted-foreground">{f.label}</span>
                      <span className={displayVal((survivingLead as any)[f.key], f.format) === "—" ? "text-muted-foreground italic text-xs" : ""}>
                        {displayVal((survivingLead as any)[f.key], f.format)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Auto-preserve phone/email notice */}
            {(() => {
              const phoneA = survivingLead.phone;
              const phoneB = selectedDuplicate?.phone;
              const emailA = survivingLead.email;
              const emailB = selectedDuplicate?.email;
              const hasDiffPhone = phoneA && phoneB && phoneA !== phoneB;
              const hasDiffEmail = emailA && emailB && emailA !== emailB;
              if (!hasDiffPhone && !hasDiffEmail) return null;
              return (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                  <strong>Both values preserved:</strong>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {hasDiffPhone && (
                      <li>• Phone: <strong>{choices["phone"] === "A" ? phoneA : phoneB}</strong> → Primary &nbsp;|&nbsp; <strong>{choices["phone"] === "A" ? phoneB : phoneA}</strong> → Secondary Phone</li>
                    )}
                    {hasDiffEmail && (
                      <li>• Email: <strong>{choices["email"] === "A" ? emailA : emailB}</strong> → Primary &nbsp;|&nbsp; <strong>{choices["email"] === "A" ? emailB : emailA}</strong> → Secondary Email</li>
                    )}
                  </ul>
                </div>
              );
            })()}
            {/* Always-merged notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <strong>Always combined:</strong> All notes, tasks, communications, treatment proposals, and documents from both leads will be merged into this lead.
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "search" && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {step === "compare" && (
            <>
              <Button variant="outline" onClick={() => setStep("search")}>Back</Button>
              <Button onClick={() => setStep("confirm")} className="gap-2">
                <Merge className="h-4 w-4" />
                Review Merge
              </Button>
            </>
          )}
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={() => setStep("compare")}>Back</Button>
              <Button
                variant="destructive"
                onClick={handleMerge}
                disabled={mergeMutation.isPending}
                className="gap-2"
              >
                <Merge className="h-4 w-4" />
                {mergeMutation.isPending ? "Merging..." : `Merge & Archive Duplicate`}
              </Button>
            </>
          )}
        </DialogFooter>

        {/* Confirm step summary */}
        {step === "confirm" && selectedDuplicate && (
          <div className="space-y-3 -mt-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
              <div className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                This action cannot be undone
              </div>
              <ul className="text-amber-800 space-y-1 text-xs">
                <li>• <strong>{(selectedDuplicate as any).displayFirstName ?? selectedDuplicate.firstName} {(selectedDuplicate as any).displayLastName ?? selectedDuplicate.lastName}</strong> (duplicate) will be archived and marked as merged</li>
                <li>• All their notes, tasks, and communications will move to <strong>{(survivingLead as any).displayFirstName ?? survivingLead.firstName} {(survivingLead as any).displayLastName ?? survivingLead.lastName}</strong></li>
                <li>• The chosen field values will be applied to the surviving lead</li>
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
