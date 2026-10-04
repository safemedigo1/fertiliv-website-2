import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { parseTrpcError } from "@/lib/errorUtils";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  UserCheck,
  UserX,
  Trash2,
  UserPlus,
  Search,
  Shield,
  Stethoscope,
  Users,
  UserCog,
  Clock,
  CheckCircle2,
  XCircle,
  Pencil,
  KeyRound,
} from "lucide-react";

type RoleFilter = "all" | "admin" | "doctor" | "staff" | "manager" | "patient" | "pending";

const ROLE_COLORS: Record<string, string> = {
  admin:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  manager: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  doctor:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  staff:   "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  patient: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  pending:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active:   <CheckCircle2 className="w-3 h-3" />,
  pending:  <Clock className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
};

const TAB_ICONS: Record<RoleFilter, React.ReactNode> = {
  all:     <Users className="w-4 h-4" />,
  admin:   <Shield className="w-4 h-4" />,
  manager: <UserCog className="w-4 h-4" />,
  doctor:  <Stethoscope className="w-4 h-4" />,
  staff:   <UserCog className="w-4 h-4" />,
  patient: <Users className="w-4 h-4" />,
  pending: <Clock className="w-4 h-4" />,
};

const ASSIGNABLE_ROLES = ["patient", "staff", "doctor", "manager"] as const;

const EMPTY_CREATE = {
  firstName: "", secondName: "", thirdName: "",
  email: "", password: "", role: "staff" as string, phone: "",
};

const EMPTY_PROFILE = { firstName: "", secondName: "", thirdName: "", email: "", phone: "", role: "" };
const EMPTY_PW = { currentPassword: "", newPassword: "", confirmPassword: "" };
const EMPTY_RESET_PW = { newPassword: "", confirmPassword: "" };

