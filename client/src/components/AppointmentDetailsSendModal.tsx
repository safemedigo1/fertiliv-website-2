import { useEffect, useMemo, useState } from "react";
import { Mail, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useDraftForm } from "@/hooks/useDraftForm";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Language = string;
type DraftRecipient = {
  id: string;
  source: "primary" | "partner" | "additional";
  email: string;
  displayName?: string;
  language: Language;
  localeFallbackUsed?: boolean;
  localeFallbackFrom?: string | null;
  selected: boolean;
};
type SendDraft = {
  recipients: DraftRecipient[];
  additionalEmail: string;
  additionalLanguage: Language;
};

function normalizeSupportedLanguage(value?: string | null): Language {
  return value?.trim().toLowerCase() || "en";
}

function buildInitialDraft(recipients: Array<{ source: "primary" | "partner"; email: string; displayName: string; preferredLanguage?: string | null; defaultLanguage?: string | null; localeFallbackUsed?: boolean; localeFallbackFrom?: string | null }>): SendDraft {
  return {
    recipients: recipients.map(recipient => ({
      id: `${recipient.source}:${recipient.email.toLowerCase()}`,
      source: recipient.source,
      email: recipient.email,
      displayName: recipient.displayName,
      language: normalizeSupportedLanguage(recipient.defaultLanguage),
      localeFallbackUsed: recipient.localeFallbackUsed,
      localeFallbackFrom: recipient.localeFallbackFrom,
      selected: recipient.source === "primary",
    })),
    additionalEmail: "",
    additionalLanguage: "en",
  };
}

