/**
 * dbError.ts
 * Converts raw MySQL / TiDB errors into friendly TRPCError messages.
 *
 * Usage:
 *   import { handleDbError } from "./dbError";
 *   try { ... } catch (e) { throw handleDbError(e); }
 *
 * Or wrap an async function:
 *   export const myFn = withDbError(async () => { ... });
 */

import { TRPCError } from "@trpc/server";

// ── MySQL / TiDB error codes ──────────────────────────────────────────────────
const MYSQL_DUPLICATE_ENTRY = "ER_DUP_ENTRY";           // 1062
const MYSQL_NO_REFERENCED_ROW = "ER_NO_REFERENCED_ROW"; // 1216 / 1452
const MYSQL_NO_REFERENCED_ROW_2 = "ER_NO_REFERENCED_ROW_2";
const MYSQL_ROW_IS_REFERENCED = "ER_ROW_IS_REFERENCED"; // 1217 / 1451
const MYSQL_ROW_IS_REFERENCED_2 = "ER_ROW_IS_REFERENCED_2";
const MYSQL_DATA_TOO_LONG = "ER_DATA_TOO_LONG";         // 1406
const MYSQL_BAD_NULL_ERROR = "ER_BAD_NULL_ERROR";        // 1048
const MYSQL_TRUNCATED_WRONG = "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD"; // 1366
const MYSQL_LOCK_DEADLOCK = "ER_LOCK_DEADLOCK";          // 1213
const MYSQL_LOCK_WAIT_TIMEOUT = "ER_LOCK_WAIT_TIMEOUT";  // 1205
const MYSQL_ACCESS_DENIED = "ER_ACCESS_DENIED_ERROR";    // 1045
const MYSQL_NO_SUCH_TABLE = "ER_NO_SUCH_TABLE";          // 1146
const MYSQL_TABLE_EXISTS = "ER_TABLE_EXISTS_ERROR";      // 1050

// ── Friendly message map ──────────────────────────────────────────────────────
function friendlyMessage(code: string, rawMessage: string): string {
  switch (code) {
    case MYSQL_DUPLICATE_ENTRY: {
      // Try to extract the field name from the key name in the error message
      // e.g. "Duplicate entry 'foo@bar.com' for key 'users.email'"
      const keyMatch = rawMessage.match(/for key ['`"][\w.]*?[.'`"]?([\w]+)['`"]/i);
      const fieldName = keyMatch?.[1]?.replace(/_/g, " ") ?? "value";
      // Capitalise first letter
      const label = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
      return `${label} already exists. Please use a different ${fieldName}.`;
    }
    case MYSQL_NO_REFERENCED_ROW:
    case MYSQL_NO_REFERENCED_ROW_2:
      return "The selected record no longer exists. Please refresh and try again.";
    case MYSQL_ROW_IS_REFERENCED:
    case MYSQL_ROW_IS_REFERENCED_2:
      return "This record cannot be deleted because it is linked to other data. Remove the linked records first.";
    case MYSQL_DATA_TOO_LONG:
      return "One of the values you entered is too long. Please shorten it and try again.";
    case MYSQL_BAD_NULL_ERROR:
      return "A required field is missing. Please fill in all required fields.";
    case MYSQL_TRUNCATED_WRONG:
      return "One of the values you entered is in an invalid format. Please check the form and try again.";
    case MYSQL_LOCK_DEADLOCK:
      return "The server is busy processing another request. Please try again in a moment.";
    case MYSQL_LOCK_WAIT_TIMEOUT:
      return "The request timed out. Please try again.";
    case MYSQL_ACCESS_DENIED:
      return "Database access was denied. Please contact your administrator.";
    case MYSQL_NO_SUCH_TABLE:
      return "A required database table is missing. Please contact your administrator.";
    case MYSQL_TABLE_EXISTS:
      return "A database table conflict occurred. Please contact your administrator.";
    default:
      return "An unexpected database error occurred. Please try again or contact support.";
  }
}

// ── Core handler ─────────────────────────────────────────────────────────────
export function handleDbError(error: unknown): TRPCError {
  // If it's already a TRPCError, pass it through unchanged
  if (error instanceof TRPCError) return error;

  const e = error as any;
  const code: string = e?.code ?? e?.errno ?? "";
  const rawMessage: string = e?.message ?? String(error);

  // Determine HTTP-level code for tRPC
  let trpcCode: TRPCError["code"] = "INTERNAL_SERVER_ERROR";
  if (code === MYSQL_DUPLICATE_ENTRY) trpcCode = "CONFLICT";
  if (
    code === MYSQL_NO_REFERENCED_ROW ||
    code === MYSQL_NO_REFERENCED_ROW_2
  ) trpcCode = "BAD_REQUEST";
  if (
    code === MYSQL_ROW_IS_REFERENCED ||
    code === MYSQL_ROW_IS_REFERENCED_2
  ) trpcCode = "PRECONDITION_FAILED";
  if (code === MYSQL_BAD_NULL_ERROR || code === MYSQL_DATA_TOO_LONG) trpcCode = "BAD_REQUEST";

  const message = friendlyMessage(code, rawMessage);

  // Log the raw error server-side so it's not lost
  console.error("[DB Error]", code, rawMessage);

  return new TRPCError({ code: trpcCode, message });
}

// ── Convenience wrapper ───────────────────────────────────────────────────────
export async function withDbError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw handleDbError(e);
  }
}
