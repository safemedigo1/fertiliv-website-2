/**
 * Shared constants for Patient module dropdowns.
 * Used by both the server (validation) and the client (UI dropdowns).
 */

export const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia",
  "Australia", "Austria", "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium",
  "Bolivia", "Bosnia and Herzegovina", "Brazil", "Bulgaria", "Cambodia", "Cameroon",
  "Canada", "Chile", "China", "Colombia", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Denmark", "Ecuador", "Egypt", "Estonia", "Ethiopia", "Finland", "France", "Georgia",
  "Germany", "Ghana", "Greece", "Hungary", "India", "Indonesia", "Iran", "Iraq",
  "Ireland", "Israel", "Italy", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kosovo",
  "Kuwait", "Kyrgyzstan", "Latvia", "Lebanon", "Libya", "Lithuania", "Luxembourg",
  "Malaysia", "Malta", "Mexico", "Moldova", "Mongolia", "Montenegro", "Morocco",
  "Netherlands", "New Zealand", "Nigeria", "North Macedonia", "Norway", "Oman",
  "Pakistan", "Palestine", "Panama", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Saudi Arabia", "Senegal", "Serbia", "Singapore",
  "Slovakia", "Slovenia", "Somalia", "South Africa", "South Korea", "Spain",
  "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan",
  "Tanzania", "Thailand", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uzbekistan",
  "Venezuela", "Vietnam", "Yemen", "Zimbabwe",
] as const;

export type Country = (typeof COUNTRIES)[number];

export const LANGUAGES = [
  { code: "ar", label: "Arabic" },
  { code: "az", label: "Azerbaijani" },
  { code: "bn", label: "Bengali" },
  { code: "zh", label: "Chinese (Mandarin)" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "fa", label: "Farsi / Persian" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "French" },
  { code: "ka", label: "Georgian" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "hu", label: "Hungarian" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "kk", label: "Kazakh" },
  { code: "ko", label: "Korean" },
  { code: "ku", label: "Kurdish" },
  { code: "ms", label: "Malay" },
  { code: "no", label: "Norwegian" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sr", label: "Serbian" },
  { code: "sk", label: "Slovak" },
  { code: "es", label: "Spanish" },
  { code: "sv", label: "Swedish" },
  { code: "tg", label: "Tajik" },
  { code: "th", label: "Thai" },
  { code: "tr", label: "Turkish" },
  { code: "tk", label: "Turkmen" },
  { code: "uk", label: "Ukrainian" },
  { code: "ur", label: "Urdu" },
  { code: "uz", label: "Uzbek" },
  { code: "vi", label: "Vietnamese" },
] as const;

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const CONTACT_METHODS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone Call" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "video_call", label: "Video Call" },
  { value: "in_person", label: "In Person" },
] as const;

export type ContactMethod = (typeof CONTACT_METHODS)[number]["value"];
