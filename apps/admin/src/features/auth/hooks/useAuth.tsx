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

/**
 * AuthProvider — single source of truth for auth state.
 *
 * Design principles:
 * 1. NEVER hang — loading always resolves within 5 seconds max.
 * 2. Two-phase init: getSession() for speed, onAuthStateChange for reactivity.
 * 3. Profile fetch is non-blocking — UI renders without it.
 * 4. TOKEN_REFRESHED is ignored for profile (profile doesn't change).
 * 5. All errors are caught and logged — never thrown to the UI.
 */
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const profileFetchedForId = useRef<string | null>(null);
  const initialised = useRef(false);

  const fetchProfile = useCallback(async (userId: string): Promise<any | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) {
        console.warn('[Auth] Profile fetch failed:', error.message);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    // ── Phase 1: Fast init via getSession() ──
    // This resolves immediately from localStorage cache.
    // It does NOT depend on navigator.locks or network.
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

      // Fetch profile in background (non-blocking)
      if (profileFetchedForId.current !== data.session.user.id) {
        profileFetchedForId.current = data.session.user.id;
        fetchProfile(data.session.user.id).then((p) => {
          if (active && p) setProfile(p);
        });
      }
    }).catch(() => {
      if (active) setLoading(false);
    });

    // ── Phase 2: Listen for auth changes (login, logout, refresh) ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!active) return;

      console.debug('[Auth] Event:', event, newSession ? 'has session' : 'no session');

      // INITIAL_SESSION — handled by getSession() above, skip unless it didn't resolve.
      if (event === 'INITIAL_SESSION') {
        if (!initialised.current) {
          initialised.current = true;
          setSession(newSession);
          setUser(newSession?.user ?? null);
          setLoading(false);
        }
        return;
      }

      // TOKEN_REFRESHED — update session refs. If refresh failed (null session), keep existing.
      if (event === 'TOKEN_REFRESHED') {
        if (newSession) {
          setSession(newSession);
          setUser(newSession.user ?? null);
        }
        // If newSession is null, the refresh failed — DON'T clear session,
        // keep the existing one until it truly expires.
        return;
      }

      // SIGNED_IN — full init with profile fetch.
      if (event === 'SIGNED_IN' && newSession?.user) {
        setSession(newSession);
        setUser(newSession.user);
        setLoading(false);
        profileFetchedForId.current = newSession.user.id;
        const p = await fetchProfile(newSession.user.id);
        if (active && p) setProfile(p);
        return;
      }

      // SIGNED_OUT — clear everything.
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        profileFetchedForId.current = null;
        setLoading(false);
        return;
      }

      // Any other event — ignore, don't clear state.
    });

    // ── Safety net: NEVER hang longer than 5 seconds ──
    const timeout = setTimeout(() => {
      if (active && loading) {
        console.warn('[Auth] Safety timeout — forcing UI unblock');
        initialised.current = true;
        setLoading(false);
      }
    }, 5000);

    return () => {
      active = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign-out errors — clear state regardless.
    }
    setSession(null);
    setUser(null);
    setProfile(null);
    profileFetchedForId.current = null;
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
