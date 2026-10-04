import { readInboxAttachmentBase64, readInboxAttachmentFile } from "./inboxAttachment";

const INLINE_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_PARTS = 8;

export type InboxMediaDelivery = {
  fileBase64?: string;
  storageKey?: string;
  uploadId?: string;
  byteSize?: number;
  mimeType: string;
  filename: string;
  caption?: string;
};

type PreparedUpload =
  | { mode: "inline" }
  | { mode: "parts"; storageKey: string; uploadId: string; partSize: number };

type UploadPartInput = {
  conversationId: number;
  storageKey: string;
  uploadId: string;
  partNumber: number;
  fileBase64: string;
};

/**
 * Files above 2 MB are sent as separate slices. Each slice stays under the host
 * request limit, and the server joins them before WhatsApp sees the file.
 */
export async function deliverInboxAttachment(input: {
  conversationId: number;
  file: File;
  mimeType: string;
  filename: string;
  caption?: string;
  prepare: (value: { conversationId: number; filename: string; mimeType: string; byteSize: number }) => Promise<PreparedUpload | null>;
  uploadPart: (value: UploadPartInput) => Promise<unknown>;
  abort: (value: { conversationId: number; storageKey: string; uploadId: string }) => Promise<unknown>;
}): Promise<InboxMediaDelivery> {
  const caption = input.caption;
  if (input.file.size > INLINE_UPLOAD_BYTES) {
    const prepared = await input.prepare({
      conversationId: input.conversationId,
      filename: input.filename,
      mimeType: input.mimeType,
      byteSize: input.file.size,
    });
    if (prepared?.mode === "parts") {
      const partSize = Math.min(prepared.partSize, INLINE_UPLOAD_BYTES);
      const partCount = Math.ceil(input.file.size / partSize);
      if (partSize < 256 * 1024 || partCount < 1 || partCount > MAX_UPLOAD_PARTS) {
        throw new Error("This attachment is too large to send.");
      }
      try {
        for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
          const slice = input.file.slice((partNumber - 1) * partSize, partNumber * partSize);
          const fileBase64 = await readInboxAttachmentBase64(slice);
          await input.uploadPart({
            conversationId: input.conversationId,
            storageKey: prepared.storageKey,
            uploadId: prepared.uploadId,
            partNumber,
            fileBase64,
          });
        }
      } catch (error) {
        await input.abort({
          conversationId: input.conversationId,
          storageKey: prepared.storageKey,
          uploadId: prepared.uploadId,
        }).catch(() => undefined);
        throw error;
      }
      console.info("[inbox] media upload parts sent", { parts: partCount, bytes: input.file.size });
      return {
        storageKey: prepared.storageKey,
        uploadId: prepared.uploadId,
        byteSize: input.file.size,
        mimeType: input.mimeType,
        filename: input.filename,
        caption,
      };
    }
  }
  const encoded = await readInboxAttachmentFile(input.file, { richMedia: true });
  return { fileBase64: encoded.fileBase64, mimeType: encoded.mimeType, filename: encoded.filename, caption };
}
