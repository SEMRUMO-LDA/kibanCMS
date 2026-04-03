import React, { createContext, useContext, useEffect, useState } from 'react';
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

  useEffect(() => {
    let active = true;

    // Failsafe: Always disable loading after 2 seconds max
    const failsafe = setTimeout(() => setLoading(false), 2000);

    async function init() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (active && data.session) {
          setSession(data.session);
          setUser(data.session.user);
          
          try {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', data.session.user.id)
              .single();
            if (active) setProfile(profileData);
          } catch (err) {
            console.error(err);
          }
        }
      } catch (err) {
        console.error("Init Error:", err);
      } finally {
        if (active) setLoading(false);
        clearTimeout(failsafe);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!active) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (!newSession?.user) {
        setProfile(null);
      } else if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') {
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newSession.user.id)
            .single();
          if (active) setProfile(profileData);
        } catch (err) {
          console.error(err);
        }
      }

      setLoading(false);
      clearTimeout(failsafe);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      clearTimeout(failsafe);
    };
  }, []);

  const signOut = async () => {
    try {
      setLoading(true);

      // Timeout protection - force complete after 3 seconds
      const timeoutId = setTimeout(() => {
        console.warn('[Auth] SignOut timeout - forcing completion');
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      }, 3000);

      await supabase.auth.signOut();

      clearTimeout(timeoutId);
      setSession(null);
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error('[Auth] SignOut error:', error);
      // Force clear even on error
      setSession(null);
      setUser(null);
      setProfile(null);
    } finally {
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