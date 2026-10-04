/**
 * IntakeWizardPage — Public multi-step intake wizard
 * Accessible at /intake (no login required)
 *
 * FIX: All sub-components (Layout, BasicInfoForm, CallbackForm, etc.) are defined
 * at the TOP LEVEL of the module — never inside another component's render body.
 * This prevents React from unmounting/remounting DOM elements on every state update,
 * which was causing input fields to lose focus after each keystroke.
 */
import { trpc } from "@/lib/trpc";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Calendar, CheckCircle2,
  ClipboardList, Phone,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOGO_WHITE = "/manus-storage/fertiliv-logo-white_b3e66705.png";

const BRAND_LABELS: Record<string, string> = {
  fertiliv: "Fertiliv IVF Center",
  safemedigo: "Safemedigo",
  "dr-nilay-karaca": "Dr. Nilay Karaca",
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "tr", label: "Turkish" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "ru", label: "Russian" },
  { value: "it", label: "Italian" },
  { value: "other", label: "Other" },
];

const MEDICAL_INTERESTS = [
  { value: "Egg Freezing",                 label: "Egg Freezing",                 emoji: "❄️", couple: false },
  { value: "Fertility Check-up (Couple)",  label: "Fertility Check-up (Couple)",  emoji: "👫", couple: true  },
  { value: "Fertility Check-up (Female)",  label: "Fertility Check-up (Female)",  emoji: "👩", couple: false },
  { value: "Fertility Check-up (Male)",    label: "Fertility Check-up (Male)",    emoji: "👨", couple: false },
  { value: "IUI",                          label: "IUI",                          emoji: "💉", couple: true  },
  { value: "IVF with ICSI",                label: "IVF with ICSI",                emoji: "🧬", couple: true  },
  { value: "Other / Not sure yet",         label: "Other / Not sure yet",         emoji: "❓", couple: true  },
  { value: "PRP",                          label: "PRP",                          emoji: "🩸", couple: false },
  { value: "Exosome",                      label: "Exosome",                      emoji: "🔬", couple: false },
  { value: "Hysteroscopy",                 label: "Hysteroscopy",                 emoji: "🔭", couple: false },
  { value: "HSG",                          label: "HSG",                          emoji: "📡", couple: false },
  { value: "Sperm Test",                   label: "Sperm Test",                   emoji: "🔬", couple: false },
];
const FEMALE_ONLY = ["Egg Freezing", "Fertility Check-up (Female)", "PRP", "Exosome", "Hysteroscopy", "HSG"];
const MALE_ONLY   = ["Fertility Check-up (Male)", "Sperm Test"];

// ─── Intake questions ─────────────────────────────────────────────────────────

interface IntakeQuestion {
  id: string;
  section: string;
  label: string;
  sublabel?: string;
  type: "text" | "number" | "date" | "select" | "multicheck" | "yesno" | "textarea";
  options?: { value: string; label: string }[];
  placeholder?: string;
  field: string;
  gender: "female" | "male" | "both";
  showIf?: (data: Record<string, any>) => boolean;
}

const INTAKE_QUESTIONS: IntakeQuestion[] = [
  // ── Female ──
  { id: "f_infertility_type", section: "Your Fertility Journey", gender: "female",
    label: "What type of infertility are you experiencing?",
    sublabel: "Primary = never conceived before. Secondary = conceived before but struggling now.",
    type: "select", field: "infertilityType",
    options: [
      { value: "primary",   label: "Primary — never conceived before" },
      { value: "secondary", label: "Secondary — conceived before" },
    ] },
  { id: "f_duration", section: "Your Fertility Journey", gender: "female",
    label: "How long have you been trying to conceive?",
    type: "text", field: "infertilityDuration", placeholder: "e.g. 2 years" },
  { id: "f_height_weight", section: "Body Measurements", gender: "female",
    label: "What is your height and weight?",
    sublabel: "We use this to calculate your BMI.",
    type: "text", field: "_hw_female", placeholder: "" },
  { id: "f_cycle_regularity", section: "Menstrual Cycle", gender: "female",
    label: "Are your periods regular?",
    type: "select", field: "cycleRegularity",
    options: [
      { value: "regular",   label: "Yes, regular" },
      { value: "irregular", label: "No, irregular" },
      { value: "absent",    label: "No periods at all" },
    ] },
  { id: "f_lmp", section: "Menstrual Cycle", gender: "female",
    label: "When was the first day of your last period?",
    type: "date", field: "lastMenstrualPeriod" },
  { id: "f_cycle_length", section: "Menstrual Cycle", gender: "female",
    label: "How many days is your typical cycle?",
    type: "number", field: "cycleLengthDays", placeholder: "e.g. 28",
    showIf: (d) => d.cycleRegularity !== "absent" },
  { id: "f_gravida", section: "Pregnancy History", gender: "female",
    label: "How many times have you been pregnant?",
    sublabel: "Include all pregnancies — full term, miscarriages, terminations.",
    type: "number", field: "gravida", placeholder: "0" },
  { id: "f_para", section: "Pregnancy History", gender: "female",
    label: "How many live births have you had?",
    type: "number", field: "para", placeholder: "0" },
  { id: "f_miscarriages", section: "Pregnancy History", gender: "female",
    label: "Have you had any miscarriages or pregnancy losses?",
    type: "yesno", field: "_hasMiscarriages",
    showIf: (d) => parseInt(d.gravida ?? "0") > 0 },
  { id: "f_smoking", section: "Lifestyle", gender: "female",
    label: "Do you smoke?",
    type: "select", field: "smoking",
    options: [
      { value: "never",   label: "Never" },
      { value: "former",  label: "Former smoker" },
      { value: "current", label: "Yes, currently" },
    ] },
  { id: "f_alcohol", section: "Lifestyle", gender: "female",
    label: "Do you drink alcohol?",
    type: "select", field: "alcohol",
    options: [
      { value: "never",      label: "Never" },
      { value: "occasional", label: "Occasionally" },
      { value: "regular",    label: "Regularly" },
    ] },
  { id: "f_systemic", section: "Health Conditions", gender: "female",
    label: "Do you have any of these health conditions?",
    sublabel: "Select all that apply.",
    type: "multicheck", field: "_systemicFemale",
    options: [
      { value: "diabetes",      label: "Diabetes" },
      { value: "hypertension",  label: "Hypertension" },
      { value: "thyroid",       label: "Thyroid disorder" },
      { value: "pcos",          label: "PCOS" },
      { value: "endometriosis", label: "Endometriosis" },
      { value: "autoimmune",    label: "Autoimmune condition" },
      { value: "none",          label: "None of the above" },
    ] },
  { id: "f_medications", section: "Health Conditions", gender: "female",
    label: "Are you currently taking any medications?",
    sublabel: "List any medicines you take regularly, or write 'None'.",
    type: "textarea", field: "currentMedications",
    placeholder: "e.g. Metformin 500mg, Levothyroxine 50mcg" },
  { id: "f_previous_ivf", section: "Previous Treatments", gender: "female",
    label: "Have you had any previous fertility treatments (IVF, IUI, etc.)?",
    type: "yesno", field: "_hasPreviousTreatment" },
  { id: "f_ivf_details", section: "Previous Treatments", gender: "female",
    label: "Please briefly describe your previous fertility treatments.",
    type: "textarea", field: "additionalNotes",
    placeholder: "e.g. 2 IVF cycles in 2022, 1 failed transfer",
    showIf: (d) => d._hasPreviousTreatment === "yes" },
  // ── Male ──
  { id: "m_height_weight", section: "General Health", gender: "male",
    label: "What is your height and weight?",
    sublabel: "We use this to calculate your BMI.",
    type: "text", field: "_hw_male", placeholder: "" },
  { id: "m_smoking", section: "Lifestyle", gender: "male",
    label: "Do you smoke?",
    type: "select", field: "m_smoking",
    options: [
      { value: "never",   label: "Never" },
      { value: "former",  label: "Former smoker" },
      { value: "current", label: "Yes, currently" },
    ] },
  { id: "m_alcohol", section: "Lifestyle", gender: "male",
    label: "Do you drink alcohol?",
    type: "select", field: "m_alcohol",
    options: [
      { value: "never",      label: "Never" },
      { value: "occasional", label: "Occasionally" },
      { value: "regular",    label: "Regularly" },
    ] },
  { id: "m_semen", section: "Semen Analysis", gender: "male",
    label: "Have you had a semen analysis done before?",
    type: "yesno", field: "_hasSemenAnalysis" },
  { id: "m_semen_result", section: "Semen Analysis", gender: "male",
    label: "What were the results of your semen analysis?",
    sublabel: "You can describe it in your own words.",
    type: "textarea", field: "m_semenNotes",
    placeholder: "e.g. Low motility, normal morphology",
    showIf: (d) => d._hasSemenAnalysis === "yes" },
  { id: "m_systemic", section: "Health Conditions", gender: "male",
    label: "Do you have any of these health conditions?",
    sublabel: "Select all that apply.",
    type: "multicheck", field: "_systemicMale",
    options: [
      { value: "diabetes",    label: "Diabetes" },
      { value: "hypertension",label: "Hypertension" },
      { value: "varicocele",  label: "Varicocele" },
      { value: "hormonal",    label: "Hormonal disorder" },
      { value: "none",        label: "None of the above" },
    ] },
  { id: "m_medications", section: "Health Conditions", gender: "male",
    label: "Are you currently taking any medications?",
    type: "textarea", field: "m_medications",
    placeholder: "e.g. None / Metformin 500mg" },
];

