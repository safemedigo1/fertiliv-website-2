import { useEffect, type ReactNode } from "react";

export function AppointmentDetailsSecondaryLayer({
  open,
  title,
  description,
  onDismiss,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss, open]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/75 p-4 backdrop-blur-[1px]"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onDismiss(); }}
    >
      <section
        aria-describedby={description ? "appointment-details-secondary-description" : undefined}
        aria-modal="true"
        aria-labelledby="appointment-details-secondary-title"
        className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg"
        role="alertdialog"
      >
        <h2 id="appointment-details-secondary-title" className="text-lg font-semibold">{title}</h2>
        {description && <p id="appointment-details-secondary-description" className="mt-2 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-4">{children}</div>
      </section>
    </div>
  );
}
