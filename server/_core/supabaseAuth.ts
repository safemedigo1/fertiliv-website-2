import { createClient, type SupabaseClient, type User as AuthUser } from "@supabase/supabase-js";
import { createServerClient, parseCookieHeader, type CookieOptions } from "@supabase/ssr";
import type { Request, Response } from "express";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthEnv = { url: string; publishable: string; service: string };

let missingEnvLogged = false;
let adminClient: SupabaseClient | null = null;

function readAuthEnv(): AuthEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !publishable || !service) {
    if (!missingEnvLogged) {
      missingEnvLogged = true;
      console.error("[auth] Supabase URL, publishable key, or service role key is missing");
    }
    return null;
  }
  return { url, publishable, service };
}

function requireAuthEnv(): AuthEnv {
  const env = readAuthEnv();
  if (!env) throw new Error("AUTH_NOT_CONFIGURED");
  return env;
}

/** Service-role client. It never keeps a user session. */
export function supabaseAdmin(): SupabaseClient {
  const env = requireAuthEnv();
  if (!adminClient) {
    adminClient = createClient(env.url, env.service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

function expressCookieOptions(options: CookieOptions): CookieOptions {
  const next = { ...options };
  // The cookie package records maxAge in seconds. Express records it in milliseconds.
  if (typeof next.maxAge === "number") next.maxAge = Math.round(next.maxAge * 1000);
  next.httpOnly = true;
  next.path = "/";
  next.sameSite = "lax";
  next.secure = process.env.NODE_ENV === "production";
  return next;
}

export function supabaseForRequest(req: Request, res: Response) {
  const env = requireAuthEnv();
  return createServerClient(env.url, env.publishable, {
    cookies: {
      getAll() {
        return parseCookieHeader(req.headers.cookie ?? "");
      },
      setAll(cookies, headers) {
        for (const cookie of cookies) {
          res.cookie(cookie.name, cookie.value, expressCookieOptions(cookie.options));
        }
        for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
      },
    },
  });
}

/** Verifies the caller with Supabase Auth. A cookie alone is not accepted. */
export async function supabaseUserFromRequest(req: Request, res: Response): Promise<AuthUser | null> {
  if (!readAuthEnv()) return null;
  const supabase = supabaseForRequest(req, res);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id || !data.user.email) return null;
  if (!UUID_PATTERN.test(data.user.id)) return null;
  return data.user;
}

export async function signOutFromRequest(req: Request, res: Response) {
  if (!readAuthEnv()) return;
  const supabase = supabaseForRequest(req, res);
  await supabase.auth.signOut();
}

export function assertPassword(password: string) {
  if (password.length < 8 || password.length > 72 || password.includes("\0")) {
    throw new Error("WEAK_PASSWORD");
  }
}

export async function createConfirmedAuthUser(input: { email: string; password: string; name: string }): Promise<AuthUser> {
  assertPassword(input.password);
  const email = input.email.trim().toLowerCase();
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name.slice(0, 120) },
  });
  if (error || !data.user) {
    const duplicate = /already|registered|exists/i.test(error?.message ?? "");
    console.info("[auth] create user rejected", { status: error?.status ?? 0, duplicate });
    throw new Error(duplicate ? "EMAIL_IN_USE" : "AUTH_CREATE_FAILED");
  }
  console.info("[auth] auth user created");
  return data.user;
}

export async function deleteAuthUser(authUserId: string) {
  const { error } = await supabaseAdmin().auth.admin.deleteUser(authUserId);
  if (error) console.info("[auth] auth user cleanup failed", { status: error.status ?? 0 });
}

export async function setAuthPassword(authUserId: string, password: string) {
  assertPassword(password);
  const { error } = await supabaseAdmin().auth.admin.updateUserById(authUserId, { password });
  if (error) {
    console.info("[auth] password update rejected", { status: error.status ?? 0 });
    throw new Error("PASSWORD_UPDATE_FAILED");
  }
}

export async function updateAuthEmail(authUserId: string, email: string) {
  const { error } = await supabaseAdmin().auth.admin.updateUserById(authUserId, { email: email.trim().toLowerCase() });
  if (error) {
    console.info("[auth] email update rejected", { status: error.status ?? 0 });
    throw new Error("EMAIL_UPDATE_FAILED");
  }
}

/** Confirms the current password without storing the resulting session. */
export async function passwordMatches(email: string, password: string): Promise<boolean> {
  const env = requireAuthEnv();
  const client = createClient(env.url, env.publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  return !error;
}

/** Used only when owner signup finds an Auth user that is not linked yet. */
export async function signInForLink(email: string, password: string): Promise<AuthUser | null> {
  const env = requireAuthEnv();
  const client = createClient(env.url, env.publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.user?.id || !UUID_PATTERN.test(data.user.id)) return null;
  return data.user;
}

export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const env = requireAuthEnv();
  const url = new URL("/auth/v1/admin/users", env.url);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", "20");
  url.searchParams.set("filter", email.trim().toLowerCase());
  const response = await fetch(url, {
    headers: { apikey: env.service, Authorization: `Bearer ${env.service}` },
  });
  if (!response.ok) {
    console.info("[auth] user lookup failed", { status: response.status });
    return null;
  }
  const body = (await response.json()) as { users?: { id?: string; email?: string | null }[] };
  const match = body.users?.find((user) => user.email?.toLowerCase() === email.trim().toLowerCase());
  return match?.id && UUID_PATTERN.test(match.id) ? match.id : null;
}

export async function sendPasswordReset(email: string, redirectTo: string) {
  const env = requireAuthEnv();
  const client = createClient(env.url, env.publishable, {
    auth: { autoRefreshToken: false, persistSession: false, flowType: "implicit" },
  });
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) console.info("[auth] password reset email rejected", { status: error.status ?? 0 });
}

export function requestOrigin(req: Request): string | null {
  const forwardedHost = req.headers["x-forwarded-host"];
  const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const host = (hostHeader ?? req.headers.host ?? "").split(",")[0]?.trim() ?? "";
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protoRaw = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const proto = (protoRaw ?? req.protocol ?? "https").split(",")[0]?.trim();
  if (proto !== "http" && proto !== "https") return null;
  return `${proto}://${host}`;
}
