import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/hooks/useAuth';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider } from './lib/i18n';
// Eager: what every session needs on first paint
import { Login } from './pages/Login';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Dashboard } from './pages/Dashboard';
import { Collections } from './pages/Collections';
import { CollectionEntries } from './pages/CollectionEntries';
import { Settings } from './pages/Settings';
import { Addons } from './pages/Addons';
import { ActivityLog } from './pages/ActivityLog';
// SiteSettings merged into unified Settings page

// Lazy: loaded on first visit to the route. Keeps the rich-text editor
// (TipTap), the collection builder and the add-on pages out of the first chunk.
const lazyPage = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, name: K) =>
  React.lazy(() => load().then(m => ({ default: m[name] })));
const Onboarding = lazyPage(() => import('./pages/Onboarding'), 'Onboarding');
const CollectionBuilder = lazyPage(() => import('./pages/CollectionBuilder'), 'CollectionBuilder');
const EntryEdit = lazyPage(() => import('./pages/EntryEdit'), 'EntryEdit');
const Media = lazyPage(() => import('./pages/Media'), 'Media');
const Users = lazyPage(() => import('./pages/Users'), 'Users');
const CollectionEdit = lazyPage(() => import('./pages/CollectionEdit'), 'CollectionEdit');
const Diagnostics = lazyPage(() => import('./pages/Diagnostics'), 'Diagnostics');
const BookingsManager = lazyPage(() => import('./pages/BookingsManager'), 'BookingsManager');
const OrdersManager = lazyPage(() => import('./pages/OrdersManager'), 'OrdersManager');
const AffiliatesManager = lazyPage(() => import('./pages/AffiliatesManager'), 'AffiliatesManager');
const AffiliateDetail = lazyPage(() => import('./pages/AffiliateDetail'), 'AffiliateDetail');
const CommissionReport = lazyPage(() => import('./pages/CommissionReport'), 'CommissionReport');
const TrashManager = lazyPage(() => import('./pages/TrashManager'), 'TrashManager');
const SiteNotes = lazyPage(() => import('./pages/SiteNotes'), 'SiteNotes');
const I18nManager = lazyPage(() => import('./pages/I18nManager'), 'I18nManager');
const CookieNoticeSettings = lazyPage(() => import('./pages/CookieNoticeSettings'), 'CookieNoticeSettings');
const AccessibilitySettings = lazyPage(() => import('./pages/AccessibilitySettings'), 'AccessibilitySettings');
const WidgetClusterSettings = lazyPage(() => import('./pages/WidgetClusterSettings'), 'WidgetClusterSettings');
const WhatsAppWidgetSettings = lazyPage(() => import('./pages/WhatsAppWidgetSettings'), 'WhatsAppWidgetSettings');
const PostTourReviewsSettings = lazyPage(() => import('./pages/PostTourReviewsSettings'), 'PostTourReviewsSettings');
const NewsletterBrevoSettings = lazyPage(() => import('./pages/NewsletterBrevoSettings'), 'NewsletterBrevoSettings');
const ChannelManagerSettings = lazyPage(() => import('./pages/ChannelManagerSettings'), 'ChannelManagerSettings');

const PageLoading = () => (
  <div style={{ padding: '80px 0', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
    <div style={{ width: '32px', height: '32px', margin: '0 auto 12px', border: '3px solid #e5e7eb', borderTopColor: '#0d9488', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// Protected Route Wrapper — never shows a blank page.
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, profile } = useAuth();

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 50%, #ecfeff 100%)',
        gap: '12px',
      }}>
        <div style={{
          width: '40px', height: '40px',
          border: '3px solid #e5e7eb', borderTopColor: '#0d9488',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: '#6b7280', fontSize: '14px' }}>Loading kibanCMS...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Onboarding check — only if profile is loaded (non-blocking)
  // Only admins set up the project; invited editors/authors/viewers go
  // straight to the dashboard (they can't create collections anyway).
  if (
    profile &&
    !profile.onboarding_completed &&
    ['super_admin', 'admin'].includes(profile.role) &&
    window.location.pathname !== '/onboarding'
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

const AppContent = () => {
  return (
    <React.Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="content" element={<Collections />} />
        <Route path="content/builder" element={<CollectionBuilder />} />
        <Route path="content/:slug/edit-collection" element={<CollectionEdit />} />
        <Route path="content/:collectionSlug" element={<CollectionEntries />} />
        <Route path="content/:collectionSlug/new" element={<EntryEdit />} />
        <Route path="content/:collectionSlug/edit/:entryId" element={<EntryEdit />} />
        <Route path="media" element={<Media />} />
        <Route path="users" element={<Users />} />
        {/* site-settings redirects to unified settings */}
        <Route path="site-settings" element={<Navigate to="/settings?tab=general" replace />} />
        <Route path="activity" element={<ActivityLog />} />
        <Route path="addons" element={<Addons />} />
        <Route path="bookings" element={<BookingsManager />} />
        <Route path="orders" element={<OrdersManager />} />
        <Route path="affiliates" element={<AffiliatesManager />} />
        <Route path="affiliates/report" element={<CommissionReport />} />
        <Route path="affiliates/:id" element={<AffiliateDetail />} />
        <Route path="trash" element={<TrashManager />} />
        <Route path="site-notes" element={<SiteNotes />} />
        <Route path="i18n" element={<I18nManager />} />
        <Route path="settings" element={<Settings />} />
        <Route path="addons/cookie-notice" element={<CookieNoticeSettings />} />
        <Route path="addons/accessibility" element={<AccessibilitySettings />} />
        <Route path="addons/widget-cluster" element={<WidgetClusterSettings />} />
        <Route path="addons/whatsapp-widget" element={<WhatsAppWidgetSettings />} />
        <Route path="addons/post-tour-reviews" element={<PostTourReviewsSettings />} />
        <Route path="addons/newsletter" element={<NewsletterBrevoSettings />} />
        <Route path="addons/channel-manager" element={<ChannelManagerSettings />} />
        <Route path="diagnostics" element={<Diagnostics />} />

        {/* Placeholder for other routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </React.Suspense>
  );
};

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