export default function UsersPage() {
  const utils = trpc.useUtils();
  const { user: currentUser } = useAuth();
  const { data: allUsers = [], isLoading } = trpc.users.list.useQuery();

  const [activeTab, setActiveTab] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);

  const [approveUser, setApproveUser] = useState<any | null>(null);
  const [approveRole, setApproveRole] = useState<string>("staff");

  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwForm, setPwForm] = useState(EMPTY_PW);

  // Admin editing another user's profile
  const [editOtherUser, setEditOtherUser] = useState<any | null>(null);
  const [editOtherForm, setEditOtherForm] = useState(EMPTY_PROFILE);
  const [resetPwForm, setResetPwForm] = useState(EMPTY_RESET_PW);

  const approveMutation = trpc.users.approve.useMutation({
    onSuccess: () => { toast.success("User approved and activated"); utils.users.list.invalidate(); setApproveUser(null); },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const rejectMutation = trpc.users.reject.useMutation({
    onSuccess: () => { toast.success("User rejected"); utils.users.list.invalidate(); },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const setStatusMutation = trpc.users.setStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); utils.users.list.invalidate(); },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); utils.users.list.invalidate(); },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const deactivateMutation = trpc.users.deactivate.useMutation({
    onSuccess: () => { toast.success("User deactivated"); utils.users.list.invalidate(); setDeleteUserId(null); },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const reactivateMutation = trpc.users.reactivate.useMutation({
    onSuccess: () => { toast.success("User reactivated"); utils.users.list.invalidate(); },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("User created successfully");
      utils.users.list.invalidate();
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const updateOtherProfileMutation = trpc.users.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("User profile updated");
      utils.users.list.invalidate();
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const adminResetPasswordMutation = trpc.users.adminResetPassword.useMutation({
    onSuccess: () => { toast.success("Password reset successfully"); setResetPwForm(EMPTY_RESET_PW); },
    onError: (e) => toast.error(parseTrpcError(e)),
  });

  const updateProfileMutation = trpc.users.updateOwnProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      utils.users.list.invalidate();
      utils.auth.me.invalidate();
      setShowEditProfile(false);
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const updatePasswordMutation = trpc.users.updateOwnPassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully");
      setShowChangePassword(false);
      setPwForm(EMPTY_PW);
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });

  const filtered = (allUsers as any[]).filter((u: any) => {
    const matchesTab =
      activeTab === "all" ? true :
      activeTab === "pending" ? (u.status === "pending" || u.status === "rejected") :
      u.role === activeTab;
    const matchesActive =
      activeFilter === "all" ? true :
      activeFilter === "active" ? (u.isActive !== false) :
      (u.isActive === false);
    const q = search.toLowerCase();
    const matchesSearch = !q || (u.name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
    return matchesTab && matchesActive && matchesSearch;
  });

  const counts: Record<RoleFilter, number> = {
    all:     (allUsers as any[]).length,
    admin:   (allUsers as any[]).filter((u: any) => u.role === "admin").length,
    manager: (allUsers as any[]).filter((u: any) => u.role === "manager").length,
    doctor:  (allUsers as any[]).filter((u: any) => u.role === "doctor").length,
    staff:   (allUsers as any[]).filter((u: any) => u.role === "staff").length,
    patient: (allUsers as any[]).filter((u: any) => u.role === "patient").length,
    pending: (allUsers as any[]).filter((u: any) => u.status === "pending" || u.status === "rejected").length,
  };

  const handleCreate = () => {
    if (!createForm.firstName || !createForm.email || !createForm.password) {
      toast.error("First name, email, and password are required");
      return;
    }
    registerMutation.mutate({
      firstName: createForm.firstName,
      secondName: createForm.secondName || undefined,
      thirdName: createForm.thirdName || undefined,
      email: createForm.email,
      password: createForm.password,
      role: createForm.role as any,
      phone: createForm.phone || undefined,
    });
  };

  const openEditProfile = (user: any) => {
    setProfileForm({
      firstName: user.firstName ?? "",
      secondName: user.secondName ?? "",
      thirdName: user.thirdName ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      role: user.role ?? "",
    });
    setShowEditProfile(true);
  };

  const handleSaveProfile = () => {
    if (!profileForm.firstName) return toast.error("First name is required");
    updateProfileMutation.mutate({
      firstName: profileForm.firstName,
      secondName: profileForm.secondName || undefined,
      thirdName: profileForm.thirdName || undefined,
      email: profileForm.email || undefined,
      phone: profileForm.phone || undefined,
    });
  };

  const handleChangePassword = () => {
    if (!pwForm.currentPassword || !pwForm.newPassword) return toast.error("All password fields are required");
    if (pwForm.newPassword !== pwForm.confirmPassword) return toast.error("New passwords do not match");
    if (pwForm.newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    updatePasswordMutation.mutate({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
  };

  const isOwnAccount = (userId: number) => userId === currentUser?.id;
  const isAdminUser = (user: any) => user.role === "admin";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">{(allUsers as any[]).length} total users</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <UserPlus className="w-4 h-4" />
          Create User
        </Button>
      </div>

      {/* Role legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 font-medium">Admin — System owner, full access</span>
        <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-800 font-medium">Manager — Full operational access, no admin settings</span>
        <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">Doctor — Clinical access</span>
        <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">Staff — Patient & appointment management</span>
        <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium">Patient — Self-service portal</span>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col gap-3">
        {/* Scrollable role tabs — horizontal scroll on mobile, no wrapping */}
        <div className="overflow-x-auto scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RoleFilter)}>
            <TabsList className="inline-flex h-9 gap-0.5 rounded-lg bg-muted p-1" style={{ minWidth: 'max-content' }}>
              {(["all", "admin", "manager", "doctor", "staff", "patient", "pending"] as RoleFilter[]).map((tab) => (
                <TabsTrigger key={tab} value={tab} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 whitespace-nowrap rounded-md h-7">
                  {TAB_ICONS[tab]}
                  <span className="hidden sm:inline">{tab === "pending" ? "Pending" : tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1) + "s"}</span>
                  <span className="sm:hidden">{tab === "all" ? "All" : tab === "pending" ? "⏳" : tab.charAt(0).toUpperCase()}</span>
                  <span className="rounded-full bg-background/60 px-1 py-0.5 text-[10px] font-medium leading-none">
                    {counts[tab]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Active / Inactive filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground font-medium">Status:</span>
        {(["all", "active", "inactive"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeFilter === f
                ? f === "inactive"
                  ? "bg-orange-100 border-orange-300 text-orange-700"
                  : f === "active"
                  ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                  : "bg-primary/10 border-primary/30 text-primary"
                : "bg-background border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {f === "all" ? `All (${(allUsers as any[]).length})` :
             f === "active" ? `Active (${(allUsers as any[]).filter((u: any) => u.isActive !== false).length})` :
             `Inactive (${(allUsers as any[]).filter((u: any) => u.isActive === false).length})`}
          </button>
        ))}
      </div>

      {/* User List */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading users...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No users found.</div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((user: any) => {
            const isSelf = isOwnAccount(user.id);
            const userIsAdmin = isAdminUser(user);

            return (
              <Card key={user.id} className={`border transition-opacity ${isSelf ? "border-primary/40 bg-primary/5" : user.isActive === false ? "border-orange-200 bg-orange-50/40 opacity-70" : "border-border"}`}>
                <CardContent className="p-4">
                  {/* Top row: avatar + info */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0 mt-0.5">
                      {(user.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Name + badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground">{user.name ?? "—"}</span>
                        {isSelf && <span className="text-xs text-primary font-medium">(You)</span>}
                        <Badge className={`text-xs px-2 py-0.5 ${ROLE_COLORS[user.role] ?? ""}`}>
                          {user.role}
                        </Badge>
                        <Badge className={`text-xs px-2 py-0.5 flex items-center gap-1 ${STATUS_COLORS[user.status ?? "active"] ?? ""}`}>
                          {STATUS_ICONS[user.status ?? "active"]}
                          {user.status ?? "active"}
                        </Badge>
                        {user.isActive === false && (
                          <Badge className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 border border-orange-200">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      {/* Email */}
                      <div className="text-sm text-muted-foreground mt-0.5 break-all">{user.email ?? "—"}</div>
                      {/* Phone */}
                      {user.phone && <div className="text-xs text-muted-foreground">{user.phone}</div>}
                      {/* Dates */}
                      <div className="text-xs text-muted-foreground mt-1">
                        Joined {user.createdAt ? format(new Date(user.createdAt), "dd MMM yyyy") : "—"}
                        {user.lastSignedIn && (
                          <span className="block sm:inline sm:before:content-['_·_']">Last login {format(new Date(user.lastSignedIn), "dd MMM yyyy")}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions row — always below info, wraps naturally */}
                  <div className="flex items-center gap-2 flex-wrap mt-3 pl-13">
                      {/* Own account: Edit Profile + Change Password */}
                      {isSelf && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => openEditProfile(user)}>
                            <Pencil className="w-3.5 h-3.5" />
                            Edit Profile
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowChangePassword(true)}>
                            <KeyRound className="w-3.5 h-3.5" />
                            Password
                          </Button>
                        </>
                      )}

                      {!isSelf && (
                        <>
                          {/* Admin: Edit any user's profile */}
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                            setEditOtherUser(user);
                            setEditOtherForm({
                              firstName: user.firstName ?? "",
                              secondName: user.secondName ?? "",
                              thirdName: user.thirdName ?? "",
                              email: user.email ?? "",
                              phone: user.phone ?? "",
                              role: user.role ?? "",
                            });
                            setResetPwForm(EMPTY_RESET_PW);
                          }}>
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </Button>

                          {user.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" className="gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                onClick={() => { setApproveUser(user); setApproveRole("staff"); }}>
                                <UserCheck className="w-3.5 h-3.5" />Approve
                              </Button>
                              <Button size="sm" variant="outline" className="gap-1 text-red-700 border-red-300 hover:bg-red-50"
                                onClick={() => rejectMutation.mutate({ userId: user.id })}>
                                <UserX className="w-3.5 h-3.5" />Reject
                              </Button>
                            </>
                          )}

                          {user.status === "rejected" && (
                            <Button size="sm" variant="outline" className="gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                              onClick={() => { setApproveUser(user); setApproveRole(user.role === "admin" ? "staff" : user.role); }}>
                              <UserCheck className="w-3.5 h-3.5" />Re-activate
                            </Button>
                          )}

                          {(user.status === "active" || !user.status) && !userIsAdmin && (
                            <>
                              <Select value={user.role} onValueChange={(role) => updateRoleMutation.mutate({ userId: user.id, role: role as any })}>
                                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {ASSIGNABLE_ROLES.map(r => (
                                    <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="outline" className="gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                                onClick={() => setStatusMutation.mutate({ userId: user.id, status: "pending" })}>
                                <Clock className="w-3.5 h-3.5" />Suspend
                              </Button>
                            </>
                          )}

                          {!userIsAdmin && (
                            user.isActive === false ? (
                              <Button size="sm" variant="outline" className="gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                onClick={() => reactivateMutation.mutate({ userId: user.id })}>
                                <UserCheck className="w-3.5 h-3.5" />Reactivate
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteUserId(user.id)}>
                                <UserX className="w-3.5 h-3.5" />Deactivate
                              </Button>
                            )
                          )}
                        </>
                      )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setCreateForm(EMPTY_CREATE); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>First Name *</Label>
                <Input placeholder="First" value={createForm.firstName}
                  onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Middle Name</Label>
                <Input placeholder="Middle" value={createForm.secondName}
                  onChange={(e) => setCreateForm({ ...createForm, secondName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input placeholder="Last" value={createForm.thirdName}
                  onChange={(e) => setCreateForm({ ...createForm, thirdName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" placeholder="email@fertiliv.com" value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Password * (min. 8 characters)</Label>
              <Input type="password" placeholder="••••••••" value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map(r => (
                    <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Admin role is reserved for the system owner.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input placeholder="+90 555 000 0000" value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={registerMutation.isPending}>
              {registerMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve / Re-activate Dialog */}
      <Dialog open={!!approveUser} onOpenChange={() => setApproveUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{approveUser?.status === "rejected" ? "Re-activate User" : "Approve User"}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Activating <strong>{approveUser?.name}</strong>. Select the role to assign:
            </p>
            <Select value={approveRole} onValueChange={setApproveRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map(r => (
                  <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveUser(null)}>Cancel</Button>
            <Button onClick={() => approveMutation.mutate({ userId: approveUser.id, role: approveRole as any })}
              disabled={approveMutation.isPending}>
              {approveMutation.isPending ? "Activating..." : "Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Own Profile Dialog */}
      <Dialog open={showEditProfile} onOpenChange={setShowEditProfile}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit My Profile</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>First Name *</Label>
                <Input value={profileForm.firstName}
                  onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                  placeholder="First" />
              </div>
              <div className="space-y-1.5">
                <Label>Middle Name</Label>
                <Input value={profileForm.secondName}
                  onChange={(e) => setProfileForm({ ...profileForm, secondName: e.target.value })}
                  placeholder="Middle" />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input value={profileForm.thirdName}
                  onChange={(e) => setProfileForm({ ...profileForm, thirdName: e.target.value })}
                  placeholder="Last" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                placeholder="your@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                placeholder="+90 555 000 0000" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditProfile(false)}>Cancel</Button>
            <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
              {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change Password</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Current Password</Label>
              <Input type="password" value={pwForm.currentPassword}
                onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} placeholder="••••••••" />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label>New Password (min. 8 characters)</Label>
              <Input type="password" value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm New Password</Label>
              <Input type="password" value={pwForm.confirmPassword}
                onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })} placeholder="••••••••" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangePassword(false)}>Cancel</Button>
            <Button onClick={handleChangePassword} disabled={updatePasswordMutation.isPending}>
              {updatePasswordMutation.isPending ? "Updating..." : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteUserId !== null} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the user account. The user will not be able to log in until reactivated by an administrator. All their data and history will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUserId !== null && deactivateMutation.mutate({ userId: deleteUserId })}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Other User Dialog (Admin only) */}
      <Dialog open={editOtherUser !== null} onOpenChange={(o) => { if (!o) { setEditOtherUser(null); setResetPwForm(EMPTY_RESET_PW); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User: {editOtherUser?.name ?? ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Profile fields */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Profile</p>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>First Name *</Label>
                    <Input placeholder="First" value={editOtherForm.firstName}
                      onChange={(e) => setEditOtherForm({ ...editOtherForm, firstName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Middle Name</Label>
                    <Input placeholder="Middle" value={editOtherForm.secondName}
                      onChange={(e) => setEditOtherForm({ ...editOtherForm, secondName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last Name</Label>
                    <Input placeholder="Last" value={editOtherForm.thirdName}
                      onChange={(e) => setEditOtherForm({ ...editOtherForm, thirdName: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Email *</Label>
                    <Input type="email" placeholder="email@example.com" value={editOtherForm.email}
                      onChange={(e) => setEditOtherForm({ ...editOtherForm, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input placeholder="+1 234 567 8900" value={editOtherForm.phone}
                      onChange={(e) => setEditOtherForm({ ...editOtherForm, phone: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            {/* Role */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Role</p>
              <Select value={editOtherForm.role} onValueChange={(v) => setEditOtherForm({ ...editOtherForm, role: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — Full access</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="patient">Patient</SelectItem>
                </SelectContent>
              </Select>
              {editOtherForm.role === "admin" && (
                <p className="text-xs text-amber-600 mt-1.5">⚠ Admin users have full access to all features and data.</p>
              )}
            </div>

            {/* Save profile button */}
            <Button
              className="w-full"
              disabled={updateOtherProfileMutation.isPending || !editOtherForm.firstName.trim()}
              onClick={() => {
                if (!editOtherUser) return;
                updateOtherProfileMutation.mutate({
                  userId: editOtherUser.id,
                  firstName: editOtherForm.firstName,
                  secondName: editOtherForm.secondName || undefined,
                  thirdName: editOtherForm.thirdName || undefined,
                  email: editOtherForm.email || undefined,
                  phone: editOtherForm.phone || undefined,
                  role: (editOtherForm.role && editOtherForm.role !== editOtherUser?.role) ? editOtherForm.role as any : undefined,
                });
              }}
            >
              {updateOtherProfileMutation.isPending ? "Saving..." : "Save Profile & Role"}
            </Button>

            <Separator />

            {/* Password reset */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Reset Password</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>New Password (min. 8 characters)</Label>
                  <Input type="password" placeholder="••••••••" value={resetPwForm.newPassword}
                    onChange={(e) => setResetPwForm({ ...resetPwForm, newPassword: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm Password</Label>
                  <Input type="password" placeholder="••••••••" value={resetPwForm.confirmPassword}
                    onChange={(e) => setResetPwForm({ ...resetPwForm, confirmPassword: e.target.value })} />
                </div>
                {resetPwForm.newPassword && resetPwForm.confirmPassword && resetPwForm.newPassword !== resetPwForm.confirmPassword && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  disabled={adminResetPasswordMutation.isPending || !resetPwForm.newPassword || resetPwForm.newPassword !== resetPwForm.confirmPassword || resetPwForm.newPassword.length < 8}
                  onClick={() => {
                    if (!editOtherUser) return;
                    adminResetPasswordMutation.mutate({ userId: editOtherUser.id, newPassword: resetPwForm.newPassword });
                  }}
                >
                  <KeyRound className="w-4 h-4" />
                  {adminResetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOtherUser(null); setResetPwForm(EMPTY_RESET_PW); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
