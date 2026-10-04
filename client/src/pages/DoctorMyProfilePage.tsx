import { useState, useRef, useEffect } from "react";
import { parseTrpcError } from "@/lib/errorUtils";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  User,
  Stethoscope,
  KeyRound,
  Loader2,
  Upload,
  Stamp,
  Check,
  ChevronDown,
  Globe,
  Clock,
} from "lucide-react";
import { LanguageSelectWithPrimary } from "@/components/PatientFormComponents";
import { useReferenceData } from "@/hooks/useReferenceData";
import { WeeklyScheduleEditor, type WeeklySchedule } from "@/components/WeeklyScheduleEditor";

// ─── Same DOCTOR_TITLES as admin DoctorsPage ─────────────────────────────────
const DOCTOR_TITLES = [
  "Dr",
  "Surgeon",
  "Attending",
  "Dr. Assistant Professor",
  "Dr. Associate Professor",
  "Dr. Professor",
  "Dr. Professor Scientist",
  "Nurse",
  "Medical Practitioner",
];

// ─── Image Upload Field (same pattern as admin DoctorsPage) ──────────────────
function ImageUploadField({
  label,
  hint,
  previewUrl,
  circular,
  uploading,
  onChange,
}: {
  label: string;
  hint?: string;
  previewUrl?: string | null;
  circular?: boolean;
  uploading?: boolean;
  onChange: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const preview = localPreview ?? previewUrl ?? null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLocalPreview(reader.result as string);
    reader.readAsDataURL(file);
    onChange(file);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-4">
        <div
          className={`shrink-0 bg-muted flex items-center justify-center overflow-hidden border border-border ${
            circular ? "w-16 h-16 rounded-full" : "w-20 h-14 rounded-md"
          }`}
          onClick={() => !uploading && inputRef.current?.click()}
          style={{ cursor: uploading ? "default" : "pointer" }}
        >
          {preview ? (
            <img
              src={preview}
              alt={label}
              className={`w-full h-full object-cover ${circular ? "rounded-full" : ""}`}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              {circular ? <User className="h-6 w-6" /> : <Stamp className="h-5 w-5" />}
              <span className="text-[10px]">Upload</span>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5 mr-1.5" />
            )}
            {preview ? "Change" : "Upload"}
          </Button>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

// ─── Sub-Specialization Multi-Select (same as admin DoctorsPage) ─────────────
function SubSpecializationMultiSelect({
  specializationId,
  value,
  onChange,
}: {
  specializationId: number | null;
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: subSpecs } = trpc.subSpecializations.list.useQuery(
    { specializationId: specializationId ?? undefined },
    { enabled: !!specializationId }
  );

  if (!specializationId) return (
    <p className="text-xs text-muted-foreground italic">Select a main specialization first</p>
  );

  if (!subSpecs || subSpecs.length === 0) return (
    <p className="text-xs text-muted-foreground italic">No sub-specializations defined for this specialization</p>
  );

  const toggle = (id: number) => {
    if (value.includes(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  };

  const selectedNames = subSpecs.filter(s => value.includes(s.id)).map(s => s.name);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className="truncate text-left">
          {selectedNames.length === 0
            ? "Select sub-specializations..."
            : selectedNames.join(", ")}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="max-h-48 overflow-y-auto p-1">
            {subSpecs.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent text-left"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center ${value.includes(s.id) ? "bg-primary border-primary" : "border-input"}`}>
                  {value.includes(s.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DoctorMyProfilePage() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();

  const { data: doctorProfile, isLoading } = trpc.doctors.me.useQuery();
  const { data: specializations, isLoading: specsLoading } = trpc.specializations.list.useQuery();

  // ── Combined profile form (mirrors admin edit form exactly) ─────────────────
  const [form, setForm] = useState({
    title: "",
    firstName: "",
    secondName: "",
    thirdName: "",
    phone: "",
    specialty: "",
    licenseNumber: "",
    bio: "",
    specializationId: "",
    jobTitle: "",
  });
  const [subSpecIds, setSubSpecIds] = useState<number[]>([]);
  const [profileLanguages, setProfileLanguages] = useState<string[]>([]);
  const [profilePrimaryLanguage, setProfilePrimaryLanguage] = useState<string>("");
  const languageOptions = useReferenceData("language");
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>({});
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);

  // Fetch and save weekly schedule separately
  const { data: scheduleData } = trpc.users.getWeeklySchedule.useQuery(undefined);
  const updateScheduleMutation = trpc.users.updateWeeklySchedule.useMutation({
    onSuccess: () => toast.success("Availability schedule saved"),
    onError: (e) => toast.error(e.message ?? "Failed to save schedule"),
  });
  // Track whether user has made unsaved edits (to avoid overwriting their in-progress changes)
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    // Only sync from server when user hasn't started editing
    if (doctorProfile && !isDirty) {
      setForm({
        title: (doctorProfile as any).title ?? "",
        firstName: (doctorProfile as any).firstName ?? "",
        secondName: (doctorProfile as any).secondName ?? "",
        thirdName: (doctorProfile as any).thirdName ?? "",
        phone: (doctorProfile as any).phone ?? "",
        specialty: (doctorProfile as any).specialty ?? "",
        licenseNumber: (doctorProfile as any).licenseNumber ?? "",
        bio: (doctorProfile as any).bio ?? "",
        specializationId: (doctorProfile as any).specializationId
          ? String((doctorProfile as any).specializationId)
          : "",
        jobTitle: (doctorProfile as any).jobTitle ?? "",
      });
      setSubSpecIds((doctorProfile as any).subSpecializationIds ?? []);
      // Parse languages from JSON string or array
      const rawLangs = (doctorProfile as any).languages;
      const parsedLangs: string[] = Array.isArray(rawLangs)
        ? rawLangs
        : (typeof rawLangs === "string" ? JSON.parse(rawLangs || "[]") : []);
      setProfileLanguages(parsedLangs);
      setProfilePrimaryLanguage((doctorProfile as any).primaryLanguage ?? "");
    }
    // Sync schedule from separate query
    if (scheduleData && !isDirty) {
      setWeeklySchedule(scheduleData.weeklySchedule);
      setSlotDurationMinutes(scheduleData.slotDurationMinutes);
    }
  }, [doctorProfile, scheduleData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Password form ───────────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const updateProfileMutation = trpc.doctors.updateOwnProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated successfully");
      setIsDirty(false); // allow re-sync from server after save
      utils.doctors.me.invalidate();
      utils.auth.me.invalidate();
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });

  const updatePasswordMutation = trpc.users.updateOwnPassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully");
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });

  const uploadAvatarMutation = trpc.doctors.uploadOwnAvatar.useMutation({
    onSuccess: () => {
      toast.success("Profile picture updated");
      utils.doctors.me.invalidate();
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });

  const uploadStampMutation = trpc.doctors.uploadOwnStamp.useMutation({
    onSuccess: () => {
      toast.success("Doctor stamp updated");
      utils.doctors.me.invalidate();
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });

  // ── Image upload helpers ────────────────────────────────────────────────────
  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleAvatarChange = async (file: File) => {
    const fileBase64 = await toBase64(file);
    uploadAvatarMutation.mutate({ fileBase64, fileName: file.name, mimeType: file.type });
  };

  const handleStampChange = async (file: File) => {
    const fileBase64 = await toBase64(file);
    uploadStampMutation.mutate({ fileBase64, fileName: file.name, mimeType: file.type });
  };

  // ── Form submit ─────────────────────────────────────────────────────────────
  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const specId = form.specializationId ? parseInt(form.specializationId) : undefined;
    updateProfileMutation.mutate({
      title: form.title || undefined,
      firstName: form.firstName || undefined,
      secondName: form.secondName || undefined,
      thirdName: form.thirdName || undefined,
      phone: form.phone || undefined,
      specialty: form.specialty || undefined,
      licenseNumber: form.licenseNumber || undefined,
      bio: form.bio || undefined,
      specializationId: specId,
      subSpecializationIds: subSpecIds,
      jobTitle: form.jobTitle || undefined,
      languages: profileLanguages.length > 0 ? profileLanguages : undefined,
      primaryLanguage: profilePrimaryLanguage || undefined,
    });
  }

  function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwForm.currentPassword || !pwForm.newPassword) {
      toast.error("Please fill in all password fields");
      return;
    }
    if (pwForm.newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    updatePasswordMutation.mutate({
      currentPassword: pwForm.currentPassword,
      newPassword: pwForm.newPassword,
    });
  }

  if (isLoading || specsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const avatarUrl = (doctorProfile as any)?.avatarUrl;
  const stampUrl = (doctorProfile as any)?.stampUrl;
  const displayName = (doctorProfile as any)?.name ?? currentUser?.name ?? "Doctor";
  const specIdNum = form.specializationId ? parseInt(form.specializationId) : null;

  // Auto-computed display name preview (same as admin form)
  const previewName = [form.title, form.firstName, form.secondName, form.thirdName]
    .filter(Boolean)
    .join(" ");

  const isSaving = updateProfileMutation.isPending;

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden border border-border">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-full" />
          ) : (
            <User className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">
              <Stethoscope className="w-3 h-3 mr-1" />
              Doctor
            </Badge>
            {(doctorProfile as any)?.specialty && (
              <span className="text-sm text-muted-foreground">{(doctorProfile as any).specialty}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{currentUser?.email}</p>
        </div>
      </div>

      <Separator />

      {/* Profile Form — mirrors admin edit form exactly */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" />
            My Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">

            {/* Profile picture + stamp — same layout as admin form */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg border border-border/50">
              <ImageUploadField
                label="Profile Picture"
                hint="Square (1:1), max 5 MB"
                previewUrl={avatarUrl}
                circular
                uploading={uploadAvatarMutation.isPending}
                onChange={handleAvatarChange}
              />
              <ImageUploadField
                label="Doctor Stamp"
                hint="Used on medical reports"
                previewUrl={stampUrl}
                uploading={uploadStampMutation.isPending}
                onChange={handleStampChange}
              />
            </div>

            {/* Title / Rank — same DOCTOR_TITLES list as admin form */}
            <div className="space-y-1.5">
              <Label>Title / Rank</Label>
              <Select
                value={form.title || undefined}
                onValueChange={v => { setIsDirty(true); setForm(f => ({ ...f, title: v })); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select title..." />
                </SelectTrigger>
                <SelectContent>
                  {DOCTOR_TITLES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Three-part name — same grid as admin form */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  placeholder="e.g. Sarah"
                  value={form.firstName}
                  onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secondName">Second Name</Label>
                <Input
                  id="secondName"
                  placeholder="e.g. Jane"
                  value={form.secondName}
                  onChange={(e) => setForm(f => ({ ...f, secondName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="thirdName">Third Name</Label>
                <Input
                  id="thirdName"
                  placeholder="e.g. Johnson"
                  value={form.thirdName}
                  onChange={(e) => setForm(f => ({ ...f, thirdName: e.target.value }))}
                />
              </div>
            </div>

            {/* Auto-generated display name preview */}
            {previewName && (
              <div className="px-3 py-2 bg-primary/5 border border-primary/20 rounded-md">
                <p className="text-xs text-muted-foreground">Display name (auto-generated):</p>
                <p className="text-sm font-medium">{previewName}</p>
              </div>
            )}

            {/* Contact — email read-only, phone editable */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={currentUser?.email ?? ""}
                  readOnly
                  className="bg-muted/50 cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">Contact admin to change email</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 555 000 0000"
                  value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            {/* Main Specialization */}
            <div className="space-y-1.5">
              <Label>Main Specialization</Label>
              <Select
                value={form.specializationId || undefined}
                onValueChange={v => {
                  setIsDirty(true);
                  setForm(f => ({ ...f, specializationId: v }));
                  setSubSpecIds([]); // reset sub-specs when main changes
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select specialization..." />
                </SelectTrigger>
                <SelectContent>
                  {(specializations ?? []).map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sub-Specializations */}
            <div className="space-y-1.5">
              <Label>Sub-Specializations</Label>
              <SubSpecializationMultiSelect
                specializationId={specIdNum}
                value={subSpecIds}
                onChange={ids => { setIsDirty(true); setSubSpecIds(ids); }}
              />
            </div>

            {/* License Number */}
            <div className="space-y-1.5">
              <Label htmlFor="license">License Number</Label>
              <Input
                id="license"
                placeholder="LIC-2024-001"
                value={form.licenseNumber}
                onChange={(e) => setForm(f => ({ ...f, licenseNumber: e.target.value }))}
              />
            </div>

            {/* Job Title */}
            <div className="space-y-1.5">
              <Label htmlFor="jobTitle" className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                Job Title
              </Label>
              <Input
                id="jobTitle"
                placeholder="e.g. IVF Coordinator, Patient Advisor"
                value={form.jobTitle}
                onChange={(e) => { setIsDirty(true); setForm(f => ({ ...f, jobTitle: e.target.value })); }}
              />
            </div>

            {/* Languages */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                Languages Spoken
              </Label>
              <LanguageSelectWithPrimary
                languages={profileLanguages}
                primaryLanguage={profilePrimaryLanguage}
                onLanguagesChange={(langs) => { setIsDirty(true); setProfileLanguages(langs); }}
                onPrimaryChange={(lang) => { setIsDirty(true); setProfilePrimaryLanguage(lang ?? ""); }}
                options={languageOptions.options}
              />
              <p className="text-xs text-muted-foreground">Select languages you speak. Mark one as primary.</p>
            </div>

            {/* Bio / Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio / Notes</Label>
              <Textarea
                id="bio"
                placeholder="Brief professional biography..."
                rows={3}
                value={form.bio}
                onChange={(e) => setForm(f => ({ ...f, bio: e.target.value }))}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="Enter current password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repeat new password"
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="outline" disabled={updatePasswordMutation.isPending}>
                {updatePasswordMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Change Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Availability Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Availability Schedule
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Set your weekly working hours. Patients will only see available slots when booking a consultation.
          </p>
        </CardHeader>
        <CardContent>
          <WeeklyScheduleEditor
            value={weeklySchedule}
            slotDurationMinutes={slotDurationMinutes}
            onChange={(schedule, duration) => {
              setWeeklySchedule(schedule);
              setSlotDurationMinutes(duration);
            }}
          />
          <div className="flex justify-end mt-4">
            <Button
              type="button"
              variant="outline"
              disabled={updateScheduleMutation.isPending}
              onClick={() => updateScheduleMutation.mutate({ weeklySchedule, slotDurationMinutes })}
            >
              {updateScheduleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Schedule
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
