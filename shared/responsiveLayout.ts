/**
 * The protected shell uses a compact/sidebar-sheet interaction model below
 * 1024px. Patient Profile must use the same boundary rather than switching to
 * its desktop header and tab strip at Tailwind's `sm` breakpoint.
 */
export const COMPACT_PATIENT_LAYOUT_BREAKPOINT = 1024;

export function isCompactPatientLayout(width: number): boolean {
  return width < COMPACT_PATIENT_LAYOUT_BREAKPOINT;
}

export const TABLET_DIALOG_MAX_HEIGHT_CLASS = "max-h-[calc(100dvh-2rem)]";