export function AppointmentDetailsSendModal({
  appointmentId,
  open,
  onOpenChange,
}: {
  appointmentId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const { data: options, isLoading, isFetching } = trpc.appointments.communicationOptions.useQuery(
    { appointmentId },
    { enabled: open, refetchOnMount: "always", staleTime: 0 },
  );
  const { form, setForm, clearDraft, initFromServer } = useDraftForm<SendDraft>({
    key: `appointment-details-email-l1-${appointmentId}`,
    initialData: { recipients: [], additionalEmail: "", additionalLanguage: "en" },
    disabled: !open,
  });
  const sendDetails = trpc.appointments.sendDetails.useMutation({
    onSuccess: result => {
      clearDraft();
      setIsDirty(false);
      if (result.sentCount > 0 && result.failedCount === 0) {
        toast.success(`${options?.actionLabel ?? "Appointment communication"} sent to ${result.sentCount} recipient${result.sentCount === 1 ? "" : "s"}.`);
      } else if (result.sentCount > 0) {
        toast.warning(`Sent to ${result.sentCount}; ${result.failedCount} ${result.failedCount === 1 ? "delivery" : "deliveries"} failed.`);
      } else {
        toast.error("Appointment communication could not be delivered. Please review the recipient email and try again.");
      }
      onOpenChange(false);
    },
    onError: error => {
      const message = (error as any)?.data?.zodError
        ? "Please review the selected recipients and email addresses."
        : error.message || "Appointment communication could not be sent. Please try again.";
      toast.error(message);
    },
  });
  useBeforeUnload(open && isDirty && !sendDetails.isPending);

  const availableRecipients = useMemo(() => (options?.recipients ?? []) as Array<{
    source: "primary" | "partner";
    email: string;
    displayName: string;
    preferredLanguage?: string | null;
    defaultLanguage?: string | null;
    localeFallbackUsed?: boolean;
    localeFallbackFrom?: string | null;
  }>, [options?.recipients]);
  const localeOptions = useMemo(() => ((options as any)?.supportedLocales ?? [{ code: "en", label: "English" }]) as Array<{ code: string; label: string }>, [options]);

  useEffect(() => {
    // Do not initialize from a cached response while an open-triggered refresh can
    // still return a newer Primary Language from the authoritative profile record.
    if (!open || !options || isFetching) return;
    initFromServer(buildInitialDraft(availableRecipients));
  }, [availableRecipients, initFromServer, isFetching, open, options]);

  const selectedRecipients = form.recipients.filter(recipient => recipient.selected);
  const hasPrimaryOrManualRecipient = selectedRecipients.length > 0;
  const additionalEmailIsValid = !form.additionalEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.additionalEmail.trim());

  const updateRecipient = (id: string, patch: Partial<DraftRecipient>) => {
    setIsDirty(true);
    setForm(current => ({
      ...current,
      recipients: current.recipients.map(recipient => recipient.id === id ? { ...recipient, ...patch } : recipient),
    }));
  };

  const addAdditionalRecipient = () => {
    const email = form.additionalEmail.trim().toLowerCase();
    if (!email || !additionalEmailIsValid) {
      toast.error("Enter a valid additional email address first.");
      return;
    }
    if (form.recipients.some(recipient => recipient.email.toLowerCase() === email)) {
      toast.error("This email is already in the recipient list.");
      return;
    }
    setIsDirty(true);
    setForm(current => ({
      ...current,
      recipients: [...current.recipients, {
        id: `additional:${crypto.randomUUID()}`,
        source: "additional",
        email,
        language: current.additionalLanguage,
        selected: true,
      }],
      additionalEmail: "",
    }));
  };

  const removeAdditionalRecipient = (id: string) => {
    setIsDirty(true);
    setForm(current => ({ ...current, recipients: current.recipients.filter(recipient => recipient.id !== id) }));
  };

  const cancel = () => {
    clearDraft();
    setIsDirty(false);
    onOpenChange(false);
  };

  const submit = () => {
    if (!options?.canSend) {
      toast.error("Manual appointment communication is unavailable for this appointment status.");
      return;
    }
    if (!hasPrimaryOrManualRecipient) {
      toast.error("Select at least one recipient.");
      return;
    }
    sendDetails.mutate({
      appointmentId,
      recipients: selectedRecipients.map(recipient => ({
        source: recipient.source,
        email: recipient.email,
        language: recipient.language,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) cancel(); else onOpenChange(true); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> {options?.actionLabel ?? "Send Appointment Details"}</DialogTitle>
          <DialogDescription>
            {options?.status === "cancelled"
              ? "Sends a manual cancellation notice using safe appointment data only. The cancellation reason, medical information, financial information, internal notes, and appointment title are excluded."
              : "Sends approved operational details only. Medical notes, financial information, internal notes, and the appointment title are excluded."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading available recipients…</div>
        ) : !options?.canSend ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Manual appointment communication is not available for this appointment status.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Recipients</Label>
              {form.recipients.filter(recipient => recipient.source !== "additional").length === 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No saved primary or linked-partner email is available. Add an email below.</p>
              ) : form.recipients.filter(recipient => recipient.source !== "additional").map(recipient => (
                <div key={recipient.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <Checkbox
                      id={recipient.id}
                      checked={recipient.selected}
                      onCheckedChange={checked => updateRecipient(recipient.id, { selected: checked === true })}
                    />
                    <Label htmlFor={recipient.id} className="min-w-0 cursor-pointer text-sm leading-5">
                      <span className="block font-medium">{recipient.displayName} {recipient.source === "partner" ? <span className="font-normal text-muted-foreground">(linked partner)</span> : null}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">{recipient.email}</span>
                      {recipient.localeFallbackUsed ? <span className="block text-xs font-normal text-amber-700">English fallback from {recipient.localeFallbackFrom ?? "profile language"}</span> : null}
                    </Label>
                  </div>
                  <Select value={recipient.language} onValueChange={language => updateRecipient(recipient.id, { language: language as Language })}>
                    <SelectTrigger className="h-9 w-full sm:w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {localeOptions.map(locale => <SelectItem key={locale.code} value={locale.code}>{locale.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">A linked partner is shown only as an optional recipient and is never selected automatically.</p>
            </div>

            {form.recipients.filter(recipient => recipient.source === "additional").map(recipient => (
              <div key={recipient.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <Checkbox id={recipient.id} checked={recipient.selected} onCheckedChange={checked => updateRecipient(recipient.id, { selected: checked === true })} />
                  <Label htmlFor={recipient.id} className="min-w-0 cursor-pointer text-sm"><span className="block font-medium">Additional email</span><span className="block truncate text-xs font-normal text-muted-foreground">{recipient.email}</span></Label>
                </div>
                <div className="flex gap-2">
                  <Select value={recipient.language} onValueChange={language => updateRecipient(recipient.id, { language: language as Language })}>
                    <SelectTrigger className="h-9 flex-1 sm:w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{localeOptions.map(locale => <SelectItem key={locale.code} value={locale.code}>{locale.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove additional recipient" onClick={() => removeAdditionalRecipient(recipient.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-dashed p-3">
              <Label htmlFor="additional-recipient" className="text-sm">Add another email</Label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  id="additional-recipient"
                  type="email"
                  value={form.additionalEmail}
                  onChange={event => { setIsDirty(true); setForm(current => ({ ...current, additionalEmail: event.target.value })); }}
                  placeholder="name@example.com"
                  aria-invalid={!additionalEmailIsValid}
                />
                <Select value={form.additionalLanguage} onValueChange={language => { setIsDirty(true); setForm(current => ({ ...current, additionalLanguage: language as Language })); }}>
                  <SelectTrigger className="h-10 w-full sm:w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{localeOptions.map(locale => <SelectItem key={locale.code} value={locale.code}>{locale.label}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="outline" className="gap-1" onClick={addAdditionalRecipient}><Plus className="h-4 w-4" /> Add</Button>
              </div>
              {!additionalEmailIsValid && <p className="mt-1 text-xs text-destructive">Enter a valid email address.</p>}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={cancel} disabled={sendDetails.isPending}>Cancel</Button>
              <Button type="button" className="gap-1.5" onClick={submit} disabled={sendDetails.isPending || !hasPrimaryOrManualRecipient}>
                {sendDetails.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {sendDetails.isPending ? "Sending…" : (options?.actionLabel ?? "Send Appointment Details")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
