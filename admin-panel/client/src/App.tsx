import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { NotificationProvider } from './components/ui/NotificationSystem'
import { LoadingSpinner } from './components/ui/LoadingSpinner'
import { ErrorBoundary } from './components/ui/LoadingStates'
import { LoginPage } from './pages/auth/LoginPage'
import { DashboardLayout } from './layouts/DashboardLayout'
import DashboardPage from './pages/dashboard/DashboardPage'
import { AdminsPage } from './pages/admin/AdminsPage'
import { AcceptInvitation } from './pages/admin/AcceptInvitation'
import { AdminManagement } from './pages/admin/AdminManagement'
import UsersPage from './pages/users/UsersPage'
import UserDetailPage from './pages/users/UserDetailPage'
import TeamsPage from './pages/teams/TeamsPage'
import RefundsPage from './pages/refunds/RefundsPage'
import SubscriptionsPage from './pages/subscriptions/SubscriptionsPage'
import SupportTicketsPage from './pages/support/SupportTicketsPage'
import MaintenancePage from './pages/maintenance/MaintenancePage'
import { CouponsPage } from './pages/coupons/CouponsPage'
import { AnalyticsPage } from './pages/analytics/AnalyticsPage'
import { AuditLogsPage } from './pages/audit/AuditLogsPage'
import AIModerationPage from './pages/ai-moderation/AIModerationPage'
import PerformanceAnalyticsPage from './pages/performance/PerformanceAnalyticsPage'
import WebhookManagementPage from './pages/webhooks/WebhookManagementPage'
import MaintenanceBannerPage from './pages/maintenance/MaintenanceBannerPage'
import SessionManagementPage from './pages/sessions/SessionManagementPage'
import BulkOperationsPage from './pages/bulk-operations/BulkOperationsPage'
import WaitlistManagement from './pages/waitlist/WaitlistManagement'
import { SettingsPage } from './pages/settings/SettingsPage'
import { NotFoundPage } from './pages/NotFoundPage'

function App() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <NotificationProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </ErrorBoundary>
        </NotificationProvider>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <NotificationProvider>
        <ErrorBoundary>
          <DashboardLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/admins" element={<AdminsPage />} />
              <Route path="/admin/accept-invitation" element={<AcceptInvitation />} />
              <Route path="/admin/management" element={<AdminManagement />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/users/:userId" element={<UserDetailPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/refunds" element={<RefundsPage />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              <Route path="/tickets" element={<SupportTicketsPage />} />
              <Route path="/maintenance" element={<MaintenancePage />} />
              <Route path="/coupons" element={<CouponsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/audit" element={<AuditLogsPage />} />
              <Route path="/ai-moderation" element={<AIModerationPage />} />
              <Route path="/performance" element={<PerformanceAnalyticsPage />} />
              <Route path="/webhooks" element={<WebhookManagementPage />} />
              <Route path="/maintenance-banners" element={<MaintenanceBannerPage />} />
              <Route path="/sessions" element={<SessionManagementPage />} />
              <Route path="/bulk-operations" element={<BulkOperationsPage />} />
              <Route path="/waitlist" element={<WaitlistManagement />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </DashboardLayout>
        </ErrorBoundary>
      </NotificationProvider>
    </ThemeProvider>
  )
}

export default App
