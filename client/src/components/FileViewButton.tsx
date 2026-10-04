/**
 * FileViewButton — A shared component for viewing/downloading files.
 *
 * For DICOM files (.dcm, .dicom, application/dicom):
 *   - Shows "Open Viewer" button → opens /dicom-viewer in new tab
 *   - Shows "Download" link as secondary action
 *
 * For all other files:
 *   - Shows "View" link → opens file in new tab
 *
 * Usage:
 *   <FileViewButton fileUrl={url} fileName={name} mimeType={mime} />
 */
import { Maximize2, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDicom, openDicomViewer, normaliseFileUrl } from "@/lib/fileUrl";

interface FileViewButtonProps {
  fileUrl: string | null | undefined;
  fileName?: string | null;
  mimeType?: string | null;
  /** Label shown in the DICOM viewer header. Defaults to fileName. */
  label?: string;
  /** Size variant for the button. Defaults to "sm". */
  size?: "sm" | "default";
  /** If true, show compact icon-only style */
  compact?: boolean;
}

export function FileViewButton({
  fileUrl,
  fileName,
  mimeType,
  label,
  size = "sm",
  compact = false,
}: FileViewButtonProps) {
  if (!fileUrl) return null;

  const normUrl = normaliseFileUrl(fileUrl);
  const dicom = isDicom(fileName, mimeType);
  const displayLabel = label || fileName || "File";

  if (dicom) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size={size}
          className="gap-1 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 h-7 text-xs"
          onClick={() => openDicomViewer(fileUrl, displayLabel)}
          title="Open in DICOM Viewer"
        >
          <Maximize2 className="h-3 w-3" />
          {!compact && "Open Viewer"}
        </Button>
        <a
          href={normUrl}
          target="_blank"
          rel="noopener noreferrer"
          download
          title="Download DICOM file"
        >
          <Button
            variant="ghost"
            size={size}
            className="gap-1 text-muted-foreground h-7 text-xs"
          >
            <Download className="h-3 w-3" />
            {!compact && "Download"}
          </Button>
        </a>
      </div>
    );
  }

  // Regular file — just a view link
  return (
    <a href={normUrl} target="_blank" rel="noopener noreferrer">
      <Button
        variant="ghost"
        size={size}
        className="gap-1 h-7 text-xs"
        title="View file"
      >
        <ExternalLink className="h-3 w-3" />
        {!compact && "View"}
      </Button>
    </a>
  );
}

/**
 * DicomBadgeButton — Compact inline button used inside text/lists for DICOM files.
 * Renders as a small DCM badge + filename link.
 */
export function DicomBadgeButton({
  fileUrl,
  fileName,
  label,
}: {
  fileUrl: string;
  fileName?: string;
  label?: string;
}) {
  const displayLabel = label || fileName || "DICOM";
  return (
    <button
      type="button"
      onClick={() => openDicomViewer(fileUrl, displayLabel)}
      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 text-xs flex items-center gap-0.5 underline"
      title="Open in DICOM Viewer"
    >
      <span className="inline-flex items-center justify-center bg-blue-600 text-white text-[7px] font-bold px-1 py-0.5 rounded">DCM</span>
      {displayLabel}
    </button>
  );
}
