const ZERNIO_API_BASE = "https://zernio.com/api/v1";

export class ZernioApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`Zernio API error (${status})`);
    this.name = "ZernioApiError";
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.ZERNIO_API_KEY?.trim();
  if (!key) throw new Error("ZERNIO_API_KEY is not configured");
  return key;
}

async function zernioFetch<T>(path: string, init?: RequestInit & { idempotencyKey?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${apiKey()}`);
  if (init?.body) headers.set("Content-Type", "application/json");
  if (init?.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey.slice(0, 128));
  const response = await fetch(`${ZERNIO_API_BASE}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error("[zernio] request failed", { status: response.status, path: path.split("?")[0] });
    throw new ZernioApiError(response.status);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function ensureFertilivZernioProfile(): Promise<string> {
  const listed = await zernioFetch<{ profiles?: Array<{ id?: string; _id?: string; name?: string }> } | Array<{ id?: string; _id?: string; name?: string }>>("/profiles");
  const profiles = Array.isArray(listed) ? listed : listed.profiles ?? [];
  const existing = profiles.find((profile) => (profile.name ?? "").toLowerCase() === "fertiliv");
  const existingId = existing?.id ?? existing?._id;
  if (existingId) return existingId;
  const created = await zernioFetch<{ id?: string; _id?: string; profile?: { id?: string; _id?: string } }>("/profiles", {
    method: "POST",
    idempotencyKey: "fertiliv-profile",
    body: JSON.stringify({ name: "Fertiliv", description: "Fertiliv clinic WhatsApp inbox" }),
  });
  const id = created.profile?.id ?? created.profile?._id ?? created.id ?? created._id;
  if (!id) throw new Error("Zernio did not return a profile id");
  return id;
}

export async function createWhatsAppConnectUrl(redirectUrl: string): Promise<string> {
  const profileId = await ensureFertilivZernioProfile();
  const query = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  const data = await zernioFetch<{ authUrl?: string; url?: string; auth_url?: string }>(`/connect/whatsapp?${query.toString()}`);
  const url = data.authUrl ?? data.auth_url ?? data.url;
  if (!url) throw new Error("Zernio did not return a connect URL");
  return url;
}

export async function listWhatsAppAccounts(): Promise<Array<{ id: string; username?: string }>> {
  const data = await zernioFetch<{ accounts?: Array<{ id?: string; _id?: string; platform?: string; username?: string }> } | Array<{ id?: string; _id?: string; platform?: string; username?: string }>>("/accounts");
  const accounts = Array.isArray(data) ? data : data.accounts ?? [];
  return accounts
    .filter((account) => (account.platform ?? "whatsapp").toLowerCase().includes("whatsapp"))
    .map((account) => ({ id: account.id ?? account._id ?? "", username: account.username }))
    .filter((account) => account.id);
}

/** Disconnect a connected WhatsApp account so another number can be linked. */
export async function deleteZernioAccount(accountId: string): Promise<void> {
  const id = accountId.trim().slice(0, 128);
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(id)) throw new Error("invalid_account_id");
  try {
    await zernioFetch(`/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (error) {
    // Already removed on Zernio is still a successful disconnect for the clinic.
    if (error instanceof ZernioApiError && error.status === 404) {
      console.info("[zernio] account already removed", { status: 404 });
      return;
    }
    throw error;
  }
  console.info("[zernio] account deleted");
}

export async function sendZernioText(input: { conversationId: string; accountId: string; message: string; idempotencyKey: string }) {
  return zernioFetch<{ id?: string; messageId?: string }>(`/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`, {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: JSON.stringify({ accountId: input.accountId, message: input.message }),
  });
}

export async function sendZernioMedia(input: {
  conversationId: string;
  accountId: string;
  attachmentUrl: string;
  attachmentType: "image" | "video" | "audio" | "document";
  message?: string;
  voiceNote?: boolean;
  idempotencyKey: string;
}) {
  return zernioFetch<{ id?: string; messageId?: string }>(`/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`, {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: JSON.stringify({
      accountId: input.accountId,
      message: input.message,
      attachmentUrl: input.attachmentUrl,
      attachmentType: input.attachmentType,
      voiceNote: input.voiceNote || undefined,
    }),
  });
}

export async function sendZernioTemplate(input: {
  conversationId: string;
  accountId: string;
  templateName: string;
  language: string;
  variables: string[];
  idempotencyKey: string;
}) {
  return zernioFetch(`/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`, {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: JSON.stringify({
      accountId: input.accountId,
      template: { name: input.templateName, language: input.language, variables: input.variables },
    }),
  });
}

export async function sendZernioReaction(input: { conversationId: string; accountId: string; messageId: string; emoji: string }) {
  return zernioFetch(`/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages/${encodeURIComponent(input.messageId)}/reactions`, {
    method: "POST",
    body: JSON.stringify({ accountId: input.accountId, emoji: input.emoji }),
  });
}

export async function sendZernioTyping(input: { conversationId: string; accountId: string }) {
  await zernioFetch(`/inbox/conversations/${encodeURIComponent(input.conversationId)}/typing`, {
    method: "POST",
    body: JSON.stringify({ accountId: input.accountId }),
  });
}

export async function markZernioRead(input: { conversationId: string; accountId: string }) {
  await zernioFetch(`/inbox/conversations/${encodeURIComponent(input.conversationId)}/read`, {
    method: "POST",
    body: JSON.stringify({ accountId: input.accountId }),
  });
}

export async function listZernioMessages(input: { conversationId: string; accountId: string; cursor?: string }) {
  const query = new URLSearchParams({ accountId: input.accountId, limit: "50", sortOrder: "asc" });
  if (input.cursor) query.set("cursor", input.cursor);
  return zernioFetch<{ messages?: unknown[]; data?: unknown[]; nextCursor?: string }>(
    `/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages?${query.toString()}`,
  );
}
