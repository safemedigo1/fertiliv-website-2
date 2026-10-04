import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { handleDbError } from "../dbError";

// ── MySQL / TiDB error codes that need friendly messages ─────────────────────
const DB_ERROR_CODES = new Set([
  "ER_DUP_ENTRY",
  "ER_NO_REFERENCED_ROW",
  "ER_NO_REFERENCED_ROW_2",
  "ER_ROW_IS_REFERENCED",
  "ER_ROW_IS_REFERENCED_2",
  "ER_DATA_TOO_LONG",
  "ER_BAD_NULL_ERROR",
  "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ER_ACCESS_DENIED_ERROR",
  "ER_NO_SUCH_TABLE",
  "ER_TABLE_EXISTS_ERROR",
  "ER_BAD_FIELD_ERROR",       // Unknown column — schema/DB mismatch
  "ER_WARN_DATA_TRUNCATED",   // ENUM value not in allowed list
]);

function isDbError(e: unknown): boolean {
  const code = (e as any)?.code ?? "";
  return DB_ERROR_CODES.has(code);
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // Global error formatter: converts raw DB errors to friendly TRPCErrors
  errorFormatter({ shape, error }) {
    // If the original cause is a raw DB error, replace the message
    const cause = error.cause as any;
    // Direct DB error in cause
    if (cause && isDbError(cause)) {
      const friendly = handleDbError(cause);
      return {
        ...shape,
        message: friendly.message,
        data: { ...shape.data, code: friendly.code, httpStatus: shape.data.httpStatus },
      };
    }
    // DrizzleQueryError: the real DB error is in cause.cause
    const deepCause = cause?.cause;
    if (deepCause && isDbError(deepCause)) {
      const friendly = handleDbError(deepCause);
      return {
        ...shape,
        message: friendly.message,
        data: { ...shape.data, code: friendly.code, httpStatus: shape.data.httpStatus },
      };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ── Global DB error middleware ────────────────────────────────────────────────
// Wraps every procedure call and converts raw DB errors to friendly TRPCErrors
// before they reach the error formatter (so the message is always clean).
const dbErrorMiddleware = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    // Direct DB error
    if (isDbError(e)) throw handleDbError(e);
    // DrizzleQueryError wraps the real DB error in .cause
    const cause = (e as any)?.cause;
    if (cause && isDbError(cause)) throw handleDbError(cause);
    throw e;
  }
});

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Apply dbErrorMiddleware to all procedure types
export const protectedProcedure = t.procedure.use(dbErrorMiddleware).use(requireUser);
export const publicProcedureWithDbError = t.procedure.use(dbErrorMiddleware);

export const adminProcedure = t.procedure.use(dbErrorMiddleware).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
