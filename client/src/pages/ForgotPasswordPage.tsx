import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const forgotMutation = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => setSent(true),
    onError: (err) => toast.error(err.message || "Failed to send reset email"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error("Please enter your email address");
    forgotMutation.mutate({ email: email.trim() });
  };

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
            Forgot your<br />password?
          </h1>
          <p className="text-white/70 text-lg">
            No worries — we'll send you a secure reset link to your email address.
          </p>
        </div>
        <p className="text-white/40 text-sm">© 2026 Fertiliv IVF Center. All rights reserved.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          {!sent ? (
            <>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
              <h2 className="text-2xl font-bold text-[#1E0566] mb-2">Reset password</h2>
              <p className="text-muted-foreground mb-8">
                Enter the email address linked to your account and we'll send you a reset link.
              </p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-[#1E0566] hover:bg-[#2a0880] text-white"
                  disabled={forgotMutation.isPending}
                >
                  {forgotMutation.isPending ? "Sending..." : "Send reset link"}
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-[#1E0566] mb-2">Check your email</h2>
              <p className="text-muted-foreground mb-2">
                If an account exists for <strong>{email}</strong>, we've sent a password reset link.
              </p>
              <p className="text-sm text-muted-foreground mb-8">
                The link expires in 1 hour. Check your spam folder if you don't see it.
              </p>
              <Link href="/login">
                <Button variant="outline" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