// ─── Shared input CSS ─────────────────────────────────────────────────────────

const inputCls = "w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 text-base focus:outline-none focus:border-white/60 focus:bg-white/15 transition";

// ─── Top-level sub-components (NEVER defined inside another component) ─────────

// Layout shell — defined at module level so it has a stable identity
function WizardLayout({
  children,
  showBack,
  onBack,
  brandLabel,
}: {
  children: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  brandLabel: string;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1E0566] via-[#2D1B8E] to-[#4A2CC4] flex flex-col">
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        {showBack ? (
          <button
            onClick={onBack}
            className="text-white/70 hover:text-white transition flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        ) : (
          <div />
        )}
        <img src={LOGO_WHITE} alt={brandLabel} className="h-7 object-contain" />
        <div className="w-16" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

function SlideWrapper({ children, slideKey }: { children: React.ReactNode; slideKey: string }) {
  return (
    <motion.div
      key={slideKey}
      initial={{ x: 60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -60, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-white/70 mb-1">
        <span>Question {current} of {total}</span>
        <span>{pct}% complete</span>
      </div>
      <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-white rounded-full"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// HeightWeightInput — stable top-level component with its own local state
function HeightWeightInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parts = value ? value.split("|") : ["", ""];
  const [h, setH] = useState(parts[0] ?? "");
  const [w, setW] = useState(parts[1] ?? "");

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-sm text-white/70 mb-1">Height (cm)</label>
        <input
          type="number"
          value={h}
          onChange={(e) => {
            setH(e.target.value);
            onChange(`${e.target.value}|${w}`);
          }}
          placeholder="e.g. 165"
          className={inputCls}
          autoComplete="off"
        />
      </div>
      <div>
        <label className="block text-sm text-white/70 mb-1">Weight (kg)</label>
        <input
          type="number"
          value={w}
          onChange={(e) => {
            setW(e.target.value);
            onChange(`${h}|${e.target.value}`);
          }}
          placeholder="e.g. 65"
          className={inputCls}
          autoComplete="off"
        />
      </div>
    </div>
  );
}

// ─── Lead field catalog (client-side mirror of server FIELD_CATALOG for leads) ───
// Maps field IDs from the form builder to their display config
interface LeadFieldDef {
  id: string;
  dbField: string;
  labelEn: string;
  sublabelEn?: string;
  type: "text" | "phone" | "email" | "date" | "select" | "multicheck" | "multiselect" | "yesno" | "textarea" | "number" | "boolean";
  required?: boolean;
  options?: string[];
  showIf?: { fieldId: string; values: string[] };
}

const LEAD_FIELD_CATALOG: LeadFieldDef[] = [
  { id: "l_firstName",   dbField: "firstName",   labelEn: "First Name",   type: "text",  required: true },
  { id: "l_middleName",  dbField: "middleName",  labelEn: "Middle Name",  type: "text" },
  { id: "l_lastName",    dbField: "lastName",    labelEn: "Last Name",    type: "text",  required: true },
  { id: "l_dateOfBirth", dbField: "dateOfBirth", labelEn: "Date of Birth", type: "date" },
  { id: "l_gender",      dbField: "gender",      labelEn: "Gender",       type: "select", required: true, options: ["female", "male"] },
  { id: "l_nationality", dbField: "nationality", labelEn: "Nationality",  type: "text" },
  { id: "l_patientType", dbField: "patientType", labelEn: "Patient Type", type: "select", options: ["local", "international"] },
  { id: "l_phone",       dbField: "phone",       labelEn: "Phone Number", type: "phone", required: true, sublabelEn: "Include country code (e.g. +964...)" },
  { id: "l_secondaryPhone", dbField: "secondaryPhone", labelEn: "Secondary Phone", type: "phone" },
  { id: "l_email",       dbField: "email",       labelEn: "Email Address", type: "email" },
  { id: "l_secondaryEmail", dbField: "secondaryEmail", labelEn: "Secondary Email", type: "email" },
  { id: "l_country",     dbField: "country",     labelEn: "Country",      type: "text" },
  { id: "l_city",        dbField: "city",        labelEn: "City",         type: "text" },
  { id: "l_address",     dbField: "address",     labelEn: "Full Address", type: "textarea" },
  { id: "l_preferredContactMethods", dbField: "preferredContactMethods", labelEn: "Preferred Contact Methods", sublabelEn: "How would you like us to contact you?", type: "multicheck", options: ["whatsapp", "phone", "email", "video_call"] },
  { id: "l_preferredLanguages", dbField: "preferredLanguages", labelEn: "Preferred Languages", type: "multicheck", options: ["en", "ar", "tr", "fr", "es", "ru", "it", "other"] },
  { id: "l_primaryLanguage", dbField: "primaryLanguage", labelEn: "Primary Language", type: "select", options: ["en", "ar", "tr", "fr", "es", "ru", "it", "other"] },
  { id: "l_mainMedicalInterest", dbField: "mainMedicalInterest", labelEn: "What is your main medical interest?", sublabelEn: "Select all that apply.", type: "multiselect", options: ["ivf", "icsi", "iui", "pgt", "egg_freezing", "sperm_freezing", "embryo_freezing", "male_factor", "recurrent_miscarriage", "fertility_assessment", "other"] },
  { id: "l_ivfExperience", dbField: "ivfExperience", labelEn: "Have you tried IVF before?", type: "select", options: ["never-tried", "tried-unsuccessful", "tried-again", "tried-multiple"] },
  { id: "l_fertilityDiagnosis", dbField: "fertilityDiagnosis", labelEn: "Female Fertility Diagnosis", sublabelEn: "Select all that apply.", type: "multiselect", options: ["pcos", "endometriosis", "low_ovarian_reserve", "blocked_tubes", "uterine_fibroids", "unexplained", "premature_ovarian_failure", "other"], showIf: { fieldId: "l_gender", values: ["female"] } },
  { id: "l_maleFertilityDiagnosis", dbField: "maleFertilityDiagnosis", labelEn: "Male Fertility Diagnosis", sublabelEn: "Select all that apply.", type: "multiselect", options: ["azoospermia", "oligospermia", "asthenospermia", "teratospermia", "varicocele", "hormonal", "unexplained", "other"], showIf: { fieldId: "l_gender", values: ["male"] } },
  { id: "l_decisionTimeline", dbField: "decisionTimeline", labelEn: "When are you planning to start treatment?", type: "select", options: ["immediately", "1-2-weeks", "1-month", "2-months", "3-months", "6-months", "exploring"] },
  { id: "l_travelReadiness", dbField: "travelReadiness", labelEn: "Are you ready to travel for treatment?", type: "select", options: ["ready", "considering", "prefers-home", "local-patient"] },
  { id: "l_budgetRange", dbField: "budgetRange", labelEn: "What is your approximate budget?", type: "text" },
  { id: "l_callbackPreferredDate", dbField: "callbackPreferredDate", labelEn: "Preferred Callback Date", type: "text" },
  { id: "l_callbackPreferredTime", dbField: "callbackPreferredTime", labelEn: "Preferred Callback Time", type: "text" },
  { id: "l_callbackMethod", dbField: "callbackMethod", labelEn: "Preferred Callback Method", type: "select", options: ["whatsapp", "phone", "video_call", "email"] },
  { id: "l_accommodationHotel", dbField: "accommodationHotel", labelEn: "Hotel Name (if known)", type: "text" },
  { id: "l_accommodationLocation", dbField: "accommodationLocation", labelEn: "Accommodation Location / Area", type: "text" },
  { id: "l_transportationAirportPickup", dbField: "transportationAirportPickup", labelEn: "Do you need airport pickup?", type: "boolean", options: ["yes", "no"] },
  { id: "l_transportationLocalTransfer", dbField: "transportationLocalTransfer", labelEn: "Do you need local transportation?", type: "boolean", options: ["yes", "no"] },
];

const LEAD_FIELD_MAP = new Map(LEAD_FIELD_CATALOG.map((f) => [f.id, f]));

// Mandatory fields always included regardless of form config
const MANDATORY_LEAD_IDS = ["l_firstName", "l_lastName", "l_phone", "l_gender"];

// BasicInfoForm — stable top-level component; receives state + setters as props
interface BasicFormState {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  gender: "male" | "female" | "";
  dateOfBirth: string;
  preferredLanguages: string[];
  // Extra dynamic fields
  [key: string]: any;
}

function BasicInfoForm({
  form,
  errors,
  isPending,
  onChange,
  onSubmit,
}: {
  form: BasicFormState;
  errors: Record<string, string>;
  isPending: boolean;
  onChange: (patch: Partial<BasicFormState>) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Start your journey</h1>
        <p className="text-white/60 text-sm">Tell us a little about yourself to get started.</p>
      </div>

      <div className="space-y-3">
        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/70 mb-1">First Name *</label>
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => onChange({ firstName: e.target.value })}
              placeholder="First name"
              autoComplete="given-name"
              className={`w-full px-3 py-2.5 rounded-xl bg-white/10 border text-white placeholder-white/40 text-sm focus:outline-none focus:bg-white/15 transition ${errors.firstName ? "border-red-400" : "border-white/20 focus:border-white/60"}`}
            />
            {errors.firstName && <p className="text-red-300 text-xs mt-0.5">{errors.firstName}</p>}
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Last Name *</label>
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => onChange({ lastName: e.target.value })}
              placeholder="Last name"
              autoComplete="family-name"
              className={`w-full px-3 py-2.5 rounded-xl bg-white/10 border text-white placeholder-white/40 text-sm focus:outline-none focus:bg-white/15 transition ${errors.lastName ? "border-red-400" : "border-white/20 focus:border-white/60"}`}
            />
            {errors.lastName && <p className="text-red-300 text-xs mt-0.5">{errors.lastName}</p>}
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs text-white/70 mb-1">Phone Number *</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+1 234 567 8900"
            autoComplete="tel"
            className={`w-full px-3 py-2.5 rounded-xl bg-white/10 border text-white placeholder-white/40 text-sm focus:outline-none focus:bg-white/15 transition ${errors.phone ? "border-red-400" : "border-white/20 focus:border-white/60"}`}
          />
          {errors.phone && <p className="text-red-300 text-xs mt-0.5">{errors.phone}</p>}
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs text-white/70 mb-1">
            Email <span className="text-white/40">(optional)</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="your@email.com"
            autoComplete="email"
            className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/60 focus:bg-white/15 transition"
          />
        </div>

        {/* Gender */}
        <div>
          <label className="block text-xs text-white/70 mb-1">Gender *</label>
          <div className="grid grid-cols-2 gap-2">
            {(["female", "male"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onChange({ gender: g })}
                className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  form.gender === g
                    ? "bg-white text-[#1E0566] border-white"
                    : `bg-white/10 text-white hover:bg-white/20 ${errors.gender ? "border-red-400" : "border-white/20"}`
                }`}
              >
                {g === "female" ? "Female" : "Male"}
              </button>
            ))}
          </div>
          {errors.gender && <p className="text-red-300 text-xs mt-0.5">{errors.gender}</p>}
        </div>

        {/* Date of Birth */}
        <div>
          <label className="block text-xs text-white/70 mb-1">Date of Birth *</label>
          <input
            type="date"
            value={form.dateOfBirth}
            min="1900-01-01"
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) { onChange({ dateOfBirth: v }); return; }
              const year = parseInt(v.split('-')[0], 10);
              if (year < 1900 || year > new Date().getFullYear()) return;
              const d = new Date(v);
              const today = new Date(); today.setHours(0,0,0,0);
              if (d > today) return;
              onChange({ dateOfBirth: v });
            }}
            autoComplete="bday"
            className={`w-full px-3 py-2.5 rounded-xl bg-white/10 border text-white text-sm focus:outline-none focus:bg-white/15 transition ${errors.dateOfBirth ? "border-red-400" : "border-white/20 focus:border-white/60"}`}
          />
          {errors.dateOfBirth && <p className="text-red-300 text-xs mt-0.5">{errors.dateOfBirth}</p>}
        </div>

        {/* Languages */}
        <div>
          <label className="block text-xs text-white/70 mb-1.5">
            Preferred Languages <span className="text-white/40">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => {
                  const cur = form.preferredLanguages;
                  onChange({
                    preferredLanguages: cur.includes(l.value)
                      ? cur.filter((x) => x !== l.value)
                      : [...cur, l.value],
                  });
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  form.preferredLanguages.includes(l.value)
                    ? "bg-white text-[#1E0566] border-white"
                    : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={onSubmit}
        disabled={isPending}
        className="w-full py-4 rounded-2xl bg-white text-[#1E0566] font-bold text-base hover:bg-white/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {isPending ? (
          <span className="animate-spin rounded-full h-5 w-5 border-2 border-[#1E0566] border-t-transparent" />
        ) : (
          <>Continue <ArrowRight className="w-4 h-4" /></>
        )}
      </button>

      <p className="text-center text-white/40 text-xs">Your information is kept private and secure.</p>
    </div>
  );
}

// ─── DynamicLeadForm ────────────────────────────────────────────────────────────────────────────────
// Renders only the fields selected in the active form config (from Form Builder)
// Falls back to BasicInfoForm if no activeForm is set
function DynamicLeadForm({
  fieldIds,
  form,
  errors,
  isPending,
  onChange,
  onSubmit,
  formTitle,
  formSubtitle,
}: {
  fieldIds: string[];          // ordered list of field IDs from activeForm.fields
  form: BasicFormState;
  errors: Record<string, string>;
  isPending: boolean;
  onChange: (patch: Partial<BasicFormState>) => void;
  onSubmit: () => void;
  formTitle?: string;
  formSubtitle?: string;
}) {
  // Build the ordered list of fields to show:
  // 1. Mandatory fields always first (if not already in fieldIds)
  // 2. Then the selected fields in order
  const orderedIds = [
    ...MANDATORY_LEAD_IDS.filter((id) => !fieldIds.includes(id)),
    ...fieldIds,
  ];

  // Resolve field defs in order, skip unknown IDs and medical IDs (f_*, m_*)
  const fields = orderedIds
    .map((id) => LEAD_FIELD_MAP.get(id))
    .filter((f): f is LeadFieldDef => !!f);

  // Evaluate showIf conditions
  const visibleFields = fields.filter((f) => {
    if (!f.showIf) return true;
    const depVal = form[f.showIf.fieldId.replace("l_", "")];
    return f.showIf.values.includes(depVal);
  });

  const inputCls = (err?: string) =>
    `w-full px-3 py-2.5 rounded-xl bg-white/10 border text-white placeholder-white/40 text-sm focus:outline-none focus:bg-white/15 transition ${
      err ? "border-red-400" : "border-white/20 focus:border-white/60"
    }`;

  const renderField = (f: LeadFieldDef) => {
    const key = f.dbField;
    const val = form[key] ?? "";
    const err = errors[key] ?? errors[f.id];
    const isRequired = f.required || MANDATORY_LEAD_IDS.includes(f.id);
    const label = (
      <label className="block text-xs text-white/70 mb-1">
        {f.labelEn} {isRequired ? <span className="text-white">*</span> : <span className="text-white/40">(optional)</span>}
      </label>
    );

    if (f.type === "text" || f.type === "phone" || f.type === "email" || f.type === "number") {
      const inputType = f.type === "phone" ? "tel" : f.type === "number" ? "number" : f.type === "email" ? "email" : "text";
      return (
        <div key={f.id}>
          {label}
          {f.sublabelEn && <p className="text-xs text-white/50 mb-1">{f.sublabelEn}</p>}
          <input
            type={inputType}
            value={val}
            onChange={(e) => onChange({ [key]: e.target.value })}
            placeholder={f.sublabelEn ?? f.labelEn}
            className={inputCls(err)}
          />
          {err && <p className="text-red-300 text-xs mt-0.5">{err}</p>}
        </div>
      );
    }

    if (f.type === "textarea") {
      return (
        <div key={f.id}>
          {label}
          <textarea
            value={val}
            onChange={(e) => onChange({ [key]: e.target.value })}
            rows={3}
            className={inputCls(err) + " resize-none"}
          />
          {err && <p className="text-red-300 text-xs mt-0.5">{err}</p>}
        </div>
      );
    }

    if (f.type === "date") {
      return (
        <div key={f.id}>
          {label}
          <input
            type="date"
            value={val}
            min="1900-01-01"
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) { onChange({ [key]: v }); return; }
              const year = parseInt(v.split("-")[0], 10);
              if (year < 1900 || year > new Date().getFullYear()) return;
              const d = new Date(v);
              const today = new Date(); today.setHours(0, 0, 0, 0);
              if (d > today) return;
              onChange({ [key]: v });
            }}
            className={inputCls(err)}
          />
          {err && <p className="text-red-300 text-xs mt-0.5">{err}</p>}
        </div>
      );
    }

    if (f.type === "select") {
      // Special case: gender uses button toggle
      if (f.id === "l_gender") {
        return (
          <div key={f.id}>
            {label}
            <div className="grid grid-cols-2 gap-2">
              {(f.options ?? ["female", "male"]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange({ [key]: opt })}
                  className={`py-2.5 rounded-xl border text-sm font-medium capitalize transition-all ${
                    val === opt
                      ? "bg-white text-[#1E0566] border-white"
                      : `bg-white/10 text-white hover:bg-white/20 ${err ? "border-red-400" : "border-white/20"}`
                  }`}
                >
                  {opt === "female" ? "♀️ Female" : opt === "male" ? "♂️ Male" : opt}
                </button>
              ))}
            </div>
            {err && <p className="text-red-300 text-xs mt-0.5">{err}</p>}
          </div>
        );
      }
      return (
        <div key={f.id}>
          {label}
          <select
            value={val}
            onChange={(e) => onChange({ [key]: e.target.value })}
            className={inputCls(err) + " appearance-none"}
          >
            <option value="">-- Select --</option>
            {(f.options ?? []).map((opt) => (
              <option key={opt} value={opt} className="bg-[#1E0566] text-white">{opt.replace(/-/g, " ")}</option>
            ))}
          </select>
          {err && <p className="text-red-300 text-xs mt-0.5">{err}</p>}
        </div>
      );
    }

    if (f.type === "multicheck" || f.type === "multiselect") {
      const arrVal: string[] = Array.isArray(form[key]) ? form[key] : [];
      return (
        <div key={f.id}>
          {label}
          {f.sublabelEn && <p className="text-xs text-white/50 mb-1">{f.sublabelEn}</p>}
          <div className="flex flex-wrap gap-1.5">
            {(f.options ?? []).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const cur = arrVal;
                  onChange({ [key]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] });
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize ${
                  arrVal.includes(opt)
                    ? "bg-white text-[#1E0566] border-white"
                    : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                }`}
              >
                {opt.replace(/_/g, " ").replace(/-/g, " ")}
              </button>
            ))}
          </div>
          {err && <p className="text-red-300 text-xs mt-0.5">{err}</p>}
        </div>
      );
    }

    if (f.type === "yesno" || f.type === "boolean") {
      return (
        <div key={f.id}>
          {label}
          <div className="grid grid-cols-2 gap-2">
            {["yes", "no"].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange({ [key]: opt === "yes" ? true : false })}
                className={`py-2.5 rounded-xl border text-sm font-medium capitalize transition-all ${
                  (opt === "yes" ? form[key] === true : form[key] === false)
                    ? "bg-white text-[#1E0566] border-white"
                    : "bg-white/10 text-white hover:bg-white/20 border-white/20"
                }`}
              >
                {opt === "yes" ? "✅ Yes" : "❌ No"}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">{formTitle ?? "Start your journey"}</h1>
        {formSubtitle
          ? <p className="text-white/60 text-sm">{formSubtitle}</p>
          : <p className="text-white/60 text-sm">Tell us a little about yourself to get started.</p>
        }
      </div>

      <div className="space-y-3">
        {visibleFields.map((f) => renderField(f))}
      </div>

      <button
        onClick={onSubmit}
        disabled={isPending}
        className="w-full py-4 rounded-2xl bg-white text-[#1E0566] font-bold text-base hover:bg-white/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {isPending ? (
          <span className="animate-spin rounded-full h-5 w-5 border-2 border-[#1E0566] border-t-transparent" />
        ) : (
          <>Continue <ArrowRight className="w-4 h-4" /></>
        )}
      </button>

      <p className="text-center text-white/40 text-xs">Your information is kept private and secure.</p>
    </div>
  );
}

