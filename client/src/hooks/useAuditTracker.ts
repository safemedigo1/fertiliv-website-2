import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Tracks page visits (with dwell time) and key button clicks.
 * Mount once inside the authenticated shell (ProtectedApp / FertilizLayout).
 */
export function useAuditTracker() {
  const [location] = useLocation();
  const { user } = useAuth();
  const trackMutation = trpc.audit.track.useMutation();
  const pageEnterTime = useRef<number>(Date.now());
  const lastPage = useRef<string>("");

  // Map raw path to a human-readable page name
  const pageName = useCallback((path: string): string => {
    if (path === "/" || path === "") return "Dashboard";
    if (path.startsWith("/patients/")) return "Patient Detail";
    if (path.startsWith("/leads/")) return "Lead Detail";
    const map: Record<string, string> = {
      "/calendar": "Calendar",
      "/patients": "Patients",
      "/leads": "Leads",
      "/services": "Services",
      "/finance": "Finance",
      "/lab": "Lab",
      "/analytics": "Analytics",
      "/notifications": "Notifications",
      "/users": "User Management",
      "/doctors": "Doctors",
      "/treatment-packages": "Treatment Packages",
      "/settings": "Settings",
      "/availability": "Availability",
      "/audit-log": "Audit Log",
    };
    return map[path] ?? path;
  }, []);

  useEffect(() => {
    if (!user) return;

    const currentPage = pageName(location);

    // Log leave of previous page with duration
    if (lastPage.current && lastPage.current !== currentPage) {
      const durationMs = Date.now() - pageEnterTime.current;
      trackMutation.mutate({
        action: "page_leave",
        page: lastPage.current,
        durationMs,
      });
    }

    // Log entry to new page
    trackMutation.mutate({
      action: "page_visit",
      page: currentPage,
    });

    lastPage.current = currentPage;
    pageEnterTime.current = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, user?.id]);

  // Log page leave on tab close / navigation away
  useEffect(() => {
    if (!user) return;

    const handleBeforeUnload = () => {
      const durationMs = Date.now() - pageEnterTime.current;
      // Use sendBeacon for reliability on unload
      const payload = JSON.stringify({
        "0": {
          json: {
            action: "page_leave",
            page: lastPage.current,
            durationMs,
          },
        },
      });
      navigator.sendBeacon?.("/api/trpc/audit.track", new Blob([payload], { type: "application/json" }));
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user?.id]);

  /**
   * Call this on important button clicks:
   * trackClick("Create Patient", "Patients")
   */
  const trackClick = useCallback(
    (detail: string, page?: string) => {
      if (!user) return;
      trackMutation.mutate({
        action: "click",
        page: page ?? pageName(location),
        detail,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, location]
  );

  return { trackClick };
}
