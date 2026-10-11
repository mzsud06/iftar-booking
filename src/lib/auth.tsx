"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Profile } from "./supabase";

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  serverOffset: number; // server clock minus this device's clock, in ms
};

const AuthContext = createContext<AuthState>({
  ready: false,
  session: null,
  profile: null,
  refreshProfile: async () => {},
  signOut: async () => {},
  serverOffset: 0,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const userId = useRef<string | null>(null);

  const loadProfile = useCallback(async (uid: string | null) => {
    if (!uid) {
      setProfile(null);
      return;
    }
    const { data } = await supabase().from("profiles").select("*").eq("id", uid).maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    const sb = supabase();
    let cancelled = false;

    // Measure the server clock once so countdowns don't trust the phone's clock.
    (async () => {
      const t0 = Date.now();
      const { data } = await sb.rpc("server_time");
      const t1 = Date.now();
      if (data && !cancelled) {
        const server = new Date(data as string).getTime();
        setServerOffset(server - (t0 + t1) / 2);
      }
    })();

    sb.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      userId.current = data.session?.user.id ?? null;
      await loadProfile(userId.current);
      if (!cancelled) setReady(true);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      const uid = s?.user.id ?? null;
      if (uid !== userId.current) {
        userId.current = uid;
        loadProfile(uid);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(userId.current), [loadProfile]);
  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ ready, session, profile, refreshProfile, signOut, serverOffset }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Current time according to the server, updated every second.
export function useServerNow(intervalMs = 1000): number {
  const { serverOffset } = useAuth();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now() + serverOffset);
    const t = setInterval(() => setNow(Date.now() + serverOffset), intervalMs);
    return () => clearInterval(t);
  }, [serverOffset, intervalMs]);
  return now;
}