// CallbackForm — stable top-level component
interface CallbackFormState {
  date: string;
  time: string;
  method: "whatsapp" | "phone" | "video_call" | "email";
}

function CallbackFormView({
  form,
  isPending,
  onChange,
  onSubmit,
}: {
  form: CallbackFormState;
  isPending: boolean;
  onChange: (patch: Partial<CallbackFormState>) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Schedule a call</h1>
        <p className="text-white/60 text-sm">Tell us when and how you'd like us to reach you.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-white/70 mb-1.5">Preferred Date *</label>
          <input
            type="date"
            value={form.date}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => onChange({ date: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm text-white/70 mb-1.5">Preferred Time *</label>
          <input
            type="time"
            value={form.time}
            onChange={(e) => onChange({ time: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm text-white/70 mb-2">
            How would you like us to contact you?
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "whatsapp",   label: "WhatsApp"   },
                { value: "phone",      label: "Phone Call" },
                { value: "video_call", label: "Video Call" },
                { value: "email",      label: "Email"      },
              ] as const
            ).map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => onChange({ method: m.value })}
                className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                  form.method === m.value
                    ? "bg-white text-[#1E0566] border-white"
                    : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={onSubmit}
        disabled={isPending}
        className="w-full py-4 rounded-2xl bg-white text-[#1E0566] font-bold text-base hover:bg-white/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {isPending ? (
          <span className="animate-spin rounded-full h-5 w-5 border-2 border-[#1E0566] border-t-transparent" />
        ) : (
          <><Calendar className="w-4 h-4" /> Confirm Callback</>
        )}
      </button>
    </div>
  );
}

