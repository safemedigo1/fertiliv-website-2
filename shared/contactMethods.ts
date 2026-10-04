/**
 * Unified contact method enum shared between Lead and Patient forms.
 * All 5 values are supported by both forms. Unknown stored values are
 * preserved as-is by the MultiSelect component and are not dropped.
 *
 * IMPORTANT: Do not remove values from this list without a DB migration
 * to update existing records that may store the removed value.
 */
export const CONTACT_METHODS: { value: string; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone",    label: "Phone Call" },
  { value: "email",    label: "Email" },
  { value: "sms",      label: "SMS" },
  { value: "telegram", label: "Telegram" },
];

export type ContactMethod = (typeof CONTACT_METHODS)[number]["value"];
