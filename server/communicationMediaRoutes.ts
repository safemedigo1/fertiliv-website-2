import type { Express } from "express";
import { buildMediaFilename } from "../shared/mediaFilename";
import { resolveClinicUserFromRequest } from "./_core/clinicSession";
import { getAuthorizedMediaBytes } from "./communicationMedia";

export function registerCommunicationMediaRoutes(app: Express) {
  app.get("/api/communications/media/:mediaAssetId", async (req, res) => {
    const mediaAssetId = Number(req.params.mediaAssetId);
    if (!Number.isInteger(mediaAssetId) || mediaAssetId <= 0) {
      res.status(400).send("Invalid media request");
      return;
    }
    try {
      const user = await resolveClinicUserFromRequest(req, res);
      if (!user) {
        res.status(401).send("Authentication required");
        return;
      }
      const action = req.query.action === "download" ? "download" : "open";
      const result = await getAuthorizedMediaBytes(mediaAssetId, action, { id: user.id, role: user.role, name: user.name ?? null });
      const filename = buildMediaFilename({
        originalFilename: result.asset.filename,
        mimeType: result.asset.mimeType ?? result.contentType,
        mediaType: result.asset.mediaType,
        seed: result.asset.id,
      });
      res.set("Content-Type", result.contentType || "application/octet-stream");
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Content-Disposition", `${action === "download" ? "attachment" : "inline"}; filename="${filename}"`);
      res.end(result.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Media access failed";
      const denied = /access|available|belong|authentication/i.test(message);
      res.status(denied ? 403 : 502).send(denied ? "Media access denied" : "Media temporarily unavailable");
    }
  });
}