// QuestionInput — stable top-level component for rendering a single intake question
function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: IntakeQuestion;
  value: any;
  onChange: (v: any) => void;
}) {
  const val = value ?? "";

  if (question.field === "_hw_female" || question.field === "_hw_male") {
    return <HeightWeightInput value={val} onChange={onChange} />;
  }

  if (question.type === "select") {
    return (
      <div className="space-y-2">
        {question.options?.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`w-full text-left px-5 py-4 rounded-xl border transition-all text-base ${
              val === opt.value
                ? "bg-white text-[#1E0566] border-white font-semibold"
                : "bg-white/10 text-white border-white/20 hover:bg-white/20"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "yesno") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {(["yes", "no"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`py-4 rounded-xl border text-lg font-semibold transition-all ${
              val === v
                ? "bg-white text-[#1E0566] border-white"
                : "bg-white/10 text-white border-white/20 hover:bg-white/20"
            }`}
          >
            {v === "yes" ? "Yes" : "No"}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "multicheck") {
    const selected: string[] = Array.isArray(val) ? val : [];
    const toggle = (v: string) => {
      if (v === "none") { onChange(["none"]); return; }
      const without = selected.filter((s) => s !== "none");
      onChange(without.includes(v) ? without.filter((s) => s !== v) : [...without, v]);
    };
    return (
      <div className="space-y-2">
        {question.options?.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={`w-full text-left px-5 py-3.5 rounded-xl border transition-all flex items-center gap-3 ${
              selected.includes(opt.value)
                ? "bg-white text-[#1E0566] border-white font-semibold"
                : "bg-white/10 text-white border-white/20 hover:bg-white/20"
            }`}
          >
            <span
              className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                selected.includes(opt.value) ? "bg-[#1E0566] border-[#1E0566]" : "border-white/40"
              }`}
            >
              {selected.includes(opt.value) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
            </span>
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "textarea") {
    return (
      <textarea
        value={val}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder}
        rows={4}
        autoComplete="off"
        className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 text-base focus:outline-none focus:border-white/60 focus:bg-white/15 transition resize-none"
      />
    );
  }

  // text / number / date
  return (
    <input
      type={question.type}
      value={val}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.placeholder}
      autoComplete="off"
      className={inputCls}
    />
  );
}

