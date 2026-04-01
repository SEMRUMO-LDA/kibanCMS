/**
 * useAuth Hook
 * Manages authentication state and user profile
 */

import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Session } from '@supabase/supabase-js';
import { supabase, auth as authHelpers } from '../../../lib/supabase';
import type { Profile } from '../../../shared/types/database.types';

// ============================================
// TYPES
// ============================================

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, metadata?: Record<string, any>) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  refreshSession: () => Promise<void>;
}

// ============================================
// CONTEXT
// ============================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ============================================
// PROVIDER COMPONENT
// ============================================

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch current session
  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const { data, error } = await authHelpers.getSession();
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  // Fetch user profile
  const { data: profile } = useQuery({
    queryKey: ['auth', 'profile', sessionData?.user?.id],
    queryFn: async () => {
      if (!sessionData?.user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionData.user.id)
        .single();

      if (error) throw error;
      return data as Profile;
    },
    enabled: !!sessionData?.user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Sign in mutation
  const signInMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await authHelpers.signIn(email, password);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (error: Error) => {
      setError(error);
    },
  });

  // Sign up mutation
  const signUpMutation = useMutation({
    mutationFn: async ({
      email,
      password,
      metadata
    }: {
      email: string;
      password: string;
      metadata?: Record<string, any>
    }) => {
      const { data, error } = await authHelpers.signUp(email, password, metadata);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (error: Error) => {
      setError(error);
    },
  });

  // Sign out mutation
  const signOutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authHelpers.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.clear(); // Clear all cached data
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (error: Error) => {
      setError(error);
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await authHelpers.resetPassword(email);
      if (error) throw error;
    },
    onError: (error: Error) => {
      setError(error);
    },
  });

  // Update password mutation
  const updatePasswordMutation = useMutation({
    mutationFn: async (newPassword: string) => {
      const { error } = await authHelpers.updatePassword(newPassword);
      if (error) throw error;
    },
    onError: (error: Error) => {
      setError(error);
    },
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      if (!sessionData?.user?.id) throw new Error('No authenticated user');

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', sessionData.user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'profile'] });
    },
    onError: (error: Error) => {
      setError(error);
    },
  });

  // Auth state change listener
  useEffect(() => {
    const { data: authListener } = authHelpers.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        queryClient.invalidateQueries({ queryKey: ['auth'] });
      } else if (event === 'SIGNED_OUT') {
        queryClient.clear();
      }
      setIsLoading(false);
    });

    // Initial session check
    authHelpers.getSession().then(() => {
      setIsLoading(false);
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [queryClient]);

  // Prepare context value
  const value: AuthContextValue = {
    user: sessionData?.user || null,
    profile: profile || null,
    session: sessionData || null,
    isLoading,
    isAuthenticated: !!sessionData?.user,
    error,
    signIn: useCallback(async (email: string, password: string) => {
      await signInMutation.mutateAsync({ email, password });
    }, [signInMutation]),
    signUp: useCallback(async (email: string, password: string, metadata?: Record<string, any>) => {
      await signUpMutation.mutateAsync({ email, password, metadata });
    }, [signUpMutation]),
    signOut: useCallback(async () => {
      await signOutMutation.mutateAsync();
    }, [signOutMutation]),
    resetPassword: useCallback(async (email: string) => {
      await resetPasswordMutation.mutateAsync(email);
    }, [resetPasswordMutation]),
    updatePassword: useCallback(async (newPassword: string) => {
      await updatePasswordMutation.mutateAsync(newPassword);
    }, [updatePasswordMutation]),
    updateProfile: useCallback(async (updates: Partial<Profile>) => {
      await updateProfileMutation.mutateAsync(updates);
    }, [updateProfileMutation]),
    refreshSession: useCallback(async () => {
      await refetchSession();
    }, [refetchSession]),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ============================================
// HOOK
// ============================================

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// ============================================
// UTILITY HOOKS
// ============================================

/**
 * Hook to check if user has specific role
 */
export const useHasRole = (requiredRole: 'admin' | 'editor' | 'viewer'): boolean => {
  const { profile } = useAuth();
  if (!profile) return false;

  const roleHierarchy = {
    admin: 3,
    editor: 2,
    viewer: 1,
  };

  return roleHierarchy[profile.role] >= roleHierarchy[requiredRole];
};

/**
 * Hook to check if user can edit content
 */
export const useCanEdit = (): boolean => {
  const { profile } = useAuth();
  return profile?.role === 'admin' || profile?.role === 'editor';
};

/**
 * Hook for protected routes
 */
export const useRequireAuth = (redirectTo = '/login'): AuthContextValue => {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      window.location.href = redirectTo;
    }
  }, [auth.isLoading, auth.isAuthenticated, redirectTo]);

  return auth;
};

/**
 * Hook for guest-only routes (login, signup)
 */
export const useRequireGuest = (redirectTo = '/dashboard'): AuthContextValue => {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated) {
      window.location.href = redirectTo;
    }
  }, [auth.isLoading, auth.isAuthenticated, redirectTo]);

  return auth;
};