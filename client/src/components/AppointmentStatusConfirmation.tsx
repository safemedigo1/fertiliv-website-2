import { AppointmentDetailsSecondaryLayer } from "@/components/AppointmentDetailsSecondaryLayer";
import { Button } from "@/components/ui/button";

export type AppointmentStatusAction = "confirm" | "reactivate" | "complete" | "no_show";

const STATUS_CONFIRMATION_COPY: Record<AppointmentStatusAction, {
  title: string;
  description: string;
  confirmLabel: string;
}> = {
  confirm: {
    title: "Confirm appointment?",
    description: "Are you sure you want to confirm this appointment?",
    confirmLabel: "Yes, Confirm",
  },
  reactivate: {
    title: "Re-activate appointment?",
    description: "Are you sure you want to re-activate this appointment?",
    confirmLabel: "Yes, Re-activate",
  },
  complete: {
    title: "Complete appointment?",
    description: "Are you sure you want to mark this appointment as completed?",
    confirmLabel: "Yes, Complete",
  },
  no_show: {
    title: "Mark appointment as No Show?",
    description: "Are you sure you want to mark this appointment as No Show?",
    confirmLabel: "Yes, Mark No Show",
  },
};

export function AppointmentStatusConfirmation({
  action,
  onActionChange,
  onConfirm,
  isPending = false,
}: {
  action: AppointmentStatusAction | null;
  onActionChange: (action: AppointmentStatusAction | null) => void;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  if (!action) return null;
  const copy = STATUS_CONFIRMATION_COPY[action];

  return (
    <AppointmentDetailsSecondaryLayer
      open
      title={copy.title}
      description={copy.description}
      onDismiss={() => { if (!isPending) onActionChange(null); }}
    >
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" disabled={isPending} onClick={() => onActionChange(null)}>Cancel</Button>
        <Button disabled={isPending} onClick={onConfirm}>{copy.confirmLabel}</Button>
      </div>
    </AppointmentDetailsSecondaryLayer>
  );
}
