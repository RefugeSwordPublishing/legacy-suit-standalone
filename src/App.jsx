import { useEffect } from 'react'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { UserProvider, useCurrentUser } from '@/lib/UserContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import Templates from '@/pages/Templates';
import MaterialsDashboard from '@/pages/MaterialsDashboard';
import UsersPage from '@/pages/UsersPage';
import Tasks from '@/pages/Tasks';
import NotificationSettings from '@/pages/NotificationSettings';
import ClientPortal from '@/pages/ClientPortal';
import ClientRequests from '@/pages/ClientRequests';
import Schedules from '@/pages/Schedules';
import CrewSchedule from '@/pages/CrewSchedule';
import TeamChat from '@/pages/TeamChat';
import MyNotifications from '@/pages/MyNotifications';
import TimeOffRequests from '@/pages/TimeOffRequests';
import Reports from '@/pages/Reports';
import PhaseApprovals from '@/pages/PhaseApprovals';
import DailyGoals from '@/pages/DailyGoals';
import Timecards from '@/pages/Timecards';
import TimecardReport from '@/pages/TimecardReport';
import SubContractors from '@/pages/SubContractors';
import SubmitBid from '@/pages/SubmitBid';
import Clients from '@/pages/Clients';
import CostCodes from '@/pages/CostCodes';
import Estimates from '@/pages/Estimates';
import EstimateBuilder from '@/pages/EstimateBuilder';
import TemplateBuilder from '@/pages/TemplateBuilder';
import Invoices from '@/pages/Invoices';
import QBOSettings from '@/pages/QBOSettings';
import XeroSettings from '@/pages/XeroSettings';
import GustoSettings from '@/pages/GustoSettings';
import InvoiceSettings from '@/pages/InvoiceSettings';
import ErrorLogs from '@/pages/ErrorLogs';
import ExpenseCategories from '@/pages/ExpenseCategories';
import SettingsHub from '@/pages/SettingsHub';
import CustomRoles from '@/pages/CustomRoles';
import ClientEstimate from '@/pages/ClientEstimate';
import Expenses from '@/pages/Expenses';
import Permissions from '@/pages/Permissions';
import ChangeOrderBuilder from '@/pages/ChangeOrderBuilder';
import ClientChangeOrder from '@/pages/ClientChangeOrder';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Login from '@/pages/Login';
import ResetPassword from '@/pages/ResetPassword';
import BrandingApplier from '@/components/shared/BrandingApplier';

