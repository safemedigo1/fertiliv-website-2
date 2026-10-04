import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, CheckCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const [accessToken, setAccessToken] = useState("");
  const [ready, setReady] = useState<"checking" | "yes" | "no">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("access_token");
    const type = hash.get("type");
    if (token && token.length >= 20 && token.length <= 8192 && (!type || type === "recovery")) {
      setAccessToken(token);
      setReady("yes");
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    setReady("no");
  }, []);

  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setDone(true),
    onError: (err) => toast.error(err.message || "Failed to reset password"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8 || password.length > 72) return toast.error("Password must be 8 to 72 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    if (!accessToken) return toast.error("Invalid reset link");
    resetMutation.mutate({ accessToken, password });
  };

  if (ready === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <p className="text-muted-foreground">Checking the reset link...</p>
      </div>
    );
  }

  if (ready === "no") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-bold text-red-600 mb-2">Invalid link</h2>
          <p className="text-muted-foreground mb-6">This password reset link is missing or malformed.</p>
          <Link href="/login"><Button variant="outline">Back to sign in</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#1E0566] flex-col justify-between p-12 text-white">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white font-bold text-lg">F</span>
            </div>
            <span className="text-xl font-bold">Fertiliv IVF Center</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Create a new<br />password
          </h1>
          <p className="text-white/70 text-lg">
            Choose a strong password to keep your account secure.
          </p>
        </div>
        <p className="text-white/40 text-sm">© 2026 Fertiliv IVF Center. All rights reserved.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          {!done ? (
            <>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
              <h2 className="text-2xl font-bold text-[#1E0566] mb-2">Set new password</h2>
              <p className="text-muted-foreground mb-8">
                Your new password must be at least 8 characters.
              </p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPw ? "text" : "password"}
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                      required
                      minLength={8}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type={showPw ? "text" : "password"}
                    placeholder="Repeat your new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-[#1E0566] hover:bg-[#2a0880] text-white"
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending ? "Saving..." : "Set new password"}
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-[#1E0566] mb-2">Password updated!</h2>
              <p className="text-muted-foreground mb-8">
                Your password has been changed successfully. You can now sign in with your new password.
              </p>
              <Button
                className="bg-[#1E0566] hover:bg-[#2a0880] text-white"
                onClick={() => navigate("/login")}
              >
                Sign in
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
