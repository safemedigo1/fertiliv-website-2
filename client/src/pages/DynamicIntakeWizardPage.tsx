/**
 * DynamicIntakeWizardPage
 * ─────────────────────────────────────────────────────────────────────────────
 * A fully dynamic intake wizard that reads its fields and steps from the
 * Form Builder config (via intakeForms.get). No hardcoded steps — the wizard
 * renders exactly what the coordinator configured in Form Builder.
 *
 * URL: /intake?form=<slug>
 * Falls back to /intake-legacy for the old hardcoded wizard.
 *
 * Supports:
 *  - optionLabels: human-readable labels for select/multiselect options
 *  - labelEn: catalog field labels (not raw field IDs)
 *  - titleTranslations / subtitleTranslations: form-level title/subtitle in EN/AR/TR
 *  - RTL layout for Arabic
 *  - Decision/branching steps (type: "decision") with configurable buttons
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, ChevronRight, ChevronLeft, Check, MessageCircle, Phone, Calendar } from "lucide-react";
import { CoordinatorBookingModal } from "@/components/CoordinatorBookingModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDef {
  id: string;
  /** Catalog label in English — always use this for display */
  labelEn: string;
  labelAr?: string;
  labelTr?: string;
  sublabelEn?: string;
  category: string;
  type: "text" | "phone" | "email" | "date" | "select" | "multicheck" | "yesno" | "textarea" | "number" | "multiselect" | "boolean" | "file" | "height_weight" | "repeatable";
  required: boolean;
  placeholder?: string;
  options?: string[];
  /** Human-readable labels for option values. e.g. { "1-2-weeks": "1–2 weeks" } */
  optionLabels?: Record<string, string>;
  showIf?: { fieldId: string; values: string[] };
  repeatableFields?: {
    id: string;
    type: "text" | "date" | "number" | "select" | "textarea" | "file" | "yesno";
    labelEn: string;
    sublabelEn?: string;
    options?: string[];
    optionLabels?: Record<string, string>;
    required?: boolean;
  }[];
  addButtonLabelEn?: string;
}

// ─── Step grouping logic ──────────────────────────────────────────────────────
// Categories are grouped into logical steps
const STEP_GROUPS: { label: string; categories: string[] }[] = [
  { label: "Personal Info",    categories: ["personal_info", "contact_info"] },
  { label: "Medical Interest", categories: ["lead_info", "logistics"] },
  { label: "Female Medical",   categories: ["fertility_female"] },
  { label: "Male Medical",     categories: ["fertility_male"] },
  { label: "Partner Info",     categories: ["partner_info"] },
];

// ─── Language detection ───────────────────────────────────────────────────────
function detectLang(translations: Record<string, string> | null | undefined): "en" | "ar" | "tr" {
  if (!translations) return "en";
  const browserLang = navigator.language?.slice(0, 2).toLowerCase();
  if (browserLang === "ar" && translations.ar) return "ar";
  if (browserLang === "tr" && translations.tr) return "tr";
  return "en";
}

