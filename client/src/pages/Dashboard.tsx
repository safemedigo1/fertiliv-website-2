import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Clock,
  DollarSign,
  FileText,
  FlaskConical,
  Heart,
  LayoutDashboard,
  Loader2,
  Plus,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format } from "date-fns";

export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role ?? "patient";

  if (role === "patient") return <PatientDashboard />;
  if (role === "doctor") return <DoctorDashboard />;
  if (role === "staff") return <StaffDashboard />;
  return <AdminDashboard />;
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const { data: analytics, isLoading } = trpc.analytics.overview.useQuery();
  const [, setLocation] = useLocation();

  if (isLoading) return <DashboardSkeleton />;

  const stats = analytics?.patientStats;
  const apptStats = analytics?.appointmentStats;
  const finStats = analytics?.financeStats;
  const reportingCurrency = finStats?.reportingCurrency ?? "TRY";
  const unavailableFinanceMetrics = new Set(finStats?.unavailableMetrics ?? []);
  const formatReportingMetric = (metric: "totalRevenue" | "thisMonth" | "outstanding" | "overdue") =>
    unavailableFinanceMetrics.has(metric)
      ? "Not available"
      : `${reportingCurrency} ${Number(finStats?.[metric] ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const revenueData = analytics?.revenueByMonth?.map(r => ({
    month: r.month,
    revenue: Number(r.revenue ?? 0),
  })) ?? [];

  const apptData = analytics?.appointmentsByDay?.map(d => ({
    day: d.day ? format(new Date(d.day), "EEE") : "",
    count: Number(d.count ?? 0),
  })) ?? [];

  const COLORS = ["#0d9488", "#f43f5e", "#f59e0b", "#10b981", "#8b5cf6"];
  const serviceData = analytics?.serviceUtilization?.map((s, i) => ({
    name: s.category?.replace(/_/g, " ") ?? "Other",
    value: Number(s.count ?? 0),
    color: COLORS[i % COLORS.length],
  })) ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{background:'rgba(30,5,102,0.08)'}}>
            <LayoutDashboard className="h-6 w-6" style={{color:'#1E0566'}} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Quick Actions
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setLocation("/finance")} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4 text-[#1E0566]" />
                Create Invoice
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/calendar")} className="gap-2 cursor-pointer">
                <CalendarPlus className="h-4 w-4 text-[#1E0566]" />
                Add Appointment
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/lab")} className="gap-2 cursor-pointer">
                <FlaskConical className="h-4 w-4 text-[#1E0566]" />
                Add Lab Order
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLocation("/patients")} className="gap-2 cursor-pointer">
                <Users className="h-4 w-4" />
                View All Patients
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Patients"
          value={stats?.total ?? 0}
          sub={`${stats?.new_this_month ?? 0} new this month`}
          icon={Users}
          color="teal"
          onClick={() => setLocation("/patients")}
        />
        <KpiCard
          title="Today's Appointments"
          value={apptStats?.today ?? 0}
          sub={`${apptStats?.upcoming ?? 0} upcoming`}
          icon={Calendar}
          color="blue"
          onClick={() => setLocation("/calendar")}
        />
        <KpiCard
          title={`Total Revenue (${reportingCurrency})`}
          value={formatReportingMetric("totalRevenue")}
          sub={`${formatReportingMetric("thisMonth")} this month`}
          icon={DollarSign}
          color="green"
          valueClassName="text-lg sm:text-2xl tracking-tight break-words"
          onClick={() => setLocation("/finance")}
        />
        <KpiCard
          title={`Outstanding (${reportingCurrency})`}
          value={formatReportingMetric("outstanding")}
          sub={`${formatReportingMetric("overdue")} overdue`}
          icon={AlertCircle}
          color="rose"
          valueClassName="text-lg sm:text-2xl tracking-tight break-words"
          onClick={() => setLocation("/finance")}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Monthly Revenue ({reportingCurrency})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${reportingCurrency} ${v}`} />
                  <Tooltip formatter={(v: number) => [`${reportingCurrency} ${v.toLocaleString()}`, "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#0d9488" fill="url(#revenueGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label="Revenue data will appear here" />
            )}
          </CardContent>
        </Card>

        {/* Service Utilization */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Service Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            {serviceData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={serviceData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {serviceData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {serviceData.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                        <span className="text-muted-foreground capitalize">{s.name}</span>
                      </div>
                      <span className="font-medium">{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyChart label="Service data will appear here" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Appointments by Day */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Appointments — Last 7 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {apptData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={apptData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} name="Appointments" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Appointment data will appear here" />
          )}
        </CardContent>
      </Card>

      {/* Appointment Status Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard label="Upcoming" count={apptStats?.upcoming ?? 0} icon={Clock} color="blue" />
        <StatusCard label="Completed" count={apptStats?.completed ?? 0} icon={CheckCircle2} color="green" />
        <StatusCard label="Cancelled" count={apptStats?.cancelled ?? 0} icon={XCircle} color="red" />
        <StatusCard label="Active Patients" count={stats?.active ?? 0} icon={Heart} color="teal" />
      </div>
    </div>
  );
}

// ─── Doctor Dashboard ─────────────────────────────────────────────────────────
function DoctorDashboard() {
  const { user } = useAuth();
  const { data: appointments, isLoading } = trpc.appointments.list.useQuery({
    from: new Date(new Date().setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999)),
  });
  const { data: labOrders } = trpc.lab.orders.useQuery({});
  const [, setLocation] = useLocation();

  const todayAppts = appointments ?? [];
  const pendingLabs = labOrders?.filter(l => l.status !== "completed" && l.status !== "cancelled") ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Good {getGreeting()}, Dr. {user?.name?.split(" ")[0] ?? "Doctor"}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard title="Today's Appointments" value={todayAppts.length} sub="scheduled today" icon={Calendar} color="teal" />
        <KpiCard title="Pending Lab Orders" value={pendingLabs.length} sub="awaiting results" icon={FlaskConical} color="blue" />
        <KpiCard title="Patients" value="—" sub="view all patients" icon={Users} color="purple" onClick={() => setLocation("/patients")} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Today's Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : todayAppts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No appointments scheduled for today</div>
          ) : (
            <div className="space-y-2">
              {todayAppts.slice(0, 8).map(appt => (
                <div key={appt.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => setLocation(`/patients/${appt.patientId}`)}>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {appt.patientFirstName?.[0]}{appt.patientLastName?.[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{appt.patientFirstName} {appt.patientLastName}</p>
                    <p className="text-xs text-muted-foreground truncate">{appt.title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium">{format(new Date(appt.appointmentDate), "h:mm a")}</p>
                    <AppointmentStatusBadge status={appt.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Staff Dashboard ──────────────────────────────────────────────────────────
function StaffDashboard() {
  const { user } = useAuth();
  const { data: appointments } = trpc.appointments.list.useQuery({
    from: new Date(new Date().setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999)),
  });
  const { data: patients } = trpc.patients.stats.useQuery();
  const [, setLocation] = useLocation();

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Good {getGreeting()}, {user?.name?.split(" ")[0] ?? "Staff"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Quick Actions
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setLocation("/finance")} className="gap-2 cursor-pointer">
              <FileText className="h-4 w-4 text-[#1E0566]" />
              Create Invoice
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/calendar")} className="gap-2 cursor-pointer">
              <CalendarPlus className="h-4 w-4 text-[#1E0566]" />
              Add Appointment
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/lab")} className="gap-2 cursor-pointer">
              <FlaskConical className="h-4 w-4 text-[#1E0566]" />
              Add Lab Order
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation("/patients")} className="gap-2 cursor-pointer">
              <Users className="h-4 w-4" />
              View All Patients
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Today's Appointments" value={appointments?.length ?? 0} sub="scheduled" icon={Calendar} color="teal" onClick={() => setLocation("/calendar")} />
        <KpiCard title="Total Patients" value={patients?.total ?? 0} sub={`${patients?.active ?? 0} active`} icon={Users} color="blue" onClick={() => setLocation("/patients")} />
        <KpiCard title="New This Month" value={patients?.new_this_month ?? 0} sub="new patients" icon={Activity} color="green" />
        <KpiCard title="New Leads" value={patients?.total ?? 0} sub="total in pipeline" icon={Users} color="purple" onClick={() => setLocation("/leads")} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Today's Appointments</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/calendar")} className="gap-1 text-xs">
            View Calendar <ArrowRight className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent>
          {!appointments || appointments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No appointments today</div>
          ) : (
            <div className="space-y-2">
              {appointments.slice(0, 6).map(appt => (
                <div key={appt.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => setLocation(`/patients/${appt.patientId}`)}>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {appt.patientFirstName?.[0]}{appt.patientLastName?.[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{appt.patientFirstName} {appt.patientLastName}</p>
                    <p className="text-xs text-muted-foreground">{appt.title} · {appt.patientMrn}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium">{format(new Date(appt.appointmentDate), "h:mm a")}</p>
                    <AppointmentStatusBadge status={appt.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Patient Dashboard ────────────────────────────────────────────────────────
function PatientDashboard() {
  const { user } = useAuth();
  const { data: notifications } = trpc.notifications.list.useQuery();

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Good {getGreeting()}, {user?.name?.split(" ")[0] ?? "Patient"}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Welcome to your health portal</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-teal-500 to-teal-600 text-white border-0">
          <CardContent className="p-5">
            <Heart className="h-8 w-8 mb-3 opacity-80" />
            <p className="text-sm opacity-80">Your Health</p>
            <p className="text-2xl font-bold mt-1">Good</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Calendar className="h-8 w-8 mb-3 text-primary" />
            <p className="text-sm text-muted-foreground">Next Appointment</p>
            <p className="text-lg font-semibold mt-1">Contact clinic</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Bell className="h-8 w-8 mb-3 text-primary" />
            <p className="text-sm text-muted-foreground">Notifications</p>
            <p className="text-2xl font-bold mt-1">{notifications?.filter(n => !n.isRead).length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recent Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {!notifications || notifications.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No notifications yet</div>
          ) : (
            <div className="space-y-2">
              {notifications.slice(0, 5).map(n => (
                <div key={n.id} className={`p-3 rounded-lg border text-sm ${!n.isRead ? "bg-primary/5 border-primary/20" : ""}`}>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────
function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
  valueClassName,
  onClick,
}: {
  title: string;
  value: string | number;
  sub: string;
  icon: React.ElementType;
  color: string;
  valueClassName?: string;
  onClick?: () => void;
}) {
  const colorMap: Record<string, string> = {
    teal: "bg-teal-50 text-teal-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    purple: "bg-purple-50 text-purple-600",
    pink: "",
    peach: "",
    navy: "",
  };
  const brandColorMap: Record<string, {bg: string; color: string}> = {
    pink: {bg: "rgba(227,178,176,0.18)", color: "#E3B2B0"},
    peach: {bg: "rgba(229,186,153,0.18)", color: "#E5BA99"},
    navy: {bg: "rgba(26,20,100,0.08)", color: "#1a1464"},
  };
  const brandStyle = brandColorMap[color];
  return (
    <Card className={`cursor-pointer hover:shadow-md transition-all ${onClick ? "hover:-translate-y-0.5" : ""}`} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{title}</p>
            <p className={`font-bold mt-1.5 text-foreground leading-tight ${valueClassName ?? "text-xl sm:text-2xl"}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>
          </div>
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ml-3 ${brandStyle ? "" : (colorMap[color] ?? "bg-gray-100 text-gray-600")}`}
            style={brandStyle ? {background: brandStyle.bg, color: brandStyle.color} : undefined}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusCard({ label, count, icon: Icon, color }: { label: string; count: number; icon: React.ElementType; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-600",
    green: "text-emerald-600",
    red: "text-red-600",
    teal: "text-teal-600",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-5 w-5 ${colorMap[color] ?? "text-muted-foreground"}`} />
        <div>
          <p className="text-xl font-bold">{count}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AppointmentStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    upcoming: "bg-blue-100 text-blue-700",
    confirmed: "bg-emerald-100 text-emerald-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
    no_show: "bg-orange-100 text-orange-700",
    rescheduled: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">{label}</div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 h-64 bg-muted rounded-xl animate-pulse" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

