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
  const initialised = useRef(false);

  const fetchProfile = useCallback(async (userId: string): Promise<any | null> => {
    try {
      const { data, error } = await Promise.race([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      if (error) return null;
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    // ── Phase 1: Fast init from localStorage ──
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || initialised.current) return;
      initialised.current = true;

      if (error || !data.session) {
        setLoading(false);
        return;
      }

      setSession(data.session);
      setUser(data.session.user);
      setLoading(false);

      if (profileFetchedForId.current !== data.session.user.id) {
        profileFetchedForId.current = data.session.user.id;
        fetchProfile(data.session.user.id).then((p) => {
          if (active && p) setProfile(p);
        });
      }
    }).catch(() => {
      if (active) setLoading(false);
    });

    // ── Phase 2: Auth state listener ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!active) return;

      if (event === 'INITIAL_SESSION') {
        if (!initialised.current) {
          initialised.current = true;
          setSession(newSession);
          setUser(newSession?.user ?? null);
          setLoading(false);
        }
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        if (newSession) {
          setSession(newSession);
          setUser(newSession.user ?? null);
        }
        return;
      }

      if (event === 'SIGNED_IN' && newSession?.user) {
        setSession(newSession);
        setUser(newSession.user);
        setLoading(false);
        profileFetchedForId.current = newSession.user.id;
        const p = await fetchProfile(newSession.user.id);
        if (active && p) setProfile(p);
        return;
      }

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        profileFetchedForId.current = null;
        setLoading(false);
        return;
      }
    });

    // ── Phase 3: Periodic session health check (every 60s) ──
    // Detects dead tokens that Supabase didn't fire SIGNED_OUT for.
    const healthCheck = setInterval(async () => {
      if (!active) return;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session && session) {
          // Session died silently — force logout
          console.warn('[Auth] Session expired — redirecting to login');
          setSession(null);
          setUser(null);
          setProfile(null);
          profileFetchedForId.current = null;
        }
      } catch {
        // Ignore — network might be temporarily down
      }
    }, 60000);

    // ── Safety timeout ──
    const timeout = setTimeout(() => {
      if (active && !initialised.current) {
        initialised.current = true;
        setLoading(false);
      }
    }, 5000);

    return () => {
      active = false;
      clearTimeout(timeout);
      clearInterval(healthCheck);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ── Sign out — with 3s timeout to prevent hanging ──
  const signOut = useCallback(async () => {
    // Clear state FIRST, then try to tell Supabase
    setSession(null);
    setUser(null);
    setProfile(null);
    profileFetchedForId.current = null;
    setLoading(false);

    // Clear localStorage manually as backup
    try { localStorage.removeItem('sb-' + new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0] + '-auth-token'); } catch {}

    // Tell Supabase (with timeout — don't hang if server is dead)
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // Ignore — state is already cleared
    }
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
