import { Button } from "@/components/ui/button";
import { parseTrpcError } from "@/lib/errorUtils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Eye, EyeOff, Loader2, Lock, Mail, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const NAVY = "#1a1464";
const NAVY_LIGHT = "#2d2b8f";
const LAVENDER_BG = "#f0effa";
const LAVENDER_BORDER = "#c5c3e8";
const LAVENDER_TEXT = "#4a48a0";

export default function LoginPage() {
  const { data: owner, isLoading } = trpc.auth.ownerAccount.useQuery();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: LAVENDER_BG }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: NAVY }} />
      </div>
    );
  }
  if (owner && !owner.ready) return <OwnerSignup email={owner.email} />;
  return <LoginForm onSuccess={() => { window.location.href = "/"; }} />;
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const utils = trpc.useUtils();
  const [loginError, setLoginError] = useState<string | null>(null);
  const signIn = trpc.auth.signIn.useMutation();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!email || !password) return toast.error("Please fill in all fields");
    setPending(true);
    try {
      const data = await signIn.mutateAsync({ email, password });
      if (data?.user) {
        utils.auth.me.setData(undefined, {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
          avatarUrl: null,
          phone: null,
        });
      }
      toast.success("Welcome back!");
      onSuccess();
    } catch (error) {
      setLoginError(parseTrpcError(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12"
        style={{ background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_LIGHT} 60%, #1e1a6e 100%)` }}
      >
        <div>
          <img src="/manus-storage/fertiliv-logo-white_b3e66705.png" alt="Fertiliv IVF Center" className="h-12 object-contain" />
        </div>
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight" style={{ fontFamily: "'Nunito', sans-serif" }}>
              Streamlined care,<br />every step of the way.
            </h1>
            <p className="mt-4 text-indigo-200 text-lg leading-relaxed">
              Manage patients, appointments, lab results, and finances — all in one secure platform designed for fertility clinics.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Patients", value: "Managed" },
              { label: "Appointments", value: "Tracked" },
              { label: "Lab Results", value: "Organized" },
              { label: "Invoices", value: "Automated" },
            ].map(item => (
              <div key={item.label} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <p className="text-indigo-300 text-xs uppercase tracking-widest">{item.label}</p>
                <p className="text-white font-semibold mt-1">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-indigo-400 text-sm">© 2026 Fertiliv IVF Center. All rights reserved.</p>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-md space-y-7">
          <div className="flex lg:hidden justify-center mb-2">
            <img src="/manus-storage/logo-horizontal_b2b72959.png" alt="Fertiliv IVF Center" className="h-10 object-contain" />
          </div>
          <div>
            <h2 className="text-3xl font-bold" style={{ color: NAVY, fontFamily: "'Nunito', sans-serif" }}>Welcome back</h2>
            <p className="mt-2 text-muted-foreground text-sm">Sign in to access the Fertiliv clinic dashboard</p>
          </div>
          {loginError && (
            <div className={`rounded-xl p-4 text-sm border ${
              loginError.includes("pending") ? "bg-amber-50 border-amber-200 text-amber-800"
              : loginError.includes("rejected") ? "bg-red-50 border-red-200 text-red-800"
              : loginError.includes("deactivated") ? "bg-orange-50 border-orange-200 text-orange-800"
              : "bg-red-50 border-red-200 text-red-800"
            }`}>
              <p className="font-semibold mb-0.5">
                {loginError.includes("pending") ? "Account Pending Approval"
                 : loginError.includes("rejected") ? "Account Access Denied"
                 : loginError.includes("deactivated") ? "Account Deactivated" : "Login Failed"}
              </p>
              <p>{loginError}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" style={{ color: NAVY }}>Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="doctor@fertiliv.com" value={email}
                  onChange={e => setEmail(e.target.value)} className="pl-10"
                  style={{ borderColor: LAVENDER_BORDER }} autoComplete="email" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" style={{ color: NAVY }}>Password</Label>
                <Link href="/forgot-password" className="text-xs hover:underline" style={{ color: LAVENDER_TEXT }}>Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} className="pl-10 pr-10"
                  style={{ borderColor: LAVENDER_BORDER }} autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-11 text-base font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: NAVY, fontFamily: "'Nunito', sans-serif" }} disabled={pending}>
              {pending ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /> Signing in...</>) : "Sign in"}
            </Button>
          </form>
          <div className="rounded-xl p-4 text-sm" style={{ background: LAVENDER_BG, border: `1px solid ${LAVENDER_BORDER}`, color: NAVY }}>
            <p className="font-semibold mb-1">Need access?</p>
            <p className="text-xs" style={{ color: LAVENDER_TEXT }}>Contact your administrator to get your account credentials.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnerSignup({ email }: { email: string }) {
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [thirdName, setThirdName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const setup = trpc.auth.signUpOwner.useMutation({
    onSuccess: async (result) => {
      if (!result.signedIn) {
        toast.success("Admin account created. Sign in with that password.");
        window.location.href = "/login";
        return;
      }
      toast.success("Admin account created. Welcome to Fertiliv.");
      window.location.href = "/";
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return toast.error("First name is required");
    if (password !== confirm) return toast.error("Passwords do not match");
    if (password.length < 8 || password.length > 72) return toast.error("Password must be 8 to 72 characters");
    setup.mutate({ firstName: firstName.trim(), secondName: secondName.trim() || undefined, thirdName: thirdName.trim() || undefined, password });
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: LAVENDER_BG, fontFamily: "'Nunito', sans-serif" }}>
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <img src="/manus-storage/logo-horizontal_b2b72959.png" alt="Fertiliv IVF Center" className="h-12 object-contain" />
        </div>
        <Card className="shadow-xl" style={{ borderColor: LAVENDER_BORDER }}>
          <CardHeader className="text-center pb-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: LAVENDER_BG }}>
              <Shield className="h-6 w-6" style={{ color: NAVY }} />
            </div>
            <CardTitle className="text-2xl" style={{ color: NAVY, fontFamily: "'Nunito', sans-serif" }}>Welcome to Fertiliv</CardTitle>
            <CardDescription className="text-base">Create the clinic owner account. This clinic is closed to public sign-up.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="setup-first">First Name *</Label>
                  <Input id="setup-first" placeholder="First" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setup-middle">Middle Name</Label>
                  <Input id="setup-middle" placeholder="Middle" value={secondName} onChange={e => setSecondName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setup-last">Last Name</Label>
                  <Input id="setup-last" placeholder="Last" value={thirdName} onChange={e => setThirdName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="setup-email" type="email" value={email} readOnly className="pl-10 bg-muted" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-password">Password <span className="text-muted-foreground text-xs">(min. 8 characters)</span></Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="setup-password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} className="pl-10 pr-10" required minLength={8} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-confirm">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="setup-confirm" type={showPassword ? "text" : "password"} placeholder="••••••••"
                    value={confirm} onChange={e => setConfirm(e.target.value)} className="pl-10" required />
                </div>
              </div>
              <Button type="submit" className="w-full h-11 text-base font-semibold text-white mt-2 transition-opacity hover:opacity-90"
                style={{ background: NAVY }} disabled={setup.isPending}>
                {setup.isPending ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating account...</>) : "Create Admin Account & Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          This screen is only for the clinic owner. Staff accounts are created by an administrator.
        </p>
      </div>
    </div>
  );
}
