/**
 * DuplicateWarning
 * Displays a real-time SOFT WARNING when an email, phone, or secondary phone
 * already exists in the system. Staff can acknowledge and proceed anyway.
 *
 * This is NOT a hard block — it is informational only. The parent form is
 * responsible for deciding whether to allow saving despite the warning.
 *
 * Usage:
 *   <DuplicateWarning
 *     entity="patients"
 *     email={emailValue}
 *     phone={phoneValue}
 *     secondaryPhone={secondaryPhoneValue}
 *     excludeId={editingPatientId}  // omit on create
 *     onOverrideChange={setOverrideConfirmed}
 *   />
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type Entity = "patients" | "leads" | "users" | "doctors" | "partner_clinics";

interface Props {
  entity: Entity;
  email?: string;
  phone?: string;
  secondaryPhone?: string;
  excludeId?: number;
  /** Called whenever the override checkbox changes */
  onOverrideChange?: (confirmed: boolean) => void;
  /** Called whenever the duplicate detection status changes */
  onHasDuplicateChange?: (hasDuplicate: boolean) => void;
}

function useDebounce<T>(value: T, delay = 600): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const FIELD_LABEL: Record<string, string> = {
  email: "email address",
  phone: "phone number",
  secondaryPhone: "secondary phone number",
};

export function DuplicateWarning({
  entity,
  email,
  phone,
  secondaryPhone,
  excludeId,
  onOverrideChange,
  onHasDuplicateChange,
}: Props) {
  const debouncedEmail = useDebounce(email?.trim() || "");
  const debouncedPhone = useDebounce(phone?.trim() || "");
  const debouncedSecondaryPhone = useDebounce(secondaryPhone?.trim() || "");
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);

  const hasInput = !!(debouncedEmail || debouncedPhone || debouncedSecondaryPhone);

  const { data } = trpc.duplicateCheck.check.useQuery(
    {
      entity,
      email: debouncedEmail || undefined,
      phone: debouncedPhone || undefined,
      secondaryPhone: debouncedSecondaryPhone || undefined,
      excludeId,
    },
    {
      enabled: hasInput,
      staleTime: 10_000,
    }
  );

  // Reset override when conflicts change; notify parent of duplicate status
  useEffect(() => {
    if (!data?.hasDuplicate) {
      setOverrideConfirmed(false);
      onOverrideChange?.(false);
    }
    onHasDuplicateChange?.(!!data?.hasDuplicate);
  }, [data?.hasDuplicate, onOverrideChange, onHasDuplicateChange]);

  if (!data?.hasDuplicate) return null;

  const conflicts = data.conflicts;

  const handleOverride = (checked: boolean) => {
    setOverrideConfirmed(checked);
    onOverrideChange?.(checked);
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="text-sm text-amber-800 space-y-1">
          {conflicts.map((c, i) => (
            <p key={i}>
              This <strong>{FIELD_LABEL[c.field] ?? c.field}</strong> is already registered
              {c.conflictName?.trim() ? (
                <> to <strong>{c.conflictName}</strong></>
              ) : (
                " to another record"
              )}
              .
            </p>
          ))}
          <p className="text-xs text-amber-700 mt-1">
            This may be a shared contact (e.g. a couple). You can still save if this is intentional.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-amber-200">
        <Checkbox
          id="override-duplicate"
          checked={overrideConfirmed}
          onCheckedChange={(v) => handleOverride(v === true)}
        />
        <Label
          htmlFor="override-duplicate"
          className="text-xs text-amber-800 cursor-pointer font-medium"
        >
          I understand — this is intentional, save anyway
        </Label>
        {overrideConfirmed && (
          <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto shrink-0" />
        )}
      </div>
    </div>
  );
}

export default DuplicateWarning;
