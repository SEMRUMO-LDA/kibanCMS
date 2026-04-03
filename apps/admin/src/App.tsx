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
import { Settings } from './pages/Settings';

// Protected Route Wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, profile } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 50%, #ecfeff 100%)' }}>
        <p style={{ color: '#6b7280' }}>Loading kibanCMS...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Check if onboarding is needed
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
        <Route path="content/:collectionSlug" element={<CollectionEntries />} />
        <Route path="content/:collectionSlug/new" element={<EntryEdit />} />
        <Route path="content/:collectionSlug/edit/:entryId" element={<EntryEdit />} />
        <Route path="media" element={<Media />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<Settings />} />

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
