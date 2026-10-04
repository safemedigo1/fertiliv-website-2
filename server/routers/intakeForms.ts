/**
 * Intake Form Builder Router
 * Manages dynamic intake forms for advertising campaigns (AR/EN/TR multilingual)
 *
 * FIELD_CATALOG includes ALL fields from:
 *  - leads table (personal info, contact, lead-specific fields)
 *  - medical_intake table (female + male medical questions)
 *
 * Every field is optional — the form builder controls which fields appear and in what order.
 * No fields are hardcoded as "always shown".
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

// ─── Static field catalog ─────────────────────────────────────────────────────

export type FieldCategory =
  | "personal_info"        // leads: name, dob, gender, nationality
  | "contact_info"         // leads: email, phone, address, city, country
  | "lead_info"            // leads: mainMedicalInterest, decisionTimeline, ivfExperience, etc.
  | "logistics"            // leads: accommodation, transportation
  | "fertility_female"     // medical_intake: female fertility questions
  | "fertility_male"       // medical_intake: male fertility questions
  | "partner_info";        // partner/spouse information

export interface FieldDef {
  id: string;
  category: FieldCategory;
  /** Maps to form field type */
  type: "text" | "phone" | "email" | "date" | "select" | "multicheck" | "yesno" | "textarea" | "number" | "multiselect" | "boolean" | "file" | "height_weight" | "repeatable";
  required: boolean;
  /** Default label in English */
  labelEn: string;
  sublabelEn?: string;
  /** Option values for select/multicheck/yesno/multiselect fields */
  options?: string[];
  /** Which gender this question applies to */
  gender?: "female" | "male" | "both";
  /** Section name in the wizard */
  section?: string;
  /** Which DB table this field maps to */
  source?: "leads" | "medical_intake";
  /** The actual DB column name */
  dbField?: string;
  /**
   * Human-readable labels for select/multiselect option values.
   * e.g. { "1-2-weeks": "1–2 weeks", "immediately": "As soon as possible" }
   * When present, the wizard renders these labels instead of the raw option values.
   */
  optionLabels?: Record<string, string>;
  /**
   * Conditional logic: this field is only shown when another field has a specific value.
   * e.g. { fieldId: "f_previous_ivf", values: ["yes"] }
   */
  showIf?: { fieldId: string; values: string[] };
  /**
   * For type="repeatable": sub-fields that make up each repeated entry.
   * Each entry is an object with keys matching the sub-field ids.
   */
  repeatableFields?: {
    id: string;
    type: "text" | "date" | "number" | "select" | "textarea" | "file" | "yesno";
    labelEn: string;
    sublabelEn?: string;
    options?: string[];
    optionLabels?: Record<string, string>;
    required?: boolean;
    /** Show this sub-field only when another sub-field in the same entry has a specific value */
    showIf?: { fieldId: string; values: string[] };
  }[];
  /** Label for the "Add another" button */
  addButtonLabelEn?: string;
}

