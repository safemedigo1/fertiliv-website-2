import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { Bell, BellOff, Calendar, CheckCircle2, DollarSign, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

const typeIcon: Record<string, React.ElementType> = {
  appointment_reminder: Calendar,
  appointment_cancellation: BellOff,
  invoice_issued: DollarSign,
  payment_confirmed: CheckCircle2,
  lab_result_ready: FlaskConical,
  general: Bell,
};

export default function NotificationsPage() {
  const { data: notifications, isLoading, refetch } = trpc.notifications.list.useQuery();
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => refetch() });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => { toast.success("All notifications marked as read"); refetch(); },
  });

  const unread = notifications?.filter(n => !n.isRead).length ?? 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unread} unread</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !notifications || notifications.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground text-sm">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const Icon = typeIcon[n.type] ?? Bell;
            return (
              <div
                key={n.id}
                onClick={() => !n.isRead && markRead.mutate({ id: n.id })}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer ${
                  !n.isRead ? "bg-primary/5 border-primary/20 hover:bg-primary/10" : "bg-card hover:bg-accent/20"
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${!n.isRead ? "bg-primary/20" : "bg-muted"}`}>
                  <Icon className={`h-4 w-4 ${!n.isRead ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${!n.isRead ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(n.createdAt), "MMM d, yyyy h:mm a")}</p>
                </div>
                {!n.isRead && (
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