// ─── Wizard step type ─────────────────────────────────────────────────────────

type WizardStep =
  | "basic_info"
  | "welcome_choice"
  | "callback_form"
  | "callback_done"
  | "treatment_interest"
  | "who_first"
  | "intake_question"
  | "thankyou";

// ─── Build intake payload ─────────────────────────────────────────────────────

function buildIntakePayload(
  data: Record<string, any>,
  couple: boolean,
  primaryGender: "male" | "female",
) {
  const female: Record<string, any> = {};
  const male: Record<string, any> = {};

  if (data._hw_female) {
    const [h, w] = data._hw_female.split("|");
    if (h) female.heightCm = h;
    if (w) female.weightKg = w;
  }
  if (data._hw_male) {
    const [h, w] = data._hw_male.split("|");
    if (h) male.heightCm = h;
    if (w) male.weightKg = w;
  }

  for (const f of ["infertilityType","infertilityDuration","cycleRegularity","lastMenstrualPeriod","cycleLengthDays","gravida","para","smoking","alcohol","currentMedications","additionalNotes"]) {
    if (data[f] !== undefined) female[f] = data[f];
  }

  if (data.m_smoking)     male.smoking          = data.m_smoking;
  if (data.m_alcohol)     male.alcohol          = data.m_alcohol;
  if (data.m_medications) male.currentMedications = data.m_medications;
  if (data.m_semenNotes)  male.additionalNotes  = data.m_semenNotes;

  if (data._systemicFemale) {
    const sel: string[] = Array.isArray(data._systemicFemale) ? data._systemicFemale : [];
    female.systemicDiseases = {
      diabetes:     sel.includes("diabetes"),
      hypertension: sel.includes("hypertension"),
      thyroid:      sel.includes("thyroid"),
      autoimmune:   sel.includes("autoimmune"),
      other:        sel.filter((s) => !["diabetes","hypertension","thyroid","autoimmune","none"].includes(s)).join(", "),
    };
  }
  if (data._systemicMale) {
    const sel: string[] = Array.isArray(data._systemicMale) ? data._systemicMale : [];
    male.systemicDiseases = {
      diabetes:     sel.includes("diabetes"),
      hypertension: sel.includes("hypertension"),
      other:        sel.filter((s) => !["diabetes","hypertension","none"].includes(s)).join(", "),
    };
  }

  const payload: Record<string, any> = { ...female };
  if (couple || primaryGender === "male") payload.maleIntake = male;
  return payload;
}

// ─── Language selector component ────────────────────────────────────────────

const LANG_FLAGS: Record<string, string> = { en: "🇬🇧", ar: "🇸🇦", tr: "🇹🇷" };
const LANG_LABELS: Record<string, string> = { en: "English", ar: "العربية", tr: "Türkçe" };