export const FIELD_CATALOG: FieldDef[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // PERSONAL INFO (from leads table)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "l_firstName", category: "personal_info", type: "text", required: true,
    source: "leads", dbField: "firstName",
    labelEn: "First Name", section: "Personal Information",
  },
  {
    id: "l_middleName", category: "personal_info", type: "text", required: false,
    source: "leads", dbField: "middleName",
    labelEn: "Middle Name", section: "Personal Information",
  },
  {
    id: "l_lastName", category: "personal_info", type: "text", required: true,
    source: "leads", dbField: "lastName",
    labelEn: "Last Name", section: "Personal Information",
  },
  {
    id: "l_dateOfBirth", category: "personal_info", type: "date", required: false,
    source: "leads", dbField: "dateOfBirth",
    labelEn: "Date of Birth", section: "Personal Information",
  },
  {
    id: "l_gender", category: "personal_info", type: "select", required: true,
    source: "leads", dbField: "gender",
    labelEn: "Gender", section: "Personal Information",
    options: ["female", "male"],
  },
  {
    id: "l_isLocalPatient", category: "personal_info", type: "yesno", required: false,
    source: "leads", dbField: "patientType",
    labelEn: "Do you have a Turkish ID or Turkish residency?",
    sublabelEn: "This helps us determine the appropriate pricing for your treatment.",
    section: "Personal Information",
    options: ["yes", "no"],
  },
  {
    id: "l_tcKimlikNo", category: "personal_info", type: "text", required: false,
    source: "leads", dbField: "tcKimlikNo",
    labelEn: "T.C. Identity Number (optional)",
    sublabelEn: "Your 11-digit Turkish national ID number.",
    section: "Personal Information",
    showIf: { fieldId: "l_isLocalPatient", values: ["yes"] },
  },
  {
    id: "l_passportNumber", category: "personal_info", type: "text", required: false,
    source: "leads", dbField: "passportNumber",
    labelEn: "Passport Number (optional)",
    sublabelEn: "Your passport number for identification purposes.",
    section: "Personal Information",
    showIf: { fieldId: "l_isLocalPatient", values: ["no"] },
  },
  {
    id: "l_nationality", category: "personal_info", type: "select", required: false,
    source: "leads", dbField: "nationality",
    labelEn: "Nationality", section: "Personal Information",
    options: ["Afghan","Albanian","Algerian","Andorran","Angolan","Argentine","Armenian","Australian","Austrian","Azerbaijani","Bahraini","Bangladeshi","Belarusian","Belgian","Bolivian","Bosnian","Brazilian","Bulgarian","Cambodian","Cameroonian","Canadian","Chilean","Chinese","Colombian","Croatian","Cuban","Cypriot","Czech","Danish","Dutch","Egyptian","Eritrean","Estonian","Ethiopian","Filipino","Finnish","French","Georgian","German","Ghanaian","Greek","Guatemalan","Haitian","Honduran","Hungarian","Icelandic","Indian","Indonesian","Iranian","Iraqi","Irish","Israeli","Italian","Jamaican","Japanese","Jordanian","Kazakhstani","Kenyan","Kuwaiti","Kyrgyz","Lao","Latvian","Lebanese","Libyan","Lithuanian","Luxembourgish","Malaysian","Maldivian","Malian","Maltese","Mauritanian","Mauritian","Mexican","Moldovan","Mongolian","Moroccan","Mozambican","Burmese","Nepali","New Zealander","Nigerian","Norwegian","Omani","Pakistani","Panamanian","Peruvian","Polish","Portuguese","Qatari","Romanian","Russian","Rwandan","Saudi","Senegalese","Serbian","Singaporean","Slovak","Slovenian","Somali","South African","South Sudanese","Spanish","Sri Lankan","Sudanese","Swedish","Swiss","Syrian","Taiwanese","Tajik","Tanzanian","Thai","Togolese","Tunisian","Turkish","Turkmen","Ugandan","Ukrainian","Emirati","British","American","Uruguayan","Uzbek","Venezuelan","Vietnamese","Yemeni","Zambian","Zimbabwean"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONTACT INFO (from leads table)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "l_phone", category: "contact_info", type: "phone", required: true,
    source: "leads", dbField: "phone",
    labelEn: "Phone Number", section: "Contact Information",
    sublabelEn: "Include country code (e.g. +964...)",
  },
  {
    id: "l_secondaryPhone", category: "contact_info", type: "phone", required: false,
    source: "leads", dbField: "secondaryPhone",
    labelEn: "Secondary Phone Number", section: "Contact Information",
  },
  {
    id: "l_email", category: "contact_info", type: "email", required: false,
    source: "leads", dbField: "email",
    labelEn: "Email Address", section: "Contact Information",
  },
  {
    id: "l_secondaryEmail", category: "contact_info", type: "email", required: false,
    source: "leads", dbField: "secondaryEmail",
    labelEn: "Secondary Email Address", section: "Contact Information",
  },
  {
    id: "l_country", category: "contact_info", type: "select", required: false,
    source: "leads", dbField: "country",
    labelEn: "Country", section: "Contact Information",
    options: ["Afghanistan","Albania","Algeria","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahrain","Bangladesh","Belarus","Belgium","Bolivia","Bosnia and Herzegovina","Brazil","Bulgaria","Cambodia","Cameroon","Canada","Chile","China","Colombia","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Ecuador","Egypt","Ethiopia","Finland","France","Georgia","Germany","Ghana","Greece","Guatemala","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Libya","Lithuania","Luxembourg","Malaysia","Maldives","Mali","Malta","Mauritania","Mauritius","Mexico","Moldova","Mongolia","Morocco","Mozambique","Myanmar","Nepal","Netherlands","New Zealand","Nigeria","Norway","Oman","Pakistan","Panama","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Singapore","Slovakia","Slovenia","Somalia","South Africa","South Sudan","Spain","Sri Lanka","Sudan","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Togo","Tunisia","Turkey","Turkmenistan","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"],
  },
  {
    id: "l_city", category: "contact_info", type: "text", required: false,
    source: "leads", dbField: "city",
    labelEn: "City", section: "Contact Information",
  },
  {
    id: "l_address", category: "contact_info", type: "textarea", required: false,
    source: "leads", dbField: "address",
    labelEn: "Full Address", section: "Contact Information",
  },
  {
    id: "l_preferredContactMethods", category: "contact_info", type: "multicheck", required: false,
    source: "leads", dbField: "preferredContactMethods",
    labelEn: "Preferred Contact Methods", section: "Contact Information",
    sublabelEn: "How would you like us to contact you?",
    options: ["whatsapp", "phone", "email", "video_call"],
  },
  {
    id: "l_preferredLanguages", category: "contact_info", type: "multicheck", required: false,
    source: "leads", dbField: "preferredLanguages",
    labelEn: "Preferred Languages", section: "Contact Information",
    options: ["en", "ar", "tr", "fr", "es", "ru", "it", "other"],
  },
  {
    id: "l_primaryLanguage", category: "contact_info", type: "select", required: false,
    source: "leads", dbField: "primaryLanguage",
    labelEn: "Primary Language", section: "Contact Information",
    options: ["en", "ar", "tr", "fr", "es", "ru", "it", "other"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LEAD INFO (from leads table)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "l_mainMedicalInterest", category: "lead_info", type: "multiselect", required: false,
    source: "leads", dbField: "mainMedicalInterest",
    labelEn: "What is your main medical interest?", section: "Medical Interest",
    sublabelEn: "Select all that apply.",
    options: ["IVF with ICSI", "IUI", "PGT (Preimplantation Genetic Testing)", "Egg Freezing", "Fertility Check-up (Couple)", "Fertility Check-up (Female)", "Fertility Check-up (Male)", "Sperm Test", "Hysteroscopy", "HSG", "PRP", "Exosome", "Other / Not sure yet"],
  },
  {
    id: "l_ivfExperience", category: "lead_info", type: "select", required: false,
    source: "leads", dbField: "ivfExperience",
    labelEn: "Have you tried IVF before?", section: "Medical Interest",
    optionLabels: { "": "\u2014 Not specified \u2014", "never-tried": "Never tried", "tried-unsuccessful": "Tried before \u2013 unsuccessful", "tried-again": "Tried before \u2013 wants to try again", "tried-multiple": "Tried multiple attempts" },
    options: ["", "never-tried", "tried-unsuccessful", "tried-again", "tried-multiple"],
  },
  {
    id: "l_fertilityDiagnosis", category: "lead_info", type: "multiselect", required: false,
    source: "leads", dbField: "fertilityDiagnosis",
    labelEn: "Female Fertility Diagnosis", section: "Medical Interest",
    sublabelEn: "Select all that apply.",
    options: ["Ovarian reserve", "PCOS (Polycystic Ovary Syndrome)", "Premature Ovarian Insufficiency (POI)", "Ovulation disorders", "Tubal factor", "Hydrosalpinx", "Endometriosis", "Uterine fibroids (myomas)", "Uterine polyps", "Uterine septum / Asherman's syndrome", "Genetics / PGT needed", "Recurrent miscarriages", "Recurrent Implantation Failure (RIF)", "Unexplained infertility", "No clear diagnosis / needs re-evaluation", "Systemic factors", "Other"],
    showIf: { fieldId: "l_gender", values: ["female"] },
  },
  {
    id: "l_maleFertilityDiagnosis", category: "lead_info", type: "multiselect", required: false,
    source: "leads", dbField: "maleFertilityDiagnosis",
    labelEn: "Male Fertility Diagnosis", section: "Medical Interest",
    sublabelEn: "Select all that apply.",
    options: ["Male factor infertility", "Azoospermia", "Oligospermia (low sperm count)", "Asthenospermia (poor motility)", "Teratospermia (abnormal morphology)", "OAT syndrome (combined)", "Varicocele", "Undescended testicles (cryptorchidism)", "Vasectomy history", "Retrograde ejaculation", "Hypogonadism", "Y-chromosome microdeletion", "Klinefelter syndrome", "CF mutation carrier", "Unexplained male factor", "No clear diagnosis", "Other"],
    showIf: { fieldId: "l_gender", values: ["male"] },
  },
  {
    id: "l_decisionTimeline", category: "lead_info", type: "select", required: false,
    source: "leads", dbField: "decisionTimeline",
    labelEn: "When are you planning to start treatment?", section: "Planning",
    optionLabels: { "immediately": "As soon as possible / Immediately", "1-2-weeks": "1–2 weeks", "1-month": "1 month", "2-months": "2 months", "3-months": "3 months", "1-3-months": "1–3 months", "6-months": "6 months", "exploring": "Exploring / Not sure" },
    options: ["immediately", "1-2-weeks", "1-month", "2-months", "3-months", "1-3-months", "6-months", "exploring"],
  },
  {
    id: "l_travelReadiness", category: "lead_info", type: "select", required: false,
    source: "leads", dbField: "travelReadiness",
    labelEn: "Are you ready to travel for treatment?", section: "Planning",
    optionLabels: { "ready": "Yes, I am ready to travel", "considering": "I am considering traveling and comparing options", "prefers-home": "I prefer treatment in my home country", "local-patient": "Local patient" },
    options: ["ready", "considering", "prefers-home", "local-patient"],
  },
  {
    id: "l_budgetRange", category: "lead_info", type: "select", required: false,
    source: "leads", dbField: "budgetRange",
    labelEn: "What is your approximate budget?", section: "Planning",
    options: ["Under $1,000", "$1,000 – $2,000", "$2,000 – $3,000", "$3,000 – $4,000", "$4,000 – $5,000", "$5,000 – $6,000", "$6,000 – $7,000", "$7,000 – $8,000", "$8,000 – $9,000", "$9,000+"],
  },

  {
    id: "l_leadSource", category: "lead_info", type: "select", required: false,
    source: "leads", dbField: "leadSource",
    labelEn: "How did you hear about us?", section: "Lead Source",
    optionLabels: { "paid": "Paid Advertisement", "employee-referral": "Employee Referral", "external-referral": "External Referral", "website": "Website", "maps": "Google Maps", "instagram": "Instagram", "tiktok": "TikTok", "facebook": "Facebook", "youtube": "YouTube", "twitter": "Twitter / X", "linkedin": "LinkedIn", "other": "Other" },
    options: ["paid", "employee-referral", "external-referral", "website", "maps", "instagram", "tiktok", "facebook", "youtube", "twitter", "linkedin", "other"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LOGISTICS (from leads table)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "l_accommodationHotel", category: "logistics", type: "text", required: false,
    source: "leads", dbField: "accommodationHotel",
    labelEn: "Hotel Name (if known)", section: "Accommodation & Transport",
  },
  {
    id: "l_accommodationLocation", category: "logistics", type: "text", required: false,
    source: "leads", dbField: "accommodationLocation",
    labelEn: "Accommodation Location / Area", section: "Accommodation & Transport",
  },
  {
    id: "l_transportationAirportPickup", category: "logistics", type: "select", required: false,
    source: "leads", dbField: "transportationAirportPickup",
    labelEn: "Do you need airport pickup?", section: "Accommodation & Transport",
    options: ["", "yes", "no"],
    optionLabels: { "": "\u2014 Not specified \u2014", "yes": "Yes", "no": "No" },
  },
  {
    id: "l_transportationLocalTransfer", category: "logistics", type: "select", required: false,
    source: "leads", dbField: "transportationLocalTransfer",
    labelEn: "Do you need local transportation?", section: "Accommodation & Transport",
    options: ["", "yes", "no"],
    optionLabels: { "": "\u2014 Not specified \u2014", "yes": "Yes", "no": "No" },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MEDICAL RECORD — FEMALE (from medical_intake table)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "f_infertility_type", category: "fertility_female", type: "select", required: false,
    source: "medical_intake", dbField: "infertilityType",
    gender: "female", section: "Your Fertility Journey",
    labelEn: "What type of infertility are you experiencing?",
    sublabelEn: "Primary: you have never been pregnant before. Secondary: you have been pregnant at least once before.",
    options: ["primary", "secondary"],
    optionLabels: { primary: "Primary \u2014 I have never been pregnant before", secondary: "Secondary \u2014 I have been pregnant before" },
  },
  {
    id: "f_duration", category: "fertility_female", type: "text", required: false,
    source: "medical_intake", dbField: "infertilityDuration",
    gender: "female", section: "Your Fertility Journey",
    labelEn: "How long have you been trying to conceive?",
  },
  {
    id: "f_profession", category: "fertility_female", type: "text", required: false,
    source: "medical_intake", dbField: "profession",
    gender: "female", section: "Personal Details",
    labelEn: "What is your profession / occupation?",
  },
  {
    id: "f_marriage_date", category: "fertility_female", type: "date", required: false,
    source: "medical_intake", dbField: "marriageDate",
    gender: "female", section: "Personal Details",
    labelEn: "Marriage Date",
  },
  {
    id: "f_is_first_marriage", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "isFirstMarriage",
    gender: "female", section: "Personal Details",
    labelEn: "Is this your first marriage?",
    options: ["yes", "no"],
  },
  {
    id: "f_civil_marriage", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "hasCivilMarriageCertificate",
    gender: "female", section: "Personal Details",
    labelEn: "Do you have a civil marriage certificate?",
    sublabelEn: "Required for treatment in Turkey.",
    options: ["yes", "no"],
  },
  {
    id: "f_height_weight", category: "fertility_female", type: "height_weight", required: false,
    source: "medical_intake", dbField: "heightCm",
    gender: "female", section: "Body Measurements",
    labelEn: "What is your height and weight?",
    sublabelEn: "We use this to calculate your BMI.",
  },
  {
    id: "f_cycle_regularity", category: "fertility_female", type: "select", required: false,
    source: "medical_intake", dbField: "cycleRegularity",
    gender: "female", section: "Menstrual Cycle",
    labelEn: "Are your periods regular?",
    options: ["regular", "irregular", "absent"],
  },
  {
    id: "f_lmp", category: "fertility_female", type: "date", required: false,
    source: "medical_intake", dbField: "lastMenstrualPeriod",
    gender: "female", section: "Menstrual Cycle",
    labelEn: "When was the first day of your last period?",
    showIf: { fieldId: "f_cycle_regularity", values: ["regular", "irregular"] },
  },
  {
    id: "f_cycle_length", category: "fertility_female", type: "number", required: false,
    source: "medical_intake", dbField: "cycleLengthDays",
    gender: "female", section: "Menstrual Cycle",
    labelEn: "How many days is your typical cycle?",
    showIf: { fieldId: "f_cycle_regularity", values: ["regular", "irregular"] },
  },
  {
    id: "f_menstrual_flow_days", category: "fertility_female", type: "number", required: false,
    source: "medical_intake", dbField: "menstrualFlowDays",
    gender: "female", section: "Menstrual Cycle",
    labelEn: "How many days does your period last?",
    showIf: { fieldId: "f_cycle_regularity", values: ["regular", "irregular"] },
  },
  {
    id: "f_dysmenorrhea", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "dysmenorrhea",
    gender: "female", section: "Menstrual Cycle",
    labelEn: "Do you experience painful periods (dysmenorrhea)?",
    options: ["yes", "no"],
  },
  {
    id: "f_gravida", category: "fertility_female", type: "number", required: false,
    source: "medical_intake", dbField: "gravida",
    gender: "female", section: "Pregnancy History",
    labelEn: "How many times have you been pregnant?",
    sublabelEn: "Include all pregnancies — full term, miscarriages, terminations.",
  },
  {
    id: "f_para", category: "fertility_female", type: "number", required: false,
    source: "medical_intake", dbField: "para",
    gender: "female", section: "Pregnancy History",
    labelEn: "How many live births have you had?",
    showIf: { fieldId: "f_gravida", values: ["__nonzero__"] },
  },
  {
    id: "f_abortus", category: "fertility_female", type: "number", required: false,
    source: "medical_intake", dbField: "abortus",
    gender: "female", section: "Pregnancy History",
    labelEn: "How many abortions or terminations have you had?",
    showIf: { fieldId: "f_gravida", values: ["__nonzero__"] },
  },
  {
    id: "f_living_children", category: "fertility_female", type: "number", required: false,
    source: "medical_intake", dbField: "livingChildren",
    gender: "female", section: "Pregnancy History",
    labelEn: "How many living children do you have?",
    showIf: { fieldId: "f_gravida", values: ["__nonzero__"] },
  },
  {
    id: "f_miscarriages", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "miscarriageHistory",
    gender: "female", section: "Pregnancy History",
    labelEn: "Have you had any miscarriages or pregnancy losses?",
    options: ["yes", "no"],
  },
  {
    id: "f_has_fertility_diagnosis", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "hasFertilityDiagnosis",
    gender: "female", section: "Fertility Diagnosis",
    labelEn: "Have you received a fertility diagnosis from a doctor?",
    sublabelEn: "If yes, you will be asked to select your diagnosis in the next question.",
    options: ["yes", "no"],
  },
  {
    id: "f_previous_ivf", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "artHistory",
    gender: "female", section: "Previous Treatments",
    labelEn: "Have you had any previous fertility treatments (IVF, IUI, etc.)?",
    options: ["yes", "no"],
  },
  {
    id: "f_ivf_details", category: "fertility_female", type: "textarea", required: false,
    source: "medical_intake", dbField: "artHistory",
    gender: "female", section: "Previous Treatments",
    labelEn: "Please briefly describe your previous fertility treatments.",
    showIf: { fieldId: "f_previous_ivf", values: ["yes"] },
  },
  {
    id: "f_surgical_history", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "surgicalHistory",
    gender: "female", section: "Previous Procedures & Surgeries",
    labelEn: "Have you had any previous procedures or surgeries?",
    options: ["yes", "no"],
  },
  {
    id: "f_smoking", category: "fertility_female", type: "select", required: false,
    source: "medical_intake", dbField: "smoking",
    gender: "female", section: "Lifestyle",
    labelEn: "Do you smoke?",
    options: ["never", "former", "current"],
  },
  {
    id: "f_alcohol", category: "fertility_female", type: "select", required: false,
    source: "medical_intake", dbField: "alcohol",
    gender: "female", section: "Lifestyle",
    labelEn: "Do you drink alcohol?",
    options: ["never", "occasional", "regular"],
  },
  {
    id: "f_hirsutism", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "hirsutism",
    gender: "female", section: "Lifestyle",
    labelEn: "Do you have excessive hair growth (hirsutism)?",
    options: ["yes", "no"],
  },
  {
    id: "f_systemic", category: "fertility_female", type: "multicheck", required: false,
    source: "medical_intake", dbField: "systemicDiseases",
    gender: "female", section: "Health Conditions",
    labelEn: "Do you have any of these health conditions?",
    sublabelEn: "Select all that apply. Selecting \"None of the above\" will clear other selections.",
    options: ["diabetes", "hypertension", "thyroid", "heart_disease", "kidney_disease", "liver_disease", "epilepsy", "asthma", "anemia", "autoimmune", "coagulation", "cancer", "other_condition", "none"],
    optionLabels: { none: "None of the above" },
  },
  {
    id: "f_medications", category: "fertility_female", type: "textarea", required: false,
    source: "medical_intake", dbField: "currentMedications",
    gender: "female", section: "Health Conditions",
    labelEn: "Are you currently taking any medications?",
    sublabelEn: "List any medicines you take regularly, or write 'None'.",
  },
  {
    id: "f_allergies", category: "fertility_female", type: "textarea", required: false,
    source: "medical_intake", dbField: "allergies",
    gender: "female", section: "Health Conditions",
    labelEn: "Do you have any known allergies?",
  },
  {
    id: "f_consanguinity", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "consanguinity",
    gender: "female", section: "Family History",
    labelEn: "Are you and your partner related (consanguineous)?",
    options: ["yes", "no"],
  },
  {
    id: "f_hereditary_diseases", category: "fertility_female", type: "textarea", required: false,
    source: "medical_intake", dbField: "hereditaryDiseases",
    gender: "female", section: "Family History",
    labelEn: "Are there any hereditary diseases in your family?",
    sublabelEn: "e.g. diabetes, thalassemia, genetic disorders, heart disease, cancer, etc.",
  },
  {
    id: "f_family_breast_cancer", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "familyBreastCancer",
    gender: "female", section: "Family History",
    labelEn: "Is there a family history of breast cancer?",
    options: ["yes", "no"],
  },
  {
    id: "f_family_early_menopause", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "familyEarlyMenopause",
    gender: "female", section: "Family History",
    labelEn: "Is there a family history of early menopause?",
    options: ["yes", "no"],
  },
  {
    id: "f_family_infertility", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "familyInfertility",
    gender: "female", section: "Family History",
    labelEn: "Is there a family history of infertility?",
    options: ["yes", "no"],
  },
  {
    id: "f_contraceptive_history", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "contraceptiveHistory",
    gender: "female", section: "Contraceptive History",
    labelEn: "Have you used any contraceptive methods?",
    options: ["yes", "no"],
  },
  {
    id: "f_additional_notes", category: "fertility_female", type: "textarea", required: false,
    source: "medical_intake", dbField: "additionalNotes",
    gender: "female", section: "Additional Information",
    labelEn: "Is there anything else you would like us to know?",
  },
  {
    id: "f_expected_visit_date", category: "fertility_female", type: "date", required: false,
    source: "medical_intake", dbField: "expectedVisitDate",
    gender: "female", section: "Additional Information",
    labelEn: "When are you planning to visit?",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MEDICAL RECORD — MALE (from medical_intake.maleIntake JSON)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "m_profession", category: "fertility_male", type: "text", required: false,
    source: "medical_intake", dbField: "maleIntake.profession",
    gender: "male", section: "General Health",
    labelEn: "What is your profession / occupation?",
  },
  {
    id: "m_height_weight", category: "fertility_male", type: "height_weight", required: false,
    source: "medical_intake", dbField: "maleIntake.heightCm",
    gender: "male", section: "General Health",
    labelEn: "What is your height and weight?",
    sublabelEn: "We use this to calculate your BMI.",
  },
  {
    id: "m_smoking", category: "fertility_male", type: "select", required: false,
    source: "medical_intake", dbField: "maleIntake.smoking",
    gender: "male", section: "Lifestyle",
    labelEn: "Do you smoke?",
    options: ["never", "former", "current"],
  },
  {
    id: "m_alcohol", category: "fertility_male", type: "select", required: false,
    source: "medical_intake", dbField: "maleIntake.alcohol",
    gender: "male", section: "Lifestyle",
    labelEn: "Do you drink alcohol?",
    options: ["never", "occasional", "regular"],
  },
  {
    id: "m_semen", category: "fertility_male", type: "yesno", required: false,
    source: "medical_intake", dbField: "maleIntake.semenAnalysis",
    gender: "male", section: "Semen Analysis",
    labelEn: "Have you had a semen analysis done before?",
    options: ["yes", "no"],
  },
  {
    id: "m_semen_date", category: "fertility_male", type: "date", required: false,
    source: "medical_intake", dbField: "maleIntake.semenAnalysisDate",
    gender: "male", section: "Semen Analysis",
    labelEn: "Date of semen analysis",
    showIf: { fieldId: "m_semen", values: ["yes"] },
  },
  {
    id: "m_semen_volume", category: "fertility_male", type: "number", required: false,
    source: "medical_intake", dbField: "maleIntake.semenVolume",
    gender: "male", section: "Semen Analysis",
    labelEn: "Volume (mL)",
    showIf: { fieldId: "m_semen", values: ["yes"] },
  },
  {
    id: "m_semen_count", category: "fertility_male", type: "number", required: false,
    source: "medical_intake", dbField: "maleIntake.semenCount",
    gender: "male", section: "Semen Analysis",
    labelEn: "Sperm count (million/mL)",
    showIf: { fieldId: "m_semen", values: ["yes"] },
  },
  {
    id: "m_semen_motility", category: "fertility_male", type: "number", required: false,
    source: "medical_intake", dbField: "maleIntake.semenMotility",
    gender: "male", section: "Semen Analysis",
    labelEn: "Total motility (%)",
    showIf: { fieldId: "m_semen", values: ["yes"] },
  },
  {
    id: "m_semen_morphology", category: "fertility_male", type: "number", required: false,
    source: "medical_intake", dbField: "maleIntake.semenMorphology",
    gender: "male", section: "Semen Analysis",
    labelEn: "Normal morphology (%)",
    showIf: { fieldId: "m_semen", values: ["yes"] },
  },
  {
    id: "m_semen_result", category: "fertility_male", type: "textarea", required: false,
    source: "medical_intake", dbField: "maleIntake.semenNotes",
    gender: "male", section: "Semen Analysis",
    labelEn: "Additional notes about semen analysis",
    sublabelEn: "Describe any other findings or diagnosis (e.g. azoospermia, oligospermia).",
    showIf: { fieldId: "m_semen", values: ["yes"] },
  },
  {
    id: "m_semen_attachment", category: "fertility_male", type: "file", required: false,
    source: "medical_intake", dbField: "maleIntake.semenAttachment",
    gender: "male", section: "Semen Analysis",
    labelEn: "Upload semen analysis report (optional)",
    sublabelEn: "PDF or image. If password-protected, enter the document password below.",
    showIf: { fieldId: "m_semen", values: ["yes"] },
  },
  {
    id: "m_systemic", category: "fertility_male", type: "multicheck", required: false,
    source: "medical_intake", dbField: "maleIntake.systemicDiseases",
    gender: "male", section: "Health Conditions",
    labelEn: "Do you have any of these health conditions?",
    sublabelEn: "Select all that apply. Selecting \"None of the above\" will clear other selections.",
    options: ["diabetes", "hypertension", "heart_disease", "kidney_disease", "liver_disease", "epilepsy", "asthma", "anemia", "autoimmune", "coagulation", "cancer", "varicocele", "hormonal", "other_condition", "none"],
    optionLabels: { none: "None of the above" },
  },
  {
    id: "m_medications", category: "fertility_male", type: "textarea", required: false,
    source: "medical_intake", dbField: "maleIntake.lifestyle",
    gender: "male", section: "Health Conditions",
    labelEn: "Are you currently taking any medications?",
  },
  {
    id: "m_surgical_history", category: "fertility_male", type: "yesno", required: false,
    source: "medical_intake", dbField: "maleIntake.surgicalHistory",
    gender: "male", section: "Previous Procedures & Surgeries",
    labelEn: "Have you had any previous procedures or surgeries?",
    options: ["yes", "no"],
  },
  {
    id: "m_family_history", category: "fertility_male", type: "textarea", required: false,
    source: "medical_intake", dbField: "maleIntake.familyHistory",
    gender: "male", section: "Family History",
    labelEn: "Is there any relevant family medical history?",
  },
  {
    id: "m_genetic_tests", category: "fertility_male", type: "yesno", required: false,
    source: "medical_intake", dbField: "maleIntake.geneticTests",
    gender: "male", section: "Genetic Tests",
    labelEn: "Have you had any genetic tests done?",
    options: ["yes", "no"],
  },
  {
    id: "m_additional_notes", category: "fertility_male", type: "textarea", required: false,
    source: "medical_intake", dbField: "maleIntake.additionalNotes",
    gender: "male", section: "Additional Information",
    labelEn: "Is there anything else you would like us to know?",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // REPEATABLE SECTIONS — FEMALE
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: "f_miscarriage_history", category: "fertility_female", type: "repeatable", required: false,
    source: "medical_intake", dbField: "miscarriageHistory",
    gender: "female", section: "Pregnancy History",
    labelEn: "Miscarriage / Pregnancy Loss Details",
    sublabelEn: "Add one entry for each miscarriage or pregnancy loss.",
    showIf: { fieldId: "f_miscarriages", values: ["yes"] },
    addButtonLabelEn: "Add miscarriage",
    repeatableFields: [
      { id: "date", type: "date", labelEn: "Date of miscarriage" },
      { id: "gestationalAge", type: "text", labelEn: "Gestational age (e.g. 8 weeks)" },
      { id: "notes", type: "textarea", labelEn: "Notes / cause (if known)" },
      { id: "attachments", type: "file", labelEn: "Related documents", sublabelEn: "Upload any pathology reports, ultrasound images, or other relevant documents from this pregnancy loss." },
    ],
  },

  {
    id: "f_art_history", category: "fertility_female", type: "repeatable", required: false,
    source: "medical_intake", dbField: "artHistory",
    gender: "female", section: "Previous Treatments",
    labelEn: "Previous Fertility Treatment Details",
    sublabelEn: "Add one entry for each IVF, IUI, or other fertility treatment cycle.",
    showIf: { fieldId: "f_previous_ivf", values: ["yes"] },
    addButtonLabelEn: "Add another treatment cycle",
    repeatableFields: [
      { id: "type", type: "select", labelEn: "Treatment type",
        options: ["IVF", "ICSI", "FET", "IUI", "OI", "DonorEggIVF", "Other"],
        optionLabels: { IVF: "IVF", ICSI: "ICSI", FET: "FET (Frozen Embryo Transfer)", IUI: "IUI (Intrauterine Insemination)", OI: "Ovulation Induction (OI)", DonorEggIVF: "Donor Egg IVF", Other: "Other" } },
      { id: "date", type: "date", labelEn: "Date of treatment" },
      { id: "clinic", type: "text", labelEn: "Clinic / hospital name" },
      { id: "protocol", type: "text", labelEn: "Protocol used (if known)" },
      { id: "eggsCollected", type: "number", labelEn: "Eggs collected" },
      { id: "embryosFertilized", type: "number", labelEn: "Embryos fertilized" },
      { id: "embryosTransferred", type: "number", labelEn: "Embryos transferred" },
      { id: "embryoQuality", type: "text", labelEn: "Embryo quality / grade (if known)" },
      { id: "result", type: "select", labelEn: "Result",
        options: ["Negative", "Chemical Pregnancy", "Clinical Pregnancy", "Miscarriage", "Live Birth", "Ongoing Pregnancy"],
        optionLabels: { Negative: "Negative", "Chemical Pregnancy": "Chemical Pregnancy", "Clinical Pregnancy": "Clinical Pregnancy", Miscarriage: "Miscarriage", "Live Birth": "Live Birth", "Ongoing Pregnancy": "Ongoing Pregnancy" } },
      { id: "notes", type: "textarea", labelEn: "Additional notes" },
    ],
  },

  {
    id: "f_surgical_history_details", category: "fertility_female", type: "repeatable", required: false,
    source: "medical_intake", dbField: "surgicalHistory",
    gender: "female", section: "Previous Procedures & Surgeries",
    labelEn: "Previous Procedures & Surgeries",
    sublabelEn: "Add one entry for each procedure or surgery.",
    showIf: { fieldId: "f_surgical_history", values: ["yes"] },
    addButtonLabelEn: "Add another procedure",
    repeatableFields: [
      { id: "procedureType", type: "select", labelEn: "Type of Procedure", required: true,
        options: ["Hysteroscopy", "Laparoscopy", "PRP", "Exosome", "Myomectomy", "Cystectomy", "Polypectomy", "Appendectomy", "Cesarean Section", "Other"] },
      { id: "procedure", type: "text", labelEn: "Procedure / surgery name", sublabelEn: "Only required if \"Other\" was selected above" },
      { id: "date", type: "date", labelEn: "Date of procedure" },
      { id: "notes", type: "textarea", labelEn: "Notes / findings" },
      { id: "file", type: "file", labelEn: "Upload related document (optional)" },
    ],
  },

  {
    id: "f_contraceptive_history_details", category: "fertility_female", type: "repeatable", required: false,
    source: "medical_intake", dbField: "contraceptiveHistory",
    gender: "female", section: "Contraceptive History",
    labelEn: "Contraceptive History Details",
    sublabelEn: "Add one entry for each contraceptive method used.",
    showIf: { fieldId: "f_contraceptive_history", values: ["yes"] },
    addButtonLabelEn: "Add another method",
    repeatableFields: [
      { id: "method", type: "select", labelEn: "Method", options: ["OCP", "IUD", "Implant", "Injection", "Patch", "Condom", "Natural", "Other"], optionLabels: { OCP: "Oral contraceptive pill (OCP)", IUD: "IUD / Coil", Implant: "Implant", Injection: "Injection (Depo-Provera)", Patch: "Patch", Condom: "Condom", Natural: "Natural / rhythm method", Other: "Other" } },
      { id: "duration", type: "text", labelEn: "Duration of use (e.g. 2 years)" },
      { id: "stoppedDate", type: "date", labelEn: "Date stopped" },
      { id: "notes", type: "textarea", labelEn: "Notes" },
    ],
  },

  {
    id: "f_previous_tests", category: "fertility_female", type: "repeatable", required: false,
    source: "medical_intake", dbField: "previousTests",
    gender: "female", section: "Previous Tests",
    labelEn: "Previous Lab / Hormone Tests",
    sublabelEn: "Add one entry for each test result you have.",
    addButtonLabelEn: "Add test result",
    repeatableFields: [
      { id: "name", type: "text", labelEn: "Test name", required: true },
      { id: "date", type: "date", labelEn: "Collection Date" },
      { id: "result", type: "text", labelEn: "Result / value" },
      { id: "refRange", type: "text", labelEn: "Reference Range" },
      { id: "file", type: "file", labelEn: "Upload test report (optional)" },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // REPEATABLE SECTIONS — MALE
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: "m_surgical_history_details", category: "fertility_male", type: "repeatable", required: false,
    source: "medical_intake", dbField: "maleIntake.surgicalHistory",
    gender: "male", section: "Previous Procedures & Surgeries",
    labelEn: "Previous Procedures & Surgeries",
    sublabelEn: "Add one entry for each procedure or surgery.",
    showIf: { fieldId: "m_surgical_history", values: ["yes"] },
    addButtonLabelEn: "Add another procedure",
    repeatableFields: [
      { id: "procedureType", type: "select", labelEn: "Type of Procedure", required: true,
        options: ["Varicocele surgery", "Undescended testicle surgery / Orchiopexy", "Testicular biopsy", "Sperm retrieval (TESE / Micro-TESE / TESA / PESA / MESA)", "Hernia surgery", "Hydrocele surgery", "Testicular torsion surgery", "Vasectomy", "Vasectomy reversal", "Urethral or urinary tract surgery", "Prostate surgery", "Chemotherapy / Radiotherapy", "Testosterone or anabolic steroid use", "Testicular injury / Trauma", "Mumps infection after puberty", "Other"] },
      { id: "procedure", type: "text", labelEn: "Procedure / surgery name (if Other)" },
      { id: "date", type: "date", labelEn: "Date of procedure" },
      { id: "notes", type: "textarea", labelEn: "Notes / findings" },
      { id: "file", type: "file", labelEn: "Upload related document (optional)" },
    ],
  },

  {
    id: "m_genetic_tests_details", category: "fertility_male", type: "repeatable", required: false,
    source: "medical_intake", dbField: "maleIntake.geneticTests",
    gender: "male", section: "Genetic Tests",
    labelEn: "Genetic Test Details",
    sublabelEn: "Add one entry for each genetic test.",
    showIf: { fieldId: "m_genetic_tests", values: ["yes"] },
    addButtonLabelEn: "Add another test",
    repeatableFields: [
      { id: "name", type: "text", labelEn: "Test name (e.g. Karyotype, Y-deletion)", required: true },
      { id: "date", type: "date", labelEn: "Date of test" },
      { id: "result", type: "textarea", labelEn: "Result / findings" },
      { id: "file", type: "file", labelEn: "Upload test report (optional)" },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // FEMALE FERTILITY DIAGNOSIS
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "f_fertility_diagnosis", category: "fertility_female", type: "multicheck", required: false,
    source: "medical_intake", dbField: "fertilityDiagnosis",
    gender: "female", section: "Fertility Diagnosis",
    labelEn: "Female Fertility Diagnosis",
    sublabelEn: "Select all that apply.",
    options: ["low_ovarian_reserve", "pcos", "poi", "ovulation_disorder", "tubal_factor", "hydrosalpinx", "endometriosis", "uterine_polyps", "uterine_fibroids", "uterine_septum", "genetics_pgt", "recurrent_miscarriage", "rif", "unexplained", "systemic_factors", "no_diagnosis", "other_diagnosis"],
    showIf: { fieldId: "f_has_fertility_diagnosis", values: ["yes"] },
  },
  {
    id: "f_has_radiology", category: "fertility_female", type: "yesno", required: false,
    source: "medical_intake", dbField: "hasRadiologyStudies",
    gender: "female", section: "Radiology & Imaging",
    labelEn: "Has the patient had any radiology or imaging studies (ultrasound, HSG, MRI, CT, etc.)?",
    sublabelEn: "Ultrasound reports, HSG, MRI, CT, and other imaging studies. Each entry supports AI extraction and EN/AR/TR translation.",
    options: ["yes", "no"],
  },
  {
    id: "f_radiology_studies", category: "fertility_female", type: "repeatable", required: false,
    source: "medical_intake", dbField: "radiologyStudies",
    gender: "female", section: "Radiology & Imaging",
    labelEn: "Radiology & Imaging Studies (Female)",
    sublabelEn: "Add one entry for each imaging study.",
    showIf: { fieldId: "f_has_radiology", values: ["yes"] },
    addButtonLabelEn: "Add imaging study",
    repeatableFields: [
      {
        id: "type", type: "select", labelEn: "Study type",
        options: ["tvus", "hsg", "mri", "ct", "mammography", "xray", "other"],
        optionLabels: {
          tvus: "Transvaginal / Pelvic Ultrasound",
          hsg: "HSG (Hysterosalpingography)",
          mri: "MRI",
          ct: "CT Scan",
          mammography: "Mammography",
          xray: "X-Ray",
          other: "Other",
        },
      },
      { id: "date", type: "date", labelEn: "Study date" },
      { id: "studyName", type: "text", labelEn: "Study name / description", sublabelEn: "Auto-generated if empty" },
      { id: "performedBy", type: "text", labelEn: "Performed by (clinic / radiologist)" },
      { id: "findings", type: "textarea", labelEn: "Findings", sublabelEn: "Radiologist findings..." },
      { id: "conclusion", type: "textarea", labelEn: "Conclusion / Impression", sublabelEn: "Clinical impression..." },
      // TVUS-specific sub-fields (shown when type = tvus)
      { id: "tvus_uterusSize", type: "text", labelEn: "Uterus size (mm)", sublabelEn: "e.g. 70 × 45 × 40 mm", showIf: { fieldId: "type", values: ["tvus"] } },
      { id: "tvus_uterusPosition", type: "select", labelEn: "Uterus position", options: ["anteverted", "retroverted", "mid"], optionLabels: { anteverted: "Anteverted", retroverted: "Retroverted", mid: "Mid-position" }, showIf: { fieldId: "type", values: ["tvus"] } },
      { id: "tvus_endometrialThickness", type: "text", labelEn: "Endometrial thickness (mm)", showIf: { fieldId: "type", values: ["tvus"] } },
      { id: "tvus_endometrialPattern", type: "select", labelEn: "Endometrial pattern", options: ["trilaminar", "homogeneous", "hyperechoic", "other"], optionLabels: { trilaminar: "Trilaminar", homogeneous: "Homogeneous", hyperechoic: "Hyperechoic", other: "Other" }, showIf: { fieldId: "type", values: ["tvus"] } },
      { id: "tvus_rightOvarySize", type: "text", labelEn: "Right ovary size (mm)", showIf: { fieldId: "type", values: ["tvus"] } },
      { id: "tvus_rightOvaryAFC", type: "number", labelEn: "Right ovary AFC (antral follicle count)", showIf: { fieldId: "type", values: ["tvus"] } },
      { id: "tvus_leftOvarySize", type: "text", labelEn: "Left ovary size (mm)", showIf: { fieldId: "type", values: ["tvus"] } },
      { id: "tvus_leftOvaryAFC", type: "number", labelEn: "Left ovary AFC (antral follicle count)", showIf: { fieldId: "type", values: ["tvus"] } },
      { id: "tvus_dominantFollicle", type: "text", labelEn: "Dominant follicle (if present)", sublabelEn: "e.g. 18 mm right ovary", showIf: { fieldId: "type", values: ["tvus"] } },
      // HSG-specific sub-fields (shown when type = hsg)
      { id: "hsg_uterineCavity", type: "select", labelEn: "Uterine cavity", options: ["normal", "abnormal", "not_assessed"], optionLabels: { normal: "Normal", abnormal: "Abnormal", not_assessed: "Not assessed" }, showIf: { fieldId: "type", values: ["hsg"] } },
      { id: "hsg_rightTubePatency", type: "select", labelEn: "Right tube patency", options: ["patent", "blocked", "hydrosalpinx", "not_assessed"], optionLabels: { patent: "Patent (open)", blocked: "Blocked", hydrosalpinx: "Hydrosalpinx", not_assessed: "Not assessed" }, showIf: { fieldId: "type", values: ["hsg"] } },
      { id: "hsg_leftTubePatency", type: "select", labelEn: "Left tube patency", options: ["patent", "blocked", "hydrosalpinx", "not_assessed"], optionLabels: { patent: "Patent (open)", blocked: "Blocked", hydrosalpinx: "Hydrosalpinx", not_assessed: "Not assessed" }, showIf: { fieldId: "type", values: ["hsg"] } },
      // Report & images
      { id: "reportFile", type: "file", labelEn: "Attach Report", sublabelEn: "PDF, image, or document. Attach a report document to enable AI extraction." },
      { id: "images", type: "file", labelEn: "Images", sublabelEn: "JPEG, PNG, WebP" },
      { id: "dicomFiles", type: "file", labelEn: "DICOM Files", sublabelEn: ".dcm files" },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MALE FERTILITY DIAGNOSIS
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "m_has_fertility_diagnosis", category: "fertility_male", type: "yesno", required: false,
    source: "medical_intake", dbField: "maleHasFertilityDiagnosis",
    gender: "male", section: "Fertility Diagnosis",
    labelEn: "Have you received a fertility diagnosis from a doctor?",
    sublabelEn: "If yes, you will be asked to select your diagnosis in the next question.",
    options: ["yes", "no"],
  },
  {
    id: "m_fertility_diagnosis", category: "fertility_male", type: "multicheck", required: false,
    source: "medical_intake", dbField: "maleIntake.fertilityDiagnosis",
    gender: "male", section: "Fertility Diagnosis",
    labelEn: "Male Fertility Diagnosis",
    sublabelEn: "Select all that apply.",
    options: ["male_factor", "azoospermia", "oligospermia", "asthenospermia", "teratospermia", "oat_syndrome", "varicocele_dx", "cryptorchidism", "vasectomy", "hypogonadism", "retrograde_ejaculation", "klinefelter", "y_deletion", "cf_mutation", "unexplained_male", "no_diagnosis_male", "other_diagnosis"],
    showIf: { fieldId: "m_has_fertility_diagnosis", values: ["yes"] },
  },
  {
    id: "m_has_radiology", category: "fertility_male", type: "yesno", required: false,
    source: "medical_intake", dbField: "hasMaleRadiologyStudies",
    gender: "male", section: "Radiology & Imaging",
    labelEn: "Has the patient had any radiology or imaging studies (scrotal ultrasound, MRI, etc.)?",
    sublabelEn: "Scrotal ultrasound, MRI, and other imaging studies. Each entry supports AI extraction and EN/AR/TR translation.",
    options: ["yes", "no"],
  },
  {
    id: "m_radiology_studies", category: "fertility_male", type: "repeatable", required: false,
    source: "medical_intake", dbField: "maleRadiologyStudies",
    gender: "male", section: "Radiology & Imaging",
    labelEn: "Radiology & Imaging Studies (Male)",
    sublabelEn: "Add one entry for each imaging study.",
    showIf: { fieldId: "m_has_radiology", values: ["yes"] },
    addButtonLabelEn: "Add imaging study",
    repeatableFields: [
      {
        id: "type", type: "select", labelEn: "Study type",
        options: ["scrotal", "mri", "xray", "other"],
        optionLabels: {
          scrotal: "Scrotal Ultrasound",
          mri: "MRI",
          xray: "X-Ray",
          other: "Other",
        },
      },
      { id: "date", type: "date", labelEn: "Study date" },
      { id: "studyName", type: "text", labelEn: "Study name / description", sublabelEn: "Auto-generated if empty" },
      { id: "performedBy", type: "text", labelEn: "Performed by (clinic / radiologist)" },
      { id: "findings", type: "textarea", labelEn: "Findings", sublabelEn: "Radiologist findings..." },
      { id: "conclusion", type: "textarea", labelEn: "Conclusion / Impression", sublabelEn: "Clinical impression..." },
      // Scrotal ultrasound-specific sub-fields
      { id: "scrotal_rightTestisSize", type: "text", labelEn: "Right testis size (mm)", sublabelEn: "e.g. 40 × 25 × 30 mm", showIf: { fieldId: "type", values: ["scrotal"] } },
      { id: "scrotal_leftTestisSize", type: "text", labelEn: "Left testis size (mm)", showIf: { fieldId: "type", values: ["scrotal"] } },
      { id: "scrotal_epididymis", type: "text", labelEn: "Epididymis findings", showIf: { fieldId: "type", values: ["scrotal"] } },
      { id: "scrotal_varicoceleGrade", type: "select", labelEn: "Varicocele grade", options: ["none", "grade1", "grade2", "grade3"], optionLabels: { none: "None", grade1: "Grade I", grade2: "Grade II", grade3: "Grade III" }, showIf: { fieldId: "type", values: ["scrotal"] } },
      // Report & images
      { id: "reportFile", type: "file", labelEn: "Attach Report", sublabelEn: "PDF, image, or document. Attach a report document to enable AI extraction." },
      { id: "images", type: "file", labelEn: "Images", sublabelEn: "JPEG, PNG, WebP" },
      { id: "dicomFiles", type: "file", labelEn: "DICOM Files", sublabelEn: ".dcm files" },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // FEMALE NOTES & QUESTIONS
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "f_questions_for_doctor", category: "fertility_female", type: "textarea", required: false,
    source: "medical_intake", dbField: "questionsForDoctor",
    gender: "female", section: "Notes & Questions",
    labelEn: "Wife's Questions for the Doctor",
    sublabelEn: "Write any questions you would like to ask the doctor during your consultation.",
  },
  {
    id: "f_general_attachments", category: "fertility_female", type: "file", required: false,
    source: "medical_intake", dbField: "generalAttachmentsFemale",
    gender: "female", section: "Notes & Questions",
    labelEn: "General Attachments (Female)",
    sublabelEn: "Upload any relevant medical documents, reports, or images. Multiple files supported.",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MALE PREVIOUS TESTS & LAB RESULTS
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "m_has_previous_tests", category: "fertility_male", type: "yesno", required: false,
    source: "medical_intake", dbField: "maleIntake.hasPreviousTests",
    gender: "male", section: "Previous Tests & Lab Results",
    labelEn: "Has the patient had any previous lab tests or investigations?",
    sublabelEn: "Blood tests, hormone panels, genetic tests, etc.",
    options: ["yes", "no"],
  },
  {
    id: "m_previous_tests", category: "fertility_male", type: "repeatable", required: false,
    source: "medical_intake", dbField: "maleIntake.previousTests",
    gender: "male", section: "Previous Tests & Lab Results",
    labelEn: "Previous Lab / Hormone Tests",
    sublabelEn: "Add one entry for each test result you have (blood tests, hormone panels, etc.).",
    showIf: { fieldId: "m_has_previous_tests", values: ["yes"] },
    addButtonLabelEn: "Add test result",
    repeatableFields: [
      { id: "name", type: "text", labelEn: "Test name", required: true },
      { id: "date", type: "date", labelEn: "Collection Date" },
      { id: "result", type: "text", labelEn: "Result / value" },
      { id: "refRange", type: "text", labelEn: "Reference Range" },
      { id: "file", type: "file", labelEn: "Upload test report (optional)" },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MALE NOTES & QUESTIONS
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "m_questions_for_doctor", category: "fertility_male", type: "textarea", required: false,
    source: "medical_intake", dbField: "maleIntake.questionsForDoctor",
    gender: "male", section: "Notes & Questions",
    labelEn: "Husband's Questions for the Doctor",
    sublabelEn: "Write any questions you would like to ask the doctor during your consultation.",
  },
  {
    id: "m_general_attachments", category: "fertility_male", type: "file", required: false,
    source: "medical_intake", dbField: "generalAttachmentsMale",
    gender: "male", section: "Notes & Questions",
    labelEn: "General Attachments (Male)",
    sublabelEn: "Upload any relevant medical documents, reports, or images. Multiple files supported.",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PARTNER / SPOUSE INFORMATION
  // Only the 4 fields known at lead-creation time; partner is created as a
  // linked lead record (same model as LeadsPage "Add Partner" flow).
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "p_firstName", category: "partner_info", type: "text", required: false,
    labelEn: "Partner First Name", section: "Partner Information",
  },
  {
    id: "p_lastName", category: "partner_info", type: "text", required: false,
    labelEn: "Partner Last Name", section: "Partner Information",
  },
  {
    id: "p_dob", category: "partner_info", type: "date", required: false,
    labelEn: "Partner Date of Birth", section: "Partner Information",
    source: "leads", dbField: "partnerDob",
  },
  {
    id: "p_profession", category: "partner_info", type: "text", required: false,
    labelEn: "Partner Profession / Occupation", section: "Partner Information",
    source: "medical_intake", dbField: "maleIntake.profession",
  },
  {
    id: "p_phone", category: "partner_info", type: "phone", required: false,
    labelEn: "Partner Phone Number", section: "Partner Information",
    source: "leads", dbField: "partnerPhone",
  },
  {
    id: "p_email", category: "partner_info", type: "email", required: false,
    labelEn: "Partner Email Address", section: "Partner Information",
    source: "leads", dbField: "partnerEmail",
  },
];

// Human-readable option labels for the catalog (used in translation prompts)
export const OPTION_LABELS: Record<string, string> = {
  // gender
  female: "Female", male: "Male",
  // patient type
  local: "Local Patient", international: "International Patient",
  // infertility type
  primary: "Primary — never conceived before", secondary: "Secondary — conceived before",
  // cycle regularity
  regular: "Yes, regular", irregular: "No, irregular", absent: "No periods at all",
  // yes/no
  yes: "Yes", no: "No",
  // smoking/alcohol
  never: "Never", former: "Former smoker", current: "Yes, currently",
  occasional: "Occasionally",
  // health conditions (shared)
  diabetes: "Diabetes", hypertension: "Hypertension", thyroid: "Thyroid Disorder",
  heart_disease: "Heart Disease", kidney_disease: "Kidney Disease", liver_disease: "Liver Disease",
  epilepsy: "Epilepsy", asthma: "Asthma", anemia: "Anemia",
  autoimmune: "Autoimmune Disease", coagulation: "Coagulation Disorder",
  cancer: "Cancer / Malignancy", other_condition: "Other (specify)",
  // female-specific conditions
  pcos: "PCOS", endometriosis: "Endometriosis",
  // male health conditions
  varicocele: "Varicocele", hormonal: "Hormonal disorder",
  none: "None of the above",
  // female fertility diagnoses
  poi: "Premature Ovarian Insufficiency (POI)",
  ovulation_disorder: "Ovulation Disorders",
  tubal_factor: "Tubal Factor",
  hydrosalpinx: "Hydrosalpinx",
  uterine_polyps: "Uterine Polyps",
  uterine_fibroids: "Uterine Fibroids (Myomas)",
  uterine_septum: "Uterine Septum / Asherman's Syndrome",
  genetics_pgt: "Genetics / PGT Needed",
  rif: "Recurrent Implantation Failure (RIF)",
  systemic_factors: "Systemic Factors",
  no_diagnosis: "No Clear Diagnosis / Needs Re-evaluation",
  other_diagnosis: "Other",
  // male fertility diagnoses
  male_factor: "Male Factor Infertility",
  azoospermia: "Azoospermia",
  oligospermia: "Oligospermia (Low Sperm Count)",
  asthenospermia: "Asthenospermia (Poor Motility)",
  teratospermia: "Teratospermia (Abnormal Morphology)",
  oat_syndrome: "OAT Syndrome (Combined)",
  varicocele_dx: "Varicocele",
  cryptorchidism: "Undescended Testicles (Cryptorchidism)",
  vasectomy: "Vasectomy History",
  hypogonadism: "Hypogonadism",
  retrograde_ejaculation: "Retrograde Ejaculation",
  klinefelter: "Klinefelter Syndrome",
  y_deletion: "Y-Chromosome Microdeletion",
  cf_mutation: "CF Mutation Carrier",
  unexplained_male: "Unexplained Male Factor",
  no_diagnosis_male: "No Clear Diagnosis",
  // languages
  en: "English", ar: "Arabic", tr: "Turkish", fr: "French",
  es: "Spanish", ru: "Russian", it: "Italian",
  // contact methods
  whatsapp: "WhatsApp", phone: "Phone Call", email: "Email", video_call: "Video Call",
  // IVF experience
  "never-tried": "Never tried IVF",
  "tried-unsuccessful": "Tried IVF — unsuccessful",
  "tried-again": "Tried IVF — trying again",
  "tried-multiple": "Tried IVF multiple times",
  // decision timeline
  immediately: "Immediately", "1-2-weeks": "1–2 weeks", "1-month": "1 month",
  "2-months": "2 months", "3-months": "3 months", "1-3-months": "1–3 months",
  "6-months": "6 months", exploring: "Just exploring",
  // travel readiness
  ready: "Ready to travel", considering: "Still considering",
  "prefers-home": "Prefers treatment at home", "local-patient": "Local patient",
  // medical interests
  ivf: "IVF", icsi: "ICSI", iui: "IUI", pgt: "PGT (Genetic Testing)",
  egg_freezing: "Egg Freezing", sperm_freezing: "Sperm Freezing",
  embryo_freezing: "Embryo Freezing", donor_egg: "Donor Egg", donor_sperm: "Donor Sperm",
  // callback methods
  // (whatsapp, phone, email, video_call already defined above)
};

// Category display labels
export const CATEGORY_LABELS: Record<FieldCategory, string> = {
  personal_info: "Personal Information",
  contact_info: "Contact Information",
  lead_info: "Medical Interest & Planning",
  logistics: "Accommodation & Transport",
  fertility_female: "Female Medical Record",
  fertility_male: "Male Medical Record",
  partner_info: "Partner Information",
};

/**
 * Maps each treatment interest option to the applicable gender.
 * "both" = show all fields (male + female)
 * "female_only" = hide male fields
 * "male_only" = hide female fields
 * Extend this map whenever a new treatment option is added.
 */
export const TREATMENT_GENDER_MAP: Record<string, "both" | "female_only" | "male_only"> = {
  "IVF with ICSI":                        "both",
  "IUI":                                  "both",
  "PGT (Preimplantation Genetic Testing)": "both",
  "Egg Freezing":                         "female_only",
  "Fertility Check-up (Couple)":          "both",
  "Fertility Check-up (Female)":          "female_only",
  "Fertility Check-up (Male)":            "male_only",
  "Sperm Test":                           "male_only",
  "Hysteroscopy":                         "female_only",
  "HSG":                                  "female_only",
  "PRP":                                  "both",
  "Exosome":                              "both",
  "Other / Not sure yet":                 "both",
};

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const TranslationMapSchema = z.record(z.string(), z.record(z.string(), z.string()));
const TitleTranslationsSchema = z.record(z.string(), z.string()).nullable().optional();

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getDb() {
  const { getDb: _getDb } = await import("../db");
  const db = await _getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

async function getSchema() {
  return import("../../drizzle/schema");
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const intakeFormsRouter = router({
  /** Return the static field catalog (no auth required for public intake) */
  getFieldCatalog: publicProcedure.query(() => {
    return FIELD_CATALOG;
  }),

  /** Return the treatment-to-gender map (no auth required for public intake) */
  getTreatmentGenderMap: publicProcedure.query(() => {
    return TREATMENT_GENDER_MAP;
  }),

  /** List all forms (admin) */
  list: protectedProcedure
    .input(z.object({ brand: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const { intakeForms } = await getSchema();
      const { eq } = await import("drizzle-orm");
      let query = db.select().from(intakeForms);
      if (input?.brand) {
        query = query.where(eq(intakeForms.brand, input.brand as any)) as any;
      }
      return query.orderBy(intakeForms.createdAt);
    }),

  /** Get a single form by id or slug (public — used by IntakeWizardPage) */
  get: publicProcedure
    .input(z.union([
      z.object({ id: z.number() }),
      z.object({ slug: z.string() }),
    ]))
    .query(async ({ input }) => {
      const db = await getDb();
      const { intakeForms } = await getSchema();
      const { eq } = await import("drizzle-orm");
      const condition = "id" in input
        ? eq(intakeForms.id, input.id)
        : eq(intakeForms.slug, input.slug);
      const rows = await db.select().from(intakeForms).where(condition).limit(1);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });
      return rows[0];
    }),

  /** Get the default form for a brand (public) */
  getDefault: publicProcedure
    .input(z.object({ brand: z.string().default("fertiliv") }))
    .query(async ({ input }) => {
      const db = await getDb();
      const { intakeForms } = await getSchema();
      const { eq, and } = await import("drizzle-orm");
      const rows = await db.select().from(intakeForms)
        .where(and(eq(intakeForms.brand, input.brand as any), eq(intakeForms.isDefault, true)))
        .limit(1);
      return rows[0] ?? null;
    }),

  /** Create a new form (admin) */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
      brand: z.enum(["fertiliv", "safemedigo", "dr-nilay-karaca"]).default("fertiliv"),
      isDefault: z.boolean().default(false),
      fields: z.array(z.string()),
      translations: TranslationMapSchema,
      titleTranslations: TitleTranslationsSchema,
      subtitleTranslations: TitleTranslationsSchema,
      stepsMeta: z.array(z.any()).nullable().optional(),
      fieldConfig: z.record(z.string(), z.object({ enabledSubFields: z.array(z.string()).optional() })).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { intakeForms } = await getSchema();
      // If marking as default, unset other defaults for this brand
      if (input.isDefault) {
        const { eq } = await import("drizzle-orm");
        await db.update(intakeForms)
          .set({ isDefault: false })
          .where(eq(intakeForms.brand, input.brand));
      }
      const result = await db.insert(intakeForms).values({
        name: input.name,
        slug: input.slug,
        brand: input.brand,
        isDefault: input.isDefault,
        fields: input.fields,
        translations: input.translations,
        titleTranslations: input.titleTranslations ?? null,
        subtitleTranslations: input.subtitleTranslations ?? null,
        stepsMeta: input.stepsMeta ?? null,
        fieldConfig: input.fieldConfig ?? null,
      } as any);
      return { id: (result as any).insertId };
    }),

  /** Update a form (admin) */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
      brand: z.enum(["fertiliv", "safemedigo", "dr-nilay-karaca"]).optional(),
      isDefault: z.boolean().optional(),
      fields: z.array(z.string()).optional(),
      translations: TranslationMapSchema.optional(),
      titleTranslations: TitleTranslationsSchema,
      subtitleTranslations: TitleTranslationsSchema,
      stepsMeta: z.array(z.any()).nullable().optional(),
      fieldConfig: z.record(z.string(), z.object({ enabledSubFields: z.array(z.string()).optional() })).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { intakeForms } = await getSchema();
      const { eq } = await import("drizzle-orm");
      const { id, ...rest } = input;
      // If marking as default, unset other defaults for this brand
      if (rest.isDefault && rest.brand) {
        await db.update(intakeForms)
          .set({ isDefault: false })
          .where(eq(intakeForms.brand, rest.brand));
      }
      await db.update(intakeForms).set(rest as any).where(eq(intakeForms.id, id));
      return { success: true };
    }),

  /** Delete a form (admin) */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { intakeForms } = await getSchema();
      const { eq } = await import("drizzle-orm");
      await db.delete(intakeForms).where(eq(intakeForms.id, input.id));
      return { success: true };
    }),

  /**
   * Generate AI translations for a set of field IDs.
   * Supports selecting which target languages to generate (ar, tr, or both).
   * Returns: { fieldId: { en, ar?, tr? }, ... } plus title/subtitle translations.
   */
  generateTranslations: protectedProcedure
    .input(z.object({
      fieldIds: z.array(z.string()),
      targetLanguages: z.array(z.enum(["ar", "tr"])).min(1).default(["ar", "tr"]),
      formName: z.string().optional(),
      brand: z.string().optional(),
      steps: z.array(z.object({
        id: z.string(),
        type: z.enum(["fields", "decision"]).optional(),
        title: z.string().optional(),
        subtitle: z.string().optional(),
        // Decision step specific fields
        decisionTitle: z.string().optional(),
        decisionSubtitle: z.string().optional(),
        // Decision step buttons
        buttons: z.array(z.object({
          label: z.string(),
          action: z.string(),
        })).optional(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const { fieldIds, targetLanguages, formName, brand, steps } = input;
      const stepsWithTitles = (steps ?? []).filter((s) => s.title || s.subtitle || s.decisionTitle || s.decisionSubtitle || (s.buttons && s.buttons.length > 0));

      const langNames: Record<string, string> = { ar: "Arabic", tr: "Turkish" };
      const targetLangList = targetLanguages.map((l) => `${langNames[l]} (${l})`).join(" and ");
      const langPlaceholders = targetLanguages.map((l) => `"${l}": "..."`).join(", ");
      const langProps: Record<string, any> = { en: { type: "string" } };
      for (const lang of targetLanguages) langProps[lang] = { type: "string" };
      const langRequired = ["en", ...targetLanguages];

      const systemPrompt = `You are a medical translation assistant for a fertility clinic (${brand ?? "Fertiliv IVF Center"}).
Translate medical form labels from English into ${targetLangList}.
Use formal, patient-friendly medical language. For Arabic, use Modern Standard Arabic (MSA).
Return ONLY valid JSON.`;

      // Helper: translate a single text string into all target languages
      const translateText = async (text: string): Promise<Record<string, string>> => {
        try {
          const res = await invokeLLM({
            workloadId: "intake_form_translation",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Translate this medical form label: "${text}"\nReturn JSON: { "en": "${text}", ${langPlaceholders} }` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "label_translation",
                strict: false,
                schema: { type: "object", properties: langProps, required: langRequired, additionalProperties: false },
              },
            },
          });
          const content = res.choices?.[0]?.message?.content;
          let parsed: any = typeof content === "string" ? JSON.parse(content) : content;
          if (typeof parsed === "string") parsed = JSON.parse(parsed);
          // Ensure en is always the original
          return { en: text, ...parsed };
        } catch {
          return { en: text };
        }
      };

      // Helper: translate a list of option values in one call (returns { optValue: { en, ar?, tr? } })
      const translateOptions = async (options: Array<{ value: string; labelEn: string }>): Promise<Record<string, Record<string, string>>> => {
        if (options.length === 0) return {};
        try {
          const optSchema: Record<string, any> = {};
          for (const o of options) {
            optSchema[o.value] = { type: "object", properties: langProps, required: langRequired, additionalProperties: false };
          }
          const res = await invokeLLM({
            workloadId: "intake_form_translation",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Translate these option labels:\n${options.map((o) => `"${o.value}": "${o.labelEn}"`).join("\n")}\nReturn JSON: { ${options.map((o) => `"${o.value}": { "en": "${o.labelEn}", ${langPlaceholders} }`).join(", ")} }` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "options_translation",
                strict: false,
                schema: { type: "object", properties: optSchema, required: options.map((o) => o.value), additionalProperties: false },
              },
            },
          });
          const content = res.choices?.[0]?.message?.content;
          let parsed: any = typeof content === "string" ? JSON.parse(content) : content;
          if (typeof parsed === "string") parsed = JSON.parse(parsed);
          // Ensure en values are always the original
          const result: Record<string, Record<string, string>> = {};
          for (const o of options) {
            result[o.value] = { en: o.labelEn, ...(parsed?.[o.value] ?? {}) };
          }
          return result;
        } catch {
          const result: Record<string, Record<string, string>> = {};
          for (const o of options) result[o.value] = { en: o.labelEn };
          return result;
        }
      };

      // Build list of translation tasks — one per field label, one per options group
      // We store the fieldId alongside each task so we can map results back without relying on LLM keys
      type FieldTask = { fieldId: string; labelEn: string; options?: Array<{ value: string; labelEn: string }> };
      const fieldTasks: FieldTask[] = fieldIds
        .map((id) => {
          const def = FIELD_CATALOG.find((f) => f.id === id);
          if (!def) return null;
          return {
            fieldId: id,
            labelEn: def.labelEn,
            options: def.options?.map((v) => ({ value: v, labelEn: OPTION_LABELS[v] ?? v })) ?? [],
          };
        })
        .filter(Boolean) as FieldTask[];

      // ─── CALL 1: Meta (title + subtitle + steps) ───
      const stepsSection = stepsWithTitles.length > 0
        ? `\n\nSteps to translate:\n${JSON.stringify(stepsWithTitles, null, 2)}`
        : "";
      const stepsReturnNote = stepsWithTitles.length > 0
        ? `,\n  "steps": { [stepId]: { "title"?: { "en": "...", ${langPlaceholders} }, "subtitle"?: { "en": "...", ${langPlaceholders} }, "decisionTitle"?: { "en": "...", ${langPlaceholders} }, "decisionSubtitle"?: { "en": "...", ${langPlaceholders} }, "buttons"?: { [buttonLabel]: { "en": "...", ${langPlaceholders} } } } }`
        : "";
      const metaPrompt = `Generate a welcoming title and subtitle for a fertility clinic intake form named "${formName ?? "Fertility Intake Form"}"${stepsSection ? " and translate the following steps" : ""}.${stepsSection}\nReturn JSON:\n{\n  "title": { "en": "...", ${langPlaceholders} },\n  "subtitle": { "en": "...", ${langPlaceholders} }${stepsReturnNote}\n}${stepsWithTitles.length > 0 ? "\nFor regular steps, translate title and subtitle. For decision steps (type=decision), translate decisionTitle, decisionSubtitle, and each button label." : ""}`;

      // ─── CALLS 2+: One label call + one options call per field (all in parallel) ───
      // Group fields with options to translate options together per field
      const allPromises: Promise<void>[] = [];
      const translations: Record<string, Record<string, string>> = {};

      for (const task of fieldTasks) {
        // Label translation
        allPromises.push(
          translateText(task.labelEn).then((result) => {
            translations[task.fieldId] = result; // key is always task.fieldId — no LLM key mismatch
          })
        );
        // Options translation (if any)
        if (task.options && task.options.length > 0) {
          allPromises.push(
            translateOptions(task.options).then((optResults) => {
              for (const [optValue, optTrans] of Object.entries(optResults)) {
                translations[`${task.fieldId}__opt__${optValue}`] = optTrans;
              }
            })
          );
        }
      }

      // Meta call
      // Build steps schema if we have steps to translate
      const stepsSchemaProps: Record<string, any> = {};
      for (const s of stepsWithTitles) {
        const stepProps: Record<string, any> = {};
        if (s.title) stepProps.title = { type: "object", properties: langProps, required: langRequired, additionalProperties: false };
        if (s.subtitle) stepProps.subtitle = { type: "object", properties: langProps, required: langRequired, additionalProperties: false };
        if (s.decisionTitle) stepProps.decisionTitle = { type: "object", properties: langProps, required: langRequired, additionalProperties: false };
        if (s.decisionSubtitle) stepProps.decisionSubtitle = { type: "object", properties: langProps, required: langRequired, additionalProperties: false };
        if (s.buttons && s.buttons.length > 0) {
          const btnProps: Record<string, any> = {};
          for (const btn of s.buttons) btnProps[btn.label] = { type: "object", properties: langProps, required: langRequired, additionalProperties: false };
          stepProps.buttons = { type: "object", properties: btnProps, required: s.buttons.map((b) => b.label), additionalProperties: false };
        }
        if (Object.keys(stepProps).length > 0) stepsSchemaProps[s.id] = { type: "object", properties: stepProps, additionalProperties: true };
      }
      const metaSchemaProperties: Record<string, any> = {
        title: { type: "object", properties: langProps, required: langRequired, additionalProperties: false },
        subtitle: { type: "object", properties: langProps, required: langRequired, additionalProperties: false },
      };
      if (Object.keys(stepsSchemaProps).length > 0) {
        metaSchemaProperties.steps = { type: "object", properties: stepsSchemaProps, additionalProperties: true };
      }
      let parsedMeta: any = {};
      const metaPromise = invokeLLM({
        workloadId: "structured_json_generation",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: metaPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "intake_meta_translations",
            strict: false,
            schema: {
              type: "object",
              properties: metaSchemaProperties,
              required: ["title", "subtitle"],
              additionalProperties: true,
            },
          },
        },
      }).then((res) => {
        try {
          const content = res.choices?.[0]?.message?.content;
          parsedMeta = typeof content === "string" ? JSON.parse(content) : content;
          if (typeof parsedMeta === "string") parsedMeta = JSON.parse(parsedMeta);
        } catch { parsedMeta = {}; }
      }).catch(() => { parsedMeta = {}; });

      // Run everything in parallel
      await Promise.all([...allPromises, metaPromise]);

      // Build step translations map
      const stepTranslations: Record<string, {
        title?: Record<string, string>;
        subtitle?: Record<string, string>;
        decisionTitle?: Record<string, string>;
        decisionSubtitle?: Record<string, string>;
        buttons?: Record<string, Record<string, string>>;
      }> = {};
      if (parsedMeta.steps) {
        for (const [stepId, stepData] of Object.entries(parsedMeta.steps as Record<string, any>)) {
          stepTranslations[stepId] = {};
          if ((stepData as any).title) stepTranslations[stepId].title = { ...(stepData as any).title };
          if ((stepData as any).subtitle) stepTranslations[stepId].subtitle = { ...(stepData as any).subtitle };
          if ((stepData as any).decisionTitle) stepTranslations[stepId].decisionTitle = { ...(stepData as any).decisionTitle };
          if ((stepData as any).decisionSubtitle) stepTranslations[stepId].decisionSubtitle = { ...(stepData as any).decisionSubtitle };
          if ((stepData as any).buttons) stepTranslations[stepId].buttons = { ...(stepData as any).buttons };
        }
      }

      return {
        translations,
        titleTranslations: parsedMeta.title as Record<string, string>,
        subtitleTranslations: parsedMeta.subtitle as Record<string, string>,
        stepTranslations,
      };
    }),
});
