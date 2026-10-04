import { DuplicateWarning } from "@/components/DuplicateWarning";
import { parseTrpcError } from "@/lib/errorUtils";
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Stethoscope,
  Phone,
  Mail,
  BadgeCheck,
  UserX,
  Search,
  Upload,
  Stamp,
  User,
  Check,
  ChevronDown,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";

type Doctor = {
  id: number;
  userId: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  licenseNumber: string | null;
  bio: string | null;
  avatarUrl: string | null;
  stampUrl: string | null;
  isActive: boolean | null;
  createdAt: Date;
  title: string | null;
  firstName: string | null;
  secondName: string | null;
  thirdName: string | null;
  specializationId: number | null;
  consultationServiceId: number | null;
};

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

// ─── Image Upload Helper ─────────────────────────────────────────────────────
function ImageUploadField({
  label,
  hint,
  previewUrl,
  circular,
  onChange,
}: {
  label: string;
  hint?: string;
  previewUrl?: string | null;
  circular?: boolean;
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
          onClick={() => inputRef.current?.click()}
          style={{ cursor: "pointer" }}
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
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
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

// ─── Multi-Select Sub-Specializations ────────────────────────────────────────
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

// ─── Doctor Form Dialog ──────────────────────────────────────────────────────
function DoctorFormDialog({
  open,
  onClose,
  doctor,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  doctor?: Doctor | null;
  onSuccess: () => void;
}) {
  const isEdit = !!doctor;
  const { data: specializations, isLoading: specsLoading } = trpc.specializations.list.useQuery();
  const utils = trpc.useUtils();

  // Fetch full doctor record (with subSpecializationIds) when editing
  const { data: fullDoctor, isLoading: fullDoctorLoading } = trpc.doctors.get.useQuery(
    { id: doctor?.id ?? 0 },
    { enabled: isEdit && !!doctor?.id }
  );

  // Show loading spinner while fetching full doctor data or specializations
  const isFormLoading = (isEdit && fullDoctorLoading) || specsLoading;

  const [form, setForm] = useState({
    email: "",
    password: "",
    specialty: "",
    licenseNumber: "",
    bio: "",
    phone: "",
    title: "",
    firstName: "",
    secondName: "",
    thirdName: "",
    specializationId: "",
  });
  const [subSpecIds, setSubSpecIds] = useState<number[]>([]);

  // Pre-fill form when editing — use fullDoctor (has subSpecializationIds) when available
  useEffect(() => {
    const src = fullDoctor ?? doctor;
    if (src) {
      setForm({
        email: src.email ?? "",
        password: "",
        specialty: src.specialty ?? "",
        licenseNumber: src.licenseNumber ?? "",
        bio: src.bio ?? "",
        phone: src.phone ?? "",
        title: src.title ?? "",
        firstName: src.firstName ?? "",
        secondName: src.secondName ?? "",
        thirdName: src.thirdName ?? "",
        specializationId: src.specializationId ? String(src.specializationId) : "",
      });
      // Use subSpecializationIds from fullDoctor if available, else empty
      setSubSpecIds((fullDoctor as any)?.subSpecializationIds ?? []);
    } else {
      setForm({ email: "", password: "", specialty: "", licenseNumber: "", bio: "", phone: "", title: "", firstName: "", secondName: "", thirdName: "", specializationId: "" });
      setSubSpecIds([]);
    }
  }, [fullDoctor, doctor, open]);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Change password section (edit mode only)
  const [pwForm, setPwForm] = useState({ newPassword: "", confirmPassword: "" });
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const resetPasswordMutation = trpc.users.adminResetPassword.useMutation({
    onSuccess: () => {
      toast.success("Password updated successfully");
      setPwForm({ newPassword: "", confirmPassword: "" });
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });

  const handleResetPassword = () => {
    if (!pwForm.newPassword || pwForm.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!doctor?.userId) { toast.error("No linked user account found"); return; }
    resetPasswordMutation.mutate({ userId: doctor.userId, newPassword: pwForm.newPassword });
  };

  const uploadImage = trpc.doctors.uploadImage.useMutation();

  const createMutation = trpc.doctors.create.useMutation({
    onSuccess: async () => {
      await utils.doctors.list.invalidate();
      const doctorsList = await utils.doctors.list.fetch();
      const newDoctor = doctorsList.find((d) => d.email === form.email);
      if (newDoctor) await uploadImages(newDoctor.id);
      toast.success("Doctor created successfully");
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });

  const updateMutation = trpc.doctors.update.useMutation({
    onSuccess: async () => {
      if (doctor) await uploadImages(doctor.id);
      toast.success("Doctor updated successfully");
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });

  const uploadImages = async (doctorId: number) => {
    const toBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    setIsUploading(true);
    try {
      if (avatarFile) {
        const fileBase64 = await toBase64(avatarFile);
        await uploadImage.mutateAsync({ doctorId, fileBase64, fileName: avatarFile.name, mimeType: avatarFile.type, imageType: "avatar" });
      }
      if (stampFile) {
        const fileBase64 = await toBase64(stampFile);
        await uploadImage.mutateAsync({ doctorId, fileBase64, fileName: stampFile.name, mimeType: stampFile.type, imageType: "stamp" });
      }
    } catch {
      toast.error("Failed to upload image");
    }
    setIsUploading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    const specId = form.specializationId ? parseInt(form.specializationId) : undefined;

    if (isEdit && doctor) {
      updateMutation.mutate({
        id: doctor.id,
        email: form.email || undefined,
        specialty: form.specialty || undefined,
        licenseNumber: form.licenseNumber || undefined,
        bio: form.bio || undefined,
        phone: form.phone,
        title: form.title || undefined,
        firstName: form.firstName || undefined,
        secondName: form.secondName || undefined,
        thirdName: form.thirdName || undefined,
        specializationId: specId,
        subSpecializationIds: subSpecIds,
      });
    } else {
      if (!form.email || !form.password) {
        toast.error("Email and password are required");
        return;
      }
      createMutation.mutate({
        name: [form.title, form.firstName, form.secondName, form.thirdName].filter(Boolean).join(" ") || form.email,
        email: form.email,
        password: form.password,
        specialty: form.specialty || undefined,
        licenseNumber: form.licenseNumber || undefined,
        bio: form.bio || undefined,
        phone: form.phone,
        title: form.title || undefined,
        firstName: form.firstName || undefined,
        secondName: form.secondName || undefined,
        thirdName: form.thirdName || undefined,
        specializationId: specId,
        subSpecializationIds: subSpecIds,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || isUploading;
  const specIdNum = form.specializationId ? parseInt(form.specializationId) : null;

  // Auto-computed display name preview
  const previewName = [form.title, form.firstName, form.secondName, form.thirdName].filter(Boolean).join(" ");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Doctor" : "Add New Doctor"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the doctor's profile information." : "Create a new doctor account."}
          </DialogDescription>
        </DialogHeader>
        {isFormLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">

          {/* Profile picture + stamp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg border border-border/50">
            <ImageUploadField
              label="Profile Picture"
              hint="Square (1:1), max 5 MB"
              previewUrl={doctor?.avatarUrl}
              circular
              onChange={setAvatarFile}
            />
            <ImageUploadField
              label="Doctor Stamp"
              hint="Used on medical reports"
              previewUrl={doctor?.stampUrl}
              onChange={setStampFile}
            />
          </div>

          {/* Title / Rank */}
          <div className="space-y-1.5">
            <Label>Title / Rank</Label>
            <Select value={form.title || undefined} onValueChange={v => setForm(f => ({ ...f, title: v }))}>
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

          {/* Three-part name */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                placeholder="e.g. Sarah"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secondName">Second Name</Label>
              <Input
                id="secondName"
                placeholder="e.g. Jane"
                value={form.secondName}
                onChange={(e) => setForm((f) => ({ ...f, secondName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="thirdName">Third Name</Label>
              <Input
                id="thirdName"
                placeholder="e.g. Johnson"
                value={form.thirdName}
                onChange={(e) => setForm((f) => ({ ...f, thirdName: e.target.value }))}
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

          {/* Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="doctor@clinic.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 555 000 0000"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Duplicate check */}
          <DuplicateWarning entity="doctors" email={form.email} phone={form.phone} excludeId={isEdit ? doctor?.id : undefined} />
          {/* Password — only on create */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 8 characters"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={8}
              />
            </div>
          )}

          {/* Specialization */}
          <div className="space-y-1.5">
            <Label>Main Specialization</Label>
            <Select
              value={form.specializationId || undefined}
              onValueChange={v => {
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
              onChange={setSubSpecIds}
            />
          </div>

          {/* License */}
          <div className="space-y-1.5">
            <Label htmlFor="license">License Number</Label>
            <Input
              id="license"
              placeholder="LIC-2024-001"
              value={form.licenseNumber}
              onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio / Notes</Label>
            <Textarea
              id="bio"
              placeholder="Brief professional biography..."
              rows={3}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            />
          </div>

          {/* Change Password — edit mode only */}
          {isEdit && (
            <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <KeyRound className="h-4 w-4" />
                Change Password
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="newPw">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPw"
                      type={showNewPw ? "text" : "password"}
                      placeholder="Min. 8 characters"
                      value={pwForm.newPassword}
                      onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                      className="pr-9"
                    />
                    <button type="button" onClick={() => setShowNewPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPw">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPw"
                      type={showConfirmPw ? "text" : "password"}
                      placeholder="Repeat password"
                      value={pwForm.confirmPassword}
                      onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                      className="pr-9"
                    />
                    <button type="button" onClick={() => setShowConfirmPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetPassword}
                disabled={resetPasswordMutation.isPending || !pwForm.newPassword}
                className="gap-1.5"
              >
                {resetPasswordMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                Update Password
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Doctor"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Dialog ───────────────────────────────────────────────────────────
function DeleteDoctorDialog({
  open,
  onClose,
  doctor,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  doctor: Doctor | null;
  onSuccess: () => void;
}) {
  const deleteMutation = trpc.doctors.delete.useMutation({
    onSuccess: () => {
      toast.success("Doctor removed successfully");
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Doctor</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove <strong>{doctor?.name}</strong>? Their doctor profile
            will be deleted. Existing patient records will remain intact.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => doctor && deleteMutation.mutate({ id: doctor.id })}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Remove Doctor
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function DoctorsPage() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editDoctor, setEditDoctor] = useState<Doctor | null>(null);
  const [deleteDoctor, setDeleteDoctor] = useState<Doctor | null>(null);

  const { data: doctors, isLoading, refetch } = trpc.doctors.list.useQuery();
  const { data: specializations } = trpc.specializations.list.useQuery();

  const filtered = (doctors ?? []).filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.name?.toLowerCase().includes(q) ||
      d.email?.toLowerCase().includes(q) ||
      d.specialty?.toLowerCase().includes(q) ||
      d.licenseNumber?.toLowerCase().includes(q) ||
      d.firstName?.toLowerCase().includes(q) ||
      d.thirdName?.toLowerCase().includes(q)
    );
  });

  const getSpecializationName = (id: number | null) => {
    if (!id) return null;
    return specializations?.find(s => s.id === id)?.name ?? null;
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Doctors</h1>
          <p className="text-sm text-muted-foreground">Manage doctor accounts and clinical profiles</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Doctor
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Doctors</p>
          <p className="text-2xl font-bold">{doctors?.length ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Active</p>
          <p className="text-2xl font-bold text-emerald-600">{doctors?.filter(d => d.isActive !== false).length ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Specialties</p>
          <p className="text-2xl font-bold">{new Set(doctors?.map(d => d.specializationId).filter(Boolean)).size}</p>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, specialty, or license..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Stethoscope className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {search ? "No doctors match your search" : "No doctors added yet"}
          </p>
          {!search && (
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Doctor
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((doctor) => {
            const specName = getSpecializationName(doctor.specializationId);
            const fullName = [doctor.title, doctor.firstName, doctor.secondName, doctor.thirdName].filter(Boolean).join(" ");
            const displayInitial = (doctor.firstName || doctor.name)?.charAt(0).toUpperCase() ?? "D";
            return (
              <Card key={doctor.id} className={`transition-opacity ${doctor.isActive === false ? "opacity-60" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Circular Avatar */}
                    <div className="shrink-0">
                      {doctor.avatarUrl ? (
                        <img
                          src={doctor.avatarUrl}
                          alt={doctor.name ?? "Doctor"}
                          className="w-12 h-12 rounded-full object-cover border-2 border-primary/20"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-lg border-2 border-primary/20">
                          {displayInitial}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{fullName || doctor.name || "Unnamed Doctor"}</p>
                        {doctor.isActive === false && (
                          <Badge variant="secondary" className="text-xs">
                            <UserX className="h-3 w-3 mr-1" />Inactive
                          </Badge>
                        )}
                        {specName && (
                          <Badge variant="outline" className="text-xs">
                            <Stethoscope className="h-3 w-3 mr-1" />{specName}
                          </Badge>
                        )}
                        {!specName && doctor.specialty && (
                          <Badge variant="outline" className="text-xs">
                            <Stethoscope className="h-3 w-3 mr-1" />{doctor.specialty}
                          </Badge>
                        )}
                        {doctor.stampUrl && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Stamp className="h-3 w-3" />Stamp
                          </Badge>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        {doctor.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{doctor.email}</span>}
                        {doctor.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{doctor.phone}</span>}
                        {doctor.licenseNumber && <span className="flex items-center gap-1"><BadgeCheck className="h-3 w-3" />{doctor.licenseNumber}</span>}

                      </div>

                      {doctor.bio && (
                        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{doctor.bio}</p>
                      )}

                      <p className="mt-1 text-xs text-muted-foreground/60">
                        Added {format(new Date(doctor.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => setEditDoctor(doctor as unknown as Doctor)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                        onClick={() => setDeleteDoctor(doctor as unknown as Doctor)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <DoctorFormDialog open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={refetch} />
      <DoctorFormDialog open={!!editDoctor} onClose={() => setEditDoctor(null)} doctor={editDoctor} onSuccess={refetch} />
      <DeleteDoctorDialog open={!!deleteDoctor} onClose={() => setDeleteDoctor(null)} doctor={deleteDoctor} onSuccess={refetch} />
    </div>
  );
}
