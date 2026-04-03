import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/hooks/useAuth';
import { ToastProvider } from './components/Toast';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Dashboard } from './pages/Dashboard';
import { Collections } from './pages/Collections';
import { CollectionBuilder } from './pages/CollectionBuilder';
import { CollectionEntries } from './pages/CollectionEntries';
import { EntryEdit } from './pages/EntryEdit';
import { Media } from './pages/Media';
import { Users } from './pages/Users';
import { CollectionEdit } from './pages/CollectionEdit';
import { Settings } from './pages/Settings';
import { Addons } from './pages/Addons';
// SiteSettings merged into unified Settings page
import { Diagnostics } from './pages/Diagnostics';

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
  if (profile && !profile.onboarding_completed && window.location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

const AppContent = () => {
  return (
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
        <Route path="addons" element={<Addons />} />
        <Route path="settings" element={<Settings />} />
        <Route path="diagnostics" element={<Diagnostics />} />

        {/* Placeholder for other routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
