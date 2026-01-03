import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user on mount - rely on onAuthStateChange INITIAL_SESSION
  useEffect(() => {
    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const newUser = session?.user || null;

        // Handle initial session or token refresh
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          setUser(prevUser => {
            if (prevUser?.id === newUser?.id) return prevUser;
            return newUser;
          });
          setLoading(false);
          return;
        }

        setUser(newUser);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Separate effect to handle profile loading when user changes
  useEffect(() => {
    if (user?.id) {
      setProfile(prevProfile => {
        if (prevProfile?.id === user.id) return prevProfile;
        loadProfile(user.id);
        return prevProfile;
      });
    } else {
      setProfile(null);
    }
  }, [user?.id]);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data);
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email: string, password: string, username: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });

    if (!error && data.user) {
      // Create profile
      await supabase.from('profiles').insert({
        id: data.user.id,
        username,
        email,
      });
    }

    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function refreshProfile() {
    if (user) {
      await loadProfile(user.id);
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
