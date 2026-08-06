/**
 * SessionProvider — bridges Clerk (who you are) to MongoDB (what you may do).
 *
 * Clerk gives us a verified session token; the server exchanges it for the
 * `users` document that holds the role set. Everything downstream reads roles
 * from here, never from Clerk, so a role change in MongoDB takes effect on the
 * next refresh without touching Clerk at all.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { api, setTokenGetter } from "../lib/api.js";

const SessionContext = createContext(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>.");
  return ctx;
}

export function SessionProvider({ children }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { user: clerkUser } = useUser();

  const [profile, setProfile] = useState(null); // {user, employee, counts}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Hand Clerk's token factory to the API client once it is ready.
  useEffect(() => {
    setTokenGetter(isSignedIn ? () => getToken() : async () => null);
  }, [isSignedIn, getToken]);

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setProfile(null);
      setLoading(false);
      return null;
    }
    try {
      const data = await api.me();
      setProfile(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err);
      setProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    setLoading(true);
    refresh();
  }, [isLoaded, isSignedIn, refresh]);

  const switchRole = useCallback(
    async (role) => {
      const data = await api.setActiveRole(role);
      setProfile((prev) => (prev ? { ...prev, user: data.user } : prev));
      return data.user;
    },
    []
  );

  const value = useMemo(() => {
    const user = profile?.user || null;
    return {
      clerkUser,
      user,
      employee: profile?.employee || null,
      /** The applicant's stored CV library, loaded with the session. */
      cvs: profile?.cvs || [],
      counts: profile?.counts || {},
      roles: user?.roles || [],
      activeRole: user?.activeRole || null,
      isAdmin: !!user?.roles?.includes("admin"),
      isEmployee: !!user?.roles?.includes("employee"),
      isApplicant: !!user?.roles?.includes("applicant"),
      hasMultipleRoles: (user?.roles?.length || 0) > 1,
      isSignedIn: !!isSignedIn,
      isLoaded,
      loading,
      error,
      refresh,
      switchRole,
      signOut,
    };
  }, [clerkUser, profile, isSignedIn, isLoaded, loading, error, refresh, switchRole, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
