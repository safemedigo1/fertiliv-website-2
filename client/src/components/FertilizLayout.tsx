import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  BarChart3,
  Bell,
  Calendar,
  CalendarOff,
  ChevronDown,
  FlaskConical,
  Heart,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeft,
  Search,
  Settings,
  Shield,
  Stethoscope,
  UserCircle,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  CheckSquare,
  Upload,
  Briefcase,
  Monitor,
  FileCode2,
  Download,
  Inbox,
  Smartphone,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { MonitoringConsentBanner } from "./MonitoringConsentBanner";
import { MonitoringAgent } from "./MonitoringAgent";

type NavItem = {
  id: string;
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
};

// Per-role ordered nav menus — order is intentional and must match spec exactly
const NAV_BY_ROLE: Record<string, NavItem[]> = {
  admin: [
    { id: "dashboard",           icon: LayoutDashboard, label: "Dashboard",          path: "/" },
    { id: "tasks",               icon: CheckSquare,      label: "Tasks",              path: "/tasks" },
    { id: "inbox",               icon: Inbox,             label: "Inbox",              path: "/inbox" },
    { id: "whatsapp_connections", icon: Smartphone,        label: "WhatsApp",          path: "/whatsapp-connections" },
    { id: "patients",            icon: Users,            label: "Patients",           path: "/patients" },
    { id: "calendar",            icon: Calendar,         label: "Calendar",           path: "/calendar" },
    { id: "leads_crm",           icon: UserPlus,         label: "Leads & CRM",        path: "/leads" },
    { id: "lab_radiology",       icon: FlaskConical,     label: "Lab & Radiology",    path: "/lab" },
    { id: "doctors",             icon: Stethoscope,      label: "Doctors",            path: "/doctors" },
    { id: "staff_availability",  icon: CalendarOff,      label: "Staff Availability", path: "/availability" },
    { id: "finance",             icon: Wallet,           label: "Finance",            path: "/finance" },
    { id: "services",            icon: Activity,         label: "Services",           path: "/services" },
    { id: "treatment_packages",  icon: Package,          label: "Treatment Packages", path: "/treatment-packages" },
    { id: "analytics",           icon: BarChart3,        label: "Analytics",          path: "/analytics" },
    { id: "users_roles",         icon: UserCog,          label: "Users & Roles",      path: "/users" },
    { id: "notifications",       icon: Bell,             label: "Notifications",      path: "/notifications" },
    { id: "audit_log",           icon: Shield,           label: "Audit Log",          path: "/audit-log" },
    { id: "check_number",        icon: Search,           label: "Check Number",       path: "/check-number" },
    { id: "import_leads",        icon: Upload,           label: "Import Leads",       path: "/import" },
    { id: "data_io",             icon: Download,         label: "Export / Import",    path: "/data-io" },
    { id: "form_builder",        icon: FileCode2,        label: "Form Builder",       path: "/form-builder" },
    { id: "monitoring",          icon: Monitor,          label: "Remote Monitoring",  path: "/monitoring" },
    { id: "lab_dictionary",       icon: FlaskConical,     label: "Lab Dictionary",      path: "/lab-dictionary" },
    { id: "settings",            icon: Settings,         label: "Settings",           path: "/settings" },
  ],
  manager: [
    { id: "dashboard",           icon: LayoutDashboard, label: "Dashboard",          path: "/" },
    { id: "tasks",               icon: CheckSquare,      label: "Tasks",              path: "/tasks" },
    { id: "inbox",               icon: Inbox,             label: "Inbox",              path: "/inbox" },
    { id: "whatsapp_connections", icon: Smartphone,        label: "WhatsApp",          path: "/whatsapp-connections" },
    { id: "patients",            icon: Users,            label: "Patients",           path: "/patients" },
    { id: "calendar",            icon: Calendar,         label: "Calendar",           path: "/calendar" },
    { id: "leads_crm",           icon: UserPlus,         label: "Leads & CRM",        path: "/leads" },
    { id: "lab_radiology",       icon: FlaskConical,     label: "Lab & Radiology",    path: "/lab" },
    { id: "staff_availability",  icon: CalendarOff,      label: "Staff Availability", path: "/availability" },
    { id: "notifications",       icon: Bell,             label: "Notifications",      path: "/notifications" },
    { id: "check_number",        icon: Search,           label: "Check Number",       path: "/check-number" },
  ],
  staff: [
    { id: "dashboard",           icon: LayoutDashboard, label: "Dashboard",          path: "/" },
    { id: "tasks",               icon: CheckSquare,      label: "Tasks",              path: "/tasks" },
    { id: "inbox",               icon: Inbox,             label: "Inbox",              path: "/inbox" },
    { id: "whatsapp_connections", icon: Smartphone,        label: "WhatsApp",          path: "/whatsapp-connections" },
    { id: "patients",            icon: Users,            label: "Patients",           path: "/patients" },
    { id: "calendar",            icon: Calendar,         label: "Calendar",           path: "/calendar" },
    { id: "leads_crm",           icon: UserPlus,         label: "Leads & CRM",        path: "/leads" },
    { id: "lab_radiology",       icon: FlaskConical,     label: "Lab & Radiology",    path: "/lab" },
    { id: "notifications",       icon: Bell,             label: "Notifications",      path: "/notifications" },
    { id: "check_number",        icon: Search,           label: "Check Number",       path: "/check-number" },
  ],
  doctor: [
    { id: "dashboard",           icon: LayoutDashboard, label: "Dashboard",          path: "/" },
    { id: "my_cases",            icon: Briefcase,        label: "My Treatment Plans", path: "/my-cases" },
    { id: "tasks",               icon: CheckSquare,      label: "Tasks",              path: "/tasks" },
    { id: "inbox",               icon: Inbox,             label: "Inbox",              path: "/inbox" },
    { id: "whatsapp_connections", icon: Smartphone,        label: "WhatsApp",          path: "/whatsapp-connections" },
    { id: "patients",            icon: Users,            label: "Patients",           path: "/patients" },
    { id: "calendar",            icon: Calendar,         label: "Calendar",           path: "/calendar" },
    { id: "lab_radiology",       icon: FlaskConical,     label: "Lab & Radiology",    path: "/lab" },
    { id: "notifications",       icon: Bell,             label: "Notifications",      path: "/notifications" },
    { id: "check_number",        icon: Search,           label: "Check Number",       path: "/check-number" },
  ],
  // Fallback for any other role — minimal access
  patient: [
    { id: "dashboard",     icon: LayoutDashboard, label: "Dashboard",     path: "/" },
    { id: "notifications", icon: Bell,             label: "Notifications", path: "/notifications" },
  ],
};

