import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { BarChart3, Loader2 } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

export default function AnalyticsPage() {
  const { data: analytics, isLoading } = trpc.analytics.overview.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const revenueData = analytics?.revenueByMonth?.map(r => ({
    month: r.month,
    revenue: Number(r.revenue ?? 0),
  })) ?? [];

  const apptData = analytics?.appointmentsByDay?.map(d => ({
    day: d.day ? format(new Date(d.day), "EEE d") : "",
    count: Number(d.count ?? 0),
  })) ?? [];

  const COLORS = ["#0d9488", "#f43f5e", "#f59e0b", "#10b981", "#8b5cf6"];
  const serviceData = analytics?.serviceUtilization?.map((s, i) => ({
    name: s.category?.replace(/_/g, " ") ?? "Other",
    value: Number(s.count ?? 0),
    color: COLORS[i % COLORS.length],
  })) ?? [];

  const stats = analytics?.patientStats;
  const apptStats = analytics?.appointmentStats;
  const finStats = analytics?.financeStats;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Clinic performance overview</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Patients", value: stats?.total ?? 0, sub: `${stats?.active ?? 0} active` },
          { label: "Today's Appts", value: apptStats?.today ?? 0, sub: `${apptStats?.upcoming ?? 0} upcoming` },
          { label: "Completed", value: apptStats?.completed ?? 0, sub: "all time" },
          { label: "Revenue", value: `$${(finStats?.totalRevenue ?? 0).toLocaleString()}`, sub: `$${(finStats?.thisMonth ?? 0).toLocaleString()} this month` },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Monthly Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {revenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]} />
                <Area type="monotone" dataKey="revenue" stroke="#0d9488" fill="url(#revGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No revenue data yet</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appointments by Day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Appointments — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {apptData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={apptData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} name="Appointments" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No appointment data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Service Utilization */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Service Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            {serviceData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={serviceData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {serviceData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  {serviceData.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="text-muted-foreground capitalize truncate">{s.name}</span>
                      <span className="font-medium ml-auto">{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No service data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Appointment Status Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Appointment Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Upcoming", count: apptStats?.upcoming ?? 0, color: "#3b82f6" },
              { label: "Completed", count: apptStats?.completed ?? 0, color: "#10b981" },
              { label: "Cancelled", count: apptStats?.cancelled ?? 0, color: "#ef4444" },
              { label: "Today", count: apptStats?.today ?? 0, color: "#0d9488" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                <div>
                  <p className="text-xl font-bold">{s.count}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Leads Analytics */}
      <LeadsAnalyticsSection />
    </div>
  );
}

function LeadsAnalyticsSection() {
  const { data: stats } = trpc.leads.stats.useQuery();
  const { data: leadsResult } = trpc.leads.list.useQuery({ pageSize: 1000 });
  const leads = leadsResult?.data;

  const COLORS = ["#0d9488", "#f43f5e", "#f59e0b", "#10b981", "#8b5cf6", "#3b82f6", "#ec4899"];

  // Lead source breakdown
  const sourceMap: Record<string, number> = {};
  leads?.forEach(l => {
    const src = l.leadSource ?? "unknown";
    sourceMap[src] = (sourceMap[src] ?? 0) + 1;
  });
  const sourceData = Object.entries(sourceMap).map(([name, value], i) => ({
    name: name.replace(/-/g, " "),
    value,
    color: COLORS[i % COLORS.length],
  }));

  // Lead status breakdown
  const statusMap: Record<string, number> = {};
  leads?.forEach(l => {
    statusMap[l.leadStatus] = (statusMap[l.leadStatus] ?? 0) + 1;
  });
  const statusData = Object.entries(statusMap).map(([name, value]) => ({
    name: name.replace(/-/g, " "),
    value,
  }));

  return (
    <>
      <div className="flex items-center gap-2 pt-2">
        <h2 className="text-lg font-semibold">Leads Overview</h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: stats?.total ?? 0, color: "#3b82f6" },
          { label: "In Intake", value: stats?.intake ?? 0, color: "#f59e0b" },
          { label: "Converted", value: stats?.converted ?? 0, color: "#10b981" },
          { label: "Lost", value: stats?.lost ?? 0, color: "#ef4444" },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
            <div>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Source */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Lead Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={sourceData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {sourceData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  {sourceData.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="text-muted-foreground capitalize truncate">{s.name}</span>
                      <span className="font-medium ml-auto">{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No lead data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Lead Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Lead Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={statusData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0d9488" radius={[0, 4, 4, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No lead data yet</div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
