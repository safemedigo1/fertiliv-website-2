import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import FertilizLayout from "./components/FertilizLayout";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage";
import PatientsPage from "./pages/PatientsPage";
import PatientDetailPage from "./pages/PatientDetailPage";
import ServicesPage from "./pages/ServicesPage";
import FinancePage from "./pages/FinancePage";
import LabPage from "./pages/LabPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import NotificationsPage from "./pages/NotificationsPage";
import UnifiedInboxPage from "./pages/UnifiedInboxPage";
import UnifiedConversationDetailPage from "./pages/UnifiedConversationDetailPage";
import WhatsAppConnectionsPage from "./pages/WhatsAppConnectionsPage";
import WhatsAppSessionMonitorPage from "./pages/WhatsAppSessionMonitorPage";
import UsersPage from "./pages/UsersPage";
import DoctorsPage from "./pages/DoctorsPage";
import LoginPage from "./pages/LoginPage";
import LeadsPage from "./pages/LeadsPage";
import LeadDetailPage from "./pages/LeadDetailPage";
import TreatmentPackagesPage from "./pages/TreatmentPackagesPage";
import SettingsPage from "./pages/SettingsPage";
import AvailabilityPage from "./pages/AvailabilityPage";
import AuditLogPage from "./pages/AuditLogPage";
import DoctorMyProfilePage from "./pages/DoctorMyProfilePage";
import StaffMyProfilePage from "./pages/StaffMyProfilePage";
import DoctorMyCasesPage from "./pages/DoctorMyCasesPage";
import DoctorCaseViewPage from "./pages/DoctorCaseViewPage";
import CheckNumberPage from "./pages/CheckNumberPage";
import IntakeWizardPage from "./pages/IntakeWizardPage";
import DynamicIntakeWizardPage from "./pages/DynamicIntakeWizardPage";
import TasksPage from "./pages/TasksPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ImportPage from "./pages/ImportPage";
import DataIOPage from "./pages/DataIOPage";
import DicomViewerPage from "./pages/DicomViewerPage";
import MonitoringPage from "./pages/MonitoringPage";
import IntakeFormBuilderPage from "./pages/IntakeFormBuilderPage";
import LabDictionaryAdmin from "./pages/LabDictionaryAdmin";
import PatientCreditPayoutReceiptPage from "./pages/PatientCreditPayoutReceiptPage";
import { trpc } from "./lib/trpc";
import { useAuditTracker } from "./hooks/useAuditTracker";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

// ─── Role Guard — blocks specific routes for specific roles ──────────────────
function RoleGuard({
  allowedRoles,
  children,
  redirectTo = "/my-cases",
}: {
  allowedRoles: string[];
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user && !allowedRoles.includes(user.role)) {
      navigate(redirectTo);
    }
  }, [user, isLoading]);

  if (isLoading) return null;
  if (user && !allowedRoles.includes(user.role)) return null;
  return <>{children}</>;
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-emerald-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          <p className="text-sm text-muted-foreground">Loading Fertiliv...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

// ─── Audit Tracker (mounts inside auth shell) ───────────────────────────────
function AuditTrackerMount() {
  useAuditTracker();
  return null;
}

// ─── Protected App ────────────────────────────────────────────────────────────
function ProtectedApp() {
  return (
    <AuthGuard>
      <FertilizLayout>
        <AuditTrackerMount />
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/patients" component={PatientsPage} />
          <Route path="/patients/:id" component={PatientDetailPage} />
          <Route path="/services" component={ServicesPage} />
          <Route path="/finance" component={FinancePage} />
          <Route path="/lab" component={LabPage} />
          <Route path="/analytics" component={AnalyticsPage} />
          <Route path="/notifications" component={NotificationsPage} />
          <Route path="/inbox/:id" component={UnifiedConversationDetailPage} />
          <Route path="/inbox" component={UnifiedInboxPage} />
          <Route path="/whatsapp-connections" component={WhatsAppConnectionsPage} />
          <Route path="/whatsapp-sessions">
            <RoleGuard allowedRoles={["admin"]} redirectTo="/inbox">
              <WhatsAppSessionMonitorPage />
            </RoleGuard>
          </Route>
          <Route path="/users" component={UsersPage} />
          <Route path="/doctors" component={DoctorsPage} />
          {/* Leads routes — blocked for doctor role */}
          <Route path="/leads">
            <RoleGuard allowedRoles={["admin", "manager", "staff"]} redirectTo="/my-cases">
              <LeadsPage />
            </RoleGuard>
          </Route>
          <Route path="/leads/:id">{(params) => (
            <RoleGuard allowedRoles={["admin", "manager", "staff"]} redirectTo="/my-cases">
              <LeadDetailPage leadId={parseInt(params.id)} />
            </RoleGuard>
          )}</Route>
          {/* Doctor read-only case view */}
          <Route path="/doctor-case/:id">{(params) => (
            <DoctorCaseViewPage leadId={parseInt(params.id)} />
          )}</Route>
          <Route path="/treatment-packages" component={TreatmentPackagesPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/availability" component={AvailabilityPage} />
          <Route path="/audit-log" component={AuditLogPage} />
          <Route path="/my-profile" component={MyProfileRouter} />
          <Route path="/my-cases" component={DoctorMyCasesPage} />
          <Route path="/check-number" component={CheckNumberPage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/import" component={ImportPage} />
          {/* Export/Import Data — admin only */}
          <Route path="/data-io">
            <RoleGuard allowedRoles={["admin"]} redirectTo="/">
              <DataIOPage />
            </RoleGuard>
          </Route>
          {/* Intake Form Builder — admin only */}
          <Route path="/form-builder">
            <RoleGuard allowedRoles={["admin"]} redirectTo="/">
              <IntakeFormBuilderPage />
            </RoleGuard>
          </Route>
          {/* Remote Monitoring — admin only */}
          <Route path="/monitoring">
            <RoleGuard allowedRoles={["admin"]} redirectTo="/">
              <MonitoringPage />
            </RoleGuard>
          </Route>
          {/* Lab Dictionary — admin only */}
          <Route path="/lab-dictionary">
            <RoleGuard allowedRoles={["admin"]} redirectTo="/">
              <LabDictionaryAdmin />
            </RoleGuard>
          </Route>
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </FertilizLayout>
    </AuthGuard>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────
function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/intake" component={DynamicIntakeWizardPage} />
      <Route path="/intake-legacy" component={IntakeWizardPage} />
      <Route path="/dicom-viewer" component={DicomViewerPage} />
      <Route path="/finance/payout-receipts/:payoutId">{(params) => (
        <AuthGuard><PatientCreditPayoutReceiptPage payoutId={parseInt(params.payoutId, 10)} /></AuthGuard>
      )}</Route>
      <Route component={ProtectedApp} />
    </Switch>
  );
}

// ─── Role-aware profile router ──────────────────────────────────────────────
function MyProfileRouter() {
  const { data: user } = trpc.auth.me.useQuery();
  if (!user) return null;
  if (user.role === "doctor") return <DoctorMyProfilePage />;
  return <StaffMyProfilePage />;
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" closeButton duration={5000} />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