const SIDEBAR_WIDTH_KEY = "fertiliv-sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 360;

export default function FertilizLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { data: user, isLoading: loading } = trpc.auth.me.useQuery();
  const [, navigateTo] = useLocation();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background:'linear-gradient(135deg,#1E0566,#2d2b8f)'}}>
        <div className="flex flex-col items-center gap-8 p-10 max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center">
              <Heart className="w-6 h-6 text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Fertiliv</h1>
              <p className="text-xs text-teal-300/80 font-medium tracking-widest uppercase">Clinic Management</p>
            </div>
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold text-white">Welcome back</h2>
            <p className="text-sm text-white/60">Sign in to access your clinic dashboard</p>
          </div>
          <Button
            onClick={() => navigateTo("/login")}
            size="lg"
            className="w-full bg-teal-500 hover:bg-teal-400 text-white font-semibold shadow-lg"
          >
            Sign in to continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <FertilizLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </FertilizLayoutContent>
    </SidebarProvider>
  );
}

function FertilizLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
}) {
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      setLocation("/login");
    },
  });
  const { data: user } = trpc.auth.me.useQuery();
  const logout = () => logoutMutation.mutate();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const role = user?.role ?? "patient";
  const isInboxRoute = location === "/inbox" || location.startsWith("/inbox/");
  const visibleItems: NavItem[] = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.patient;

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - left;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const roleBadgeColor: Record<string, string> = {
    admin: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    doctor: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    staff: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    patient: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  };

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0 bg-sidebar" disableTransition={isResizing}>
          {/* Header */}
          <SidebarHeader className="h-16 border-b border-sidebar-border">
            <div className="flex items-center gap-3 px-3 h-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors shrink-0"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
              </button>
              {!isCollapsed ? (
                <img
                  src="/manus-storage/fertiliv-logo-white_b3e66705.png"
                  alt="Fertiliv"
                  className="h-7 object-contain"
                />
              ) : (
                <img
                  src="/manus-storage/fertiliv-logo-darkblue_72725610.png"
                  alt="Fertiliv"
                  className="w-7 h-7 object-contain shrink-0"
                />
              )}
            </div>
          </SidebarHeader>

          {/* Navigation */}
          <SidebarContent className="py-3">
            <SidebarMenu className="px-2 space-y-0.5">
              {visibleItems.map(item => {
                const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
                const showBadge = item.path === "/notifications" && unreadCount && unreadCount > 0;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 rounded-[10px] transition-all duration-200 font-medium text-[16px] relative ${
                        isActive
                          ? "font-semibold shadow-[0_2px_8px_rgba(227,178,176,0.35)]"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/10"
                      }`}
                      style={isActive ? {background: "linear-gradient(135deg, #E3B2B0, #E5BA99)", color: "#1E0566"} : undefined}
                    >
                      <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-[#1E0566]" : "opacity-70"}`} />
                      <span className="truncate" style={isActive ? {color: "#1E0566"} : undefined}>{item.label}</span>
                      {showBadge && (
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shrink-0">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none">
                  <Avatar className="h-8 w-8 shrink-0 ring-2 ring-sidebar-primary/30">
                    <AvatarFallback className="text-xs font-semibold" style={{background:'rgba(227,178,176,0.25)',color:'#E3B2B0'}}>
                      {user?.name?.charAt(0).toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-sidebar-foreground truncate">{user?.name ?? "User"}</p>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border mt-0.5 ${roleBadgeColor[role] ?? ""}`}>
                          {role}
                        </span>
                      </div>
                      <ChevronDown className="h-3 w-3 text-sidebar-foreground/40 shrink-0" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/my-profile")} className="cursor-pointer">
                  <UserCircle className="mr-2 h-4 w-4" />
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        {!isCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors z-50"
            onMouseDown={() => setIsResizing(true)}
          />
        )}
      </div>

      <SidebarInset className={isInboxRoute ? "min-w-0 h-[100dvh] min-h-0 overflow-hidden" : "min-w-0"}>
        {/* Mobile header */}
        <div className="flex md:hidden border-b h-14 items-center gap-3 px-4 bg-background sticky top-0 z-40">
          <SidebarTrigger className="h-9 w-9 rounded-lg" />
          <img
            src="/manus-storage/fertiliv-logo-darkblue_72725610.png"
            alt="Fertiliv"
            className="h-6 object-contain"
          />
        </div>
        {/* Monitoring consent banner + agent — shown only to staff/manager */}
        {user && (user.role === "staff" || user.role === "manager") && (
          <>
            <MonitoringConsentBanner userRole={user.role} userId={user.id} />
            <MonitoringAgent />
          </>
        )}
        {/* The document owns normal page scrolling. Dialogs opt into their own
            bounded internal scroll only when their content requires it. */}
        <main className={isInboxRoute ? "min-w-0 min-h-0 flex-1 overflow-hidden" : "min-w-0 flex-1"}>{children}</main>
      </SidebarInset>
    </>
  );
}
