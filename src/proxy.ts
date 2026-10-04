import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/intake",
  "/intake-legacy",
  "/dicom-viewer",
  "/api",
  "/_next",
  "/favicon.ico",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    pathname.includes(".");
  if (isPublic) return NextResponse.next();
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.redirect(loginUrl(request));

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("cookie") ?? "");
      },
      setAll(cookies, headers) {
        cookies.forEach((cookie) => {
          request.cookies.set(cookie.name, cookie.value);
          response.cookies.set(cookie.name, cookie.value, {
            ...cookie.options,
            httpOnly: true,
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
        });
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (data.user) return response;
  return NextResponse.redirect(loginUrl(request));
}

function loginUrl(request: NextRequest) {
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return login;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
