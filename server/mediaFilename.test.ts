import { describe, expect, it } from "vitest";
import { buildMediaFilename, extensionForMediaMime } from "../shared/mediaFilename";

describe("channel-neutral media filenames", () => {
  it("preserves a useful provider filename and adds a MIME extension when absent", () => {
    expect(buildMediaFilename({ originalFilename: "clinic-photo", mimeType: "image/jpeg", mediaType: "image", seed: 1 })).toBe("clinic-photo.jpg");
    expect(buildMediaFilename({ originalFilename: "result.pdf", mimeType: "application/pdf", mediaType: "document", seed: 2 })).toBe("result.pdf");
  });

  it("replaces generic placeholders with deterministic MIME-aware names", () => {
    expect(buildMediaFilename({ originalFilename: "attachment", mimeType: "image/jpeg", mediaType: "image", seed: 180001 })).toMatch(/^whatsapp-image-[a-f0-9]{12}\.jpg$/);
    expect(buildMediaFilename({ originalFilename: null, mimeType: "application/pdf", mediaType: "document", seed: 7 })).toMatch(/^whatsapp-document-[a-f0-9]{12}\.pdf$/);
    expect(buildMediaFilename({ originalFilename: "attachment", mimeType: "text/markdown", mediaType: "document", seed: 8 })).toMatch(/^whatsapp-document-[a-f0-9]{12}\.md$/);
    expect(extensionForMediaMime("video/mp4", "video")).toBe("mp4");
    expect(extensionForMediaMime("application/octet-stream", "document")).toBe("document");
  });

  it("sanitizes path and control characters before using a filename in headers or storage", () => {
    expect(buildMediaFilename({ originalFilename: "../patient\\photo\n.jpg", mimeType: "image/jpeg", mediaType: "image", seed: 3 })).toBe("_patient_photo_.jpg");
  });
});
