type MetaLoginResponse = {
  authResponse?: { code?: string };
};

type MetaLoginOptions = {
  config_id: string;
  response_type: "code";
  override_default_response_type: true;
  extras: { setup: Record<string, never> };
};

type MetaSdk = {
  init: (input: { appId: string; version: string; xfbml: boolean; autoLogAppEvents: boolean }) => void;
  login: (callback: (response: MetaLoginResponse) => void, options: MetaLoginOptions) => void;
};

declare global {
  interface Window {
    FB?: MetaSdk;
  }
}

const META_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";

function isTrustedMetaOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "facebook.com" || hostname.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

/** Loads Meta's public JavaScript SDK. No authorization result is cached or logged. */
export async function loadMetaEmbeddedSignupSdk(input: { appId: string; graphApiVersion: string }): Promise<MetaSdk> {
  if (!window.FB) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${META_SDK_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("sdk_load_failed")), { once: true });
        if (window.FB) resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = META_SDK_SRC;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("sdk_load_failed"));
      document.head.appendChild(script);
    });
  }
  if (!window.FB) throw new Error("sdk_unavailable");
  window.FB.init({
    appId: input.appId,
    version: input.graphApiVersion,
    xfbml: false,
    autoLogAppEvents: false,
  });
  return window.FB;
}

export type MetaEmbeddedSignupSessionInfo = {
  event: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  businessPortfolioId: string | null;
  currentStep: string | null;
};

/** Parses only documented non-secret session metadata from a trusted Meta window event. */
export function parseMetaEmbeddedSignupMessage(event: MessageEvent): MetaEmbeddedSignupSessionInfo | null {
  if (!isTrustedMetaOrigin(event.origin)) return null;
  let payload: unknown = event.data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.type !== "WA_EMBEDDED_SIGNUP" || typeof record.event !== "string") return null;
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};
  const stringValue = (key: string) => typeof data[key] === "string" ? data[key] : null;
  return {
    event: record.event,
    wabaId: stringValue("waba_id"),
    phoneNumberId: stringValue("phone_number_id"),
    businessPortfolioId: stringValue("business_id"),
    currentStep: stringValue("current_step"),
  };
}

export function launchMetaEmbeddedSignup(input: {
  sdk: MetaSdk;
  configId: string;
  onResponse: (response: MetaLoginResponse) => void;
}): void {
  input.sdk.login(input.onResponse, {
    config_id: input.configId,
    response_type: "code",
    override_default_response_type: true,
    extras: { setup: {} },
  });
}
