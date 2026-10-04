import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { fmtDate } from "@/lib/dateFormat";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Trash2,
  Loader2,
  Bot,
  User,
  Stethoscope,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CaseComment = {
  id: number;
  leadId: number | null;
  patientId: number | null;
  authorId: number;
  content: string;
  isSystemEvent: boolean;
  visibility: "all" | "doctor_only" | "staff_only";
  createdAt: Date;
  authorName: string;
  authorRole: string;
};

interface CaseCommentsThreadProps {
  leadId?: number;
  patientId?: number;
  /** If true, the thread is shown in read-only mode (no compose box) */
  readOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(date);
}

function RoleIcon({ role }: { role: string }) {
  if (role === "doctor") return <Stethoscope className="h-3.5 w-3.5" />;
  if (role === "admin" || role === "manager") return <ShieldCheck className="h-3.5 w-3.5" />;
  return <User className="h-3.5 w-3.5" />;
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  if (visibility === "all") return null;
  if (visibility === "doctor_only") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-teal-600 border-teal-300 bg-teal-50 dark:bg-teal-950/30">
        <Stethoscope className="h-2.5 w-2.5" /> Doctor only
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30">
      <EyeOff className="h-2.5 w-2.5" /> Staff only
    </Badge>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CaseCommentsThread({
  leadId,
  patientId,
  readOnly = false,
}: CaseCommentsThreadProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"all" | "doctor_only" | "staff_only">("all");

  const { data: comments = [], isLoading } = trpc.caseComments.list.useQuery(
    { leadId, patientId },
    { enabled: !!(leadId || patientId) }
  );

  const createMutation = trpc.caseComments.create.useMutation({
    onSuccess: () => {
      setContent("");
      utils.caseComments.list.invalidate({ leadId, patientId });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.caseComments.delete.useMutation({
    onSuccess: () => utils.caseComments.list.invalidate({ leadId, patientId }),
    onError: (err) => toast.error(err.message),
  });

  // Scroll to bottom on initial load
  useEffect(() => {
    if (comments.length > 0) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [comments.length]);

  const handleSubmit = () => {
    if (!content.trim()) return;
    createMutation.mutate({ leadId, patientId, content: content.trim(), visibility });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canDelete = (comment: CaseComment) => {
    if (!user) return false;
    return comment.authorId === user.id || user.role === "admin" || user.role === "manager";
  };

  const isStaffOrAdmin = user?.role === "staff" || user?.role === "admin" || user?.role === "manager";

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Collaboration Thread</span>
        {comments.length > 0 && (
          <Badge variant="secondary" className="text-xs ml-auto">
            {comments.length} {comments.length === 1 ? "note" : "notes"}
          </Badge>
        )}
      </div>

      {/* Comments list */}
      <div className="flex flex-col gap-0 max-h-[480px] overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm">Loading thread...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <MessageSquare className="h-8 w-8 opacity-30" />
            <p className="text-sm">No notes yet. Start the collaboration thread.</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className={cn(
                "group flex gap-3 py-3 border-b border-border/40 last:border-0",
                comment.isSystemEvent && "opacity-70"
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold",
                  comment.isSystemEvent
                    ? "bg-muted text-muted-foreground"
                    : comment.authorRole === "doctor"
                    ? "bg-teal-500"
                    : comment.authorRole === "admin" || comment.authorRole === "manager"
                    ? "bg-purple-500"
                    : "bg-blue-500"
                )}
              >
                {comment.isSystemEvent ? (
                  <Bot className="h-4 w-4" />
                ) : (
                  (comment.authorName?.[0] ?? "?").toUpperCase()
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-medium text-foreground">
                    {comment.isSystemEvent ? "System" : comment.authorName}
                  </span>
                  {!comment.isSystemEvent && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <RoleIcon role={comment.authorRole} />
                      {comment.authorRole}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatRelativeTime(comment.createdAt)}
                  </span>
                  <VisibilityBadge visibility={comment.visibility} />
                </div>
                <p
                  className={cn(
                    "text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed",
                    comment.isSystemEvent && "italic text-muted-foreground text-xs"
                  )}
                >
                  {comment.content}
                </p>
              </div>

              {/* Delete */}
              {!readOnly && canDelete(comment) && !comment.isSystemEvent && (
                <button
                  onClick={() => deleteMutation.mutate({ id: comment.id })}
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  title="Delete comment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose box */}
      {!readOnly && (
        <div className="border-t border-border/60 px-4 py-3 bg-muted/20">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a note… (Ctrl+Enter to send)"
            className="resize-none text-sm min-h-[72px] bg-background"
            maxLength={4000}
          />
          <div className="flex items-center gap-2 mt-2">
            {/* Visibility selector — only shown to staff/admin */}
            {isStaffOrAdmin && (
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as typeof visibility)}
              >
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <Eye className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Visible to all</SelectItem>
                  <SelectItem value="doctor_only">Doctor only</SelectItem>
                  <SelectItem value="staff_only">Staff only</SelectItem>
                </SelectContent>
              </Select>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {content.length}/4000
            </span>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!content.trim() || createMutation.isPending}
              className="gap-1.5"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
