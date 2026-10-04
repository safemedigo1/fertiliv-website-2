import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { resolveClinicUserFromRequest } from "./clinicSession";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  if (opts.req.cookies?.[COOKIE_NAME]) {
    opts.res.clearCookie(COOKIE_NAME, { path: "/", httpOnly: true, sameSite: "lax" });
  }
  const user = await resolveClinicUserFromRequest(opts.req, opts.res);
  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
