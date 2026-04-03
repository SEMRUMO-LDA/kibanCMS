import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const profileFetchedForId = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) {
        console.error('[Auth] Profile fetch error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('[Auth] Profile fetch exception:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    // Only use onAuthStateChange as the single source of truth.
    // Supabase fires INITIAL_SESSION immediately when subscribing,
    // so we don't need a separate getSession() call.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!active) return;

      // Update session and user synchronously
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);

      if (!newSession?.user) {
        setProfile(null);
        profileFetchedForId.current = null;
        return;
      }

      // Only fetch profile on SIGNED_IN or first load (INITIAL_SESSION).
      // Skip TOKEN_REFRESHED — profile doesn't change on token refresh.
      if (_event === 'SIGNED_IN' || (_event === 'INITIAL_SESSION' && profileFetchedForId.current !== newSession.user.id)) {
        profileFetchedForId.current = newSession.user.id;
        const profileData = await fetchProfile(newSession.user.id);
        if (active && profileData) setProfile(profileData);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('[Auth] SignOut error:', error);
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
      profileFetchedForId.current = null;
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
