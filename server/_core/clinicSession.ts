import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";
import { linkSupabaseIdentity } from "../db";
import { signOutFromRequest, supabaseUserFromRequest } from "./supabaseAuth";

function displayName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || !("name" in metadata)) return null;
  const name = (metadata as { name?: unknown }).name;
  if (typeof name !== "string") return null;
  const cleaned = name.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 120);
  return cleaned || null;
}

/**
 * Turns a verified Supabase session into a clinic user.
 * Someone with a Supabase account but no clinic row is signed out and gets no data.
 */
export async function resolveClinicUserFromRequest(req: Request, res: Response): Promise<User | null> {
  try {
    const authUser = await supabaseUserFromRequest(req, res);
    if (!authUser?.email) return null;
    const linked = await linkSupabaseIdentity({
      id: authUser.id,
      email: authUser.email,
      name: displayName(authUser.user_metadata),
    });
    if (linked.status !== "ok") {
      await signOutFromRequest(req, res);
      console.info("[auth] closed clinic rejected a Supabase session", { status: linked.status });
      return null;
    }
    return linked.user;
  } catch (error) {
    const unavailable = error instanceof Error && error.message === "DB_UNAVAILABLE";
    console.info("[auth] clinic session unavailable", { unavailable });
    return null;
  }
}
