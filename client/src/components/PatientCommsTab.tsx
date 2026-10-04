import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Archive, MessageSquare, Pencil, Plus, Trash2, User } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * PatientCommsTab — CRM Notes for a Patient record.
 *
 * Source-of-truth routing (Option A, approved 2026-07-13):
 *
 *   Linked Patient (socialLeadId set):
 *     READ  → trpc.leads.communications  (lead_communications WHERE leadId = socialLeadId)
 *     WRITE → trpc.leads.addCommunication / editCommunication / deleteCommunication
 *
 *   Unlinked Patient (no socialLeadId):
 *     READ  → trpc.patientComms.list  (patient_communications WHERE patientId = patientId)
 *     WRITE → trpc.patientComms.create / edit / delete
 *
 * Legacy Patient Notes (existing patient_communications rows for linked Patients):
 *   Shown as a read-only collapsed section below the canonical Lead notes.
 *   Data repair completed 2026-07-13: 8 misassigned rows deleted (Patient 300001).
 */

interface PatientCommsTabProps {
  patientId: number;
  /** The linked Lead ID from patient.socialLeadId. Pass null/undefined for unlinked patients. */
  socialLeadId?: number | null;
}

export function PatientCommsTab({ patientId, socialLeadId }: PatientCommsTabProps) {
  const isLinked = !!socialLeadId;
  const linkedLeadId = socialLeadId ?? 0; // safe placeholder; queries are disabled when 0

  const [showAdd, setShowAdd] = useState(false);
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBuf, setEditBuf] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!showAdd) setNote("");
  }, [showAdd]);

  const utils = trpc.useUtils();

  // ─── Legacy Patient Notes (linked path only) ─────────────────────────────────
  const { data: legacyPatientComms, isLoading: legacyLoading } =
    trpc.patientComms.list.useQuery({ patientId }, { enabled: isLinked });

  // ─── Linked path: read from lead_communications ──────────────────────────────
  const { data: leadComms, isLoading: leadCommsLoading } =
    trpc.leads.communications.useQuery(
      { leadId: linkedLeadId },
      { enabled: isLinked && linkedLeadId > 0 }
    );

  const addLeadComm = trpc.leads.addCommunication.useMutation({
    onSuccess: () => {
      toast.success("Communication logged");
      void utils.leads.communications.invalidate({ leadId: linkedLeadId });
      void utils.patientComms.list.invalidate({ patientId });
      setShowAdd(false);
    },
    onError: (e) => {
      toast.error((e as any)?.data?.zodError ? "Please check the form fields." : e.message || "Something went wrong.");
    },
  });

  const editLeadComm = trpc.leads.editCommunication.useMutation({
    onSuccess: () => {
      toast.success("Note updated");
      void utils.leads.communications.invalidate({ leadId: linkedLeadId });
      setEditingId(null);
      setEditBuf("");
    },
    onError: (e) => {
      toast.error((e as any)?.data?.zodError ? "Please check the form fields." : e.message || "Something went wrong.");
    },
  });

  const deleteLeadComm = trpc.leads.deleteCommunication.useMutation({
    onSuccess: () => {
      toast.success("Note deleted");
      void utils.leads.communications.invalidate({ leadId: linkedLeadId });
      setDeletingId(null);
    },
    onError: (e) => {
      toast.error((e as any)?.data?.zodError ? "Please check the form fields." : e.message || "Something went wrong.");
    },
  });

  // ─── Unlinked path: read from patient_communications ─────────────────────────
  const { data: patientComms, isLoading: patientCommsLoading, refetch: refetchPatientComms } =
    trpc.patientComms.list.useQuery({ patientId }, { enabled: !isLinked });

  const addPatientComm = trpc.patientComms.create.useMutation({
    onSuccess: () => {
      toast.success("Communication logged");
      void refetchPatientComms();
      setShowAdd(false);
    },
    onError: (e) => {
      toast.error((e as any)?.data?.zodError ? "Please check the form fields." : e.message || "Something went wrong.");
    },
  });

  const editPatientComm = trpc.patientComms.edit.useMutation({
    onSuccess: () => {
      toast.success("Note updated");
      void refetchPatientComms();
      setEditingId(null);
      setEditBuf("");
    },
    onError: (e) => {
      toast.error((e as any)?.data?.zodError ? "Please check the form fields." : e.message || "Something went wrong.");
    },
  });

  const deletePatientComm = trpc.patientComms.delete.useMutation({
    onSuccess: () => {
      toast.success("Note deleted");
      void refetchPatientComms();
      setDeletingId(null);
    },
    onError: (e) => {
      toast.error((e as any)?.data?.zodError ? "Please check the form fields." : e.message || "Something went wrong.");
    },
  });

  // ─── Derived state ────────────────────────────────────────────────────────────
  const isLoading = isLinked ? leadCommsLoading : patientCommsLoading;
  const isAddPending = isLinked ? addLeadComm.isPending : addPatientComm.isPending;
  const isEditPending = isLinked ? editLeadComm.isPending : editPatientComm.isPending;
  const isDeletePending = isLinked ? deleteLeadComm.isPending : deletePatientComm.isPending;

  const comms: Array<{ id: number; note: string; createdAt: Date | string; authorName?: string | null; updatedAt?: Date | string | null }> =
    isLinked ? (leadComms ?? []) : (patientComms ?? []);

  const legacyComms = legacyPatientComms ?? [];

  // ─── Handlers ─────────────────────────────────────────────────────────────────
  const handleAdd = () => {
    if (!note.trim()) { toast.error("Please enter a note"); return; }
    if (isLinked) {
      if (!socialLeadId || socialLeadId <= 0) {
        toast.error("Cannot save: the linked Lead ID has not resolved. Please refresh the page and try again.");
        return;
      }
      addLeadComm.mutate({ leadId: socialLeadId, note: note.trim() });
    } else {
      addPatientComm.mutate({ patientId, note: note.trim() });
    }
  };

  const handleEdit = (id: number) => {
    if (!editBuf.trim()) { toast.error("Please enter a note"); return; }
    if (isLinked) {
      editLeadComm.mutate({ id, leadId: linkedLeadId, note: editBuf.trim() });
    } else {
      editPatientComm.mutate({ id, patientId, note: editBuf.trim() });
    }
  };

  const handleDelete = (id: number) => {
    if (isLinked) {
      deleteLeadComm.mutate({ id, leadId: linkedLeadId });
    } else {
      deletePatientComm.mutate({ id, patientId });
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">CRM Notes</h3>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd((s) => !s)}>
          <Plus className="h-3.5 w-3.5" /> Add CRM Note
        </Button>
      </div>

      {showAdd && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <Textarea
            placeholder="Log a call, WhatsApp message, email, meeting note, or any CRM activity..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={isAddPending}>
              {isAddPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading notes…</div>
      ) : comms.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No CRM notes yet</p>
          <p className="text-xs mt-1">Log calls, messages, meetings, and CRM activities here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {comms.map((c) => (
            <div key={c.id} className="flex gap-3 p-3 rounded-lg border bg-card">
              <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                {editingId === c.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editBuf}
                      onChange={(e) => setEditBuf(e.target.value)}
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => { setEditingId(null); setEditBuf(""); }}>Cancel</Button>
                      <Button size="sm" disabled={!editBuf.trim() || isEditPending} onClick={() => handleEdit(c.id)}>
                        {isEditPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">{c.authorName ?? "Staff"}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(c.createdAt), "dd MMM yyyy, HH:mm")}
                      </span>
                      {c.updatedAt && (
                        <span className="text-xs text-muted-foreground italic">· Edited</span>
                      )}
                    </div>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.note}</p>
                  </>
                )}
              </div>
              {editingId !== c.id && (
                <div className="shrink-0 flex flex-col gap-1">
                  <button
                    onClick={() => { setEditingId(c.id); setEditBuf(c.note); }}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit note"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <AlertDialog open={deletingId === c.id} onOpenChange={(open) => !open && setDeletingId(null)}>
                    <AlertDialogTrigger asChild>
                      <button
                        onClick={() => setDeletingId(c.id)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. The note will be permanently removed from this patient's CRM log.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(c.id)}
                          disabled={isDeletePending}
                        >
                          {isDeletePending ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Legacy Patient Notes — read-only, shown only for linked patients */}
      {isLinked && !legacyLoading && legacyComms.length > 0 && (
        <details className="mt-4">
          <summary className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none py-2">
            <Archive className="h-3.5 w-3.5" />
            <span>Legacy Patient Notes ({legacyComms.length}) — read-only, pre-migration entries</span>
          </summary>
          <div className="mt-2 space-y-2 opacity-70">
            {legacyComms.map((c) => (
              <div key={`legacy-${c.id}`} className="flex gap-3 p-3 rounded-lg border border-dashed bg-muted/20">
                <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                  <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{c.authorName ?? "Staff"}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(c.createdAt), "dd MMM yyyy, HH:mm")}
                    </span>
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">legacy</span>
                  </div>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.note}</p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