// ─── Field label humanizer (fallback only) ────────────────────────────────────
function humanize(str: string): string {
  return str
    .replace(/^[lmfp]_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Option label resolver ────────────────────────────────────────────────────
// Priority: translated label (ar/tr) > field.optionLabels[opt] > built-in MAP > humanize fallback
function resolveOptionLabel(opt: string, optionLabels?: Record<string, string>, lang?: "en" | "ar" | "tr"): string {
  // Check for language-specific translated option label stored as __ar__opt or __tr__opt
  if (lang && lang !== "en" && optionLabels?.[`__${lang}__${opt}`]) return optionLabels[`__${lang}__${opt}`];
  if (optionLabels?.[opt]) return optionLabels[opt];
  const MAP: Record<string, string> = {
    female: "Female", male: "Male", other: "Other",
    local: "Local", international: "International",
    primary: "Primary infertility", secondary: "Secondary infertility",
    yes: "Yes", no: "No",
    whatsapp: "WhatsApp", phone: "Phone call", email: "Email", video_call: "Video call",
    en: "English", ar: "Arabic", tr: "Turkish", fr: "French",
    es: "Spanish", ru: "Russian", it: "Italian",
    regular: "Regular", irregular: "Irregular", absent: "Absent",
    never: "Never", former: "Former smoker", current: "Currently smoking", occasional: "Occasionally",
    none: "None of the above",
    "never-tried": "Never tried", "tried-unsuccessful": "Tried — unsuccessful",
    "tried-again": "Tried — want to try again", "tried-multiple": "Tried multiple times",
    immediately: "Immediately", "1-2-weeks": "1–2 Weeks", "1-month": "1 Month",
    "2-months": "2 Months", "3-months": "3 Months", "1-3-months": "1–3 Months",
    "6-months": "6 Months", exploring: "Just exploring",
    ready: "Ready to travel", considering: "Considering",
    "prefers-home": "Prefers home country", "local-patient": "Local patient",
  };
  return MAP[opt] ?? humanize(opt);
}

// ─── Static i18n map for system UI strings ──────────────────────────────────
const UI_STRINGS: Record<string, Record<"en" | "ar" | "tr", string>> = {
  optional:            { en: "optional",                   ar: "اختياري",                     tr: "isteğe bağlı" },
  required_error:      { en: "This field is required",     ar: "هذا الحقل مطلوب",              tr: "Bu alan zorunludur" },
  select_placeholder:  { en: "— Select —",                 ar: "— اختر —",                     tr: "— Seçin —" },
  select_option:       { en: "Select",                     ar: "اختر",                         tr: "Seçin" },
  remove:              { en: "Remove",                     ar: "إزالة",                        tr: "Kaldır" },
  add_entry:           { en: "Add another entry",          ar: "إضافة إدخال آخر",               tr: "Başka bir giriş ekle" },
  doc_password:        { en: "Document password (if protected)", ar: "كلمة مرور المستند (إن وجدت)", tr: "Belge şifresi (varsa)" },
  upload_file:         { en: "Upload file",                ar: "رفع ملف",                       tr: "Dosya yükle" },
  back:                { en: "Back",                       ar: "رجوع",                         tr: "Geri" },
  next:                { en: "Next",                       ar: "التالي",                        tr: "İleri" },
  submit:              { en: "Submit",                     ar: "إرسال",                        tr: "Gönder" },
  privacy:             { en: "Your information is kept private and secure.", ar: "معلوماتك محفوظة وآمنة.", tr: "Bilgileriniz gizli ve güvende tutulmaktadır." },
  step_of:             { en: "Step",                       ar: "خطوة",                         tr: "Adım" },
  of:                  { en: "of",                         ar: "من",                           tr: "/ " },
  first_name_required: { en: "First name is required.",    ar: "الاسم الأول مطلوب.",            tr: "Ad alanı zorunludur." },
  last_name_required:  { en: "Last name is required.",     ar: "الاسم الأخير مطلوب.",           tr: "Soyad alanı zorunludur." },
  phone_required:      { en: "Phone number is required.",  ar: "رقم الهاتف مطلوب.",            tr: "Telefon numarası zorunludur." },
  something_wrong:     { en: "Something went wrong. Please try again.", ar: "حدث خطأ. يرجى المحاولة مرة أخرى.", tr: "Bir hata oluştu. Lütfen tekrar deneyin." },
  tag_label:           { en: "Tag",                        ar: "التصنيف",                      tr: "Etiket" },
  delete_file:         { en: "Delete file",                ar: "حذف الملف",                    tr: "Dosyayı sil" },
};

/** Helper to get a UI string in the current language */
function t(key: keyof typeof UI_STRINGS, lang: "en" | "ar" | "tr" = "en"): string {
  return UI_STRINGS[key]?.[lang] ?? UI_STRINGS[key]?.en ?? key;
}

// ─── Single field renderer ────────────────────────────────────────────────────
function DynamicField({
  field,
  value,
  onChange,
  error,
  lang = "en",
}: {
  field: FieldDef;
  value: any;
  onChange: (val: any) => void;
  error?: string;
  lang?: "en" | "ar" | "tr";
}) {
  // Use catalog labelEn (or translated label if available)
  const label = (lang === "ar" && field.labelAr) ? field.labelAr
    : (lang === "tr" && field.labelTr) ? field.labelTr
    : field.labelEn || humanize(field.id);
  const isRequired = field.required;
  const isRTL = lang === "ar";

  const baseInput =
    "w-full bg-white border border-[#E4DDF5] text-[#140063] placeholder-[#9A91B8] rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:ring-[3px] focus:ring-[#140063]/10 focus:border-[#140063] transition-all duration-150";

  if (field.type === "text" || field.type === "phone" || field.type === "email" || field.type === "number") {
    return (
      <div dir={isRTL ? "rtl" : "ltr"}>
        <label className="block text-sm font-medium text-[#140063] mb-1.5">
          {label} {isRequired && <span className="text-red-500">*</span>}
          {!isRequired && <span className="text-[#140063]/40 text-xs ml-1">({t("optional", lang)})</span>}
        </label>
        <input
          type={field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? label}
          className={baseInput}
          dir={isRTL ? "rtl" : "ltr"}
        />
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div dir={isRTL ? "rtl" : "ltr"}>
        <label className="block text-sm font-medium text-[#140063] mb-1.5">
          {label} {isRequired && <span className="text-red-500">*</span>}
          {!isRequired && <span className="text-[#140063]/40 text-xs ml-1">({t("optional", lang)})</span>}
        </label>
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? label}
          rows={3}
          className={`${baseInput} resize-none`}
          dir={isRTL ? "rtl" : "ltr"}
        />
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div>
        <label className="block text-sm font-medium text-[#140063] mb-1.5">
          {label} {isRequired && <span className="text-red-500">*</span>}
          {!isRequired && <span className="text-[#140063]/40 text-xs ml-1">({t("optional", lang)})</span>}
        </label>
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} [color-scheme:light]`}
        />
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "select") {
    const opts = field.options ?? [];
    const optionLabels = field.optionLabels;
    // Use searchable combobox for large lists (country, nationality, etc.)
    const isLarge = opts.length > 20;
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);
    const filtered = useMemo(
      () => opts.filter((o) => {
        const displayLabel = resolveOptionLabel(o, optionLabels, lang);
        return displayLabel.toLowerCase().includes(search.toLowerCase()) || o.toLowerCase().includes(search.toLowerCase());
      }),
      [opts, search, optionLabels, lang]
    );
    const selectedLabel = value ? resolveOptionLabel(value, optionLabels, lang) : "";

    if (isLarge) {
      return (
        <div className="relative" dir={isRTL ? "rtl" : "ltr"}>
          <label className="block text-sm font-semibold text-[#140063] mb-1.5">
            {label} {isRequired && <span className="text-red-500">*</span>}
            {!isRequired && <span className="text-[#6B6385] text-xs ml-1 font-normal">({t("optional", lang)})</span>}
          </label>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`${baseInput} text-left flex items-center justify-between`}
          >
            <span className={selectedLabel ? "text-[#140063]" : "text-[#140063]/40"}>
              {selectedLabel || `${t("select_option", lang)} ${label}...`}
            </span>
            <span className="text-[#140063]/40">▾</span>
          </button>
          {open && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-[#EDE7FA] rounded-2xl shadow-[0_8px_24px_rgba(20,0,99,0.12)] overflow-hidden">
              <div className="p-2">
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={lang === "ar" ? "بحث..." : lang === "tr" ? "Ara..." : "Search..."}
                  className="w-full bg-[#F0ECFF] border border-[#E4DDF5] text-[#140063] placeholder-[#9A91B8] rounded-xl px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => { onChange(undefined); setOpen(false); setSearch(""); }}
                  className="w-full text-left px-4 py-2 text-sm text-[#6B6385] hover:bg-[#F0ECFF]"
                >
                  {lang === "ar" ? "-- بدون --" : lang === "tr" ? "-- Yok --" : "-- None --"}
                </button>
                {filtered.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => { onChange(opt); setOpen(false); setSearch(""); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[#F0ECFF] ${
                      value === opt ? "bg-[#F0ECFF] text-[#140063] font-semibold" : "text-[#2A2350]"
                    }`}
                  >
                    {resolveOptionLabel(opt, optionLabels, lang)}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="px-4 py-3 text-[#140063]/40 text-sm">{lang === "ar" ? "لا توجد نتائج" : lang === "tr" ? "Sonuç yok" : "No results"}</p>
                )}
              </div>
            </div>
          )}
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>
      );
    }

    return (
      <div dir={isRTL ? "rtl" : "ltr"}>
        <label className="block text-sm font-medium text-[#140063] mb-1.5">
          {label} {isRequired && <span className="text-red-500">*</span>}
          {!isRequired && <span className="text-[#140063]/40 text-xs ml-1">({t("optional", lang)})</span>}
        </label>
        {field.sublabelEn && <p className="text-[#140063]/50 text-xs mb-2">{field.sublabelEn}</p>}
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={`${baseInput} cursor-pointer`}
        >
          <option value="">{t("select_placeholder", lang)}</option>
          {opts.filter((o) => o !== "").map((opt) => (
            <option key={opt} value={opt} className="bg-white text-[#140063]">
              {resolveOptionLabel(opt, optionLabels, lang)}
            </option>
          ))}
        </select>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "yesno" || field.type === "boolean") {
    const opts = field.options ?? ["yes", "no"];
    return (
      <div dir={isRTL ? "rtl" : "ltr"}>
        <label className="block text-sm font-semibold text-[#140063] mb-1.5">
          {label} {isRequired && <span className="text-red-500">*</span>}
          {!isRequired && <span className="text-[#6B6385] text-xs ml-1 font-normal">({t("optional", lang)})</span>}
        </label>
        <div className="flex gap-3">
          {opts.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`flex-1 h-[52px] rounded-2xl font-semibold text-sm transition border-[1.5px] ${
                value === opt
                  ? "bg-[#F0ECFF] border-[#140063] text-[#140063]"
                  : "bg-white border-[#E4DDF5] text-[#2A2350] hover:bg-[#F0ECFF] hover:border-[#140063]/40"
              }`}
            >
              {resolveOptionLabel(opt, field.optionLabels, lang)}
            </button>
          ))}
        </div>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "multiselect" || field.type === "multicheck") {
    const opts = field.options ?? [];
    const optionLabels = field.optionLabels;
    const selected: string[] = Array.isArray(value) ? value : [];
    const toggle = (opt: string) => {
      if (opt === "none") {
        // "None of the above" is exclusive — clicking it clears all other selections
        onChange(selected.includes("none") ? [] : ["none"]);
      } else {
        // Clicking any real option removes "none" if present
        const withoutNone = selected.filter((s) => s !== "none");
        if (withoutNone.includes(opt)) {
          onChange(withoutNone.filter((s) => s !== opt));
        } else {
          onChange([...withoutNone, opt]);
        }
      }
    };
    return (
      <div dir={isRTL ? "rtl" : "ltr"}>
        <label className="block text-sm font-semibold text-[#140063] mb-1.5">
          {label} {isRequired && <span className="text-red-500">*</span>}
          {!isRequired && <span className="text-[#6B6385] text-xs ml-1 font-normal">({t("optional", lang)})</span>}
        </label>
        {field.sublabelEn && <p className="text-[#6B6385] text-xs mb-2">{field.sublabelEn}</p>}
        <div className="flex flex-wrap gap-2">
          {opts.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition border-[1.5px] ${
                selected.includes(opt)
                  ? opt === "none" ? "bg-[#F0ECFF] text-[#140063] border-[#140063]/40" : "bg-[#140063] text-white border-[#140063]"
                  : "bg-white text-[#2A2350] border-[#E4DDF5] hover:bg-[#F0ECFF] hover:border-[#140063]/40"
              }`}
            >
              {resolveOptionLabel(opt, optionLabels, lang)}
            </button>
          ))}
        </div>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "height_weight") {
    // Structured height + weight with unit selectors
    const hw = (value && typeof value === "object") ? value : {};
    const heightVal = hw.height ?? "";
    const weightVal = hw.weight ?? "";
    const heightUnit = hw.heightUnit ?? "cm";
    const weightUnit = hw.weightUnit ?? "kg";

    const updateHW = (patch: Record<string, any>) => {
      const next = { height: heightVal, weight: weightVal, heightUnit, weightUnit, ...patch };
      onChange(next);
    };

    const unitBtn = "px-3 py-2 text-xs font-medium rounded-xl border-[1.5px] transition-colors cursor-pointer select-none";
    const unitActive = "bg-[#140063] border-[#140063] text-white";
    const unitInactive = "bg-white border-[#E4DDF5] text-[#6B6385] hover:bg-[#F0ECFF] hover:border-[#140063]/40";

    return (
      <div dir={isRTL ? "rtl" : "ltr"}>
        <label className="block text-sm font-medium text-[#140063] mb-1.5">
          {label} {isRequired && <span className="text-red-500">*</span>}
          {!isRequired && <span className="text-[#140063]/40 text-xs ml-1">({t("optional", lang)})</span>}
        </label>
        {field.sublabelEn && <p className="text-[#140063]/50 text-xs mb-3">{field.sublabelEn}</p>}
        <div className="grid grid-cols-2 gap-3">
          {/* Height */}
          <div>
            <p className="text-[#140063]/60 text-xs mb-1.5">Height</p>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step={0.1}
                value={heightVal}
                onChange={(e) => updateHW({ height: e.target.value })}
                placeholder={heightUnit === "cm" ? "e.g. 165" : "e.g. 5.5"}
                className={`${baseInput} flex-1 min-w-0`}
              />
              <div className="flex gap-1">
                <button type="button" onClick={() => updateHW({ heightUnit: "cm" })} className={`${unitBtn} ${heightUnit === "cm" ? unitActive : unitInactive}`}>cm</button>
                <button type="button" onClick={() => updateHW({ heightUnit: "ft" })} className={`${unitBtn} ${heightUnit === "ft" ? unitActive : unitInactive}`}>ft</button>
              </div>
            </div>
          </div>
          {/* Weight */}
          <div>
            <p className="text-[#140063]/60 text-xs mb-1.5">Weight</p>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step={0.1}
                value={weightVal}
                onChange={(e) => updateHW({ weight: e.target.value })}
                placeholder={weightUnit === "kg" ? "e.g. 65" : "e.g. 143"}
                className={`${baseInput} flex-1 min-w-0`}
              />
              <div className="flex gap-1">
                <button type="button" onClick={() => updateHW({ weightUnit: "kg" })} className={`${unitBtn} ${weightUnit === "kg" ? unitActive : unitInactive}`}>kg</button>
                <button type="button" onClick={() => updateHW({ weightUnit: "lbs" })} className={`${unitBtn} ${weightUnit === "lbs" ? unitActive : unitInactive}`}>lbs</button>
              </div>
            </div>
          </div>
        </div>
        {/* Live BMI preview */}
        {heightVal && weightVal && (() => {
          const hNum = parseFloat(String(heightVal));
          const wNum = parseFloat(String(weightVal));
          if (!hNum || !wNum) return null;
          const hCm = heightUnit === "ft" ? hNum * 30.48 : hNum;
          const wKg = weightUnit === "lbs" ? wNum * 0.453592 : wNum;
          const bmi = wKg / ((hCm / 100) ** 2);
          if (isNaN(bmi) || bmi <= 0 || bmi > 100) return null;
          const cat = bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal" : bmi < 30 ? "Overweight" : "Obese";
          const catColor = bmi < 18.5 ? "text-blue-500" : bmi < 25 ? "text-green-600" : bmi < 30 ? "text-yellow-600" : "text-red-500";
          return (
            <p className="text-[#6B6385] text-xs mt-2">
              BMI: <span className={`font-semibold ${catColor}`}>{bmi.toFixed(1)}</span>
              <span className={`ml-1 ${catColor}`}>({cat})</span>
            </p>
          );
        })()}
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "file") {
    // Multi-file support: value is an array of file entries
    const fileList: Array<{ file?: File; fileName?: string; fileUrl?: string; tag?: string; password?: string }> =
      Array.isArray(value) ? value : (value ? [value] : []);

    const updateFileEntry = (idx: number, patch: Record<string, any>) => {
      const next = fileList.map((f, i) => i === idx ? { ...f, ...patch } : f);
      onChange(next);
    };
    const removeFileEntry = (idx: number) => {
      const next = fileList.filter((_, i) => i !== idx);
      onChange(next.length ? next : undefined);
    };
    const addFiles = (newFiles: File[]) => {
      // Add all files at once to avoid stale closure issue when multiple files selected
      const baseName = field.id.replace(/^[mf]_/, "").replace(/_/g, "-");
      const newEntries = newFiles.map((file, i) => {
        const tagNum = String(fileList.length + i + 1).padStart(2, "0");
        return { file, fileName: file.name, tag: `${baseName}-${tagNum}` };
      });
      onChange([...fileList, ...newEntries]);
    };

    return (
      <div dir={isRTL ? "rtl" : "ltr"}>
        <label className="block text-sm font-semibold text-[#140063] mb-1.5">
          {label} {isRequired && <span className="text-red-500">*</span>}
          {!isRequired && <span className="text-[#6B6385] text-xs ml-1 font-normal">({t("optional", lang)})</span>}
        </label>
        {field.sublabelEn && <p className="text-[#6B6385] text-xs mb-2">{field.sublabelEn}</p>}
        <div className="space-y-3">
          {/* Existing file entries */}
          {fileList.map((fv, idx) => (
            <div key={idx} className="bg-[#F0ECFF]/40 border border-[#EDE7FA] rounded-2xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                <span className="text-[#140063] text-sm flex-1 truncate font-medium">{fv.fileName}</span>
                <button
                  type="button"
                  onClick={() => removeFileEntry(idx)}
                  className="text-red-400 hover:text-red-600 text-xs shrink-0 px-1"
                  title={t("delete_file", lang)}
                >✕</button>
              </div>
              {/* Tag field */}
              <input
                type="text"
                value={fv.tag ?? ""}
                onChange={(e) => updateFileEntry(idx, { tag: e.target.value })}
                placeholder={`${t("tag_label", lang)} (e.g. LabResult-01)`}
                className="w-full bg-white border border-[#E4DDF5] text-[#140063] placeholder-[#9A91B8] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-[2px] focus:ring-[#140063]/10 focus:border-[#140063]"
              />
              {/* Password field */}
              <input
                type="password"
                value={fv.password ?? ""}
                onChange={(e) => updateFileEntry(idx, { password: e.target.value })}
                placeholder={t("doc_password", lang)}
                className="w-full bg-white border border-[#E4DDF5] text-[#140063] placeholder-[#9A91B8] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-[2px] focus:ring-[#140063]/10 focus:border-[#140063]"
              />
            </div>
          ))}
          {/* Upload drop zone */}
          <label className="flex flex-col items-center justify-center gap-1.5 w-full border-[1.5px] border-dashed border-[#D8CFF0] bg-gradient-to-br from-white to-[#FFF7F2] text-[#6B6385] hover:text-[#140063] hover:border-[#140063]/50 rounded-2xl py-6 text-sm font-medium transition-colors cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-[#FECFB3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
            <span>{lang === "ar" ? "اضغط للرفع أو اسحب وأفلت" : lang === "tr" ? "Yüklemek için tıklayın veya sürükleyin" : "Tap to upload or drag and drop"}</span>
            <span className="text-xs text-[#9A91B8]">PDF, JPG, PNG up to 10MB</span>
            <span>+ {lang === "ar" ? "إضافة ملف" : lang === "tr" ? "Dosya ekle" : "Add file"}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) addFiles(files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  // ─── Repeatable Section
  if (field.type === "repeatable") {
    const entries = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
    const subFields = field.repeatableFields ?? [];
    const addLabel = field.addButtonLabelEn ?? t("add_entry", lang);
    const subBase = "w-full bg-white border border-[#E4DDF5] text-[#140063] placeholder-[#9A91B8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-[2px] focus:ring-[#140063]/10 focus:border-[#140063] transition-all";

    const updateEntry = (idx: number, subId: string, val: unknown) => {
      const next = entries.map((e, i) => i === idx ? { ...e, [subId]: val } : e);
      onChange(next);
    };
    const addEntry = () => onChange([...entries, {}]);
    const removeEntry = (idx: number) => onChange(entries.filter((_, i) => i !== idx));

    return (
      <div dir={isRTL ? "rtl" : "ltr"}>
        <label className="block text-sm font-medium text-[#140063] mb-1">
          {label} {isRequired && <span className="text-red-500">*</span>}
          {!isRequired && <span className="text-[#140063]/40 text-xs ml-1">({t("optional", lang)})</span>}
        </label>
        {field.sublabelEn && <p className="text-[#140063]/50 text-xs mb-3">{field.sublabelEn}</p>}
        <div className="space-y-4">
          {entries.map((entry, idx) => (
            <div key={idx} className="bg-white border border-[#EDE7FA] rounded-2xl p-4 space-y-3 relative shadow-[0_2px_8px_rgba(20,0,99,0.06)]">
              <button
                type="button"
                onClick={() => removeEntry(idx)}
                className="absolute top-3 right-3 text-red-500 hover:text-red-700 text-xs font-medium"
              >
                ✕ {t("remove", lang)}
              </button>
              <p className="text-[#140063]/50 text-xs font-semibold uppercase tracking-wide">Entry {idx + 1}</p>
              {subFields.map((sf) => {
                const sfVal = entry[sf.id];

                // Generic showIf support for sub-fields (e.g. type-specific radiology fields)
                if ((sf as any).showIf) {
                  const { fieldId, values } = (sf as any).showIf as { fieldId: string; values: string[] };
                  const siblingVal = entry[fieldId] as string | undefined;
                  if (!siblingVal || !values.includes(siblingVal)) return null;
                }

                // Conditional logic for ART history: hide egg/embryo fields for IUI, OI, Other
                const isArtHistoryField = field.id === "f_art_history";
                const currentTreatmentType = (entry["type"] as string) ?? "";
                const isEggEmbryoField = ["eggsCollected", "embryosFertilized", "embryosTransferred", "embryoQuality"].includes(sf.id);
                const showEggEmbryoFields = ["IVF", "ICSI", "DonorEggIVF", "FET", ""].includes(currentTreatmentType);
                if (isArtHistoryField && isEggEmbryoField && !showEggEmbryoFields) return null;

                if (sf.type === "textarea") {
                  return (
                    <div key={sf.id}>
                      <label className="block text-xs text-[#140063]/70 mb-1">{sf.labelEn}{sf.required && <span className="text-red-500 ml-0.5">*</span>}</label>
                      <textarea
                        rows={2}
                        value={(sfVal as string) ?? ""}
                        onChange={(e) => updateEntry(idx, sf.id, e.target.value)}
                        className={`${subBase} resize-none`}
                      />
                    </div>
                  );
                }
                if (sf.type === "select") {
                  return (
                    <div key={sf.id}>
                      <label className="block text-xs text-[#140063]/70 mb-1">{sf.labelEn}{sf.required && <span className="text-red-500 ml-0.5">*</span>}</label>
                      <select
                        value={(sfVal as string) ?? ""}
                        onChange={(e) => updateEntry(idx, sf.id, e.target.value)}
                        className={`${subBase} cursor-pointer`}
                      >
                        <option value="" className="bg-white text-[#140063]">{t("select_placeholder", lang)}</option>
                        {(sf.options ?? []).map((opt) => (
                          <option key={opt} value={opt} className="bg-white text-[#140063]">{sf.optionLabels?.[opt] ?? opt}</option>
                        ))}
                      </select>
                    </div>
                  );
                }
                if (sf.type === "file") {
                  // Multi-file support for sub-fields: value is an array of file entries
                  const sfFileList: Array<{ file?: File; fileName?: string; fileUrl?: string; tag?: string; password?: string }> =
                    Array.isArray(sfVal) ? sfVal : (sfVal ? [sfVal as any] : []);
                  const addSubFiles = (newFiles: File[]) => {
                    // Add all files at once to avoid stale closure when multiple files selected
                    const baseName = sf.id.replace(/^[mf]_/, "").replace(/_/g, "-");
                    const newEntries = newFiles.map((file, i) => {
                      const tagNum = String(sfFileList.length + i + 1).padStart(2, "0");
                      return { file, fileName: file.name, tag: `${baseName}-${tagNum}` };
                    });
                    updateEntry(idx, sf.id, [...sfFileList, ...newEntries]);
                  };
                  const removeSubFile = (fIdx: number) => {
                    const next = sfFileList.filter((_, i) => i !== fIdx);
                    updateEntry(idx, sf.id, next.length ? next : undefined);
                  };
                  const updateSubFile = (fIdx: number, patch: Record<string, any>) => {
                    const next = sfFileList.map((f, i) => i === fIdx ? { ...f, ...patch } : f);
                    updateEntry(idx, sf.id, next);
                  };
                  return (
                    <div key={sf.id}>
                      <label className="block text-xs text-[#140063]/70 mb-1">{sf.labelEn}</label>
                      <div className="space-y-2">
                        {sfFileList.map((fv, fIdx) => (
                          <div key={fIdx} className="bg-[#F0ECFF]/30 border border-[#EDE7FA] rounded-xl p-2.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Check className="w-3 h-3 text-green-600 shrink-0" />
                              <span className="text-[#140063] text-xs flex-1 truncate font-medium">{fv.fileName}</span>
                              <button type="button" onClick={() => removeSubFile(fIdx)} className="text-red-400 hover:text-red-600 text-xs shrink-0 px-1">✕</button>
                            </div>
                            <input
                              type="text"
                              value={fv.tag ?? ""}
                              onChange={(e) => updateSubFile(fIdx, { tag: e.target.value })}
                              placeholder={`${t("tag_label", lang)} (e.g. ${sf.id}-${String(fIdx + 1).padStart(2, "0")})`}
                              className="w-full bg-white border border-[#E4DDF5] text-[#140063] placeholder-[#9A91B8] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-[2px] focus:ring-[#140063]/10 focus:border-[#140063]"
                            />
                            <input
                              type="password"
                              value={fv.password ?? ""}
                              onChange={(e) => updateSubFile(fIdx, { password: e.target.value })}
                              placeholder={t("doc_password", lang)}
                              className="w-full bg-white border border-[#E4DDF5] text-[#140063] placeholder-[#9A91B8] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-[2px] focus:ring-[#140063]/10 focus:border-[#140063]"
                            />
                          </div>
                        ))}
                        <label className="flex flex-col items-center justify-center gap-1 w-full border-[1.5px] border-dashed border-[#D8CFF0] bg-gradient-to-br from-white to-[#FFF7F2] text-[#6B6385] hover:text-[#140063] hover:border-[#140063]/50 rounded-xl py-4 text-xs font-medium transition-colors cursor-pointer">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#FECFB3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                          <span>+ {lang === "ar" ? "إضافة ملف" : lang === "tr" ? "Dosya ekle" : "Add file"}</span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.dcm,.dicom,.doc,.docx"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              if (files.length > 0) addSubFiles(files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                }
                // default: text, date, number
                return (
                  <div key={sf.id}>
                    <label className="block text-xs text-[#140063]/70 mb-1">{sf.labelEn}{sf.required && <span className="text-red-500 ml-0.5">*</span>}</label>
                    <input
                      type={sf.type === "number" ? "number" : sf.type === "date" ? "date" : "text"}
                      value={(sfVal as string) ?? ""}
                      onChange={(e) => updateEntry(idx, sf.id, e.target.value)}
                      className={sf.type === "date" ? `${subBase} [color-scheme:light]` : subBase}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          <button
            type="button"
            onClick={addEntry}
            className="w-full border-[1.5px] border-dashed border-[#D8CFF0] text-[#6B6385] hover:text-[#140063] hover:border-[#140063]/50 bg-gradient-to-br from-white to-[#FFF7F2] rounded-2xl py-3 text-sm font-semibold transition-colors"
          >
            + {addLabel}
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  return null;
}

// ─── Decision Step ────────────────────────────────────────────────────────────
interface DecisionButton {
  label: string;
  labelAr?: string;
  labelTr?: string;
  /**
   * next_step             — go to the next wizard step
   * whatsapp              — open WhatsApp
   * schedule_call         — open a calendar link (legacy)
   * schedule_call_inapp   — show in-form date/time picker → creates appointment in system
   * complete_section      — go to a named section of steps, then return here
   */
  action: "next_step" | "whatsapp" | "schedule_call" | "schedule_call_inapp" | "complete_section";
  target?: string; // WhatsApp number, URL, or section id for complete_section
  icon?: "continue" | "whatsapp" | "phone" | "calendar" | "female" | "male";
  /** For complete_section: the step IDs that belong to this section */
  sectionStepIds?: string[];
}

interface DecisionStep {
  type: "decision";
  title: string;
  titleAr?: string;
  titleTr?: string;
  subtitle?: string;
  subtitleAr?: string;
  subtitleTr?: string;
  buttons: DecisionButton[];
}

function DecisionStepView({
  step,
  lang,
  onNext,
  onStartSection,
  completedSections,
  onScheduleCallback,
}: {
  step: DecisionStep;
  lang: "en" | "ar" | "tr";
  onNext: () => void;
  onStartSection?: (btn: DecisionButton) => void;
  completedSections?: Set<string>;
  onScheduleCallback?: (coordinatorId: number | null, isoStart: string, isoEnd: string, coordinatorName: string, fallbackNote?: string) => Promise<void>;
}) {
  const isRTL = lang === "ar";
  const title = (lang === "ar" && step.titleAr) ? step.titleAr
    : (lang === "tr" && step.titleTr) ? step.titleTr
    : step.title;
  const subtitle = (lang === "ar" && step.subtitleAr) ? step.subtitleAr
    : (lang === "tr" && step.subtitleTr) ? step.subtitleTr
    : step.subtitle;

  // In-app scheduling state
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedDone, setSchedDone] = useState(false);
  const [schedConfirmLabel, setSchedConfirmLabel] = useState("");

  // Determine if all complete_section buttons are done → show Submit
  const sectionButtons = step.buttons.filter((b) => b.action === "complete_section");
  const allSectionsComplete = sectionButtons.length > 0 &&
    sectionButtons.every((b) => completedSections?.has(b.target ?? b.label));

  async function handleConfirmSlot(coordinatorId: number, isoStart: string, isoEnd: string, coordinatorName: string) {
    setSchedLoading(true);
    try {
      await onScheduleCallback?.(coordinatorId, isoStart, isoEnd, coordinatorName);
      const dt = new Date(isoStart);
      const label = dt.toLocaleString(lang === "ar" ? "ar-SA" : lang === "tr" ? "tr-TR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
      setSchedConfirmLabel(`${coordinatorName} · ${label}`);
      setSchedDone(true);
      setShowScheduler(false);
      toast.success(lang === "ar" ? "تم حجز موعدك بنجاح!" : lang === "tr" ? "Randevunuz başarıyla oluşturuldu!" : "Your callback has been scheduled!");
    } catch (e: any) {
      toast.error(e?.message ?? (lang === "ar" ? "حدث خطأ، حاول مرة أخرى" : "Something went wrong. Please try again."));
    } finally {
      setSchedLoading(false);
    }
  }

  async function handleFallback(note: string) {
    setSchedLoading(true);
    try {
      await onScheduleCallback?.(null, "", "", "", note);
      setSchedConfirmLabel(lang === "ar" ? "سيتواصل معك فريقنا قريباً" : "Our team will reach out to you");
      setSchedDone(true);
      setShowScheduler(false);
      toast.success(lang === "ar" ? "تم استلام طلبك!" : "We've received your request!");
    } catch (e: any) {
      toast.error(e?.message ?? (lang === "ar" ? "حدث خطأ" : "Something went wrong."));
    } finally {
      setSchedLoading(false);
    }
  }

  function handleButton(btn: DecisionButton) {
    if (btn.action === "next_step") {
      onNext();
    } else if (btn.action === "whatsapp") {
      const num = btn.target ?? "";
      window.open(`https://wa.me/${num.replace(/\D/g, "")}`, "_blank");
    } else if (btn.action === "schedule_call") {
      const url = btn.target ?? "";
      if (url) window.open(url, "_blank");
      else toast.info("Please contact us to schedule a call.");
    } else if (btn.action === "schedule_call_inapp") {
      setShowScheduler(true);
    } else if (btn.action === "complete_section") {
      onStartSection?.(btn);
    }
  }

  const iconMap: Record<string, React.ReactNode> = {
    continue: <ChevronRight className="w-5 h-5" />,
    whatsapp: <MessageCircle className="w-5 h-5" />,
    phone: <Phone className="w-5 h-5" />,
    calendar: <Calendar className="w-5 h-5" />,
    female: <span className="text-lg">♀</span>,
    male: <span className="text-lg">♂</span>,
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4" dir={isRTL ? "rtl" : "ltr"}>
      <h2 className="text-2xl font-bold text-[#140063] mb-3">{title}</h2>
      {subtitle && <p className="text-[#140063]/60 text-base mb-8 max-w-sm">{subtitle}</p>}

      {/* In-app coordinator booking modal */}
      {showScheduler && (
        <div className="w-full max-w-sm bg-white border border-[#FECFB3] rounded-2xl p-5 mb-4 shadow-sm">
          <CoordinatorBookingModal
            lang={lang}
            loading={schedLoading}
            onConfirm={handleConfirmSlot}
            onFallback={handleFallback}
            onCancel={() => setShowScheduler(false)}
          />
        </div>
      )}

      {schedDone && (
        <div className="w-full max-w-xs bg-green-50 border border-green-200 rounded-2xl p-4 mb-4 text-center">
          <p className="text-green-700 font-semibold text-sm">
            ✓ {schedConfirmLabel || (lang === "ar" ? "تم حجز موعدك بنجاح" : "Callback scheduled successfully")}
          </p>
        </div>
      )}

      <div className="w-full max-w-xs space-y-3">
        {step.buttons.map((btn, i) => {
          const btnLabel = (lang === "ar" && btn.labelAr) ? btn.labelAr
            : (lang === "tr" && btn.labelTr) ? btn.labelTr
            : btn.label;
          const sectionKey = btn.target ?? btn.label;
          const isDone = btn.action === "complete_section" && completedSections?.has(sectionKey);
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleButton(btn)}
              className={`w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-bold text-base transition relative ${
                isDone
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : i === 0
                    ? "bg-[#140063] text-white hover:bg-[#140063]/90"
                    : "bg-[#FFEFE5] text-[#140063] border border-[#FECFB3] hover:bg-[#FECFB3]"
              }`}
            >
              {btn.icon && iconMap[btn.icon]}
              {btnLabel}
              {isDone && <span className="absolute right-4 text-green-400">✓</span>}
            </button>
          );
        })}
        {/* When all sections are complete, show a Submit / Continue button */}
        {allSectionsComplete && (
          <button
            type="button"
            onClick={onNext}
            className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-bold text-base bg-[#140063] text-white hover:bg-[#140063]/90 transition mt-2"
          >
            <ChevronRight className="w-5 h-5" />
                {t("submit", lang)}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DynamicIntakeWizardPage() {
  const [location] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const formParam = params.get("form") ?? "";
  const slug = formParam;
  const source = params.get("source") ?? params.get("utm_source") ?? "";
  const campaign = params.get("campaign") ?? params.get("utm_campaign") ?? "";
  const brand = (params.get("brand") ?? "fertiliv") as "fertiliv" | "safemedigo" | "dr-nilay-karaca";

  // Detect if the form param is a numeric ID or a slug
  const numericId = formParam && /^\d+$/.test(formParam) ? parseInt(formParam, 10) : null;
  const formQueryInput = useMemo(
    () => numericId !== null ? { id: numericId } : { slug: formParam },
    [numericId, formParam]
  );

  // Fetch form config
  const { data: formConfig, isLoading: formLoading } = trpc.intakeForms.get.useQuery(
    formQueryInput as any,
    { enabled: !!formParam, retry: false }
  );

  // Fetch field catalog
  const { data: catalogData } = trpc.intakeForms.getFieldCatalog.useQuery();

  // Fetch treatment → gender applicability map
  const { data: treatmentGenderMap } = trpc.intakeForms.getTreatmentGenderMap.useQuery();

  // Detect language from form config title translations
  const titleTranslations = useMemo(() => {
    if (!formConfig) return null;
    return (formConfig as any).titleTranslations as Record<string, string> | null;
  }, [formConfig]);

  const subtitleTranslations = useMemo(() => {
    if (!formConfig) return null;
    return (formConfig as any).subtitleTranslations as Record<string, string> | null;
  }, [formConfig]);

  const [lang, setLang] = useState<"en" | "ar" | "tr">("en");

  useEffect(() => {
    if (titleTranslations) {
      setLang(detectLang(titleTranslations));
    }
  }, [titleTranslations]);

  const isRTL = lang === "ar";

  // Build ordered field definitions from the form config
  const formFields: FieldDef[] = useMemo(() => {
    if (!formConfig || !catalogData) return [];
    const fieldIds: string[] = Array.isArray(formConfig.fields)
      ? (formConfig.fields as string[])
      : JSON.parse((formConfig.fields as string) ?? "[]");
    const catalog = (catalogData as unknown) as FieldDef[];
    return fieldIds
      .map((id) => catalog.find((f) => f.id === id))
      .filter(Boolean) as FieldDef[];
  }, [formConfig, catalogData]);

  // Apply translations and fieldConfig overrides from form config to field labels
  const translatedFields: FieldDef[] = useMemo(() => {
    if (!formConfig) return formFields;
    const trans = (formConfig as any).translations as Record<string, Record<string, string>> | null;
    const fConfig = (formConfig as any).fieldConfig as Record<string, { enabledSubFields?: string[] }> | null;
    return formFields.map((f) => {
      let updated = { ...f };
      // Apply translations
      if (trans) {
        const fieldTrans = trans[f.id];
        if (fieldTrans) {
          updated.labelAr = fieldTrans.ar || f.labelAr;
          updated.labelTr = fieldTrans.tr || f.labelTr;
        }
        // Apply option translations: translations[fieldId__opt__optValue]
        if (f.options && f.options.length > 0) {
          const translatedOptionLabels: Record<string, string> = { ...(f.optionLabels ?? {}) };
          for (const opt of f.options) {
            const optKey = `${f.id}__opt__${opt}`;
            const optTrans = trans[optKey];
            if (optTrans) {
              // Build a language-aware label: store as ar/tr in a special key
              // We use a convention: store translated label directly in optionLabels
              // but we need lang-aware resolution — store as __ar__ and __tr__ prefixed keys
              if (optTrans.ar) translatedOptionLabels[`__ar__${opt}`] = optTrans.ar;
              if (optTrans.tr) translatedOptionLabels[`__tr__${opt}`] = optTrans.tr;
            }
          }
          updated.optionLabels = translatedOptionLabels;
        }
      }
      // Apply enabledSubFields override for repeatable fields
      if (fConfig && f.type === "repeatable" && fConfig[f.id]?.enabledSubFields) {
        const enabled = fConfig[f.id].enabledSubFields!;
        updated = {
          ...updated,
          repeatableFields: (f as any).repeatableFields?.filter((sf: any) => enabled.includes(sf.id)),
        };
      }
      return updated;
    });
  }, [formFields, formConfig]);

  // Build wizard steps from stepsMeta (if configured) or fall back to category grouping
  const steps = useMemo(() => {
    const rawStepsMeta = (formConfig as any)?.stepsMeta;
    // Only use stepsMeta if at least one field-type step has fieldIds configured
    const hasConfiguredSteps = Array.isArray(rawStepsMeta) && rawStepsMeta.some(
      (s: any) => s.type === "decision" || (Array.isArray(s.fieldIds) && s.fieldIds.length > 0)
    );
    if (hasConfiguredSteps) {
      // Use the saved stepsMeta from Form Builder
      return rawStepsMeta.map((s: any) => {
        if (s.type === "decision") {
          // Apply language-aware decision title
          const decisionLabel =
            (lang === "ar" && s.decisionTitleAr) ? s.decisionTitleAr :
            (lang === "tr" && s.decisionTitleTr) ? s.decisionTitleTr :
            (s.decisionTitle || "Decision");
          const decisionSubtitle =
            (lang === "ar" && s.decisionSubtitleAr) ? s.decisionSubtitleAr :
            (lang === "tr" && s.decisionSubtitleTr) ? s.decisionSubtitleTr :
            s.decisionSubtitle;
          return {
            type: "decision" as const,
            id: s.id,
            label: decisionLabel,
            subtitle: decisionSubtitle,
            fields: [],
            decisionStep: s,
          };
        }
        // type === "fields"
        // fieldConditions: { [fieldId]: { fieldId: string; values: string[] } }
        // Stored in stepsMeta as s.fieldConditions — applied as showIf on each field
        const fieldConditions: Record<string, { fieldId: string; values: string[] }> =
          (s.fieldConditions as Record<string, { fieldId: string; values: string[] }>) ?? {};
        const stepFields = (s.fieldIds as string[] ?? []).map((id: string) => {
          const base = translatedFields.find((f) => f.id === id);
          if (!base) return null;
          const cond = fieldConditions[id];
          if (cond) {
            // Override showIf with the step-level condition
            return { ...base, showIf: cond };
          }
          return base;
        }).filter(Boolean) as FieldDef[];
        return {
          type: "fields" as const,
          id: s.id,
          label: (lang === "ar" && s.titleAr) ? s.titleAr : (lang === "tr" && s.titleTr) ? s.titleTr : (s.title ?? `Step ${s.id}`),
          subtitle: (lang === "ar" && s.subtitleAr) ? s.subtitleAr : (lang === "tr" && s.subtitleTr) ? s.subtitleTr : s.subtitle,
          fields: stepFields,
        };
      }).filter((s: any) => s.type === "decision" || s.fields.length > 0);
    }
    // Fallback: group by category
    return STEP_GROUPS.map((group) => ({
      type: "fields" as const,
      id: group.label,
      label: group.label,
      subtitle: undefined,
      fields: translatedFields.filter((f) => group.categories.includes(f.category)),
    })).filter((s) => s.fields.length > 0);
  }, [translatedFields, formConfig, lang]);

  // Form state: fieldId → value
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [submitted, setSubmitted] = useState(false);

  // Section completion tracking for Decision Step "complete_section" buttons
  // Maps sectionKey (btn.target ?? btn.label) → true when that section is done
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());
  // When inside a section, remember the Decision Step index to return to
  const [returnToStepIndex, setReturnToStepIndex] = useState<number | null>(null);
  // The section key currently being completed (so we can mark it done on finish)
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);

  const submitBasicInfo = trpc.intake.submitBasicInfo.useMutation();
  const scheduleCallbackMutation = trpc.intake.scheduleCallback.useMutation();
  const sendOtpMutation = trpc.intake.sendOtp.useMutation();
  const verifyOtpMutation = trpc.intake.verifyOtp.useMutation();
  const checkExistingLeadMutation = trpc.intake.checkExistingLead.useMutation();
  const uploadFileMutation = trpc.intake.uploadFile.useMutation();
  // intakeToken is received after submitBasicInfo succeeds (for schedule_call_inapp)
  const [intakeToken, setIntakeToken] = useState<string | null>(null);

  // OTP flow state
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpMaskedEmail, setOtpMaskedEmail] = useState("");
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const otpCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resume flow state
  const [existingLeadFound, setExistingLeadFound] = useState(false);
  const [existingLeadMaskedEmail, setExistingLeadMaskedEmail] = useState("");

  function startOtpCooldown() {
    setOtpResendCooldown(60);
    if (otpCooldownRef.current) clearInterval(otpCooldownRef.current);
    otpCooldownRef.current = setInterval(() => {
      setOtpResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(otpCooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendOtp() {
    if (!intakeToken) return;
    setOtpLoading(true);
    setOtpError("");
    try {
      const res = await sendOtpMutation.mutateAsync({ intakeToken });
      setOtpMaskedEmail(res.maskedEmail);
      startOtpCooldown();
      toast.success(lang === "ar" ? `تم إرسال رمز التحقق إلى ${res.maskedEmail}` : `Verification code sent to ${res.maskedEmail}`);
    } catch (e: any) {
      setOtpError(e?.message ?? "Failed to send OTP");
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!intakeToken || otpValue.length !== 6) return;
    setOtpLoading(true);
    setOtpError("");
    try {
      await verifyOtpMutation.mutateAsync({ intakeToken, otp: otpValue });
      setShowOtpScreen(false);
      toast.success(lang === "ar" ? "تم التحقق من بريدك الإلكتروني!" : "Email verified successfully!");
      // Advance to the next step
      setDirection(1);
      setStepIndex((prev) => prev + 1);
    } catch (e: any) {
      setOtpError(e?.message ?? "Invalid code");
    } finally {
      setOtpLoading(false);
    }
  }

  function handleSkipOtp() {
    setShowOtpScreen(false);
    setDirection(1);
    setStepIndex((prev) => prev + 1);
  }

  const setField = useCallback((id: string, val: any) => {
    setFormData((prev) => ({ ...prev, [id]: val }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Compute applicableTo based on selected treatment interest
  const genderApplicability = useMemo((): "both" | "female_only" | "male_only" => {
    if (!treatmentGenderMap) return "both";
    const selected: string[] = Array.isArray(formData["l_mainMedicalInterest"])
      ? formData["l_mainMedicalInterest"]
      : formData["l_mainMedicalInterest"] ? [formData["l_mainMedicalInterest"]] : [];
    if (selected.length === 0) return "both";
    // If any selected treatment requires both genders, show all
    const applicabilities = selected.map((t) => (treatmentGenderMap as Record<string, string>)[t] ?? "both");
    if (applicabilities.includes("both")) return "both";
    // If all are female_only → female_only; all male_only → male_only; mixed → both
    const uniqueSet = new Set(applicabilities);
    if (uniqueSet.size === 1) return applicabilities[0] as "female_only" | "male_only";
    return "both";
  }, [formData, treatmentGenderMap]);

  // Evaluate showIf condition
  const isVisible = useCallback(
    (field: FieldDef): boolean => {
      // Gender-based filtering: hide opposite-gender medical fields
      if (genderApplicability !== "both") {
        if (genderApplicability === "female_only" && (field.category === "fertility_male")) return false;
        if (genderApplicability === "male_only" && (field.category === "fertility_female")) return false;
      }
      if (!field.showIf) return true;
      const { fieldId, values } = field.showIf;
      const currentVal = formData[fieldId];
      // Special sentinel: __nonzero__ — show when the referenced field has a non-zero numeric value
      if (values.includes("__nonzero__")) {
        const num = Number(currentVal);
        return !isNaN(num) && num > 0;
      }
      if (Array.isArray(currentVal)) {
        return currentVal.some((v) => values.includes(v));
      }
      return values.includes(currentVal);
    },
    [formData, genderApplicability]
  );

  const currentStep = steps[stepIndex];
  const isDecisionStep = currentStep?.type === "decision";
  const visibleFields = isDecisionStep ? [] : (currentStep?.fields.filter(isVisible) ?? []);
  const isLastStep = stepIndex === steps.length - 1;
  const isFirstStep = stepIndex === 0;

  // Validate current step
  const validateStep = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    for (const field of visibleFields) {
      if (!field.required) continue;
      const val = formData[field.id];
      if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
        errs[field.id] = t("required_error", lang);
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [visibleFields, formData]);

  const goNext = useCallback(() => {
    if (!validateStep()) return;
    // If we're on the last step of a section, return to the Decision Step
    if (returnToStepIndex !== null && isLastStep) {
      // Mark the section as complete
      if (activeSectionKey) {
        setCompletedSections((prev) => { const next = new Set(prev); next.add(activeSectionKey); return next; });
      }
      setActiveSectionKey(null);
      const returnIdx = returnToStepIndex;
      setReturnToStepIndex(null);
      setDirection(-1);
      setStepIndex(returnIdx);
      return;
    }
    // Check if next step is the last step of a section (we're inside a section)
    if (returnToStepIndex !== null && stepIndex + 1 >= steps.length - 1) {
      // Continue normally to the last section step
    }
    if (isLastStep) {
      handleSubmit();
    } else {
      // OTP flow: after Step 0 (first step), if the form has an email field and the lead
      // has been submitted (intakeToken exists), show OTP verification screen
      const isStep0 = stepIndex === 0;
      const hasEmail = visibleFields.some((f) => f.id === "email" || f.id === "l_email" || f.type === "email");
      if (isStep0 && hasEmail && intakeToken) {
        // Trigger OTP: show OTP screen instead of advancing
        setShowOtpScreen(true);
        // Auto-send OTP
        handleSendOtp();
        return;
      }
      setDirection(1);
      setStepIndex((i) => i + 1);
    }
  }, [validateStep, isLastStep, returnToStepIndex, activeSectionKey, stepIndex, steps.length, visibleFields, intakeToken]);

  const goBack = useCallback(() => {
    if (!isFirstStep) {
      // If at the first step of a section, go back to the Decision Step
      if (returnToStepIndex !== null && stepIndex === returnToStepIndex + 1) {
        setActiveSectionKey(null);
        const returnIdx = returnToStepIndex;
        setReturnToStepIndex(null);
        setDirection(-1);
        setStepIndex(returnIdx);
        return;
      }
      setDirection(-1);
      setStepIndex((i) => i - 1);
    }
  }, [isFirstStep, returnToStepIndex, stepIndex]);

  /**
   * Called when the user clicks a "complete_section" button in a Decision Step.
   * Navigates to the first step of the section and remembers where to return.
   */
  const handleStartSection = useCallback((btn: DecisionButton) => {
    const sectionKey = btn.target ?? btn.label;
    const sectionStepIds = btn.sectionStepIds ?? [];
    // Find the first step in the section
    let targetIdx = -1;
    if (sectionStepIds.length > 0) {
      targetIdx = steps.findIndex((s) => sectionStepIds.includes(s.id));
    }
    if (targetIdx === -1) {
      // Fallback: find the next fields step after the current decision step
      targetIdx = steps.findIndex((s, i) => i > stepIndex && s.type === "fields");
    }
    if (targetIdx === -1) {
      toast.info("No steps configured for this section.");
      return;
    }
    setActiveSectionKey(sectionKey);
    setReturnToStepIndex(stepIndex);
    setDirection(1);
    setStepIndex(targetIdx);
  }, [steps, stepIndex]);

  // Helper: evaluate showIf for any field using current formData (used during payload build)
  const isFieldVisibleForPayload = useCallback((field: FieldDef): boolean => {
    if (genderApplicability !== "both") {
      if (genderApplicability === "female_only" && field.category === "fertility_male") return false;
      if (genderApplicability === "male_only" && field.category === "fertility_female") return false;
    }
    if (!field.showIf) return true;
    const { fieldId, values } = field.showIf;
    const currentVal = formData[fieldId];
    if (values.includes("__nonzero__")) {
      const num = Number(currentVal);
      return !isNaN(num) && num > 0;
    }
    if (Array.isArray(currentVal)) return currentVal.some((v) => values.includes(v));
    return values.includes(currentVal);
  }, [formData, genderApplicability]);

  const handleSubmit = useCallback(async () => {
    if (!validateStep()) return;

    // Build payload from all collected form data — skip hidden fields
    const payload: Record<string, any> = {
      brand,
      leadSource: source || undefined,
      campaignName: campaign || undefined,
    };

    // Collect file entries to upload after lead creation
    const pendingFileUploads: Array<{
      fieldId: string;
      file: File;
      fileName: string;
      tag?: string;
      password?: string;
    }> = [];

    // Map field IDs to server field names — only include visible fields
    for (const field of formFields) {
      // Skip fields hidden by showIf or gender filter
      if (!isFieldVisibleForPayload(field)) continue;

      const val = formData[field.id];

      // Collect file fields separately for post-submission upload
      if (field.type === "file") {
        const fileList: Array<{ file?: File; fileName?: string; tag?: string; password?: string }> =
          Array.isArray(val) ? val : (val ? [val] : []);
        for (const entry of fileList) {
          if (entry.file) {
            pendingFileUploads.push({
              fieldId: field.id,
              file: entry.file,
              fileName: entry.fileName ?? entry.file.name,
              tag: entry.tag,
              password: entry.password,
            });
          }
        }
        continue; // Don't include raw File objects in the JSON payload
      }

      // Collect files nested inside repeatable sub-fields
      if (field.type === "repeatable" && Array.isArray(val)) {
        const subFields = field.repeatableFields ?? [];
        for (const entry of val as Record<string, unknown>[]) {
          for (const sf of subFields) {
            if (sf.type === "file") {
              const sfVal = entry[sf.id];
              const sfFileList: Array<{ file?: File; fileName?: string; tag?: string; password?: string }> =
                Array.isArray(sfVal) ? sfVal : (sfVal ? [sfVal as any] : []);
              for (const fEntry of sfFileList) {
                if (fEntry.file) {
                  pendingFileUploads.push({
                    fieldId: `${field.id}__${sf.id}`,
                    file: fEntry.file,
                    fileName: fEntry.fileName ?? fEntry.file.name,
                    tag: fEntry.tag,
                    password: fEntry.password,
                  });
                }
              }
            }
          }
        }
        // Strip raw File objects from the repeatable payload before sending as JSON
        const sanitizedEntries = (val as Record<string, unknown>[]).map((entry) => {
          const cleaned: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(entry)) {
            const sf = subFields.find((s) => s.id === k);
            if (sf?.type === "file") {
              // Replace file array with just metadata (no File objects)
              const fileArr = Array.isArray(v) ? v : (v ? [v] : []);
              cleaned[k] = (fileArr as any[]).map(({ file: _f, ...rest }) => rest).filter((r) => r.fileName);
            } else {
              cleaned[k] = v;
            }
          }
          return cleaned;
        });
        if (field.id.startsWith("f_") || field.id.startsWith("m_") || field.id.startsWith("p_")) {
          payload[field.id] = sanitizedEntries;
        }
        continue;
      }

      if (val === undefined || val === null || val === "") continue;
      if (Array.isArray(val) && val.length === 0) continue;

      // Coerce number-type fields from string to number
      const coercedVal = field.type === "number" && typeof val === "string" && val !== ""
        ? (isNaN(Number(val)) ? val : Number(val))
        : val;

      if (field.id === "l_isLocalPatient") {
        payload["patientType"] = coercedVal === "yes" ? "local" : "international";
        continue;
      }

      if (field.id.startsWith("l_")) {
        const key = field.id.slice(2);
        payload[key] = coercedVal;
      } else if (
        field.id.startsWith("f_") ||
        field.id.startsWith("m_") ||
        field.id.startsWith("p_")
      ) {
        payload[field.id] = coercedVal;
      }
    }

    // Ensure required server fields have defaults
    if (!payload.firstName) { toast.error(t("first_name_required", lang)); return; }
    if (!payload.lastName)  { toast.error(t("last_name_required", lang)); return; }
    if (!payload.phone)     { toast.error(t("phone_required", lang)); return; }

    try {
      const result = await submitBasicInfo.mutateAsync(payload as any);
      const token = (result as any)?.intakeToken;
      if (token) {
        setIntakeToken(token);
        // Upload any pending files now that we have the intakeToken
        if (pendingFileUploads.length > 0) {
          const uploadPromises = pendingFileUploads.map(async (entry) => {
            try {
              const arrayBuffer = await entry.file.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = "";
              for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
              const base64 = btoa(binary);
              await uploadFileMutation.mutateAsync({
                intakeToken: token,
                fileBase64: base64,
                fileName: entry.fileName,
                mimeType: entry.file.type || "application/octet-stream",
                tag: entry.tag,
                password: entry.password,
                fieldId: entry.fieldId,
              });
            } catch (fileErr) {
              console.error("[intake] File upload failed:", entry.fileName, fileErr);
              // Non-fatal: continue even if one file fails
            }
          });
          await Promise.allSettled(uploadPromises);
        }
      }
      setSubmitted(true);
    } catch (e: any) {
      toast.error(e?.message ?? t("something_wrong", lang));
    }
  }, [formData, formFields, brand, source, campaign, submitBasicInfo, uploadFileMutation, validateStep, isFieldVisibleForPayload, lang, genderApplicability]);

  /**
   * Called from DecisionStepView when user confirms a coordinator slot or submits fallback.
   * If the lead hasn't been submitted yet, submits first, then schedules.
   */
  const handleScheduleCallback = useCallback(async (
    coordinatorId: number | null,
    isoStart: string,
    isoEnd: string,
    coordinatorName: string,
    fallbackNote?: string
  ) => {
    let token = intakeToken;
    // If form not submitted yet, submit it first to get the token
    if (!token) {
      const payload: Record<string, any> = {
        brand,
        leadSource: source || undefined,
        campaignName: campaign || undefined,
      };
      const pendingFileUploads: Array<{ fieldId: string; file: File; fileName: string; tag?: string; password?: string }> = [];
      for (const field of formFields) {
        // Skip hidden fields
        if (!isFieldVisibleForPayload(field)) continue;
        const val = formData[field.id];
        // Collect file fields separately
        if (field.type === "file") {
          const fileList: Array<{ file?: File; fileName?: string; tag?: string; password?: string }> =
            Array.isArray(val) ? val : (val ? [val] : []);
          for (const entry of fileList) {
            if (entry.file) pendingFileUploads.push({ fieldId: field.id, file: entry.file, fileName: entry.fileName ?? entry.file.name, tag: entry.tag, password: entry.password });
          }
          continue;
        }
        // Collect files nested inside repeatable sub-fields
        if (field.type === "repeatable" && Array.isArray(val)) {
          const subFields = field.repeatableFields ?? [];
          for (const entry of val as Record<string, unknown>[]) {
            for (const sf of subFields) {
              if (sf.type === "file") {
                const sfVal = entry[sf.id];
                const sfFileList: Array<{ file?: File; fileName?: string; tag?: string; password?: string }> =
                  Array.isArray(sfVal) ? sfVal : (sfVal ? [sfVal as any] : []);
                for (const fEntry of sfFileList) {
                  if (fEntry.file) {
                    pendingFileUploads.push({
                      fieldId: `${field.id}__${sf.id}`,
                      file: fEntry.file,
                      fileName: fEntry.fileName ?? fEntry.file.name,
                      tag: fEntry.tag,
                      password: fEntry.password,
                    });
                  }
                }
              }
            }
          }
          const sanitizedEntries = (val as Record<string, unknown>[]).map((entry) => {
            const cleaned: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(entry)) {
              const sf = subFields.find((s) => s.id === k);
              if (sf?.type === "file") {
                const fileArr = Array.isArray(v) ? v : (v ? [v] : []);
                cleaned[k] = (fileArr as any[]).map(({ file: _f, ...rest }) => rest).filter((r) => r.fileName);
              } else {
                cleaned[k] = v;
              }
            }
            return cleaned;
          });
          if (field.id.startsWith("f_") || field.id.startsWith("m_") || field.id.startsWith("p_")) {
            payload[field.id] = sanitizedEntries;
          }
          continue;
        }
        if (val === undefined || val === null || val === "") continue;
        if (Array.isArray(val) && val.length === 0) continue;
        const coercedVal = field.type === "number" && typeof val === "string" && val !== ""
          ? (isNaN(Number(val)) ? val : Number(val))
          : val;
        if (field.id === "l_isLocalPatient") {
          payload["patientType"] = coercedVal === "yes" ? "local" : "international";
          continue;
        }
        if (field.id.startsWith("l_")) {
          payload[field.id.slice(2)] = coercedVal;
        } else {
          payload[field.id] = coercedVal;
        }
      }
      if (!payload.firstName || !payload.lastName || !payload.phone) {
        throw new Error("Please fill in your name and phone number first.");
      }
      const result = await submitBasicInfo.mutateAsync(payload as any);
      token = (result as any)?.intakeToken ?? null;
      if (token) {
        setIntakeToken(token);
        // Upload pending files
        if (pendingFileUploads.length > 0) {
          await Promise.allSettled(pendingFileUploads.map(async (entry) => {
            try {
              const arrayBuffer = await entry.file.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = "";
              for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
              const base64 = btoa(binary);
              await uploadFileMutation.mutateAsync({ intakeToken: token!, fileBase64: base64, fileName: entry.fileName, mimeType: entry.file.type || "application/octet-stream", tag: entry.tag, password: entry.password, fieldId: entry.fieldId });
            } catch (e) { console.error("[intake] File upload failed:", entry.fileName, e); }
          }));
        }
      }
      setSubmitted(true);
    }
    if (!token) throw new Error("Could not get intake token. Please try again.");
    if (fallbackNote) {
      await scheduleCallbackMutation.mutateAsync({ intakeToken: token, fallbackNote });
    } else {
      await scheduleCallbackMutation.mutateAsync({
        intakeToken: token,
        isoStart: isoStart || undefined,
        isoEnd: isoEnd || undefined,
        coordinatorId: coordinatorId ?? undefined,
        coordinatorName: coordinatorName || undefined,
      });
    }
  }, [intakeToken, formData, formFields, brand, source, campaign, submitBasicInfo, uploadFileMutation, scheduleCallbackMutation, isFieldVisibleForPayload]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (formLoading || !catalogData) {
    return (
      <div className="min-h-screen bg-[#F0ECFF] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#140063] animate-spin" />
      </div>
    );
  }

  // ── Form not found ─────────────────────────────────────────────────────────
  if (!formConfig || steps.length === 0) {
    return (
      <div className="min-h-screen bg-[#F0ECFF] flex items-center justify-center p-6">
        <div className="text-center text-[#140063]">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2">Form not found</h1>
          <p className="text-[#140063]/60">The form you're looking for doesn't exist or has no fields configured.</p>
        </div>
      </div>
    );
  }

  // ── Thank you screen ───────────────────────────────────────────────────────
  if (submitted) {
    const thankYouTitle = lang === "ar" ? "شكراً لك!" : lang === "tr" ? "Teşekkürler!" : "Thank you!";
    const thankYouMsg = lang === "ar"
      ? "لقد استلمنا معلوماتك. سيتواصل معك فريقنا قريباً."
      : lang === "tr"
      ? "Bilgilerinizi aldık. Ekibimiz kısa süre içinde sizinle iletişime geçecek."
      : "We've received your information. Our team will be in touch with you shortly.";

    return (
      <div className="min-h-screen bg-[#F0ECFF] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-[#140063] max-w-sm"
          dir={isRTL ? "rtl" : "ltr"}
        >
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold mb-3">{thankYouTitle}</h1>
          <p className="text-[#140063]/70 leading-relaxed">{thankYouMsg}</p>
        </motion.div>
      </div>
    );
  }

  // ── Wizard ─────────────────────────────────────────────────────────────────
  const progressPct = ((stepIndex + 1) / steps.length) * 100;

  // Resolve form title and subtitle from translations
  const formTitle = titleTranslations?.[lang] || titleTranslations?.["en"] || (formConfig as any).name || "Start your journey";
  const formSubtitle = subtitleTranslations?.[lang] || subtitleTranslations?.["en"] || "";

  // Step subtitle fallback based on step label
  const stepSubtitleFallback: Record<string, Record<string, string>> = {
    "Personal Info": {
      en: "Tell us a little about yourself to get started.",
      ar: "أخبرنا قليلاً عن نفسك للبدء.",
      tr: "Başlamak için kendiniz hakkında biraz bilgi verin.",
    },
    "Medical Interest": {
      en: "Help us understand your medical needs.",
      ar: "ساعدنا على فهم احتياجاتك الطبية.",
      tr: "Tıbbi ihtiyaçlarınızı anlamamıza yardımcı olun.",
    },
    "Female Medical": {
      en: "Please share your medical history.",
      ar: "يرجى مشاركة تاريخك الطبي.",
      tr: "Lütfen tıbbi geçmişinizi paylaşın.",
    },
    "Male Medical": {
      en: "Please share your medical history.",
      ar: "يرجى مشاركة تاريخك الطبي.",
      tr: "Lütfen tıbbi geçmişinizi paylaşın.",
    },
    "Partner Info": {
      en: "Tell us about your partner.",
      ar: "أخبرنا عن شريكك.",
      tr: "Partneriniz hakkında bilgi verin.",
    },
  };

  const currentStepSubtitle = stepSubtitleFallback[currentStep?.label ?? ""]?.[lang] ?? "";

  // Language switcher (only show if translations exist)
  const availableLangs: ("en" | "ar" | "tr")[] = ["en"];
  if (titleTranslations?.ar) availableLangs.push("ar");
  if (titleTranslations?.tr) availableLangs.push("tr");

  // Derive named steps for stepper (unique step labels)
  const stepperSteps = steps.reduce<{ label: string; index: number }[]>((acc, step, i) => {
    if (!acc.find((s) => s.label === step.label)) acc.push({ label: step.label, index: i });
    return acc;
  }, []);
  const currentStepperIdx = stepperSteps.findIndex((s) => s.index <= stepIndex && (stepperSteps[stepperSteps.indexOf(stepperSteps.find((ss) => ss.index <= stepIndex)!) + 1]?.index ?? Infinity) > stepIndex);
  const activeStepperIdx = Math.max(0, stepperSteps.findLastIndex((s) => s.index <= stepIndex));

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#FAF8FF", fontFamily: "'Quicksand', 'Inter', sans-serif" }} dir={isRTL ? "rtl" : "ltr"}>

      {/* ── Hero Section ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ minHeight: 220, background: "linear-gradient(135deg, #FAF8FF 0%, #F0ECFF 55%, #FFEFE5 100%)", borderRadius: "0 0 36px 36px" }}>
        {/* Baby shoes image overlay */}
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(90deg, #FAF8FF 0%, rgba(250,248,255,0.94) 45%, rgba(255,239,229,0.45) 100%), url('/manus-storage/baby-shoes-hero_07d236f3.jpg')`,
          backgroundSize: "cover",
          backgroundPosition: "right center",
          zIndex: 0,
        }} />
        {/* Content */}
        <div className="relative z-10 px-6 pt-6 pb-8 max-w-[1100px] mx-auto w-full">
          {/* Top bar: logo + language switcher */}
          <div className="flex items-center justify-between mb-5">
            <img src="/manus-storage/logo-horizontal_b2b72959.png" alt="Fertiliv IVF Center" className="h-9 object-contain" />
            {availableLangs.length > 1 && (
              <div className="flex gap-1">
                {availableLangs.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      lang === l ? "bg-[#140063] text-white" : "bg-[#140063]/10 text-[#140063]/70 hover:bg-[#140063]/20"
                    }`}
                  >
                    {l === "en" ? "EN" : l === "ar" ? "AR" : "TR"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Hero text */}
          <h1 className="text-2xl md:text-3xl font-bold text-[#140063] leading-snug max-w-xs md:max-w-sm">
            {lang === "ar" ? "نحن هنا لدعمك في رحلتك نحو الخصوبية." : lang === "tr" ? "Doğurganlık yolculuğunuzda size destek olmak için buradayız." : "We're here to support you on your fertility journey."}
          </h1>
          <p className="text-[#6B6385] text-sm mt-2">
            {lang === "ar" ? "يرجى تقديم معلوماتك حتى نتمكن من خدمتك بشكل أفضل." : lang === "tr" ? "Daha iyi hizmet verebilmemiz için bilgilerinizi lütfen girin." : "Please provide your information so we can serve you better."}
          </p>
        </div>
      </div>

      {/* ── Stepper ──────────────────────────────────────────────────────── */}
      <div className="max-w-[1100px] mx-auto w-full px-4 md:px-6 mt-5 mb-2">
        <div className="bg-white rounded-2xl border border-[#EDE7FA] shadow-[0_2px_8px_rgba(20,0,99,0.06)] px-6 py-4">
          <div className="flex items-center justify-between relative">
            {stepperSteps.map((ss, i) => {
              const isDone = ss.index < stepIndex;
              const isActive = activeStepperIdx === i;
              return (
                <React.Fragment key={ss.label}>
                  {i > 0 && (
                    <div className="flex-1 h-[3px] mx-1 rounded-full overflow-hidden" style={{ background: isDone ? "linear-gradient(90deg, #140063, #FECFB3)" : "#EDE7FA" }} />
                  )}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      isDone ? "text-white" : isActive ? "bg-[#140063] text-white shadow-[0_4px_12px_rgba(20,0,99,0.3)]" : "bg-[#F0ECFF] text-[#6B6385] border border-[#E4DDF5]"
                    }`} style={isDone ? { background: "linear-gradient(135deg, #140063, #3A1B8F)" } : {}}>
                      {isDone ? <Check className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className={`text-xs font-semibold hidden sm:block ${
                      isActive ? "text-[#140063]" : isDone ? "text-[#140063]/60" : "text-[#6B6385]"
                    }`}>{ss.label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* OTP Verification Screen */}
      {showOtpScreen && (
        <div className="flex-1 flex items-center justify-center px-4 pb-10 pt-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm bg-white border border-[#EDE7FA] rounded-3xl p-8 text-center shadow-[0_8px_32px_rgba(20,0,99,0.10)]"
          >
            <div className="w-14 h-14 rounded-full bg-[#F0ECFF] flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-[#140063]" />
            </div>
            <h2 className="text-xl font-bold text-[#140063] mb-2">
              {lang === "ar" ? "تحقق من بريدك الإلكتروني" : lang === "tr" ? "E-postanızı doğrulayın" : "Verify your email"}
            </h2>
            {otpMaskedEmail && (
              <p className="text-[#6B6385] text-sm mb-5">
                {lang === "ar" ? `أرسلنا رمز التحقق إلى ${otpMaskedEmail}` : lang === "tr" ? `${otpMaskedEmail} adresine doğrulama kodu gönderdik` : `We sent a 6-digit code to ${otpMaskedEmail}`}
              </p>
            )}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpValue}
              onChange={(e) => { setOtpValue(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
              placeholder="000000"
              className="w-full h-14 text-center text-2xl font-bold tracking-[0.5em] rounded-2xl bg-[#F0ECFF] border border-[#E4DDF5] text-[#140063] placeholder:text-[#9A91B8] mb-4 focus:outline-none focus:border-[#140063]"
            />
            {otpError && <p className="text-red-400 text-sm mb-3">{otpError}</p>}
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={otpLoading || otpValue.length !== 6}
              className="w-full py-3.5 rounded-2xl bg-[#140063] text-white font-bold text-sm mb-3 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {lang === "ar" ? "تحقق" : lang === "tr" ? "Doğrula" : "Verify"}
            </button>
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={otpLoading || otpResendCooldown > 0}
              className="w-full py-2.5 rounded-2xl bg-[#F0ECFF] text-[#140063] text-sm mb-2 font-semibold disabled:opacity-40"
            >
              {otpResendCooldown > 0
                ? (lang === "ar" ? `إعادة الإرسال خلال ${otpResendCooldown}ث` : lang === "tr" ? `${otpResendCooldown}s içinde yeniden gönder` : `Resend in ${otpResendCooldown}s`)
                : (lang === "ar" ? "إعادة إرسال الرمز" : lang === "tr" ? "Kodu yeniden gönder" : "Resend code")}
            </button>
            <button
              type="button"
              onClick={handleSkipOtp}
              className="w-full py-2 text-[#9A91B8] text-xs hover:text-[#6B6385] transition"
            >
              {lang === "ar" ? "تخطي التحقق والمتابعة" : lang === "tr" ? "Doğrulamayı atla ve devam et" : "Skip verification and continue"}
            </button>
          </motion.div>
        </div>
      )}

      {/* Content + Footer (hidden when OTP screen is showing) */}
      {!showOtpScreen && (
        <div className="max-w-[1100px] mx-auto w-full px-4 md:px-6 pb-10">
          {/* White card */}
          <div className="bg-white rounded-3xl border border-[#EDE7FA] shadow-[0_4px_24px_rgba(20,0,99,0.08)] overflow-hidden">
            {/* Card header: step icon + title */}
            <div className="flex items-center gap-4 px-7 pt-7 pb-5 border-b border-[#F0ECFF]">
              <div className="w-11 h-11 rounded-2xl bg-[#F0ECFF] flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#140063]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#140063] leading-tight">
                  {(currentStep as any)?.title || formTitle}
                </h2>
                {((currentStep as any)?.subtitle || formSubtitle || currentStepSubtitle) && (
                  <p className="text-[#6B6385] text-sm mt-0.5">
                    {(currentStep as any)?.subtitle || formSubtitle || currentStepSubtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Fields area */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={stepIndex}
                initial={{ opacity: 0, x: direction * 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -30 }}
                transition={{ duration: 0.22 }}
                className="px-7 py-6 space-y-5"
              >
                {isDecisionStep && currentStep?.decisionStep ? (
                  <DecisionStepView
                    step={currentStep.decisionStep}
                    lang={lang}
                    onNext={() => {
                      setDirection(1);
                      setStepIndex((i) => Math.min(i + 1, steps.length - 1));
                    }}
                    onStartSection={handleStartSection}
                    completedSections={completedSections}
                    onScheduleCallback={handleScheduleCallback}
                  />
                ) : (
                  visibleFields.map((field) => (
                    <DynamicField
                      key={field.id}
                      field={field}
                      value={formData[field.id]}
                      onChange={(val) => setField(field.id, val)}
                      error={errors[field.id]}
                      lang={lang}
                    />
                  ))
                )}
              </motion.div>
            </AnimatePresence>

            {/* Card footer */}
            {!isDecisionStep && (
              <div className="px-7 pb-7 pt-2 border-t border-[#F0ECFF] flex items-center gap-3">
                {!isFirstStep && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-[#F0ECFF] text-[#140063] font-semibold text-sm hover:bg-[#EDE7FA] transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {t("back", lang)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={goNext}
                  disabled={submitBasicInfo.isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-base transition disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #140063 0%, #2D0A8F 100%)", color: "#fff", boxShadow: "0 4px 14px rgba(20,0,99,0.25)" }}
                >
                  {submitBasicInfo.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : isLastStep ? (
                    <>{t("submit", lang)} <Check className="w-4 h-4" /></>
                  ) : (
                    <>{t("next", lang)} <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Privacy note */}
          <p className="text-center text-[#9A91B8] text-xs mt-4 flex items-center justify-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            {t("privacy", lang)}
          </p>
        </div>
      )}
    </div>
  );
}
