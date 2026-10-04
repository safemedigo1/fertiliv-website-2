/**
 * Converts a tRPC / Zod error into a friendly, human-readable string.
 *
 * When the server returns a BAD_REQUEST with Zod validation issues the raw
 * `e.message` is a JSON array like:
 *   [{ "path": ["email"], "message": "Invalid email address", "code": "invalid_format" }]
 *
 * This helper extracts those messages and formats them nicely, e.g.:
 *   "email: Please enter a valid email address."
 *
 * For all other errors it falls back to the original message or a generic string.
 */

const FRIENDLY: Record<string, string> = {
  // Zod format codes
  invalid_format: "Please enter a valid value.",
  too_small: "This field is too short.",
  too_big: "This field is too long.",
  invalid_type: "Invalid value provided.",
  invalid_enum_value: "Please select a valid option.",
  // Field-specific overrides
  "email:invalid_format": "Please enter a valid email address (e.g. name@example.com).",
  "email:invalid_type": "Email is required.",
  "password:too_small": "Password must be at least 8 characters.",
  "newPassword:too_small": "New password must be at least 8 characters.",
};

interface ZodIssue {
  path?: (string | number)[];
  message?: string;
  code?: string;
  format?: string;
}

export function parseTrpcError(e: unknown): string {
  if (!e || typeof e !== "object") return "Something went wrong. Please try again.";

  const err = e as { message?: string; data?: { zodError?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } } };

  // 1. Try tRPC's structured zodError (fieldErrors / formErrors)
  const zodError = err?.data?.zodError;
  if (zodError) {
    const fieldMessages: string[] = [];
    if (zodError.fieldErrors) {
      for (const [field, msgs] of Object.entries(zodError.fieldErrors)) {
        if (msgs && msgs.length > 0) {
          const friendly = FRIENDLY[`${field}:${msgs[0]}`] ?? msgs[0];
          fieldMessages.push(`${capitalise(field)}: ${friendly}`);
        }
      }
    }
    if (zodError.formErrors && zodError.formErrors.length > 0) {
      fieldMessages.push(...zodError.formErrors);
    }
    if (fieldMessages.length > 0) return fieldMessages.join(" · ");
  }

  // 2. Try to parse raw JSON array in e.message (older Zod serialisation)
  const raw = err?.message ?? "";
  if (raw.trim().startsWith("[")) {
    try {
      const issues: ZodIssue[] = JSON.parse(raw);
      if (Array.isArray(issues) && issues.length > 0) {
        const parts = issues.map((issue) => {
          const field = issue.path?.join(".") ?? "";
          const code = issue.code ?? issue.format ?? "";
          const key = field ? `${field}:${code}` : code;
          const friendly =
            FRIENDLY[key] ??
            FRIENDLY[code] ??
            issue.message ??
            "Invalid value.";
          return field ? `${capitalise(field)}: ${friendly}` : friendly;
        });
        return parts.join(" · ");
      }
    } catch {
      // not JSON — fall through
    }
  }

  // 3. Plain string message — return as-is unless it looks like raw JSON
  if (raw && !raw.trim().startsWith("{") && !raw.trim().startsWith("[")) {
    return raw;
  }

  return "Something went wrong. Please try again.";
}

function capitalise(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
