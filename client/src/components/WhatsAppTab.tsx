import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Send, MessageSquare, AlertCircle, CheckCheck, Check,
  Phone, ChevronDown, Zap,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { toast } from "sonner";

interface WhatsAppTabProps {
  patientId: number;
  patientPhone?: string;
  patientName?: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  sent: <Check className="h-3 w-3 text-gray-400" />,
  delivered: <CheckCheck className="h-3 w-3 text-gray-400" />,
  read: <CheckCheck className="h-3 w-3 text-blue-500" />,
  received: <Check className="h-3 w-3 text-green-500" />,
  failed: <AlertCircle className="h-3 w-3 text-red-500" />,
};

/** Normalize phone to E.164 for display */
function normalizeDisplay(phone: string): string {
  let p = phone.replace(/\s+/g, "").replace(/-/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) p = "+" + p;
  return p;
}

// Pre-approved Meta templates available on this account
const TEMPLATES = [
  { name: "hello_world", label: "Hello World (test)", language: "en_US" },
];

export function WhatsAppTab({ patientId, patientPhone = "", patientName = "" }: WhatsAppTabProps) {
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState(patientPhone ? normalizeDisplay(patientPhone) : "");
  const [editingPhone, setEditingPhone] = useState(!patientPhone);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep phone in sync if patientPhone prop changes
  useEffect(() => {
    if (patientPhone && !phone) setPhone(normalizeDisplay(patientPhone));
  }, [patientPhone]);

  const { data: messages, isLoading, refetch } = trpc.whatsapp.list.useQuery(
    { patientId },
    { refetchInterval: 15000 }
  );

  // Real Meta API text message
  const sendText = trpc.whatsapp.sendText.useMutation({
    onSuccess: () => { setMessage(""); refetch(); toast.success("Message sent via WhatsApp"); },
    onError: (e) => toast.error(e.message || "Failed to send message"),
  });

  // Real Meta API template message
  const sendTemplate = trpc.whatsapp.sendTemplate.useMutation({
    onSuccess: () => { refetch(); toast.success("Template sent via WhatsApp"); },
    onError: (e) => toast.error(e.message || "Failed to send template"),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;
    if (!phone.trim()) { toast.error("Please enter a phone number first"); return; }
    sendText.mutate({ patientId, toPhone: phone.trim(), message: message.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSendTemplate = (templateName: string, language: string) => {
    if (!phone.trim()) { toast.error("Please enter a phone number first"); return; }
    sendTemplate.mutate({ patientId, toPhone: phone.trim(), templateName, languageCode: language });
  };

  const isPending = sendText.isPending || sendTemplate.isPending;

  return (
    <div className="flex flex-col h-[560px] border rounded-xl overflow-hidden bg-[#ECE5DD]">
      {/* Header */}
      <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{patientName || `Patient #${patientId}`}</p>
          <p className="text-[11px] text-white/70">WhatsApp Business · Meta Cloud API</p>
        </div>
        <Badge variant="outline" className="ml-auto text-[10px] border-green-400/50 text-green-300 bg-green-900/30 shrink-0">
          Live
        </Badge>
      </div>

      {/* Phone number bar */}
      <div className="bg-[#128C7E] px-4 py-2 flex items-center gap-2">
        <Phone className="h-3.5 w-3.5 text-white/70 shrink-0" />
        {editingPhone ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+905XXXXXXXXX"
              className="h-7 text-xs bg-white/20 border-white/30 text-white placeholder:text-white/50 flex-1"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-white hover:bg-white/20 px-2"
              onClick={() => { if (phone.trim()) setEditingPhone(false); }}
            >
              Save
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-white text-xs font-mono">{phone}</span>
            <button
              className="text-white/60 hover:text-white text-[10px] underline"
              onClick={() => setEditingPhone(true)}
            >
              change
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs text-center max-w-xs text-gray-500">
              Send a template first to open the conversation window, then send free-text messages within 24 hours.
            </p>
          </div>
        ) : (
          messages.map((msg: any) => {
            const isOutbound = msg.direction === "outbound";
            const isTemplate = msg.templateName && msg.body.startsWith("[Template:");
            return (
              <div key={msg.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-xl px-3 py-2 shadow-sm ${
                  isOutbound ? "bg-[#DCF8C6] rounded-br-sm" : "bg-white rounded-bl-sm"
                }`}>
                  {isTemplate ? (
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
                      <p className="text-sm text-gray-600 italic">Template: {msg.templateName}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.body}</p>
                  )}
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-gray-400">
                      {format(new Date(msg.createdAt), "HH:mm")}
                    </span>
                    {isOutbound && STATUS_ICON[msg.status ?? "sent"]}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="bg-[#F0F0F0] px-3 py-2 space-y-2 border-t">
        {/* Template quick-send */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 bg-white"
                disabled={isPending}
              >
                <Zap className="h-3 w-3 text-yellow-500" />
                Send Template
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {TEMPLATES.map(t => (
                <DropdownMenuItem
                  key={t.name}
                  onClick={() => handleSendTemplate(t.name, t.language)}
                >
                  <Zap className="h-3.5 w-3.5 mr-2 text-yellow-500" />
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-[10px] text-gray-400">Use templates to start a new conversation</p>
        </div>

        {/* Free-text input */}
        <div className="flex items-end gap-2">
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            className="flex-1 min-h-[40px] max-h-[120px] resize-none bg-white rounded-xl text-sm border-0 focus-visible:ring-1"
            rows={1}
          />
          <Button
            size="icon"
            className="h-10 w-10 rounded-full bg-[#075E54] hover:bg-[#064E45] shrink-0"
            onClick={handleSend}
            disabled={!message.trim() || isPending}
          >
            {sendText.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-gray-400">
          Free-text messages can only be sent within 24h of patient's last message. Use templates to initiate.
        </p>
      </div>
    </div>
  );
}
