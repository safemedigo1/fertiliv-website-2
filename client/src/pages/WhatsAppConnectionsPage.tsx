import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CONNECT_COMPLETE = "fertiliv:zernio-connect-complete";

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true">
      <path
        fill="#25D366"
        d="M20.5 3.5A11 11 0 0 0 2.1 17.8L1 23l5.3-1.1A11 11 0 0 0 20.5 3.5zm-8.5 17a9.1 9.1 0 0 1-4.6-1.3l-.3-.2-3.2.8.8-3.1-.2-.3A9.1 9.1 0 1 1 12 20.5zm5-6.8c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.6.1a7.4 7.4 0 0 1-2.2-1.4 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.5.2-.3a.5.5 0 0 0 0-.5c0-.1-.6-1.4-.8-1.9s-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4.1 15 15 0 0 0 1.5.6 3.6 3.6 0 0 0 1.7.1 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3z"
      />
    </svg>
  );
}

function openConnectPopup(url: string): Window | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) return null;
  const width = 520;
  const height = 720;
  const left = Math.max(0, Math.round((window.screen.width - width) / 2));
  const top = Math.max(0, Math.round((window.screen.height - height) / 2));
  // Keep the opener so the callback page can postMessage and close itself.
  return window.open(url, "fertiliv-zernio-connect", `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
}

function isConnectComplete(data: unknown): data is { type: string; ok: boolean } {
  if (!data || typeof data !== "object") return false;
  const message = data as { type?: unknown; ok?: unknown };
  return message.type === CONNECT_COMPLETE && typeof message.ok === "boolean";
}

export default function WhatsAppConnectionsPage() {
  const utils = trpc.useUtils();
  const status = trpc.inbox.whatsappConnection.useQuery(undefined, { retry: false });
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // Browser timers are numbers. Node's types call the same function a Timeout.
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollRef.current != null) window.clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isConnectComplete(event.data)) return;
      setConnecting(false);
      console.info("[whatsapp] connect popup finished", { ok: event.data.ok });
      if (event.data.ok) {
        toast.success("WhatsApp is connected.");
        void utils.inbox.whatsappConnection.invalidate();
      } else {
        toast.error("WhatsApp was not connected.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [utils]);

  const connect = trpc.inbox.connectWhatsApp.useMutation({
    onSuccess: (result) => {
      const popup = openConnectPopup(result.url);
      if (!popup) {
        setConnecting(false);
        toast.error("Allow pop-ups for this site, then press Connect again.");
        return;
      }
      console.info("[whatsapp] connect popup opened");
      if (pollRef.current != null) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(() => {
        if (!popup.closed) return;
        if (pollRef.current != null) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setConnecting(false);
        // A closed popup may have finished before the message arrived.
        void utils.inbox.whatsappConnection.invalidate();
      }, 400);
    },
    onError: (error) => {
      setConnecting(false);
      toast.error(error.message || "WhatsApp could not be connected.");
    },
  });

  const disconnect = trpc.inbox.disconnectWhatsApp.useMutation({
    onSuccess: async () => {
      setConfirmDisconnect(false);
      toast.success("WhatsApp is disconnected.");
      await utils.inbox.whatsappConnection.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "WhatsApp could not be disconnected.");
    },
  });

  const connected = status.data?.connected === true;
  const displayName = status.data?.displayName ?? null;
  const busy = connecting || connect.isPending || disconnect.isPending;

  return (
    <div className="mx-auto max-w-3xl p-5 md:p-8">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border bg-white">
              <WhatsAppMark />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">Connect WhatsApp</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {connected
                  ? "This number is ready in the inbox. Disconnect it before linking another number."
                  : "Press Connect, finish the popup, and the inbox is ready."}
              </p>
              {status.error ? (
                <p className="mt-2 text-sm text-destructive" role="alert">WhatsApp status could not be loaded.</p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            {connected ? (
              <Badge variant="success" className="h-9 justify-center gap-1.5 rounded-md px-3 text-sm font-medium">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Connected{displayName ? ` · ${displayName}` : ""}</span>
              </Badge>
            ) : null}
            {connected ? (
              <>
                <Button type="button" variant="outline" asChild disabled={busy}>
                  <Link href="/inbox">Open inbox</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  {disconnect.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {disconnect.isPending ? "Disconnecting" : "Disconnect"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={busy || status.isLoading}
                onClick={() => {
                  setConnecting(true);
                  connect.mutate({ popup: true });
                }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? "Connecting" : "Connect"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmDisconnect}
        onOpenChange={(open) => {
          if (!disconnect.isPending) setConfirmDisconnect(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              {displayName
                ? `${displayName} will be removed from this clinic. You can connect another number afterwards.`
                : "This number will be removed from this clinic. You can connect another number afterwards."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnect.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={disconnect.isPending}
              onClick={(event) => {
                event.preventDefault();
                disconnect.mutate();
              }}
            >
              {disconnect.isPending ? "Disconnecting" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
