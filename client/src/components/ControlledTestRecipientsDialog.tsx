import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { DraftBanner, useDraftForm } from "@/hooks/useDraftForm";
import { trpc } from "@/lib/trpc";
import { Loader2, Shield, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

export function ControlledTestRecipientsDialog({
  open,
  onOpenChange,
  lineId,
  lineName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineId: number | null;
  lineName: string;
}) {
  const { form, setForm, hasDraft, clearDraft } = useDraftForm<{ phone: string; label: string }>({
    key: `inbox-synthetic-test-recipients-${lineId ?? "none"}`,
    initialData: { phone: "", label: "" },
  });
  const [saving, setSaving] = useState(false);
  const registryQuery = trpc.inbox.syntheticTestRecipients.useQuery(
    lineId ? { lineId } : undefined,
    { enabled: open && Boolean(lineId), retry: false },
  );
  const approve = trpc.inbox.approveSyntheticTestRecipient.useMutation();
  const revoke = trpc.inbox.revokeSyntheticTestRecipient.useMutation();
  const recipients = useMemo(() => Array.isArray(registryQuery.data)
    ? registryQuery.data as Array<{ id: number; phone: string; label: string | null; status: "active" | "revoked"; approvedAt: Date | string; revokedAt: Date | string | null }>
    : [], [registryQuery.data]);
  const dirty = Boolean(form.phone.trim() || form.label.trim());
  useBeforeUnload(open && dirty && !saving);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!lineId) {
      toast.error("Choose a test line first.");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Enter an international test number.");
      return;
    }
    setSaving(true);
    try {
      await approve.mutateAsync({ lineId, phone: form.phone.trim(), label: form.label.trim() || undefined });
      toast.success("Controlled test recipient approved.");
      clearDraft();
      await registryQuery.refetch();
    } catch {
      toast.error("The controlled test recipient could not be approved. Please review the number and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeRecipient(recipientId: number) {
    setSaving(true);
    try {
      await revoke.mutateAsync({ recipientId });
      toast.success("Controlled test recipient revoked.");
      await registryQuery.refetch();
    } catch {
      toast.error("The controlled test recipient could not be revoked. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !saving) clearDraft();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shield className="h-4 w-4 text-[#1E0566]" />Test Mode recipients</DialogTitle>
          <DialogDescription>Approve only numbers you personally control for this non-production WhatsApp line. This area is administrator-only and is never used for production patient messaging.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <DraftBanner hasDraft={hasDraft} onDiscard={clearDraft} />
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Test line: <span className="font-medium">{lineName || "Choose a line"}</span>. Approval and revocation are recorded in the audit log.</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="test-mode-phone">E.164 test number</Label><Input id="test-mode-phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+905xxxxxxxxx" inputMode="tel" disabled={saving} /></div>
            <div className="space-y-2"><Label htmlFor="test-mode-label">Label (optional)</Label><Input id="test-mode-label" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="e.g. Admin test phone" disabled={saving} /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Close</Button><Button type="submit" disabled={saving || !lineId} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Approve / reconfirm</Button></DialogFooter>
        </form>
        <div className="space-y-2 border-t pt-4"><p className="text-sm font-medium">Approval history</p>{registryQuery.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading recipients…</p> : recipients.length === 0 ? <p className="text-sm text-muted-foreground">No controlled test recipients have been approved for this line.</p> : <div className="space-y-2">{recipients.map((recipient) => <div key={recipient.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{recipient.label || "Controlled test recipient"}</p><p className="truncate text-xs text-muted-foreground">{recipient.phone} · {recipient.status === "active" ? "Approved" : "Revoked"}</p></div>{recipient.status === "active" && <Button type="button" variant="outline" size="sm" onClick={() => void revokeRecipient(recipient.id)} disabled={saving} className="shrink-0 gap-1 text-red-700 hover:text-red-800"><X className="h-3.5 w-3.5" />Revoke</Button>}</div>)}</div>}</div>
      </DialogContent>
    </Dialog>
  );
}