function LanguageSelector({
  current,
  onChange,
}: {
  current: string;
  onChange: (lang: string) => void;
}) {
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {Object.entries(LANG_LABELS).map(([code, label]) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
            current === code
              ? "bg-white text-[#1E0566] border-white shadow"
              : "bg-white/10 text-white/80 border-white/20 hover:bg-white/20"
          }`}
        >
          {LANG_FLAGS[code]} {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function IntakeWizardPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const brand       = searchParams.get("brand") ?? "fertiliv";
  const source      = searchParams.get("source") ?? undefined;
  const formSlug    = searchParams.get("form") ?? undefined;
  const campaign    = searchParams.get("campaign") ?? undefined;
  // ?lang= param sets the initial UI language; defaults to "en"
  const langParam   = searchParams.get("lang") ?? "en";
  const [uiLang, setUiLang] = useState<string>(langParam);
  const brandLabel  = BRAND_LABELS[brand] ?? "Fertiliv IVF Center";

  // Load dynamic form config if ?form= is provided
  const { data: dynamicForm } = trpc.intakeForms.get.useQuery(
    { slug: formSlug! },
    { enabled: !!formSlug }
  );
  // Also try to load the default form for the brand if no slug provided
  const { data: defaultForm } = trpc.intakeForms.getDefault.useQuery(
    { brand },
    { enabled: !formSlug }
  );
  const activeForm = dynamicForm ?? defaultForm ?? null;

  // Helper: get translated label for a field
  function t(fieldId: string, fallback: string): string {
    if (!activeForm?.translations) return fallback;
    const trans = (activeForm.translations as Record<string, Record<string, string>>)[fieldId];
    if (!trans) return fallback;
    return trans[uiLang] ?? trans["en"] ?? fallback;
  }

  // Dynamic form title/subtitle
  const formTitle = (activeForm?.titleTranslations as Record<string, string> | null)?.[uiLang]
    ?? (activeForm?.titleTranslations as Record<string, string> | null)?.["en"]
    ?? brandLabel;
  const formSubtitle = (activeForm?.subtitleTranslations as Record<string, string> | null)?.[uiLang]
    ?? (activeForm?.subtitleTranslations as Record<string, string> | null)?.["en"]
    ?? undefined;

  // Wizard navigation
  const [step, setStep]   = useState<WizardStep>("basic_info");
  const [slideKey, setSlideKey] = useState("basic_info");

  const goForward = useCallback((next: WizardStep) => {
    setStep(next);
    setSlideKey(next + "_" + Date.now());
  }, []);
  const goBack = useCallback((prev: WizardStep) => {
    setStep(prev);
    setSlideKey(prev + "_back_" + Date.now());
  }, []);

  // Token from backend after Step 1
  const [intakeToken, setIntakeToken] = useState<string | null>(null);

  // Step 1 form state
  const [basicForm, setBasicForm] = useState<BasicFormState>({
    firstName: "", lastName: "", phone: "", email: "",
    gender: "", dateOfBirth: "", preferredLanguages: [],
  });
  const handleBasicChange = useCallback((patch: Partial<BasicFormState>) => {
    setBasicForm((f) => ({ ...f, ...patch }));
  }, []);
  const [basicErrors, setBasicErrors] = useState<Record<string, string>>({});

  // Callback form state
  const [callbackForm, setCallbackForm] = useState<CallbackFormState>({
    date: "", time: "", method: "whatsapp",
  });
  const handleCallbackChange = useCallback((patch: Partial<CallbackFormState>) => {
    setCallbackForm((f) => ({ ...f, ...patch }));
  }, []);

  // Treatment interest
  const [medicalInterest, setMedicalInterest] = useState("");

  // Intake questions state
  const [intakeData,     setIntakeData]     = useState<Record<string, any>>({});
  const [qIndex,         setQIndex]         = useState(0);
  const [currentGender,  setCurrentGender]  = useState<"female" | "male">("female");
  const [femaleComplete, setFemaleComplete] = useState(false);

  // tRPC mutations
  const submitBasicInfo    = trpc.intake.submitBasicInfo.useMutation();
  const updateInterest     = trpc.intake.updateInterest.useMutation();
  const requestCallback    = trpc.intake.requestCallback.useMutation();
  const submitMedicalIntake = trpc.intake.submitMedicalIntake.useMutation();

  // Derived
  const needsBoth       = !FEMALE_ONLY.includes(medicalInterest) && !MALE_ONLY.includes(medicalInterest);
  const needsFemaleOnly = FEMALE_ONLY.includes(medicalInterest);
  const needsMaleOnly   = MALE_ONLY.includes(medicalInterest);

  // Compute which lead fields (l_*) are selected in the active form
  const activeFormLeadFieldIds = useMemo(() => {
    if (!activeForm?.fields) return null;
    const fields = activeForm.fields as string[];
    const leadIds = fields.filter((id) => LEAD_FIELD_MAP.has(id));
    return leadIds.length > 0 ? leadIds : null;
  }, [activeForm]);

  // If a custom form is loaded, only show the medical intake fields selected in the form builder.
  const INTAKE_QUESTION_IDS = useMemo(() => new Set(INTAKE_QUESTIONS.map((q) => q.id)), []);
  const activeFormFieldIds = useMemo(() => {
    if (!activeForm?.fields) return null;
    const fields = activeForm.fields as string[];
    // Only keep IDs that actually correspond to INTAKE_QUESTIONS (ignore lead_form field names)
    const medicalIds = fields.filter((id) => INTAKE_QUESTION_IDS.has(id));
    return medicalIds.length > 0 ? new Set(medicalIds) : null;
  }, [activeForm, INTAKE_QUESTION_IDS]);

  const activeQuestions = useMemo(() => {
    return INTAKE_QUESTIONS.filter((q) => {
      // If a custom form is active, only include fields that were selected in the builder
      if (activeFormFieldIds && !activeFormFieldIds.has(q.id)) return false;
      if (q.gender !== currentGender && q.gender !== "both") return false;
      if (q.showIf && !q.showIf(intakeData)) return false;
      return true;
    });
  }, [currentGender, intakeData, activeFormFieldIds, INTAKE_QUESTION_IDS]);

  const currentQuestion = activeQuestions[qIndex];

  // ── Handlers ──

  const handleBasicSubmit = useCallback(async () => {
    const errs: Record<string, string> = {};
    if (!basicForm.firstName?.trim()) errs.firstName = "Required";
    if (!basicForm.lastName?.trim())  errs.lastName  = "Required";
    if (!basicForm.phone?.trim())     errs.phone     = "Required";
    if (!basicForm.gender)            errs.gender    = "Required";
    // Only validate dateOfBirth if it was filled in
    if (basicForm.dateOfBirth) {
      const dobYear = parseInt(basicForm.dateOfBirth.split('-')[0], 10);
      if (dobYear < 1900) errs.dateOfBirth = "Please enter a valid year (1900 or later).";
      else if (new Date(basicForm.dateOfBirth) > new Date()) errs.dateOfBirth = "Date of birth cannot be in the future.";
    }
    if (Object.keys(errs).length) { setBasicErrors(errs); return; }
    setBasicErrors({});
    try {
      // Build payload: always include mandatory fields + any extra dynamic fields
      const payload: Record<string, any> = {
        firstName:   basicForm.firstName.trim(),
        lastName:    basicForm.lastName.trim(),
        phone:       basicForm.phone.trim(),
        email:       basicForm.email?.trim() || undefined,
        gender:      basicForm.gender as "male" | "female",
        brand:       brand as any,
        leadSource:  source as any,
        campaignName: campaign,
      };
      // Add optional fields only if they have values
      if (basicForm.dateOfBirth) payload.dateOfBirth = basicForm.dateOfBirth;
      if (basicForm.middleName?.trim()) payload.middleName = basicForm.middleName.trim();
      if (basicForm.nationality?.trim()) payload.nationality = basicForm.nationality.trim();
      if (basicForm.country?.trim()) payload.country = basicForm.country.trim();
      if (basicForm.city?.trim()) payload.city = basicForm.city.trim();
      if (basicForm.address?.trim()) payload.address = basicForm.address.trim();
      if (basicForm.secondaryPhone?.trim()) payload.secondaryPhone = basicForm.secondaryPhone.trim();
      if (basicForm.secondaryEmail?.trim()) payload.secondaryEmail = basicForm.secondaryEmail.trim();
      if (basicForm.primaryLanguage) payload.primaryLanguage = basicForm.primaryLanguage;
      if (basicForm.patientType) payload.patientType = basicForm.patientType;
      if (Array.isArray(basicForm.preferredLanguages) && basicForm.preferredLanguages.length > 0)
        payload.preferredLanguages = basicForm.preferredLanguages;
      if (Array.isArray(basicForm.preferredContactMethods) && basicForm.preferredContactMethods.length > 0)
        payload.preferredContactMethods = basicForm.preferredContactMethods;
      if (basicForm.mainMedicalInterest) payload.mainMedicalInterest = basicForm.mainMedicalInterest;
      if (basicForm.ivfExperience) payload.ivfExperience = basicForm.ivfExperience;
      if (Array.isArray(basicForm.fertilityDiagnosis) && basicForm.fertilityDiagnosis.length > 0)
        payload.fertilityDiagnosis = basicForm.fertilityDiagnosis;
      if (Array.isArray(basicForm.maleFertilityDiagnosis) && basicForm.maleFertilityDiagnosis.length > 0)
        payload.maleFertilityDiagnosis = basicForm.maleFertilityDiagnosis;
      if (basicForm.decisionTimeline) payload.decisionTimeline = basicForm.decisionTimeline;
      if (basicForm.travelReadiness) payload.travelReadiness = basicForm.travelReadiness;
      if (basicForm.budgetRange?.trim()) payload.budgetRange = basicForm.budgetRange.trim();
      if (basicForm.callbackPreferredDate) payload.callbackPreferredDate = basicForm.callbackPreferredDate;
      if (basicForm.callbackPreferredTime) payload.callbackPreferredTime = basicForm.callbackPreferredTime;
      if (basicForm.callbackMethod) payload.callbackMethod = basicForm.callbackMethod;
      if (basicForm.accommodationHotel?.trim()) payload.accommodationHotel = basicForm.accommodationHotel.trim();
      if (basicForm.accommodationLocation?.trim()) payload.accommodationLocation = basicForm.accommodationLocation.trim();
      if (basicForm.transportationAirportPickup !== undefined) payload.transportationAirportPickup = basicForm.transportationAirportPickup;
      if (basicForm.transportationLocalTransfer !== undefined) payload.transportationLocalTransfer = basicForm.transportationLocalTransfer;

      const result = await submitBasicInfo.mutateAsync(payload as any);
      setIntakeToken(result.intakeToken);
      goForward("welcome_choice");
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong. Please try again.");
    }
  }, [basicForm, brand, source, campaign, submitBasicInfo, goForward]);

  const handleCallbackSubmit = useCallback(async () => {
    if (!callbackForm.date || !callbackForm.time) {
      toast.error("Please select a preferred date and time.");
      return;
    }
    if (!intakeToken) return;
    try {
      await requestCallback.mutateAsync({
        intakeToken,
        callbackPreferredDate: callbackForm.date,
        callbackPreferredTime: callbackForm.time,
        callbackMethod:        callbackForm.method,
      });
      goForward("callback_done");
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong.");
    }
  }, [callbackForm, intakeToken, requestCallback, goForward]);

  const handleInterestSubmit = useCallback(async (interest: string) => {
    setMedicalInterest(interest);
    if (intakeToken) {
      await updateInterest.mutateAsync({ intakeToken, mainMedicalInterest: interest as any }).catch(() => {});
    }
    const isMaleOnly   = MALE_ONLY.includes(interest);
    const isFemaleOnly = FEMALE_ONLY.includes(interest);
    if (isMaleOnly) {
      setCurrentGender("male"); setQIndex(0);
      goForward("intake_question");
    } else if (isFemaleOnly) {
      setCurrentGender("female"); setQIndex(0);
      goForward("intake_question");
    } else {
      goForward("who_first");
    }
  }, [intakeToken, updateInterest, goForward]);

  const handleWhoFirst = useCallback((gender: "female" | "male") => {
    setCurrentGender(gender); setQIndex(0);
    goForward("intake_question");
  }, [goForward]);

  const handleQuestionNext = useCallback(async () => {
    const isLast = qIndex >= activeQuestions.length - 1;
    if (!isLast) { setQIndex((q) => q + 1); return; }

    if (currentGender === "female" && needsBoth) {
      setFemaleComplete(true);
      setCurrentGender("male"); setQIndex(0);
      toast.success("Female intake complete! Continuing with the husband.");
      return;
    }

    if (intakeToken) {
      try {
        const structured = buildIntakePayload(intakeData, needsBoth, basicForm.gender as "male" | "female");
        await submitMedicalIntake.mutateAsync({ intakeToken, intakeData: structured });
      } catch { /* non-blocking */ }
    }
    goForward("thankyou");
  }, [qIndex, activeQuestions.length, currentGender, needsBoth, intakeToken, intakeData, basicForm.gender, submitMedicalIntake, goForward]);

  const handleQuestionChange = useCallback((field: string, val: any) => {
    setIntakeData((d) => ({ ...d, [field]: val }));
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (step === "basic_info") {
    return (
      <WizardLayout brandLabel={formTitle}>
        <AnimatePresence mode="wait">
          <SlideWrapper slideKey={slideKey}>
            <div className="space-y-4">
              {/* Language selector */}
              <LanguageSelector current={uiLang} onChange={setUiLang} />
              {/* Dynamic subtitle */}
              {formSubtitle && (
                <p className="text-center text-white/70 text-sm">{formSubtitle}</p>
              )}
              {/* Campaign badge */}
              {campaign && (
                <p className="text-center text-xs text-white/40">Campaign: {campaign}</p>
              )}
              {activeFormLeadFieldIds ? (
                <DynamicLeadForm
                  fieldIds={activeFormLeadFieldIds}
                  form={basicForm}
                  errors={basicErrors}
                  isPending={submitBasicInfo.isPending}
                  onChange={handleBasicChange}
                  onSubmit={handleBasicSubmit}
                  formTitle={formTitle}
                  formSubtitle={formSubtitle}
                />
              ) : (
                <BasicInfoForm
                  form={basicForm}
                  errors={basicErrors}
                  isPending={submitBasicInfo.isPending}
                  onChange={handleBasicChange}
                  onSubmit={handleBasicSubmit}
                />
              )}
            </div>
          </SlideWrapper>
        </AnimatePresence>
      </WizardLayout>
    );
  }

  if (step === "welcome_choice") {
    return (
      <WizardLayout brandLabel={brandLabel} showBack onBack={() => goBack("basic_info")}>
        <AnimatePresence mode="wait">
          <SlideWrapper slideKey={slideKey}>
            <div className="space-y-6 text-center">
              <div>
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">👋</span>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">
                  Thank you, {basicForm.firstName}!
                </h1>
                <p className="text-white/70 text-sm leading-relaxed">
                  We've received your information. Our team will be in touch soon.
                  <br />Would you like to tell us a bit more about yourself?
                </p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => goForward("treatment_interest")}
                  className="w-full py-5 px-5 rounded-2xl bg-white text-[#1E0566] font-semibold text-left hover:bg-white/90 transition flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#1E0566]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ClipboardList className="w-5 h-5 text-[#1E0566]" />
                  </div>
                  <div>
                    <div className="font-bold text-base">Fill in my medical survey</div>
                    <div className="text-sm text-[#1E0566]/60 mt-0.5">~5 minutes · Helps us prepare for your consultation</div>
                  </div>
                </button>
                <button
                  onClick={() => goForward("callback_form")}
                  className="w-full py-5 px-5 rounded-2xl bg-white/10 border border-white/20 text-white font-semibold text-left hover:bg-white/20 transition flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-bold text-base">I'd prefer to speak with a coordinator</div>
                    <div className="text-sm text-white/50 mt-0.5">Schedule a call at your convenience</div>
                  </div>
                </button>
              </div>
              <button
                onClick={() => goForward("thankyou")}
                className="text-white/40 text-sm hover:text-white/60 transition"
              >
                Skip for now
              </button>
            </div>
          </SlideWrapper>
        </AnimatePresence>
      </WizardLayout>
    );
  }

  if (step === "callback_form") {
    return (
      <WizardLayout brandLabel={brandLabel} showBack onBack={() => goBack("welcome_choice")}>
        <AnimatePresence mode="wait">
          <SlideWrapper slideKey={slideKey}>
            <CallbackFormView
              form={callbackForm}
              isPending={requestCallback.isPending}
              onChange={handleCallbackChange}
              onSubmit={handleCallbackSubmit}
            />
          </SlideWrapper>
        </AnimatePresence>
      </WizardLayout>
    );
  }

  if (step === "callback_done") {
    return (
      <WizardLayout brandLabel={brandLabel}>
        <div className="text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-400/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">All set!</h1>
            <p className="text-white/70 text-sm leading-relaxed">
              We've noted your preferred callback time.
              <br />Our patient coordinator will reach out to you soon.
            </p>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Date</span>
              <span className="text-white font-medium">{callbackForm.date}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Time</span>
              <span className="text-white font-medium">{callbackForm.time}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Via</span>
              <span className="text-white font-medium capitalize">{callbackForm.method.replace("_", " ")}</span>
            </div>
          </div>
        </div>
      </WizardLayout>
    );
  }

  if (step === "treatment_interest") {
    return (
      <WizardLayout brandLabel={brandLabel} showBack onBack={() => goBack("welcome_choice")}>
        <AnimatePresence mode="wait">
          <SlideWrapper slideKey={slideKey}>
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">What brings you to us?</h1>
                <p className="text-white/60 text-sm">Select the treatment or service you're interested in.</p>
              </div>
              <div className="space-y-2">
                {MEDICAL_INTERESTS.map((interest) => (
                  <button
                    key={interest.value}
                    type="button"
                    onClick={() => handleInterestSubmit(interest.value)}
                    disabled={updateInterest.isPending}
                    className="w-full text-left px-5 py-4 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition flex items-center gap-4 group"
                  >
                    <span className="text-2xl">{interest.emoji}</span>
                    <span className="font-medium text-base">{interest.label}</span>
                    <ArrowRight className="w-4 h-4 ml-auto text-white/40 group-hover:text-white transition" />
                  </button>
                ))}
              </div>
            </div>
          </SlideWrapper>
        </AnimatePresence>
      </WizardLayout>
    );
  }

  if (step === "who_first") {
    return (
      <WizardLayout brandLabel={brandLabel} showBack onBack={() => goBack("treatment_interest")}>
        <AnimatePresence mode="wait">
          <SlideWrapper slideKey={slideKey}>
            <div className="space-y-6 text-center">
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">Who would you like to start with?</h1>
                <p className="text-white/60 text-sm">You'll complete both sections — choose the order.</p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => handleWhoFirst("female")}
                  className="w-full py-5 px-5 rounded-2xl bg-white text-[#1E0566] font-semibold text-left hover:bg-white/90 transition flex items-center gap-4"
                >
                  <span className="text-3xl">👩</span>
                  <div>
                    <div className="font-bold text-base">Start with Wife (Female)</div>
                    <div className="text-sm text-[#1E0566]/60 mt-0.5">Then continue with husband</div>
                  </div>
                </button>
                <button
                  onClick={() => handleWhoFirst("male")}
                  className="w-full py-5 px-5 rounded-2xl bg-white/10 border border-white/20 text-white font-semibold text-left hover:bg-white/20 transition flex items-center gap-4"
                >
                  <span className="text-3xl">👨</span>
                  <div>
                    <div className="font-bold text-base">Start with Husband (Male)</div>
                    <div className="text-sm text-white/50 mt-0.5">Then continue with wife</div>
                  </div>
                </button>
              </div>
            </div>
          </SlideWrapper>
        </AnimatePresence>
      </WizardLayout>
    );
  }

  if (step === "intake_question" && currentQuestion) {
    const totalQ  = activeQuestions.length;
    const isLast  = qIndex >= totalQ - 1;
    const canSkip = currentQuestion.type !== "select" && currentQuestion.type !== "yesno";
    const personLabel = needsBoth
      ? currentGender === "female" ? "Wife's Information" : "Husband's Information"
      : "Your Information";

    return (
      <WizardLayout
        brandLabel={brandLabel}
        showBack
        onBack={() => {
          if (qIndex === 0) {
            if (needsBoth && currentGender === "male" && femaleComplete) {
              setCurrentGender("female");
              const femaleQs = INTAKE_QUESTIONS.filter((q) => q.gender === "female" || q.gender === "both");
              setQIndex(femaleQs.length - 1);
              setSlideKey("back_to_female_" + Date.now());
            } else if (needsBoth) {
              goBack("who_first");
            } else {
              goBack("treatment_interest");
            }
          } else {
            setQIndex((q) => q - 1);
            setSlideKey("q_back_" + Date.now());
          }
        }}
      >
        <AnimatePresence mode="wait">
          <SlideWrapper slideKey={slideKey + "_q" + qIndex}>
            <div className="space-y-5">
              {needsBoth && (
                <div className="flex items-center gap-2">
                  <span className="text-lg">{currentGender === "female" ? "👩" : "👨"}</span>
                  <span className="text-white/60 text-sm font-medium">{personLabel}</span>
                </div>
              )}
              <ProgressBar current={qIndex + 1} total={totalQ} />
              <div className="text-xs text-white/50 uppercase tracking-wider">{currentQuestion.section}</div>
              <div>
                <h2 className="text-xl font-bold text-white leading-snug mb-1">
                  {t(currentQuestion.id, currentQuestion.label)}
                </h2>
                {currentQuestion.sublabel && (
                  <p className="text-white/50 text-sm">{currentQuestion.sublabel}</p>
                )}
              </div>
              <QuestionInput
                question={{
                  ...currentQuestion,
                  // Override label and option labels with translations if available
                  label: t(currentQuestion.id, currentQuestion.label),
                  options: currentQuestion.options?.map((opt) => ({
                    ...opt,
                    label: t(`${currentQuestion.id}__opt__${opt.value}`, opt.label),
                  })),
                }}
                value={intakeData[currentQuestion.field]}
                onChange={(v) => handleQuestionChange(currentQuestion.field, v)}
              />
              <div className="flex gap-3 pt-2">
                {canSkip && (
                  <button
                    onClick={() => { if (isLast) handleQuestionNext(); else setQIndex((q) => q + 1); }}
                    className="flex-1 py-3.5 rounded-2xl bg-white/10 border border-white/20 text-white text-sm font-medium hover:bg-white/20 transition"
                  >
                    Skip
                  </button>
                )}
                <button
                  onClick={handleQuestionNext}
                  disabled={submitMedicalIntake.isPending}
                  className="flex-1 py-3.5 rounded-2xl bg-white text-[#1E0566] font-bold text-base hover:bg-white/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitMedicalIntake.isPending && isLast ? (
                    <span className="animate-spin rounded-full h-5 w-5 border-2 border-[#1E0566] border-t-transparent" />
                  ) : isLast ? (
                    <><CheckCircle2 className="w-4 h-4" /> {needsBoth && currentGender === "female" ? "Continue to Husband" : "Finish"}</>
                  ) : (
                    <>Next <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>
          </SlideWrapper>
        </AnimatePresence>
      </WizardLayout>
    );
  }

  // Thank you
  return (
    <WizardLayout brandLabel={brandLabel}>
      <div className="text-center space-y-6">
        <div className="w-24 h-24 rounded-full bg-green-400/20 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-12 h-12 text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Thank you, {basicForm.firstName}!
          </h1>
          <p className="text-white/70 text-sm leading-relaxed max-w-xs mx-auto">
            We've received your information and our team will be in touch with you very soon.
          </p>
        </div>
        <div className="bg-white/10 rounded-2xl p-5 text-left space-y-2">
          <p className="text-white/50 text-xs uppercase tracking-wider mb-3">What happens next</p>
          {[
            "Our team reviews your information",
            "A patient coordinator will contact you within 24 hours",
            "We'll prepare a personalized treatment plan for you",
          ].map((text, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-white/80">
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {text}
            </div>
          ))}
        </div>
        <img src={LOGO_WHITE} alt={brandLabel} className="h-8 object-contain mx-auto opacity-60" />
      </div>
    </WizardLayout>
  );
}
