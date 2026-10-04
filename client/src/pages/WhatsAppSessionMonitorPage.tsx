import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Loader2, ShieldAlert, TimerReset } from "lucide-react";
import { toast } from "sonner";

const tone = (state: string) => {
  const value = state.toLowerCase();
  if (["healthy", "connected"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["degraded", "reconnecting", "qr_ready", "waiting_for_qr", "unknown"].includes(value)) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
};

function currentIdentityLabel(session: { lifecycleState: string; sessionState: string; maskedIdentity: string | null }) {
  if (session.lifecycleState !== "connected" || session.sessionState !== "connected") {
    return "No linked device session";
  }
  return session.maskedIdentity ?? "Connected — identity hint unavailable";
}

export default function WhatsAppSessionMonitorPage() {
  const utils = trpc.useUtils();
  const { data: sessions = [], isLoading } = trpc.whatsappPlatform.sessionMonitor.useQuery(undefined, { refetchInterval: 15_000 });
  const refresh = trpc.whatsappPlatform.refreshSessionHealth.useMutation({
    onSuccess: async () => { await utils.whatsappPlatform.sessionMonitor.invalidate(); toast.success("Session health refreshed."); },
    onError: (error) => toast.error(error.message || "Session health could not be refreshed."),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
      <header>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700"><ShieldAlert className="h-4 w-4" /> Administrator diagnostic surface</div>
        <h1 className="text-3xl font-semibold tracking-tight">Linked Device Session Monitoring</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Safe lifecycle metadata only. QR payloads, browser profiles, tokens, credentials, and authentication artifacts are never displayed or returned.</p>
      </header>
      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="flex gap-3 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>WPPConnect remains feature-controlled and non-production. This monitor never enables patient traffic or changes Meta Cloud API, WU-09, Embedded Signup, or Manual Cloud API routing. Explicit logout removes the disposable WPPConnect session while preserving the Fertiliv line, staff permissions, and Inbox history.</p>
        </CardContent>
      </Card>
      {isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sessions.map((session) => (
            <Card key={session.lineId}>
              <CardHeader className="border-b bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{session.lineName}</CardTitle>
                    <CardDescription>{currentIdentityLabel(session)}</CardDescription>
                  </div>
                  <Badge className={tone(session.health)}>{session.health}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Session state</p><Badge variant="outline" className={`mt-1 ${tone(session.sessionState)}`}>{session.sessionState}</Badge></div>
                  <div><p className="text-xs text-muted-foreground">Provider</p><p className="mt-1 font-medium">{session.providerStatus}</p></div>
                  <div><p className="text-xs text-muted-foreground">Last connected</p><p className="mt-1 text-xs">{session.lastConnectedAt ? new Date(session.lastConnectedAt).toLocaleString() : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Last activity</p><p className="mt-1 text-xs">{session.lastActivityAt ? new Date(session.lastActivityAt).toLocaleString() : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Reconnect count</p><p className="mt-1 font-medium">{session.reconnectCount}</p></div>
                  <div><p className="text-xs text-muted-foreground">Last health check</p><p className="mt-1 text-xs">{session.lastHealthCheckedAt ? new Date(session.lastHealthCheckedAt).toLocaleString() : "—"}</p></div>
                </div>
                <Separator />
                {session.lifecycleState === "connected" && (session.providerPushName || session.providerPlatform) ? <p className="text-xs text-muted-foreground">Account hints: {session.providerPushName || "no display hint"} · {session.providerPlatform || "platform unknown"}</p> : null}
                {session.recentError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900"><strong>Recent non-secret error:</strong> {session.recentError}{session.recentErrorAt ? ` · ${new Date(session.recentErrorAt).toLocaleString()}` : ""}</div>}
                <p className="text-xs text-muted-foreground">Authorized staff: {session.authorizedStaff.map((staff) => staff.name || `User #${staff.id}`).join(" · ") || "None"}</p>
                <Button size="sm" variant="outline" onClick={() => refresh.mutate({ lineId: session.lineId })} disabled={refresh.isPending}><TimerReset className={`mr-2 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} /> Refresh health</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
