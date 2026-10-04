import type { Express } from "express";
import { S3Client, GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { ENV } from "./env";

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

async function streamForgeFile(key: string, res: import("express").Response): Promise<boolean> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) return false;

  const forgeUrl = new URL(
    "v1/storage/presign/get",
    ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
  );
  forgeUrl.searchParams.set("path", key);

  const forgeResp = await fetch(forgeUrl, {
    headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
  });

  if (!forgeResp.ok) {
    console.error(`[StorageProxy] forge presign error: ${forgeResp.status}`);
    return false;
  }

  const { url } = (await forgeResp.json()) as { url: string };
  if (!url) return false;

  const fileResp = await fetch(url);
  if (!fileResp.ok) {
    console.error(`[StorageProxy] forge fetch error: ${fileResp.status}`);
    return false;
  }

  const contentType = fileResp.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = fileResp.headers.get("content-length");
  const fileName = key.split("/").pop() ?? "file";

  res.set("Content-Type", contentType);
  res.set("Cache-Control", "private, max-age=3600");
  res.set("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
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

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    // Strip leading slashes and "manus-storage/" prefix from the key
    let key = (req.params as unknown as Record<string, string>)[0] ?? "";
    key = key.replace(/^\/+/, "").replace(/^manus-storage\//, "");

    if (!key) {
      res.status(400).send("Missing storage key");
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
            const contentType = r2Response.ContentType ?? "application/octet-stream";
            const contentLength = r2Response.ContentLength;
            const fileName = key.split("/").pop() ?? "file";

            res.set("Content-Type", contentType);
            res.set("Cache-Control", "private, max-age=3600");
            res.set("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
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
          // If key doesn't exist in R2, fall through to Forge
          const isNotFound =
            r2Err instanceof NoSuchKey ||
            (r2Err as { name?: string }).name === "NoSuchKey" ||
            (r2Err as { Code?: string }).Code === "NoSuchKey";

          if (!isNotFound) {
            // Unexpected R2 error — log and fall through to Forge
            console.error("[StorageProxy] R2 error:", (r2Err as Error).message);
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
      console.error("[StorageProxy] failed:", err);
      if (!res.headersSent) {
        res.status(502).send("Storage proxy error");
      }
    }
  });
}
