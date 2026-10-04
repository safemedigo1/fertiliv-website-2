/**
 * CoordinatorBookingModal
 * Enhanced in-app booking UI for the schedule_call_inapp flow.
 *
 * Flow:
 * 1. Show coordinator cards (avatar, name, bio, languages, job title)
 * 2. After selecting a coordinator, show a 2-week calendar with available slots
 * 3. Patient selects a slot → confirm → calls onConfirm(coordinatorId, isoStart, isoEnd)
 * 4. "No suitable time" fallback → text note → calls onFallback(note)
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChevronLeft, ChevronRight, Globe, User, Clock, MessageSquare } from "lucide-react";

interface Slot {
  date: string;
  start: string;
  end: string;
  isoStart: string;
  isoEnd: string;
}

interface Coordinator {
  id: number;
  name: string | null;
  firstName: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  bio: string | null;
  languages: string[];
  primaryLanguage: string | null;
  weeklySchedule: Record<string, Array<{ start: string; end: string }>>;
}

interface Props {
  lang?: "en" | "ar" | "tr";
  onConfirm: (coordinatorId: number, isoStart: string, isoEnd: string, coordinatorName: string) => void;
  onFallback: (note: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const LANG_NAMES: Record<string, string> = {
  en: "English", ar: "Arabic", tr: "Turkish", ru: "Russian",
  fr: "French", de: "German", es: "Spanish", it: "Italian",
  zh: "Chinese", ja: "Japanese", ko: "Korean", pt: "Portuguese",
  nl: "Dutch", pl: "Polish", uk: "Ukrainian",
};

function getLangLabel(code: string) {
  return LANG_NAMES[code] ?? code.toUpperCase();
}

function getDisplayName(c: Coordinator) {
  return c.firstName || c.name || "Coordinator";
}

// Format a date string (YYYY-MM-DD) to a readable label
function formatDateLabel(dateStr: string, lang: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString(lang === "ar" ? "ar-SA" : lang === "tr" ? "tr-TR" : "en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// Group slots by date
function groupSlotsByDate(slots: Slot[]): Record<string, Slot[]> {
  const map: Record<string, Slot[]> = {};
  for (const s of slots) {
    if (!map[s.date]) map[s.date] = [];
    map[s.date].push(s);
  }
  return map;
}

export function CoordinatorBookingModal({ lang = "en", onConfirm, onFallback, onCancel, loading }: Props) {
  const isRTL = lang === "ar";

  // Step: "pick_coordinator" | "pick_slot" | "fallback"
  const [step, setStep] = useState<"pick_coordinator" | "pick_slot" | "fallback">("pick_coordinator");
  const [selectedCoordinator, setSelectedCoordinator] = useState<Coordinator | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [fallbackNote, setFallbackNote] = useState("");
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, 1 = next week, etc.

  // Load coordinators
  const { data: coordinators, isLoading: coordsLoading } = trpc.users.listCoordinators.useQuery();

  // Compute date range for slots (2 weeks from today + weekOffset)
  const { fromDate, toDate } = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() + weekOffset * 7);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 13); // 2 weeks
    return {
      fromDate: from.toISOString().split("T")[0],
      toDate: to.toISOString().split("T")[0],
    };
  }, [weekOffset]);

  // Load available slots for selected coordinator
  const { data: slots, isLoading: slotsLoading } = trpc.users.getAvailableSlots.useQuery(
    { coordinatorId: selectedCoordinator?.id ?? 0, fromDate, toDate },
    { enabled: !!selectedCoordinator && step === "pick_slot" }
  );

  const slotsByDate = useMemo(() => groupSlotsByDate(slots ?? []), [slots]);
  const sortedDates = useMemo(() => Object.keys(slotsByDate).sort(), [slotsByDate]);

  // ── Labels ──────────────────────────────────────────────────────────────────
  const T = {
    title: lang === "ar" ? "احجز مكالمة مع مستشار" : lang === "tr" ? "Danışmanla Görüşme Planla" : "Book a Consultation Call",
    selectCoord: lang === "ar" ? "اختر مستشاراً" : lang === "tr" ? "Danışman Seçin" : "Select a Coordinator",
    pickSlot: lang === "ar" ? "اختر موعداً" : lang === "tr" ? "Zaman Seçin" : "Choose a Time Slot",
    noSlots: lang === "ar" ? "لا توجد مواعيد متاحة في هذه الفترة" : lang === "tr" ? "Bu dönemde uygun slot yok" : "No available slots in this period",
    prevWeek: lang === "ar" ? "الأسبوع السابق" : "Previous",
    nextWeek: lang === "ar" ? "الأسبوع التالي" : "Next",
    confirm: lang === "ar" ? "تأكيد الحجز" : lang === "tr" ? "Onayla" : "Confirm Booking",
    cancel: lang === "ar" ? "إلغاء" : lang === "tr" ? "İptal" : "Cancel",
    back: lang === "ar" ? "رجوع" : lang === "tr" ? "Geri" : "Back",
    noTime: lang === "ar" ? "لا يناسبني أي وقت" : lang === "tr" ? "Uygun zaman yok" : "No suitable time for me",
    fallbackTitle: lang === "ar" ? "أخبرنا بتوقيتك المفضل" : lang === "tr" ? "Tercih ettiğiniz zamanı belirtin" : "Tell us your preferred time",
    fallbackPlaceholder: lang === "ar" ? "مثال: أيام الأسبوع من 10 صباحاً إلى 2 ظهراً" : "e.g. Weekdays 10am–2pm, prefer mornings",
    fallbackSubmit: lang === "ar" ? "إرسال" : lang === "tr" ? "Gönder" : "Submit",
    languages: lang === "ar" ? "اللغات" : "Languages",
    selected: lang === "ar" ? "محدد" : "Selected",
    bookWith: lang === "ar" ? "حجز مع" : "Book with",
  };

  // ── Step: Pick Coordinator ──────────────────────────────────────────────────
  if (step === "pick_coordinator") {
    return (
      <div className="w-full max-w-sm space-y-3" dir={isRTL ? "rtl" : "ltr"}>
        <h3 className="text-white font-bold text-base text-center">{T.title}</h3>
        <p className="text-white/60 text-xs text-center">{T.selectCoord}</p>

        {coordsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        ) : (coordinators ?? []).length === 0 ? (
          <div className="text-center py-4">
            <p className="text-white/50 text-sm">No coordinators available at this time.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {(coordinators ?? []).map((c) => {
              const hasSchedule = Object.keys(c.weeklySchedule ?? {}).length > 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCoordinator(c as Coordinator);
                    setStep("pick_slot");
                  }}
                  className="w-full text-left p-3 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 transition group"
                >
                  <div className="flex items-start gap-3">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt={getDisplayName(c as Coordinator)} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-white/60" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm">{getDisplayName(c as Coordinator)}</span>
                        {c.jobTitle && <Badge variant="outline" className="text-white/70 border-white/30 text-xs py-0">{c.jobTitle}</Badge>}
                        {!hasSchedule && <Badge variant="outline" className="text-yellow-400/70 border-yellow-400/30 text-xs py-0">No schedule set</Badge>}
                      </div>
                      {c.bio && <p className="text-white/60 text-xs mt-0.5 line-clamp-2">{c.bio}</p>}
                      {(c.languages as string[]).length > 0 && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <Globe className="w-3 h-3 text-white/40" />
                          {(c.languages as string[]).slice(0, 4).map(l => (
                            <span key={l} className="text-white/50 text-xs">{getLangLabel(l)}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => setStep("fallback")}
          className="w-full py-2 text-white/50 text-xs hover:text-white/80 transition text-center"
        >
          {T.noTime}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition"
        >
          {T.cancel}
        </button>
      </div>
    );
  }

  // ── Step: Pick Slot ─────────────────────────────────────────────────────────
  if (step === "pick_slot" && selectedCoordinator) {
    return (
      <div className="w-full max-w-sm space-y-3" dir={isRTL ? "rtl" : "ltr"}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setStep("pick_coordinator"); setSelectedSlot(null); }} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            {selectedCoordinator.avatarUrl ? (
              <img src={selectedCoordinator.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <User className="w-4 h-4 text-white/60" />
              </div>
            )}
            <span className="text-white font-semibold text-sm">{T.bookWith} {getDisplayName(selectedCoordinator)}</span>
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={weekOffset === 0}
            onClick={() => setWeekOffset(w => w - 1)}
            className="text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-white/70 text-xs">
            {formatDateLabel(fromDate, lang)} – {formatDateLabel(toDate, lang)}
          </span>
          <button
            type="button"
            onClick={() => setWeekOffset(w => w + 1)}
            className="text-white/60 hover:text-white"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {slotsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="text-center py-4 space-y-2">
            <Clock className="w-8 h-8 text-white/30 mx-auto" />
            <p className="text-white/50 text-sm">{T.noSlots}</p>
            <button
              type="button"
              onClick={() => setWeekOffset(w => w + 1)}
              className="text-white/60 text-xs hover:text-white underline"
            >
              Try next period →
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {sortedDates.map(date => (
              <div key={date}>
                <p className="text-white/50 text-xs font-medium mb-1.5">{formatDateLabel(date, lang)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {slotsByDate[date].map((slot, i) => {
                    const isSelected = selectedSlot?.isoStart === slot.isoStart;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isSelected
                            ? "bg-white text-[#1E0566]"
                            : "bg-white/10 text-white hover:bg-white/25 border border-white/20"
                        }`}
                      >
                        {slot.start}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Confirm */}
        {selectedSlot && (
          <div className="p-3 bg-white/10 border border-white/20 rounded-xl text-center">
            <p className="text-white/70 text-xs mb-1">Selected slot:</p>
            <p className="text-white font-semibold text-sm">
              {formatDateLabel(selectedSlot.date, lang)} · {selectedSlot.start}–{selectedSlot.end}
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={!selectedSlot || loading}
          onClick={() => selectedSlot && onConfirm(selectedCoordinator.id, selectedSlot.isoStart, selectedSlot.isoEnd, getDisplayName(selectedCoordinator))}
          className="w-full py-2.5 rounded-xl bg-white text-[#1E0566] text-sm font-bold hover:bg-white/90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {T.confirm}
        </button>

        <button
          type="button"
          onClick={() => setStep("fallback")}
          className="w-full py-2 text-white/50 text-xs hover:text-white/80 transition text-center"
        >
          {T.noTime}
        </button>
      </div>
    );
  }

  // ── Step: Fallback ──────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-sm space-y-3" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setStep("pick_coordinator")} className="text-white/60 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-white font-bold text-base flex-1">{T.fallbackTitle}</h3>
      </div>

      <div className="flex items-start gap-2 p-3 bg-white/10 border border-white/20 rounded-xl">
        <MessageSquare className="w-4 h-4 text-white/50 mt-0.5 shrink-0" />
        <p className="text-white/60 text-xs leading-relaxed">
          {lang === "ar"
            ? "لا توجد مواعيد مناسبة؟ أخبرنا بأوقاتك المفضلة وسيتواصل معك أحد مستشارينا."
            : lang === "tr"
            ? "Uygun zaman bulamadınız mı? Tercih ettiğiniz zamanları bize bildirin, danışmanımız sizinle iletişime geçecek."
            : "Can't find a suitable time? Tell us your preferred times and a coordinator will reach out to you."}
        </p>
      </div>

      <Textarea
        value={fallbackNote}
        onChange={e => setFallbackNote(e.target.value)}
        placeholder={T.fallbackPlaceholder}
        rows={3}
        className="bg-white/10 border-white/20 text-white placeholder:text-white/40 resize-none text-sm"
      />

      <button
        type="button"
        disabled={!fallbackNote.trim() || loading}
        onClick={() => onFallback(fallbackNote.trim())}
        className="w-full py-2.5 rounded-xl bg-white text-[#1E0566] text-sm font-bold hover:bg-white/90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {T.fallbackSubmit}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="w-full py-2 text-white/50 text-xs hover:text-white/80 transition text-center"
      >
        {T.cancel}
      </button>
    </div>
  );
}
