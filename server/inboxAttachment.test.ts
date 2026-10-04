import { describe, expect, it } from "vitest";
import { base64FromBytes } from "../client/src/lib/inboxAttachment";
import { resolveUnifiedInboxAttachmentMime, unifiedInboxMediaTypeForMime } from "../shared/unifiedInbox";

describe("Unified Inbox attachment input safety", () => {
  it("classifies Markdown as a controlled document MIME", () => {
    expect(unifiedInboxMediaTypeForMime("text/markdown")).toBe("document");
    expect(resolveUnifiedInboxAttachmentMime("", "notes.md")).toBe("text/markdown");
    expect(resolveUnifiedInboxAttachmentMime("text/plain", "notes.md")).toBe("text/markdown");
    expect(resolveUnifiedInboxAttachmentMime("application/octet-stream", "result.pdf")).toBe("application/pdf");
  });

  it("does not derive an allowed MIME from an arbitrary extension or a misleading known browser MIME", () => {
    expect(resolveUnifiedInboxAttachmentMime("", "payload.exe")).toBeNull();
    expect(resolveUnifiedInboxAttachmentMime("application/x-msdownload", "report.pdf")).toBeNull();
    expect(resolveUnifiedInboxAttachmentMime("application/pdf", "payload.exe")).toBe("application/pdf");
  });

  it("encodes binary input in bounded chunks without a spread-argument allocation", () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
    expect(base64FromBytes(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });
});