const ThemedApp = ({ children }) => {
  const { currentUser } = useCurrentUser();
  // Per-user theme wins; otherwise fall back to the tenant's default theme, then light.
  const theme = currentUser?.theme || currentUser?.branding?.default_theme || 'light';
  // On the native Android app, register for FCM push once signed in.
  useEffect(() => {
    if (currentUser?.id) import('@/lib/push').then((m) => m.registerNativePush?.()).catch(() => {});
  }, [currentUser?.id]);
  return (
    <ThemeProvider theme={theme}>
      <BrandingApplier />
      {children}
    </ThemeProvider>
  );
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated } = useAuth();

  // These routes are fully public, no auth or permission checks
  const path = window.location.pathname;
  const isPublicRoute =
    path.startsWith('/submit-bid') ||
    path.startsWith('/client-estimate') ||
    path.startsWith('/client-change-order') ||
    path.startsWith('/reset-password');

  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/submit-bid" element={<SubmitBid />} />
        <Route path="/submit-bid/:id" element={<SubmitBid />} />
        <Route path="/client-estimate" element={<ClientEstimate />} />
        <Route path="/client-estimate/:id" element={<ClientEstimate />} />
        <Route path="/client-change-order/:id" element={<ClientChangeOrder />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    );
  }

  // Show loading splash while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 bg-primary flex flex-col items-center justify-center gap-6">
        <img src="/guildwright-iconHD.png" alt="GuildWright" width={72} height={72} className="mx-auto rounded-xl" />
        <div className="text-center">
          <h1 style={{ fontFamily: 'var(--font-butler)' }} className="text-3xl font-bold text-primary-foreground tracking-wide">GuildWright</h1>
          <p className="text-primary-foreground/60 text-sm mt-1" style={{ fontFamily: 'var(--font-highway)' }}>One System. Every Job.</p>
        </div>
        <div className="w-8 h-8 border-4 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"></div>
      </div>
    );
  }

  // Not signed in -> show the login screen
  if (!isAuthenticated) {
    return <Login />;
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/tasks" element={<ProtectedRoute tier="field" proFeature="Tasks"><Tasks /></ProtectedRoute>} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/materials" element={<ProtectedRoute tier="pro" proFeature="Materials"><MaterialsDashboard /></ProtectedRoute>} />
        <Route path="/templates" element={<ProtectedRoute tier="field" proFeature="Templates"><Templates /></ProtectedRoute>} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/notification-settings" element={<NotificationSettings />} />
        <Route path="/client-portal" element={<ClientPortal />} />
        <Route path="/client-requests" element={<ProtectedRoute tier="field" proFeature="Client Requests"><ClientRequests /></ProtectedRoute>} />
        <Route path="/schedules" element={<ProtectedRoute tier="field" proFeature="Scheduling"><Schedules /></ProtectedRoute>} />
        <Route path="/crew-schedule" element={<ProtectedRoute tier="field" proFeature="Scheduling"><CrewSchedule /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute tier="field" proFeature="Team Chat"><TeamChat /></ProtectedRoute>} />
        <Route path="/notifications" element={<MyNotifications />} />
        <Route path="/time-off" element={<TimeOffRequests />} />
        <Route path="/reports" element={<ProtectedRoute tier="pro" proFeature="Reports" featureKey="reports"><Reports /></ProtectedRoute>} />
        <Route path="/phase-approvals" element={<ProtectedRoute tier="field" proFeature="Phase Approvals"><PhaseApprovals /></ProtectedRoute>} />
        <Route path="/daily-goals" element={<ProtectedRoute tier="field" proFeature="Daily Goals"><DailyGoals /></ProtectedRoute>} />
        <Route path="/timecards" element={<Timecards />} />
        <Route path="/timecard-report" element={<TimecardReport />} />
        <Route path="/sub-contractors" element={<ProtectedRoute tier="pro" proFeature="Subcontractors" featureKey="subcontractors"><SubContractors /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute tier="field" proFeature="Clients" featureKey="clients"><Clients /></ProtectedRoute>} />
        <Route path="/cost-codes" element={<ProtectedRoute tier="pro" proFeature="Cost Codes"><CostCodes /></ProtectedRoute>} />
        <Route path="/estimates" element={<ProtectedRoute tier="field" proFeature="Estimates" featureKey="estimates"><Estimates /></ProtectedRoute>} />
        <Route path="/estimates/templates/new" element={<ProtectedRoute tier="field" proFeature="Estimates" featureKey="estimates"><TemplateBuilder /></ProtectedRoute>} />
        <Route path="/estimates/templates/:id" element={<ProtectedRoute tier="field" proFeature="Estimates" featureKey="estimates"><TemplateBuilder /></ProtectedRoute>} />
        <Route path="/estimates/:id" element={<ProtectedRoute tier="field" proFeature="Estimates" featureKey="estimates"><EstimateBuilder /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute tier="pro" proFeature="Invoices" featureKey="invoices"><Invoices /></ProtectedRoute>} />
        <Route path="/qbo-settings" element={<ProtectedRoute tier="pro" proFeature="QuickBooks"><QBOSettings /></ProtectedRoute>} />
        <Route path="/xero-settings" element={<ProtectedRoute tier="pro" proFeature="Xero"><XeroSettings /></ProtectedRoute>} />
        <Route path="/gusto-settings" element={<ProtectedRoute tier="pro" proFeature="Gusto Payroll"><GustoSettings /></ProtectedRoute>} />
        <Route path="/invoice-settings" element={<ProtectedRoute tier="pro" proFeature="Invoices"><InvoiceSettings /></ProtectedRoute>} />
        <Route path="/error-logs" element={<ErrorLogs />} />
        <Route path="/expense-categories" element={<ProtectedRoute tier="pro" proFeature="Expenses"><ExpenseCategories /></ProtectedRoute>} />
        <Route path="/settings" element={<SettingsHub />} />
        <Route path="/roles" element={<CustomRoles />} />
        <Route path="/expenses" element={<ProtectedRoute tier="pro" proFeature="Expenses" featureKey="expenses"><Expenses /></ProtectedRoute>} />
        <Route path="/permissions" element={<Permissions />} />
        <Route path="/change-orders/:id" element={<ProtectedRoute tier="pro" proFeature="Change Orders" featureKey="change_orders"><ChangeOrderBuilder /></ProtectedRoute>} />
      </Route>
      <Route path="/submit-bid" element={<SubmitBid />} />
      <Route path="/client-estimate" element={<ClientEstimate />} />
      <Route path="/client-change-order/:id" element={<ClientChangeOrder />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <UserProvider>
          <ThemedApp>
            <Router>
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </ThemedApp>
        </UserProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App