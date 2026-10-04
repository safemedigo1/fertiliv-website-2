/**
 * File proxy — serves files from R2 or Forge storage through our own domain.
 * Route: GET /api/storage/:key  (where key can contain slashes)
 *
 * This avoids the platform-level /manus-storage/ interception and ensures
 * files are always served through our domain, working on all browsers.
 */
import type { Express } from "express";
import { S3Client, GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { ENV } from "./_core/env";

function isR2Configured(): boolean {
  return !!(
    ENV.r2AccountId &&
    ENV.r2AccessKeyId &&
    ENV.r2SecretAccessKey &&
    ENV.r2BucketName
  );
}

let _r2Client: S3Client | null = null;
function getR2Client(): S3Client {
  if (!_r2Client) {
    _r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${ENV.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ENV.r2AccessKeyId,
        secretAccessKey: ENV.r2SecretAccessKey,
      },
    });
  }
  return _r2Client;
}

async function streamForgeFile(
  key: string,
  res: import("express").Response
): Promise<boolean> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) return false;

  const forgeUrl = new URL(
    "v1/storage/presign/get",
    ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
  );
  forgeUrl.searchParams.set("path", key);

  const forgeResp = await fetch(forgeUrl.toString(), {
    headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
  });

  if (!forgeResp.ok) {
    console.error(`[FileProxy] forge presign error: ${forgeResp.status}`);
    return false;
  }

  const { url } = (await forgeResp.json()) as { url: string };
  if (!url) return false;

  const fileResp = await fetch(url);
  if (!fileResp.ok) {
    console.error(`[FileProxy] forge fetch error: ${fileResp.status}`);
    return false;
  }

  const contentType =
    fileResp.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = fileResp.headers.get("content-length");
  const fileName = key.split("/").pop() ?? "file";

  res.set("Content-Type", contentType);
  res.set("Cache-Control", "private, max-age=3600");
  res.set(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(fileName)}"`
  );
  if (contentLength) res.set("Content-Length", contentLength);

  if (fileResp.body) {
    const reader = fileResp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } else {
    const buffer = await fileResp.arrayBuffer();
    res.end(Buffer.from(buffer));
  }
  return true;
}

export function registerFileProxy(app: Express) {
  // Use wildcard to capture keys with slashes
  app.get("/api/storage/*", async (req, res) => {
    const key = (req.params as unknown as Record<string, string>)[0] ?? "";

    if (!key) {
      res.status(400).send("Missing file key");
      return;
    }

    try {
      // Try R2 first when configured
      if (isR2Configured()) {
        try {
          const client = getR2Client();
          const command = new GetObjectCommand({
            Bucket: ENV.r2BucketName,
            Key: key,
          });

          const r2Response = await client.send(command);

          if (r2Response.Body) {
            const contentType =
              r2Response.ContentType ?? "application/octet-stream";
            const contentLength = r2Response.ContentLength;
            // Prefer the original filename stored in R2 metadata/ContentDisposition
            // over the storage key segment (which is a random timestamp-based name).
            const metaName = r2Response.Metadata?.["original-filename"];
            const cdName = r2Response.ContentDisposition
              ? (/filename="?([^"\s;]+)"?/.exec(r2Response.ContentDisposition) ?? [])[1]
              : undefined;
            const fileName = metaName ?? cdName ?? key.split("/").pop() ?? "file";

            res.set("Content-Type", contentType);
            res.set("Cache-Control", "private, max-age=3600");
            res.set(
              "Content-Disposition",
              `inline; filename="${encodeURIComponent(fileName)}"`
            );
            if (contentLength) res.set("Content-Length", String(contentLength));

            const stream = r2Response.Body.transformToWebStream();
            const reader = stream.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            res.end();
            return;
          }
        } catch (r2Err: unknown) {
          const isNotFound =
            r2Err instanceof NoSuchKey ||
            (r2Err as { name?: string }).name === "NoSuchKey" ||
            (r2Err as { Code?: string }).Code === "NoSuchKey";

          if (!isNotFound) {
            console.error(
              "[FileProxy] R2 error:",
              (r2Err as Error).message
            );
          }
          // Fall through to Forge for old files
        }
      }

      // Fall back to Manus Forge for files uploaded before R2 was configured
      const forgeStreamed = await streamForgeFile(key, res);
      if (!forgeStreamed) {
        res.status(404).send("File not found");
      }
    } catch (err) {
      console.error("[FileProxy] failed:", err);
      if (!res.headersSent) {
        res.status(502).send("File proxy error");
      }
    }
  });
}
