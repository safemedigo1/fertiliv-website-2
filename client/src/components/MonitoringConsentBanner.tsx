/**
 * MonitoringConsentBanner
 *
 * Shown ONLY to staff and manager users on their first login on a device.
 * Explains the company monitoring policy and requests browser permissions.
 * Doctors and patients NEVER see this banner.
 *
 * IMPORTANT: We do NOT call getDisplayMedia here.
 * - getUserMedia (camera + mic) can be pre-authorized via a permission grant.
 * - getDisplayMedia (screen) CANNOT be pre-authorized — it always shows a
 *   browser picker popup and requires a fresh user gesture each time.
 *   Calling it here would immediately start screen sharing, which is wrong.
 * - Screen sharing will happen silently when the admin requests it at runtime
 *   (MonitoringAgent handles it then, not here).
 */
import { useState, useEffect } from "react";
import { Shield, Camera, Mic, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const CONSENT_KEY = "fertiliv_monitoring_consent_v1";

interface Props {
  userRole: string;
  userId: number;
}

export function MonitoringConsentBanner({ userRole, userId }: Props) {
  const [visible, setVisible] = useState(false);
  const [granting, setGranting] = useState(false);
  const [permResults, setPermResults] = useState<{ camera: boolean; mic: boolean } | null>(null);
  const logConsent = trpc.monitoring.logConsent.useMutation();

  const isMonitorable = userRole === "staff" || userRole === "manager";

  useEffect(() => {
    if (!isMonitorable) return;
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      setVisible(true);
    }
  }, [isMonitorable, userId]);

  if (!visible) return null;

  async function handleGrant() {
    setGranting(true);
    const results = { camera: false, mic: false };

    try {
      // Request camera + mic together first
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      }).catch(() => null);

      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        results.camera = true;
        results.mic = true;
      } else {
        // Try each separately if combined fails
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).catch(() => null);
        if (camStream) { camStream.getTracks().forEach(t => t.stop()); results.camera = true; }

        const micStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }).catch(() => null);
        if (micStream) { micStream.getTracks().forEach(t => t.stop()); results.mic = true; }
      }

      // NOTE: We intentionally do NOT call getDisplayMedia here.
      // Screen capture will be requested by MonitoringAgent only when admin
      // explicitly starts a screen monitoring session.

      setPermResults(results);

      // Save consent regardless of which permissions were granted
      await logConsent.mutateAsync({ userAgent: navigator.userAgent });

      localStorage.setItem(CONSENT_KEY, JSON.stringify({
        userId,
        consentedAt: new Date().toISOString(),
        permissions: { ...results, screen: null }, // screen handled at runtime
      }));

      // Close after showing success state briefly
      setTimeout(() => {
        setVisible(false);
        const granted = [
          results.camera && "camera",
          results.mic && "microphone",
        ].filter(Boolean).join(", ");
        toast.success(
          granted
            ? `Permissions granted (${granted}). Device registered under company policy.`
            : "Policy acknowledged. Device registered under company monitoring policy."
        );
      }, 1500);

    } catch {
      // Even if everything fails, still mark as consented (policy acknowledged)
      try {
        await logConsent.mutateAsync({ userAgent: navigator.userAgent });
        localStorage.setItem(CONSENT_KEY, JSON.stringify({
          userId,
          consentedAt: new Date().toISOString(),
          permissions: results,
        }));
      } catch {}
      setVisible(false);
      toast("Company policy acknowledged. Some permissions were not granted.");
    } finally {
      setGranting(false);
    }
  }

  function handleDismiss() {
    setVisible(false);
    toast("You will be asked again next session. Please grant permissions to comply with company policy.");
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-8 border border-border">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Shield className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Company Device Policy</h2>
            <p className="text-sm text-muted-foreground">Fertiliv IVF Center — IT Security</p>
          </div>
        </div>

        {/* Body */}
        {permResults ? (
          /* Success state */
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium text-sm">Permissions registered</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PermBadge icon={<Camera className="h-5 w-5" />} label="Camera" granted={permResults.camera} />
              <PermBadge icon={<Mic className="h-5 w-5" />} label="Microphone" granted={permResults.mic} />
            </div>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <p className="text-sm text-foreground leading-relaxed">
              This is a <strong>company-owned device</strong>. By using this system, you acknowledge that Fertiliv IVF Center
              may monitor activity on this device during working hours in accordance with company policy.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Monitoring may include screen activity, camera, and microphone access.
              All monitoring sessions are logged and are only accessible to authorized administrators.
            </p>

            {/* What will be monitored */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 text-center">
                <Camera className="h-5 w-5 text-purple-500" />
                <span className="text-xs text-muted-foreground">Camera</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 text-center">
                <Mic className="h-5 w-5 text-green-500" />
                <span className="text-xs text-muted-foreground">Microphone</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {!permResults && (
          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={handleGrant}
              disabled={granting}
            >
              {granting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Granting permissions…
                </span>
              ) : "I Understand & Grant Permissions"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleDismiss}
              title="Dismiss (will appear again next session)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mt-4">
          Your browser will ask for camera and microphone permission once. This dialog will not appear again on this device.
        </p>
      </div>
    </div>
  );
}

function PermBadge({ icon, label, granted }: { icon: React.ReactNode; label: string; granted: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-2 p-3 rounded-xl text-center ${granted ? "bg-green-50 dark:bg-green-900/20" : "bg-muted/50"}`}>
      <div className={granted ? "text-green-600" : "text-muted-foreground"}>{icon}</div>
      <span className="text-xs text-muted-foreground">{label}</span>
      {granted
        ? <span className="text-xs text-green-600 font-medium">✓ Granted</span>
        : <span className="text-xs text-muted-foreground">Denied</span>
      }
    </div>
  );
}
