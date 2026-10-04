import { useAuth } from "@/_core/hooks/useAuth";
import type { WeeklySchedule } from "@/components/WeeklyScheduleEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { WeeklyScheduleEditor } from "@/components/WeeklyScheduleEditor";
import { UserCircle, Languages, Briefcase, Lock, Camera } from "lucide-react";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "tr", label: "Turkish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "ru", label: "Russian" },
  { value: "fa", label: "Persian" },
];

export default function StaffMyProfilePage() {
  const { user } = useAuth();

  // Profile state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [primaryLanguage, setPrimaryLanguage] = useState("");

  // Weekly schedule state
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>({});
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Load current profile
  const { data: meData } = trpc.auth.me.useQuery();
  const { data: profileData } = trpc.users.getOwnProfile.useQuery();

  useEffect(() => {
    if (profileData) {
      setName(profileData.name ?? "");
      setPhone(profileData.phone ?? "");
      setJobTitle(profileData.jobTitle ?? "");
      setLanguages(profileData.languages ?? []);
      setPrimaryLanguage(profileData.primaryLanguage ?? "");
      setWeeklySchedule(profileData.weeklySchedule ?? {});
      setSlotDurationMinutes(profileData.slotDurationMinutes ?? 30);
    }
  }, [profileData]);

  const utils = trpc.useUtils();

  const updateProfile = trpc.users.updateOwnProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated successfully");
      utils.auth.me.invalidate();
      utils.users.getOwnProfile.invalidate();
      utils.users.getWeeklySchedule.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update profile");
    },
  });

  const saveSchedule = trpc.users.updateWeeklySchedule.useMutation({
    onSuccess: () => {
      toast.success("Schedule saved");
      utils.users.getOwnProfile.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save schedule");
    },
  });

  const changePassword = trpc.users.updateOwnPassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to change password");
    },
  });

  const handleSaveProfile = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    updateProfile.mutate({
      name: name.trim(),
      phone: phone.trim() || undefined,
      jobTitle: jobTitle.trim() || undefined,
      languages,
      primaryLanguage: primaryLanguage || undefined,
    });
  };

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  };

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const roleBadgeColor: Record<string, string> = {
    admin: "bg-red-100 text-red-700 border-red-200",
    manager: "bg-purple-100 text-purple-700 border-purple-200",
    staff: "bg-blue-100 text-blue-700 border-blue-200",
    doctor: "bg-teal-100 text-teal-700 border-teal-200",
    patient: "bg-gray-100 text-gray-700 border-gray-200",
  };

  const role = (profileData?.role ?? meData?.role ?? "staff") as string;
  const avatarUrl = profileData?.avatarUrl ?? null;
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const uploadAvatar = trpc.users.uploadOwnAvatar.useMutation({
    onSuccess: () => {
      toast.success("Profile picture updated");
      utils.users.getOwnProfile.invalidate();
      utils.auth.me.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to upload picture"),
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadAvatar.mutate({ fileBase64: base64, fileName: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div
          className="relative w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground border cursor-pointer group overflow-hidden"
          onClick={() => avatarInputRef.current?.click()}
          title="Click to change profile picture"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-full" />
          ) : (
            <span>{name?.charAt(0)?.toUpperCase() ?? "?"}</span>
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
            {uploadAvatar.isPending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Camera className="w-5 h-5 text-white" />
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div>
          <h1 className="text-xl font-bold">{name || "My Profile"}</h1>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${roleBadgeColor[role] ?? ""}`}>
            {role}
          </span>
          <p className="text-sm text-muted-foreground mt-0.5">{meData?.email}</p>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCircle className="w-4 h-4" />
            My Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={meData?.email ?? ""} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Contact admin to change email</p>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Job Title</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Patient Coordinator, Nurse" />
          </div>
          <Button onClick={handleSaveProfile} disabled={updateProfile.isPending} className="w-full">
            {updateProfile.isPending ? "Saving..." : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      {/* Languages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="w-4 h-4" />
            Languages Spoken
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleLanguage(opt.value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  languages.includes(opt.value)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-foreground hover:border-primary/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {languages.length > 0 && (
            <div className="space-y-1.5">
              <Label>Primary Language</Label>
              <select
                value={primaryLanguage}
                onChange={(e) => setPrimaryLanguage(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Select primary language...</option>
                {LANGUAGE_OPTIONS.filter((o) => languages.includes(o.value)).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
          <Button onClick={handleSaveProfile} disabled={updateProfile.isPending} variant="outline" className="w-full">
            {updateProfile.isPending ? "Saving..." : "Save Languages"}
          </Button>
        </CardContent>
      </Card>

      {/* Weekly Schedule */}
      <WeeklyScheduleEditor
        value={weeklySchedule}
        slotDurationMinutes={slotDurationMinutes}
        onChange={(schedule, slotDuration) => {
          setWeeklySchedule(schedule);
          setSlotDurationMinutes(slotDuration);
          saveSchedule.mutate({ weeklySchedule: schedule, slotDurationMinutes: slotDuration });
        }}
      />

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="w-4 h-4" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Current Password</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm New Password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Button onClick={handleChangePassword} disabled={changePassword.isPending} variant="outline" className="w-full">
            {changePassword.isPending ? "Changing..." : "Change Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
