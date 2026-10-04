import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

const router = read("server/routers.ts");
const bootstrap = read("server/_core/createApp.ts");
const integration = read("server/wppConnectIntegration.ts");
const webhook = read("server/wppConnectWebhook.ts");
const mediaRoutes = read("server/goldWhatsAppMediaRoutes.ts");
const eventsRoutes = read("server/goldWhatsAppEventsRoutes.ts");
const page = read("client/src/pages/WhatsAppConnectionsPage.tsx");
const app = read("client/src/App.tsx");
const navigation = read("client/src/components/FertilizLayout.tsx");

// The Gold module is deliberately a standalone transport/product surface until
// a separately authorized Messaging Bridge is introduced.
describe("Gold standalone WhatsApp Engine restoration", () => {
  it("exposes the separate route and navigation tab without replacing Unified Inbox", () => {
    expect(app).toContain('path="/whatsapp-connections" component={WhatsAppConnectionsPage}');
    expect(navigation).toContain('id: "whatsapp_connections"');
    expect(navigation).toContain('path: "/whatsapp-connections"');
    expect(app).toContain('path="/inbox" component={UnifiedInboxPage}');
  });

  it("registers its own authenticated tRPC product namespace and webhook", () => {
    expect(router).toContain("wppConnect: router({");
    for (const procedure of ["createConnection", "discoverChats", "addChats", "syncChat", "sendText", "sendMedia", "disconnect"]) {
      expect(router).toContain(`${procedure}: staffOrAdminProcedure`);
    }
    expect(bootstrap).toContain("registerWppConnectWebhook(app)");
    expect(bootstrap).toContain("registerGoldWhatsAppEventsRoutes(app)");
    expect(webhook).toContain("verifyWppWebhookSecret");
    expect(webhook).toContain("handleWppWebhook");
    expect(mediaRoutes).toContain("/api/gold-whatsapp/media/:messageId");
  });

  it("keeps Gold provider behavior isolated from legacy sandbox workers and canonical Inbox transport", () => {
    expect(integration).not.toContain("8899");
    expect(integration).not.toContain("8900");
    expect(integration).not.toContain("operationalInbox");
    expect(integration).not.toContain("wppConnectServerIngress");
    expect(integration).toContain("/api/");
    expect(integration).toContain("start-session");
  });

  it("requires authorized staff, selected chats, duplicate prevention, and no automatic clinical creation", () => {
    expect(integration).toContain("requireLineAccess");
    expect(integration).toContain("whatsappLinkedDeviceLineStaff");
    expect(integration).toContain("whatsappAllowedChats");
    expect(integration).toContain("whatsappLinkedDeviceMessages");
    expect(integration).toContain('reason: "chat_not_allowed"');
    expect(integration).toContain("onConflictDoUpdate");
    for (const forbidden of ["patients", "leads", "treatmentCases", "medicalIntake", "treatmentPlans"]) {
      expect(integration).not.toContain(forbidden);
    }
  });

  it("keeps credentials server-only and displays user-friendly errors", () => {
    expect(integration).toContain("encryptServerCredential");
    expect(integration).toContain("decryptServerCredential");
    expect(page).toContain("Connect WhatsApp");
    expect(page).toContain("inbox.connectWhatsApp");
    expect(page).toContain("fertiliv:zernio-connect-complete");
    expect(page).not.toContain("wppConnect.listConnections");
    expect(page).not.toContain("connections.error.message");
    expect(page).not.toContain("discovery.error.message");
  });

  it("uses a Gold-scoped custody proxy and never sends a storage key to the browser", () => {
    expect(integration).toContain("storagePut(");
    expect(integration).toContain("storageGetBytes(storageKey)");
    expect(integration).toContain("safeMediaProjection");
    expect(mediaRoutes).toContain("resolveClinicUserFromRequest");
    expect(mediaRoutes).toContain("getAuthorizedWppMediaBytes");
    expect(eventsRoutes).toContain("subscribeGoldConversation");
    expect(eventsRoutes).toContain("/api/gold-whatsapp/events");
    expect(mediaRoutes).toContain("/api/gold-whatsapp/media/:messageId");
    expect(page).not.toContain("/api/gold-whatsapp/media/");
    expect(page).not.toContain("storageKey");
  });

  it("restores Gold-only staff control and filtered bulk chat selection", () => {
    expect(router).toContain("updateStaff: adminProcedure");
    expect(router).toContain("getWppConnectionStaff");
    expect(integration).toContain("updateWppConnectionStaff");
    expect(integration).toContain("updateLinkedDeviceLineStaff");
    expect(page).not.toContain("Manage staff");
    expect(page).not.toContain("Select All");
    expect(page).not.toContain("wppConnect.status");
    const staffUpdate = integration.slice(integration.indexOf("export async function updateWppConnectionStaff"), integration.indexOf("export async function syncAllowedWppChat"));
    expect(staffUpdate).toContain('actor.role !== "admin"');
    expect(staffUpdate).toContain("updateLinkedDeviceLineStaff");
    expect(staffUpdate).toContain("lineId, authorizedStaffIds");
    expect(staffUpdate).toContain("auditGoldWppAction");
    expect(staffUpdate).not.toContain("wppSessionRequest");
    expect(staffUpdate).not.toContain("logout-session");
  });

  it("keeps provider receipts separate from application read state", () => {
    expect(integration).toContain('kind: "ack"');
    expect(integration).not.toContain("send-seen");
    expect(integration).not.toContain("sendSeen");
    expect(integration).not.toContain("markSeen");
  });

  it("keeps the connections page on the Zernio card instead of the Gold media viewer", () => {
    expect(mediaRoutes).toContain("getAuthorizedWppMediaBytes");
    expect(page).not.toContain("cursor-zoom-in");
    expect(page).not.toContain("<audio controls");
    expect(page).not.toContain("<video controls");
    expect(page).not.toContain("storageKey");
  });
});
