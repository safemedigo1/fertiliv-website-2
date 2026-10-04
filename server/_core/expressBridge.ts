import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { Express } from "express";

/**
 * Runs the existing Express app inside a Next.js route handler.
 * Webhook routes still see the original request bytes.
 */
class CaptureSocket extends Socket {
  private readonly chunks: Buffer[] = [];
  /** The request ending must not tear down the socket before the response is sent. */
  allowDestroy = false;

  override destroy(error?: Error): this {
    if (!this.allowDestroy) return this;
    return super.destroy(error);
  }

  override end(chunk?: unknown, encoding?: unknown, cb?: unknown): this {
    if (chunk !== undefined && chunk !== null && typeof chunk !== "function") {
      this.write(chunk, typeof encoding === "function" ? undefined : encoding);
    }
    const done = typeof chunk === "function" ? chunk : typeof encoding === "function" ? encoding : typeof cb === "function" ? cb : undefined;
    done?.();
    return this;
  }

  override write(chunk: unknown, encoding?: unknown, cb?: unknown): boolean {
    // Node writes response bodies as Uint8Array. String(uint8Array) is
    // "91,123,..." and would corrupt JSON. Keep the original bytes.
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : chunk instanceof Uint8Array
        ? Buffer.from(chunk)
        : Buffer.from(
            typeof chunk === "string" ? chunk : String(chunk),
            typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8",
          );
    this.chunks.push(buffer);
    const done = typeof encoding === "function" ? encoding : typeof cb === "function" ? cb : undefined;
    done?.();
    return true;
  }

  collected(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

function decodeChunked(body: Buffer): Buffer {
  const parts: Buffer[] = [];
  let offset = 0;
  while (offset < body.length) {
    const lineEnd = body.indexOf("\r\n", offset);
    if (lineEnd < 0) break;
    const sizeHex = body.subarray(offset, lineEnd).toString("utf8").split(";")[0]?.trim() ?? "";
    const size = Number.parseInt(sizeHex, 16);
    if (!Number.isFinite(size) || size === 0) break;
    const start = lineEnd + 2;
    parts.push(body.subarray(start, start + size));
    offset = start + size + 2;
  }
  return Buffer.concat(parts);
}

function toWebResponse(raw: Buffer): Response {
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd < 0) {
    return new Response(JSON.stringify({ error: "The request did not finish in time." }), {
      status: 504,
      headers: { "content-type": "application/json" },
    });
  }
  const headerText = raw.subarray(0, headerEnd).toString("utf8");
  const [statusLine, ...headerLines] = headerText.split("\r\n");
  const status = Number(statusLine?.split(" ")[1] ?? 200);
  const headers = new Headers();
  for (const line of headerLines) {
    const splitAt = line.indexOf(":");
    if (splitAt <= 0) continue;
    headers.append(line.slice(0, splitAt).trim(), line.slice(splitAt + 1).trim());
  }
  let body: Buffer = raw.subarray(headerEnd + 4);
  if ((headers.get("transfer-encoding") ?? "").toLowerCase().includes("chunked")) {
    body = decodeChunked(body);
    headers.delete("transfer-encoding");
  }
  headers.delete("content-length");
  if (status === 204 || status === 304) {
    return new Response(null, { status, headers });
  }
  return new Response(new Uint8Array(body), { status, headers });
}

export function runExpress(app: Express, request: Request): Promise<Response> {
  return new Promise((resolve, reject) => {
    const url = new URL(request.url);
    request.arrayBuffer().then((arrayBuffer) => {
      const body = Buffer.from(arrayBuffer);
      const socket = new CaptureSocket();
      // Express replaces the request prototype with IncomingMessage. A custom
      // Readable loses its reader at that point, so POST bodies never end.
      // Buffer the bytes on a real IncomingMessage before the app runs.
      const req = new IncomingMessage(socket);
      req.method = request.method;
      req.url = `${url.pathname}${url.search}`;
      req.httpVersion = "1.1";
      req.httpVersionMajor = 1;
      req.httpVersionMinor = 1;
      req.headers = {};
      request.headers.forEach((value, key) => {
        const current = req.headers[key];
        req.headers[key] = current ? `${current}, ${value}` : value;
      });
      req.headers["content-length"] = String(body.length);
      req.headers["x-forwarded-for"] = req.headers["x-forwarded-for"] ?? "127.0.0.1";

      const res = new ServerResponse(req);
      // Attach the response before the request body ends. Otherwise Node
      // destroys the socket on EOF and the POST reply is never written.
      res.assignSocket(socket);

      // Ending the request body makes Node emit "aborted" on this in-memory
      // socket. tRPC then drops the POST body. Only a real client disconnect
      // should abort the handler.
      const emit = req.emit.bind(req);
      req.emit = ((event: string | symbol, ...args: unknown[]) => {
        if (event === "aborted" && !request.signal.aborted) return false;
        return emit(event, ...args);
      }) as typeof req.emit;
      request.signal.addEventListener("abort", () => emit("aborted"), { once: true });

      if (body.length > 0) req.push(body);
      req.push(null);
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        socket.allowDestroy = true;
        const raw = socket.collected();
        socket.destroy();
        resolve(toWebResponse(raw));
      };
      res.on("finish", finish);
      res.on("error", reject);
      const timeout = setTimeout(() => {
        if (!settled) finish();
      }, 55_000);
      res.on("finish", () => clearTimeout(timeout));
      app(req, res);
    }).catch(reject);
  });
}
